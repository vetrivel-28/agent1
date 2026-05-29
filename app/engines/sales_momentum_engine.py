"""
Sales Momentum Engine
=====================
Purpose  : Measure brand-level sales acceleration.
Dataset  : BlackBox Products
Group By : Brand
Formula  : Sales Momentum = mean( norm_sales_trend, norm_asin_sales )
           Aggregated at brand level — never ASIN vs ASIN.
           Final composite score normalised to 0-100.

Numeric cleaning applied before every aggregation step.
Rows are preserved unless a brand has zero valid data across all metrics.
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

logger = get_logger("sales_momentum_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
# ---------------------------------------------------------------------------
_BRAND_CANDIDATES = [
    "Brand", "brand", "Seller", "seller",
]
_SALES_TREND_CANDIDATES = [
    "Sales Trend (90 days) (%)", "sales trend (90 days) (%)",
    "Sales Trend (%)", "sales trend (%)",
    "Sales Trend", "sales trend",
    "Sales Year Over Year (%)", "sales year over year (%)",
]
_ASIN_SALES_CANDIDATES = [
    "ASIN Sales", "asin sales",
    "Parent Level Sales", "parent level sales",
]


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 5,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Sales Momentum engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _no_data_error("blackbox")

    rows_original = len(blackbox_df)
    logger.info(f"Original rows: {rows_original}")

    # -----------------------------------------------------------------------
    # Locate columns
    # -----------------------------------------------------------------------
    brand_col      = find_column(blackbox_df, _BRAND_CANDIDATES)
    trend_col      = find_column(blackbox_df, _SALES_TREND_CANDIDATES)
    asin_sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)

    logger.info(
        f"Columns mapped — brand='{brand_col}', "
        f"trend='{trend_col}', asin_sales='{asin_sales_col}'"
    )

    columns_used: List[str]      = []
    metrics_available: List[str] = []
    numeric_cols_cleaned: List[str] = []

    if brand_col is None:
        return {
            "status": "error",
            "metric_name": "Sales Momentum",
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

    columns_used.append(brand_col)

    if trend_col:
        columns_used.append(trend_col)
        metrics_available.append("Sales Trend")
    if asin_sales_col:
        columns_used.append(asin_sales_col)
        metrics_available.append("ASIN Sales")

    if not metrics_available:
        return {
            "status": "error",
            "metric_name": "Sales Momentum",
            "summary": "No sales metric columns found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": columns_used,
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No sales metric columns found.",
                "missing_columns": _SALES_TREND_CANDIDATES[:2] + _ASIN_SALES_CANDIDATES[:2],
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # Build working dataframe with cleaned numerics
    # -----------------------------------------------------------------------
    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip()

    if trend_col:
        trend_clean, trend_stats = clean_numeric_series(
            blackbox_df[trend_col], trend_col
        )
        logger.info(
            f"Sales Trend '{trend_col}': "
            f"original={trend_stats['original_count']}, "
            f"cleaned={trend_stats['cleaned_count']}, "
            f"nan={trend_stats['nan_introduced']}"
        )
        work["sales_trend"] = trend_clean
        numeric_cols_cleaned.append(trend_col)

    if asin_sales_col:
        sales_clean, sales_stats = clean_numeric_series(
            blackbox_df[asin_sales_col], asin_sales_col
        )
        logger.info(
            f"ASIN Sales '{asin_sales_col}': "
            f"original={sales_stats['original_count']}, "
            f"cleaned={sales_stats['cleaned_count']}, "
            f"nan={sales_stats['nan_introduced']}"
        )
        work["asin_sales"] = sales_clean
        numeric_cols_cleaned.append(asin_sales_col)

    rows_after_cleaning = len(work)
    logger.info(f"Rows after numeric cleaning: {rows_after_cleaning}")

    # -----------------------------------------------------------------------
    # Brand-level aggregation
    # -----------------------------------------------------------------------
    agg_dict: Dict[str, str] = {}
    if "sales_trend" in work.columns:
        agg_dict["sales_trend"] = "mean"
    if "asin_sales" in work.columns:
        agg_dict["asin_sales"] = "sum"

    brand_agg = work.groupby("brand", as_index=False).agg(agg_dict)
    logger.info(f"Brands aggregated: {len(brand_agg)}")

    # -----------------------------------------------------------------------
    # Normalise each metric, compute composite score
    # -----------------------------------------------------------------------
    norm_cols: List[str] = []

    if "sales_trend" in brand_agg.columns:
        brand_agg["smooth_sales_trend"] = rolling_trend_smoothing(brand_agg["sales_trend"], window=5)
        brand_agg["norm_sales_trend"] = safe_log_normalize(brand_agg["smooth_sales_trend"])
        norm_cols.append("norm_sales_trend")

    if "asin_sales" in brand_agg.columns:
        brand_agg["norm_asin_sales"] = safe_log_normalize(brand_agg["asin_sales"])
        norm_cols.append("norm_asin_sales")

    # Volatility-adjusted trend strength based on smoothed trend variability.
    if "smooth_sales_trend" in brand_agg.columns:
        trend_std = float(brand_agg["smooth_sales_trend"].std(skipna=True)) or 1.0
        brand_agg["sales_consistency"] = (1.0 - (brand_agg["smooth_sales_trend"].abs() / (trend_std * 3.0))).clip(0.0, 1.0) * 100.0
        brand_agg["trend_acceleration"] = min_max_normalize(
            brand_agg["smooth_sales_trend"].diff().fillna(0.0).abs()
        )
    else:
        brand_agg["sales_consistency"] = 50.0
        brand_agg["trend_acceleration"] = 50.0

    momentum_score = 0.0
    weight_sum = 0.0

    if "norm_sales_trend" in brand_agg.columns:
        momentum_score += brand_agg["norm_sales_trend"] * 0.4
        weight_sum += 0.4
    
    if "norm_asin_sales" in brand_agg.columns:
        momentum_score += brand_agg["norm_asin_sales"] * 0.2
        weight_sum += 0.2
    
    if weight_sum > 0:
        brand_agg["momentum_score"] = (momentum_score / weight_sum).clip(0.0, 100.0)
    else:
        brand_agg["momentum_score"] = 0.0

    # -----------------------------------------------------------------------
    # Percentile-based classification
    # -----------------------------------------------------------------------
    p75 = brand_agg["momentum_score"].quantile(0.75)
    p25 = brand_agg["momentum_score"].quantile(0.25)

    brand_sorted = brand_agg.sort_values("momentum_score", ascending=False)

    fastest_growing = _brand_records(
        brand_sorted[brand_sorted["momentum_score"] >= p75], top_n
    )
    declining = _brand_records(
        brand_sorted[brand_sorted["momentum_score"] <= p25].sort_values("momentum_score"),
        top_n,
    )
    all_brands = _brand_records(brand_sorted, len(brand_sorted))

    # -----------------------------------------------------------------------
    # Market direction
    # -----------------------------------------------------------------------
    market_mean   = float(brand_agg["momentum_score"].mean(skipna=True))
    market_median = float(brand_agg["momentum_score"].median(skipna=True))

    if market_mean >= 60:
        direction = "Accelerating"
    elif market_mean >= 40:
        direction = "Stable"
    else:
        direction = "Decelerating"

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Sales Momentum complete: {len(brand_agg)} brands, "
        f"market_mean={market_mean:.2f}, direction={direction}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Sales Momentum",
        "summary": (
            f"Market sales momentum is {direction.lower()}. "
            f"Mean brand score: {round(market_mean, 2)}/100. "
            f"{len(fastest_growing)} brands in top quartile, "
            f"{len(declining)} in bottom quartile."
        ),
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            "Sales Momentum = mean( norm_sales_trend, norm_asin_sales ) "
            "aggregated at brand level. Each metric min-max normalised to 0-100. "
            f"Metrics used: {metrics_available}"
        ),
        "results": {
            "market_momentum_direction": direction,
            "market_mean_score": round(market_mean, 2),
            "market_median_score": round(market_median, 2),
            "total_brands_analysed": len(brand_agg),
            "fastest_growing_brands": fastest_growing,
            "declining_brands": declining,
            "all_brands_momentum": all_brands,
        },
        "validation": {
            "status": "passed",
            "metrics_found": metrics_available,
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
            "momentum_score": _sv(row.get("momentum_score")),
            "trend_strength_score": _sv(row.get("norm_sales_trend")),
            "consistency_score": _sv(row.get("sales_consistency")),
            "acceleration_score": _sv(100.0 - row.get("trend_acceleration", 0.0)),
        }
        if "sales_trend" in row.index:
            rec["avg_sales_trend_pct"] = _sv(row.get("sales_trend"))
        if "asin_sales" in row.index:
            rec["total_asin_sales"] = _sv(row.get("asin_sales"))
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
        "metric_name": "Sales Momentum",
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
