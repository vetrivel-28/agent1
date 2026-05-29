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
from app.utils.column_mapper import find_column, minmax_normalize
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.text_matching import combined_similarity, tokenize_text

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

# Minimum complement_strength to consider a product for bundling
MIN_COMPLEMENT_STRENGTH = 15.0
# Minimum bundle score to include in output
MIN_BUNDLE_SCORE = 10.0


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

    # -----------------------------------------------------------------------
    # Step 5: Score bundle pairs
    # -----------------------------------------------------------------------
    bundle_pairs: List[Dict] = []

    # Only process top complement products (by strength) for performance
    top_comp_products = sorted(
        [p for p in comp_products if p.get("complement_strength", 0) >= MIN_COMPLEMENT_STRENGTH],
        key=lambda x: x.get("complement_strength", 0),
        reverse=True,
    )[:min(len(comp_products), 50)]  # cap at 50 complement products

    logger.info(f"Processing {len(top_comp_products)} complement products for bundle scoring")

    for comp_prod in top_comp_products:
        comp_title    = comp_prod.get("title", "")
        comp_asin     = comp_prod.get("asin", "")
        comp_subcat   = comp_prod.get("subcategory", "")
        comp_cat      = comp_prod.get("category", "")
        comp_strength = comp_prod.get("complement_strength", 0)
        comp_keywords_matched = comp_prod.get("all_matched_keywords", [])

        # Total search volume of matched keywords
        comp_sv = sum(kw_vol_map.get(kw, 0) for kw in comp_keywords_matched)

        # Find primary products that share keywords with this complement
        for idx, prow in primary_bb.iterrows():
            p_title  = str(prow[title_col]) if title_col else ""
            p_subcat = str(prow[subcat_col]) if subcat_col else ""
            p_cat    = str(prow[cat_col]) if cat_col else ""

            # Keyword overlap between complement keywords and primary title
            kw_overlap_scores = [
                combined_similarity(kw, p_title)
                for kw in comp_keywords_matched
            ]
            if not kw_overlap_scores:
                continue

            demand_overlap = max(kw_overlap_scores)
            if demand_overlap < MIN_BUNDLE_SCORE:
                continue

            # Category adjacency bonus
            cat_adjacency = 20.0 if p_cat == comp_cat else (
                10.0 if p_subcat == comp_subcat else 0.0
            )

            # Bundle score = weighted combination
            bundle_score = round(
                comp_strength * 0.4
                + demand_overlap * 0.4
                + cat_adjacency * 0.2,
                2,
            )

            if bundle_score < MIN_BUNDLE_SCORE:
                continue

            pair: Dict[str, Any] = {
                "bundle_score": bundle_score,
                "complement_strength": round(comp_strength, 2),
                "demand_overlap": round(demand_overlap, 2),
                "category_adjacency": cat_adjacency,
                "primary_product": {
                    "asin":       str(prow[asin_col]) if asin_col else "",
                    "title":      p_title[:100],
                    "brand":      str(prow[brand_col]) if brand_col else "",
                    "subcategory": p_subcat,
                },
                "complement_product": {
                    "asin":       comp_asin,
                    "title":      comp_title[:100],
                    "subcategory": comp_subcat,
                },
                "shared_keywords": comp_keywords_matched[:3],
                "combined_search_volume": comp_sv,
                "insight": _bundle_insight(p_title, comp_title, comp_keywords_matched),
            }
            bundle_pairs.append(pair)

    logger.info(f"Raw bundle pairs generated: {len(bundle_pairs)}")

    # -----------------------------------------------------------------------
    # Step 6: Deduplicate and rank
    # Keep only the best pair per (primary_asin, complement_asin) combination
    # -----------------------------------------------------------------------
    seen_pairs: set = set()
    deduped_pairs: List[Dict] = []
    for pair in sorted(bundle_pairs, key=lambda x: x["bundle_score"], reverse=True):
        key = (
            pair["primary_product"].get("asin", ""),
            pair["complement_product"].get("asin", ""),
        )
        if key not in seen_pairs:
            seen_pairs.add(key)
            deduped_pairs.append(pair)

    logger.info(f"Deduplicated bundle pairs: {len(deduped_pairs)}")

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
        "columns_used": [c for c in [title_col, subcat_col, cat_col, asin_col] if c],
        "formula_used": (
            "Bundle Score = (complement_strength × 0.4) + "
            "(demand_overlap × 0.4) + (category_adjacency × 0.2). "
            "Ecosystem Strength = min(density × mean_score × 5, 100)."
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
        "validation": {
            "status": "passed",
            "rows_before_cleaning": rows_bb,
            "rows_after_cleaning": rows_bb,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [],
            "matched_records": n_bundles,
            "complement_products_analysed": len(top_comp_products),
            "primary_products_scanned": len(primary_bb),
        },
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
