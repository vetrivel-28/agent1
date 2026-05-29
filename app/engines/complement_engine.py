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
from typing import Any, Dict, List, Optional, Set

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.ecosystem_scoring import (
    ACCESSORY_TOKENS,
    accessory_relationship_score,
    different_subcategory_score,
    is_accessory_product,
    is_direct_competitor,
    is_towel_like_product,
    price_compatibility_score,
    shared_keyword_context_score,
    weighted_score,
)
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.text_matching import contains_any_token, tokenize_text
from app.utils.validation_helpers import build_validation

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
_PRICE_CANDIDATES     = ["Price", "price", "List Price", "list price"]

_COMPLEMENT_WEIGHTS = {
    "accessory_relationship": 0.4,
    "shared_keyword_context": 0.25,
    "different_subcategory": 0.2,
    "price_compatibility": 0.15,
}

MIN_COMPLEMENT_SCORE = 25.0


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    kc_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Complement Intelligence engine started.")

    # -----------------------------------------------------------------------
    # Dataset guards
    # -----------------------------------------------------------------------
    if kc_df is None or kc_df.empty:
        return _error("keyword_classification dataset not uploaded or empty.", t0)
    if blackbox_df is None or blackbox_df.empty:
        return _error("blackbox dataset not uploaded or empty.", t0)

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
    price_col  = find_column(blackbox_df, _PRICE_CANDIDATES)

    if title_col is None:
        return _error("Title column not found in BlackBox dataset.", t0, missing=["Title"])

    columns_used = [c for c in [kw_col, class_col, vol_col, title_col, subcat_col, cat_col, asin_col, price_col, sales_col] if c]

    # Substitute keywords from classification file — complements must not be substitutes
    sub_mask = kc_df[class_col].astype(str).str.strip().str.lower() == "substitute"
    substitute_kw_list = kc_df.loc[sub_mask, kw_col].astype(str).str.strip().tolist() if kw_col else []
    comp_kw_list = [k["keyword"] for k in comp_keywords]

    bb = blackbox_df.copy()
    bb["_title"] = bb[title_col].astype(str)
    bb["_subcat"] = bb[subcat_col].astype(str) if subcat_col else ""
    bb["_cat"] = bb[cat_col].astype(str) if cat_col else ""
    if asin_col:
        bb["_asin"] = bb[asin_col].astype(str)
    else:
        bb["_asin"] = bb.index.astype(str)
    if price_col:
        bb["_price"], _ = clean_numeric_series(bb[price_col], price_col)
    else:
        bb["_price"] = np.nan
    if sales_col:
        bb["_sales"], _ = clean_numeric_series(bb[sales_col], sales_col)
    else:
        bb["_sales"] = 0.0

    # Primary products = core market items (not accessories), ranked by sales
    primary_candidates = bb[~bb["_title"].apply(is_accessory_product)].copy()
    if primary_candidates.empty:
        primary_candidates = bb.copy()
    primary_candidates = primary_candidates.sort_values("_sales", ascending=False)
    n_primary = max(1, min(len(primary_candidates), int(len(primary_candidates) * 0.35) or 1))
    primary_rows = primary_candidates.head(n_primary)
    primary_asins: Set[str] = set(primary_rows["_asin"].astype(str))
    primary_subcategory = (
        str(primary_rows["_subcat"].mode().iloc[0])
        if subcat_col and not primary_rows["_subcat"].mode().empty
        else ""
    )
    primary_prices = [
        float(p) for p in primary_rows["_price"].dropna().tolist() if float(p) > 0
    ]

    products_evaluated = len(bb)
    excluded_same_asin = 0
    excluded_competitors = 0
    excluded_substitutes = 0
    complement_products: List[Dict] = []

    for idx, row in bb.iterrows():
        asin = str(row["_asin"])
        title = str(row["_title"])
        subcat = str(row["_subcat"])

        if asin in primary_asins:
            excluded_same_asin += 1
            continue

        is_competitor = any(
            is_direct_competitor(title, subcat, str(prow["_title"]), str(prow["_subcat"]))
            for _, prow in primary_rows.iterrows()
        )
        if is_competitor:
            excluded_competitors += 1
            continue

        if not is_accessory_product(title):
            sub_kw_hit = any(
                shared_keyword_context_score(title, [skw]) >= 40 for skw in substitute_kw_list
            )
            if sub_kw_hit and not any(
                shared_keyword_context_score(title, [ckw]) >= 35 for ckw in comp_kw_list
            ):
                excluded_substitutes += 1
                continue

        kw_context = shared_keyword_context_score(title, comp_kw_list)
        accessory_score = accessory_relationship_score(title)
        if accessory_score < 20 and kw_context < MIN_COMPLEMENT_SCORE:
            continue

        subcat_score = different_subcategory_score(subcat, primary_subcategory)
        price_val = row["_price"] if not pd.isna(row["_price"]) else None
        price_score = price_compatibility_score(price_val, primary_prices)

        components = {
            "accessory_relationship": accessory_score,
            "shared_keyword_context": kw_context,
            "different_subcategory": subcat_score,
            "price_compatibility": price_score,
        }
        strength = weighted_score(components, _COMPLEMENT_WEIGHTS)
        if strength < MIN_COMPLEMENT_SCORE:
            continue

        matched_kws = [
            ckw for ckw in comp_kw_list
            if shared_keyword_context_score(title, [ckw]) >= 25
        ][:5]
        reasons = []
        if accessory_score >= 50:
            reasons.append("accessory relationship")
        if kw_context >= 30:
            reasons.append("shared keyword context")
        if subcat_score >= 70:
            reasons.append("different subcategory")
        if price_score >= 50:
            reasons.append("price compatibility")

        prod: Dict[str, Any] = {
            "complement_strength": strength,
            "complement_score": strength,
            "score_components": {k: round(v, 2) for k, v in components.items()},
            "complement_reason": (
                " + ".join(reasons) if reasons else "complementary market-level fit"
            ),
            "matched_keyword": matched_kws[0] if matched_kws else "",
            "all_matched_keywords": matched_kws,
            "keyword_match_count": len(matched_kws),
        }
        prod["asin"] = asin
        prod["title"] = title[:120]
        if brand_col:
            prod["brand"] = str(row[brand_col])
        if cat_col:
            prod["category"] = str(row["_cat"])
        if subcat_col:
            prod["subcategory"] = subcat
        complement_products.append(prod)

    complement_products.sort(key=lambda x: x["complement_strength"], reverse=True)
    complements_detected = len(complement_products)
    logger.info(f"Complements detected: {complements_detected} / {products_evaluated} evaluated")

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
    n_comps = complements_detected
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
        "columns_used": columns_used,
        "formula_used": (
            "Complement products are accessories or products commonly used with the target product, "
            "not direct substitutes or competitors. "
            "Complement Score = Accessory Relationship × 0.4 + Shared Keyword Context × 0.25 "
            "+ Different Subcategory × 0.2 + Price Compatibility × 0.15."
        ),
        "results": {
            "complement_keywords": comp_keywords,
            "complement_products": complement_products[:top_n],
            "ecosystem_clusters": ecosystem_clusters[:top_n],
            "cross_sell_opportunities": cross_sell_opportunities[:top_n],
            "ecosystem_strength": ecosystem_strength,
            "total_complement_keywords": len(comp_keywords),
            "total_complement_products": n_comps,
        },
        "validation": build_validation(
            rows_before_cleaning=rows_kc + rows_bb,
            rows_after_cleaning=complements_detected,
            columns_used=columns_used,
            valid_rows_by_metric={"complements": complements_detected},
            skipped_rows_by_metric={
                "same_asin": excluded_same_asin,
                "competitors": excluded_competitors,
                "substitutes": excluded_substitutes,
            },
            warnings=[],
            products_evaluated=products_evaluated,
            complements_detected=complements_detected,
            excluded_same_asin=excluded_same_asin,
            excluded_competitors=excluded_competitors,
            excluded_substitutes=excluded_substitutes,
        ),
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
    try:
        if np.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 2)
    return v


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
        "validation": build_validation(
            rows_before_cleaning=0,
            rows_after_cleaning=0,
            columns_used=[],
            warnings=[message],
            status="failed",
            missing_columns=missing or [],
        ),
        "processing_time_seconds": round(time.time() - t0, 3),
    }
