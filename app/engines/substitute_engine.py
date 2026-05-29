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

from app.utils.column_mapper import find_column
from app.utils.ecosystem_scoring import (
    category_proximity_score,
    is_accessory_product,
    is_direct_competitor,
    is_towel_like_product,
    price_compatibility_score,
    use_case_similarity_score,
    weighted_score,
)
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.text_matching import keyword_overlap_score
from app.utils.validation_helpers import build_validation

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
_PRICE_CANDIDATES       = ["Price", "price", "List Price", "list price"]
_SALES_CANDIDATES       = ["ASIN Sales", "asin sales", "Parent Level Sales"]

_SUBSTITUTE_WEIGHTS = {
    "use_case_similarity": 0.4,
    "keyword_overlap": 0.25,
    "category_proximity": 0.2,
    "price_proximity": 0.15,
}

MIN_SUBSTITUTE_SCORE = 22.0


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
    price_col   = find_column(blackbox_df, _PRICE_CANDIDATES)

    if title_col is None:
        return _error("Title column not found in BlackBox dataset.", t0, missing=["Title"])

    columns_used = [c for c in [kw_col, class_col, vol_col, title_col, subcat_col, cat_col, asin_col, price_col] if c]
    sub_kw_list = [k["keyword"] for k in sub_keywords]

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
    sales_col_bb = find_column(blackbox_df, _SALES_CANDIDATES)
    if sales_col_bb:
        bb["_sales"], _ = clean_numeric_series(blackbox_df[sales_col_bb], sales_col_bb)
    else:
        bb["_sales"] = 0.0

    # Reference primary market (towel-like, non-accessory) for competitor exclusion
    primary_pool = bb[~bb["_title"].apply(is_accessory_product)]
    if primary_pool.empty:
        primary_pool = bb
    towel_primaries = primary_pool[primary_pool["_title"].apply(lambda t: is_towel_like_product(t))]
    if towel_primaries.empty:
        towel_primaries = primary_pool.head(max(1, len(primary_pool) // 4))
    hero_row = towel_primaries.sort_values("_sales", ascending=False).iloc[0]
    hero_asin = str(hero_row["_asin"])
    primary_asins = {hero_asin}
    ref_category = str(towel_primaries["_cat"].mode().iloc[0]) if cat_col and not towel_primaries["_cat"].mode().empty else ""
    ref_subcategory = str(towel_primaries["_subcat"].mode().iloc[0]) if subcat_col and not towel_primaries["_subcat"].mode().empty else ""
    ref_prices = [float(p) for p in towel_primaries["_price"].dropna().tolist() if float(p) > 0]

    products_evaluated = len(bb)
    accessory_products_excluded = 0
    competitors_excluded = 0
    substitute_products: List[Dict] = []

    for idx, row in bb.iterrows():
        title = str(row["_title"])
        subcat = str(row["_subcat"])
        asin = str(row["_asin"])

        if asin in primary_asins:
            continue

        if is_accessory_product(title):
            accessory_products_excluded += 1
            continue

        if is_direct_competitor(
            title, subcat, str(hero_row["_title"]), str(hero_row["_subcat"])
        ) and asin != hero_asin:
            competitors_excluded += 1
            continue

        best_kw = ""
        best_components: Dict[str, float] = {}
        best_score = 0.0
        for kw in sub_kw_list:
            use_case = use_case_similarity_score(kw, title, subcat)
            overlap = keyword_overlap_score(kw, title)
            cat_prox = category_proximity_score(
                str(row["_cat"]), subcat, ref_category, ref_subcategory
            )
            price_val = row["_price"] if not pd.isna(row["_price"]) else None
            price_prox = price_compatibility_score(price_val, ref_prices)
            components = {
                "use_case_similarity": use_case,
                "keyword_overlap": overlap,
                "category_proximity": cat_prox,
                "price_proximity": price_prox,
            }
            score = weighted_score(components, _SUBSTITUTE_WEIGHTS)
            if score > best_score:
                best_score = score
                best_kw = kw
                best_components = components

        if best_score < MIN_SUBSTITUTE_SCORE:
            continue

        reasons = []
        if best_components.get("use_case_similarity", 0) >= 40:
            reasons.append("use-case similarity")
        if best_components.get("keyword_overlap", 0) >= 30:
            reasons.append("keyword overlap")
        if best_components.get("category_proximity", 0) >= 50:
            reasons.append("category proximity")
        if best_components.get("price_proximity", 0) >= 45:
            reasons.append("price proximity")

        prod: Dict[str, Any] = {
            "substitute_score": best_score,
            "similarity_score": best_score,
            "score_components": {k: round(v, 2) for k, v in best_components.items()},
            "substitute_reason": (
                " + ".join(reasons) if reasons else "same need, different product positioning"
            ),
            "matched_keyword": best_kw,
            "matched_keywords": [best_kw] if best_kw else [],
        }
        prod["asin"] = asin
        prod["title"] = title[:120]
        if brand_col:
            prod["brand"] = str(row[brand_col])
        if cat_col:
            prod["category"] = str(row["_cat"])
        if subcat_col:
            prod["subcategory"] = subcat
        substitute_products.append(prod)

    substitute_products.sort(key=lambda x: x["substitute_score"], reverse=True)
    substitutes_detected = len(substitute_products)
    logger.info(f"Substitutes detected: {substitutes_detected} / {products_evaluated}")

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
                sum(p["substitute_score"] for p in prods) / len(prods), 2
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
        mean_sim = float(np.mean([p["substitute_score"] for p in substitute_products]))
        market_overlap_score = round(min(density * mean_sim * 3, 100.0), 2)
    else:
        market_overlap_score = 0.0

    # -----------------------------------------------------------------------
    # Interpretation
    # -----------------------------------------------------------------------
    n_subs = substitutes_detected
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
        "columns_used": columns_used,
        "formula_used": (
            "Substitute Score = Use-case Similarity × 0.4 + Keyword Overlap × 0.25 "
            "+ Category Proximity × 0.2 + Price Proximity × 0.15. "
            "Accessories are complements, not substitutes. Direct competitors are excluded."
        ),
        "results": {
            "substitute_keywords": sub_keywords,
            "substitute_products": substitute_products[:top_n],
            "substitute_clusters": substitute_clusters[:top_n],
            "market_overlap_score": market_overlap_score,
            "total_substitute_keywords": len(sub_keywords),
            "total_substitute_products": n_subs,
        },
        "validation": build_validation(
            rows_before_cleaning=rows_kc + rows_bb,
            rows_after_cleaning=substitutes_detected,
            columns_used=columns_used,
            valid_rows_by_metric={"substitutes": substitutes_detected},
            skipped_rows_by_metric={
                "accessories": accessory_products_excluded,
                "competitors": competitors_excluded,
            },
            warnings=[],
            products_evaluated=products_evaluated,
            substitutes_detected=substitutes_detected,
            accessory_products_excluded=accessory_products_excluded,
            competitors_excluded=competitors_excluded,
        ),
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
