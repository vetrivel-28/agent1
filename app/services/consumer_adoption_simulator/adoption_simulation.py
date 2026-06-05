"""
AdoptionSimulationEngine
=========================
Calculates adoption metrics for every psychographic cluster:
  - Purchase Intent        (0–100)
  - Conversion Probability (0–1)
  - Trust Score            (0–100)
  - Emotional Resonance    (0–100)
  - Switching Probability  (0–1)
  - Channel Preference     (Amazon | D2C | Retail | Social)

All inputs derive from MarketDNA + cluster centroid traits.
No hardcoded category-specific values.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

from .psychographic_clusters import PsychographicCluster
from .market_dna import MarketDNA
from app.utils.logger import get_logger

logger = get_logger("adoption_simulation_engine")


@dataclass
class ClusterAdoptionResult:
    cluster_id: int
    cluster_name: str
    population: int
    percentage: float
    purchase_intent: float          # 0–100
    conversion_probability: float   # 0.0–1.0
    trust_score: float              # 0–100
    emotional_resonance: float      # 0–100
    switching_probability: float    # 0.0–1.0
    channel_preference: str         # primary channel
    channel_scores: Dict[str, float]
    formula_notes: Dict[str, str]   # formula explanation for each metric
    evidence: Dict[str, Any]        # source signals used

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AdoptionSimulationEngine:
    """
    Computes adoption metrics per psychographic cluster using MarketDNA signals.
    """

    def simulate(
        self,
        clusters: List[PsychographicCluster],
        dna: MarketDNA,
    ) -> List[ClusterAdoptionResult]:
        results = []
        for cluster in clusters:
            result = self._simulate_cluster(cluster, dna)
            results.append(result)

        # Sort by purchase intent descending
        results.sort(key=lambda r: r.purchase_intent, reverse=True)
        logger.info(
            "Adoption simulation complete for %d clusters | "
            "avg_intent=%.1f | avg_conversion=%.3f",
            len(results),
            sum(r.purchase_intent for r in results) / max(len(results), 1),
            sum(r.conversion_probability for r in results) / max(len(results), 1),
        )
        return results

    # ── Internal ──────────────────────────────────────────────────────────────

    def _simulate_cluster(
        self,
        cluster: PsychographicCluster,
        dna: MarketDNA,
    ) -> ClusterAdoptionResult:
        dt = cluster.dominant_traits
        centroid = cluster.centroid

        # ── Normalised DNA signals (0–1) ──────────────────────────────────────
        demand_n      = (dna.demand_score or 50.0) / 100.0
        velocity_n    = (dna.demand_velocity or 50.0) / 100.0
        efficiency_n  = (dna.conversion_efficiency or 50.0) / 100.0
        hhi_n         = min((dna.hhi_score or 2500) / 10000.0, 1.0)
        sat_n         = (dna.competitive_saturation or 25.0) / 100.0
        recoverable_n = min((dna.recoverable_revenue or 0) / 100000.0, 1.0)

        # ── Purchase Intent ────────────────────────────────────────────────────
        # Driven by: demand signal × category alignment of cluster traits
        trend_boost = centroid.get("trend_focused", 0.3) * velocity_n * 30
        quality_boost = centroid.get("quality_focused", 0.5) * demand_n * 25
        convenience_boost = centroid.get("convenience_focused", 0.5) * 20
        base_intent = 30 + trend_boost + quality_boost + convenience_boost
        purchase_intent = round(min(100, max(0, base_intent)), 2)

        # ── Conversion Probability ────────────────────────────────────────────
        # High efficiency market + low price sensitivity = higher conversion
        price_drag = centroid.get("price_focused", 0.3) * (1 - efficiency_n) * 0.25
        risk_drag  = centroid.get("risk_aversion", 0.3) * 0.15
        base_conv  = efficiency_n * 0.45 + demand_n * 0.25 + 0.10
        conv_prob  = round(min(0.98, max(0.02, base_conv - price_drag - risk_drag)), 4)

        # ── Trust Score ───────────────────────────────────────────────────────
        # Built by low competition fragmentation + positive sentiment proxy
        sentiment_proxy = efficiency_n * 50      # higher conversion = satisfied buyers
        brand_trust  = centroid.get("brand_loyalty", 0.4) * 20
        frag_bonus   = (1 - hhi_n) * 15          # fragmented = many trusted options
        trust_score  = round(min(100, max(0, 30 + sentiment_proxy + brand_trust + frag_bonus)), 2)

        # ── Emotional Resonance ───────────────────────────────────────────────
        # How much the cluster's motivation aligns with top market themes
        theme_alignment = 1.0 if cluster.primary_theme != "General" else 0.5
        trend_aligned   = centroid.get("trend_focused", 0.3) * theme_alignment * 40
        desire_aligned  = centroid.get("quality_focused", 0.5) * theme_alignment * 30
        health_aligned  = centroid.get("health_conscious", 0.3) * 15
        emotional_resonance = round(min(100, max(0, 20 + trend_aligned + desire_aligned + health_aligned)), 2)

        # ── Switching Probability ──────────────────────────────────────────────
        # Low brand loyalty + low switching cost + high fragmentation → easier switching
        sw_base = (1 - centroid.get("brand_loyalty", 0.5)) * 0.4
        sw_sat  = sat_n * 0.2      # saturated market = more alternatives → more switching
        sw_cost = centroid.get("switching_cost", 0.4) * -0.3
        switching_probability = round(min(0.95, max(0.05, sw_base + sw_sat + sw_cost + 0.3)), 4)

        # ── Channel Preference ────────────────────────────────────────────────
        amazon_score = (
            centroid.get("convenience_focused", 0.5) * 40
            + (1 - centroid.get("risk_aversion", 0.4)) * 20
            + demand_n * 15
        )
        d2c_score = (
            centroid.get("brand_loyalty", 0.4) * 30
            + centroid.get("quality_focused", 0.5) * 20
            + centroid.get("premium_willingness", 0.4) * 15
        )
        retail_score = (
            centroid.get("risk_aversion", 0.3) * 25
            + (1 - centroid.get("convenience_focused", 0.5)) * 20
        )
        social_score = (
            centroid.get("trend_focused", 0.3) * 30
            + centroid.get("sustainability_conscious", 0.3) * 15
        )
        channel_scores = {
            "Amazon": round(amazon_score, 1),
            "D2C": round(d2c_score, 1),
            "Retail": round(retail_score, 1),
            "Social Commerce": round(social_score, 1),
        }
        channel_preference = max(channel_scores, key=lambda c: channel_scores[c])

        formula_notes = {
            "purchase_intent": (
                "30 (base) + trend_focused × velocity_n × 30 "
                "+ quality_focused × demand_n × 25 + convenience_focused × 20"
            ),
            "conversion_probability": (
                "efficiency_n × 0.45 + demand_n × 0.25 + 0.10 "
                "- price_focused × (1 - efficiency_n) × 0.25 - risk_aversion × 0.15"
            ),
            "trust_score": (
                "30 + efficiency_n × 50 + brand_loyalty × 20 + (1 - hhi_n) × 15"
            ),
            "emotional_resonance": (
                "20 + trend_focused × theme_alignment × 40 "
                "+ quality_focused × theme_alignment × 30 + health_conscious × 15"
            ),
            "switching_probability": (
                "0.30 + (1 - brand_loyalty) × 0.40 + sat_n × 0.20 - switching_cost × 0.30"
            ),
        }

        evidence = {
            "demand_score_used": dna.demand_score,
            "demand_velocity_used": dna.demand_velocity,
            "conversion_efficiency_used": dna.conversion_efficiency,
            "hhi_score_used": dna.hhi_score,
            "recoverable_revenue_used": dna.recoverable_revenue,
            "cluster_dominant_traits": list(dt.keys())[:3] if isinstance(dt, dict) else [],
            "cluster_primary_theme": cluster.primary_theme,
        }

        return ClusterAdoptionResult(
            cluster_id=cluster.cluster_id,
            cluster_name=cluster.name,
            population=cluster.population,
            percentage=cluster.percentage,
            purchase_intent=purchase_intent,
            conversion_probability=conv_prob,
            trust_score=trust_score,
            emotional_resonance=emotional_resonance,
            switching_probability=switching_probability,
            channel_preference=channel_preference,
            channel_scores=channel_scores,
            formula_notes=formula_notes,
            evidence=evidence,
        )
