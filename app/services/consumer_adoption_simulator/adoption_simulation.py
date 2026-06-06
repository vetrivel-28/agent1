"""
AdoptionSimulationEngine
=========================
Calculates adoption metrics for every psychographic cluster.

FIXED: Each segment now uses archetype-aware base values that vary significantly
by segment type AND by product/dataset signals. The old formula produced near-identical
~30% adoption for all segments because DNA constants dominated and trait variance was tiny.

New approach:
 1. Every segment has a unique BASE_INTENT derived from its archetype profile
 2. Dataset signals multiply/shift that base in segment-specific ways
 3. Result: Premium Quality Seekers get high intent in quality/premium markets,
            Budget Maximizers get high intent in price-competitive markets,
            Risk-Averse Buyers get low intent in low-trust markets, etc.

All inputs derive from MarketDNA + cluster centroid traits.
No hardcoded category-specific values.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List

from .psychographic_clusters import PsychographicCluster, FIXED_SEGMENT_NAMES
from .market_dna import MarketDNA
from app.utils.logger import get_logger

logger = get_logger("adoption_simulation_engine")

# ── Archetype base configuration ──────────────────────────────────────────────
# Each segment has a base_intent (the neutral-market starting point) and
# signal_weights that determine HOW MUCH each DNA signal shifts it.
# This ensures wide inter-segment variance rather than all converging on ~30%.
#
# signal_weights keys: demand, velocity, efficiency, premium_price, low_hhi,
#                      high_hhi, review_sentiment, low_friction, recoverable
# Positive = boosts intent; negative = hurts intent
SEGMENT_ARCHETYPE_CONFIG: Dict[str, Dict[str, Any]] = {
    "Budget Maximizers": {
        "base_intent": 40.0,
        "signal_weights": {
            "demand":          0.20,   # moderate demand boost
            "efficiency":      0.30,   # price-efficient market = good for them
            "premium_price":  -0.35,   # high-priced market kills budget intent
            "low_hhi":         0.20,   # fragmented = price competition = deals
            "review_sentiment": 0.10,
        },
        "conversion_base": 0.38,
        "conversion_weights": {"efficiency": 0.25, "low_friction": 0.15},
    },
    "Premium Quality Seekers": {
        "base_intent": 35.0,
        "signal_weights": {
            "demand":          0.25,
            "review_sentiment": 0.40,  # quality buyers NEED good reviews
            "premium_price":   0.30,   # premium market = aligned product
            "velocity":        0.15,
            "low_friction":    0.10,
        },
        "conversion_base": 0.32,
        "conversion_weights": {"efficiency": 0.20, "review_sentiment": 0.30},
    },
    "Convenience Buyers": {
        "base_intent": 55.0,          # naturally high — easy purchase is key
        "signal_weights": {
            "demand":          0.20,
            "efficiency":      0.25,   # efficient = easy to buy
            "velocity":        0.15,
            "low_friction":    0.25,   # fewer friction kws = easier purchase
        },
        "conversion_base": 0.50,
        "conversion_weights": {"efficiency": 0.30, "low_friction": 0.20},
    },
    "Brand Loyalists": {
        "base_intent": 30.0,          # low — they are loyal to EXISTING brands
        "signal_weights": {
            "high_hhi":        0.30,   # concentrated market = known brands = higher intent
            "review_sentiment": 0.25,
            "demand":          0.15,
        },
        "conversion_base": 0.28,
        "conversion_weights": {"high_hhi": 0.30, "review_sentiment": 0.15},
    },
    "Deal Hunters": {
        "base_intent": 45.0,
        "signal_weights": {
            "demand":          0.15,
            "efficiency":      0.25,
            "premium_price":  -0.40,   # expensive = deal hunters leave
            "low_hhi":         0.25,   # fragmented = more deals
            "velocity":        0.10,
        },
        "conversion_base": 0.40,
        "conversion_weights": {"efficiency": 0.30, "low_friction": 0.15},
    },
    "Feature Researchers": {
        "base_intent": 42.0,
        "signal_weights": {
            "demand":          0.20,
            "review_sentiment": 0.35,  # researched buyers need good reviews
            "low_friction":    0.20,
            "velocity":        0.10,
        },
        "conversion_base": 0.35,
        "conversion_weights": {"efficiency": 0.20, "review_sentiment": 0.25},
    },
    "Risk-Averse Buyers": {
        "base_intent": 28.0,          # low — need a LOT of reassurance
        "signal_weights": {
            "review_sentiment": 0.45,  # CRITICAL: needs great reviews
            "low_friction":    0.30,   # no friction kws
            "low_hhi":         0.10,
            "demand":          0.05,
        },
        "conversion_base": 0.22,
        "conversion_weights": {"review_sentiment": 0.35, "low_friction": 0.25},
    },
    "Impulse Shoppers": {
        "base_intent": 60.0,          # naturally high — act quickly
        "signal_weights": {
            "velocity":        0.30,   # trending = impulse trigger
            "demand":          0.20,
            "low_friction":    0.15,
            "premium_price":  -0.10,
        },
        "conversion_base": 0.55,
        "conversion_weights": {"efficiency": 0.25, "velocity": 0.20},
    },
    "Trend Followers": {
        "base_intent": 50.0,
        "signal_weights": {
            "velocity":        0.40,   # velocity is everything
            "demand":          0.20,
            "review_sentiment": 0.15,
        },
        "conversion_base": 0.45,
        "conversion_weights": {"velocity": 0.30, "efficiency": 0.15},
    },
    "Practical Buyers": {
        "base_intent": 48.0,
        "signal_weights": {
            "demand":          0.20,
            "efficiency":      0.25,
            "low_friction":    0.20,
            "review_sentiment": 0.15,
        },
        "conversion_base": 0.42,
        "conversion_weights": {"efficiency": 0.25, "low_friction": 0.15},
    },
    "Gift Buyers": {
        "base_intent": 38.0,
        "signal_weights": {
            "premium_price":   0.25,   # gift = premium presentation = premium price ok
            "review_sentiment": 0.30,
            "demand":          0.15,
            "velocity":        0.15,
        },
        "conversion_base": 0.35,
        "conversion_weights": {"review_sentiment": 0.20, "efficiency": 0.15},
    },
    "Heavy Users": {
        "base_intent": 52.0,
        "signal_weights": {
            "demand":          0.20,
            "recoverable":     0.20,   # large market = heavy users present
            "efficiency":      0.20,
            "review_sentiment": 0.15,
        },
        "conversion_base": 0.48,
        "conversion_weights": {"efficiency": 0.20, "review_sentiment": 0.15},
    },
    "Occasional Users": {
        "base_intent": 32.0,          # low frequency = lower intent
        "signal_weights": {
            "demand":          0.15,
            "efficiency":      0.20,
            "low_friction":    0.15,
            "premium_price":  -0.20,
        },
        "conversion_base": 0.28,
        "conversion_weights": {"efficiency": 0.20, "low_friction": 0.15},
    },
    "Sustainability Focused": {
        "base_intent": 36.0,
        "signal_weights": {
            "review_sentiment": 0.30,
            "demand":          0.20,
            "premium_price":   0.15,   # sustainability = willing to pay more
            "low_friction":    0.15,
        },
        "conversion_base": 0.32,
        "conversion_weights": {"review_sentiment": 0.25, "efficiency": 0.15},
    },
    "Status Seekers": {
        "base_intent": 40.0,
        "signal_weights": {
            "premium_price":   0.40,   # premium market = status product
            "review_sentiment": 0.25,
            "velocity":        0.15,
            "demand":          0.10,
        },
        "conversion_base": 0.35,
        "conversion_weights": {"review_sentiment": 0.20, "premium_price": 0.20},
    },
    "Value Maximizers": {
        "base_intent": 50.0,
        "signal_weights": {
            "efficiency":      0.30,   # value = efficiency
            "demand":          0.20,
            "low_friction":    0.20,
            "premium_price":  -0.20,
        },
        "conversion_base": 0.45,
        "conversion_weights": {"efficiency": 0.30, "low_friction": 0.15},
    },
    "Problem Solvers": {
        "base_intent": 58.0,          # high — they HAVE a problem to solve
        "signal_weights": {
            "demand":          0.20,
            "review_sentiment": 0.30,  # need proof the product works
            "low_friction":    0.20,
            "velocity":        0.10,
        },
        "conversion_base": 0.52,
        "conversion_weights": {"review_sentiment": 0.25, "low_friction": 0.20},
    },
    "First-Time Buyers": {
        "base_intent": 25.0,          # low — uncertain, need hand-holding
        "signal_weights": {
            "review_sentiment": 0.40,  # CRITICAL for first-timers
            "low_friction":    0.35,
            "demand":          0.10,
            "low_hhi":         0.10,   # fragmented = more choice anxiety
        },
        "conversion_base": 0.20,
        "conversion_weights": {"review_sentiment": 0.35, "low_friction": 0.30},
    },
    "Category Experts": {
        "base_intent": 62.0,          # high — they know exactly what they want
        "signal_weights": {
            "demand":          0.15,
            "review_sentiment": 0.20,
            "premium_price":   0.15,
            "efficiency":      0.20,
        },
        "conversion_base": 0.58,
        "conversion_weights": {"efficiency": 0.20, "review_sentiment": 0.15},
    },
    "Switchers": {
        "base_intent": 44.0,
        "signal_weights": {
            "demand":          0.20,
            "efficiency":      0.20,
            "low_hhi":         0.25,   # fragmented = more switch options
            "velocity":        0.15,
        },
        "conversion_base": 0.38,
        "conversion_weights": {"efficiency": 0.25, "velocity": 0.15},
    },
}


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
    channel_preference: str
    channel_scores: Dict[str, float]
    formula_notes: Dict[str, str]
    evidence: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AdoptionSimulationEngine:
    """
    Computes adoption metrics per psychographic cluster using archetype-aware
    formulas that produce realistic variance across segments.
    """

    def simulate(
        self,
        clusters: List[PsychographicCluster],
        dna: MarketDNA,
    ) -> List[ClusterAdoptionResult]:
        # Pre-compute shared DNA signals once
        signals = self._build_signals(dna)

        results = []
        for cluster in clusters:
            result = self._simulate_cluster(cluster, dna, signals)
            results.append(result)

        results.sort(key=lambda r: r.purchase_intent, reverse=True)
        logger.info(
            "Adoption simulation complete for %d clusters | "
            "avg_intent=%.1f | avg_conversion=%.3f | "
            "intent_range=%.1f–%.1f",
            len(results),
            sum(r.purchase_intent for r in results) / max(len(results), 1),
            sum(r.conversion_probability for r in results) / max(len(results), 1),
            min(r.purchase_intent for r in results) if results else 0,
            max(r.purchase_intent for r in results) if results else 0,
        )
        return results

    # ── Internal ──────────────────────────────────────────────────────────────

    def _build_signals(self, dna: MarketDNA) -> Dict[str, float]:
        """
        Derive normalized (0–1) signals from MarketDNA.
        These are anchored to real dataset values and vary per upload.
        """
        # Core signals (0–1 normalized)
        demand_n     = min((dna.demand_score or 50.0) / 100.0, 1.0)
        velocity_n   = min((dna.demand_velocity or 50.0) / 100.0, 1.0)
        efficiency_n = min((dna.conversion_efficiency or 50.0) / 100.0, 1.0)
        hhi_n        = min((dna.hhi_score or 2500.0) / 10000.0, 1.0)
        sentiment_n  = min((dna.review_sentiment_score or 50.0) / 100.0, 1.0)

        # Friction: more friction = worse for conversion
        friction_count = dna.friction_keyword_count or 0
        friction_n   = max(0.0, 1.0 - min(friction_count / 500.0, 1.0))  # inverted: 1 = no friction

        # Price tier: high ceiling relative to floor = premium market
        floor = dna.market_price_floor or 5.0
        ceil  = dna.market_price_ceiling or 50.0
        mid   = (floor + ceil) / 2.0
        # 0 = ultra-budget (<$15 midpoint), 1 = premium (>$100 midpoint)
        premium_n = min(mid / 100.0, 1.0)

        # Recoverable revenue signal (large recoverable = big market)
        recoverable = dna.recoverable_revenue or 0.0
        recoverable_n = min(recoverable / 500_000.0, 1.0)

        return {
            "demand":          demand_n,
            "velocity":        velocity_n,
            "efficiency":      efficiency_n,
            "high_hhi":        hhi_n,
            "low_hhi":         1.0 - hhi_n,   # inverted: high = fragmented
            "review_sentiment": sentiment_n,
            "low_friction":    friction_n,
            "premium_price":   premium_n,
            "recoverable":     recoverable_n,
            # Raw price values for evidence logging
            "_price_floor":    floor,
            "_price_ceil":     ceil,
        }

    def _simulate_cluster(
        self,
        cluster: PsychographicCluster,
        dna: MarketDNA,
        signals: Dict[str, float],
    ) -> ClusterAdoptionResult:
        seg_name = cluster.name
        cfg = SEGMENT_ARCHETYPE_CONFIG.get(seg_name, SEGMENT_ARCHETYPE_CONFIG["Practical Buyers"])
        ct = cluster.centroid

        # ── Purchase Intent ────────────────────────────────────────────────────
        # Start from archetype base (unique per segment), apply dataset signal weights
        base = cfg["base_intent"]
        intent_boost = sum(
            signals.get(k, 0.0) * w * 25.0   # each signal contributes up to 25 pts at weight=1.0
            for k, w in cfg["signal_weights"].items()
        )
        # Secondary: centroid trait modifiers (small, prevents identical cluster outputs)
        trait_mod = (
            ct.get("quality_focused", 0.5) * 3.0
            + ct.get("convenience_focused", 0.5) * 2.0
            - ct.get("risk_aversion", 0.4) * 3.0
            + ct.get("trend_focused", 0.3) * 2.0
        )
        purchase_intent = round(min(98.0, max(5.0, base + intent_boost + trait_mod)), 2)

        # ── Conversion Probability ────────────────────────────────────────────
        base_conv = cfg["conversion_base"]
        conv_boost = sum(
            signals.get(k, 0.0) * w * 0.35   # each signal contributes up to 0.35 at weight=1.0
            for k, w in cfg.get("conversion_weights", {}).items()
        )
        # Centroid modifiers
        price_drag = ct.get("price_focused", 0.3) * (1.0 - signals.get("efficiency", 0.5)) * 0.08
        risk_drag  = ct.get("risk_aversion", 0.3) * (1.0 - signals.get("review_sentiment", 0.5)) * 0.10
        conv_prob  = round(min(0.95, max(0.04, base_conv + conv_boost - price_drag - risk_drag)), 4)

        # ── Trust Score ───────────────────────────────────────────────────────
        sentiment_proxy = signals.get("review_sentiment", 0.5) * 45
        brand_trust     = ct.get("brand_loyalty", 0.4) * 20
        low_friction_bonus = signals.get("low_friction", 0.5) * 15
        trust_score = round(min(100, max(5, 20 + sentiment_proxy + brand_trust + low_friction_bonus)), 2)

        # ── Emotional Resonance ───────────────────────────────────────────────
        theme_alignment = 1.0 if cluster.primary_theme not in ("General", "") else 0.5
        trend_aligned   = ct.get("trend_focused", 0.3) * theme_alignment * 35
        desire_aligned  = ct.get("quality_focused", 0.5) * theme_alignment * 25
        demand_boost    = signals.get("demand", 0.5) * 15
        resonance = round(min(100, max(5, 15 + trend_aligned + desire_aligned + demand_boost)), 2)

        # ── Switching Probability ──────────────────────────────────────────────
        sw_loyalty = (1.0 - ct.get("brand_loyalty", 0.5)) * 0.40
        sw_fragmented = signals.get("low_hhi", 0.5) * 0.15
        sw_cost_drag  = ct.get("switching_cost", 0.4) * -0.25
        sw_base = 0.30 + sw_loyalty + sw_fragmented + sw_cost_drag
        switching_probability = round(min(0.95, max(0.03, sw_base)), 4)

        # ── Channel Preference ────────────────────────────────────────────────
        amazon_score = (
            ct.get("convenience_focused", 0.5) * 38
            + (1.0 - ct.get("risk_aversion", 0.4)) * 18
            + signals.get("demand", 0.5) * 12
        )
        d2c_score = (
            ct.get("brand_loyalty", 0.4) * 28
            + ct.get("quality_focused", 0.5) * 18
            + ct.get("premium_willingness", 0.4) * 14
        )
        retail_score = (
            ct.get("risk_aversion", 0.3) * 24
            + (1.0 - ct.get("convenience_focused", 0.5)) * 18
        )
        social_score = (
            ct.get("trend_focused", 0.3) * 28
            + ct.get("sustainability_conscious", 0.3) * 12
        )
        channel_scores = {
            "Amazon": round(amazon_score, 1),
            "D2C": round(d2c_score, 1),
            "Retail": round(retail_score, 1),
            "Social Commerce": round(social_score, 1),
        }
        channel_preference = max(channel_scores, key=lambda c: channel_scores[c])

        # ── Formula notes ──────────────────────────────────────────────────────
        sig_contributions = ", ".join(
            f"{k}({signals.get(k, 0.0):.2f})×{w:.2f}={signals.get(k, 0.0)*w*25:.1f}pts"
            for k, w in cfg["signal_weights"].items()
        )
        formula_notes = {
            "purchase_intent": (
                f"base={base:.1f} + signal_boosts({sig_contributions}) + trait_mod={trait_mod:.1f} = {purchase_intent:.1f}"
            ),
            "conversion_probability": (
                f"base_conv={base_conv:.3f} + conv_boost={conv_boost:.3f} "
                f"- price_drag={price_drag:.3f} - risk_drag={risk_drag:.3f} = {conv_prob:.3f}"
            ),
            "trust_score": (
                f"20 + review_sentiment×45={sentiment_proxy:.1f} + brand_loyalty×20={brand_trust:.1f} "
                f"+ low_friction×15={low_friction_bonus:.1f} = {trust_score:.1f}"
            ),
            "switching_probability": f"{sw_base:.3f} (before clamp)",
        }

        evidence = {
            "segment_archetype":         seg_name,
            "archetype_base_intent":     base,
            "demand_score_used":         dna.demand_score,
            "demand_velocity_used":      dna.demand_velocity,
            "conversion_efficiency_used":dna.conversion_efficiency,
            "hhi_score_used":            dna.hhi_score,
            "recoverable_revenue_used":  dna.recoverable_revenue,
            "review_sentiment_used":     dna.review_sentiment_score,
            "friction_keyword_count":    dna.friction_keyword_count,
            "price_midpoint_approx":     (signals.get("_price_floor", 5.0) + signals.get("_price_ceil", 50.0)) / 2.0,
            "cluster_primary_theme":     cluster.primary_theme,
        }

        return ClusterAdoptionResult(
            cluster_id=cluster.cluster_id,
            cluster_name=cluster.name,
            population=cluster.population,
            percentage=cluster.percentage,
            purchase_intent=purchase_intent,
            conversion_probability=conv_prob,
            trust_score=trust_score,
            emotional_resonance=resonance,
            switching_probability=switching_probability,
            channel_preference=channel_preference,
            channel_scores=channel_scores,
            formula_notes=formula_notes,
            evidence=evidence,
        )
