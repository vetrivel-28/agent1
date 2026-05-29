"""Advertising Pressure Index — visibility acquisition cost from keyword data."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

from app.analytics.finance._utils import (
    capital_requirement_from_pressure,
    classify_low_medium_high,
    clamp_score,
    insufficient_metric,
    market_score_from_normalized_columns,
    prepare_normalized_column,
    resolve_columns,
)
from app.utils.dataframe_checks import is_empty_dataframe

_PPC_BID_CANDIDATES = [
    "H10 PPC Sugg. Bid", "h10 ppc sugg. bid", "PPC Sugg. Bid", "ppc sugg. bid",
    "Suggested PPC Bid", "suggested ppc bid",
]
_CPR_CANDIDATES = ["CPR", "cpr", "Cost Per Result"]
_COMPETING_CANDIDATES = ["Competing Products", "competing products", "Competing products"]
_TITLE_DENSITY_CANDIDATES = ["Title Density", "title density", "TitleDensity"]

_WEIGHTS = {
    "ppc_bid": 0.35,
    "cpr": 0.30,
    "competing_products": 0.20,
    "title_density": 0.15,
}


def compute_advertising_pressure(
    magnet_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    if is_empty_dataframe(magnet_df):
        return insufficient_metric(
            "advertising_pressure",
            ["H10 PPC Sugg. Bid", "CPR", "Competing Products", "Title Density"],
            ["magnet"],
        )

    assert magnet_df is not None
    cols = resolve_columns(
        magnet_df,
        {
            "ppc_bid": _PPC_BID_CANDIDATES,
            "cpr": _CPR_CANDIDATES,
            "competing_products": _COMPETING_CANDIDATES,
            "title_density": _TITLE_DENSITY_CANDIDATES,
        },
    )
    missing = [k for k, v in cols.items() if not v]
    if missing:
        labels = {
            "ppc_bid": "H10 PPC Sugg. Bid",
            "cpr": "CPR",
            "competing_products": "Competing Products",
            "title_density": "Title Density",
        }
        return insufficient_metric(
            "advertising_pressure",
            [labels[k] for k in missing],
            ["magnet"],
        )

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
    classification = classify_low_medium_high(score)

    return {
        "status": "success",
        "score": score,
        "classification": classification,
        "capital_requirement": capital_requirement_from_pressure(classification),
        "columns_used": [cols[k] for k in cols if cols[k]],
        "formula_used": (
            "API = 0.35×norm(PPC Bid) + 0.30×norm(CPR) + "
            "0.20×norm(Competing Products) + 0.15×norm(Title Density); market = median(row)"
        ),
        "mini_insight": (
            f"Visibility acquisition is {classification.lower()} pressure "
            f"({clamp_score(score)}/100) — capital requirement is "
            f"{capital_requirement_from_pressure(classification).lower()}."
        ),
        "numeric_columns_cleaned": numeric_cols_cleaned,
    }
