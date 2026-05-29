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

from app.utils.logger import get_logger

logger = get_logger("report_builder")


def build_report(
    demand_result: Dict[str, Any],
    sales_result: Dict[str, Any],
    revenue_result: Dict[str, Any],
    bsr_result: Dict[str, Any],
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
    demand_score     = _get(demand_result,  "results", "overall_demand_score") or 0.0
    sales_score      = _get(sales_result,   "results", "market_mean_score")    or 0.0
    revenue_score    = _get(revenue_result, "results", "market_mean_score")    or 0.0
    bsr_score        = _get(bsr_result,     "results", "market_efficiency_score") or 0.0

    demand_status  = demand_result.get("status",  "error")
    sales_status   = sales_result.get("status",   "error")
    revenue_status = revenue_result.get("status", "error")
    bsr_status     = bsr_result.get("status",     "error")

    engines_ok = [
        s for s in [demand_status, sales_status, revenue_status, bsr_status]
        if s == "success"
    ]

    # -----------------------------------------------------------------------
    # Composite market health score (mean of available engine scores)
    # -----------------------------------------------------------------------
    available_scores = [
        float(s) for s in [demand_score, sales_score, revenue_score, bsr_score]
        if s is not None and not isinstance(s, str)
    ]
    composite_score = round(
        sum(available_scores) / len(available_scores), 2
    ) if available_scores else 0.0

    # -----------------------------------------------------------------------
    # Rankings
    # -----------------------------------------------------------------------
    top_demand_keywords = _get(demand_result, "results", "top_demand_keywords") or []
    top_demand_products = _get(demand_result, "results", "top_demand_products") or []
    fastest_brands      = _get(sales_result,  "results", "fastest_growing_brands") or []
    declining_brands    = _get(sales_result,  "results", "declining_brands") or []
    top_rev_brands      = _get(revenue_result,"results", "top_revenue_growth_brands") or []
    declining_rev       = _get(revenue_result,"results", "declining_revenue_brands") or []
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
    revenue_direction = _get(revenue_result, "results", "market_revenue_direction")  or ""
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
    rows_before = sum(int(v.get("rows_before_cleaning", 0) or 0) for v in validation_blocks)
    rows_after = sum(int(v.get("rows_after_cleaning", 0) or 0) for v in validation_blocks)
    metric_availability = (
        len([s for s in [demand_score, sales_score, revenue_score, bsr_score] if s is not None]) / 4.0
    )
    nan_percentage = (1.0 - (rows_after / rows_before)) if rows_before > 0 else 1.0
    signal_consistency = 1.0 - (abs(sales_score - revenue_score) / 100.0)
    reliability_score = round(
        max(
            0.0,
            min(
                100.0,
                (
                    (1.0 - nan_percentage) * 0.4
                    + signal_consistency * 0.3
                    + metric_availability * 0.3
                )
                * 100.0,
            ),
        ),
        2,
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

    # -----------------------------------------------------------------------
    # Rule-based verdict
    # -----------------------------------------------------------------------
    if composite_score >= 70:
        verdict = "Market demand is strong with healthy monetization signals."
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
            "engines_successful": len(engines_ok),
            "engines_total": 4,
            "deterministic_note": "Generated from deterministic engine outputs only.",
        },
        "market_health": {
            "overall_score": composite_score,
            "data_reliability_score": reliability_score,
            "market_direction": market_direction,
            "sales_direction": sales_direction,
            "revenue_direction": revenue_direction,
            "demand_direction_signal": demand_phase,
            "market_health_band": (
                "high" if composite_score >= 70 else "medium" if composite_score >= 45 else "low"
            ),
        },
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
            "verdict_basis": "Deterministic score rules from engine outputs",
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
            "Composite Score = mean(Demand Strength, Sales Momentum, "
            "Revenue Momentum, BSR Efficiency)"
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
            },
            "market_overview": {
                "total_brands_analysed":   total_brands,
                "total_products_analysed": total_products,
                "total_market_revenue":    round(total_market_revenue, 2),
                "sales_direction":         sales_direction,
                "revenue_direction":       revenue_direction,
                "market_direction":        market_direction,
                "data_reliability_score":  reliability_score,
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
        "",
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
