"""
Report Builder Service
======================
Aggregates results from all four engines into a structured
business intelligence report.

Output formats:
  - Structured JSON (primary)
  - Markdown narrative (included in JSON)
  - HTML-ready (future: wrap markdown in template)

LLM usage: NOT used here. All text is generated deterministically
from dataset-driven engine outputs only.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import pandas as pd

from app.utils.logger import get_logger

logger = get_logger("report_builder")

_PILLAR_WEIGHTS = {
    "demand": 0.35,
    "momentum": 0.15,
    "competition": 0.15,
    "opportunity": 0.15,
    "finance": 0.20,
}


def _weighted_pillar_score(pillar_scores: Dict[str, Optional[float]]) -> float:
    """Weighted pillar mean with re-normalization when pillars are unavailable."""
    total = 0.0
    weight_sum = 0.0
    for key, base_weight in _PILLAR_WEIGHTS.items():
        value = pillar_scores.get(key)
        if value is None:
            continue
        total += base_weight * float(value)
        weight_sum += base_weight
    return round(total / weight_sum, 2) if weight_sum > 0 else 0.0


def _market_rating(score: float) -> str:
    if score >= 70:
        return "Strong"
    if score >= 45:
        return "Moderate"
    return "Weak"


def _launch_recommendation_from_score(score: float, quadrant: str = "") -> str:
    if quadrant == "Launch Candidate":
        return "Proceed with launch planning — demand and economics align."
    if quadrant == "Niche Opportunity":
        return "Pursue niche positioning with focused SKU strategy."
    if quadrant == "Difficult Economics":
        return "Defer broad launch until unit economics improve."
    if quadrant == "Avoid":
        return "Do not launch — reassess category selection."
    if score >= 70:
        return "Proceed with structured market entry."
    if score >= 45:
        return "Pilot launch with tight capital controls."
    return "Hold entry — strengthen fundamentals first."


def _match_expected_columns(columns: List[str], expected_columns: List[str]) -> List[str]:
    normalized = [str(c).lower() for c in columns]
    return [expected for expected in expected_columns if any(expected.lower() in col for col in normalized)]


def _dataset_diagnostics(df: Any, expected_columns: List[str], dataset_label: str) -> Dict[str, Any]:
    if df is None:
        return {
            "dataset_name": dataset_label,
            "available": False,
            "row_count": 0,
            "column_count": 0,
            "detected_type": dataset_label,
            "key_columns_found": [],
            "missing_expected_columns": expected_columns,
            "duplicate_rows_removed": 0,
            "blank_rows_removed": 0,
        }

    columns = list(df.columns) if hasattr(df, "columns") else []
    row_count = len(df)
    duplicate_rows_removed = max(0, row_count - len(df.drop_duplicates())) if hasattr(df, "drop_duplicates") else 0
    blank_rows_removed = int(df.isna().all(axis=1).sum()) if hasattr(df, "isna") else 0
    key_columns_found = _match_expected_columns(columns, expected_columns)
    missing_expected_columns = [c for c in expected_columns if c not in key_columns_found]

    return {
        "dataset_name": dataset_label,
        "available": True,
        "row_count": row_count,
        "column_count": len(columns),
        "detected_type": dataset_label,
        "key_columns_found": key_columns_found,
        "missing_expected_columns": missing_expected_columns,
        "duplicate_rows_removed": duplicate_rows_removed,
        "blank_rows_removed": blank_rows_removed,
    }


def build_report(
    demand_result: Dict[str, Any],
    sales_result: Dict[str, Any],
    revenue_result: Dict[str, Any],
    bsr_result: Dict[str, Any],
    siei_result: Optional[Dict[str, Any]] = None,
    whitespace_result: Optional[Dict[str, Any]] = None,
    direct_comp_result: Optional[Dict[str, Any]] = None,
    price_elasticity_result: Optional[Dict[str, Any]] = None,
    hhi_result: Optional[Dict[str, Any]] = None,
    demand_vel_result: Optional[Dict[str, Any]] = None,
    substitute_result: Optional[Dict[str, Any]] = None,
    complement_result: Optional[Dict[str, Any]] = None,
    bundle_result: Optional[Dict[str, Any]] = None,
    finance_result: Optional[Dict[str, Any]] = None,
    blackbox_df: Any = None,
    magnet_df: Any = None,
    top_n: int = 10,
) -> Dict[str, Any]:
    """
    Aggregate all engine results into a market intelligence report.

    Parameters
    ----------
    demand_result   : Output from demand_engine.run()
    sales_result    : Output from sales_momentum_engine.run()
    revenue_result  : Output from revenue_momentum_engine.run()
    bsr_result      : Output from bsr_efficiency_engine.run()
    top_n           : Number of top items per section

    Returns
    -------
    Structured report dict matching MarketReportResult schema.
    """
    t0 = time.time()
    logger.info("Building market report from engine outputs")

    # -----------------------------------------------------------------------
    # Extract key metrics safely
    # -----------------------------------------------------------------------
    demand_score     = (
        _get(demand_result, "results", "market_demand_index")
        or _get(demand_result, "results", "overall_demand_score")
        or 0.0
    )
    sales_score      = _get(sales_result,   "results", "market_mean_score")    or 0.0
    revenue_score    = _get(revenue_result, "results", "market_mean_score")    or 0.0
    bsr_score        = _get(bsr_result,     "results", "market_efficiency_score") or 0.0

    finance_health_score = _get(finance_result, "results", "finance_health", "finance_health") or 0.0
    whitespace_score = _get(whitespace_result, "results", "overall_whitespace_score") or 0.0
    hhi_score = _get(hhi_result, "results", "hhi_score")
    competition_score = 0.0
    if hhi_result and hhi_result.get("status") == "success" and hhi_score is not None:
        competition_score = round(max(0.0, min(100.0, 100.0 - float(hhi_score))), 2)
    momentum_score = round((float(sales_score) + float(revenue_score)) / 2.0, 2)
    opportunity_score = float(whitespace_score) if whitespace_score else round(
        (_get(whitespace_result, "results", "market_whitespace_score") or 0.0), 2
    )
    demand_status  = demand_result.get("status",  "error")
    sales_status   = sales_result.get("status",   "error")
    revenue_status = revenue_result.get("status", "error")
    bsr_status     = bsr_result.get("status",     "error")

    engines_ok = [
        s for s in [demand_status, sales_status, revenue_status, bsr_status]
        if s == "success"
    ]

    # -----------------------------------------------------------------------
    # Final market score (weighted across intelligence pillars)
    # -----------------------------------------------------------------------
    pillar_scores: Dict[str, Optional[float]] = {
        "demand": float(demand_score) if demand_status == "success" else None,
        "momentum": momentum_score if sales_status == "success" or revenue_status == "success" else None,
        "competition": competition_score if competition_score > 0 else None,
        "opportunity": opportunity_score if opportunity_score > 0 else None,
        "finance": (
            float(finance_health_score)
            if finance_result
            and finance_result.get("results", {}).get("finance_health", {}).get("status") == "success"
            else None
        ),
    }
    composite_score = _weighted_pillar_score(pillar_scores)

    available_scores = [
        float(s) for s in [demand_score, sales_score, revenue_score, bsr_score]
        if s is not None and not isinstance(s, str)
    ]

    # -----------------------------------------------------------------------
    # Rankings
    # -----------------------------------------------------------------------
    top_demand_keywords = _get(demand_result, "results", "top_demand_keywords") or []
    top_demand_products = _get(demand_result, "results", "top_demand_products") or []
    fastest_brands      = _get(sales_result,  "results", "fastest_growing_brands") or []
    declining_brands    = _get(sales_result,  "results", "declining_brands") or []
    top_rev_brands      = _get(revenue_result,"results", "momentum_leaders") or _get(revenue_result,"results", "top_revenue_growth_brands") or []
    declining_rev       = _get(revenue_result,"results", "momentum_laggards") or _get(revenue_result,"results", "declining_revenue_brands") or []
    efficient_products  = _get(bsr_result,    "results", "efficient_products") or []
    inefficient_products= _get(bsr_result,    "results", "inefficient_products") or []

    total_market_revenue = _get(revenue_result, "results", "total_market_revenue") or 0.0
    total_products       = _get(bsr_result,     "results", "total_products_analysed") or 0
    total_brands         = _get(sales_result,   "results", "total_brands_analysed") or 0

    # -----------------------------------------------------------------------
    # Opportunity findings (data-driven, no hallucination)
    # -----------------------------------------------------------------------
    opportunities: List[str] = []

    if demand_score < 30 and bsr_score < 40:
        opportunities.append(
            "Low demand score combined with low BSR efficiency suggests an "
            "underserved market with room for a well-positioned entrant."
        )
    if fastest_brands:
        top_brand = fastest_brands[0].get("brand", "")
        top_score = fastest_brands[0].get("momentum_score", 0)
        if top_brand:
            opportunities.append(
                f"Brand '{top_brand}' leads sales momentum "
                f"(score {top_score}/100) — study their positioning strategy."
            )
    if efficient_products:
        top_prod = efficient_products[0]
        asin = top_prod.get("asin", "")
        eff  = top_prod.get("efficiency_score", 0)
        if asin:
            opportunities.append(
                f"ASIN {asin} achieves the highest BSR efficiency score "
                f"({eff}/100) — benchmark its listing and pricing."
            )
    if top_demand_keywords:
        kw = top_demand_keywords[0].get("keyword", "")
        sv = top_demand_keywords[0].get("search_volume", 0)
        if kw:
            opportunities.append(
                f"Keyword '{kw}' has the highest search volume ({sv:,}) — "
                "strong organic traffic opportunity."
            )

    # -----------------------------------------------------------------------
    # Risk findings (data-driven)
    # -----------------------------------------------------------------------
    risks: List[str] = []

    sales_direction   = _get(sales_result,   "results", "market_momentum_direction") or ""
    revenue_direction = _get(revenue_result, "results", "market_momentum_direction") or _get(revenue_result, "results", "market_revenue_direction")  or ""
    demand_phase = _get(demand_result, "results", "interpretation") or _get(demand_result, "summary") or ""

    direction_score = (sales_score * 0.4) + (revenue_score * 0.4) + (demand_score * 0.2)
    if direction_score >= 60:
        market_direction = "growing"
    elif direction_score >= 40:
        market_direction = "stable"
    else:
        market_direction = "declining"

    validation_blocks = [
        demand_result.get("validation", {}),
        sales_result.get("validation", {}),
        revenue_result.get("validation", {}),
        bsr_result.get("validation", {}),
    ]

    # Data Reliability logic
    reliability_score = 0.0
    if blackbox_df is not None:
        required_cols = [
            "Title", "Brand", "Category", "Price", "Sales", "Revenue", "BSR",
            "Review Count", "Rating", "Sales Trend", "Price Trend",
            "Search Volume", "Search Volume Trend"
        ]
        
        # We check both blackbox and magnet
        df_cols = list(blackbox_df.columns)
        if magnet_df is not None:
            df_cols += list(magnet_df.columns)
            
        found_cols = [c for c in required_cols if any(c.lower() in str(col).lower() for col in df_cols)]
        
        # Calculate non-nulls for found columns.
        total_cells = 0
        non_null_cells = 0
        
        import pandas as pd
        
        for req_c in required_cols:
            bb_match = [c for c in blackbox_df.columns if req_c.lower() in str(c).lower()]
            mag_match = [c for c in magnet_df.columns if req_c.lower() in str(c).lower()] if magnet_df is not None else []
            
            if bb_match:
                total_cells += len(blackbox_df)
                non_null_cells += blackbox_df[bb_match[0]].count()
            elif mag_match:
                total_cells += len(magnet_df)
                non_null_cells += magnet_df[mag_match[0]].count()
                
        if total_cells > 0:
            reliability_score = round((non_null_cells / total_cells) * 100, 2)
        else:
            reliability_score = 0.0

    direction_explanation = (
        "Growing because overall momentum and demand scores are strong." if market_direction == "growing" else
        "Stable because overall momentum and demand scores are moderate." if market_direction == "stable" else
        "Declining because overall momentum and demand scores are weak."
    )

    if sales_direction == "Decelerating":
        risks.append(
            "Market sales momentum is decelerating — overall brand-level "
            "sales growth is slowing."
        )
    if revenue_direction == "Declining":
        risks.append(
            "Market revenue momentum is declining — total revenue across "
            "brands is contracting."
        )
    if declining_brands:
        n_declining = len(declining_brands)
        risks.append(
            f"{n_declining} brand(s) are in the bottom sales momentum quartile — "
            "avoid entering segments dominated by these brands."
        )
    if bsr_score < 30:
        risks.append(
            "Low overall BSR efficiency score suggests most products are not "
            "converting their rank into proportional revenue."
        )

    finance_narrative = ""
    finance_overview = {}
    finance_block = {}
    if finance_result and finance_result.get("results"):
        finance_block = finance_result["results"]
        finance_narrative = finance_block.get("market_economics_narrative", "")
        finance_overview = finance_block.get("overview_panel", {})
        mcr_risk = finance_block.get("margin_compression", {}).get("risk", "")
        if mcr_risk == "High":
            risks.append(
                "Margin compression risk is elevated — pricing wars may erode seller margins."
            )
        if finance_health_score >= 60 and finance_block.get("entry_cost", {}).get("classification") == "Difficult":
            opportunities.append(
                "Strong market economics despite difficult entry — incumbents may have defensible positioning."
            )

    attractiveness_matrix = finance_block.get("economic_attractiveness_matrix", {})
    if not attractiveness_matrix and finance_health_score > 0:
        from app.analytics.finance._utils import build_economic_attractiveness_matrix
        attractiveness_matrix = build_economic_attractiveness_matrix(
            demand_strength=float(demand_score),
            finance_health=float(finance_health_score),
        )

    economic_risk = finance_block.get("economic_risk_gauge", 0.0)
    finance_contribution = (
        round(_PILLAR_WEIGHTS["finance"] * float(finance_health_score or 0), 2)
        if finance_health_score
        else 0.0
    )
    market_rating = _market_rating(composite_score)
    launch_recommendation = _launch_recommendation_from_score(
        composite_score,
        attractiveness_matrix.get("quadrant", ""),
    )

    expected_blackbox_columns = [
        "Title", "Brand", "Category", "Price", "Sales", "Revenue", "BSR",
        "Review Count", "Rating", "Sales Trend", "Price Trend",
    ]
    expected_magnet_columns = [
        "Keyword", "Search Volume", "Search Volume Trend", "Keyword Sales",
        "Title Density", "Conversion Rate", "Click Share", "Competition", "Revenue",
    ]
    blackbox_diagnostics = _dataset_diagnostics(blackbox_df, expected_blackbox_columns, "Blackbox")
    magnet_diagnostics = _dataset_diagnostics(magnet_df, expected_magnet_columns, "Magnet")
    datasets_loaded = []
    if blackbox_df is not None and not getattr(blackbox_df, 'empty', True):
        datasets_loaded.append('blackbox')
    if magnet_df is not None and not getattr(magnet_df, 'empty', True):
        datasets_loaded.append('magnet')
    dataset_row_counts = {
        "keyword_rows": len(magnet_df) if magnet_df is not None else 0,
        "product_rows": len(blackbox_df) if blackbox_df is not None else 0,
        "brand_count": total_brands,
    }

    # -----------------------------------------------------------------------
    # Rule-based verdict
    # -----------------------------------------------------------------------
    if composite_score >= 70:
        verdict = "Market demand is strong with healthy monetization and growth momentum."
    elif composite_score >= 45:
        verdict = "Market conditions are stable with selective growth opportunities."
    else:
        verdict = "Market fundamentals are weak and require cautious entry."

    # -----------------------------------------------------------------------
    # Deterministic report sections (requested structure)
    # -----------------------------------------------------------------------
    report_sections = {
        "executive_summary": {
            "composite_market_health_score": composite_score,
            "final_market_score": composite_score,
            "engines_successful": len(engines_ok),
            "engines_total": 4,
            "pillar_scores": pillar_scores,
            "deterministic_note": "Generated from deterministic engine outputs only.",
            "market_economics": finance_narrative or "Market economics data not available.",
        },
        "finance_intelligence": {
            "finance_health_score": round(float(finance_health_score), 2),
            "economic_attractiveness": finance_overview.get(
                "economic_attractiveness", "Not Available"
            ),
            "advertising_pressure": finance_block.get("advertising_pressure", {}),
            "premium_viability": finance_block.get("premium_viability", {}),
            "margin_compression": finance_block.get("margin_compression", {}),
            "capital_efficiency": finance_block.get("capital_efficiency", {}),
            "entry_cost": finance_block.get("entry_cost", {}),
            "economic_verdict": finance_block.get("economic_verdict", ""),
            "radar_chart": finance_block.get("radar_chart", []),
            "economic_risk_gauge": finance_block.get("economic_risk_gauge", 0),
            "economic_attractiveness_matrix": attractiveness_matrix,
        },
        "economic_attractiveness_matrix": attractiveness_matrix,
        "market_health": {
            "overall_score": composite_score,
            "data_reliability_score": reliability_score,
            "data_reliability_explanation": "Data Reliability measures how complete and usable the uploaded dataset is. Higher reliability means the dashboard insights are more trustworthy.",
            "market_direction": market_direction,
            "market_direction_explanation": direction_explanation,
            "sales_direction": sales_direction,
            "revenue_direction": revenue_direction,
            "demand_direction_signal": demand_phase,
            "market_health_band": (
                "high" if composite_score >= 70 else "medium" if composite_score >= 45 else "low"
            ),
        },
        "dataset_diagnostics": {
            "datasets_loaded": datasets_loaded,
            "blackbox": blackbox_diagnostics,
            "magnet": magnet_diagnostics,
            "keyword_rows": dataset_row_counts["keyword_rows"],
            "product_rows": dataset_row_counts["product_rows"],
        },
        "report_metadata": {
            "final_market_score": composite_score,
            "market_direction": market_direction,
            "launch_recommendation": launch_recommendation,
            "datasets_loaded": datasets_loaded,
            "brand_count": total_brands,
            "keyword_rows": dataset_row_counts["keyword_rows"],
            "product_rows": dataset_row_counts["product_rows"],
        },
        "keyword_conversion_intelligence": siei_result.get("results", {}) if siei_result else {},
        "revenue_opportunity_by_segment": whitespace_result.get("results", {}) if whitespace_result else {},
        "sales_momentum_intelligence": sales_result.get("results", {}) if sales_result else {},
        "revenue_momentum_intelligence": revenue_result.get("results", {}) if revenue_result else {},
        "market_structure": hhi_result.get("results", {}) if hhi_result else {},
        "product_intelligence": {
            "direct_competitors": direct_comp_result.get("results", {}) if direct_comp_result else {},
            "substitute_intelligence": substitute_result.get("results", {}) if substitute_result else {},
            "complement_intelligence": complement_result.get("results", {}) if complement_result else {},
            "bundle_opportunities": bundle_result.get("results", {}) if bundle_result else {},
        },
        "price_elasticity": price_elasticity_result.get("results", {}) if price_elasticity_result else {},
        "demand_velocity": demand_vel_result.get("results", {}) if demand_vel_result else {},
        "demand_analysis": {
            "demand_score": round(demand_score, 2),
            "top_demand_keywords": top_demand_keywords[:top_n],
            "top_demand_products": top_demand_products[:top_n],
            "deterministic_interpretation": (
                "Market demand is strong" if demand_score >= 70 else
                "Market demand is stable" if demand_score >= 45 else
                "Market demand is weak"
            ),
        },
        "brand_momentum": {
            "sales_momentum_score": round(sales_score, 2),
            "fastest_growing_brands": fastest_brands[:top_n],
            "declining_brands": declining_brands[:top_n],
            "deterministic_interpretation": (
                "Growth momentum strengthening" if sales_direction == "Accelerating" else
                "Growth momentum stable" if sales_direction == "Stable" else
                "Growth momentum weakening"
            ),
        },
        "revenue_analysis": {
            "revenue_momentum_score": round(revenue_score, 2),
            "total_market_revenue": round(total_market_revenue, 2),
            "top_revenue_brands": top_rev_brands[:top_n],
            "declining_revenue_brands": declining_rev[:top_n],
        },
        "bsr_efficiency_analysis": {
            "bsr_efficiency_score": round(bsr_score, 2),
            "most_efficient_products": efficient_products[:top_n],
            "least_efficient_products": inefficient_products[:top_n],
            "deterministic_interpretation": (
                "Products monetizing efficiently" if bsr_score >= 60 else
                "Products monetizing moderately" if bsr_score >= 40 else
                "Products monetizing inefficiently"
            ),
        },
        "opportunity_signals": {
            "count": len(opportunities),
            "signals": opportunities,
        },
        "risk_signals": {
            "count": len(risks),
            "signals": risks,
        },
        "final_market_verdict": {
            "verdict": verdict,
            "verdict_basis": (
                "FinalMarketScore = 0.35*Demand + 0.15*Momentum + 0.15*Competition + "
                "0.15*Opportunity + 0.20*Finance"
            ),
            "final_market_score": composite_score,
            "market_rating": market_rating,
            "launch_recommendation": launch_recommendation,
            "finance_contribution": (
                f"Finance pillar contributed ~{finance_contribution} points "
                f"(health {round(float(finance_health_score or 0), 1)}/100)."
            ),
            "economic_risk": (
                f"Market risk gauge {round(float(economic_risk), 1)}/100 "
                "from available entry and competition signals."
            ),
            "pillar_scores": {k: v for k, v in pillar_scores.items() if v is not None},
            "finance_score": round(float(finance_health_score), 2),
        },
    }

    # -----------------------------------------------------------------------
    # Markdown narrative
    # -----------------------------------------------------------------------
    md = _build_markdown(
        composite_score=composite_score,
        demand_score=demand_score,
        sales_score=sales_score,
        revenue_score=revenue_score,
        bsr_score=bsr_score,
        total_brands=total_brands,
        total_products=total_products,
        total_market_revenue=total_market_revenue,
        fastest_brands=fastest_brands[:5],
        top_rev_brands=top_rev_brands[:5],
        efficient_products=efficient_products[:5],
        top_demand_keywords=top_demand_keywords[:5],
        opportunities=opportunities,
        risks=risks,
        sales_direction=sales_direction,
        revenue_direction=revenue_direction,
        finance_narrative=finance_narrative,
        finance_health_score=finance_health_score,
    )

    elapsed = round(time.time() - t0, 3)

    report = {
        "status": "success",
        "metric_name": "Market Intelligence Report",
        "summary": (
            f"Composite market health score: {composite_score}/100. "
            f"{len(engines_ok)}/4 engines ran successfully. "
            f"Market covers {total_brands} brands and {total_products} products."
        ),
        "datasets_used": ["blackbox", "magnet"],
        "columns_used": [],
        "formula_used": (
            "FinalMarketScore = 0.35*Demand + 0.15*Momentum + 0.15*Competition + "
            "0.15*Opportunity + 0.20*Finance"
        ),
        "results": {
            # Requested structured sections
            **report_sections,
            # Backward-compatible keys
            "composite_market_health_score": composite_score,
            "engine_scores": {
                "demand_strength":   round(demand_score, 2),
                "sales_momentum":    round(sales_score, 2),
                "revenue_momentum":  round(revenue_score, 2),
                "bsr_efficiency":    round(bsr_score, 2),
                "finance_health":    round(float(finance_health_score), 2),
            },
            "pillar_scores": pillar_scores,
            "market_overview": {
                "total_brands_analysed":   total_brands,
                "total_products_analysed": total_products,
                "total_market_revenue":    round(total_market_revenue, 2),
                "sales_direction":         sales_direction,
                "revenue_direction":       revenue_direction,
                "market_direction":        market_direction,
                "market_direction_explanation": direction_explanation,
                "data_reliability_score":  reliability_score,
                "data_reliability_explanation": "Data Reliability measures how complete and usable the uploaded dataset is. Higher reliability means the dashboard insights are more trustworthy.",
            },
            "rankings": {
                "top_demand_keywords":      top_demand_keywords[:top_n],
                "top_demand_products":      top_demand_products[:top_n],
                "fastest_growing_brands":   fastest_brands[:top_n],
                "declining_brands":         declining_brands[:top_n],
                "top_revenue_brands":       top_rev_brands[:top_n],
                "declining_revenue_brands": declining_rev[:top_n],
                "most_efficient_products":  efficient_products[:top_n],
                "least_efficient_products": inefficient_products[:top_n],
            },
            "opportunity_findings": opportunities,
            "risk_findings": risks,
            "siei": siei_result.get("results", {}) if siei_result else {},
            "whitespace": whitespace_result.get("results", {}) if whitespace_result else {},
            "direct_competitors": direct_comp_result.get("results", {}) if direct_comp_result else {},
            "price_elasticity": price_elasticity_result.get("results", {}) if price_elasticity_result else {},
            "hhi": hhi_result.get("results", {}) if hhi_result else {},
            "demand_velocity": demand_vel_result.get("results", {}) if demand_vel_result else {},
            "substitute_intelligence": substitute_result.get("results", {}) if substitute_result else {},
            "complement_intelligence": complement_result.get("results", {}) if complement_result else {},
            "bundle_opportunities": bundle_result.get("results", {}) if bundle_result else {},
            "finance_intelligence": finance_block,
            "market_economics_narrative": finance_narrative,
            "markdown_report": md,
        },
        "validation": {
            "status": "passed",
            "engines_successful": engines_ok,
            "engines_total": 4,
        },
        "processing_time_seconds": elapsed,
    }
    logger.info(
        "Market report built: composite=%s, engines_ok=%s, opportunities=%s, risks=%s, elapsed=%ss",
        composite_score,
        len(engines_ok),
        len(opportunities),
        len(risks),
        elapsed,
    )
    return report


# ---------------------------------------------------------------------------
# Markdown builder
# ---------------------------------------------------------------------------

def _build_markdown(
    composite_score: float,
    demand_score: float,
    sales_score: float,
    revenue_score: float,
    bsr_score: float,
    total_brands: int,
    total_products: int,
    total_market_revenue: float,
    fastest_brands: List[Dict],
    top_rev_brands: List[Dict],
    efficient_products: List[Dict],
    top_demand_keywords: List[Dict],
    opportunities: List[str],
    risks: List[str],
    sales_direction: str,
    revenue_direction: str,
    finance_narrative: str = "",
    finance_health_score: float = 0.0,
) -> str:
    lines = [
        "# Market Intelligence Report",
        "",
        "## Executive Summary",
        "",
        f"| Metric | Score |",
        f"|--------|-------|",
        f"| **Composite Market Health** | {composite_score}/100 |",
        f"| Demand Strength | {round(demand_score, 1)}/100 |",
        f"| Sales Momentum | {round(sales_score, 1)}/100 |",
        f"| Revenue Momentum | {round(revenue_score, 1)}/100 |",
        f"| BSR Efficiency | {round(bsr_score, 1)}/100 |",
        f"| Finance Health | {round(finance_health_score, 1)}/100 |",
        "",
    ]
    if finance_narrative:
        lines += [
            "## Market Economics",
            "",
            finance_narrative,
            "",
        ]
    lines += [
        "## Market Overview",
        "",
        f"- **Total Brands Analysed**: {total_brands}",
        f"- **Total Products Analysed**: {total_products}",
        f"- **Total Market Revenue**: ${total_market_revenue:,.2f}",
        f"- **Sales Direction**: {sales_direction or 'N/A'}",
        f"- **Revenue Direction**: {revenue_direction or 'N/A'}",
        "",
    ]

    # Top keywords
    if top_demand_keywords:
        lines += [
            "## Top Demand Keywords",
            "",
            "| Keyword | Search Volume | Keyword Sales |",
            "|---------|--------------|---------------|",
        ]
        for kw in top_demand_keywords:
            keyword = kw.get("keyword", "—")
            sv      = f"{int(kw['search_volume']):,}" if kw.get("search_volume") else "—"
            ks      = f"{int(kw['keyword_sales']):,}" if kw.get("keyword_sales") else "—"
            lines.append(f"| {keyword} | {sv} | {ks} |")
        lines.append("")

    # Fastest growing brands
    if fastest_brands:
        lines += [
            "## Fastest Growing Brands (Sales Momentum)",
            "",
            "| Brand | Momentum Score | Avg Sales Trend % |",
            "|-------|---------------|-------------------|",
        ]
        for b in fastest_brands:
            brand = b.get("brand", "—")
            score = b.get("momentum_score", "—")
            trend = b.get("avg_sales_trend_pct", "—")
            lines.append(f"| {brand} | {score} | {trend} |")
        lines.append("")

    # Top revenue brands
    if top_rev_brands:
        lines += [
            "## Top Revenue Growth Brands",
            "",
            "| Brand | Revenue Score | Total Revenue |",
            "|-------|--------------|---------------|",
        ]
        for b in top_rev_brands:
            brand   = b.get("brand", "—")
            score   = b.get("revenue_momentum_score", "—")
            rev     = b.get("total_revenue")
            rev_str = f"${rev:,.2f}" if rev else "—"
            lines.append(f"| {brand} | {score} | {rev_str} |")
        lines.append("")

    # Most efficient products
    if efficient_products:
        lines += [
            "## Most Efficient Products (BSR Efficiency)",
            "",
            "| ASIN | Brand | BSR | Revenue | Efficiency Score |",
            "|------|-------|-----|---------|-----------------|",
        ]
        for p in efficient_products:
            asin  = p.get("asin", "—")
            brand = p.get("brand", "—")
            bsr   = p.get("bsr", "—")
            rev   = p.get("revenue")
            rev_s = f"${rev:,.2f}" if rev else "—"
            eff   = p.get("efficiency_score", "—")
            lines.append(f"| {asin} | {brand} | {bsr} | {rev_s} | {eff} |")
        lines.append("")

    # Opportunities
    if opportunities:
        lines += ["## Opportunity Findings", ""]
        for i, opp in enumerate(opportunities, 1):
            lines.append(f"{i}. {opp}")
        lines.append("")

    # Risks
    if risks:
        lines += ["## Risk Findings", ""]
        for i, risk in enumerate(risks, 1):
            lines.append(f"{i}. {risk}")
        lines.append("")

    lines += [
        "---",
        "*Report generated deterministically from uploaded dataset values. "
        "No AI-generated metrics.*",
    ]

    return "\n".join(lines)


def build_full_market_report_data(*args: Any, **kwargs: Any) -> Dict[str, Any]:
    """Alias for build_report to support unified report data builder usage."""
    return build_report(*args, **kwargs)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get(d: Dict, *keys: str) -> Any:
    """Safe nested dict access."""
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d
