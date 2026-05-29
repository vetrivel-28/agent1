"""Capital Efficiency Score — revenue vs storage fee burden."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.analytics.finance._utils import clamp_score, insufficient_metric, safe_divide
from app.utils.column_mapper import find_column
from app.utils.dataframe_checks import is_empty_dataframe
from app.utils.normalization import min_max_normalize
from app.utils.numeric_cleaner import clean_numeric_series

_REVENUE_CANDIDATES = [
    "Parent Level Revenue", "parent level revenue",
    "Parent Revenue", "parent revenue",
    "ASIN Revenue", "asin revenue", "Revenue", "revenue",
]
_STORAGE_JAN_SEP_CANDIDATES = [
    "Storage Fee Jan-Sep", "storage fee jan-sep", "Storage Fee Jan Sep",
    "Storage Fees Jan-Sep", "Jan-Sep Storage Fee",
]
_STORAGE_OCT_DEC_CANDIDATES = [
    "Storage Fee Oct-Dec", "storage fee oct-dec", "Storage Fee Oct Dec",
    "Storage Fees Oct-Dec", "Oct-Dec Storage Fee",
]


def compute_capital_efficiency(
    blackbox_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    if is_empty_dataframe(blackbox_df):
        return insufficient_metric(
            "capital_efficiency",
            ["Parent Revenue", "Storage Fee Jan-Sep", "Storage Fee Oct-Dec"],
            ["blackbox"],
        )

    assert blackbox_df is not None
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    storage_jan_col = find_column(blackbox_df, _STORAGE_JAN_SEP_CANDIDATES)
    storage_oct_col = find_column(blackbox_df, _STORAGE_OCT_DEC_CANDIDATES)

    missing: List[str] = []
    if not revenue_col:
        missing.append("Parent Revenue")
    if not storage_jan_col:
        missing.append("Storage Fee Jan-Sep")
    if not storage_oct_col:
        missing.append("Storage Fee Oct-Dec")
    if missing:
        return insufficient_metric("capital_efficiency", missing, ["blackbox"])

    rev, _ = clean_numeric_series(blackbox_df[revenue_col])
    s1, _ = clean_numeric_series(blackbox_df[storage_jan_col])
    s2, _ = clean_numeric_series(blackbox_df[storage_oct_col])

    avg_storage = (s1 + s2) / 2.0
    efficiency = safe_divide(rev, np.maximum(avg_storage, 1.0), default=np.nan)
    valid = pd.Series(efficiency).replace([np.inf, -np.inf], np.nan).dropna()
    if valid.empty:
        return insufficient_metric(
            "capital_efficiency",
            ["Parent Revenue", "Storage Fee Jan-Sep", "Storage Fee Oct-Dec"],
            ["blackbox"],
        )

    median_eff = float(valid.median())
    score = clamp_score(float(min_max_normalize(valid).median()))

    if score >= 67:
        classification = "Capital Efficient"
    elif score >= 34:
        classification = "Average"
    else:
        classification = "Inefficient"

    return {
        "status": "success",
        "score": score,
        "classification": classification,
        "median_efficiency_ratio": round(median_eff, 4),
        "columns_used": [revenue_col, storage_jan_col, storage_oct_col],
        "formula_used": (
            "Efficiency = Revenue / max(avg(Storage Jan-Sep, Storage Oct-Dec), 1); "
            "market score = norm(median(Efficiency))"
        ),
        "mini_insight": (
            f"Revenue offsets storage burden at {classification.lower()} levels "
            f"({clamp_score(score)}/100); median efficiency ratio {median_eff:.2f}."
        ),
        "numeric_columns_cleaned": [revenue_col, storage_jan_col, storage_oct_col],
    }
