"""
Direct Competitor Engine
=========================
Purpose  : Identify direct market competitors by category, subcategory, and price.
Datasets : BlackBox Products dataset
Logic    : A direct competitor has same category, same subcategory, and similar price.

Price similarity: ±15–20% dynamic range based on product price.
Clusters products into competitor groups and price-position clusters.

Numeric cleaning is applied before every normalisation step.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import min_max_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("direct_competitor_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
# ---------------------------------------------------------------------------
_ASIN_CANDIDATES = ["ASIN", "asin"]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_BRAND_CANDIDATES = ["Brand", "brand"]
_PRICE_CANDIDATES = [
    "Price", "price",
    "List Price", "list price",
]
_CATEGORY_CANDIDATES = [
    "Category", "category",
]
_SUBCATEGORY_CANDIDATES = [
    "Subcategory", "subcategory",
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _format_score(val: float) -> float:
    """Round to 2 decimals, clip to 0-100."""
    if np.isnan(val) or pd.isna(val):
        return 0.0
    return round(float(np.clip(val, 0.0, 100.0)), 2)


def _is_price_similar(
    price1: float,
    price2: float,
    tolerance_pct: float = 17.5,  # ±15-20% average to ~±17.5%
) -> bool:
    """
    Check if two prices are within tolerance (dynamic ±%).
    
    Args:
        price1: Base price
        price2: Comparison price
        tolerance_pct: Tolerance percentage (default 17.5%)
    
    Returns:
        True if prices are within range
    """
    if pd.isna(price1) or pd.isna(price2) or price1 <= 0:
        return False
    
    range_low = price1 * (1 - tolerance_pct / 100.0)
    range_high = price1 * (1 + tolerance_pct / 100.0)
    return range_low <= price2 <= range_high


def _calculate_similarity_score(
    category_match: bool,
    subcategory_match: bool,
    price_similarity: bool,
    price_diff_pct: float = 0.0,
) -> float:
    score = 0.0
    
    # Category match: 40 points
    if category_match:
        score += 40.0
    
    # Subcategory match: 35 points
    if subcategory_match:
        score += 35.0
    
    # Price similarity: 25 points
    if price_similarity:
        # price_diff_pct is bounded by price_tolerance_pct (usually 20).
        price_sim_score = max(0.0, (20.0 - price_diff_pct) / 20.0 * 25.0)
        score += price_sim_score
    
    return min(100.0, score)


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 5,
    price_tolerance_pct: float = 20.0,
) -> Dict[str, Any]:
    """
    Analyze BlackBox dataset to identify direct market competitors.

    Args:
        magnet_df: (unused for this engine)
        blackbox_df: BlackBox products dataset
        top_n: Number of top competitors to return per reference product
        price_tolerance_pct: Price range tolerance percentage (±)

    Returns:
        Structured result dict with competitor analysis
    """
    t0 = time.time()
    logger.info("Direct Competitor engine started.")

    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    logger.info(f"Input rows — blackbox={rows_blackbox}")

    # -----------------------------------------------------------------------
    # 1. Validate dataset availability
    # -----------------------------------------------------------------------
    if blackbox_df is None or blackbox_df.empty:
        logger.warning("Direct Competitor: missing required dataset (blackbox_df).")
        return {
            "status": "error",
            "metric_name": "Direct Competitors",
            "summary": "No BlackBox products dataset available.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": (
                "Similarity Score = "
                "40×(category_match) + 35×(subcategory_match) + 25×(price_similarity)"
            ),
            "results": {},
            "validation": {
                "status": "failed",
                "message": "BlackBox dataset not loaded.",
                "missing_columns": (
                    _CATEGORY_CANDIDATES[:1] + _SUBCATEGORY_CANDIDATES[:1]
                    + _PRICE_CANDIDATES[:1] + _ASIN_CANDIDATES[:1]
                ),
                "rows_before_cleaning": 0,
                "rows_after_cleaning": 0,
                "rows_skipped": 0,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # 2. Find required columns
    # -----------------------------------------------------------------------
    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    category_col = find_column(blackbox_df, _CATEGORY_CANDIDATES)
    subcategory_col = find_column(blackbox_df, _SUBCATEGORY_CANDIDATES)

    if not all([category_col, subcategory_col, price_col, asin_col]):
        logger.warning(
            f"Direct Competitor: missing required columns. "
            f"Category={category_col}, Subcategory={subcategory_col}, "
            f"Price={price_col}, ASIN={asin_col}"
        )
        return {
            "status": "error",
            "metric_name": "Direct Competitors",
            "summary": "Required columns not found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": [],
            "formula_used": (
                "Similarity Score = "
                "40×(category_match) + 35×(subcategory_match) + 25×(price_similarity)"
            ),
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Missing required columns.",
                "missing_columns": ["Category", "Subcategory", "Price", "ASIN"],
                "rows_before_cleaning": rows_blackbox,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_blackbox,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # 3. Prepare working dataframe
    # -----------------------------------------------------------------------
    df = blackbox_df.copy()
    numeric_cols_cleaned = []

    # Clean Price column
    price_clean, price_stats = clean_numeric_series(
        df[price_col], price_col, remove_negative=True
    )
    logger.info(
        f"Price '{price_col}': "
        f"original={price_stats['original_count']}, "
        f"cleaned={price_stats['cleaned_count']}, "
        f"nan={price_stats['nan_introduced']}"
    )
    df["_price_clean"] = price_clean
    numeric_cols_cleaned.append(price_col)

    # -----------------------------------------------------------------------
    # 4. Filter rows with valid ASIN, category, subcategory, and price
    # -----------------------------------------------------------------------
    df_valid = df.dropna(subset=[asin_col, category_col, subcategory_col, "_price_clean"])
    df_valid = df_valid[df_valid["_price_clean"] > 0]  # Ensure positive prices
    
    rows_before = len(df)
    rows_after = len(df_valid)
    rows_skipped = rows_before - rows_after
    logger.info(f"Rows with valid data: {rows_after}/{rows_before}")

    if rows_after == 0:
        logger.warning("Direct Competitor: no valid rows after cleaning.")
        return {
            "status": "error",
            "metric_name": "Direct Competitors",
            "summary": "No valid product data after cleaning.",
            "datasets_used": ["blackbox"],
            "columns_used": [asin_col, category_col, subcategory_col, price_col],
            "formula_used": (
                "Similarity Score = "
                "40×(category_match) + 35×(subcategory_match) + 25×(price_similarity)"
            ),
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No rows with valid data.",
                "missing_columns": [],
                "rows_before_cleaning": rows_before,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_skipped,
                "numeric_columns_cleaned": numeric_cols_cleaned,
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # 5. Build competitor clusters
    # -----------------------------------------------------------------------
    # Group by (Category, Subcategory) to find competitor groups
    competitor_clusters: List[Dict[str, Any]] = []
    market_clusters: List[Dict[str, Any]] = []
    all_direct_competitors: List[Dict[str, Any]] = []
    competition_density: Dict[str, int] = {}

    for (cat, subcat), group in df_valid.groupby(
        [category_col, subcategory_col], as_index=False
    ):
        group = group.sort_values("_price_clean")
        cluster_size = len(group)
        avg_price = float(group["_price_clean"].mean())
        price_range = (
            float(group["_price_clean"].min()),
            float(group["_price_clean"].max()),
        )

        logger.info(
            f"Cluster {cat}/{subcat}: {cluster_size} products, "
            f"avg price ${avg_price:.2f}, range ${price_range[0]:.2f}-${price_range[1]:.2f}"
        )

        market_cluster = {
            "category": str(cat),
            "subcategory": str(subcat),
            "cluster_size": cluster_size,
            "average_price": _format_score(avg_price),
            "price_range": {
                "min": _format_score(price_range[0]),
                "max": _format_score(price_range[1]),
            },
            "products": [],
        }

        # Add products to this cluster
        for _, product in group.iterrows():
            product_entry = {
                "asin": str(product[asin_col]),
                "title": str(product[title_col])[:100] if title_col else "N/A",
                "brand": str(product[brand_col]) if brand_col else "N/A",
                "price": _format_score(product["_price_clean"]),
                "category": str(product[category_col]),
                "subcategory": str(product[subcategory_col]),
            }
            market_cluster["products"].append(product_entry)
            product_entry["reason"] = f"Direct competitor identified based on shared subcategory {product_entry.get('subcategory', '')}."; all_direct_competitors.append(product_entry)

        market_clusters.append(market_cluster)
        competition_density[f"{cat}/{subcat}"] = cluster_size

    # -----------------------------------------------------------------------
    # 6. Find direct competitors for each product
    # -----------------------------------------------------------------------
    product_competitors: List[Dict[str, Any]] = []

    for idx, (ref_idx, ref_product) in enumerate(df_valid.iterrows()):
        ref_asin = str(ref_product[asin_col])
        ref_cat = str(ref_product[category_col])
        ref_subcat = str(ref_product[subcategory_col])
        ref_price = float(ref_product["_price_clean"])

        # Find all competitors in same category/subcategory with similar price
        competitors_list: List[Tuple[float, pd.Series]] = []

        for comp_idx, comp_product in df_valid.iterrows():
            if ref_asin == str(comp_product[asin_col]):
                continue  # Skip self

            comp_cat = str(comp_product[category_col])
            comp_subcat = str(comp_product[subcategory_col])
            comp_price = float(comp_product["_price_clean"])

            # Check category/subcategory match
            cat_match = ref_cat == comp_cat
            subcat_match = ref_subcat == comp_subcat

            if not (cat_match and subcat_match):
                continue  # Not in same category/subcategory

            # Check price similarity
            price_sim = _is_price_similar(ref_price, comp_price, price_tolerance_pct)

            if not price_sim:
                continue  # Price too different

            # Calculate similarity score
            price_diff_pct = abs((comp_price - ref_price) / ref_price * 100.0)
            sim_score = _calculate_similarity_score(
                cat_match, subcat_match, price_sim, price_diff_pct
            )

            competitors_list.append((sim_score, comp_product))

        # Sort by similarity score (descending)
        competitors_list.sort(key=lambda x: x[0], reverse=True)

        # Collect top competitors for this reference product
        top_competitors_for_ref: List[Dict[str, Any]] = []
        for sim_score, comp_product in competitors_list[:top_n]:
            comp_entry = {
                "asin": str(comp_product[asin_col]),
                "title": str(comp_product[title_col])[:100] if title_col else "N/A",
                "brand": str(comp_product[brand_col]) if brand_col else "N/A",
                "price": _format_score(comp_product["_price_clean"]),
                "category": str(comp_product[category_col]),
                "subcategory": str(comp_product[subcategory_col]),
                "similarity_score": _format_score(sim_score),
            }
            top_competitors_for_ref.append(comp_entry)

        if top_competitors_for_ref:
            product_entry = {
                "reference_asin": ref_asin,
                "reference_title": str(ref_product[title_col])[:100] if title_col else "N/A",
                "reference_price": _format_score(ref_price),
                "competitor_count": len(top_competitors_for_ref),
                "top_competitors": top_competitors_for_ref,
            }
            product_entry["top_competitors"] = [{**c, "reason": f"Direct market competition identified via category overlap and price similarity. Score: {c.get('similarity_score', 0)}"} for c in product_entry["top_competitors"][:5]]; product_competitors.append(product_entry)

    # -----------------------------------------------------------------------
    # 7. Price positioning analysis
    # -----------------------------------------------------------------------
    price_positioning: Dict[str, Any] = {
        "price_distribution": {
            "min": _format_score(df_valid["_price_clean"].min()),
            "max": _format_score(df_valid["_price_clean"].max()),
            "mean": _format_score(df_valid["_price_clean"].mean()),
            "median": _format_score(df_valid["_price_clean"].median()),
        },
        "price_segments": {},
    }

    # Create price segments (quartiles)
    for i in range(1, 5):
        q = i / 4.0
        price_positioning["price_segments"][f"q{i}"] = _format_score(
            df_valid["_price_clean"].quantile(q)
        )

    # -----------------------------------------------------------------------
    # 8. Generate interpretation
    # -----------------------------------------------------------------------
    avg_cluster_size = np.mean([c["cluster_size"] for c in market_clusters])
    most_competitive = sorted(
        market_clusters, key=lambda x: x["cluster_size"], reverse=True
    )[0]

    summary = (
        f"Identified {len(market_clusters)} competitive clusters "
        f"across {rows_after} products. "
        f"Average cluster size: {avg_cluster_size:.0f} competitors. "
        f"Most competitive: {most_competitive['category']}/{most_competitive['subcategory']} "
        f"with {most_competitive['cluster_size']} products."
    )

    elapsed = round(time.time() - t0, 3)
    logger.info(f"Direct Competitor analysis complete: elapsed={elapsed}s")

    return {
        "status": "success",
        "metric_name": "Direct Competitors",
        "summary": summary,
        "datasets_used": ["blackbox"],
        "columns_used": [asin_col, category_col, subcategory_col, price_col, title_col, brand_col],
        "formula_used": (
            "Similarity Score = "
            "40×(category_match) + 35×(subcategory_match) + 25×(price_similarity). "
            f"Price tolerance: ±{price_tolerance_pct}%."
        ),
        "results": {
            "market_clusters": market_clusters[:10],  # Top 10 clusters
            "direct_competitors": product_competitors[:top_n],
            "price_positioning": price_positioning,
            "competition_density": competition_density,
            "total_clusters": len(market_clusters),
            "total_products_analyzed": rows_after,
        },
        "validation": {
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning": rows_after,
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "missing_columns": [],
        },
        "processing_time_seconds": elapsed,
    }
