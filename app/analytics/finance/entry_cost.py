"""Entry Cost Index — market entry difficulty from keyword signals."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

from app.analytics.finance._utils import (
    classify_low_medium_high,
    clamp_score,
    insufficient_metric,
    market_score_from_normalized_columns,
    prepare_normalized_column,
    resolve_columns,
)
from app.utils.dataframe_checks import is_empty_dataframe

_CPR_CANDIDATES = ["CPR", "cpr", "Cost Per Result"]
_SPONSORED_CANDIDATES = [
    "Sponsored ASINs", "sponsored asins", "Sponsored ASIN Count", "sponsored asin",
]
_COMPETING_CANDIDATES = ["Competing Products", "competing products"]
_TITLE_DENSITY_CANDIDATES = ["Title Density", "title density", "TitleDensity"]

_WEIGHTS = {
    "cpr": 0.35,
    "sponsored_asins": 0.25,
    "competing_products": 0.25,
    "title_density": 0.15,
}


def _entry_classification(score: float) -> str:
    if score <= 33:
        return "Easy"
    if score <= 66:
        return "Moderate"
    return "Difficult"


def compute_entry_cost(
    magnet_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    if is_empty_dataframe(magnet_df):
        return insufficient_metric(
            "entry_cost",
            ["CPR", "Sponsored ASINs", "Competing Products", "Title Density"],
            ["magnet"],
        )

    assert magnet_df is not None
    cols = resolve_columns(
        magnet_df,
        {
            "cpr": _CPR_CANDIDATES,
            "sponsored_asins": _SPONSORED_CANDIDATES,
            "competing_products": _COMPETING_CANDIDATES,
            "title_density": _TITLE_DENSITY_CANDIDATES,
        },
    )
    labels = {
        "cpr": "CPR",
        "sponsored_asins": "Sponsored ASINs",
        "competing_products": "Competing Products",
        "title_density": "Title Density",
    }
    missing = [labels[k] for k, v in cols.items() if not v]
    if missing:
        return insufficient_metric("entry_cost", missing, ["magnet"])

    numeric_cols_cleaned: List[str] = []
    work = magnet_df.copy()
    norm_cols: Dict[str, str] = {}
    for key, col in cols.items():
        if not col:
            continue
        norm_name = f"norm_{key}"
        work[norm_name] = prepare_normalized_column(work[col], col, numeric_cols_cleaned)
        norm_cols[key] = norm_name

    score, _ = market_score_from_normalized_columns(work, norm_cols, _WEIGHTS)
    classification = _entry_classification(score)

    return {
        "status": "success",
        "score": score,
        "classification": classification,
        "columns_used": [cols[k] for k in cols if cols[k]],
        "formula_used": (
            "ECI = 0.35×norm(CPR) + 0.25×norm(Sponsored ASINs) + "
            "0.25×norm(Competing Products) + 0.15×norm(Title Density); market = median(row)"
        ),
        "mini_insight": (
            f"Market entry is classified as {classification.lower()} "
            f"({clamp_score(score)}/100) based on CPR, sponsorship, and competition density."
        ),
        "numeric_columns_cleaned": numeric_cols_cleaned,
    }
