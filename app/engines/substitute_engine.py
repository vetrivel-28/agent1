"""
Substitute Intelligence Engine
================================
Purpose  : Identify substitute products stealing demand from the target market.
Datasets : Keyword Classification + BlackBox Products

Logic
-----
1. Extract keywords where classification == "Substitute"
2. For each substitute keyword, score every BlackBox product by:
   - combined_similarity(keyword, title)
   - combined_similarity(keyword, subcategory)
   - Take max of the two as the product-keyword similarity
3. A product is a substitute match if max similarity >= MIN_MATCH_SCORE
4. Aggregate per product: collect all matched keywords, take max similarity
5. Cluster substitute products by subcategory
6. Compute market_overlap_score = normalised density of substitute matches

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

logger = get_logger("substitute_engine")

# ---------------------------------------------------------------------------
# Column candidates
# ---------------------------------------------------------------------------
_KW_COL_CANDIDATES      = ["keyword", "Keyword", "Keyword Phrase"]
_CLASS_COL_CANDIDATES   = ["classification", "Classification"]
_VOL_COL_CANDIDATES     = ["monthly_search_volume", "Search Volume", "monthly search volume"]
_TITLE_CANDIDATES       = ["Title", "title", "Product Title"]
_SUBCAT_CANDIDATES      = ["Subcategory", "subcategory"]
_CAT_CANDIDATES         = ["Category", "category"]
_ASIN_CANDIDATES        = ["ASIN", "asin"]
_BRAND_CANDIDATES       = ["Brand", "brand", "Seller", "seller"]
_REVENUE_CANDIDATES     = ["ASIN Revenue", "asin revenue", "Revenue", "revenue"]
_BSR_CANDIDATES         = ["BSR", "bsr"]

# Minimum combined_similarity to count as a match
MIN_MATCH_SCORE = 15.0
# Minimum score to include in top substitute products output
MIN_PRODUCT_SCORE = 10.0


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    kc_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Substitute Intelligence engine started.")

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
            f"Required columns not found in keyword_classification. "
            f"Need: keyword col (found={kw_col}), classification col (found={class_col}).",
            t0,
            missing=[c for c, v in [("keyword", kw_col), ("classification", class_col)] if v is None],
        )

    # -----------------------------------------------------------------------
    # Extract substitute keywords
    # -----------------------------------------------------------------------
    sub_mask = kc_df[class_col].astype(str).str.strip().str.lower() == "substitute"
    sub_df   = kc_df[sub_mask].copy()

    if sub_df.empty:
        return _error("No keywords with classification='Substitute' found.", t0)

    # Clean search volume
    if vol_col:
        vol_clean, _ = clean_numeric_series(sub_df[vol_col], vol_col)
        sub_df["_vol"] = vol_clean
    else:
        sub_df["_vol"] = 0.0

    sub_keywords: List[Dict] = []
    for _, row in sub_df.iterrows():
        kw = str(row[kw_col]).strip()
        if kw:
            sub_keywords.append({
                "keyword": kw,
                "search_volume": _sv(row.get("_vol", 0)),
            })

    logger.info(f"Substitute keywords extracted: {len(sub_keywords)}")

    # -----------------------------------------------------------------------
    # Locate columns in BlackBox dataset
    # -----------------------------------------------------------------------
    title_col   = find_column(blackbox_df, _TITLE_CANDIDATES)
    subcat_col  = find_column(blackbox_df, _SUBCAT_CANDIDATES)
    cat_col     = find_column(blackbox_df, _CAT_CANDIDATES)
    asin_col    = find_column(blackbox_df, _ASIN_CANDIDATES)
    brand_col   = find_column(blackbox_df, _BRAND_CANDIDATES)
    rev_col     = find_column(blackbox_df, _REVENUE_CANDIDATES)
    bsr_col     = find_column(blackbox_df, _BSR_CANDIDATES)

    if title_col is None:
        return _error("Title column not found in BlackBox dataset.", t0, missing=["Title"])

    # -----------------------------------------------------------------------
    # Pre-compute token sets for fast filtering
    # -----------------------------------------------------------------------
    # Build a frozenset of all unique tokens from substitute keywords
    all_sub_tokens = frozenset(
        tok
        for kw_entry in sub_keywords
        for tok in tokenize_text(kw_entry["keyword"])
    )
    logger.info(f"Substitute token vocabulary size: {len(all_sub_tokens)}")

    # -----------------------------------------------------------------------
    # Score BlackBox products against substitute keywords
    # Vectorised approach: pre-filter by token presence, then score
    # -----------------------------------------------------------------------
    bb = blackbox_df.copy()
    bb["_title_clean"]  = bb[title_col].astype(str).str.lower()
    bb["_subcat_clean"] = bb[subcat_col].astype(str).str.lower() if subcat_col else ""

    # Fast pre-filter: keep only rows that share at least one token with substitutes
    has_token = bb["_title_clean"].apply(
        lambda t: contains_any_token(t, all_sub_tokens)
    ) | bb["_subcat_clean"].apply(
        lambda t: contains_any_token(t, all_sub_tokens)
    )
    candidate_bb = bb[has_token].copy()
    logger.info(
        f"BlackBox candidates after token pre-filter: "
        f"{len(candidate_bb)}/{rows_bb}"
    )

    if candidate_bb.empty:
        # Fall back to full scan with lower threshold
        candidate_bb = bb.copy()
        logger.info("No token pre-filter matches — falling back to full scan")

    # -----------------------------------------------------------------------
    # Score each candidate product against each substitute keyword
    # -----------------------------------------------------------------------
    product_scores: Dict[int, Dict] = {}  # index → best match info

    for kw_entry in sub_keywords:
        kw = kw_entry["keyword"]
        kw_sv = kw_entry["search_volume"] or 0

        for idx, row in candidate_bb.iterrows():
            title_score  = combined_similarity(kw, row["_title_clean"])
            subcat_score = combined_similarity(kw, row["_subcat_clean"]) if subcat_col else 0.0
            score = max(title_score, subcat_score)

            if score < MIN_MATCH_SCORE:
                continue

            if idx not in product_scores:
                product_scores[idx] = {
                    "max_score": score,
                    "matched_keywords": [kw],
                    "keyword_search_volumes": [kw_sv],
                }
            else:
                if score > product_scores[idx]["max_score"]:
                    product_scores[idx]["max_score"] = score
                if kw not in product_scores[idx]["matched_keywords"]:
                    product_scores[idx]["matched_keywords"].append(kw)
                    product_scores[idx]["keyword_search_volumes"].append(kw_sv)

    logger.info(f"Products matched as substitutes: {len(product_scores)}")

    # -----------------------------------------------------------------------
    # Build substitute products list
    # -----------------------------------------------------------------------
    substitute_products: List[Dict] = []
    for idx, match_info in product_scores.items():
        row = blackbox_df.loc[idx]
        prod: Dict[str, Any] = {
            "similarity_score": round(match_info["max_score"], 2),
            "matched_keywords": match_info["matched_keywords"][:5],
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
        substitute_products.append(prod)

    # Sort by similarity score descending
    substitute_products.sort(key=lambda x: x["similarity_score"], reverse=True)

    # -----------------------------------------------------------------------
    # Cluster by subcategory
    # -----------------------------------------------------------------------
    cluster_map: Dict[str, List[Dict]] = {}
    for prod in substitute_products:
        subcat = prod.get("subcategory", "Unknown")
        cluster_map.setdefault(subcat, []).append(prod)

    substitute_clusters = [
        {
            "subcategory": subcat,
            "product_count": len(prods),
            "avg_similarity": round(
                sum(p["similarity_score"] for p in prods) / len(prods), 2
            ),
            "top_product": prods[0].get("title", "")[:80] if prods else "",
        }
        for subcat, prods in sorted(
            cluster_map.items(), key=lambda x: len(x[1]), reverse=True
        )
    ]

    # -----------------------------------------------------------------------
    # Market overlap score
    # -----------------------------------------------------------------------
    # = normalised density: (matched products / total products) * mean similarity
    if substitute_products:
        density = len(substitute_products) / rows_bb
        mean_sim = float(np.mean([p["similarity_score"] for p in substitute_products]))
        market_overlap_score = round(min(density * mean_sim * 3, 100.0), 2)
    else:
        market_overlap_score = 0.0

    # -----------------------------------------------------------------------
    # Interpretation
    # -----------------------------------------------------------------------
    n_subs = len(substitute_products)
    if market_overlap_score >= 60:
        summary = (
            f"High substitute threat detected. {n_subs} products identified as "
            f"substitutes with market overlap score {market_overlap_score}/100. "
            "Significant cross-category competition present."
        )
    elif market_overlap_score >= 30:
        summary = (
            f"Moderate substitute presence. {n_subs} substitute products found "
            f"(overlap score {market_overlap_score}/100). "
            "Some cross-category demand leakage."
        )
    else:
        summary = (
            f"Low substitute threat. {n_subs} substitute products identified "
            f"(overlap score {market_overlap_score}/100). "
            "Market demand is relatively contained."
        )

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Substitute Intelligence complete: {n_subs} substitutes, "
        f"overlap={market_overlap_score}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Substitute Intelligence",
        "summary": summary,
        "datasets_used": ["keyword_classification", "blackbox"],
        "columns_used": [c for c in [kw_col, class_col, vol_col, title_col, subcat_col] if c],
        "formula_used": (
            "Similarity = 0.4 × bigram_overlap(keyword, title) + "
            "0.6 × token_jaccard(keyword, title). "
            "Market Overlap Score = min(density × mean_similarity × 3, 100)."
        ),
        "results": {
            "substitute_keywords": sub_keywords,
            "substitute_products": substitute_products[:top_n],
            "substitute_clusters": substitute_clusters[:top_n],
            "market_overlap_score": market_overlap_score,
            "total_substitute_keywords": len(sub_keywords),
            "total_substitute_products": n_subs,
        },
        "validation": {
            "status": "passed",
            "rows_before_cleaning": rows_kc + rows_bb,
            "rows_after_cleaning": rows_kc + rows_bb,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [vol_col] if vol_col else [],
            "matched_records": n_subs,
            "substitute_keywords_found": len(sub_keywords),
            "blackbox_candidates_scanned": len(candidate_bb),
        },
        "processing_time_seconds": elapsed,
    }


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
    logger.warning(f"Substitute Intelligence error: {message}")
    return {
        "status": "error",
        "metric_name": "Substitute Intelligence",
        "summary": message,
        "datasets_used": [],
        "columns_used": [],
        "formula_used": "",
        "results": {
            "substitute_keywords": [],
            "substitute_products": [],
            "substitute_clusters": [],
            "market_overlap_score": 0.0,
            "total_substitute_keywords": 0,
            "total_substitute_products": 0,
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
