from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import rolling_trend_smoothing, safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("demand_velocity_engine")

_SEARCH_TREND_CANDIDATES = ["Search Volume Trend", "Search Trend"]
_YOY_TREND_CANDIDATES = ["YoY Search Trend", "Search YoY Trend"]
_SALES_TREND_CANDIDATES = ["Sales Trend", "Sales Trend (90 days) (%)", "Sales Trend (%)"]
_REVENUE_TREND_CANDIDATES = ["Revenue Trend", "Price Trend (90 days) (%)", "Price Trend (%)"]
_KEYWORD_CANDIDATES = ["Keyword Phrase", "Keyword"]
_TITLE_CANDIDATES = ["Title", "Product Title"]
_ASIN_CANDIDATES = ["ASIN"]


def _safe_value(value: Any) -> Any:
    if value is None:
        return None
    if pd.isna(value):
        return None
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return round(float(value), 4)
    return value


def run(magnet_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()

    rows_magnet = len(magnet_df) if magnet_df is not None else 0
    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    rows_before_cleaning = rows_magnet + rows_blackbox

    columns_used: List[str] = []
    numeric_columns_cleaned: List[str] = []
    warning_messages: List[str] = []

    metric_series: List[pd.Series] = []
    metric_names: List[str] = []
    signal_values: Dict[str, float] = {}

    datasets_used: List[str] = []

    def register_metric(df: pd.DataFrame, column_candidates: List[str], metric_name: str, dataset_name: str) -> None:
        col = find_column(df, column_candidates)
        if col is None:
            warning_messages.append(f"{metric_name}: column missing")
            return
        cleaned, _ = clean_numeric_series(df[col], col)
        numeric_columns_cleaned.append(col)
        smoothed = rolling_trend_smoothing(cleaned, window=5)
        normalized = safe_log_normalize(smoothed)
        if normalized.dropna().empty:
            warning_messages.append(f"{metric_name}: not enough variance or all values NaN")
            return
        metric_series.append(normalized)
        metric_names.append(metric_name)
        signal_values[metric_name] = float(normalized.mean(skipna=True))
        columns_used.append(col)
        datasets_used.append(dataset_name)

    if magnet_df is not None and not magnet_df.empty:
        register_metric(magnet_df, _SEARCH_TREND_CANDIDATES, "Normalized Search Trend", "magnet")
        register_metric(magnet_df, _YOY_TREND_CANDIDATES, "Normalized YoY Growth", "magnet")
    if blackbox_df is not None and not blackbox_df.empty:
        register_metric(blackbox_df, _SALES_TREND_CANDIDATES, "Normalized Sales Trend", "blackbox")
        register_metric(blackbox_df, _REVENUE_TREND_CANDIDATES, "Normalized Revenue Trend", "blackbox")

    if not metric_series:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Demand Velocity",
            "summary": "No valid trend metrics could be computed from available datasets.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": list(dict.fromkeys(numeric_columns_cleaned)),
                "warnings": warning_messages,
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # Market-level deterministic velocity score from metric means.
    metric_mean_series = pd.Series(signal_values, dtype=float)
    velocity_score = float(metric_mean_series.mean())
    p33 = float(metric_mean_series.quantile(0.33))
    p66 = float(metric_mean_series.quantile(0.66))
    if velocity_score >= p66:
        market_phase = "accelerating market"
    elif velocity_score >= p33:
        market_phase = "stable market"
    else:
        market_phase = "saturated or slowing market"

    strongest_growth = (
        metric_mean_series.sort_values(ascending=False)
        .head(min(top_n, len(metric_mean_series)))
        .round(4)
        .reset_index()
        .rename(columns={"index": "signal", 0: "score"})
        .to_dict(orient="records")
    )
    weakest_growth = (
        metric_mean_series.sort_values(ascending=True)
        .head(min(top_n, len(metric_mean_series)))
        .round(4)
        .reset_index()
        .rename(columns={"index": "signal", 0: "score"})
        .to_dict(orient="records")
    )

    rows_after_cleaning = int(sum(s.notna().sum() for s in metric_series))
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)

    return {
        "status": "success",
        "metric_name": "Demand Velocity",
        "summary": f"Demand velocity indicates an {market_phase}.",
        "datasets_used": list(dict.fromkeys(datasets_used)),
        "columns_used": list(dict.fromkeys(columns_used)),
        "formula_used": (
            "Demand Velocity = (Normalized Sales Trend + Normalized Search Trend + "
            "Normalized YoY Growth + Normalized Revenue Trend) / 4, using min-max normalization."
        ),
        "results": {
            "velocity_score": round(velocity_score, 2),
            "market_phase": market_phase,
            "strongest_growth_signals": strongest_growth,
            "weakest_growth_signals": weakest_growth,
            "metrics_used": metric_names,
            "metric_scores": {k: _safe_value(v) for k, v in signal_values.items()},
        },
        "validation": {
            "rows_before_cleaning": rows_before_cleaning,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": list(dict.fromkeys(numeric_columns_cleaned)),
            "warnings": warning_messages,
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
