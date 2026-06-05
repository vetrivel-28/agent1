"""
ConsumerPopulationEngine
========================
Generates 1,000 simulated consumers whose attributes are seeded entirely
from real MarketDNA signals — not random noise.

Every consumer attribute distribution is shaped by:
  - HHI / competition level  → brand loyalty skew
  - Revenue efficiency       → price sensitivity skew
  - Demand velocity          → trend-follower share
  - Friction rate            → trust barrier skew
  - Price floor / ceiling    → budget sensitivity range
  - Top demand themes        → category engagement topics
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

from .market_dna import MarketDNA
from app.utils.logger import get_logger

logger = get_logger("consumer_population_engine")

POPULATION_SIZE = 1000


@dataclass
class Consumer:
    consumer_id: str

    # Demographic
    age: int                   # 18 – 70
    income_band: str           # "Low" | "Middle" | "Upper Middle" | "High"
    occupation_type: str       # "Professional" | "Student" | "Homemaker" | "Retired" | "Freelance"
    family_status: str         # "Single" | "Couple" | "Family" | "Empty Nester"

    # Behavioral
    purchase_frequency: str    # "Frequent" | "Occasional" | "Rare"
    category_engagement: str   # "High" | "Medium" | "Low"
    amazon_activity: str       # "Heavy" | "Regular" | "Occasional" | "Rare"
    brand_loyalty: float       # 0.0 – 1.0 (1 = very loyal)

    # Psychological
    quality_focused: float     # 0.0 – 1.0
    convenience_focused: float
    price_focused: float
    trend_focused: float
    risk_aversion: float
    health_conscious: float
    sustainability_conscious: float

    # Economic
    budget_sensitivity: float  # 0.0 – 1.0 (1 = very sensitive)
    premium_willingness: float # 0.0 – 1.0 (1 = loves premium)
    switching_cost: float      # 0.0 – 1.0 (perceived cost of switching brands)

    # Context
    primary_motivation: str    # top demand theme from MarketDNA
    category_topics: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ConsumerPopulationEngine:
    """
    Generates POPULATION_SIZE consumers whose distribution is driven by
    real MarketDNA signals.  Uses a seeded deterministic PRNG so the same
    market inputs always produce the same population — reproducible analysis.
    """

    def generate(self, dna: MarketDNA, population_size: int = POPULATION_SIZE) -> List[Consumer]:
        """
        Return a list of Consumer objects seeded from dna.
        """
        seed = self._dna_seed(dna)
        rng = random.Random(seed)

        # ── Compute market-level priors from MarketDNA ────────────────────────
        priors = self._build_priors(dna)

        consumers: List[Consumer] = []
        for i in range(population_size):
            c = self._generate_one(i, rng, priors, dna)
            consumers.append(c)

        logger.info(
            "Generated %d consumers | seed=%d | price_sensitive_pct=%.1f%%",
            population_size,
            seed,
            sum(1 for c in consumers if c.price_focused > 0.6) / population_size * 100,
        )
        return consumers

    # ── Internal ──────────────────────────────────────────────────────────────

    def _dna_seed(self, dna: MarketDNA) -> int:
        """Produce a reproducible integer seed from key DNA signals."""
        parts = [
            str(round(dna.demand_score or 0, 2)),
            str(round(dna.hhi_score or 0, 2)),
            str(round(dna.total_search_volume or 0)),
            str(round(dna.conversion_efficiency or 0, 2)),
        ]
        digest = hashlib.md5("|".join(parts).encode()).hexdigest()
        return int(digest[:8], 16)

    def _build_priors(self, dna: MarketDNA) -> Dict[str, Any]:
        """
        Derive probability priors for each consumer attribute from DNA signals.
        These priors shift the distribution without hardcoding any values.
        """
        priors: Dict[str, Any] = {}

        # Brand loyalty: high HHI → fewer loyal customers (concentrated market = habitual buyers)
        # high hhi = established brands dominate → buyers used to existing brands = higher loyalty
        hhi_norm = min((dna.hhi_score or 2500) / 10000.0, 1.0)  # 10000 = max HHI
        priors["brand_loyalty_mean"] = 0.35 + hhi_norm * 0.35    # 0.35 – 0.70

        # Price sensitivity: low revenue efficiency → consumers are more price sensitive
        eff = (dna.conversion_efficiency or 50.0) / 100.0
        priors["price_focused_mean"] = max(0.1, 0.8 - eff * 0.5)  # lower eff → more price sensitive

        # Premium willingness: high sweet-spot price → category naturally premium
        price_ceil = dna.market_price_ceiling or 50.0
        price_floor = dna.market_price_floor or 5.0
        price_range = max(price_ceil - price_floor, 1.0)
        priors["premium_willingness_mean"] = min(0.9, price_range / 200.0 + 0.2)

        # Trend focus: high demand velocity → more trend-followers
        vel = (dna.demand_velocity or 50.0) / 100.0
        priors["trend_focused_mean"] = 0.2 + vel * 0.4   # 0.2 – 0.6

        # Risk aversion: high competitive saturation → consumers more risk-averse (many choices)
        sat = (dna.competitive_saturation or 25.0) / 100.0
        priors["risk_aversion_mean"] = 0.25 + sat * 0.5

        # Budget sensitivity: use price floor as proxy (cheap products = budget shoppers)
        priors["budget_sensitivity_mean"] = max(0.1, min(0.9, 1.0 - (price_floor / 100.0)))

        # Themes for motivation assignment
        theme_names = [
            t.get("theme") or t.get("segment") or "General"
            for t in (dna.top_demand_themes or [])[:5]
        ]
        priors["theme_names"] = theme_names if theme_names else ["General"]

        # Purchase frequency: high demand score → more frequent buyers
        demand_n = (dna.demand_score or 50.0) / 100.0
        priors["frequent_buyer_share"] = 0.2 + demand_n * 0.3   # 20–50%

        return priors

    def _generate_one(
        self,
        index: int,
        rng: random.Random,
        priors: Dict[str, Any],
        dna: MarketDNA,
    ) -> Consumer:
        consumer_id = f"C{index + 1:04d}"

        # ── Demographic ───────────────────────────────────────────────────────
        age = int(rng.gauss(38, 12))
        age = max(18, min(70, age))

        income_weights = self._income_weights_from_price(
            dna.market_price_floor, dna.market_price_ceiling
        )
        income_band = rng.choices(
            ["Low", "Middle", "Upper Middle", "High"],
            weights=income_weights,
        )[0]

        occupation = rng.choices(
            ["Professional", "Student", "Homemaker", "Retired", "Freelance"],
            weights=[40, 15, 20, 15, 10],
        )[0]

        family_status = rng.choices(
            ["Single", "Couple", "Family", "Empty Nester"],
            weights=[30, 25, 30, 15],
        )[0]

        # ── Behavioral ────────────────────────────────────────────────────────
        freq_share = priors["frequent_buyer_share"]
        purchase_frequency = rng.choices(
            ["Frequent", "Occasional", "Rare"],
            weights=[freq_share, 0.5, 0.5 - freq_share + 0.2],
        )[0]

        demand_n = (dna.demand_score or 50.0) / 100.0
        cat_eng = rng.choices(
            ["High", "Medium", "Low"],
            weights=[demand_n, 0.4, 1 - demand_n - 0.4 + 0.2],
        )[0]

        amazon_activity = rng.choices(
            ["Heavy", "Regular", "Occasional", "Rare"],
            weights=[20, 40, 30, 10],
        )[0]

        bl_mean = priors["brand_loyalty_mean"]
        brand_loyalty = self._clamp(rng.gauss(bl_mean, 0.15), 0, 1)

        # ── Psychological ─────────────────────────────────────────────────────
        pf_mean = priors["price_focused_mean"]
        price_focused = self._clamp(rng.gauss(pf_mean, 0.15), 0, 1)

        trend_mean = priors["trend_focused_mean"]
        trend_focused = self._clamp(rng.gauss(trend_mean, 0.15), 0, 1)

        ra_mean = priors["risk_aversion_mean"]
        risk_aversion = self._clamp(rng.gauss(ra_mean, 0.15), 0, 1)

        quality_focused = self._clamp(rng.gauss(0.55, 0.2), 0, 1)
        convenience_focused = self._clamp(rng.gauss(0.5, 0.2), 0, 1)
        health_conscious = self._clamp(rng.gauss(0.4, 0.2), 0, 1)
        sustainability_conscious = self._clamp(rng.gauss(0.35, 0.2), 0, 1)

        # ── Economic ─────────────────────────────────────────────────────────
        bs_mean = priors["budget_sensitivity_mean"]
        budget_sensitivity = self._clamp(rng.gauss(bs_mean, 0.15), 0, 1)

        pw_mean = priors["premium_willingness_mean"]
        premium_willingness = self._clamp(rng.gauss(pw_mean, 0.15), 0, 1)

        switching_cost = self._clamp(rng.gauss(0.4, 0.15), 0, 1)

        # ── Context ──────────────────────────────────────────────────────────
        theme_names = priors["theme_names"]
        primary_motivation = rng.choice(theme_names)
        category_topics = list(rng.sample(theme_names, min(3, len(theme_names))))

        return Consumer(
            consumer_id=consumer_id,
            age=age,
            income_band=income_band,
            occupation_type=occupation,
            family_status=family_status,
            purchase_frequency=purchase_frequency,
            category_engagement=cat_eng,
            amazon_activity=amazon_activity,
            brand_loyalty=round(brand_loyalty, 3),
            quality_focused=round(quality_focused, 3),
            convenience_focused=round(convenience_focused, 3),
            price_focused=round(price_focused, 3),
            trend_focused=round(trend_focused, 3),
            risk_aversion=round(risk_aversion, 3),
            health_conscious=round(health_conscious, 3),
            sustainability_conscious=round(sustainability_conscious, 3),
            budget_sensitivity=round(budget_sensitivity, 3),
            premium_willingness=round(premium_willingness, 3),
            switching_cost=round(switching_cost, 3),
            primary_motivation=primary_motivation,
            category_topics=category_topics,
        )

    @staticmethod
    def _income_weights_from_price(
        price_floor: Optional[float],
        price_ceiling: Optional[float],
    ) -> List[float]:
        """Shift income distribution based on price range of the category."""
        lo = price_floor or 5.0
        hi = price_ceiling or 50.0
        mid = (lo + hi) / 2.0
        if mid < 20:
            return [40, 35, 20, 5]     # budget category
        elif mid < 60:
            return [20, 40, 30, 10]    # mass market
        elif mid < 150:
            return [10, 25, 40, 25]    # premium
        else:
            return [5, 15, 35, 45]     # luxury

    @staticmethod
    def _clamp(val: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, val))
