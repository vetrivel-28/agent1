from __future__ import annotations

import time
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("hhi_engine")

_BRAND_CANDIDATES = ["Brand", "Seller"]
_REVENUE_CANDIDATES = ["ASIN Revenue", "Revenue", "Parent Level Revenue", "Monthly Revenue"]


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _concentration_score(hhi: float) -> float:
    """Convert HHI (0-10000) to a 0-100 concentration score."""
    return round((hhi / 10_000.0) * 100.0, 2)


def _concentration_classification(score: float) -> str:
    """Numeric-only label for the concentration score bar — not used as market label."""
    if score <= 20:
        return "Low Concentration"
    elif score <= 40:
        return "Moderate Concentration"
    elif score <= 60:
        return "High Concentration"
    elif score <= 80:
        return "Very High Concentration"
    else:
        return "Extreme Concentration"


def _market_structure(hhi: float) -> str:
    """Single source of truth for market structure label — driven by HHI."""
    if hhi < 1500:
        return "Fragmented"
    elif hhi <= 2500:
        return "Moderately Concentrated"
    elif hhi <= 4000:
        return "Concentrated"
    else:
        return "Highly Dominated"


def _market_shape(largest_share: float, top3_share: float, hhi: float, long_tail_share: float) -> str:
    """Intuitive market shape label for executive readability."""
    if largest_share > 40:
        return "Leader Dominated"
    elif top3_share > 70:
        return "Oligopoly"
    elif hhi < 1500:
        return "Fragmented Market"
    elif long_tail_share > 40:
        return "Open Market"
    else:
        return "Competitive Market"


def _entry_difficulty_score(
    concentration_score: float,
    top5_share: float,
    total_revenue: float,
    total_brands: int,
    total_products: int,
) -> float:
    """
    Entry Difficulty Score (0-100).
    40% Concentration Score
    30% Top-5 Market Share (normalised to 0-100)
    20% Revenue Density  (log-normalised proxy)
    10% Active Brand Density (inverse — more brands = harder)
    """
    top5_component = min(top5_share, 100.0)  # already 0-100 pct

    # Revenue density: log scale, cap at 100
    rev_density_raw = np.log1p(total_revenue / max(total_brands, 1))
    rev_density = min(rev_density_raw / np.log1p(1_000_000) * 100.0, 100.0)

    # Brand density: more brands → harder to stand out (normalise 0-100)
    brand_density = min(total_brands / 200.0 * 100.0, 100.0)

    score = (
        0.40 * concentration_score
        + 0.30 * top5_component
        + 0.20 * rev_density
        + 0.10 * brand_density
    )
    return round(min(max(score, 0.0), 100.0), 2)


def _entry_difficulty_classification(score: float) -> str:
    if score <= 25:
        return "Easy Entry"
    elif score <= 50:
        return "Moderate Entry"
    elif score <= 75:
        return "Difficult Entry"
    else:
        return "Highly Defended Market"


def _dominant_player_risk(largest_share_pct: float) -> str:
    if largest_share_pct < 20:
        return "Low Risk"
    elif largest_share_pct < 35:
        return "Moderate Risk"
    elif largest_share_pct < 50:
        return "High Risk"
    else:
        return "Extreme Risk"


def _brand_tier(share_pct: float) -> str:
    if share_pct > 20:
        return "Market Leader"
    elif share_pct >= 10:
        return "Major Player"
    elif share_pct >= 5:
        return "Strong Challenger"
    elif share_pct >= 1:
        return "Emerging Player"
    else:
        return "Long Tail"


def _competitive_position(rank: int, share_pct: float) -> str:
    if rank == 1:
        return "Category Dominant"
    elif rank <= 3:
        return "Top Competitor"
    elif rank <= 5:
        return "Strong Contender"
    elif share_pct >= 5:
        return "Active Challenger"
    elif share_pct >= 1:
        return "Niche Player"
    else:
        return "Fringe Participant"


