"""
Dynamic column mapper.
Normalises column names (lowercase + strip) for case/space-insensitive lookup.
NEVER invents columns — only maps what exists in the dataframe.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def _norm(col: str) -> str:
    """Lowercase + strip a column name."""
    return str(col).strip().lower()


def build_column_map(df: pd.DataFrame) -> Dict[str, str]:
    """Return {normalised_name: actual_column_name} for every column in df."""
    return {_norm(c): c for c in df.columns}


def find_column(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    """
    Return the first actual column name that matches any candidate
    (case-insensitive, whitespace-insensitive).  Returns None if not found.
    """
    col_map = build_column_map(df)
    for candidate in candidates:
        key = _norm(candidate)
        if key in col_map:
            return col_map[key]
    return None


def find_columns(
    df: pd.DataFrame,
    candidates_list: List[List[str]],
) -> Dict[str, Optional[str]]:
    """
    For each group of candidates, find the first matching column.
    Returns {canonical_name (first item in group): actual_column_or_None}.
    """
    return {group[0]: find_column(df, group) for group in candidates_list}


# ---------------------------------------------------------------------------
# Numeric conversion
# ---------------------------------------------------------------------------

def to_numeric_safe(series: pd.Series) -> pd.Series:
    """
    Coerce a series to float, handling commas, %, N/A, dashes, etc.
    Non-parseable values become NaN.
    """
    if series.dtype == object:
        s = (
            series.astype(str)
            .str.replace(",", "", regex=False)
            .str.replace("%", "", regex=False)
            .str.strip()
            .replace(["N/A", "n/a", "-", "", "None", "nan", "NaN", ">"], pd.NA)
        )
        # Handle ">10,000" style strings — strip leading ">"
        s = s.str.lstrip(">")
        return pd.to_numeric(s, errors="coerce")
    return pd.to_numeric(series, errors="coerce")


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def minmax_normalize(series: pd.Series) -> pd.Series:
    """
    Min-max normalise to 0-100.
    If max == min (all identical), returns 50.0 for non-null values (neutral).
    NaN inputs remain NaN.
    """
    numeric = to_numeric_safe(series)
    valid = numeric.dropna()

    if valid.empty:
        return pd.Series([np.nan] * len(series), index=series.index, dtype=float)

    min_val = float(valid.min())
    max_val = float(valid.max())

    if max_val == min_val:
        # All identical — neutral score
        return numeric.apply(lambda x: 50.0 if pd.notna(x) else np.nan)

    return (numeric - min_val) / (max_val - min_val) * 100.0
