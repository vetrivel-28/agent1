"""
SimulationConfidenceEngine
===========================
Computes confidence scores for every major simulation prediction.

Confidence is derived from:
  1. Dataset Quality   — completeness, sample size, missing values
  2. Demand Stability  — velocity, consistency, momentum
  3. Revenue Stability — efficiency, opportunity consistency
  4. Competition Stability — HHI stability, market concentration
  5. Customer Signal Quality — review signals, sentiment, friction

Outputs per-metric confidence + overall simulation confidence.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.utils.logger import get_logger

logger = get_logger("simulation_confidence_engine")

# Required components for each major metric
_METRIC_REQUIREMENTS: Dict[str, List[str]] = {
    "expected_adoption_rate":    ["demand_score", "conversion_efficiency", "hhi_score"],
    "revenue_capture":           ["recoverable_revenue", "conversion_efficiency", "total_market_revenue"],
    "revenue_lift_opportunity":  ["recoverable_revenue", "friction_keyword_count"],
    "segment_adoption_rates":    ["demand_score", "hhi_score", "conversion_efficiency"],
    "resistance_index":          ["hhi_score", "conversion_efficiency", "friction_keyword_count"],
    "retention_forecast":        ["demand_velocity", "conversion_efficiency"],
    "executive_narrative":       ["demand_score", "demand_velocity", "hhi_score", "conversion_efficiency", "recoverable_revenue"],
    "recommended_decision_path": ["demand_score", "demand_velocity", "hhi_score", "conversion_efficiency"],
}


class SimulationConfidenceEngine:

    def calculate(
        self,
        dna_dict: Dict[str, Any],
        population_summary: Dict[str, Any],
        enriched_segments: List[Dict[str, Any]],
        data_completeness: Dict[str, bool],
    ) -> Dict[str, Any]:

        # ── 1. Dataset Quality ────────────────────────────────────────────────
        total_fields  = max(len(data_completeness), 1)
        present_fields = sum(1 for v in data_completeness.values() if v)
        dataset_quality = round((present_fields / total_fields) * 100, 1)

        # Sample size signal: larger datasets = higher confidence
        total_sv = dna_dict.get("total_search_volume") or 0
        sample_bonus = min(20, total_sv / 50000)  # up to +20 for large keyword datasets
        dataset_quality = min(100, dataset_quality + sample_bonus)

        # ── 2. Demand Stability ───────────────────────────────────────────────
        demand_score  = dna_dict.get("demand_score") or 0
        velocity      = dna_dict.get("demand_velocity") or 0
        growth_trend  = dna_dict.get("growth_trend") or "stable"
        trend_bonus   = 15 if growth_trend in ("growing", "accelerating") else 0 if growth_trend == "stable" else -10
        demand_stability = round(min(100, (demand_score * 0.5 + velocity * 0.5) + trend_bonus), 1)

        # ── 3. Revenue Stability ──────────────────────────────────────────────
        eff          = dna_dict.get("conversion_efficiency") or 0
        rec_rev      = dna_dict.get("recoverable_revenue") or 0
        rev_density  = dna_dict.get("revenue_density") or 0
        rev_stable   = 1 if eff > 50 and rec_rev > 0 else 0
        revenue_stability = round(min(100, eff * 0.5 + (rev_density or 0) * 0.3 + rev_stable * 20), 1)

        # ── 4. Competition Stability ──────────────────────────────────────────
        hhi    = dna_dict.get("hhi_score") or 5000
        sat    = dna_dict.get("competitive_saturation") or 50
        # Lower HHI = more fragmented = more predictable = higher confidence
        hhi_conf = max(0, 100 - min(hhi / 100, 100))
        competition_stability = round(min(100, hhi_conf * 0.6 + (100 - sat) * 0.4), 1)

        # ── 5. Customer Signal Quality ────────────────────────────────────────
        friction_kw    = dna_dict.get("friction_keyword_count") or 0
        avg_trust      = population_summary.get("avg_trust_score") or 50
        sentiment_proxy = dna_dict.get("review_sentiment_score") or 50
        cust_signal     = round(min(100, avg_trust * 0.4 + (100 - min(friction_kw, 200) / 2) * 0.3 + sentiment_proxy * 0.3), 1)

        # ── Overall Simulation Confidence ────────────────────────────────────
        overall = round(
            dataset_quality      * 0.35
            + demand_stability   * 0.20
            + revenue_stability  * 0.20
            + competition_stability * 0.15
            + cust_signal        * 0.10,
            1,
        )
        overall = min(100, overall)

        if overall >= 80:
            overall_label = "High"
        elif overall >= 50:
            overall_label = "Medium"
        else:
            overall_label = "Low"

        # ── Per-metric confidence ─────────────────────────────────────────────
        per_metric: Dict[str, Any] = {}
        for metric, required_keys in _METRIC_REQUIREMENTS.items():
            available = sum(1 for k in required_keys if dna_dict.get(k) is not None)
            base_conf = round(available / max(len(required_keys), 1) * 100, 1)
            # Blend with dataset quality
            blended = round((base_conf * 0.6 + dataset_quality * 0.4), 1)
            per_metric[metric] = {
                "confidence_score":      blended,
                "confidence_label":      "High" if blended >= 80 else "Medium" if blended >= 50 else "Low",
                "available_signals":     available,
                "required_signals":      len(required_keys),
                "missing_signals":       [k for k in required_keys if dna_dict.get(k) is None],
            }

        logger.info("Simulation confidence: %.1f%% (%s)", overall, overall_label)

        return {
            "overall_confidence":          overall,
            "overall_label":               overall_label,
            "breakdown": {
                "dataset_quality":         dataset_quality,
                "demand_stability":        demand_stability,
                "revenue_stability":       revenue_stability,
                "competition_stability":   competition_stability,
                "customer_signal_quality": cust_signal,
            },
            "per_metric_confidence":       per_metric,
            "drivers": {
                "positive": self._pos_drivers(dataset_quality, demand_stability, revenue_stability),
                "negative": self._neg_drivers(dataset_quality, demand_stability, competition_stability, cust_signal),
            },
            "formula": (
                "Confidence = DatasetQuality×0.35 + DemandStability×0.20 "
                "+ RevenueStability×0.20 + CompetitionStability×0.15 + CustomerSignal×0.10"
            ),
        }

    @staticmethod
    def _pos_drivers(dq: float, ds: float, rs: float) -> List[str]:
        drivers = []
        if dq >= 70: drivers.append(f"Strong dataset coverage ({dq:.0f}%)")
        if ds >= 65: drivers.append(f"Stable demand signal ({ds:.0f}/100)")
        if rs >= 65: drivers.append(f"Consistent revenue efficiency ({rs:.0f}/100)")
        return drivers or ["Sufficient data for directional confidence"]

    @staticmethod
    def _neg_drivers(dq: float, ds: float, cs: float, cust: float) -> List[str]:
        drivers = []
        if dq < 60: drivers.append(f"Incomplete dataset — {100-dq:.0f}% of signals missing")
        if ds < 45: drivers.append(f"Unstable demand signals ({ds:.0f}/100)")
        if cs < 45: drivers.append(f"High market concentration reduces predictability ({cs:.0f}/100)")
        if cust < 45: drivers.append(f"Weak customer signal quality ({cust:.0f}/100)")
        return drivers or ["Confidence within acceptable bounds for planning decisions"]
