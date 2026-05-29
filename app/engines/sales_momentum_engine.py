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
from app.utils.normalization import rolling_trend_smoothing, safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("sales_momentum_engine")

# Configurable thresholds for market direction classification
_SALES_TREND_DECLINING_THRESHOLD = -0.5
_SALES_TREND_GROWING_THRESHOLD = 0.5

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
    top_n: int = 10,
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

    if trend_col is None or asin_sales_col is None:
        return {
            "status": "warning",
            "metric_name": "Sales Momentum",
            "message": "Required columns missing or no valid numeric sales trend values found.",
            "summary": "Required columns missing or no valid numeric sales trend values found.",
            "datasets_used": ["blackbox"],
            "columns_used": columns_used,
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "warning",
                "message": "Required columns missing or no valid numeric sales trend values found.",
                "required_columns": ["Sales Trend (90 days) (%)", "ASIN Sales or Parent Level Sales"],
                "columns_found": columns_used,
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "columns_used": columns_used,
                "valid_rows_by_metric": {},
                "skipped_rows_by_metric": {},
                "warnings": ["Sales Trend and ASIN Sales / Parent Level Sales are both required."],
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
        invalid_trend_mask = trend_clean < -100
        invalid_sales_trend_count = int(invalid_trend_mask.sum())
        if invalid_sales_trend_count:
            logger.warning(
                f"Sales Momentum: excluded {invalid_sales_trend_count} rows with invalid sales trend < -100%."
            )
            trend_clean = trend_clean.mask(invalid_trend_mask, np.nan)
        work["sales_trend"] = trend_clean
        numeric_cols_cleaned.append(trend_col)
    else:
        invalid_sales_trend_count = 0

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

    brand_agg["momentum_score"] = (
        brand_agg.get("norm_sales_trend", 50.0) * 0.6
        + brand_agg.get("norm_asin_sales", 50.0) * 0.4
    ).clip(0.0, 100.0)

    # -----------------------------------------------------------------------
    # Percentile-based classification
    # -----------------------------------------------------------------------
    p75 = brand_agg["momentum_score"].quantile(0.75)
    p25 = brand_agg["momentum_score"].quantile(0.25)

    brand_sorted = brand_agg.sort_values("momentum_score", ascending=False)
    if "sales_trend" in brand_agg.columns:
        fastest_trend_brands = _brand_records(
            brand_agg[brand_agg["sales_trend"] > 0].sort_values("sales_trend", ascending=False),
            top_n,
        )
    else:
        fastest_trend_brands = []
    top_momentum_brands = _brand_records(
        brand_sorted[brand_sorted["momentum_score"] >= p75], top_n
    )
    declining = _brand_records(
        brand_sorted[brand_sorted["momentum_score"] <= p25].sort_values("momentum_score"),
        top_n,
    )
    all_brands = _brand_records(brand_sorted, len(brand_sorted))
    bottom_quartile = brand_sorted[brand_sorted["momentum_score"] <= p25]
    bottom_quartile_brand_count = int(bottom_quartile.shape[0])

    # -----------------------------------------------------------------------
    # Market direction
    # -----------------------------------------------------------------------
    mean_sales_trend = float(brand_agg["sales_trend"].mean(skipna=True)) if "sales_trend" in brand_agg else 0.0
    median_sales_trend = float(brand_agg["sales_trend"].median(skipna=True)) if "sales_trend" in brand_agg else 0.0

    if median_sales_trend < _SALES_TREND_DECLINING_THRESHOLD:
        direction = "Declining"
    elif median_sales_trend <= _SALES_TREND_GROWING_THRESHOLD:
        direction = "Stable"
    else:
        direction = "Growing"

    market_mean   = float(brand_agg["momentum_score"].mean(skipna=True))
    market_median = float(brand_agg["momentum_score"].median(skipna=True))

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Sales Momentum complete: {len(brand_agg)} brands, "
        f"market_mean={market_mean:.2f}, direction={direction}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Sales Momentum",
        "summary": (
            f"Market sales direction is {direction.lower()} based on median brand sales trend. "
            f"Mean sales trend is reported for metadata only. "
            f"{bottom_quartile_brand_count} brands are in the bottom sales momentum quartile."
        ),
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            "Sales Momentum Score = (Normalized Sales Trend × 0.6) + (Normalized Sales Volume × 0.4). "
            "Sales Trend = growth direction; ASIN Sales / Parent Level Sales = sales strength. "
            "Aggregated at brand level. Market direction is determined by median sales trend. "
            f"Metrics used: {metrics_available}"
        ),
        "results": {
            "market_momentum_direction": direction,
            "mean_sales_trend_pct": round(mean_sales_trend, 4),
            "median_sales_trend_pct": round(median_sales_trend, 4),
            "sales_direction_basis": "median",
            "market_mean_score": round(market_mean, 2),
            "market_median_score": round(market_median, 2),
            "total_brands_analysed": len(brand_agg),
            "fastest_growing_brands": fastest_trend_brands,
            "leading_brands_by_sales_volume_and_trend": top_momentum_brands,
            "declining_brands": declining,
            "bottom_quartile_brand_count": bottom_quartile_brand_count,
            "bottom_quartile_cutoff": round(p25, 4),
            "bottom_quartile_sample_brands": _brand_records(
                bottom_quartile.sort_values("momentum_score"), top_n
            ),
            "all_brands_momentum": all_brands,
        },
        "validation": {
            "status": "passed",
            "metrics_found": metrics_available,
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_original - rows_after_cleaning,
            "columns_used": columns_used,
            "valid_rows_by_metric": {
                "sales_trend": int(work["sales_trend"].notna().sum()) if "sales_trend" in work.columns else 0,
                "asin_sales": int(work["asin_sales"].notna().sum()) if "asin_sales" in work.columns else 0,
            },
            "skipped_rows_by_metric": {
                "invalid_sales_trend": invalid_sales_trend_count,
            },
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "brands_found": len(brand_agg),
            "invalid_sales_trend_count": invalid_sales_trend_count,
            "warnings": (
                ["Sales trend values below -100% were found and handled."]
                if invalid_sales_trend_count > 0 else []
            ),
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
            "sales_volume_score": _sv(row.get("norm_asin_sales")),
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
    try:
        if np.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        return str(v)
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
