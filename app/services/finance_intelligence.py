"""
Finance Intelligence Service
============================
Orchestrates finance analytics modules and aggregates Finance Health Score.
Deterministic pandas operations only — no LLM scoring.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import pandas as pd

from app.analytics.finance import (
    compute_advertising_pressure,
    compute_capital_efficiency,
    compute_entry_cost,
    compute_margin_compression,
    compute_premium_viability,
)
from app.analytics.finance._utils import (
    build_economic_attractiveness_matrix,
    clamp_score,
)
from app.utils.logger import get_logger

logger = get_logger("finance_intelligence")

_FINANCE_HEALTH_WEIGHTS = {
    "api_health": 0.25,
    "pvs": 0.20,
    "mcr_health": 0.25,
    "ces": 0.15,
    "eci_health": 0.15,
}


def _finance_health_classification(score: float) -> str:
    if score >= 80:
        return "Excellent Economics"
    if score >= 60:
        return "Attractive"
    if score >= 40:
        return "Moderate"
    if score >= 20:
        return "Challenging"
    return "Unattractive"


def _extract_entry_metrics(entry_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract entry difficulty and cost index from the new entry_metrics structure.
    Returns a normalized dict for use in health calculations.
    """
    if entry_result.get("status") != "success":
        return {"entry_difficulty": None, "entry_cost_index": None}
    
    entry_difficulty = entry_result.get("entry_difficulty", {})
    entry_cost_index = entry_result.get("entry_cost_index", {})
    
    return {
        "entry_difficulty": entry_difficulty.get("score") if entry_difficulty else None,
        "entry_cost_index": entry_cost_index.get("score") if entry_cost_index else None,
    }


def _narrative_health_phrase(health_class: str) -> str:
    """Display-only phrasing for narratives (internal classification unchanged)."""
    phrases = {
        "Excellent Economics": "favorable",
        "Attractive": "attractive",
        "Moderate": "mixed",
        "Challenging": "challenging",
        "Unattractive": "difficult",
    }
    return phrases.get(health_class, health_class.lower())


def _build_market_economics_narrative(
    health_score: float,
    health_class: str,
    api: Dict[str, Any],
    pvs: Dict[str, Any],
    mcr: Dict[str, Any],
    ces: Dict[str, Any],
    entry_metrics: Dict[str, Any],
) -> str:
    parts: List[str] = []
    parts.append(
        f"Available market signals indicate {_narrative_health_phrase(health_class)} entry conditions "
        f"(market attractiveness {health_score:.0f}/100)."
    )
    if api.get("status") == "success":
        parts.append(
            f"Advertising pressure is {str(api.get('classification', '')).lower()} "
            f"({float(api.get('score', 0)):.0f}/100) with "
            f"{str(api.get('capital_requirement', '')).lower()} entry-investment requirements."
        )
    if pvs.get("status") == "success":
        parts.append(
            f"Price positioning potential appears {str(pvs.get('classification', '')).lower()} "
            f"({float(pvs.get('score', 0)):.0f}/100; strongest band: {pvs.get('best_price_band', 'N/A')})."
        )
    if entry_metrics.get("status") == "success":
        ed = entry_metrics.get("entry_difficulty", {})
        eci = entry_metrics.get("entry_cost_index", {})
        if ed:
            parts.append(
                f"Entry difficulty is {str(ed.get('classification', '')).lower()} "
                f"({float(ed.get('score', 0)):.0f}/100)."
            )
        if eci:
            parts.append(
                f"Entry cost index is {str(eci.get('classification', '')).lower()} "
                f"({float(eci.get('score', 0)):.0f}/100)."
            )
    return " ".join(parts)


