"""Advertising Pressure Index — visibility acquisition cost from keyword data.

Requires at least ONE of: H10 PPC Sugg. Bid, Competing Products, CPR, Title Density.
Uses only columns that are found in the dataset.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.analytics.finance._utils import (
    capital_requirement_from_pressure,
    classify_low_medium_high,
    clamp_score,
    insufficient_metric,
    percentile_clip_and_scale,
)
from app.utils.column_mapper import find_column
from app.utils.dataframe_checks import is_empty_dataframe
from app.utils.numeric_cleaner import clean_numeric_series

_PPC_BID_CANDIDATES = [
    "H10 PPC Sugg. Bid", "h10 ppc sugg. bid", "PPC Sugg. Bid", "ppc sugg. bid",
    "Suggested PPC Bid", "suggested ppc bid",
    "H10 PPC Sugg. Min Bid", "H10 PPC Sugg. Max Bid",
]
_SPONSORED_CANDIDATES = [
    "Sponsored ASINs", "sponsored asins", "Sponsored ASIN Count",
]
_CPR_CANDIDATES = ["CPR", "cpr", "Cost Per Result"]
_COMPETING_CANDIDATES = [
    "Competing Products", "competing products", "Competing products",
]
_TITLE_DENSITY_CANDIDATES = [
    "Title Density", "title density", "TitleDensity",
]
_SEARCH_VOL_CANDIDATES = [
    "Search Volume", "search volume",
]

# Preferred weights when all available
_WEIGHTS = {
    "sponsored_density": 0.40,
    "ppc_bid": 0.40,
    "competition": 0.20,
}


def compute_advertising_pressure(
    magnet_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    if is_empty_dataframe(magnet_df):
        return insufficient_metric(
            "advertising_pressure",
            ["H10 PPC Sugg. Bid", "Sponsored ASINs", "Competing Products"],
            ["magnet"],
        )

    assert magnet_df is not None

    ppc_col = find_column(magnet_df, _PPC_BID_CANDIDATES)
    sponsored_col = find_column(magnet_df, _SPONSORED_CANDIDATES)
    cpr_col = find_column(magnet_df, _CPR_CANDIDATES)
    competing_col = find_column(magnet_df, _COMPETING_CANDIDATES)
    title_col = find_column(magnet_df, _TITLE_DENSITY_CANDIDATES)
    sv_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)

    # Build search-volume weights for weighted average
    sv_weights: Optional[pd.Series] = None
    if sv_col:
        sv_raw = pd.to_numeric(magnet_df[sv_col], errors="coerce").fillna(0)
        sv_total = float(sv_raw.sum())
        if sv_total > 0:
            sv_weights = sv_raw / sv_total

    columns_used: List[str] = []
    missing_columns: List[str] = []
    component_scores: Dict[str, float] = {}
    evidence: Dict[str, Any] = {}

    def _weighted_median(col: str) -> Optional[float]:
        series = pd.to_numeric(magnet_df[col], errors="coerce").dropna()
        if series.empty:
            return None
        scaled = percentile_clip_and_scale(series, invert=False)
        if sv_weights is not None:
            valid_idx = scaled.dropna().index
            w = sv_weights.reindex(valid_idx).fillna(0)
            w_total = float(w.sum())
            if w_total > 0:
                return clamp_score(float((scaled.loc[valid_idx] * w).sum() / w_total))
        return clamp_score(float(scaled.median()))

    # --- Sponsored ASIN density (primary: 40%) ---
    if sponsored_col:
        val = _weighted_median(sponsored_col)
        if val is not None:
            component_scores["sponsored_density"] = val
            columns_used.append(sponsored_col)
            avg_val = float(pd.to_numeric(magnet_df[sponsored_col], errors="coerce").dropna().mean())
            evidence["sponsored_asins"] = {
                "column": sponsored_col,
                "avg_value": round(avg_val, 2),
                "normalized_score": val,
                "weight": _WEIGHTS["sponsored_density"],
                "interpretation": f"Average {avg_val:.1f} sponsored ASINs per keyword",
            }
        else:
            missing_columns.append("Sponsored ASINs")
    else:
        missing_columns.append("Sponsored ASINs")

    # --- PPC bid pressure (primary: 40%) ---
    if ppc_col:
        val = _weighted_median(ppc_col)
        if val is not None:
            component_scores["ppc_bid"] = val
            columns_used.append(ppc_col)
            avg_val = float(pd.to_numeric(magnet_df[ppc_col], errors="coerce").dropna().mean())
            evidence["ppc_bid"] = {
                "column": ppc_col,
                "avg_value": round(avg_val, 4),
                "normalized_score": val,
                "weight": _WEIGHTS["ppc_bid"],
                "interpretation": f"Average PPC bid ${avg_val:.2f}",
            }
        else:
            missing_columns.append("H10 PPC Sugg. Bid")
    elif cpr_col:
        val = _weighted_median(cpr_col)
        if val is not None:
            component_scores["ppc_bid"] = val
            columns_used.append(cpr_col)
            avg_val = float(pd.to_numeric(magnet_df[cpr_col], errors="coerce").dropna().mean())
            evidence["cpr"] = {
                "column": cpr_col,
                "avg_value": round(avg_val, 4),
                "normalized_score": val,
                "weight": _WEIGHTS["ppc_bid"],
                "interpretation": f"Average CPR {avg_val:.1f} (proxy for bid pressure)",
            }
        else:
            missing_columns.append("H10 PPC Sugg. Bid / CPR")
    else:
        missing_columns.append("H10 PPC Sugg. Bid")

    # --- Competition density (20%) ---
    comp_col_used = competing_col or title_col
    if comp_col_used:
        val = _weighted_median(comp_col_used)
        if val is not None:
            component_scores["competition"] = val
            columns_used.append(comp_col_used)
            avg_val = float(pd.to_numeric(magnet_df[comp_col_used], errors="coerce").dropna().mean())
            evidence["competition"] = {
                "column": comp_col_used,
                "avg_value": round(avg_val, 2),
                "normalized_score": val,
                "weight": _WEIGHTS["competition"],
                "interpretation": f"Average {comp_col_used} = {avg_val:.1f}",
            }
        else:
            missing_columns.append("Competing Products")
    else:
        missing_columns.append("Competing Products")

    if not component_scores:
        return insufficient_metric(
            "advertising_pressure",
            missing_columns,
            ["magnet"],
        )

    # --- Re-normalize weights for available components ---
    total_weight = sum(_WEIGHTS.get(k, 0) for k in component_scores)
    if total_weight == 0:
        total_weight = 1.0
    score = clamp_score(
        sum(component_scores[k] * _WEIGHTS.get(k, 0) / total_weight for k in component_scores)
    )

    classification = classify_low_medium_high(score)
    columns_used = list(dict.fromkeys(columns_used))

    return {
        "status": "success",
        "score": score,
        "classification": classification,
        "capital_requirement": capital_requirement_from_pressure(classification),
        "columns_used": columns_used,
        "missing_columns": missing_columns,
        "formula_used": (
            "Advertising Pressure = weighted average of available signals: "
            "Sponsored ASIN Density × 40% + PPC Bid Pressure × 40% + Competition Score × 20%. "
            "Only columns found in the dataset are included; weights re-normalized accordingly. "
            "Signals are search-volume weighted where available, then percentile-normalized (5th-95th)."
        ),
        "component_scores": component_scores,
        "evidence": evidence,
        "mini_insight": (
            f"Advertising pressure is {classification.lower()} ({score:.0f}/100). "
            f"Based on {len(component_scores)} of 3 signal components. "
            + (f"Missing: {', '.join(missing_columns)}." if missing_columns else "")
        ),
    }
