from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("search_momentum_engine")

_SEARCH_TREND_CANDIDATES = ["Search Volume Trend", "Search Trend"]
_SALES_TREND_CANDIDATES = ["Sales Trend", "Sales Trend (90 days) (%)", "Sales Trend (%)"]
_KEYWORD_CANDIDATES = ["Keyword Phrase", "Keyword"]
_TITLE_CANDIDATES = ["Title", "Product Title"]
_ASIN_CANDIDATES = ["ASIN"]


def _minmax_or_nan(series: pd.Series) -> pd.Series:
    valid = series.dropna()
    if valid.empty:
        return pd.Series(np.nan, index=series.index, dtype=float)
    min_val = float(valid.min())
    max_val = float(valid.max())
    if max_val == min_val:
        return pd.Series(np.nan, index=series.index, dtype=float)
    return (series - min_val) / (max_val - min_val) * 100.0


def run(magnet_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()

    rows_magnet = len(magnet_df) if magnet_df is not None else 0
    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    rows_before_cleaning = rows_magnet + rows_blackbox

    if magnet_df is None or magnet_df.empty or blackbox_df is None or blackbox_df.empty:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Momentum",
            "summary": "Both magnet and blackbox datasets are required.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    search_col = find_column(magnet_df, _SEARCH_TREND_CANDIDATES)
    sales_col = find_column(blackbox_df, _SALES_TREND_CANDIDATES)
    if search_col is None or sales_col is None:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Momentum",
            "summary": "Required trend columns not found.",
            "datasets_used": ["magnet", "blackbox"],
            "columns_used": [c for c in [search_col, sales_col] if c],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    magnet_work = pd.DataFrame(index=magnet_df.index)
    blackbox_work = pd.DataFrame(index=blackbox_df.index)

    magnet_work["search_trend"], _ = clean_numeric_series(magnet_df[search_col], search_col)
    blackbox_work["sales_trend"], _ = clean_numeric_series(blackbox_df[sales_col], sales_col)

    magnet_work["norm_search_trend"] = _minmax_or_nan(magnet_work["search_trend"])
    blackbox_work["norm_sales_trend"] = _minmax_or_nan(blackbox_work["sales_trend"])

    if magnet_work["norm_search_trend"].dropna().empty or blackbox_work["norm_sales_trend"].dropna().empty:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Momentum",
            "summary": "Trend columns did not contain sufficient numeric variance.",
            "datasets_used": ["magnet", "blackbox"],
            "columns_used": [search_col, sales_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [search_col, sales_col],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    mean_search_trend = float(magnet_work["norm_search_trend"].mean(skipna=True))
    mean_sales_trend = float(blackbox_work["norm_sales_trend"].mean(skipna=True))
    momentum_alignment = round(mean_search_trend * mean_sales_trend, 2)

    magnet_work["momentum_score"] = magnet_work["norm_search_trend"] * mean_sales_trend
    blackbox_work["momentum_score"] = blackbox_work["norm_sales_trend"] * mean_search_trend

    keyword_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    if keyword_col:
        magnet_work["keyword"] = magnet_df[keyword_col].astype(str)

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    if title_col:
        blackbox_work["title"] = blackbox_df[title_col].astype(str).str.slice(0, 120)
    if asin_col:
        blackbox_work["asin"] = blackbox_df[asin_col].astype(str)

    search_median = float(magnet_work["norm_search_trend"].median(skipna=True))
    sales_median = float(blackbox_work["norm_sales_trend"].median(skipna=True))

    healthy_keywords = (
        magnet_work[magnet_work["norm_search_trend"] >= search_median]
        .sort_values("momentum_score", ascending=False)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    weak_conversion_keywords = (
        magnet_work[magnet_work["norm_search_trend"] < search_median]
        .sort_values("momentum_score", ascending=True)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    strongest_products = (
        blackbox_work[blackbox_work["norm_sales_trend"] >= sales_median]
        .sort_values("momentum_score", ascending=False)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    weakest_products = (
        blackbox_work[blackbox_work["norm_sales_trend"] < sales_median]
        .sort_values("momentum_score", ascending=True)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )

    rows_after_cleaning = int(magnet_work["norm_search_trend"].notna().sum() + blackbox_work["norm_sales_trend"].notna().sum())
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)

    return {
        "status": "success",
        "metric_name": "Search Momentum",
        "summary": "Search momentum computed from normalized search and sales trend signals.",
        "datasets_used": ["magnet", "blackbox"],
        "columns_used": [search_col, sales_col],
        "formula_used": "Search Momentum = Normalized Search Trend * Normalized Sales Trend.",
        "results": {
            "momentum_alignment": momentum_alignment,
            "healthy_keywords": healthy_keywords,
            "weak_conversion_keywords": weak_conversion_keywords,
            "strongest_momentum_products": strongest_products,
            "weakest_momentum_products": weakest_products,
            "interpretation_rules": {
                "search_up_sales_up": "healthy market growth",
                "search_up_sales_down": "curiosity without conversion",
                "search_down_sales_up": "repeat purchase market",
                "both_down": "declining market",
            },
        },
        "validation": {
            "rows_before_cleaning": rows_before_cleaning,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": [search_col, sales_col],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
