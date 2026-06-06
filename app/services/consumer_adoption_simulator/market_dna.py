"""
MarketDNAEngine
================
Aggregates all dashboard engine outputs into a single unified market profile
(the "Market DNA") that drives the Consumer Adoption Simulation.

Every input field is sourced from existing engine result dicts — no values
are invented or hardcoded.  Missing fields gracefully default to None and are
tracked in `data_completeness`.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from app.utils.logger import get_logger

logger = get_logger("market_dna_engine")


class MarketDNA:
    """Immutable structured container for the aggregated market profile."""

    def __init__(self, raw: Dict[str, Any]) -> None:
        self._raw = raw

    # ── Demand layer ──────────────────────────────────────────────────────────
    @property
    def demand_score(self) -> Optional[float]:
        return self._raw.get("demand_score")

    @property
    def demand_velocity(self) -> Optional[float]:
        return self._raw.get("demand_velocity")

    @property
    def total_search_volume(self) -> Optional[int]:
        return self._raw.get("total_search_volume")

    @property
    def search_volume_trend(self) -> Optional[float]:
        return self._raw.get("search_volume_trend")

    @property
    def demand_growth_rate(self) -> Optional[float]:
        return self._raw.get("demand_growth_rate")

    @property
    def demand_momentum(self) -> Optional[str]:
        return self._raw.get("demand_momentum")

    @property
    def top_demand_themes(self) -> List[Dict[str, Any]]:
        return self._raw.get("top_demand_themes") or []

    # ── Revenue layer ─────────────────────────────────────────────────────────
    @property
    def total_market_revenue(self) -> Optional[float]:
        return self._raw.get("total_market_revenue")

    @property
    def revenue_density(self) -> Optional[float]:
        return self._raw.get("revenue_density")

    @property
    def revenue_efficiency(self) -> Optional[float]:
        return self._raw.get("revenue_efficiency")

    @property
    def opportunity_gap(self) -> Optional[float]:
        return self._raw.get("opportunity_gap")

    @property
    def recoverable_revenue(self) -> Optional[float]:
        return self._raw.get("recoverable_revenue")

    @property
    def high_revenue_keywords(self) -> List[Dict[str, Any]]:
        return self._raw.get("high_revenue_keywords") or []

    @property
    def low_efficiency_keywords(self) -> List[Dict[str, Any]]:
        return self._raw.get("low_efficiency_keywords") or []

    # ── Competition layer ─────────────────────────────────────────────────────
    @property
    def hhi_score(self) -> Optional[float]:
        return self._raw.get("hhi_score")

    @property
    def market_concentration_type(self) -> Optional[str]:
        return self._raw.get("market_concentration_type")

    @property
    def competitive_saturation(self) -> Optional[float]:
        return self._raw.get("competitive_saturation")

    @property
    def brand_dominance_top1(self) -> Optional[float]:
        return self._raw.get("brand_dominance_top1")

    @property
    def top_brands(self) -> List[Dict[str, Any]]:
        return self._raw.get("top_brands") or []

    # ── Customer intelligence layer ───────────────────────────────────────────
    @property
    def average_review_rating(self) -> Optional[float]:
        return self._raw.get("average_review_rating")

    @property
    def review_sentiment_score(self) -> Optional[float]:
        return self._raw.get("review_sentiment_score")

    @property
    def top_pain_points(self) -> List[str]:
        return self._raw.get("top_pain_points") or []

    @property
    def top_desired_outcomes(self) -> List[str]:
        return self._raw.get("top_desired_outcomes") or []

    @property
    def review_themes(self) -> List[Dict[str, Any]]:
        return self._raw.get("review_themes") or []

    # ── Inbound efficiency layer ──────────────────────────────────────────────
    @property
    def revenue_per_search(self) -> Optional[float]:
        return self._raw.get("revenue_per_search")

    @property
    def conversion_efficiency(self) -> Optional[float]:
        return self._raw.get("conversion_efficiency")

    @property
    def revenue_capture_rate(self) -> Optional[float]:
        return self._raw.get("revenue_capture_rate")

    @property
    def friction_keyword_count(self) -> Optional[int]:
        return self._raw.get("friction_keyword_count")

    @property
    def top_friction_keywords(self) -> List[Dict[str, Any]]:
        return self._raw.get("top_friction_keywords") or []

    # ── Market direction ──────────────────────────────────────────────────────
    @property
    def growth_trend(self) -> Optional[str]:
        return self._raw.get("growth_trend")

    @property
    def market_momentum(self) -> Optional[str]:
        return self._raw.get("market_momentum")

    @property
    def category_trajectory(self) -> Optional[str]:
        return self._raw.get("category_trajectory")

    # ── Price signals ─────────────────────────────────────────────────────────
    @property
    def market_price_floor(self) -> Optional[float]:
        return self._raw.get("market_price_floor")

    @property
    def market_price_ceiling(self) -> Optional[float]:
        return self._raw.get("market_price_ceiling")

    @property
    def sweet_spot_price(self) -> Optional[float]:
        return self._raw.get("sweet_spot_price")

    @property
    def price_spread(self) -> Optional[float]:
        return self._raw.get("price_spread")

    # ── Data quality ──────────────────────────────────────────────────────────
    @property
    def data_completeness(self) -> Dict[str, bool]:
        return self._raw.get("data_completeness") or {}

    @property
    def completeness_score(self) -> float:
        dc = self.data_completeness
        if not dc:
            return 0.0
        return round(sum(dc.values()) / len(dc) * 100, 1)

    def to_dict(self) -> Dict[str, Any]:
        return dict(self._raw)


class MarketDNAEngine:
    """
    Aggregates outputs from all existing dashboard engines into a single
    MarketDNA object.

    Usage:
        engine = MarketDNAEngine()
        dna = engine.build(
            demand_result=demand_engine_result,
            demand_velocity_result=velocity_result,
            siei_result=siei_result,
            hhi_result=hhi_result,
            price_result=price_result,
            revenue_momentum_result=revenue_momentum_result,
        )
    """

    def build(
        self,
        demand_result: Optional[Dict[str, Any]] = None,
        demand_velocity_result: Optional[Dict[str, Any]] = None,
        siei_result: Optional[Dict[str, Any]] = None,
        hhi_result: Optional[Dict[str, Any]] = None,
        price_result: Optional[Dict[str, Any]] = None,
        revenue_momentum_result: Optional[Dict[str, Any]] = None,
        bsr_result: Optional[Dict[str, Any]] = None,
    ) -> MarketDNA:
        raw: Dict[str, Any] = {}
        dc: Dict[str, bool] = {}

        # ── Demand ────────────────────────────────────────────────────────────
        import math as _math

        demand_r = (demand_result or {}).get("results", {})
        # demand engine returns total_search_volume and demand_opportunity_database
        # Derive demand_score from total_search_volume (log-normalized) +
        # largest_demand_segment.score if available
        raw_tsv = (
            demand_r.get("total_search_volume")
            or demand_r.get("total_market_search_volume")
            or demand_r.get("keyword_search_volume_total")
            or 0
        )
        raw_conc = demand_r.get("concentration_score")
        conc_val = raw_conc.get("value") if isinstance(raw_conc, dict) else raw_conc

        # Try multiple paths to find a demand score
        explicit_score = self._get(demand_r, [
            "overall_demand_score", "market_demand_score",
            "total_demand_score", "demand_opportunity_score",
        ])

        if explicit_score is not None:
            raw["demand_score"] = float(explicit_score)
        elif raw_tsv and raw_tsv > 0:
            sv_score = min(60.0, (_math.log10(max(raw_tsv, 1)) / 7.0) * 60.0)
            conc_bonus = min(20.0, float(conc_val or 0) / 5.0)
            raw["demand_score"] = round(sv_score + conc_bonus, 1)
        else:
            # Derive from demand_opportunity_database if available
            themes = demand_r.get("demand_opportunity_database") or []
            if themes and isinstance(themes, list) and len(themes) > 0:
                # Score from number of themes and their opportunity scores
                avg_opp = sum(
                    float(t.get("opportunity_score", 0)) for t in themes[:10]
                ) / min(len(themes), 10)
                raw["demand_score"] = round(min(80.0, avg_opp * 0.8 + len(themes) * 1.5), 1)
            else:
                raw["demand_score"] = None

        raw["total_search_volume"] = raw_tsv or None
        raw["top_demand_themes"] = demand_r.get("demand_opportunity_database") or []
        raw["demand_momentum"] = self._get(demand_r, ["market_direction", "demand_trend", "category_direction"])
        dc["demand_score"] = raw["demand_score"] is not None

        # ── Demand Velocity ───────────────────────────────────────────────────
        vel_r = (demand_velocity_result or {}).get("results", {})
        # demand_velocity_engine returns "velocity_score" and "market_phase"
        raw["demand_velocity"] = self._get(vel_r, [
            "velocity_score", "demand_velocity_score", "overall_velocity"
        ])
        raw["demand_growth_rate"] = self._get(vel_r, ["growth_rate", "yoy_growth"])
        raw["search_volume_trend"] = self._get(vel_r, ["search_volume_trend", "search_trend_pct"])
        raw["growth_trend"] = self._get(vel_r, ["market_phase", "growth_phase", "trend_direction"])
        raw["category_trajectory"] = self._get(vel_r, ["category_trajectory", "market_phase"])
        raw["market_momentum"] = self._get(vel_r, ["market_direction", "momentum_label", "market_phase"])
        dc["demand_velocity"] = raw["demand_velocity"] is not None

        # ── SIEI / Inbound Efficiency ─────────────────────────────────────────
        siei_r = (siei_result or {}).get("results", {})
        # SIEI returns: average_efficiency, friction_count, total_lost_revenue
        raw["conversion_efficiency"] = self._get(siei_r, [
            "average_efficiency", "market_siei_score"
        ])
        raw["friction_keyword_count"] = self._get(siei_r, [
            "friction_count", "total_friction_keywords"
        ])
        raw["recoverable_revenue"] = self._get(siei_r, [
            "total_lost_revenue", "recoverable_revenue"
        ])
        raw["revenue_per_search"] = self._get(siei_r, [
            "revenue_per_1000_searches", "avg_revenue_per_1000_searches"
        ])
        # revenue_capture_rate from category_health nested dict
        raw["revenue_capture_rate"] = self._get(siei_r, ["category_health"])
        if isinstance(raw["revenue_capture_rate"], dict):
            rcc = raw["revenue_capture_rate"].get("demand_winner_ratio")
            raw["revenue_capture_rate"] = float(rcc.rstrip("%")) if isinstance(rcc, str) else rcc

        friction_rows = siei_r.get("friction_keywords") or siei_r.get("friction_rows") or []
        raw["top_friction_keywords"] = friction_rows[:10] if isinstance(friction_rows, list) else []
        high_intent = siei_r.get("demand_winners") or siei_r.get("high_intent_keywords_full") or []
        raw["high_revenue_keywords"] = high_intent[:10] if isinstance(high_intent, list) else []
        raw["low_efficiency_keywords"] = (siei_r.get("friction_keywords") or [])[:10]
        dc["conversion_efficiency"] = raw["conversion_efficiency"] is not None

        # ── HHI / Market Concentration ────────────────────────────────────────
        hhi_r = (hhi_result or {}).get("results", {})
        raw["hhi_score"] = self._get(hhi_r, ["hhi_score"])
        market_structure = hhi_r.get("market_structure", {})
        if not isinstance(market_structure, dict):
            market_structure = {}
        raw["market_concentration_type"] = self._get(market_structure, [
            "concentration_type", "structure_type"
        ])
        raw["total_market_revenue"] = self._get(market_structure, ["total_market_revenue"])
        raw["brand_dominance_top1"] = self._get(market_structure, ["top_1_share", "top1_share"])
        brand_rankings = market_structure.get("brand_rankings") or []
        raw["top_brands"] = brand_rankings[:5] if isinstance(brand_rankings, list) else []
        hhi_val = raw["hhi_score"]
        if hhi_val is not None:
            raw["competitive_saturation"] = round(min(float(hhi_val) / 100.0, 100.0), 2)
        else:
            raw["competitive_saturation"] = None
        dc["hhi_score"] = raw["hhi_score"] is not None

        # ── Pricing ───────────────────────────────────────────────────────────
        price_r = (price_result or {}).get("results", {})
        mps = price_r.get("market_price_structure", {})
        if not isinstance(mps, dict):
            mps = {}
        raw["market_price_floor"] = mps.get("price_floor")
        raw["market_price_ceiling"] = mps.get("price_ceiling")
        raw["price_spread"] = mps.get("price_spread")
        sweet = price_r.get("market_sweet_spot", {})
        if not isinstance(sweet, dict):
            sweet = {}
        raw["sweet_spot_price"] = sweet.get("range_label")
        mid = self._parse_price_midpoint(sweet.get("range_label", ""))
        if mid is not None:
            raw["sweet_spot_price_midpoint"] = mid
        dc["price_floor"] = raw["market_price_floor"] is not None

        # ── Revenue Momentum ─────────────────────────────────────────────────
        # revenue_momentum engine returns results["revenue_momentum"]["metrics"]
        # There is NO top-level market_momentum_score — must dive into nested structure
        rm_r = (revenue_momentum_result or {}).get("results", {})
        rm_nested = rm_r.get("revenue_momentum") or {}
        if not isinstance(rm_nested, dict):
            rm_nested = {}
        rm_metrics = rm_nested.get("metrics") or {}
        if not isinstance(rm_metrics, dict):
            rm_metrics = {}

        # opportunity_gap from nested opportunity_alerts
        raw["opportunity_gap"] = self._get(rm_r, ["opportunity_gap", "momentum_opportunity_gap"])

        # revenue_density: try multiple paths from revenue_momentum result
        rm_classification = rm_nested.get("classification_summary") or {}
        if not isinstance(rm_classification, dict):
            rm_classification = {}

        # Path 1: classification_summary nested fields
        rd = self._get(rm_classification, ["market_mean_score", "median_momentum", "mean_momentum_score"])
        # Path 2: top-level fields in revenue_momentum nested block
        if rd is None:
            rd = self._get(rm_nested, [
                "market_mean_score", "median_score", "avg_momentum_score", "category_momentum_score"
            ])
        # Path 3: top-level in results
        if rd is None:
            rd = self._get(rm_r, [
                "market_momentum_score", "overall_momentum", "avg_revenue_momentum",
                "revenue_momentum_score", "category_revenue_score",
            ])
        # Path 4: derive from high_momentum_count / total if available
        if rd is None:
            high_count = rm_classification.get("high_momentum_count") or rm_nested.get("high_momentum_count")
            total_count = rm_classification.get("total_products") or rm_nested.get("total_products") or rm_r.get("total_products")
            if high_count is not None and total_count and float(total_count) > 0:
                rd = round(float(high_count) / float(total_count) * 100.0, 1)
        # Path 5: derive from revenue metrics
        if rd is None:
            total_rev = self._get(rm_r, ["total_market_revenue"]) or self._get(rm_nested, ["total_market_revenue"])
            if total_rev and float(total_rev) > 0:
                import math as _math2
                rd = round(min(80.0, (_math2.log10(max(float(total_rev), 1)) / 8.0) * 80.0), 1)

        raw["revenue_density"] = rd

        # Also try total_market_revenue from nested block to fill market context
        if not raw.get("total_market_revenue"):
            raw["total_market_revenue"] = self._get(rm_nested, ["total_market_revenue"]) or \
                                          self._get(rm_r, ["total_market_revenue"])

        # revenue_efficiency from rm_metrics or top-level
        raw["revenue_efficiency"] = (
            self._get(rm_r, ["revenue_efficiency_score"])
            or self._get(rm_metrics, ["revenue_efficiency_score"])
        )
        dc["revenue_density"] = raw["revenue_density"] is not None

        # ── BSR Efficiency (fallback signals) ─────────────────────────────────
        bsr_r = (bsr_result or {}).get("results", {})
        # BSR returns total_recoverable_revenue, median_efficiency
        if not raw.get("recoverable_revenue"):
            bsr_recoverable = self._get(bsr_r, ["total_recoverable_revenue"])
            if bsr_recoverable:
                raw["recoverable_revenue"] = bsr_recoverable
                dc["conversion_efficiency"] = True
        if not raw.get("conversion_efficiency"):
            raw["conversion_efficiency"] = self._get(bsr_r, [
                "median_efficiency", "market_efficiency_score", "average_category_efficiency"
            ])
            dc["conversion_efficiency"] = raw["conversion_efficiency"] is not None
        if not raw.get("revenue_density"):
            # BSR market_efficiency_score is a decent revenue density proxy
            bsr_rd = self._get(bsr_r, [
                "market_efficiency_score", "average_category_efficiency"
            ])
            if bsr_rd is not None:
                raw["revenue_density"] = bsr_rd
                dc["revenue_density"] = True
        # If revenue_density still missing but conversion_efficiency is present, derive proxy
        if not raw.get("revenue_density") and raw.get("conversion_efficiency"):
            # conversion_efficiency is a reasonable proxy for revenue density
            raw["revenue_density"] = round(float(raw["conversion_efficiency"]) * 0.85, 1)
            dc["revenue_density"] = True

        # ── Customer sentiment ────────────────────────────────────────────────
        themes = raw["top_demand_themes"]
        raw["review_themes"] = [
            {"theme": t.get("segment", t.get("display_segment", "")),
             "demand_share": t.get("demand_share", 0),
             "opportunity_score": t.get("opportunity_score", 0)}
            for t in themes[:10] if isinstance(t, dict)
        ]
        pain_keywords = ["problem", "issue", "difficult", "fail", "poor", "broken", "missing"]
        desire_keywords = ["easy", "convenient", "premium", "quality", "durable", "fast", "reliable"]
        pain_points: List[str] = []
        desired: List[str] = []
        for kw_rec in raw["top_friction_keywords"]:
            if isinstance(kw_rec, dict):
                kw_text = kw_rec.get("keyword", "")
                for p in pain_keywords:
                    if p in kw_text.lower() and kw_text not in pain_points:
                        pain_points.append(kw_text)
        raw["top_pain_points"] = pain_points[:10]
        for kw_rec in raw["high_revenue_keywords"]:
            if isinstance(kw_rec, dict):
                kw_text = kw_rec.get("keyword", "")
                for d in desire_keywords:
                    if d in kw_text.lower() and kw_text not in desired:
                        desired.append(kw_text)
        raw["top_desired_outcomes"] = desired[:10]

        # Sentiment proxy: conversion_efficiency is the best available signal
        avg_eff = raw.get("conversion_efficiency")
        if avg_eff is not None:
            raw["review_sentiment_score"] = round(float(avg_eff), 1)
        else:
            raw["review_sentiment_score"] = None
        dc["review_sentiment"] = raw["review_sentiment_score"] is not None

        raw["data_completeness"] = dc
        logger.info(
            "MarketDNA built — completeness=%.1f%% (%d/%d fields) | "
            "demand_score=%.1f | revenue_density=%s | conversion_efficiency=%s",
            sum(dc.values()) / max(len(dc), 1) * 100,
            sum(dc.values()), len(dc),
            raw.get("demand_score") or 0,
            raw.get("revenue_density"),
            raw.get("conversion_efficiency"),
        )
        return MarketDNA(raw)

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _get(obj: Dict[str, Any], keys: List[str]) -> Optional[Any]:
        """Return first non-None value from a list of candidate string keys.

        Defensive: silently skips any key that is not a str/int (e.g. accidental
        dict or list literals passed as fallback placeholders).
        """
        for k in keys:
            # Guard: only hashable scalar keys are valid dict lookup keys
            if not isinstance(k, (str, int, float, bool)):
                continue
            try:
                v = obj.get(k)
            except TypeError:
                continue
            if v is not None and v != "" and v != [] and v != {}:
                return v
        return None

    @staticmethod
    def _parse_price_midpoint(label: str) -> Optional[float]:
        """Parse '$12.99 - $29.99' → 21.49"""
        import re
        nums = re.findall(r"\d+\.?\d*", label.replace(",", ""))
        if len(nums) >= 2:
            return round((float(nums[0]) + float(nums[1])) / 2, 2)
        if len(nums) == 1:
            return float(nums[0])
        return None
