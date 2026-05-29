"""Margin Compression Risk — pricing war and seller density signals."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.analytics.finance._utils import (
    classify_low_medium_high,
    clamp_score,
    insufficient_metric,
    prepare_normalized_column,
    resolve_columns,
)
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.dataframe_checks import is_empty_dataframe

_PRICE_CANDIDATES = ["Price", "price", "List Price"]
_REVENUE_CANDIDATES = [
    "Parent Level Revenue", "parent level revenue",
    "Parent Revenue", "parent revenue",
    "ASIN Revenue", "asin revenue", "Revenue", "revenue",
]
_ACTIVE_SELLERS_CANDIDATES = [
    "Active Sellers", "active sellers", "Sellers", "sellers", "Number of Sellers",
]

_WEIGHTS = {
    "seller_density": 0.40,
    "revenue_fragmentation": 0.30,
    "inverse_price_dispersion": 0.30,
}


def compute_margin_compression(
    blackbox_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    if is_empty_dataframe(blackbox_df):
        return insufficient_metric(
            "margin_compression",
            ["Price", "Parent Revenue", "Active Sellers"],
            ["blackbox"],
        )

    assert blackbox_df is not None
    cols = resolve_columns(
        blackbox_df,
        {
            "price": _PRICE_CANDIDATES,
            "revenue": _REVENUE_CANDIDATES,
            "active_sellers": _ACTIVE_SELLERS_CANDIDATES,
        },
    )
    missing_labels: List[str] = []
    if not cols["price"]:
        missing_labels.append("Price")
    if not cols["revenue"]:
        missing_labels.append("Parent Revenue")
    if not cols["active_sellers"]:
        missing_labels.append("Active Sellers")
    if missing_labels:
        return insufficient_metric("margin_compression", missing_labels, ["blackbox"])

    numeric_cols_cleaned: List[str] = []
    work = blackbox_df.copy()
    sellers = prepare_normalized_column(
        work[cols["active_sellers"]], cols["active_sellers"], numeric_cols_cleaned
    )
    seller_density = clamp_score(float(sellers.median(skipna=True)))

    rev_raw, _ = clean_numeric_series(work[cols["revenue"]])
    rev_valid = rev_raw.dropna()
    rev_valid = rev_valid[rev_valid > 0]
    if rev_valid.empty:
        return insufficient_metric("margin_compression", ["Parent Revenue"], ["blackbox"])

    total_rev = float(rev_valid.sum())
    market_shares = rev_valid / total_rev
    hhi = float((market_shares ** 2).sum())
    fragmentation = clamp_score((1.0 - hhi) * 100.0)

    price_raw, _ = clean_numeric_series(work[cols["price"]])
    price_valid = price_raw.dropna()
    if len(price_valid) < 2:
        inverse_dispersion = 50.0
    else:
        mean_price = float(price_valid.mean())
        cv = float(price_valid.std() / abs(mean_price)) if mean_price != 0 else 0.0
        dispersion = clamp_score(min(cv * 100.0, 100.0))
        inverse_dispersion = clamp_score(100.0 - dispersion)

    score = clamp_score(
        _WEIGHTS["seller_density"] * seller_density
        + _WEIGHTS["revenue_fragmentation"] * fragmentation
        + _WEIGHTS["inverse_price_dispersion"] * inverse_dispersion
    )
    risk = classify_low_medium_high(score)

    return {
        "status": "success",
        "score": score,
        "risk": risk,
        "classification": risk,
        "columns_used": [cols["price"], cols["revenue"], cols["active_sellers"]],
        "formula_used": (
            "MCR = 0.4 x Seller Density + 0.3 x (1-HHI) + 0.3 x Inverse Price Dispersion; "
            "HHI = sum(MarketShare^2)"
        ),
        "hhi": round(hhi, 4),
        "revenue_fragmentation": fragmentation,
        "mini_insight": (
            f"Margin compression risk is {risk.lower()} ({clamp_score(score)}/100) "
            "based on seller density, revenue fragmentation, and price clustering."
        ),
        "numeric_columns_cleaned": numeric_cols_cleaned,
    }
