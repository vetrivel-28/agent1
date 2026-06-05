"""
PsychographicClusterEngine
===========================
Clusters 1,000 simulated consumers into up to 20 psychographic segments
using a lightweight k-means approach — no ML library dependency required.

Cluster names are dynamically derived from the dominant trait profile of each
cluster's centroid, not hardcoded labels.
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


@dataclass
class PsychographicCluster:
    cluster_id: int
    name: str                          # dynamically derived label
    population: int                    # head count
    percentage: float                  # share of total population
    motivations: List[str]             # top 3 motivations from dominant traits
    objections: List[str]              # top 3 likely purchase objections
    dominant_traits: Dict[str, float]  # mean trait scores for this cluster
    primary_theme: str                 # top MarketDNA theme associated
    centroid: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PsychographicClusterEngine:
    """
    Runs k-means (k=20) on the consumer feature vectors to create 20
    dynamically labelled psychographic segments.
    """

    NUM_CLUSTERS = 20
    MAX_ITER = 100

    def cluster(
        self,
        consumers: List[Consumer],
        dna: MarketDNA,
        num_clusters: int = NUM_CLUSTERS,
    ) -> List[PsychographicCluster]:
        if not consumers:
            return []

        num_clusters = min(num_clusters, len(consumers))
        vectors = [self._feature_vector(c) for c in consumers]

        # Seed centroids using k-means++ strategy for stable convergence
        centroids = self._kmeans_plus_plus_init(vectors, num_clusters, seed=42)
        assignments = [0] * len(vectors)

        for iteration in range(self.MAX_ITER):
            # Assignment step
            new_assignments = [self._nearest(v, centroids) for v in vectors]
            if new_assignments == assignments and iteration > 0:
                break
            assignments = new_assignments

            # Update step
            for k in range(num_clusters):
                members = [vectors[i] for i, a in enumerate(assignments) if a == k]
                if members:
                    centroids[k] = self._mean_vector(members)

        # Build cluster objects
        theme_names = [
            t.get("theme") or t.get("segment") or "General"
            for t in (dna.top_demand_themes or [])[:20]
        ]
        theme_pool = theme_names if theme_names else ["General"]

        clusters: List[PsychographicCluster] = []
        total = len(consumers)
        for k in range(num_clusters):
            member_idx = [i for i, a in enumerate(assignments) if a == k]
            if not member_idx:
                continue

            member_consumers = [consumers[i] for i in member_idx]
            centroid = centroids[k]
            dominant = self._dominant_traits(centroid)
            name = self._derive_name(dominant, centroid)
            motivations = self._derive_motivations(dominant, centroid)
            objections = self._derive_objections(dominant, centroid)

            # Associate cluster with its most represented MarketDNA theme
            theme_votes: Dict[str, int] = {}
            for c in member_consumers:
                t = c.primary_motivation
                theme_votes[t] = theme_votes.get(t, 0) + 1
            primary_theme = max(theme_votes, key=lambda x: theme_votes[x]) if theme_votes else "General"

            clusters.append(PsychographicCluster(
                cluster_id=k,
                name=name,
                population=len(member_idx),
                percentage=round(len(member_idx) / total * 100, 2),
                motivations=motivations,
                objections=objections,
                dominant_traits={
                    fk: round(centroid[fi], 3)
                    for fi, fk in enumerate(FEATURE_KEYS)
                },
                primary_theme=primary_theme,
                centroid={fk: round(centroid[fi], 3) for fi, fk in enumerate(FEATURE_KEYS)},
            ))

        clusters.sort(key=lambda c: c.population, reverse=True)
        logger.info(
            "Clustered %d consumers into %d psychographic segments",
            total, len(clusters),
        )
        return clusters

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _feature_vector(c: Consumer) -> Tuple[float, ...]:
        return tuple(getattr(c, k) for k in FEATURE_KEYS)

    @staticmethod
    def _mean_vector(vectors: List[Tuple[float, ...]]) -> Tuple[float, ...]:
        n = len(vectors)
        dim = len(vectors[0])
        return tuple(sum(v[i] for v in vectors) / n for i in range(dim))

    @staticmethod
    def _euclidean(a: Tuple[float, ...], b: Tuple[float, ...]) -> float:
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

    def _nearest(self, v: Tuple[float, ...], centroids: List[Tuple[float, ...]]) -> int:
        return min(range(len(centroids)), key=lambda k: self._euclidean(v, centroids[k]))

    def _kmeans_plus_plus_init(
        self,
        vectors: List[Tuple[float, ...]],
        k: int,
        seed: int,
    ) -> List[Tuple[float, ...]]:
        rng = random.Random(seed)
        centroids: List[Tuple[float, ...]] = [rng.choice(vectors)]
        for _ in range(k - 1):
            dists = [
                min(self._euclidean(v, c) ** 2 for c in centroids)
                for v in vectors
            ]
            total = sum(dists)
            if total == 0:
                break
            probs = [d / total for d in dists]
            cumulative = 0.0
            r = rng.random()
            for i, p in enumerate(probs):
                cumulative += p
                if r <= cumulative:
                    centroids.append(vectors[i])
                    break
        return centroids

    @staticmethod
    def _dominant_traits(centroid: Tuple[float, ...]) -> List[str]:
        """Return FEATURE_KEYS sorted descending by centroid score (top 3)."""
        scored = sorted(
            zip(FEATURE_KEYS, centroid),
            key=lambda x: x[1],
            reverse=True,
        )
        return [k for k, _ in scored[:3]]

    @staticmethod
    def _derive_name(dominant: List[str], centroid: Tuple[float, ...]) -> str:
        """
        Create a 2-word dynamic label from the top two dominant traits.
        Maps trait names to human-readable adjectives/nouns.
        """
        adj_map = {
            "quality_focused": "Quality",
            "convenience_focused": "Convenience",
            "price_focused": "Value",
            "trend_focused": "Trend",
            "risk_aversion": "Cautious",
            "health_conscious": "Health",
            "sustainability_conscious": "Eco",
            "budget_sensitivity": "Budget",
            "premium_willingness": "Premium",
            "switching_cost": "Loyal",
            "brand_loyalty": "Brand",
        }
        noun_map = {
            "quality_focused": "Seekers",
            "convenience_focused": "Buyers",
            "price_focused": "Hunters",
            "trend_focused": "Adopters",
            "risk_aversion": "Researchers",
            "health_conscious": "Advocates",
            "sustainability_conscious": "Shoppers",
            "budget_sensitivity": "Shoppers",
            "premium_willingness": "Buyers",
            "switching_cost": "Loyalists",
            "brand_loyalty": "Champions",
        }
        top1 = dominant[0] if dominant else "quality_focused"
        top2 = dominant[1] if len(dominant) > 1 else top1
        adj = adj_map.get(top1, "Savvy")
        noun = noun_map.get(top2, "Shoppers")
        return f"{adj} {noun}"

    @staticmethod
    def _derive_motivations(dominant: List[str], centroid: Tuple[float, ...]) -> List[str]:
        motive_map = {
            "quality_focused": "Seeks best-in-class product performance",
            "convenience_focused": "Values fast delivery and easy purchase",
            "price_focused": "Prioritizes lowest cost within budget",
            "trend_focused": "Drawn to new launches and trending products",
            "risk_aversion": "Researches extensively before purchasing",
            "health_conscious": "Prefers products aligned with health goals",
            "sustainability_conscious": "Favors eco-friendly and sustainable brands",
            "budget_sensitivity": "Makes purchase decisions based on affordability",
            "premium_willingness": "Willing to pay more for perceived quality",
            "switching_cost": "Stays with familiar brands to avoid disruption",
            "brand_loyalty": "Returns repeatedly to trusted brands",
        }
        return [motive_map[t] for t in dominant[:3] if t in motive_map]

    @staticmethod
    def _derive_objections(dominant: List[str], centroid: Tuple[float, ...]) -> List[str]:
        obj_map = {
            "quality_focused": "Disappointed by products that underperform vs. description",
            "convenience_focused": "Frustrated by slow shipping or complex checkout",
            "price_focused": "Resistant to products priced above perceived value",
            "trend_focused": "Disengages when product feels outdated or generic",
            "risk_aversion": "Hesitant without extensive reviews or social proof",
            "health_conscious": "Avoids products with unclear ingredient or material safety",
            "sustainability_conscious": "Rejects brands with poor environmental credentials",
            "budget_sensitivity": "Abandons cart when total price exceeds budget threshold",
            "premium_willingness": "Skeptical of low-priced alternatives as inferior",
            "switching_cost": "High perceived effort to learn or adopt new product",
            "brand_loyalty": "Reluctant to try unrecognized or new brands",
        }
        # Return objections from mid-range traits (where the challenge lies)
        idx_score = sorted(zip(FEATURE_KEYS, centroid), key=lambda x: x[1])
        mid_traits = [k for k, _ in idx_score[3:6]]
        return [obj_map[t] for t in mid_traits if t in obj_map][:3]
