"""
ResistanceAnalysisEngine
=========================
Computes consumer resistance barriers for each psychographic cluster.

Outputs per cluster:
  - Habit Lock-In          (0–100)
  - Competitor Loyalty     (0–100)
  - Trust Barrier          (0–100)
  - Price Resistance       (0–100)
  - Product Complexity     (0–100)
  - Education Requirement  (0–100)
  - ResistanceIndex        (0–100)  ← weighted composite

ResistanceIndex formula:
  HabitLockIn × 0.25
  + CompetitorLoyalty × 0.20
  + TrustBarrier × 0.20
  + PriceResistance × 0.20
  + (ProductComplexity + EducationRequirement) / 2 × 0.15

All signals derive from MarketDNA + cluster centroid.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List

from .psychographic_clusters import PsychographicCluster
from .market_dna import MarketDNA
from app.utils.logger import get_logger

logger = get_logger("resistance_analysis_engine")


@dataclass
class ClusterResistanceResult:
    cluster_id: int
    cluster_name: str
    population: int
    percentage: float

    habit_lock_in: float        # 0–100
    competitor_loyalty: float   # 0–100
    trust_barrier: float        # 0–100
    price_resistance: float     # 0–100
    product_complexity: float   # 0–100
    education_requirement: float # 0–100

    resistance_index: float     # 0–100 weighted composite
    resistance_level: str       # "Low" | "Medium" | "High" | "Critical"
    primary_barrier: str        # name of the highest barrier
    recommended_approach: str   # data-driven recommendation to overcome resistance

    component_weights: Dict[str, float]
    formula_notes: str
    evidence: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ResistanceAnalysisEngine:
    """
    Computes resistance barriers for each cluster using MarketDNA and cluster traits.
    """

    WEIGHTS = {
        "habit_lock_in": 0.25,
        "competitor_loyalty": 0.20,
        "trust_barrier": 0.20,
        "price_resistance": 0.20,
        "complexity_avg": 0.15,
    }

    def analyse(
        self,
        clusters: List[PsychographicCluster],
        dna: MarketDNA,
    ) -> List[ClusterResistanceResult]:
        results = [self._analyse_cluster(c, dna) for c in clusters]
        results.sort(key=lambda r: r.resistance_index, reverse=True)
        logger.info(
            "Resistance analysis complete for %d clusters | "
            "avg_index=%.1f",
            len(results),
            sum(r.resistance_index for r in results) / max(len(results), 1),
        )
        return results

    # ── Internal ──────────────────────────────────────────────────────────────

    def _analyse_cluster(
        self,
        cluster: PsychographicCluster,
        dna: MarketDNA,
    ) -> ClusterResistanceResult:
        ct = cluster.centroid

        # ── DNA-level signals ─────────────────────────────────────────────────
        hhi_n         = min((dna.hhi_score or 2500) / 10000.0, 1.0)
        efficiency_n  = (dna.conversion_efficiency or 50.0) / 100.0
        friction_rate = min((dna.friction_keyword_count or 0) / 1000.0, 1.0)
        price_ceil    = dna.market_price_ceiling or 50.0
        price_floor   = dna.market_price_floor or 5.0
        price_range_n = min((price_ceil - price_floor) / 200.0, 1.0)

        # ── Habit Lock-In ─────────────────────────────────────────────────────
        # High brand loyalty + high switching cost + concentrated market → locked in
        habit_lock_in = (
            ct.get("brand_loyalty", 0.4) * 40
            + ct.get("switching_cost", 0.4) * 30
            + hhi_n * 30
        )
        habit_lock_in = round(min(100, max(0, habit_lock_in)), 2)

        # ── Competitor Loyalty ────────────────────────────────────────────────
        # High brand loyalty + brand dominance in market
        brand_dom = (dna.brand_dominance_top1 or 20.0) / 100.0
        competitor_loyalty = (
            ct.get("brand_loyalty", 0.4) * 50
            + brand_dom * 50
        )
        competitor_loyalty = round(min(100, max(0, competitor_loyalty)), 2)

        # ── Trust Barrier ─────────────────────────────────────────────────────
        # High risk aversion + low market efficiency + many friction keywords
        trust_barrier = (
            ct.get("risk_aversion", 0.4) * 40
            + (1 - efficiency_n) * 30
            + friction_rate * 30
        )
        trust_barrier = round(min(100, max(0, trust_barrier)), 2)

        # ── Price Resistance ──────────────────────────────────────────────────
        # High price sensitivity + wide price spread (confusing for budget buyers)
        price_resistance = (
            ct.get("price_focused", 0.4) * 50
            + ct.get("budget_sensitivity", 0.4) * 30
            + price_range_n * 20
        )
        price_resistance = round(min(100, max(0, price_resistance)), 2)

        # ── Product Complexity ────────────────────────────────────────────────
        # High risk aversion in fragmented market = complexity overwhelm
        product_complexity = (
            ct.get("risk_aversion", 0.4) * 35
            + (1 - hhi_n) * 30          # fragmented = many choices = complex
            + (1 - ct.get("convenience_focused", 0.5)) * 20
            + 10                          # base complexity floor
        )
        product_complexity = round(min(100, max(0, product_complexity)), 2)

        # ── Education Requirement ─────────────────────────────────────────────
        # Low category engagement + high risk aversion → needs education before buy
        cat_eng_score = {
            "High": 0.8, "Medium": 0.5, "Low": 0.2,
        }.get(cluster.dominant_traits.get("category_engagement", "Medium"), 0.5)  # type: ignore
        education_requirement = (
            (1 - efficiency_n) * 35
            + ct.get("risk_aversion", 0.3) * 35
            + 30                          # base education floor for any product
        )
        education_requirement = round(min(100, max(0, education_requirement)), 2)

        # ── Composite ResistanceIndex ─────────────────────────────────────────
        complexity_avg = (product_complexity + education_requirement) / 2.0
        ri = (
            habit_lock_in * self.WEIGHTS["habit_lock_in"]
            + competitor_loyalty * self.WEIGHTS["competitor_loyalty"]
            + trust_barrier * self.WEIGHTS["trust_barrier"]
            + price_resistance * self.WEIGHTS["price_resistance"]
            + complexity_avg * self.WEIGHTS["complexity_avg"]
        )
        resistance_index = round(min(100, max(0, ri)), 2)

        if resistance_index >= 70:
            resistance_level = "Critical"
        elif resistance_index >= 50:
            resistance_level = "High"
        elif resistance_index >= 30:
            resistance_level = "Medium"
        else:
            resistance_level = "Low"

        # Primary barrier = highest individual score
        scores = {
            "Habit Lock-In": habit_lock_in,
            "Competitor Loyalty": competitor_loyalty,
            "Trust Barrier": trust_barrier,
            "Price Resistance": price_resistance,
            "Product Complexity": product_complexity,
            "Education Requirement": education_requirement,
        }
        primary_barrier = max(scores, key=lambda k: scores[k])

        recommended_approach = self._recommend(primary_barrier, cluster, dna)

        formula_notes = (
            f"ResistanceIndex = "
            f"HabitLockIn({habit_lock_in:.1f}) × {self.WEIGHTS['habit_lock_in']} "
            f"+ CompetitorLoyalty({competitor_loyalty:.1f}) × {self.WEIGHTS['competitor_loyalty']} "
            f"+ TrustBarrier({trust_barrier:.1f}) × {self.WEIGHTS['trust_barrier']} "
            f"+ PriceResistance({price_resistance:.1f}) × {self.WEIGHTS['price_resistance']} "
            f"+ AvgComplexity({complexity_avg:.1f}) × {self.WEIGHTS['complexity_avg']} "
            f"= {resistance_index:.1f}"
        )

        evidence = {
            "hhi_score_used": dna.hhi_score,
            "conversion_efficiency_used": dna.conversion_efficiency,
            "friction_keyword_count_used": dna.friction_keyword_count,
            "brand_dominance_top1_used": dna.brand_dominance_top1,
            "price_floor_used": dna.market_price_floor,
            "price_ceiling_used": dna.market_price_ceiling,
            "cluster_brand_loyalty": ct.get("brand_loyalty"),
            "cluster_switching_cost": ct.get("switching_cost"),
            "cluster_risk_aversion": ct.get("risk_aversion"),
            "cluster_price_focused": ct.get("price_focused"),
        }

        return ClusterResistanceResult(
            cluster_id=cluster.cluster_id,
            cluster_name=cluster.name,
            population=cluster.population,
            percentage=cluster.percentage,
            habit_lock_in=habit_lock_in,
            competitor_loyalty=competitor_loyalty,
            trust_barrier=trust_barrier,
            price_resistance=price_resistance,
            product_complexity=product_complexity,
            education_requirement=education_requirement,
            resistance_index=resistance_index,
            resistance_level=resistance_level,
            primary_barrier=primary_barrier,
            recommended_approach=recommended_approach,
            component_weights=dict(self.WEIGHTS),
            formula_notes=formula_notes,
            evidence=evidence,
        )

    @staticmethod
    def _recommend(barrier: str, cluster: PsychographicCluster, dna: MarketDNA) -> str:
        recs = {
            "Habit Lock-In": (
                "Reduce switching friction: offer trial sizes, free samples, or satisfaction "
                "guarantees. Highlight differentiated features not offered by habitual alternatives."
            ),
            "Competitor Loyalty": (
                "Run comparison campaigns vs. dominant brands using real dataset metrics. "
                "Target switchers via discount-first acquisition to build first-purchase momentum."
            ),
            "Trust Barrier": (
                "Invest in social proof: verified reviews, detailed product descriptions, and "
                "Q&A sections addressing top friction keyword themes."
            ),
            "Price Resistance": (
                "Offer bundle pricing or subscription tiers that shift perception from 'expensive' "
                "to 'value per use'. Clearly communicate ROI."
            ),
            "Product Complexity": (
                "Simplify discovery with comparison charts and use-case filters. "
                "Use visual content to reduce perceived complexity."
            ),
            "Education Requirement": (
                "Create short-form educational content mapped to top friction keyword questions. "
                "Address the most common buyer confusion points in listing copy."
            ),
        }
        return recs.get(barrier, "Analyse friction keywords and align product messaging to top demand themes.")
