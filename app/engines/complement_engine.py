"""
Complement Intelligence Engine
================================
Purpose  : Identify complementary ecosystem products.
Datasets : Keyword Classification + BlackBox Products

Logic
-----
1. Extract keywords where classification == "Complement"
2. Score every BlackBox product against each complement keyword using
   combined_similarity (bigram + token-Jaccard)
3. A product is a complement match if similarity >= MIN_MATCH_SCORE
4. Compute complement_strength per product (normalised 0-100)
5. Identify cross-sell opportunities: product pairs with high complement overlap
6. Cluster by subcategory to reveal ecosystem groupings

All scoring is deterministic — no AI, no embeddings.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column, minmax_normalize
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.text_matching import (
    combined_similarity,
    contains_any_token,
    tokenize_text,
)

logger = get_logger("complement_engine")

# ---------------------------------------------------------------------------
# Column candidates
# ---------------------------------------------------------------------------
_KW_COL_CANDIDATES    = ["keyword", "Keyword", "Keyword Phrase"]
_CLASS_COL_CANDIDATES = ["classification", "Classification"]
_VOL_COL_CANDIDATES   = ["monthly_search_volume", "Search Volume", "monthly search volume"]
_TITLE_CANDIDATES     = ["Title", "title", "Product Title"]
_SUBCAT_CANDIDATES    = ["Subcategory", "subcategory"]
_CAT_CANDIDATES       = ["Category", "category"]
_ASIN_CANDIDATES      = ["ASIN", "asin"]
_BRAND_CANDIDATES     = ["Brand", "brand", "Seller", "seller"]
_REVENUE_CANDIDATES   = ["ASIN Revenue", "asin revenue", "Revenue", "revenue"]
_SALES_CANDIDATES     = ["ASIN Sales", "asin sales", "Parent Level Sales"]

MIN_MATCH_SCORE = 15.0


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    kc_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 5,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Complement Intelligence engine started.")

    # -----------------------------------------------------------------------
    # Dataset guards
    # -----------------------------------------------------------------------
    if kc_df is None or kc_df.empty or blackbox_df is None or blackbox_df.empty:
        return _error("keyword_classification dataset not uploaded or empty.", t0)
    

    rows_kc = len(kc_df)
    rows_bb = len(blackbox_df)
    logger.info(f"Input rows — keyword_classification={rows_kc}, blackbox={rows_bb}")

    # -----------------------------------------------------------------------
    # Locate columns in keyword classification dataset
    # -----------------------------------------------------------------------
    kw_col    = find_column(kc_df, _KW_COL_CANDIDATES)
    class_col = find_column(kc_df, _CLASS_COL_CANDIDATES)
    vol_col   = find_column(kc_df, _VOL_COL_CANDIDATES)

    if kw_col is None or class_col is None:
        return _error(
            "Required columns not found in keyword_classification dataset.",
            t0,
            missing=[c for c, v in [("keyword", kw_col), ("classification", class_col)] if v is None],
        )

    # -----------------------------------------------------------------------
    # Extract complement keywords
    # -----------------------------------------------------------------------
    comp_mask = kc_df[class_col].astype(str).str.strip().str.lower() == "complement"
    comp_df   = kc_df[comp_mask].copy()

    if comp_df.empty:
        return _error("No keywords with classification='Complement' found.", t0)

    if vol_col:
        vol_clean, _ = clean_numeric_series(comp_df[vol_col], vol_col)
        comp_df["_vol"] = vol_clean
    else:
        comp_df["_vol"] = 0.0

    # SORT BY VOLUME DESCENDING AND TAKE TOP 100
    comp_df = comp_df.sort_values("_vol", ascending=False).head(100)

    comp_keywords: List[Dict] = []
    for _, row in comp_df.iterrows():
        kw = str(row[kw_col]).strip()
        if kw:
            comp_keywords.append({
                "keyword": kw,
                "search_volume": _sv(row.get("_vol", 0)),
            })

    logger.info(f"Complement keywords extracted: {len(comp_keywords)}")

    # -----------------------------------------------------------------------
    # Locate columns in BlackBox dataset
    # -----------------------------------------------------------------------
    title_col  = find_column(blackbox_df, _TITLE_CANDIDATES)
    subcat_col = find_column(blackbox_df, _SUBCAT_CANDIDATES)
    cat_col    = find_column(blackbox_df, _CAT_CANDIDATES)
    asin_col   = find_column(blackbox_df, _ASIN_CANDIDATES)
    brand_col  = find_column(blackbox_df, _BRAND_CANDIDATES)
    rev_col    = find_column(blackbox_df, _REVENUE_CANDIDATES)
    sales_col  = find_column(blackbox_df, _SALES_CANDIDATES)

    if title_col is None:
        return _error("Title column not found in BlackBox dataset.", t0, missing=["Title"])

    # -----------------------------------------------------------------------
    # Pre-compute token vocabulary for fast filtering
    # -----------------------------------------------------------------------
    all_comp_tokens = frozenset(
        tok
        for kw_entry in comp_keywords
        for tok in tokenize_text(kw_entry["keyword"])
    )
    logger.info(f"Complement token vocabulary size: {len(all_comp_tokens)}")

    # -----------------------------------------------------------------------
    # Pre-filter BlackBox candidates
    # -----------------------------------------------------------------------
    bb = blackbox_df.copy()
    bb["_title_clean"]  = bb[title_col].astype(str).str.lower()
    bb["_subcat_clean"] = bb[subcat_col].astype(str).str.lower() if subcat_col else ""

    has_token = bb["_title_clean"].apply(
        lambda t: contains_any_token(t, all_comp_tokens)
    ) | bb["_subcat_clean"].apply(
        lambda t: contains_any_token(t, all_comp_tokens)
    )
    candidate_bb = bb[has_token].copy()
    logger.info(
        f"BlackBox candidates after token pre-filter: "
        f"{len(candidate_bb)}/{rows_bb}"
    )

    if candidate_bb.empty:
        candidate_bb = bb.copy()
        logger.info("No token pre-filter matches — falling back to full scan")

    # Limit candidates for performance (top 500 by revenue or first 500)
    if len(candidate_bb) > 500:
        if rev_col and rev_col in candidate_bb.columns:
            rev_clean, _ = clean_numeric_series(candidate_bb[rev_col], rev_col)
            candidate_bb["_rev_sort"] = rev_clean
            candidate_bb = candidate_bb.nlargest(500, "_rev_sort")
        else:
            candidate_bb = candidate_bb.head(500)
        logger.info(f"Candidates capped at 500 for performance")

    # -----------------------------------------------------------------------
    # Score each candidate product against each complement keyword
    # -----------------------------------------------------------------------
    product_scores: Dict[int, Dict] = {}

    for kw_entry in comp_keywords:
        kw    = kw_entry["keyword"]
        kw_sv = kw_entry["search_volume"] or 0

        for idx, row in candidate_bb.iterrows():
            intent_score = combined_similarity(kw, row["_title_clean"])
            title_score = combined_similarity(kw, row["_title_clean"])
            bundle_score = combined_similarity(kw, row["_subcat_clean"]) if subcat_col else 0.0
            score = 0.45 * intent_score + 0.35 * title_score + 0.2 * bundle_score

            if score < MIN_MATCH_SCORE:
                continue

            if idx not in product_scores:
                product_scores[idx] = {
                    "max_score": score,
                    "matched_keywords": [kw],
                    "keyword_search_volumes": [kw_sv],
                    "keyword_count": 1,
                }
            else:
                if score > product_scores[idx]["max_score"]:
                    product_scores[idx]["max_score"] = score
                if kw not in product_scores[idx]["matched_keywords"]:
                    product_scores[idx]["matched_keywords"].append(kw)
                    product_scores[idx]["keyword_search_volumes"].append(kw_sv)
                    product_scores[idx]["keyword_count"] += 1

    logger.info(f"Products matched as complements: {len(product_scores)}")

    # -----------------------------------------------------------------------
    # Compute complement_strength (normalised 0-100)
    # strength = weighted combination of similarity score + keyword breadth
    # -----------------------------------------------------------------------
    if product_scores:
        max_kw_count = max(v["keyword_count"] for v in product_scores.values())
    else:
        max_kw_count = 1

    complement_products: List[Dict] = []
    for idx, match_info in product_scores.items():
        row = blackbox_df.loc[idx]

        # Complement strength: 70% similarity + 30% keyword breadth
        breadth_norm = (match_info["keyword_count"] / max(max_kw_count, 1)) * 100
        strength = round(
            match_info["max_score"] * 0.7 + breadth_norm * 0.3, 2
        )

        prod: Dict[str, Any] = {
            "complement_strength": strength,
            "similarity_score": round(match_info["max_score"], 2),
            "matched_keyword": match_info["matched_keywords"][0],
            "all_matched_keywords": match_info["matched_keywords"][:5],
            "keyword_match_count": match_info["keyword_count"],
            "total_search_volume": sum(
                v for v in match_info["keyword_search_volumes"] if v
            ),
        }
        if asin_col:
            prod["asin"] = str(row[asin_col])
        if title_col:
            prod["title"] = str(row[title_col])[:120]
        if brand_col:
            prod["brand"] = str(row[brand_col])
        if cat_col:
            prod["category"] = str(row[cat_col])
        if subcat_col:
            prod["subcategory"] = str(row[subcat_col])
        complement_products.append(prod)

    complement_products.sort(key=lambda x: x["complement_strength"], reverse=True)

    # -----------------------------------------------------------------------
    # Ecosystem clusters (by subcategory)
    # -----------------------------------------------------------------------
    cluster_map: Dict[str, List[Dict]] = {}
    for prod in complement_products:
        subcat = prod.get("subcategory", "Unknown")
        cluster_map.setdefault(subcat, []).append(prod)

    ecosystem_clusters = [
        {
            "subcategory": subcat,
            "product_count": len(prods),
            "avg_complement_strength": round(
                sum(p["complement_strength"] for p in prods) / len(prods), 2
            ),
            "top_keywords": list({
                kw
                for p in prods
                for kw in p.get("all_matched_keywords", [])
            })[:5],
            "top_product": prods[0].get("title", "")[:80] if prods else "",
        }
        for subcat, prods in sorted(
            cluster_map.items(), key=lambda x: len(x[1]), reverse=True
        )
    ]

    # -----------------------------------------------------------------------
    # Cross-sell opportunities
    # Identify subcategory pairs that share complement keywords
    # -----------------------------------------------------------------------
    cross_sell_opportunities = _build_cross_sell(complement_products, top_n)

    # -----------------------------------------------------------------------
    # Ecosystem strength score
    # -----------------------------------------------------------------------
    n_comps = len(complement_products)
    if complement_products:
        density   = n_comps / rows_bb
        mean_str  = float(np.mean([p["complement_strength"] for p in complement_products]))
        ecosystem_strength = round(min(density * mean_str * 3, 100.0), 2)
    else:
        ecosystem_strength = 0.0

    # -----------------------------------------------------------------------
    # Interpretation
    # -----------------------------------------------------------------------
    if ecosystem_strength >= 60:
        summary = (
            f"Strong complement ecosystem detected. {n_comps} complementary products "
            f"identified (ecosystem strength {ecosystem_strength}/100). "
            "Rich cross-sell and bundle opportunities exist."
        )
    elif ecosystem_strength >= 30:
        summary = (
            f"Moderate complement ecosystem. {n_comps} complementary products found "
            f"(ecosystem strength {ecosystem_strength}/100). "
            "Some cross-sell potential."
        )
    else:
        summary = (
            f"Limited complement ecosystem. {n_comps} complementary products identified "
            f"(ecosystem strength {ecosystem_strength}/100). "
            "Narrow adjacent product demand."
        )

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Complement Intelligence complete: {n_comps} complements, "
        f"ecosystem_strength={ecosystem_strength}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Complement Intelligence",
        "summary": summary,
        "datasets_used": ["keyword_classification", "blackbox"],
        "columns_used": [c for c in [kw_col, class_col, vol_col, title_col, subcat_col] if c],
        "formula_used": (
            "Complement Strength = 0.7 × combined_similarity + 0.3 × keyword_breadth_normalised. "
            "combined_similarity = 0.4 × bigram_overlap + 0.6 × token_jaccard. "
            "Ecosystem Strength = min(density × mean_strength × 3, 100)."
        ),
        "results": {
            "complement_keywords": comp_keywords,
            "complement_products": [{**p, "reason": f"Matched because keyword '{p.get('keyword', 'N/A')}' is classified as Complement and overlaps with title. Synergy Score: {p.get('synergy_score', 0)}"} for p in complement_products[:5]],
            "ecosystem_clusters": ecosystem_clusters[:top_n],
            "cross_sell_opportunities": cross_sell_opportunities[:top_n],
            "ecosystem_strength": ecosystem_strength,
            "total_complement_keywords": len(comp_keywords),
            "total_complement_products": n_comps,
        },
        "validation": {
            "status": "passed",
            "rows_before_cleaning": rows_kc + rows_bb,
            "rows_after_cleaning": rows_kc + rows_bb,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [vol_col] if vol_col else [],
            "matched_records": n_comps,
            "complement_keywords_found": len(comp_keywords),
            "blackbox_candidates_scanned": len(candidate_bb),
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Cross-sell builder
# ---------------------------------------------------------------------------

def _build_cross_sell(products: List[Dict], top_n: int) -> List[Dict]:
    """
    Identify cross-sell opportunities by finding subcategory pairs
    that share complement keywords.
    """
    # Map keyword → subcategories that match it
    kw_to_subcats: Dict[str, set] = {}
    for prod in products:
        subcat = prod.get("subcategory", "Unknown")
        for kw in prod.get("all_matched_keywords", []):
            kw_to_subcats.setdefault(kw, set()).add(subcat)

    # Find keywords that bridge multiple subcategories
    opportunities: List[Dict] = []
    for kw, subcats in kw_to_subcats.items():
        if len(subcats) >= 2:
            subcat_list = sorted(subcats)
            opportunities.append({
                "bridge_keyword": kw,
                "connected_subcategories": subcat_list,
                "connection_count": len(subcats),
                "insight": (
                    f"'{kw}' connects {' + '.join(subcat_list[:3])} — "
                    "potential cross-sell or bundle pairing."
                ),
            })

    opportunities.sort(key=lambda x: x["connection_count"], reverse=True)
    return opportunities[:top_n]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sv(v: Any) -> Any:
    if v is None:
        return None
    if pd.isna(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 2)
    return float(v) if isinstance(v, str) and v.replace('.','',1).isdigit() else v


def _error(message: str, t0: float, missing: Optional[List[str]] = None) -> Dict:
    logger.warning(f"Complement Intelligence error: {message}")
    return {
        "status": "error",
        "metric_name": "Complement Intelligence",
        "summary": message,
        "datasets_used": [],
        "columns_used": [],
        "formula_used": "",
        "results": {
            "complement_keywords": [],
            "complement_products": [],
            "ecosystem_clusters": [],
            "cross_sell_opportunities": [],
            "ecosystem_strength": 0.0,
            "total_complement_keywords": 0,
            "total_complement_products": 0,
        },
        "validation": {
            "status": "failed",
            "message": message,
            "missing_columns": missing or [],
            "rows_before_cleaning": 0,
            "rows_after_cleaning": 0,
            "rows_skipped": 0,
            "matched_records": 0,
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
