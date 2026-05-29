"""Premium Viability Score — price-tier revenue concentration."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.analytics.finance._utils import clamp_score, insufficient_metric
from app.utils.column_mapper import find_column
from app.utils.dataframe_checks import is_empty_dataframe
from app.utils.numeric_cleaner import clean_numeric_series

_PRICE_CANDIDATES = ["Price", "price", "List Price", "list price"]
_REVENUE_CANDIDATES = [
    "Parent Level Revenue", "parent level revenue",
    "ASIN Revenue", "asin revenue", "Revenue", "revenue", "Monthly Revenue",
]


def _price_band_label(low: float, high: float) -> str:
    return f"${low:,.0f}-${high:,.0f}"


def compute_premium_viability(
    blackbox_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    if is_empty_dataframe(blackbox_df):
        return insufficient_metric(
            "premium_viability",
            ["Price", "Parent Level Revenue"],
            ["blackbox"],
        )

    assert blackbox_df is not None
    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    missing: List[str] = []
    if not price_col:
        missing.append("Price")
    if not revenue_col:
        missing.append("Parent Level Revenue")
    if missing:
        return insufficient_metric("premium_viability", missing, ["blackbox"])

    price_clean, _ = clean_numeric_series(blackbox_df[price_col])
    rev_clean, _ = clean_numeric_series(blackbox_df[revenue_col])
    work = pd.DataFrame({"price": price_clean, "revenue": rev_clean}).dropna()
    work = work[(work["price"] > 0) & (work["revenue"] >= 0)]
    if len(work) < 4:
        return insufficient_metric(
            "premium_viability",
            ["Price", "Parent Level Revenue"],
            ["blackbox"],
        )

    work = work.sort_values("price")
    work["quartile"] = pd.qcut(work["price"], 4, labels=["Q1", "Q2", "Q3", "Q4"], duplicates="drop")
    total_rev = float(work["revenue"].sum())
    if total_rev <= 0:
        return insufficient_metric(
            "premium_viability",
            ["Parent Level Revenue"],
            ["blackbox"],
        )

    shares = work.groupby("quartile", observed=True)["revenue"].sum() / total_rev
    q1_share = float(shares.get("Q1", 0.0))
    q4_share = float(shares.get("Q4", 0.0))
    raw_pvs = (q4_share - q1_share) * 100.0
    score = clamp_score(((raw_pvs + 100.0) / 200.0) * 100.0)

    if score > 60:
        classification = "Premium Friendly"
    elif score >= 30:
        classification = "Balanced"
    else:
        classification = "Price Sensitive"

    q4_rows = work[work["quartile"] == "Q4"]
    if not q4_rows.empty:
        best_price_band = _price_band_label(
            float(q4_rows["price"].min()),
            float(q4_rows["price"].max()),
        )
    else:
        best_price_band = "Not Available"

    heatmap: List[Dict[str, Any]] = []
    for label in ["Q1", "Q2", "Q3", "Q4"]:
        q_rows = work[work["quartile"] == label]
        if q_rows.empty:
            continue
        heatmap.append({
            "price_band": _price_band_label(float(q_rows["price"].min()), float(q_rows["price"].max())),
            "revenue_share": round(float(shares.get(label, 0.0)) * 100, 2),
            "competition_density": int(len(q_rows)),
        })

    return {
        "status": "success",
        "score": score,
        "classification": classification,
        "best_price_band": best_price_band,
        "revenue_share_q1": round(q1_share * 100, 2),
        "revenue_share_q4": round(q4_share * 100, 2),
        "price_elasticity_heatmap": heatmap,
        "columns_used": [price_col, revenue_col],
        "formula_used": "PVS = ((RawPVS + 100) / 200) x 100; RawPVS = RevenueShare(Q4) - RevenueShare(Q1) in pp",
        "raw_pvs": round(raw_pvs, 2),
        "mini_insight": (
            f"Market is {classification.lower()} with top-quartile revenue share "
            f"of {round(q4_share * 100, 1)}% vs bottom {round(q1_share * 100, 1)}%."
        ),
        "numeric_columns_cleaned": [price_col, revenue_col],
    }
