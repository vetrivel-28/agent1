"""
Revenue Momentum Engine
=======================
Purpose  : Measure revenue acceleration by brand.
Dataset  : BlackBox Products
Group By : Brand
Formula  : Revenue Momentum = mean( norm_revenue, norm_revenue_trend )
           Revenue summed per brand; trend averaged per brand.
           Final composite score normalised to 0-100.

Partial analysis returned when trend columns are unavailable.
Numeric cleaning applied before every aggregation step.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import min_max_normalize, rolling_trend_smoothing, safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("revenue_momentum_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
# ---------------------------------------------------------------------------
_BRAND_CANDIDATES = [
    "Brand", "brand", "Seller", "seller",
]
_REVENUE_CANDIDATES = [
    "ASIN Revenue", "asin revenue",
    "Revenue", "revenue",
    "Parent Level Revenue", "parent level revenue",
    "Monthly Revenue", "monthly revenue",
]
_REVENUE_TREND_CANDIDATES = [
    "Price Trend (90 days) (%)", "price trend (90 days) (%)",
    "Price Trend (%)", "price trend (%)",
    "Sales Trend (90 days) (%)", "sales trend (90 days) (%)",
    "Revenue Trend", "revenue trend",
    "Sales Year Over Year (%)", "sales year over year (%)",
]


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Revenue Momentum engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _no_data_error("blackbox")

    rows_original = len(blackbox_df)
    logger.info(f"Original rows: {rows_original}")

    # -----------------------------------------------------------------------
    # Locate columns
    # -----------------------------------------------------------------------
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    rev_col   = find_column(blackbox_df, _REVENUE_CANDIDATES)
    trend_col = find_column(blackbox_df, _REVENUE_TREND_CANDIDATES)

    logger.info(
        f"Columns mapped — brand='{brand_col}', "
        f"revenue='{rev_col}', trend='{trend_col}'"
    )

    columns_used: List[str]      = []
    metrics_available: List[str] = []
    numeric_cols_cleaned: List[str] = []
    partial = False

    if brand_col is None:
        return {
            "status": "error",
            "metric_name": "Revenue Momentum",
            "summary": "Brand column not found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Brand column not found.",
                "missing_columns": _BRAND_CANDIDATES[:2],
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    if rev_col is None:
        return {
            "status": "error",
            "metric_name": "Revenue Momentum",
            "summary": "No revenue column found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": [brand_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No revenue column found.",
                "missing_columns": _REVENUE_CANDIDATES[:3],
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    columns_used.extend([brand_col, rev_col])
    metrics_available.append("Revenue")

    if trend_col:
        columns_used.append(trend_col)
        metrics_available.append("Revenue Trend")
    else:
        partial = True
        logger.info("Revenue Momentum: no trend column — partial analysis (revenue only).")

    # -----------------------------------------------------------------------
    # Build working dataframe with cleaned numerics
    # -----------------------------------------------------------------------
    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip()

    rev_clean, rev_stats = clean_numeric_series(blackbox_df[rev_col], rev_col)
    logger.info(
        f"Revenue '{rev_col}': "
        f"original={rev_stats['original_count']}, "
        f"cleaned={rev_stats['cleaned_count']}, "
        f"nan={rev_stats['nan_introduced']}"
    )
    work["revenue"] = rev_clean
    numeric_cols_cleaned.append(rev_col)

    if trend_col:
        trend_clean, trend_stats = clean_numeric_series(
            blackbox_df[trend_col], trend_col
        )
        logger.info(
            f"Revenue Trend '{trend_col}': "
            f"original={trend_stats['original_count']}, "
            f"cleaned={trend_stats['cleaned_count']}, "
            f"nan={trend_stats['nan_introduced']}"
        )
        work["rev_trend"] = trend_clean
        numeric_cols_cleaned.append(trend_col)

    rows_after_cleaning = len(work)
    logger.info(f"Rows after numeric cleaning: {rows_after_cleaning}")

    # -----------------------------------------------------------------------
    # Brand-level aggregation
    # -----------------------------------------------------------------------
    agg_dict: Dict[str, str] = {"revenue": "sum"}
    if "rev_trend" in work.columns:
        agg_dict["rev_trend"] = "mean"

    brand_agg = work.groupby("brand", as_index=False).agg(agg_dict)
    logger.info(f"Brands aggregated: {len(brand_agg)}")

    # -----------------------------------------------------------------------
    # Normalise, compute composite score
    # -----------------------------------------------------------------------
    norm_cols: List[str] = []

    brand_agg["norm_revenue"] = safe_log_normalize(brand_agg["revenue"])
    norm_cols.append("norm_revenue")

    if "rev_trend" in brand_agg.columns:
        brand_agg["smooth_rev_trend"] = rolling_trend_smoothing(brand_agg["rev_trend"], window=5)
        brand_agg["norm_rev_trend"] = safe_log_normalize(brand_agg["smooth_rev_trend"])
        norm_cols.append("norm_rev_trend")

    if "smooth_rev_trend" in brand_agg.columns:
        trend_std = float(brand_agg["smooth_rev_trend"].std(skipna=True)) or 1.0
        brand_agg["revenue_consistency"] = (
            1.0 - (brand_agg["smooth_rev_trend"].abs() / (trend_std * 3.0))
        ).clip(0.0, 1.0) * 100.0
        brand_agg["revenue_acceleration"] = min_max_normalize(
            brand_agg["smooth_rev_trend"].diff().fillna(0.0).abs()
        )
    else:
        brand_agg["revenue_consistency"] = 50.0
        brand_agg["revenue_acceleration"] = 50.0

    rev_score = 0.0
    weight_sum = 0.0

    if "norm_rev_trend" in brand_agg.columns:
        rev_score += brand_agg["norm_rev_trend"] * 0.5
        weight_sum += 0.5
    
    if "norm_revenue" in brand_agg.columns:
        rev_score += brand_agg["norm_revenue"] * 0.3
        weight_sum += 0.3
    
    if weight_sum > 0:
        brand_agg["revenue_momentum_score"] = (rev_score / weight_sum).clip(0.0, 100.0)
    else:
        brand_agg["revenue_momentum_score"] = 0.0

    # -----------------------------------------------------------------------
    # Percentile-based classification
    # -----------------------------------------------------------------------
    p75 = brand_agg["revenue_momentum_score"].quantile(0.75)
    p25 = brand_agg["revenue_momentum_score"].quantile(0.25)

    brand_sorted = brand_agg.sort_values("revenue_momentum_score", ascending=False)

    top_growth = _brand_records(
        brand_sorted[brand_sorted["revenue_momentum_score"] >= p75], top_n
    )
    declining = _brand_records(
        brand_sorted[brand_sorted["revenue_momentum_score"] <= p25].sort_values(
            "revenue_momentum_score"
        ),
        top_n,
    )
    all_brands = _brand_records(brand_sorted, len(brand_sorted))

    # -----------------------------------------------------------------------
    # Market direction
    # -----------------------------------------------------------------------
    market_mean   = float(brand_agg["revenue_momentum_score"].mean(skipna=True))
    market_median = float(brand_agg["revenue_momentum_score"].median(skipna=True))
    total_revenue = float(brand_agg["revenue"].sum(skipna=True))

    if market_mean >= 60:
        direction = "Growing"
    elif market_mean >= 40:
        direction = "Stable"
    else:
        direction = "Declining"

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Revenue Momentum complete: {len(brand_agg)} brands, "
        f"market_mean={market_mean:.2f}, partial={partial}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Revenue Momentum",
        "summary": (
            f"Market revenue momentum is {direction.lower()}. "
            f"Mean brand score: {round(market_mean, 2)}/100. "
            f"Total market revenue: ${total_revenue:,.2f}."
            + (" (Partial — trend data unavailable.)" if partial else "")
        ),
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            "Revenue Momentum = mean( norm_revenue, norm_revenue_trend ) "
            "aggregated at brand level. Revenue summed; trend averaged. "
            "Each metric min-max normalised to 0-100. "
            f"Metrics used: {metrics_available}"
        ),
        "results": {
            "market_revenue_direction": direction,
            "market_mean_score": round(market_mean, 2),
            "market_median_score": round(market_median, 2),
            "total_market_revenue": round(total_revenue, 2),
            "total_brands_analysed": len(brand_agg),
            "partial_analysis": partial,
            "top_revenue_growth_brands": top_growth,
            "declining_revenue_brands": declining,
            "all_brands_revenue_momentum": all_brands,
        },
        "validation": {
            "status": "passed",
            "metrics_found": metrics_available,
            "partial_analysis": partial,
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_original - rows_after_cleaning,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "brands_found": len(brand_agg),
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _brand_records(df: pd.DataFrame, n: int) -> List[Dict]:
    records = []
    for _, row in df.head(n).iterrows():
        rec: Dict[str, Any] = {
            "brand": str(row["brand"]),
            "revenue_momentum_score": _sv(row.get("revenue_momentum_score")),
            "total_revenue": _sv(row.get("revenue")),
            "consistency_score": _sv(row.get("revenue_consistency")),
            "acceleration_score": _sv(100.0 - row.get("revenue_acceleration", 0.0)),
        }
        if "rev_trend" in row.index:
            rec["avg_revenue_trend_pct"] = _sv(row.get("rev_trend"))
        records.append(rec)
    return records


def _sv(v: Any) -> Any:
    if v is None:
        return None
    if pd.isna(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v


def _no_data_error(dataset: str) -> Dict:
    return {
        "status": "error",
        "metric_name": "Revenue Momentum",
        "summary": f"Dataset '{dataset}' not uploaded or is empty.",
        "datasets_used": [dataset],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": f"Dataset '{dataset}' not uploaded or is empty.",
            "rows_before_cleaning": 0,
            "rows_after_cleaning": 0,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": 0.0,
    }
