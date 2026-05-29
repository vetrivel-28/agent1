"""
Bundle Opportunity Engine
==========================
Purpose  : Identify high-potential bundle combinations using complement relationships.
Datasets : Keyword Classification + BlackBox Products
           (uses complement_engine output internally)

Logic
-----
1. Run complement_engine to get complement products and clusters
2. For each complement product, find the primary (target) products it pairs with
   by matching shared keywords against the full BlackBox dataset
3. Score each (primary, complement) pair using:
   - complement_strength of the complement product
   - demand overlap (shared keyword search volume)
   - category adjacency (same category = higher score)
4. Rank bundle pairs by bundle_score (normalised 0-100)
5. Compute ecosystem_strength = overall bundle density

All scoring is deterministic — no AI, no embeddings.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.engines import complement_engine
from app.utils.column_mapper import find_column
from app.utils.ecosystem_scoring import (
    price_compatibility_score,
    product_type_key,
    shared_keyword_context_score,
    weighted_score,
)
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.text_matching import combined_similarity
from app.utils.validation_helpers import build_validation

logger = get_logger("bundle_opportunity_engine")

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

_BUNDLE_WEIGHTS = {
    "complement_score": 0.4,
    "shared_keyword_demand": 0.25,
    "price_compatibility": 0.2,
    "category_fit": 0.15,
}

MIN_COMPLEMENT_STRENGTH = 15.0
MIN_BUNDLE_SCORE = 15.0
MAX_BUNDLES_PER_PRIMARY = 2
MAX_BUNDLES_PER_COMPLEMENT = 2
MAX_BUNDLES_PER_COMPLEMENT_CATEGORY = 3


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    kc_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Bundle Opportunity engine started.")

    # -----------------------------------------------------------------------
    # Dataset guards
    # -----------------------------------------------------------------------
    if kc_df is None or kc_df.empty:
        return _error("keyword_classification dataset not uploaded or empty.", t0)
    if blackbox_df is None or blackbox_df.empty:
        return _error("blackbox dataset not uploaded or empty.", t0)

    rows_bb = len(blackbox_df)
    logger.info(f"Input rows — blackbox={rows_bb}")

    # -----------------------------------------------------------------------
    # Step 1: Run complement engine to get complement products
    # -----------------------------------------------------------------------
    logger.info("Running complement engine for bundle analysis...")
    comp_result = complement_engine.run(kc_df, blackbox_df, top_n=rows_bb)

    if comp_result["status"] == "error":
        return _error(
            f"Complement engine failed: {comp_result.get('summary', 'unknown error')}",
            t0,
        )

    comp_products = comp_result["results"].get("complement_products", [])
    comp_keywords = comp_result["results"].get("complement_keywords", [])
    ecosystem_clusters = comp_result["results"].get("ecosystem_clusters", [])

    logger.info(f"Complement products available for bundling: {len(comp_products)}")

    if not comp_products:
        return _error(
            "No complement products found — cannot generate bundle opportunities.",
            t0,
        )

    # -----------------------------------------------------------------------
    # Step 2: Locate BlackBox columns
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

    # -----------------------------------------------------------------------
    # Step 3: Build keyword → search volume lookup
    # -----------------------------------------------------------------------
    kw_vol_map: Dict[str, float] = {
        kw["keyword"]: float(kw.get("search_volume") or 0)
        for kw in comp_keywords
    }

    # -----------------------------------------------------------------------
    # Step 4: Find primary products for each complement product
    # Primary products = BlackBox products that are NOT complements themselves
    # but share keywords with the complement product
    # -----------------------------------------------------------------------
    # Build set of complement ASINs to exclude from primary side
    comp_asins = {p.get("asin", "") for p in comp_products if p.get("asin")}

    # Build primary product pool (non-complement products)
    bb = blackbox_df.copy()
    if asin_col:
        primary_mask = ~bb[asin_col].astype(str).isin(comp_asins)
        primary_bb = bb[primary_mask].copy()
    else:
        primary_bb = bb.copy()

    logger.info(f"Primary product pool: {len(primary_bb)} products")

    primary_prices: List[float] = []
    if price_col:
        primary_prices = [
            float(p)
            for p in clean_numeric_series(primary_bb[price_col], price_col)[0].dropna()
            if float(p) > 0
        ]

    columns_used = [c for c in [title_col, subcat_col, cat_col, asin_col, price_col] if c]
    bundle_pairs: List[Dict] = []
    raw_bundle_pairs_generated = 0

    top_comp_products = sorted(
        [p for p in comp_products if p.get("complement_strength", 0) >= MIN_COMPLEMENT_STRENGTH],
        key=lambda x: x.get("complement_strength", 0),
        reverse=True,
    )[:min(len(comp_products), 50)]

    logger.info(f"Processing {len(top_comp_products)} complement products for bundle scoring")

    for comp_prod in top_comp_products:
        comp_title = comp_prod.get("title", "")
        comp_asin = comp_prod.get("asin", "")
        comp_subcat = comp_prod.get("subcategory", "")
        comp_cat = comp_prod.get("category", "")
        comp_strength = float(comp_prod.get("complement_strength", 0))
        comp_keywords_matched = comp_prod.get("all_matched_keywords", [])
        comp_sv = sum(kw_vol_map.get(kw, 0) for kw in comp_keywords_matched)
        comp_price = None

        for idx, prow in primary_bb.iterrows():
            p_title = str(prow[title_col]) if title_col else ""
            p_subcat = str(prow[subcat_col]) if subcat_col else ""
            p_cat = str(prow[cat_col]) if cat_col else ""
            p_asin = str(prow[asin_col]) if asin_col else ""

            if p_asin == comp_asin:
                continue

            kw_demand = shared_keyword_context_score(p_title, comp_keywords_matched)
            if kw_demand < MIN_BUNDLE_SCORE:
                continue

            p_price = None
            if price_col:
                p_clean, _ = clean_numeric_series(pd.Series([prow[price_col]]), price_col)
                p_price = float(p_clean.iloc[0]) if not p_clean.empty and not pd.isna(p_clean.iloc[0]) else None

            price_score = price_compatibility_score(p_price, primary_prices or [p_price or 0])
            category_fit = 100.0 if p_cat and comp_cat and p_cat == comp_cat else (
                70.0 if p_subcat and comp_subcat and p_subcat != comp_subcat else 40.0
            )
            keyword_demand_norm = min(100.0, kw_demand + min(comp_sv / 1000.0, 25.0))

            bundle_score = weighted_score(
                {
                    "complement_score": comp_strength,
                    "shared_keyword_demand": keyword_demand_norm,
                    "price_compatibility": price_score,
                    "category_fit": category_fit,
                },
                _BUNDLE_WEIGHTS,
            )
            if bundle_score < MIN_BUNDLE_SCORE:
                continue

            raw_bundle_pairs_generated += 1
            reasons = []
            if comp_strength >= 40:
                reasons.append("complement score")
            if kw_demand >= 30:
                reasons.append("shared keyword demand")
            if price_score >= 45:
                reasons.append("price compatibility")
            if category_fit >= 50:
                reasons.append("category fit")

            bundle_pairs.append({
                "bundle_score": bundle_score,
                "primary_product": {
                    "asin": p_asin,
                    "title": p_title[:100],
                    "brand": str(prow[brand_col]) if brand_col else "",
                    "subcategory": p_subcat,
                    "product_type": product_type_key(p_title, p_subcat),
                },
                "complement_product": {
                    "asin": comp_asin,
                    "title": comp_title[:100],
                    "subcategory": comp_subcat,
                    "product_type": product_type_key(comp_title, comp_subcat),
                },
                "shared_keywords": comp_keywords_matched[:3],
                "bundle_reason": " + ".join(reasons) if reasons else "complementary pairing",
                "insight": _bundle_insight(p_title, comp_title, comp_keywords_matched),
            })

    logger.info(f"Raw bundle pairs generated: {raw_bundle_pairs_generated}")

    # -----------------------------------------------------------------------
    # Step 6: Deduplicate with caps
    # -----------------------------------------------------------------------
    seen_asin_pairs: set = set()
    primary_counts: Dict[str, int] = {}
    complement_counts: Dict[str, int] = {}
    complement_category_counts: Dict[str, int] = {}
    seen_type_pairs: set = set()
    deduped_pairs: List[Dict] = []

    for pair in sorted(bundle_pairs, key=lambda x: x["bundle_score"], reverse=True):
        p_asin = pair["primary_product"].get("asin", "")
        c_asin = pair["complement_product"].get("asin", "")
        asin_key = (p_asin, c_asin)
        if asin_key in seen_asin_pairs:
            continue

        p_type = pair["primary_product"].get("product_type", "")
        c_type = pair["complement_product"].get("product_type", "")
        type_key = (p_type, c_type)
        if type_key in seen_type_pairs:
            continue

        c_subcat = pair["complement_product"].get("subcategory", "Unknown")
        if primary_counts.get(p_asin, 0) >= MAX_BUNDLES_PER_PRIMARY:
            continue
        if complement_counts.get(c_asin, 0) >= MAX_BUNDLES_PER_COMPLEMENT:
            continue
        if complement_category_counts.get(c_subcat, 0) >= MAX_BUNDLES_PER_COMPLEMENT_CATEGORY:
            continue

        seen_asin_pairs.add(asin_key)
        seen_type_pairs.add(type_key)
        primary_counts[p_asin] = primary_counts.get(p_asin, 0) + 1
        complement_counts[c_asin] = complement_counts.get(c_asin, 0) + 1
        complement_category_counts[c_subcat] = complement_category_counts.get(c_subcat, 0) + 1
        deduped_pairs.append(pair)

    duplicates_removed_count = raw_bundle_pairs_generated - len(deduped_pairs)
    bundle_pairs_after_dedupe = len(deduped_pairs)
    logger.info(f"Deduplicated bundle pairs: {bundle_pairs_after_dedupe}")

    # -----------------------------------------------------------------------
    # Step 7: Normalise bundle scores to 0-100
    # -----------------------------------------------------------------------
    if deduped_pairs:
        scores = [p["bundle_score"] for p in deduped_pairs]
        min_s, max_s = min(scores), max(scores)
        if max_s > min_s:
            for pair in deduped_pairs:
                pair["bundle_score_normalised"] = round(
                    (pair["bundle_score"] - min_s) / (max_s - min_s) * 100, 2
                )
        else:
            for pair in deduped_pairs:
                pair["bundle_score_normalised"] = 50.0

    # -----------------------------------------------------------------------
    # Step 8: Bundle clusters (by complement subcategory)
    # -----------------------------------------------------------------------
    cluster_map: Dict[str, List[Dict]] = {}
    for pair in deduped_pairs:
        subcat = pair["complement_product"].get("subcategory", "Unknown")
        cluster_map.setdefault(subcat, []).append(pair)

    bundle_clusters = [
        {
            "complement_subcategory": subcat,
            "bundle_count": len(pairs),
            "avg_bundle_score": round(
                sum(p["bundle_score"] for p in pairs) / len(pairs), 2
            ),
            "top_bundle_insight": pairs[0].get("insight", "") if pairs else "",
        }
        for subcat, pairs in sorted(
            cluster_map.items(), key=lambda x: len(x[1]), reverse=True
        )
    ]

    # -----------------------------------------------------------------------
    # Step 9: Ecosystem strength
    # -----------------------------------------------------------------------
    n_bundles = len(deduped_pairs)
    if deduped_pairs:
        density = n_bundles / max(rows_bb, 1)
        mean_score = float(np.mean([p["bundle_score"] for p in deduped_pairs]))
        ecosystem_strength = round(min(density * mean_score * 5, 100.0), 2)
    else:
        ecosystem_strength = 0.0

    # -----------------------------------------------------------------------
    # Interpretation
    # -----------------------------------------------------------------------
    if ecosystem_strength >= 60:
        summary = (
            f"Strong bundle ecosystem detected. {n_bundles} bundle opportunities identified "
            f"(ecosystem strength {ecosystem_strength}/100). "
            "Multiple high-potential product pairings exist."
        )
    elif ecosystem_strength >= 30:
        summary = (
            f"Moderate bundle potential. {n_bundles} bundle opportunities found "
            f"(ecosystem strength {ecosystem_strength}/100). "
            "Some viable product pairings."
        )
    else:
        summary = (
            f"Limited bundle opportunities. {n_bundles} pairs identified "
            f"(ecosystem strength {ecosystem_strength}/100). "
            "Narrow ecosystem overlap."
        )

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Bundle Opportunity complete: {n_bundles} bundles, "
        f"ecosystem_strength={ecosystem_strength}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Bundle Opportunity",
        "summary": summary,
        "datasets_used": ["keyword_classification", "blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            "Bundle Score = Complement Score × 0.4 + Shared Keyword Demand × 0.25 "
            "+ Price Compatibility × 0.2 + Category Fit × 0.15. "
            "Pairs are deduplicated by ASIN, product type, and per-primary/complement limits."
        ),
        "results": {
            "bundle_opportunities": deduped_pairs[:top_n],
            "high_potential_bundles": [
                p for p in deduped_pairs[:top_n]
                if p.get("bundle_score_normalised", 0) >= 70
            ],
            "bundle_clusters": bundle_clusters[:top_n],
            "ecosystem_strength": ecosystem_strength,
            "total_bundle_opportunities": n_bundles,
            "complement_products_used": len(top_comp_products),
        },
        "validation": build_validation(
            rows_before_cleaning=rows_bb,
            rows_after_cleaning=bundle_pairs_after_dedupe,
            columns_used=columns_used,
            warnings=[],
            raw_bundle_pairs_generated=raw_bundle_pairs_generated,
            bundle_pairs_after_dedupe=bundle_pairs_after_dedupe,
            duplicates_removed_count=duplicates_removed_count,
            complement_products_analysed=len(top_comp_products),
            primary_products_scanned=len(primary_bb),
        ),
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bundle_insight(primary_title: str, comp_title: str, keywords: List[str]) -> str:
    """Generate a deterministic, data-driven insight string."""
    p = primary_title[:40].strip() if primary_title else "Primary product"
    c = comp_title[:40].strip() if comp_title else "Complement product"
    kw = keywords[0] if keywords else "shared keywords"
    return f"'{p}' + '{c}' share demand around '{kw}'."


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
    logger.warning(f"Bundle Opportunity error: {message}")
    return {
        "status": "error",
        "metric_name": "Bundle Opportunity",
        "summary": message,
        "datasets_used": [],
        "columns_used": [],
        "formula_used": "",
        "results": {
            "bundle_opportunities": [],
            "high_potential_bundles": [],
            "bundle_clusters": [],
            "ecosystem_strength": 0.0,
            "total_bundle_opportunities": 0,
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
