"""
Price Elasticity Engine
========================
Purpose  : Find strongest-performing pricing ranges and identify dead zones.
Datasets : BlackBox Products dataset
Logic    : Create dynamic price buckets, analyze sales/revenue per bucket,
           detect demand drops, identify premium zones.

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
from app.utils.validation_helpers import build_validation

logger = get_logger("price_elasticity_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
# ---------------------------------------------------------------------------
_PRICE_CANDIDATES = [
    "Price", "price",
    "List Price", "list price",
]
_ASIN_SALES_CANDIDATES = [
    "ASIN Sales", "asin sales", "AsinSales",
    "Parent Level Sales", "parent level sales",
]
_REVENUE_CANDIDATES = [
    "ASIN Revenue", "asin revenue",
    "Revenue", "revenue",
    "Parent Level Revenue", "parent level revenue",
    "Monthly Revenue", "monthly revenue",
]
_BSR_CANDIDATES = [
    "BSR", "bsr",
    "Best Sellers Rank", "best sellers rank",
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _format_score(val: float) -> float:
    """Round to 2 decimals, clip to 0-100."""
    if np.isnan(val) or pd.isna(val):
        return 0.0
    return round(float(np.clip(val, 0.0, 100.0)), 2)


def _format_price(val: float) -> float:
    """Format price to 2 decimal places."""
    if np.isnan(val) or pd.isna(val):
        return 0.0
    return round(float(val), 2)


def _create_price_buckets(
    series: pd.Series,
    n_buckets: int = 5,
) -> List[Tuple[float, float]]:
    """
    Create adaptive price buckets using quantiles.
    
    Args:
        series: Numeric series to bucket
        n_buckets: Target number of buckets
    
    Returns:
        List of (lower, upper) price ranges
    """
    valid = series.dropna()
    if valid.empty:
        return []
    
    # Use quantile-based bucketing for adaptive sizing
    quantiles = [i / n_buckets for i in range(n_buckets + 1)]
    edges = [valid.quantile(q) for q in quantiles]
    
    # Remove duplicates while preserving order
    unique_edges = []
    for edge in edges:
        if not unique_edges or edge != unique_edges[-1]:
            unique_edges.append(edge)
    
    # Create bucket ranges
    buckets = []
    for i in range(len(unique_edges) - 1):
        lower = unique_edges[i]
        upper = unique_edges[i + 1]
        # For the last bucket, make upper slightly higher to include max value
        if i == len(unique_edges) - 2:
            upper = upper + 0.01
        buckets.append((lower, upper))
    
    return buckets


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    n_buckets: int = 5,
) -> Dict[str, Any]:
    """
    Analyze BlackBox dataset to find strongest pricing ranges.

    Args:
        magnet_df: (unused for this engine)
        blackbox_df: BlackBox products dataset
        n_buckets: Number of price buckets to create

    Returns:
        Structured result dict with price elasticity analysis
    """
    t0 = time.time()
    logger.info("Price Elasticity engine started.")

    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    logger.info(f"Input rows — blackbox={rows_blackbox}")

    # -----------------------------------------------------------------------
    # 1. Validate dataset availability
    # -----------------------------------------------------------------------
    if blackbox_df is None or blackbox_df.empty:
        logger.warning("Price Elasticity: no BlackBox dataset provided.")
        return {
            "status": "error",
            "metric_name": "Price Range Performance",
            "summary": "No BlackBox products dataset available.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": (
                "Demand Score = Norm(ASIN Sales) × Norm(Revenue) / Norm(BSR). "
                "Dead zones detected by relative sales decline between adjacent buckets."
            ),
            "results": {},
            "validation": {
                "status": "failed",
                "message": "BlackBox dataset not loaded.",
                "missing_columns": (
                    _PRICE_CANDIDATES[:1] + _ASIN_SALES_CANDIDATES[:1]
                    + _REVENUE_CANDIDATES[:1]
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
    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    asin_sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)

    if not price_col:
        logger.warning("Price Elasticity: Price column not found.")
        return {
            "status": "error",
            "metric_name": "Price Range Performance",
            "summary": "Required column 'Price' not found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": [],
            "formula_used": (
                "Demand Score = Norm(ASIN Sales) × Norm(Revenue) / Norm(BSR). "
                "Dead zones detected by relative sales decline between adjacent buckets."
            ),
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Price column missing.",
                "missing_columns": ["Price"],
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

    # Clean ASIN Sales
    asin_sales_clean = None
    if asin_sales_col:
        asin_sales_clean, as_stats = clean_numeric_series(
            df[asin_sales_col], asin_sales_col, remove_negative=True
        )
        logger.info(
            f"ASIN Sales '{asin_sales_col}': "
            f"original={as_stats['original_count']}, "
            f"cleaned={as_stats['cleaned_count']}, "
            f"nan={as_stats['nan_introduced']}"
        )
        df["_asin_sales_clean"] = asin_sales_clean
        numeric_cols_cleaned.append(asin_sales_col)
    else:
        logger.warning("ASIN Sales column not found; using zeros.")
        df["_asin_sales_clean"] = 0.0

    # Clean Revenue
    revenue_clean = None
    if revenue_col:
        revenue_clean, rev_stats = clean_numeric_series(
            df[revenue_col], revenue_col, remove_negative=True
        )
        logger.info(
            f"Revenue '{revenue_col}': "
            f"original={rev_stats['original_count']}, "
            f"cleaned={rev_stats['cleaned_count']}, "
            f"nan={rev_stats['nan_introduced']}"
        )
        df["_revenue_clean"] = revenue_clean
        numeric_cols_cleaned.append(revenue_col)
    else:
        logger.warning("Revenue column not found; using zeros.")
        df["_revenue_clean"] = 0.0

    # Clean BSR (lower BSR = better)
    bsr_clean = None
    if bsr_col:
        bsr_clean, bsr_stats = clean_numeric_series(
            df[bsr_col], bsr_col, remove_negative=True
        )
        logger.info(
            f"BSR '{bsr_col}': "
            f"original={bsr_stats['original_count']}, "
            f"cleaned={bsr_stats['cleaned_count']}, "
            f"nan={bsr_stats['nan_introduced']}"
        )
        df["_bsr_clean"] = bsr_clean
        numeric_cols_cleaned.append(bsr_col)
    else:
        logger.warning("BSR column not found; using neutral values.")
        df["_bsr_clean"] = 100000.0  # Neutral BSR

    # -----------------------------------------------------------------------
    # 4. Filter rows with valid price
    # -----------------------------------------------------------------------
    df_valid = df.dropna(subset=["_price_clean"])
    df_valid = df_valid[df_valid["_price_clean"] > 0]
    
    rows_before = len(df)
    rows_after = len(df_valid)
    rows_skipped = rows_before - rows_after
    logger.info(f"Rows with valid price: {rows_after}/{rows_before}")

    if rows_after == 0:
        logger.warning("Price Elasticity: no valid rows after cleaning price.")
        return {
            "status": "error",
            "metric_name": "Price Range Performance",
            "summary": "No valid product data after cleaning.",
            "datasets_used": ["blackbox"],
            "columns_used": [price_col],
            "formula_used": (
                "Demand Score = Norm(ASIN Sales) × Norm(Revenue) / Norm(BSR). "
                "Dead zones detected by relative sales decline between adjacent buckets."
            ),
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No rows with valid price.",
                "missing_columns": [],
                "rows_before_cleaning": rows_before,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_skipped,
                "numeric_columns_cleaned": numeric_cols_cleaned,
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # 5. Create adaptive price buckets
    # -----------------------------------------------------------------------
    buckets = _create_price_buckets(df_valid["_price_clean"], n_buckets)
    logger.info(f"Created {len(buckets)} price buckets")

    # Assign each product to a bucket
    df_valid["_bucket_idx"] = pd.cut(
        df_valid["_price_clean"],
        bins=[b[0] for b in buckets] + [buckets[-1][1]],
        labels=list(range(len(buckets))),
        include_lowest=True,
    )

    min_bucket_size = max(3, rows_after // max(n_buckets * 4, 1))
    columns_used = [c for c in [price_col, asin_sales_col, revenue_col, bsr_col] if c]

    # -----------------------------------------------------------------------
    # 6. Analyze each bucket (aggregate then normalize across buckets)
    # -----------------------------------------------------------------------
    price_buckets: List[Dict[str, Any]] = []
    raw_bucket_rows: List[Dict[str, Any]] = []

    for bucket_idx, (lower, upper) in enumerate(buckets):
        bucket_data = df_valid[df_valid["_bucket_idx"] == bucket_idx]
        if bucket_data.empty:
            continue

        bucket_size = len(bucket_data)
        total_sales = float(bucket_data["_asin_sales_clean"].sum())
        total_revenue = float(bucket_data["_revenue_clean"].sum())
        median_bsr = float(bucket_data["_bsr_clean"].median())
        avg_bsr = float(bucket_data["_bsr_clean"].mean())
        avg_price = _format_price(bucket_data["_price_clean"].mean())

        raw_bucket_rows.append({
            "bucket_index": bucket_idx,
            "price_range": {
                "min": _format_price(lower),
                "max": _format_price(upper),
                "midpoint": _format_price((lower + upper) / 2.0),
            },
            "average_price": avg_price,
            "product_count": bucket_size,
            "total_sales": total_sales,
            "total_revenue": total_revenue,
            "median_bsr": _format_price(median_bsr),
            "average_bsr": _format_price(avg_bsr),
        })

    if not raw_bucket_rows:
        return {
            "status": "error",
            "metric_name": "Price Range Performance",
            "summary": "No price buckets could be populated.",
            "datasets_used": ["blackbox"],
            "columns_used": columns_used,
            "formula_used": "This is a proxy price-band performance analysis, not causal price elasticity.",
            "results": {},
            "validation": build_validation(
                rows_before_cleaning=rows_before,
                rows_after_cleaning=0,
                columns_used=columns_used,
                warnings=["No buckets populated after assignment."],
            ),
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    sales_series = pd.Series([b["total_sales"] for b in raw_bucket_rows])
    rev_series = pd.Series([b["total_revenue"] for b in raw_bucket_rows])
    bsr_series = pd.Series([b["median_bsr"] for b in raw_bucket_rows])

    norm_sales = min_max_normalize(sales_series)
    norm_revenue = min_max_normalize(rev_series)
    inverse_bsr = 100.0 - min_max_normalize(bsr_series)

    total_all_sales = float(df_valid["_asin_sales_clean"].sum())
    sales_p25 = float(sales_series.quantile(0.25))
    rev_p25 = float(rev_series.quantile(0.25))
    bsr_p75 = float(bsr_series.quantile(0.75))
    demand_p25 = 30.0

    for i, raw in enumerate(raw_bucket_rows):
        demand_score = (
            float(norm_sales.iloc[i]) * 0.4
            + float(norm_revenue.iloc[i]) * 0.3
            + float(inverse_bsr.iloc[i]) * 0.3
        )
        market_share = (
            (raw["total_sales"] / total_all_sales * 100.0) if total_all_sales > 0 else 0.0
        )
        is_dead_zone = (
            raw["product_count"] >= min_bucket_size
            and demand_score < demand_p25
            and raw["total_sales"] <= sales_p25
            and raw["total_revenue"] <= rev_p25
            and raw["median_bsr"] >= bsr_p75
        )
        price_buckets.append({
            **raw,
            "total_sales": int(raw["total_sales"]),
            "total_revenue": round(raw["total_revenue"], 2),
            "demand_score": _format_score(demand_score),
            "market_share": _format_score(market_share),
            "is_dead_zone": bool(is_dead_zone),
        })

    logger.info(f"Analyzed {len(price_buckets)} price buckets (min_bucket_size={min_bucket_size})")

    # -----------------------------------------------------------------------
    # 7. Identify strongest price ranges
    # -----------------------------------------------------------------------
    strongest_ranges = sorted(
        price_buckets, key=lambda x: x["demand_score"], reverse=True
    )[:3]

    # -----------------------------------------------------------------------
    # 8. Dead zones (low sales + revenue + poor BSR, sufficient bucket size)
    # -----------------------------------------------------------------------
    dead_zones: List[Dict[str, Any]] = []
    for bucket in price_buckets:
        if bucket.get("is_dead_zone"):
            dead_zones.append({
                "bucket_index": bucket["bucket_index"],
                "price_range": bucket["price_range"],
                "product_count": bucket["product_count"],
                "total_sales": bucket["total_sales"],
                "total_revenue": bucket["total_revenue"],
                "median_bsr": bucket["median_bsr"],
                "demand_score": bucket["demand_score"],
                "reason": (
                    "Low sales, low revenue, and weak rank with enough products in bucket."
                ),
            })
    dead_zone_count = len(dead_zones)

    # -----------------------------------------------------------------------
    # 9. Build pricing insights
    # -----------------------------------------------------------------------
    insights: List[str] = []

    if strongest_ranges:
        top_range = strongest_ranges[0]
        insights.append(
            f"Highest demand concentration in ${top_range['price_range']['min']}-"
            f"${top_range['price_range']['max']} range "
            f"(demand score: {top_range['demand_score']}, market share: {top_range['market_share']}%)."
        )

    if len(strongest_ranges) > 1:
        top_2 = strongest_ranges[1]
        insights.append(
            f"Secondary opportunity in ${top_2['price_range']['min']}-"
            f"${top_2['price_range']['max']} range."
        )

    if dead_zones:
        worst = dead_zones[0]
        insights.append(
            f"Dead zone detected in ${worst['price_range']['min']}-${worst['price_range']['max']} "
            f"(demand score {worst['demand_score']}, {worst['product_count']} products)."
        )

    if not insights:
        insights.append("Price range performance analysis complete. See bucket details for insights.")

    # -----------------------------------------------------------------------
    # 10. Generate summary
    # -----------------------------------------------------------------------
    summary = (
        f"Price range performance analyzed across {len(price_buckets)} buckets. "
        + " ".join(insights[:2])
    )

    # -----------------------------------------------------------------------
    # 11. Sales distribution
    # -----------------------------------------------------------------------
    sales_distribution = {
        "total_products": rows_after,
        "total_sales": int(df_valid["_asin_sales_clean"].sum()),
        "average_sales_per_product": _format_price(df_valid["_asin_sales_clean"].mean()),
        "price_range": {
            "min": _format_price(df_valid["_price_clean"].min()),
            "max": _format_price(df_valid["_price_clean"].max()),
            "mean": _format_price(df_valid["_price_clean"].mean()),
        },
    }

    elapsed = round(time.time() - t0, 3)
    logger.info(f"Price Elasticity analysis complete: elapsed={elapsed}s")

    return {
        "status": "success",
        "metric_name": "Price Range Performance",
        "summary": summary,
        "datasets_used": ["blackbox"],
        "columns_used": [c for c in [price_col, asin_sales_col, revenue_col, bsr_col] if c],
        "formula_used": (
            "This is a proxy price-band analysis, not causal price elasticity. "
            "Price Bucket Demand Score = Normalized Sales × 0.4 + Normalized Revenue × 0.3 "
            "+ Inverse Normalized BSR × 0.3. Dead zones require low sales, low revenue, poor BSR, "
            "and enough products in the bucket."
        ),
        "results": {
            "price_buckets": price_buckets,
            "strongest_price_ranges": strongest_ranges,
            "dead_zones": dead_zones,
            "sales_distribution": sales_distribution,
            "pricing_insights": insights,
            "bucket_count": len(price_buckets),
            "market_demand_score": round(
                float(np.mean([b["demand_score"] for b in price_buckets])), 2
            ) if price_buckets else 0.0,
        },
        "validation": build_validation(
            rows_before_cleaning=rows_before,
            rows_after_cleaning=rows_after,
            columns_used=columns_used,
            warnings=[],
            buckets_created=len(price_buckets),
            min_bucket_size=min_bucket_size,
            dead_zone_count=dead_zone_count,
            numeric_columns_cleaned=numeric_cols_cleaned,
        ),
        "processing_time_seconds": elapsed,
    }
