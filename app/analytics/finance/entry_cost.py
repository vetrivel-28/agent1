"""
Entry Difficulty & Entry Cost Index — robust percentile-based market entry scoring.

Entry Difficulty (7-component weighted score):
- CPR burden: 25%
- Sponsored ASIN pressure: 15%
- Competing product density: 15%
- Review barrier: 15%
- Organic title density: 10%
- Revenue concentration / competitor dominance: 10%
- PPC bid pressure: 10%

Entry Cost Index (5-component weighted score):
- CPR burden: 30%
- PPC bid pressure: 25%
- Sponsored ASIN pressure: 20%
- Review barrier: 15%
- Competition density: 10%

Uses percentile-based normalization (5th–95th clip) with proper missing-data handling.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.analytics.finance._utils import (
    classify_pressure_level,
    clamp_score,
    insufficient_metric,
    percentile_clip_and_scale,
)
from app.utils.column_mapper import find_column
from app.utils.dataframe_checks import is_empty_dataframe
from app.utils.numeric_cleaner import clean_numeric_series

# Column candidates for each metric
_CPR_CANDIDATES = ["CPR", "cpr", "Cost Per Result"]
_SPONSORED_CANDIDATES = ["Sponsored ASINs", "sponsored asins", "Sponsored ASIN Count", "sponsored asin"]
_COMPETING_CANDIDATES = ["Competing Products", "competing products"]
_TITLE_DENSITY_CANDIDATES = ["Title Density", "title density", "TitleDensity"]
_PPC_BID_CANDIDATES = [
    "H10 PPC Sugg. Bid", "h10 ppc sugg. bid",
    "PPC Sugg. Bid", "ppc sugg. bid",
    "Suggested PPC Bid", "suggested ppc bid",
]
_PPC_MIN_BID_CANDIDATES = [
    "H10 PPC Sugg. Min Bid", "h10 ppc sugg. min bid",
    "PPC Min Bid", "ppc min bid",
]
_PPC_MAX_BID_CANDIDATES = [
    "H10 PPC Sugg. Max Bid", "h10 ppc sugg. max bid",
    "PPC Max Bid", "ppc max bid",
]
_SEARCH_VOLUME_CANDIDATES = ["Search Volume", "search volume"]
_KEYWORD_SALES_CANDIDATES = ["Keyword Sales", "keyword sales"]

# BlackBox column candidates
_REVIEW_COUNT_CANDIDATES = ["Review Count", "review count", "Number of Reviews"]
_BSR_CANDIDATES = ["BSR", "bsr", "Best Seller Rank"]
_ASIN_REVENUE_CANDIDATES = ["ASIN Revenue", "asin revenue", "Revenue"]
_PARENT_REVENUE_CANDIDATES = ["Parent Level Revenue", "parent level revenue"]
_PRICE_CANDIDATES = ["Price", "price"]
_SALES_TREND_CANDIDATES = ["Sales Trend (90 days) (%)", "sales trend (90 days) (%)"]


def _compute_component_scores(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    """
    Compute individual component scores with percentile-based normalization.
    Returns dict of component scores and metadata about missing data.
    """
    components = {}
    missing_components = []

    # CPR burden (higher CPR = higher cost = higher barrier)
    if magnet_df is not None and len(magnet_df) > 0:
        cpr_col = find_column(magnet_df, _CPR_CANDIDATES)
        if cpr_col:
            cpr_series = pd.to_numeric(magnet_df[cpr_col], errors="coerce").dropna()
            if not cpr_series.empty:
                components["cpr_burden"] = {
                    "score": clamp_score(float(percentile_clip_and_scale(cpr_series, invert=False).median())),
                    "column": cpr_col,
                    "samples": len(cpr_series),
                }
            else:
                missing_components.append("CPR")
        else:
            missing_components.append("CPR")
    else:
        missing_components.append("CPR")

    # Sponsored ASIN pressure (higher count = more sponsored competition = higher barrier)
    if magnet_df is not None and len(magnet_df) > 0:
        sponsored_col = find_column(magnet_df, _SPONSORED_CANDIDATES)
        if sponsored_col:
            sponsored_series = pd.to_numeric(magnet_df[sponsored_col], errors="coerce").dropna()
            if not sponsored_series.empty:
                components["sponsored_pressure"] = {
                    "score": clamp_score(float(percentile_clip_and_scale(sponsored_series, invert=False).median())),
                    "column": sponsored_col,
                    "samples": len(sponsored_series),
                }
            else:
                missing_components.append("Sponsored ASINs")
        else:
            missing_components.append("Sponsored ASINs")
    else:
        missing_components.append("Sponsored ASINs")

    # Competing product density
    if magnet_df is not None and len(magnet_df) > 0:
        competing_col = find_column(magnet_df, _COMPETING_CANDIDATES)
        if competing_col:
            competing_series = pd.to_numeric(magnet_df[competing_col], errors="coerce").dropna()
            if not competing_series.empty:
                components["competition_density"] = {
                    "score": clamp_score(float(percentile_clip_and_scale(competing_series, invert=False).median())),
                    "column": competing_col,
                    "samples": len(competing_series),
                }
            else:
                missing_components.append("Competing Products")
        else:
            missing_components.append("Competing Products")
    else:
        missing_components.append("Competing Products")

    # Organic title density (higher = more competition in organic search)
    if magnet_df is not None and len(magnet_df) > 0:
        title_col = find_column(magnet_df, _TITLE_DENSITY_CANDIDATES)
        if title_col:
            title_series = pd.to_numeric(magnet_df[title_col], errors="coerce").dropna()
            if not title_series.empty:
                components["title_density"] = {
                    "score": clamp_score(float(percentile_clip_and_scale(title_series, invert=False).median())),
                    "column": title_col,
                    "samples": len(title_series),
                }
            else:
                missing_components.append("Organic Title Density")
        else:
            missing_components.append("Organic Title Density")
    else:
        missing_components.append("Organic Title Density")

    # PPC bid pressure (higher bid = more expensive visibility)
    if magnet_df is not None and len(magnet_df) > 0:
        ppc_col = find_column(magnet_df, _PPC_BID_CANDIDATES)
        if ppc_col:
            ppc_series = pd.to_numeric(magnet_df[ppc_col], errors="coerce").dropna()
            if not ppc_series.empty:
                components["ppc_bid_pressure"] = {
                    "score": clamp_score(float(percentile_clip_and_scale(ppc_series, invert=False).median())),
                    "column": ppc_col,
                    "samples": len(ppc_series),
                }
            else:
                missing_components.append("PPC Bid Pressure")
        else:
            missing_components.append("PPC Bid Pressure")
    else:
        missing_components.append("PPC Bid Pressure")

    # Review barrier (higher review count = harder to compete)
    if blackbox_df is not None and len(blackbox_df) > 0:
        review_col = find_column(blackbox_df, _REVIEW_COUNT_CANDIDATES)
        if review_col:
            review_series = pd.to_numeric(blackbox_df[review_col], errors="coerce").dropna()
            if not review_series.empty:
                components["review_barrier"] = {
                    "score": clamp_score(float(percentile_clip_and_scale(review_series, invert=False).median())),
                    "column": review_col,
                    "samples": len(review_series),
                }
            else:
                missing_components.append("Review Barrier")
        else:
            missing_components.append("Review Barrier")
    else:
        missing_components.append("Review Barrier")

    # Revenue concentration (higher parent revenue = harder to displace)
    if blackbox_df is not None and len(blackbox_df) > 0:
        parent_rev_col = find_column(blackbox_df, _PARENT_REVENUE_CANDIDATES)
        if parent_rev_col:
            parent_rev_series = pd.to_numeric(blackbox_df[parent_rev_col], errors="coerce").dropna()
            if not parent_rev_series.empty:
                components["revenue_concentration"] = {
                    "score": clamp_score(float(percentile_clip_and_scale(parent_rev_series, invert=False).median())),
                    "column": parent_rev_col,
                    "samples": len(parent_rev_series),
                }
            else:
                missing_components.append("Revenue Concentration")
        else:
            missing_components.append("Revenue Concentration")
    else:
        missing_components.append("Revenue Concentration")

    return {
        "components": components,
        "missing_components": missing_components,
    }


def compute_entry_metrics(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    """
    Compute Entry Difficulty and Entry Cost Index using robust percentile-based scoring.
    Returns both metrics with component breakdown and missing-data transparency.
    """
    if is_empty_dataframe(magnet_df) and is_empty_dataframe(blackbox_df):
        return insufficient_metric(
            "entry_metrics",
            ["CPR", "Sponsored ASINs", "Competing Products", "Review Count", "PPC Bid"],
            ["magnet", "blackbox"],
        )

    # Compute all component scores
    component_data = _compute_component_scores(magnet_df, blackbox_df)
    components = component_data["components"]
    missing = component_data["missing_components"]

    # Entry Difficulty weights: CPR 25%, Sponsored 15%, Competition 15%, Review 15%, Title 10%, Revenue 10%, PPC 10%
    entry_difficulty_weights = {
        "cpr_burden": 0.25,
        "sponsored_pressure": 0.15,
        "competition_density": 0.15,
        "review_barrier": 0.15,
        "title_density": 0.10,
        "revenue_concentration": 0.10,
        "ppc_bid_pressure": 0.10,
    }

    # Entry Cost Index weights: CPR 30%, PPC 25%, Sponsored 20%, Review 15%, Competition 10%
    entry_cost_weights = {
        "cpr_burden": 0.30,
        "ppc_bid_pressure": 0.25,
        "sponsored_pressure": 0.20,
        "review_barrier": 0.15,
        "competition_density": 0.10,
    }

    # Calculate Entry Difficulty
    difficulty_sum = 0.0
    difficulty_weight_total = 0.0
    difficulty_used_components = []
    for key, weight in entry_difficulty_weights.items():
        if key in components:
            score = components[key]["score"]
            difficulty_sum += weight * score
            difficulty_weight_total += weight
            difficulty_used_components.append({
                "component": key.replace("_", " ").title(),
                "score": score,
                "weight": weight,
            })

    if difficulty_weight_total > 0:
        entry_difficulty = clamp_score(difficulty_sum / difficulty_weight_total)
        difficulty_status = "success"
    else:
        entry_difficulty = 0.0
        difficulty_status = "insufficient_data"

    # Calculate Entry Cost Index
    cost_sum = 0.0
    cost_weight_total = 0.0
    cost_used_components = []
    for key, weight in entry_cost_weights.items():
        if key in components:
            score = components[key]["score"]
            cost_sum += weight * score
            cost_weight_total += weight
            cost_used_components.append({
                "component": key.replace("_", " ").title(),
                "score": score,
                "weight": weight,
            })

    if cost_weight_total > 0:
        entry_cost_index = clamp_score(cost_sum / cost_weight_total)
        cost_status = "success"
    else:
        entry_cost_index = 0.0
        cost_status = "insufficient_data"

    # Build result
    result = {
        "status": "success" if difficulty_status == "success" or cost_status == "success" else "insufficient_data",
        "entry_difficulty": {
            "score": entry_difficulty,
            "classification": classify_pressure_level(entry_difficulty),
            "components": difficulty_used_components,
            "weight_denominator": difficulty_weight_total,
            "components_available": len(difficulty_used_components),
            "components_missing": [c for c in missing if c in ["CPR", "Sponsored ASINs", "Competing Products", "Review Barrier", "Organic Title Density", "Revenue Concentration", "PPC Bid"]],
        },
        "entry_cost_index": {
            "score": entry_cost_index,
            "classification": classify_pressure_level(entry_cost_index),
            "components": cost_used_components,
            "weight_denominator": cost_weight_total,
            "components_available": len(cost_used_components),
            "components_missing": [c for c in missing if c in ["CPR", "PPC Bid", "Sponsored ASINs", "Review Barrier", "Competing Products"]],
        },
        "all_component_scores": {k: v["score"] for k, v in components.items()},
        "components_metadata": components,
        "mini_insight": (
            f"Entry difficulty is {classify_pressure_level(entry_difficulty).lower()} ({entry_difficulty:.0f}/100); "
            f"entry cost index is {classify_pressure_level(entry_cost_index).lower()} ({entry_cost_index:.0f}/100). "
            f"Based on {len(difficulty_used_components)} available signals."
        ),
        "normalization_method": "Percentile-based (5th–95th clip) with robust winsorization",
    }

    return result


# Backward compatibility alias
compute_entry_cost = compute_entry_metrics
