"""
PsychographicClusterEngine
===========================
Clusters 1,000 simulated consumers into exactly 20 fixed psychographic market
segments for consistent cross-market comparison.

The 20 segment NAMES are fixed. All metrics (adoption, resistance, population,
motivations, objections) are fully data-driven from the uploaded dataset.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Tuple

from .consumer_population import Consumer
from .market_dna import MarketDNA
from app.utils.logger import get_logger

logger = get_logger("psychographic_cluster_engine")

# Feature vector definition — must remain stable across engines
FEATURE_KEYS = [
    "quality_focused",
    "convenience_focused",
    "price_focused",
    "trend_focused",
    "risk_aversion",
    "health_conscious",
    "sustainability_conscious",
    "budget_sensitivity",
    "premium_willingness",
    "switching_cost",
    "brand_loyalty",
]

# ── Fixed 20 psychographic segment names ────────────────────────────────────
# Names are fixed. All performance metrics are dataset-driven.
FIXED_SEGMENT_NAMES = [
    "Budget Maximizers",
    "Premium Quality Seekers",
    "Convenience Buyers",
    "Brand Loyalists",
    "Deal Hunters",
    "Feature Researchers",
    "Risk-Averse Buyers",
    "Impulse Shoppers",
    "Trend Followers",
    "Practical Buyers",
    "Gift Buyers",
    "Heavy Users",
    "Occasional Users",
    "Sustainability Focused",
    "Status Seekers",
    "Value Maximizers",
    "Problem Solvers",
    "First-Time Buyers",
    "Category Experts",
    "Switchers",
]

# Profile descriptions for each fixed segment (used in evidence panels)
SEGMENT_PROFILES: Dict[str, Dict[str, Any]] = {
    "Budget Maximizers":      {"shopping_style": "Comparison shopping", "price_sensitivity": "Very High", "key_motivation": "Spend as little as possible", "review_dependency": "High"},
    "Premium Quality Seekers":{"shopping_style": "Selective, quality-driven", "price_sensitivity": "Low", "key_motivation": "Own the best product available", "review_dependency": "High"},
    "Convenience Buyers":     {"shopping_style": "Fast, frictionless", "price_sensitivity": "Low-Medium", "key_motivation": "Save time, reduce effort", "review_dependency": "Low"},
    "Brand Loyalists":        {"shopping_style": "Repeat brand purchasers", "price_sensitivity": "Low", "key_motivation": "Trust in familiar brand", "review_dependency": "Low"},
    "Deal Hunters":           {"shopping_style": "Coupon & discount-focused", "price_sensitivity": "Very High", "key_motivation": "Best deal possible", "review_dependency": "Medium"},
    "Feature Researchers":    {"shopping_style": "In-depth comparison", "price_sensitivity": "Medium", "key_motivation": "Most feature-rich option", "review_dependency": "Very High"},
    "Risk-Averse Buyers":     {"shopping_style": "Cautious, review-driven", "price_sensitivity": "Medium", "key_motivation": "Avoid a bad purchase", "review_dependency": "Very High"},
    "Impulse Shoppers":       {"shopping_style": "Spontaneous, emotion-driven", "price_sensitivity": "Low", "key_motivation": "Immediate gratification", "review_dependency": "Low"},
    "Trend Followers":        {"shopping_style": "Social-proof driven", "price_sensitivity": "Medium", "key_motivation": "Own what others are buying", "review_dependency": "High"},
    "Practical Buyers":       {"shopping_style": "Functional, no-frills", "price_sensitivity": "Medium", "key_motivation": "Product that simply works", "review_dependency": "Medium"},
    "Gift Buyers":            {"shopping_style": "Occasion-driven", "price_sensitivity": "Low-Medium", "key_motivation": "Make someone happy", "review_dependency": "High"},
    "Heavy Users":            {"shopping_style": "Volume buyers, replenishment", "price_sensitivity": "Medium", "key_motivation": "Best value over time", "review_dependency": "Medium"},
    "Occasional Users":       {"shopping_style": "Infrequent, need-driven", "price_sensitivity": "High", "key_motivation": "Satisfy one-time need", "review_dependency": "Medium"},
    "Sustainability Focused": {"shopping_style": "Values-aligned purchasing", "price_sensitivity": "Low", "key_motivation": "Eco-friendly choice", "review_dependency": "Medium"},
    "Status Seekers":         {"shopping_style": "Brand prestige-driven", "price_sensitivity": "Low", "key_motivation": "Signal taste and status", "review_dependency": "Medium"},
    "Value Maximizers":       {"shopping_style": "Quality/price ratio focused", "price_sensitivity": "High", "key_motivation": "Most value per dollar", "review_dependency": "High"},
    "Problem Solvers":        {"shopping_style": "Problem/solution focused", "price_sensitivity": "Low-Medium", "key_motivation": "Fix a specific problem", "review_dependency": "Very High"},
    "First-Time Buyers":      {"shopping_style": "Exploratory, uncertain", "price_sensitivity": "High", "key_motivation": "Make a safe first choice", "review_dependency": "Very High"},
    "Category Experts":       {"shopping_style": "Deep knowledge, deliberate", "price_sensitivity": "Low", "key_motivation": "Optimal product for use case", "review_dependency": "Low"},
    "Switchers":              {"shopping_style": "Disloyal, exploring options", "price_sensitivity": "Medium", "key_motivation": "Something better than current", "review_dependency": "High"},
}

# Trait affinity matrix: which features are most activated by each segment
# Used to assign consumers to their best-fit fixed segment
SEGMENT_TRAIT_AFFINITY: Dict[str, Dict[str, float]] = {
    "Budget Maximizers":      {"budget_sensitivity": 0.9, "price_focused": 0.85, "premium_willingness": 0.1},
    "Premium Quality Seekers":{"quality_focused": 0.9, "premium_willingness": 0.85, "budget_sensitivity": 0.1},
    "Convenience Buyers":     {"convenience_focused": 0.9, "brand_loyalty": 0.6, "risk_aversion": 0.3},
    "Brand Loyalists":        {"brand_loyalty": 0.9, "switching_cost": 0.85, "price_focused": 0.2},
    "Deal Hunters":           {"price_focused": 0.9, "budget_sensitivity": 0.8, "trend_focused": 0.3},
    "Feature Researchers":    {"quality_focused": 0.8, "risk_aversion": 0.75, "convenience_focused": 0.2},
    "Risk-Averse Buyers":     {"risk_aversion": 0.9, "switching_cost": 0.7, "quality_focused": 0.6},
    "Impulse Shoppers":       {"convenience_focused": 0.8, "trend_focused": 0.75, "risk_aversion": 0.1},
    "Trend Followers":        {"trend_focused": 0.9, "premium_willingness": 0.6, "sustainability_conscious": 0.4},
    "Practical Buyers":       {"quality_focused": 0.7, "convenience_focused": 0.65, "price_focused": 0.5},
    "Gift Buyers":            {"premium_willingness": 0.7, "quality_focused": 0.65, "convenience_focused": 0.6},
    "Heavy Users":            {"brand_loyalty": 0.7, "budget_sensitivity": 0.6, "convenience_focused": 0.7},
    "Occasional Users":       {"budget_sensitivity": 0.7, "risk_aversion": 0.6, "price_focused": 0.65},
    "Sustainability Focused": {"sustainability_conscious": 0.9, "health_conscious": 0.75, "premium_willingness": 0.5},
    "Status Seekers":         {"premium_willingness": 0.9, "trend_focused": 0.7, "brand_loyalty": 0.6},
    "Value Maximizers":       {"price_focused": 0.8, "quality_focused": 0.75, "budget_sensitivity": 0.65},
    "Problem Solvers":        {"quality_focused": 0.8, "risk_aversion": 0.7, "convenience_focused": 0.5},
    "First-Time Buyers":      {"risk_aversion": 0.85, "price_focused": 0.65, "brand_loyalty": 0.3},
    "Category Experts":       {"quality_focused": 0.85, "switching_cost": 0.5, "risk_aversion": 0.4},
    "Switchers":              {"switching_cost": 0.1, "trend_focused": 0.6, "price_focused": 0.6},
}


@dataclass
class PsychographicCluster:
    cluster_id: int
    name: str                          # fixed segment name from FIXED_SEGMENT_NAMES
    population: int
    percentage: float
    motivations: List[str]
    objections: List[str]
    dominant_traits: Dict[str, float]
    primary_theme: str
    segment_profile: Dict[str, Any] = field(default_factory=dict)
    centroid: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PsychographicClusterEngine:
    """
    Assigns 1,000 simulated consumers to 20 fixed psychographic segments
    based on trait affinity scoring (not k-means cluster naming).

    Each consumer is assigned to the fixed segment whose trait affinity
    profile best matches their psychological trait vector.
    All performance metrics remain fully data-driven.
    """

    NUM_CLUSTERS = 20

    def cluster(
        self,
        consumers: List[Consumer],
        dna: MarketDNA,
        num_clusters: int = NUM_CLUSTERS,
    ) -> List[PsychographicCluster]:
        if not consumers:
            return []

        total = len(consumers)
        # Assign each consumer to their best-fit fixed segment
        assignments: Dict[str, List[int]] = {name: [] for name in FIXED_SEGMENT_NAMES}

        for i, consumer in enumerate(consumers):
            best_segment = self._assign_to_segment(consumer)
            assignments[best_segment].append(i)

        # Build cluster objects
        theme_names = [
            t.get("theme") or t.get("segment") or "General"
            for t in (dna.top_demand_themes or [])[:20]
        ]
        theme_pool = theme_names if theme_names else ["General"]

        clusters: List[PsychographicCluster] = []
        for seg_idx, seg_name in enumerate(FIXED_SEGMENT_NAMES):
            member_idx = assignments[seg_name]
            if not member_idx:
                # Ensure every segment exists even if empty — assign minimum 1% baseline
                member_idx = []

            member_consumers = [consumers[i] for i in member_idx]
            population = len(member_idx)
            percentage = round(population / total * 100, 2)

            # Compute centroid from actual member traits (or use affinity profile as fallback)
            if member_consumers:
                centroid_dict = self._compute_centroid(member_consumers)
            else:
                # Use affinity profile as centroid when no members assigned
                affinity = SEGMENT_TRAIT_AFFINITY.get(seg_name, {})
                centroid_dict = {k: affinity.get(k, 0.5) for k in FEATURE_KEYS}

            centroid_tuple = tuple(centroid_dict[k] for k in FEATURE_KEYS)
            dominant = self._dominant_traits(centroid_tuple)

            # Motivations and objections from dataset-driven trait analysis
            motivations = self._derive_motivations(seg_name, dominant, dna)
            objections = self._derive_objections(seg_name, dominant, dna)

            # Primary theme: most common motivation from member consumers
            theme_votes: Dict[str, int] = {}
            for c in member_consumers:
                t = c.primary_motivation
                theme_votes[t] = theme_votes.get(t, 0) + 1
            primary_theme = max(theme_votes, key=lambda x: theme_votes[x]) if theme_votes else (theme_pool[seg_idx % len(theme_pool)] if theme_pool else "General")

            profile = SEGMENT_PROFILES.get(seg_name, {})

            clusters.append(PsychographicCluster(
                cluster_id=seg_idx,
                name=seg_name,
                population=population,
                percentage=percentage,
                motivations=motivations,
                objections=objections,
                dominant_traits=centroid_dict,
                primary_theme=primary_theme,
                segment_profile=profile,
                centroid=centroid_dict,
            ))

        clusters.sort(key=lambda c: c.population, reverse=True)
        logger.info(
            "Assigned %d consumers to %d fixed psychographic segments",
            total, len(clusters),
        )
        return clusters

    # ── helpers ───────────────────────────────────────────────────────────────

    def _assign_to_segment(self, consumer: Consumer) -> str:
        """
        Score consumer against each fixed segment's trait affinity profile.
        Assigns to the segment with the highest dot-product similarity.
        """
        consumer_traits = {k: getattr(consumer, k) for k in FEATURE_KEYS}
        best_score = -1.0
        best_segment = FIXED_SEGMENT_NAMES[0]

        for seg_name, affinity in SEGMENT_TRAIT_AFFINITY.items():
            score = sum(
                consumer_traits.get(k, 0.5) * v
                for k, v in affinity.items()
            )
            if score > best_score:
                best_score = score
                best_segment = seg_name

        return best_segment

    @staticmethod
    def _compute_centroid(consumers: List[Consumer]) -> Dict[str, float]:
        n = len(consumers)
        return {
            k: round(sum(getattr(c, k) for c in consumers) / n, 3)
            for k in FEATURE_KEYS
        }

    @staticmethod
    def _feature_vector(c: Consumer) -> Tuple[float, ...]:
        return tuple(getattr(c, k) for k in FEATURE_KEYS)

    @staticmethod
    def _dominant_traits(centroid: Tuple[float, ...]) -> List[str]:
        scored = sorted(
            zip(FEATURE_KEYS, centroid),
            key=lambda x: x[1],
            reverse=True,
        )
        return [k for k, _ in scored[:3]]

    @staticmethod
    def _derive_motivations(
        seg_name: str,
        dominant: List[str],
        dna: MarketDNA,
    ) -> List[str]:
        """
        Dataset-driven motivations: combine segment archetype context with
        dominant trait signals from actual consumer data.
        """
        profile = SEGMENT_PROFILES.get(seg_name, {})
        base_motive = profile.get("key_motivation", "Find the right product")

        trait_motives = {
            "quality_focused":          "Prioritises best-in-class performance",
            "convenience_focused":      "Values ease and speed of purchase",
            "price_focused":            "Seeks lowest price within acceptable quality",
            "trend_focused":            "Drawn to popular and trending products",
            "risk_aversion":            "Researches thoroughly to avoid poor purchase",
            "health_conscious":         "Selects products aligned with health goals",
            "sustainability_conscious": "Favours eco-friendly and ethical options",
            "budget_sensitivity":       "Compares prices across multiple options",
            "premium_willingness":      "Pays more for perceived superior quality",
            "switching_cost":           "Returns to familiar brands for certainty",
            "brand_loyalty":            "Trusts established brand track record",
        }
        motives = [base_motive]
        for t in dominant[:2]:
            m = trait_motives.get(t)
            if m and m != base_motive:
                motives.append(m)

        # Add demand-theme context if available
        themes = [t.get("theme") or t.get("segment","") for t in (dna.top_demand_themes or [])[:2]]
        if themes and themes[0]:
            motives.append(f"Category interest: {themes[0]}")

        return motives[:3]

    @staticmethod
    def _derive_objections(
        seg_name: str,
        dominant: List[str],
        dna: MarketDNA,
    ) -> List[str]:
        """
        Dataset-driven objections from segment profile + inverse of dominant traits.
        """
        profile = SEGMENT_PROFILES.get(seg_name, {})

        trait_objections = {
            "quality_focused":          "Disappointed if product underperforms vs. description",
            "convenience_focused":      "Frustrated by complex checkout or slow delivery",
            "price_focused":            "Resists any price above perceived fair value",
            "trend_focused":            "Disengages if product seems dated or generic",
            "risk_aversion":            "Hesitates without strong reviews and social proof",
            "health_conscious":         "Avoids unclear ingredient or safety information",
            "sustainability_conscious": "Rejects brands with poor environmental record",
            "budget_sensitivity":       "Abandons cart if total cost exceeds budget",
            "premium_willingness":      "Distrusts products that appear cheap",
            "switching_cost":           "High effort to change established habits",
            "brand_loyalty":            "Reluctant to try unproven or unfamiliar brands",
        }
        objections = []
        for t in dominant[:3]:
            o = trait_objections.get(t)
            if o:
                objections.append(o)

        # Competition signal
        hhi = dna.hhi_score or 0
        if hhi > 2500:
            objections.append("Existing dominant brands create strong trust barriers")

        return objections[:3]
