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

# Configurable thresholds for market direction classification
_REVENUE_MOMENTUM_GROWING_THRESHOLD = 60
_REVENUE_MOMENTUM_STABLE_THRESHOLD = 40

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
    "Revenue Trend", "revenue trend",
    "Revenue Trend (90 days) (%)", "revenue trend (90 days) (%)",
    "ASIN Revenue Trend", "asin revenue trend",
    "Revenue Growth (%)", "revenue growth (%)",
]
_SALES_TREND_CANDIDATES = [
    "Sales Trend (90 days) (%)", "sales trend (90 days) (%)",
    "Sales Trend (%)", "sales trend (%)",
    "Sales Trend", "sales trend",
]
_PRICE_CANDIDATES = [
    "Price", "price",
    "List Price", "list price",
]
_UNITS_SOLD_CANDIDATES = [
    "ASIN Sales", "asin sales",
    "Parent Level Sales", "parent level sales",
    "Units Sold", "units sold",
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
    sales_trend_col = find_column(blackbox_df, _SALES_TREND_CANDIDATES)
    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    units_col = find_column(blackbox_df, _UNITS_SOLD_CANDIDATES)

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
        # Fallback: try to calculate revenue from price * units_sold
        if price_col is not None and units_col is not None:
            logger.info("Revenue column not found, will calculate from price * units_sold")
            columns_used.extend([brand_col, price_col, units_col])
            metrics_available.extend(["Price", "Units Sold"])
            use_calculated_revenue = True
        else:
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
    else:
        use_calculated_revenue = False

    if not use_calculated_revenue:
        columns_used.extend([brand_col, rev_col])
        metrics_available.append("Revenue")

    has_revenue_trend = trend_col is not None
    if trend_col:
        columns_used.append(trend_col)
        metrics_available.append("Revenue Trend")
    else:
        partial = True
        logger.info("Revenue Momentum: no revenue trend column — will use sales trend proxy if available.")
        if sales_trend_col:
            columns_used.append(sales_trend_col)
            metrics_available.append("Sales Trend (proxy)")

    # -----------------------------------------------------------------------
    # Build working dataframe with cleaned numerics
    # -----------------------------------------------------------------------
    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip()

    if use_calculated_revenue:
        # Calculate revenue from price * units_sold
        price_clean, price_stats = clean_numeric_series(blackbox_df[price_col], price_col)
        units_clean, units_stats = clean_numeric_series(blackbox_df[units_col], units_col)
        logger.info(
            f"Price '{price_col}': "
            f"original={price_stats['original_count']}, "
            f"cleaned={price_stats['cleaned_count']}, "
            f"nan={price_stats['nan_introduced']}"
        )
        logger.info(
            f"Units Sold '{units_col}': "
            f"original={units_stats['original_count']}, "
            f"cleaned={units_stats['cleaned_count']}, "
            f"nan={units_stats['nan_introduced']}"
        )
        work["revenue"] = price_clean * units_clean
        numeric_cols_cleaned.extend([price_col, units_col])
    else:
        rev_clean, rev_stats = clean_numeric_series(blackbox_df[rev_col], rev_col)
        logger.info(
            f"Revenue '{rev_col}': "
            f"original={rev_stats['original_count']}, "
            f"cleaned={rev_stats['cleaned_count']}, "
            f"nan={rev_stats['nan_introduced']}"
        )
        work["revenue"] = rev_clean
        numeric_cols_cleaned.append(rev_col)

    invalid_revenue_mask = work["revenue"].isna() | (work["revenue"] == 0)
    excluded_due_to_missing_revenue = int(invalid_revenue_mask.sum())
    if excluded_due_to_missing_revenue:
        logger.warning(
            f"Revenue Momentum: excluded {excluded_due_to_missing_revenue} rows with missing or zero revenue"
        )
        work = work[~invalid_revenue_mask]

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
    elif sales_trend_col:
        sales_clean, sales_stats = clean_numeric_series(
            blackbox_df[sales_trend_col], sales_trend_col
        )
        logger.info(
            f"Sales Trend proxy '{sales_trend_col}': "
            f"original={sales_stats['original_count']}, "
            f"cleaned={sales_stats['cleaned_count']}"
        )
        work["sales_trend_proxy"] = sales_clean
        numeric_cols_cleaned.append(sales_trend_col)

    rows_after_cleaning = len(work)
    logger.info(f"Rows after numeric cleaning: {rows_after_cleaning}")

    if work.empty:
        return {
            "status": "warning",
            "message": "No valid revenue rows after cleaning.",
            "metric_name": "Revenue Momentum",
            "summary": "No valid revenue data available for brand-level analysis.",
            "datasets_used": ["blackbox"],
            "columns_used": list(dict.fromkeys(columns_used)),
            "formula_used": "Revenue Momentum requires valid revenue values.",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": list(dict.fromkeys(numeric_cols_cleaned)),
                "excluded_due_to_missing_revenue": excluded_due_to_missing_revenue,
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # Brand-level aggregation
    # -----------------------------------------------------------------------
    agg_dict: Dict[str, str] = {"revenue": "sum"}
    if "rev_trend" in work.columns:
        agg_dict["rev_trend"] = "mean"
    if "sales_trend_proxy" in work.columns:
        agg_dict["sales_trend_proxy"] = "mean"

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
        brand_agg["revenue_momentum_score"] = (
            brand_agg["norm_rev_trend"] * 0.6 + brand_agg["norm_revenue"] * 0.4
        ).clip(0.0, 100.0)
    elif "sales_trend_proxy" in brand_agg.columns:
        brand_agg["smooth_sales_proxy"] = rolling_trend_smoothing(
            brand_agg["sales_trend_proxy"], window=5
        )
        brand_agg["norm_sales_proxy"] = safe_log_normalize(brand_agg["smooth_sales_proxy"])
        brand_agg["revenue_momentum_score"] = (
            brand_agg["norm_revenue"] * 0.6 + brand_agg["norm_sales_proxy"] * 0.4
        ).clip(0.0, 100.0)
    else:
        brand_agg["revenue_momentum_score"] = brand_agg["norm_revenue"].clip(0.0, 100.0)

    # -----------------------------------------------------------------------
    # Percentile-based classification
    # -----------------------------------------------------------------------
    p75 = brand_agg["revenue_momentum_score"].quantile(0.75)
    p25 = brand_agg["revenue_momentum_score"].quantile(0.25)

    brand_sorted = brand_agg.sort_values("revenue_momentum_score", ascending=False)

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

    if market_mean >= _REVENUE_MOMENTUM_GROWING_THRESHOLD:
        direction = "Growing"
    elif market_mean >= _REVENUE_MOMENTUM_STABLE_THRESHOLD:
        direction = "Stable"
    else:
        direction = "Declining"

    elapsed = round(time.time() - t0, 3)

    # Determine section label based on data availability
    if has_revenue_trend:
        growth_leaders_label = "Revenue Growth Leaders"
        formula_text = (
            "Revenue Momentum = (Normalized Revenue Trend × 0.6) + (Normalized Current Revenue × 0.4). "
            "Revenue summed per brand; trend averaged per brand. "
            f"Metrics used: {metrics_available}"
        )
    else:
        growth_leaders_label = "Revenue Leaders with Sales Momentum"
        formula_text = (
            "Revenue Momentum Proxy = normalized ASIN Revenue × 0.6 + normalized Sales Trend × 0.4. "
            "This is not true revenue growth because no revenue trend column was available. "
            "Revenue summed per brand. "
            f"Metrics used: {metrics_available}"
        )

    top_growth_sorted = (
        brand_sorted.sort_values("rev_trend", ascending=False)
        if has_revenue_trend and "rev_trend" in brand_sorted.columns
        else brand_sorted
    )
    top_growth = _brand_records(top_growth_sorted[top_growth_sorted["revenue_momentum_score"] >= p75], top_n)

    return {
        "status": "success",
        "metric_name": "Revenue Momentum",
        "summary": (
            f"Market revenue momentum is {direction.lower()}. "
            f"Mean brand score: {round(market_mean, 2)}/100. "
            f"Total market revenue: ${total_revenue:,.2f}."
            + (" (Proxy analysis — no revenue trend column available.)" if partial else "")
        ),
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": formula_text,
        "results": {
            "market_revenue_direction": direction,
            "market_mean_score": round(market_mean, 2),
            "market_median_score": round(market_median, 2),
            "total_market_revenue": round(total_revenue, 2),
            "total_brands_analysed": len(brand_agg),
            "partial_analysis": partial,
            "growth_leaders_label": growth_leaders_label,
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
            "columns_used": columns_used,
            "valid_rows_by_metric": {"revenue": int(work["revenue"].notna().sum())},
            "skipped_rows_by_metric": {"missing_revenue": excluded_due_to_missing_revenue},
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "brands_found": len(brand_agg),
            "excluded_due_to_missing_revenue": excluded_due_to_missing_revenue,
            "warnings": (
                ["No revenue trend column found; using sales trend as proxy for momentum."]
                if partial and sales_trend_col else []
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
