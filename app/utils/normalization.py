"""Deterministic normalization utilities for skewed ecommerce metrics."""
from __future__ import annotations

from typing import Tuple

import numpy as np
import pandas as pd


def percentile_clip(
    series: pd.Series,
    lower_q: float = 0.05,
    upper_q: float = 0.95,
) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    valid = numeric.dropna()
    if valid.empty:
        return pd.Series(np.nan, index=series.index, dtype=float)
    low = float(valid.quantile(lower_q))
    high = float(valid.quantile(upper_q))
    if low > high:
        low, high = high, low
    return numeric.clip(lower=low, upper=high)


def min_max_normalize(series: pd.Series, target_min: float = 0.0, target_max: float = 100.0) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    valid = numeric.dropna()
    if valid.empty:
        return pd.Series(np.nan, index=series.index, dtype=float)
    min_val = float(valid.min())
    max_val = float(valid.max())
    if max_val == min_val:
        return numeric.apply(lambda x: (target_min + target_max) / 2 if pd.notna(x) else np.nan)
    scaled = (numeric - min_val) / (max_val - min_val)
    return (scaled * (target_max - target_min) + target_min).clip(target_min, target_max)


def safe_log_normalize(
    series: pd.Series,
    lower_q: float = 0.05,
    upper_q: float = 0.95,
) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    # Shift values to avoid invalid log for <= -1.
    min_val = numeric.dropna().min() if not numeric.dropna().empty else 0
    shift = abs(float(min_val)) + 1.0 if min_val <= -1 else 0.0
    logged = np.log1p(numeric + shift)
    clipped = percentile_clip(pd.Series(logged, index=series.index), lower_q=lower_q, upper_q=upper_q)
    return min_max_normalize(clipped)


def rolling_trend_smoothing(series: pd.Series, window: int = 5) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.rolling(window=window, min_periods=1).mean()


def adaptive_scaling(series: pd.Series, lower_q: float = 0.05, upper_q: float = 0.95) -> Tuple[float, float]:
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return (0.0, 100.0)
    low = float(numeric.quantile(lower_q))
    high = float(numeric.quantile(upper_q))
    if low == high:
        pad = max(abs(low) * 0.1, 1.0)
        return (low - pad, high + pad)
    return (low, high)

