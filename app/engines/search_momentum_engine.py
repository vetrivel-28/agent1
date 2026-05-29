from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import rolling_trend_smoothing, safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("search_momentum_engine")

# Configurable weights for search momentum calculations
_MOMENTUM_ALIGNMENT_WEIGHTS = {
    "search_trend": 0.4,
    "sales_trend": 0.4,
    "sales_volume": 0.2,
}
_KEYWORD_MOMENTUM_WEIGHTS = {
    "search_trend": 0.5,
    "sales_trend": 0.3,
    "sales_volume": 0.2,
}
_PRODUCT_MOMENTUM_WEIGHTS = {
    "search_trend": 0.4,
    "sales_trend": 0.4,
    "sales_volume": 0.2,
}

# Configurable thresholds for trend category classification
_TREND_STRONG_GROWTH_THRESHOLD = 70
_TREND_MODERATE_GROWTH_THRESHOLD = 45

_SEARCH_TREND_CANDIDATES = ["Search Volume Trend", "Search Trend"]
_SALES_TREND_CANDIDATES = ["Sales Trend", "Sales Trend (90 days) (%)", "Sales Trend (%)"]
_SALES_VOLUME_CANDIDATES = ["ASIN Sales", "Parent Level Sales", "Keyword Sales"]
_KEYWORD_CANDIDATES = ["Keyword Phrase", "Keyword"]
_TITLE_CANDIDATES = ["Title", "Product Title"]
_ASIN_CANDIDATES = ["ASIN"]


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
    sales_volume_col = find_column(blackbox_df, _SALES_VOLUME_CANDIDATES)
    if search_col is None or sales_col is None or sales_volume_col is None:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Momentum",
            "summary": "Required trend columns not found.",
            "datasets_used": ["magnet", "blackbox"],
            "columns_used": [c for c in [search_col, sales_col, sales_volume_col] if c],
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
    blackbox_work["sales_volume"], _ = clean_numeric_series(blackbox_df[sales_volume_col], sales_volume_col)

    magnet_work["norm_search_trend"] = safe_log_normalize(magnet_work["search_trend"])
    blackbox_work["norm_sales_trend"] = safe_log_normalize(blackbox_work["sales_trend"])
    blackbox_work["norm_sales_volume_trend"] = safe_log_normalize(blackbox_work["sales_volume"])

    if (
        magnet_work["norm_search_trend"].dropna().empty
        or blackbox_work["norm_sales_trend"].dropna().empty
        or blackbox_work["norm_sales_volume_trend"].dropna().empty
    ):
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Momentum",
            "summary": "Trend columns did not contain sufficient numeric variance.",
            "datasets_used": ["magnet", "blackbox"],
            "columns_used": [search_col, sales_col, sales_volume_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [search_col, sales_col, sales_volume_col],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    mean_search_trend = float(magnet_work["norm_search_trend"].mean(skipna=True))
    mean_sales_trend = float(blackbox_work["norm_sales_trend"].mean(skipna=True))
    mean_sales_volume = float(blackbox_work["norm_sales_volume_trend"].mean(skipna=True))
    momentum_alignment = round(
        (mean_search_trend * _MOMENTUM_ALIGNMENT_WEIGHTS["search_trend"])
        + (mean_sales_trend * _MOMENTUM_ALIGNMENT_WEIGHTS["sales_trend"])
        + (mean_sales_volume * _MOMENTUM_ALIGNMENT_WEIGHTS["sales_volume"]),
        2,
    )

    # Keyword Search Momentum = search 0.5 + market avg sales trend 0.3 + market avg sales vol 0.2
    magnet_work["market_avg_sales_trend"] = mean_sales_trend
    magnet_work["market_avg_sales_volume"] = mean_sales_volume
    magnet_work["momentum_score"] = (
        (magnet_work["norm_search_trend"] * _KEYWORD_MOMENTUM_WEIGHTS["search_trend"])
        + (mean_sales_trend * _KEYWORD_MOMENTUM_WEIGHTS["sales_trend"])
        + (mean_sales_volume * _KEYWORD_MOMENTUM_WEIGHTS["sales_volume"])
    ).clip(0.0, 100.0)
    # Product Search-Sales Momentum = market avg search 0.4 + product sales trend 0.4 + sales vol 0.2
    blackbox_work["momentum_score"] = (
        (mean_search_trend * _PRODUCT_MOMENTUM_WEIGHTS["search_trend"])
        + (blackbox_work["norm_sales_trend"] * _PRODUCT_MOMENTUM_WEIGHTS["sales_trend"])
        + (blackbox_work["norm_sales_volume_trend"] * _PRODUCT_MOMENTUM_WEIGHTS["sales_volume"])
    ).clip(0.0, 100.0)

    keyword_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    if keyword_col:
        magnet_work["keyword"] = magnet_df[keyword_col].astype(str)

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    if title_col:
        blackbox_work["title"] = blackbox_df[title_col].astype(str).str.slice(0, 120)
    if asin_col:
        blackbox_work["asin"] = blackbox_df[asin_col].astype(str)

    # Add per-keyword trend_strength based on individual keyword's search trend
    magnet_work["trend_strength"] = magnet_work["norm_search_trend"]
    
    search_median = float(magnet_work["momentum_score"].median(skipna=True))
    sales_median = float(blackbox_work["momentum_score"].median(skipna=True))

    healthy_keywords = (
        magnet_work[magnet_work["momentum_score"] >= search_median]
        .sort_values("momentum_score", ascending=False)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    weak_momentum_keywords = (
        magnet_work[magnet_work["momentum_score"] < search_median]
        .sort_values("momentum_score", ascending=True)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    # Add per-product trend_strength based on individual product's sales trend
    blackbox_work["trend_strength"] = blackbox_work["norm_sales_trend"]
    
    strongest_products = (
        blackbox_work[blackbox_work["momentum_score"] >= sales_median]
        .sort_values("momentum_score", ascending=False)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    weakest_products = (
        blackbox_work[blackbox_work["momentum_score"] < sales_median]
        .sort_values("momentum_score", ascending=True)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )

    rows_after_cleaning = int(
        magnet_work["norm_search_trend"].notna().sum()
        + blackbox_work["norm_sales_trend"].notna().sum()
        + blackbox_work["norm_sales_volume_trend"].notna().sum()
    )
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)

    return {
        "status": "success",
        "metric_name": "Search Momentum",
        "summary": "Search momentum combines market-level search and sales movement at the category level.",
        "datasets_used": ["magnet", "blackbox"],
        "columns_used": [search_col, sales_col, sales_volume_col],
        "formula_used": (
            "Search Momentum = weighted market-level score using Magnet keyword search trend, "
            "Blackbox product sales trend, and Blackbox sales volume. Magnet and Blackbox are NOT row-wise joined; "
            "keyword scores use market-average sales trend and sales volume from Blackbox, while product scores use market-average search trend from Magnet. "
            "Normalization uses log scaling + smoothing."
        ),
        "results": {
            "momentum_alignment": momentum_alignment,
            "market_signal_scores": {
                "mean_search_trend": round(mean_search_trend, 4),
                "mean_sales_trend": round(mean_sales_trend, 4),
                "mean_sales_volume": round(mean_sales_volume, 4),
            },
            "mapping_logic": (
                "No direct ASIN-keyword mapping is performed. Magnet has keyword-level search data; "
                "Blackbox has product-level sales data. They are combined only at market/category level "
                "by using averages across each dataset."
            ),
            "healthy_keywords": healthy_keywords,
            "weak_momentum_keywords": weak_momentum_keywords,
            "strongest_momentum_products": strongest_products,
            "weakest_momentum_products": weakest_products,
            "trend_category": (
                "Strong Growth" if momentum_alignment >= _TREND_STRONG_GROWTH_THRESHOLD else
                "Moderate Growth" if momentum_alignment >= _TREND_MODERATE_GROWTH_THRESHOLD else
                "Stable/Weak"
            ),
            "trend_strength": round(momentum_alignment, 2),
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
            "columns_used": [search_col, sales_col, sales_volume_col],
            "valid_rows_by_metric": {
                "search_trend": int(magnet_work["norm_search_trend"].notna().sum()),
                "sales_trend": int(blackbox_work["norm_sales_trend"].notna().sum()),
                "sales_volume": int(blackbox_work["norm_sales_volume_trend"].notna().sum()),
            },
            "skipped_rows_by_metric": {},
            "warnings": [],
            "numeric_columns_cleaned": [search_col, sales_col, sales_volume_col],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
