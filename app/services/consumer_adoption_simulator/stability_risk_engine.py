"""
SegmentStabilityEngine + MarketRiskEngine
==========================================

SegmentStabilityEngine:
  - Stable Segments: consistently high-converting, low resistance
  - Volatile Segments: highly sensitive to market conditions
  - Emerging Segments: strong future potential (high switching prob, growing demand)
  - Scores: Stability Score, Volatility Score, Strategic Importance Score

MarketRiskEngine:
  - Adoption Risk, Revenue Risk, Competition Risk, Retention Risk, Execution Risk
  - Market Entry Risk Index (0–100)

All values dataset-driven from MarketDNA + enriched simulation segments.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.utils.logger import get_logger

logger = get_logger("stability_risk_engine")


# ── Segment Stability Engine ─────────────────────────────────────────────────

class SegmentStabilityEngine:

    def analyse(
        self,
        enriched_segments: List[Dict[str, Any]],
        dna_dict: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not enriched_segments:
            return {"stable": [], "volatile": [], "emerging": [], "all_scores": []}

        demand_velocity = dna_dict.get("demand_velocity") or 50.0
        hhi             = dna_dict.get("hhi_score") or 2500.0
        eff             = dna_dict.get("conversion_efficiency") or 50.0

        scores = []
        for seg in enriched_segments:
            r = seg.get("resistance") or {}
            traits = seg.get("dominant_traits") or {}
            intent    = seg.get("purchase_intent", 0)
            conv      = seg.get("conversion_probability", 0)
            trust     = seg.get("trust_score", 0)
            res_idx   = r.get("resistance_index", 50)
            switching = seg.get("switching_probability", 0.5)
            loyalty   = traits.get("brand_loyalty", 0.4)

            # Stability = consistent conversion + low resistance + high trust + high loyalty
            stability = (
                (conv * 100) * 0.30
                + (100 - res_idx) * 0.25
                + trust * 0.25
                + loyalty * 100 * 0.20
            )

            # Volatility = high switching + high trend-following + market sensitivity
            trend_focus = traits.get("trend_focused", 0.3)
            volatility = (
                switching * 100 * 0.40
                + trend_focus * 100 * 0.35
                + (100 - stability) * 0.25
            )

            # Strategic importance = population share × intent × (1 - resistance)
            pop_pct = seg.get("percentage", 0)
            strategic = (
                pop_pct * 0.30
                + intent * 0.40
                + (100 - res_idx) * 0.30
            )

            # Emerging = high switching (openness) + high intent + demand velocity alignment
            emerging_score = (
                switching * 100 * 0.35
                + intent * 0.35
                + (demand_velocity / 100) * 30 * 0.30
            )

            scores.append({
                "segment":            seg.get("cluster_name", ""),
                "population":         seg.get("population", 0),
                "percentage":         seg.get("percentage", 0),
                "stability_score":    round(min(100, stability), 1),
                "volatility_score":   round(min(100, volatility), 1),
                "strategic_importance": round(min(100, strategic), 1),
                "emerging_score":     round(min(100, emerging_score), 1),
                "intent":             intent,
                "conversion_pct":     round(conv * 100, 1),
                "resistance_index":   res_idx,
                "switching_prob":     switching,
            })

        # Classify into categories
        stable   = sorted([s for s in scores if s["stability_score"] >= 65],
                          key=lambda x: x["stability_score"], reverse=True)[:5]
        volatile = sorted([s for s in scores if s["volatility_score"] >= 65],
                          key=lambda x: x["volatility_score"], reverse=True)[:5]
        emerging = sorted([s for s in scores if s["emerging_score"] >= 60 and s not in stable],
                          key=lambda x: x["emerging_score"], reverse=True)[:5]

        logger.info(
            "Segment stability: %d stable, %d volatile, %d emerging",
            len(stable), len(volatile), len(emerging),
        )

        return {
            "stable_segments":   stable,
            "volatile_segments": volatile,
            "emerging_segments": emerging,
            "all_scores":        sorted(scores, key=lambda x: x["strategic_importance"], reverse=True),
            "summary": {
                "stable_count":   len(stable),
                "volatile_count": len(volatile),
                "emerging_count": len(emerging),
                "top_stable":     stable[0]["segment"] if stable else "—",
                "top_volatile":   volatile[0]["segment"] if volatile else "—",
                "top_emerging":   emerging[0]["segment"] if emerging else "—",
            },
        }


# ── Market Risk Engine ───────────────────────────────────────────────────────

class MarketRiskEngine:

    def calculate(
        self,
        dna_dict: Dict[str, Any],
        population_summary: Dict[str, Any],
        enriched_segments: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        avg_intent     = population_summary.get("avg_purchase_intent", 50.0)
        avg_conv       = population_summary.get("avg_conversion_probability", 0.3)
        avg_resistance = population_summary.get("avg_resistance_index", 40.0)
        avg_trust      = population_summary.get("avg_trust_score", 50.0)

        demand_score  = dna_dict.get("demand_score") or 50.0
        hhi           = dna_dict.get("hhi_score") or 2500.0
        velocity      = dna_dict.get("demand_velocity") or 50.0
        eff           = dna_dict.get("conversion_efficiency") or 50.0
        rec_rev       = dna_dict.get("recoverable_revenue") or 0.0

        # ── Adoption Risk ─────────────────────────────────────────────────────
        # Low intent + high resistance = high adoption risk
        adoption_risk = round(
            (100 - avg_intent) * 0.45
            + avg_resistance * 0.35
            + (100 - demand_score) * 0.20,
            1,
        )

        # ── Revenue Risk ──────────────────────────────────────────────────────
        # Low conversion efficiency + low recoverable revenue base
        rev_base_risk = 100 - min(100, rec_rev / 10000 * 20) if rec_rev < 500000 else 10
        revenue_risk  = round(
            (100 - eff) * 0.40
            + (1 - avg_conv) * 100 * 0.35
            + rev_base_risk * 0.25,
            1,
        )

        # ── Competition Risk ──────────────────────────────────────────────────
        # High HHI = dominant players = harder entry
        competition_risk = round(
            min(100, hhi / 100) * 0.50
            + (100 - (100 - min(hhi, 10000) / 100)) * 0.30
            + (100 - avg_trust) * 0.20,
            1,
        )
        competition_risk = min(100, competition_risk)

        # ── Retention Risk ────────────────────────────────────────────────────
        avg_switching = sum(s.get("switching_probability", 0.3) for s in enriched_segments) / max(len(enriched_segments), 1)
        avg_loyalty   = sum((s.get("dominant_traits") or {}).get("brand_loyalty", 0.4) for s in enriched_segments) / max(len(enriched_segments), 1)
        retention_risk = round(
            avg_switching * 100 * 0.50
            + (1 - avg_loyalty) * 100 * 0.30
            + (100 - velocity) * 0.20,
            1,
        )

        # ── Execution Risk ────────────────────────────────────────────────────
        # Low demand velocity + high competition = hard execution environment
        completeness = dna_dict.get("completeness_score", 60.0)
        execution_risk = round(
            (100 - velocity) * 0.35
            + (100 - demand_score) * 0.30
            + (100 - completeness) * 0.35,
            1,
        )

        # ── Market Entry Risk Index ───────────────────────────────────────────
        market_entry_risk_index = round(
            adoption_risk    * 0.25
            + revenue_risk   * 0.25
            + competition_risk * 0.25
            + retention_risk * 0.15
            + execution_risk * 0.10,
            1,
        )
        market_entry_risk_index = min(100, market_entry_risk_index)

        if market_entry_risk_index >= 70:
            risk_label = "Critical"
        elif market_entry_risk_index >= 50:
            risk_label = "High"
        elif market_entry_risk_index >= 30:
            risk_label = "Moderate"
        else:
            risk_label = "Low"

        components = {
            "adoption_risk":    {"score": round(adoption_risk, 1),    "weight": 0.25, "drivers": ["low purchase intent", "high resistance index", "weak demand signal"]},
            "revenue_risk":     {"score": round(revenue_risk, 1),     "weight": 0.25, "drivers": ["low conversion efficiency", "low recoverable revenue", "weak conversion probability"]},
            "competition_risk": {"score": round(competition_risk, 1), "weight": 0.25, "drivers": ["high HHI concentration", "dominant brand loyalty", "low consumer trust"]},
            "retention_risk":   {"score": round(retention_risk, 1),   "weight": 0.15, "drivers": ["high switching probability", "low brand loyalty", "weak demand velocity"]},
            "execution_risk":   {"score": round(execution_risk, 1),   "weight": 0.10, "drivers": ["slow demand velocity", "incomplete data signals", "weak demand score"]},
        }

        logger.info("Market Entry Risk Index: %.1f (%s)", market_entry_risk_index, risk_label)

        return {
            "market_entry_risk_index": market_entry_risk_index,
            "risk_label":              risk_label,
            "components":              components,
            "formula": (
                "MERI = Adoption×0.25 + Revenue×0.25 + Competition×0.25 "
                "+ Retention×0.15 + Execution×0.10"
            ),
            "evidence": {
                "demand_score_used":     round(demand_score, 1),
                "hhi_used":              round(hhi, 0),
                "avg_intent_used":       round(avg_intent, 1),
                "avg_resistance_used":   round(avg_resistance, 1),
                "conversion_eff_used":   round(eff, 1),
                "avg_switching_used":    round(avg_switching, 3),
                "data_completeness_pct": round(completeness, 1),
            },
        }