def _generate_insights(
    hhi: float,
    market_structure: str,
    market_shape: str,
    top3_share: float,
    top5_share: float,
    largest_brand: str,
    largest_share: float,
    entry_difficulty: float,
    entry_class: str,
    accessibility_score: float,
    accessibility_class: str,
    dominant_risk: str,
    total_brands: int,
) -> list[dict]:
    """
    Returns structured insights grouped by category:
    key_finding, market_structure, entry_conditions, opportunity, risk
    """
    insights = []

    # KEY FINDING — dominant player
    if largest_share > 0:
        insights.append({
            "category": "Key Finding",
            "text": (
                f"{largest_brand} controls {largest_share:.1f}% of category revenue "
                f"and is the {market_shape.lower()} market leader."
            ),
        })

    # MARKET STRUCTURE
    insights.append({
        "category": "Market Structure",
        "text": (
            f"The market is {market_structure.lower()} (HHI {hhi:,.0f}). "
            f"The top three brands collectively control {top3_share:.1f}% of total revenue."
        ),
    })

    # ENTRY CONDITIONS
    if entry_difficulty >= 75:
        entry_text = (
            "Entry barriers are very high. Established players hold deep market penetration "
            "and revenue concentration makes displacement difficult."
        )
    elif entry_difficulty >= 50:
        entry_text = (
            "Entry barriers are elevated due to concentrated revenue ownership. "
            "Differentiated positioning is essential for new entrants."
        )
    elif entry_difficulty >= 25:
        entry_text = (
            "Entry barriers are moderate. The market is accessible but competitive. "
            "A clear value proposition is needed to gain traction."
        )
    else:
        entry_text = (
            "Entry barriers are low. The market is fragmented and accessible to new entrants "
            "with limited incumbent advantage."
        )
    insights.append({"category": "Entry Conditions", "text": entry_text})

    # OPPORTUNITY
    if accessibility_score >= 75:
        opp_text = (
            "Significant whitespace remains. The fragmented structure favours new entrants "
            "with strong product differentiation and targeted positioning."
        )
    elif accessibility_score >= 50:
        opp_text = (
            "Accessible whitespace remains in niche and underserved segments. "
            "Targeting specific price tiers or use cases can yield meaningful share."
        )
    else:
        opp_text = (
            "Limited whitespace for undifferentiated entry. Superior product quality "
            "or niche positioning is required to compete effectively."
        )
    insights.append({"category": "Opportunity", "text": opp_text})

    # RISK
    if dominant_risk == "Extreme Risk":
        risk_text = (
            f"The market exhibits extreme dependency on {largest_brand} ({largest_share:.1f}%). "
            "Any disruption to this player would significantly reshape the competitive landscape."
        )
    elif dominant_risk == "High Risk":
        risk_text = (
            f"The market exhibits high dependency on a single dominant player ({largest_brand}, "
            f"{largest_share:.1f}%). Competitive strategy should account for this concentration risk."
        )
    elif dominant_risk == "Moderate Risk":
        risk_text = (
            f"{largest_brand} holds a meaningful lead at {largest_share:.1f}% but the market "
            "is not fully dependent on a single player."
        )
    else:
        risk_text = (
            "No single brand dominates the market. Competitive risk is distributed across "
            "multiple players, reducing dependency on any one participant."
        )
    insights.append({"category": "Risk", "text": risk_text})

    return insights


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------

