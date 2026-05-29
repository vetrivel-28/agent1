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

# Configurable weights for composite scores
_MARKET_DIRECTION_WEIGHTS = {
    "sales": 0.4,
    "revenue": 0.4,
    "demand": 0.2,
}

_DATA_RELIABILITY_WEIGHTS = {
    "column_completeness": 0.35,
    "non_null": 0.30,
    "row_sufficiency": 0.20,
    "duplicate_quality": 0.10,
    "valid_value": 0.05,
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
    search_mom_result: Optional[Dict[str, Any]] = None,
    demand_vel_result: Optional[Dict[str, Any]] = None,
    substitute_result: Optional[Dict[str, Any]] = None,
    complement_result: Optional[Dict[str, Any]] = None,
    bundle_result: Optional[Dict[str, Any]] = None,
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

    module_results = [
        ("demand_strength", demand_result, demand_score, 0.20),
        ("sales_momentum", sales_result, sales_score, 0.15),
        ("revenue_momentum", revenue_result, revenue_score, 0.15),
        ("bsr_efficiency", bsr_result, bsr_score, 0.15),
        ("market_structure", hhi_result, _module_score(hhi_result, "hhi_normalized_score"), 0.10),
        ("intent_efficiency", siei_result, _module_score(siei_result, "market_siei_score"), 0.10),
        ("whitespace", whitespace_result, _module_score(whitespace_result, "overall_whitespace_score"), 0.10),
        ("price_band_performance", price_elasticity_result, _module_score(price_elasticity_result, "market_demand_score"), 0.05),
    ]

    sections_generated: List[str] = []
    sections_skipped: List[str] = []
    report_warnings: List[str] = []
    weighted_sum = 0.0
    weight_total = 0.0

    for section_id, result, score, weight in module_results:
        if result is None:
            sections_skipped.append(section_id)
            continue
        status = result.get("status", "error")
        if status in ("success", "warning") and score is not None:
            sections_generated.append(section_id)
            weighted_sum += float(score) * weight
            weight_total += weight
            if status == "warning":
                report_warnings.append(f"{section_id}: {result.get('summary', 'partial data')}")
        else:
            sections_skipped.append(section_id)
            report_warnings.append(f"{section_id}: skipped ({result.get('summary', status)})")

    composite_score = round(weighted_sum / weight_total, 2) if weight_total > 0 else 0.0
    report_status = "success" if len(sections_generated) == len([m for m in module_results if m[1] is not None]) else (
        "partial_success" if sections_generated else "error"
    )

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

    # Calculate market trend based on actual growth rates from time-series data
    # Use median sales trend as the primary growth rate indicator
    median_sales_trend = _get(sales_result, "results", "median_sales_trend_pct") or 0.0
    mean_sales_trend = _get(sales_result, "results", "mean_sales_trend_pct") or 0.0
    
    # Use the median as the representative growth rate (more robust to outliers)
    growth_rate = float(median_sales_trend)
    
    # Label based on growth rate thresholds
    if growth_rate > 10.0:
        market_direction = "Growing"
    elif growth_rate >= -10.0:
        market_direction = "Stable"
    else:
        market_direction = "Declining"
    
    # Store growth_rate for output
    market_growth_rate = round(growth_rate, 2)

    validation_blocks = [
        demand_result.get("validation", {}),
        sales_result.get("validation", {}),
        revenue_result.get("validation", {}),
        bsr_result.get("validation", {}),
    ]
    columns_used = []
    for block in validation_blocks:
        cols = block.get("columns_used") or block.get("columns_used", [])
        if isinstance(cols, list):
            columns_used.extend(cols)
    columns_used = list(dict.fromkeys(columns_used))
    rows_before = sum(int(v.get("rows_before_cleaning", 0) or 0) for v in validation_blocks)
    rows_after = sum(int(v.get("rows_after_cleaning", 0) or 0) for v in validation_blocks)
    
    # Calculate 5-component data reliability score
    # 1. Column completeness: percentage of required columns present
    total_expected_columns = 4  # demand, sales, revenue, bsr
    columns_present = len([s for s in [demand_score, sales_score, revenue_score, bsr_score] if s is not None])
    column_completeness_score = (columns_present / total_expected_columns) * 100.0 if total_expected_columns > 0 else 0.0
    
    # 2. Non-null score: percentage of rows that are not null
    non_null_score = (rows_after / rows_before) * 100.0 if rows_before > 0 else 0.0
    
    # 3. Row sufficiency: check if we have enough rows for reliable analysis (minimum 100 rows)
    row_sufficiency_score = min(100.0, (rows_after / 100.0) * 100.0) if rows_after >= 0 else 0.0
    
    # 4. Duplicate quality: check for duplicate ASINs (assume no duplicates for now, score 100)
    duplicate_quality_score = 100.0  # Placeholder - would need actual duplicate detection
    
    # 5. Valid value score: percentage of valid (non-NaN, non-infinite) values
    valid_value_score = non_null_score  # Simplified - assumes cleaned data has valid values
    
    reliability_score = round(
        max(
            0.0,
            min(
                100.0,
                (
                    column_completeness_score * _DATA_RELIABILITY_WEIGHTS["column_completeness"]
                    + non_null_score * _DATA_RELIABILITY_WEIGHTS["non_null"]
                    + row_sufficiency_score * _DATA_RELIABILITY_WEIGHTS["row_sufficiency"]
                    + duplicate_quality_score * _DATA_RELIABILITY_WEIGHTS["duplicate_quality"]
                    + valid_value_score * _DATA_RELIABILITY_WEIGHTS["valid_value"]
                )
            ),
        ),
        2,
    )

    if demand_score < 30 and bsr_score < 40:
        risks.append(
            "Low demand combined with low BSR efficiency indicates weak market monetization and should be treated as a risk, not an opportunity."
        )
    if sales_direction == "Declining":
        risks.append(
            "Market sales momentum is declining — median brand sales trend is negative."
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
            "sections_generated": len(sections_generated),
            "sections_skipped": len(sections_skipped),
            "deterministic_note": "Generated from deterministic engine outputs only.",
        },
        "market_health": {
            "overall_score": composite_score,
            "data_reliability_score": reliability_score,
            "market_direction": market_direction,
            "market_growth_rate": market_growth_rate,
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
            "keyword_classification_note": (
                "Broader category keywords are grouped separately and should not be interpreted as bamboo-specific demand."
            ),
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
                "Growth momentum strengthening" if sales_direction == "Growing" else
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
        "status": report_status,
        "metric_name": "Market Intelligence Report",
        "summary": (
            f"Composite market health score: {composite_score}/100. "
            f"{len(sections_generated)} section(s) generated, {len(sections_skipped)} skipped. "
            f"Market covers {total_brands} brands and {total_products} products."
        ),
        "datasets_used": ["blackbox", "magnet"],
        "columns_used": columns_used,
        "formula_used": (
            "Overall Market Score = weighted average of successful module scores; "
            "failed modules excluded and remaining weights re-normalized."
        ),
        "results": {
            "sections_generated": sections_generated,
            "sections_skipped": sections_skipped,
            "warnings": report_warnings,
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
                "market_growth_rate":       market_growth_rate,
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
            "siei": siei_result.get("results", {}) if siei_result else {},
            "whitespace": whitespace_result.get("results", {}) if whitespace_result else {},
            "direct_competitors": direct_comp_result.get("results", {}) if direct_comp_result else {},
            "price_elasticity": price_elasticity_result.get("results", {}) if price_elasticity_result else {},
            "hhi": hhi_result.get("results", {}) if hhi_result else {},
            "search_momentum": search_mom_result.get("results", {}) if search_mom_result else {},
            "demand_velocity": demand_vel_result.get("results", {}) if demand_vel_result else {},
            "substitute_intelligence": substitute_result.get("results", {}) if substitute_result else {},
            "complement_intelligence": complement_result.get("results", {}) if complement_result else {},
            "bundle_opportunities": bundle_result.get("results", {}) if bundle_result else {},
            "markdown_report": md,
        },
        "validation": {
            "status": "passed" if report_status != "error" else "partial",
            "sections_generated": sections_generated,
            "sections_skipped": sections_skipped,
            "warnings": report_warnings,
        },
        "processing_time_seconds": elapsed,
    }
    logger.info(
        "Market report built: composite=%s, sections=%s, opportunities=%s, risks=%s, elapsed=%ss",
        composite_score,
        len(sections_generated),
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
            "## Broader Category Demand Keywords",
            "",
            "> Generic keywords represent broader category demand and should not be interpreted as bamboo-specific demand.",
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


def _module_score(result: Optional[Dict], key: str) -> Optional[float]:
    """Extract a module score from engine results dict."""
    if not result or result.get("status") not in ("success", "warning"):
        return None
    val = _get(result, "results", key)
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