def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    demand_score: Optional[float] = None,
) -> Dict[str, Any]:
    """Run full Finance Intelligence analysis."""
    t0 = time.time()
    logger.info("Finance Intelligence analysis started")

    def safe_compute(func, *args, **kwargs):
        try:
            res = func(*args, **kwargs)
            if res is None:
                return {"status": "error"}
            return res
        except Exception as e:
            logger.error(f"Finance module {func.__name__} failed: {e}")
            return {"status": "error"}

    api = safe_compute(compute_advertising_pressure, magnet_df)
    pvs = safe_compute(compute_premium_viability, blackbox_df)
    mcr = safe_compute(compute_margin_compression, blackbox_df)
    ces = safe_compute(compute_capital_efficiency, blackbox_df)
    entry_metrics = safe_compute(compute_entry_cost, magnet_df, blackbox_df)
    
    # Extract entry difficulty and cost index from new structure
    entry_values = _extract_entry_metrics(entry_metrics)
    entry_difficulty = entry_values["entry_difficulty"]
    entry_cost_index = entry_values["entry_cost_index"]

    # Calculate health components (note: entry_difficulty and entry_cost_index are not inverted,
    # they represent difficulty/cost directly)
    health_components = {}
    if api.get("status") == "success":
        health_components["api_health"] = clamp_score(100.0 - float(api.get("score", 0)))
    if pvs.get("status") == "success":
        health_components["pvs"] = clamp_score(float(pvs.get("score", 0)))
    if mcr.get("status") == "success":
        health_components["mcr_health"] = clamp_score(100.0 - float(mcr.get("score", 0)))
    if ces.get("status") == "success":
        health_components["ces"] = clamp_score(float(ces.get("score", 0)))
    if entry_difficulty is not None:
        # Entry difficulty: higher = harder = lower health
        health_components["eci_health"] = clamp_score(100.0 - entry_difficulty)

    weighted_sum = 0.0
    weight_total = 0.0
    for key in ["api_health", "pvs", "mcr_health", "ces", "eci_health"]:
        if key in health_components:
            weighted_sum += _FINANCE_HEALTH_WEIGHTS.get(key, 0) * health_components[key]
            weight_total += _FINANCE_HEALTH_WEIGHTS.get(key, 0)

    if weight_total > 0:
        finance_health = clamp_score(weighted_sum / weight_total)
        health_status = "success"
    else:
        finance_health = 0.0
        health_status = "insufficient_data"

    health_class = (
        _finance_health_classification(finance_health)
        if health_status == "success"
        else "Not Available"
    )

    economic_risk = clamp_score(
        100.0 - finance_health if health_status == "success" else 50.0
    )

    overview = {
        "finance_health_score": finance_health,
        "economic_attractiveness": health_class,
        "capital_requirement": api.get("capital_requirement", "Not Available"),
        "entry_difficulty": entry_metrics.get("entry_difficulty", {}).get("classification", "Not Available") if entry_metrics.get("status") == "success" else "Not Available",
        "entry_cost_index": entry_metrics.get("entry_cost_index", {}).get("classification", "Not Available") if entry_metrics.get("status") == "success" else "Not Available",
        "pricing_power": pvs.get("classification", "Not Available"),
        "price_war_risk": mcr.get("risk", mcr.get("classification", "Not Available")),
    }

    radar = [
        {"dimension": "Advertising Pressure", "score": api.get("score") or 0.0},
        {"dimension": "Premium Viability", "score": pvs.get("score") or 0.0},
        {"dimension": "Margin Compression", "score": mcr.get("score") or 0.0},
        {"dimension": "Capital Efficiency", "score": ces.get("score") or 0.0},
        {"dimension": "Entry Difficulty", "score": entry_difficulty or 0.0},
        {"dimension": "Entry Cost Index", "score": entry_cost_index or 0.0},
    ]

    narrative = _build_market_economics_narrative(
        finance_health, health_class, api, pvs, mcr, ces, entry_metrics
    )

    attractiveness_matrix: Dict[str, Any] = {}
    if demand_score is not None and health_status == "success":
        attractiveness_matrix = build_economic_attractiveness_matrix(
            demand_strength=float(demand_score),
            finance_health=finance_health,
        )

    if health_status == "success":
        if finance_health >= 60:
            economic_verdict = "Favourable Entry Conditions"
        elif finance_health >= 45:
            economic_verdict = "Moderately Attractive Market"
        elif finance_health >= 35:
            economic_verdict = "Competitive but Accessible Market"
        else:
            economic_verdict = "Challenging Entry Environment"
    else:
        economic_verdict = "Entry assessment unavailable — upload required datasets."

    columns_used: List[str] = []
    for block in (api, pvs, mcr, ces, entry_metrics):
        columns_used.extend(block.get("columns_used", []))
    columns_used = list(dict.fromkeys(columns_used))

    datasets_used: List[str] = []
    if magnet_df is not None and not magnet_df.empty:
        datasets_used.append("magnet")
    if blackbox_df is not None and not blackbox_df.empty:
        datasets_used.append("blackbox")

    metrics_ok = sum(
        1 for m in (api, pvs, mcr, ces, entry_metrics) if m.get("status") == "success"
    )

    elapsed = round(time.time() - t0, 3)
    status = "success" if metrics_ok > 0 else "insufficient_data"

    result = {
        "status": status,
        "metric_name": "Finance Intelligence",
        "summary": (
            f"Finance health {finance_health}/100 ({health_class}). "
            f"{metrics_ok}/5 finance metrics computed."
        ),
        "datasets_used": datasets_used,
        "columns_used": columns_used,
        "formula_used": (
            "FinanceHealth = 0.25*API_Health + 0.20*PVS + 0.25*MCR_Health + "
            "0.15*CES + 0.15*EntryDifficulty_Health; "
            "API/MCR/EntryDifficulty inverted (100-score); "
            "unavailable metrics excluded with weight re-normalization; "
            "Entry metrics use percentile-based normalization (5th–95th clip)"
        ),
        "results": {
            "finance_health": {
                "finance_health": finance_health,
                "classification": health_class,
                "status": health_status,
            },
            "overview_panel": overview,
            "advertising_pressure": api,
            "premium_viability": pvs,
            "margin_compression": mcr,
            "capital_efficiency": ces,
            "entry_metrics": entry_metrics,
            "radar_chart": radar,
            "economic_risk_gauge": economic_risk,
            "economic_verdict": economic_verdict,
            "market_economics_narrative": narrative,
            "economic_attractiveness_matrix": attractiveness_matrix,
        },
        "validation": {
            "metrics_computed": metrics_ok,
            "metrics_total": 5,
        },
        "processing_time_seconds": elapsed,
    }

    logger.info(
        "Finance Intelligence complete: health=%s, metrics_ok=%s, elapsed=%ss",
        finance_health,
        metrics_ok,
        elapsed,
    )
    return result
