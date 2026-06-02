"""Shared helpers for Finance Intelligence analytics."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.normalization import min_max_normalize
from app.utils.numeric_cleaner import clean_numeric_series


def percentile_clip_and_scale(
    series: pd.Series,
    lower_pct: float = 5.0,
    upper_pct: float = 95.0,
    invert: bool = False,
) -> pd.Series:
    """
    Percentile-based normalization with winsorization:
    1. Extract valid numeric values
    2. Clip to 5th–95th percentile bounds
    3. Min-max scale to 0–100
    4. Optionally invert (100 - value)
    """
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return pd.Series([np.nan] * len(series), index=series.index)
    
    lower_bound = numeric.quantile(lower_pct / 100.0)
    upper_bound = numeric.quantile(upper_pct / 100.0)
    
    # Clip values to bounds
    clipped = numeric.clip(lower=lower_bound, upper=upper_bound)
    
    # Min-max scale
    if clipped.min() == clipped.max():
        scaled = pd.Series(50.0, index=clipped.index)
    else:
        scaled = (clipped - clipped.min()) / (clipped.max() - clipped.min()) * 100.0
    
    if invert:
        scaled = 100.0 - scaled
    
    # Expand back to original index with NaN for missing values
    result = pd.Series(np.nan, index=series.index, dtype=float)
    result.loc[numeric.index] = scaled.values
    return result


def safe_divide(
    numerator: pd.Series | float,
    denominator: pd.Series | float,
    default: float = 0.0,
) -> pd.Series | float:
    """Element-wise safe division; returns default when denominator is zero."""
    if isinstance(numerator, pd.Series) or isinstance(denominator, pd.Series):
        num = pd.to_numeric(numerator, errors="coerce")
        den = pd.to_numeric(denominator, errors="coerce")
        den = den.replace(0, np.nan)
        result = num / den
        return result.fillna(default).replace([np.inf, -np.inf], default)
    if denominator in (0, 0.0) or pd.isna(denominator):
        return default
    value = float(numerator) / float(denominator)
    if np.isnan(value) or np.isinf(value):
        return default
    return value


def percentile_rank(series: pd.Series, value: Optional[float] = None) -> float:
    """Percentile rank (dividend) for value within series, scaled 0–100."""
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return 0.0
    target = float(numeric.median()) if value is None else float(value)
    rank_pct = float((numeric <= target).mean()) * 100.0
    return clamp_score(rank_pct)


def clamp_score(value: float) -> float:
    if value is None or (isinstance(value, float) and (np.isnan(value) or np.isinf(value))):
        return 0.0
    return round(float(np.clip(value, 0.0, 100.0)), 2)


def classify_pressure_level(score: float) -> str:
    """
    Classify pressure/difficulty based on percentile thresholds:
    - 0–25: Low observed pressure
    - 26–50: Moderate pressure
    - 51–75: High pressure
    - 76–100: Severe pressure
    """
    if score <= 25:
        return "Low observed pressure"
    if score <= 50:
        return "Moderate pressure"
    if score <= 75:
        return "High pressure"
    return "Severe pressure"


def classify_low_medium_high(score: float) -> str:
    if score <= 33:
        return "Low"
    if score <= 66:
        return "Medium"
    return "High"


def capital_requirement_from_pressure(classification: str) -> str:
    mapping = {"Low": "Light", "Medium": "Moderate", "High": "Heavy"}
    return mapping.get(classification, "Moderate")


def market_score_from_normalized_columns(
    df: pd.DataFrame,
    col_map: Dict[str, str],
    weights: Dict[str, float],
) -> Tuple[float, pd.Series]:
    """Weighted row score using pre-normalized 0–100 columns; market = median."""
    row_score = pd.Series(0.0, index=df.index, dtype=float)
    for key, weight in weights.items():
        col = col_map.get(key)
        if col and col in df.columns:
            row_score = row_score + df[col].astype(float) * weight
    valid = row_score.replace([np.inf, -np.inf], np.nan).dropna()
    if valid.empty:
        return 0.0, row_score
    return clamp_score(float(valid.median())), row_score


def prepare_normalized_column(
    series: pd.Series,
    name: str,
    numeric_cols_cleaned: List[str],
) -> pd.Series:
    cleaned, _ = clean_numeric_series(series)
    if name not in numeric_cols_cleaned:
        numeric_cols_cleaned.append(name)
    return min_max_normalize(cleaned)


def resolve_columns(
    df: pd.DataFrame,
    candidates_map: Dict[str, List[str]],
) -> Dict[str, Optional[str]]:
    return {key: find_column(df, candidates) for key, candidates in candidates_map.items()}


def build_economic_attractiveness_matrix(
    demand_strength: float,
    finance_health: float,
    threshold: float = 50.0,
) -> Dict[str, Any]:
    """Quadrant: Demand Strength (Y) vs Finance Health (X)."""
    high_demand = float(demand_strength) >= threshold
    high_finance = float(finance_health) >= threshold
    if high_demand and high_finance:
        quadrant = "Launch Candidate"
        recommendation = "Proceed — strong demand with supportive economics."
    elif high_demand and not high_finance:
        quadrant = "Difficult Economics"
        recommendation = "Caution — demand exists but economics are weak."
    elif not high_demand and high_finance:
        quadrant = "Niche Opportunity"
        recommendation = "Selective entry — economics work for focused positioning."
    else:
        quadrant = "Avoid"
        recommendation = "Avoid broad launch — weak demand and economics."
    return {
        "x_axis": "Finance Health",
        "y_axis": "Demand Strength",
        "finance_health": round(float(finance_health), 2),
        "demand_strength": round(float(demand_strength), 2),
        "threshold": threshold,
        "quadrant": quadrant,
        "launch_recommendation": recommendation,
    }


def insufficient_metric(
    metric_key: str,
    missing_columns: List[str],
    datasets: List[str],
) -> Dict[str, Any]:
    return {
        "status": "insufficient_data",
        "score": None,
        "classification": "Not Available",
        "missing_columns": missing_columns,
        "datasets_required": datasets,
        "mini_insight": (
            f"Required columns not found: {', '.join(missing_columns)}."
            if missing_columns
            else "Required data not available."
        ),
    }