def run(blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()

    rows_before_cleaning = len(blackbox_df) if blackbox_df is not None else 0
    if blackbox_df is None or blackbox_df.empty:
        return _error_response("BlackBox dataset is required.", [], [], t0, rows_before_cleaning)

    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)

    if brand_col is None or revenue_col is None:
        return _error_response(
            "Required Brand or ASIN Revenue columns are missing.",
            ["blackbox"],
            [c for c in [brand_col, revenue_col] if c],
            t0,
            rows_before_cleaning,
        )

    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip()
    work["revenue"], _ = clean_numeric_series(blackbox_df[revenue_col], revenue_col)
    work = work.dropna(subset=["revenue"])
    work = work[work["brand"] != ""]

    if work.empty:
        return _error_response(
            "No valid brand revenue rows after cleaning.",
            ["blackbox"],
            [brand_col, revenue_col],
            t0,
            rows_before_cleaning,
        )

    brand_revenue = work.groupby("brand", as_index=False, sort=False)["revenue"].sum()
    total_revenue = float(brand_revenue["revenue"].sum())
    total_products = int(work.shape[0])

    if total_revenue == 0:
        return _error_response(
            "Total market revenue is zero after cleaning.",
            ["blackbox"],
            [brand_col, revenue_col],
            t0,
            rows_before_cleaning,
        )

    # Core calculations
    brand_revenue["market_share_pct"] = brand_revenue["revenue"] / total_revenue * 100.0
    brand_revenue["hhi_component"] = np.square(brand_revenue["market_share_pct"])
    hhi_score = float(brand_revenue["hhi_component"].sum())

    brand_revenue_sorted = brand_revenue.sort_values("market_share_pct", ascending=False).reset_index(drop=True)
    total_brands = int(brand_revenue_sorted.shape[0])

    # Derived scores
    conc_score = _concentration_score(hhi_score)
    conc_class = _concentration_classification(conc_score)
    market_structure = _market_structure(hhi_score)

    top3_share = float(brand_revenue_sorted["market_share_pct"].head(3).sum())
    top5_share = float(brand_revenue_sorted["market_share_pct"].head(5).sum())
    largest_share = float(brand_revenue_sorted["market_share_pct"].iloc[0]) if total_brands > 0 else 0.0
    largest_brand = str(brand_revenue_sorted["brand"].iloc[0]) if total_brands > 0 else "N/A"

    entry_diff = _entry_difficulty_score(conc_score, top5_share, total_revenue, total_brands, total_products)
    entry_class = _entry_difficulty_classification(entry_diff)
    market_accessibility_score = round(100.0 - entry_diff, 2)
    dominant_risk = _dominant_player_risk(largest_share)

    # Market accessibility classification
    if market_accessibility_score >= 75:
        accessibility_class = "Highly Accessible"
    elif market_accessibility_score >= 50:
        accessibility_class = "Moderately Accessible"
    elif market_accessibility_score >= 25:
        accessibility_class = "Difficult to Access"
    else:
        accessibility_class = "Highly Defended"

    # Long tail share (brands with < 1% share)
    long_tail_share = float(
        brand_revenue_sorted.loc[brand_revenue_sorted["market_share_pct"] < 1.0, "market_share_pct"].sum()
    )

    # Market shape
    market_shape = _market_shape(largest_share, top3_share, hhi_score, long_tail_share)

    # Build top brands list with enriched fields
    top_brands_list = []
    for rank_idx, row in brand_revenue_sorted.head(max(top_n, 15)).iterrows():
        rank = rank_idx + 1
        share = float(row["market_share_pct"])
        gap = round(share - largest_share, 2)  # negative for all non-leaders
        top_brands_list.append({
            "rank": rank,
            "brand": str(row["brand"]),
            "revenue": round(float(row["revenue"]), 2),
            "market_share_pct": round(share, 4),
            "hhi_component": round(float(row["hhi_component"]), 4),
            "tier": _brand_tier(share),
            "competitive_position": _competitive_position(rank, share),
            "gap_to_leader": gap if rank > 1 else None,
        })

    # Concentration distribution
    p25 = float(brand_revenue_sorted["market_share_pct"].quantile(0.25))
    p75 = float(brand_revenue_sorted["market_share_pct"].quantile(0.75))
    concentration_distribution = {
        "brands_below_p25_share": int((brand_revenue_sorted["market_share_pct"] <= p25).sum()),
        "brands_between_p25_p75_share": int(
            ((brand_revenue_sorted["market_share_pct"] > p25) & (brand_revenue_sorted["market_share_pct"] < p75)).sum()
        ),
        "brands_above_p75_share": int((brand_revenue_sorted["market_share_pct"] >= p75).sum()),
    }

    # Strategic insights
    insights = _generate_insights(
        hhi=hhi_score,
        market_structure=market_structure,
        market_shape=market_shape,
        top3_share=top3_share,
        top5_share=top5_share,
        largest_brand=largest_brand,
        largest_share=largest_share,
        entry_difficulty=entry_diff,
        entry_class=entry_class,
        accessibility_score=market_accessibility_score,
        accessibility_class=accessibility_class,
        dominant_risk=dominant_risk,
        total_brands=total_brands,
    )

    rows_after_cleaning = int(work.shape[0])
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)

    return {
        "status": "success",
        "metric_name": "Market Concentration Index (HHI)",
        "summary": (
            f"HHI {hhi_score:,.0f} — {market_structure} ({market_shape}). "
            f"Concentration Score: {conc_score}/100. "
            f"Entry Difficulty: {entry_diff}/100 ({entry_class}). "
            f"Market Accessibility: {market_accessibility_score}/100 ({accessibility_class})."
        ),
        "datasets_used": ["blackbox"],
        "columns_used": [brand_col, revenue_col],
        "formula_used": (
            "Concentration Score = (HHI / 10000) × 100; "
            "Entry Difficulty = 40%×Concentration + 30%×Top5Share + 20%×RevDensity + 10%×BrandDensity; "
            "Market Accessibility = 100 − Entry Difficulty."
        ),
        "results": {
            # Core HHI
            "hhi_score": round(hhi_score, 2),
            "hhi_normalized_score": round(min(hhi_score / 100.0, 100.0), 2),  # backward compat
            "market_structure_type": market_structure,  # backward compat

            # Concentration
            "concentration_score": conc_score,
            "concentration_classification": conc_class,
            "market_structure": market_structure,
            "market_shape": market_shape,

            # Control metrics
            "top_3_share": round(top3_share, 2),
            "top_5_share": round(top5_share, 2),

            # Entry & accessibility
            "entry_difficulty_score": entry_diff,
            "entry_difficulty_classification": entry_class,
            "market_accessibility_score": market_accessibility_score,
            "market_accessibility_classification": accessibility_class,

            # Backward-compat aliases
            "opportunity_score": market_accessibility_score,
            "opportunity_classification": accessibility_class,

            # Dominant player risk
            "dominant_player_risk": dominant_risk,
            "largest_brand_share": round(largest_share, 2),
            "largest_brand_name": largest_brand,
            "market_leader_name": largest_brand,
            "market_leader_share": round(largest_share, 2),

            # Brand table
            "top_brands_by_market_share": top_brands_list,

            # Supporting data
            "concentration_distribution": concentration_distribution,
            "fragmentation_analysis": {
                "total_brands": total_brands,
                "total_market_revenue": round(total_revenue, 2),
                "largest_brand_share_pct": round(largest_share, 4),
            },

            # Strategic insights (structured)
            "strategic_insights": insights,
        },
        "validation": {
            "rows_before_cleaning": rows_before_cleaning,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": [revenue_col],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }


def _error_response(
    message: str,
    datasets_used: list,
    columns_used: list,
    t0: float,
    rows_before: int,
) -> Dict[str, Any]:
    return {
        "status": "warning",
        "message": message,
        "metric_name": "Market Concentration Index (HHI)",
        "summary": message,
        "datasets_used": datasets_used,
        "columns_used": columns_used,
        "formula_used": "",
        "results": {},
        "validation": {
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning": 0,
            "rows_skipped": rows_before,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
