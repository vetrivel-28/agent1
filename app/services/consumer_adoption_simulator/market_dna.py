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
        """
        Build the unified MarketDNA from all available engine results.
        Each field is extracted with safe .get() access — missing inputs are
        recorded in data_completeness but never crash the build.
        """
        raw: Dict[str, Any] = {}
        dc: Dict[str, bool] = {}  # data_completeness map

        # ── Demand ────────────────────────────────────────────────────────────
        demand_r = (demand_result or {}).get("results", {})
        raw["demand_score"] = self._get(demand_r, ["overall_demand_score"])
        raw["total_search_volume"] = self._get(demand_r, [
            "total_search_volume", "total_market_search_volume"
        ])
        raw["top_demand_themes"] = demand_r.get("demand_opportunity_database") or []
        raw["demand_momentum"] = self._get(demand_r, ["market_direction", "demand_trend"])
        dc["demand_score"] = raw["demand_score"] is not None

        # ── Demand Velocity ───────────────────────────────────────────────────
        vel_r = (demand_velocity_result or {}).get("results", {})
        raw["demand_velocity"] = self._get(vel_r, [
            "demand_velocity_score", "velocity_score", "overall_velocity"
        ])
        raw["demand_growth_rate"] = self._get(vel_r, ["growth_rate", "yoy_growth"])
        raw["search_volume_trend"] = self._get(vel_r, [
            "search_volume_trend", "search_trend_pct"
        ])
        raw["growth_trend"] = self._get(vel_r, [
            "market_phase", "growth_phase", "trend_direction"
        ])
        raw["category_trajectory"] = self._get(vel_r, [
            "category_trajectory", "market_phase"
        ])
        raw["market_momentum"] = self._get(vel_r, [
            "market_direction", "momentum_label"
        ])
        dc["demand_velocity"] = raw["demand_velocity"] is not None

        # ── SIEI / Inbound Efficiency ─────────────────────────────────────────
        siei_r = (siei_result or {}).get("results", {})
        raw["revenue_per_search"] = self._get(siei_r, [
            "revenue_per_1000_searches", "avg_revenue_per_1000_searches"
        ])
        raw["conversion_efficiency"] = self._get(siei_r, [
            "average_efficiency", "market_siei_score"
        ])
        raw["friction_keyword_count"] = self._get(siei_r, [
            "friction_count", "total_friction_keywords"
        ])
        raw["recoverable_revenue"] = self._get(siei_r, [
            "total_lost_revenue", "recoverable_revenue"
        ])
        raw["revenue_capture_rate"] = self._get(siei_r, [
            "category_health",
        ])
        # Flatten revenue capture rate from nested object if needed
        if isinstance(raw["revenue_capture_rate"], dict):
            rcc = raw["revenue_capture_rate"].get("demand_winner_ratio")
            raw["revenue_capture_rate"] = float(rcc.rstrip("%")) if isinstance(rcc, str) else rcc

        friction_rows = siei_r.get("friction_keywords") or siei_r.get("friction_rows") or []
        raw["top_friction_keywords"] = friction_rows[:10] if isinstance(friction_rows, list) else []

        high_intent = siei_r.get("demand_winners") or siei_r.get("high_intent_keywords_full") or []
        raw["high_revenue_keywords"] = high_intent[:10] if isinstance(high_intent, list) else []

        low_eff = siei_r.get("friction_keywords") or []
        raw["low_efficiency_keywords"] = low_eff[:10] if isinstance(low_eff, list) else []
        dc["conversion_efficiency"] = raw["conversion_efficiency"] is not None

        # ── HHI / Market Concentration ────────────────────────────────────────
        hhi_r = (hhi_result or {}).get("results", {})
        raw["hhi_score"] = self._get(hhi_r, ["hhi_score"])
        market_structure = hhi_r.get("market_structure", {})
        # Guard: market_structure must be a dict for _get to work
        if not isinstance(market_structure, dict):
            market_structure = {}
        raw["market_concentration_type"] = self._get(market_structure, [
            "concentration_type", "structure_type"
        ])
        raw["total_market_revenue"] = self._get(market_structure, [
            "total_market_revenue"
        ])
        raw["brand_dominance_top1"] = self._get(market_structure, [
            "top_1_share", "top1_share"
        ])
        brand_rankings = market_structure.get("brand_rankings") or []
        raw["top_brands"] = brand_rankings[:5] if isinstance(brand_rankings, list) else []

        # Competitive saturation: HHI normalized to 0-100
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
        # Derive a numeric midpoint from sweet spot range_label if possible
        mid = self._parse_price_midpoint(sweet.get("range_label", ""))
        if mid is not None:
            raw["sweet_spot_price_midpoint"] = mid
        dc["price_floor"] = raw["market_price_floor"] is not None

        # ── Revenue Momentum ─────────────────────────────────────────────────
        rm_r = (revenue_momentum_result or {}).get("results", {})
        raw["opportunity_gap"] = self._get(rm_r, [
            "opportunity_gap", "momentum_opportunity_gap"
        ])
        raw["revenue_density"] = self._get(rm_r, [
            "market_momentum_score", "overall_momentum"
        ])
        raw["revenue_efficiency"] = self._get(rm_r, [
            "revenue_efficiency_score"
        ])
        dc["revenue_density"] = raw["revenue_density"] is not None

        # ── Customer sentiment (from demand themes / BSR) ─────────────────────
        # Extract sentiment proxies from demand themes
        themes = raw["top_demand_themes"]
        raw["review_themes"] = [
            {"theme": t.get("segment", t.get("display_segment", "")),
             "demand_share": t.get("demand_share", 0),
             "opportunity_score": t.get("opportunity_score", 0)}
            for t in themes[:10]
            if isinstance(t, dict)
        ]
        # Extract pain points from review / segment names heuristically
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

        # Sentiment: proxy from review_efficiency in siei (higher = buyers satisfied)
        avg_eff = raw.get("conversion_efficiency")
        if avg_eff is not None:
            raw["review_sentiment_score"] = round(float(avg_eff), 1)
        else:
            raw["review_sentiment_score"] = None
        dc["review_sentiment"] = raw["review_sentiment_score"] is not None

        raw["data_completeness"] = dc

        logger.info(
            "MarketDNA built — completeness=%.1f%% (%d/%d fields)",
            sum(dc.values()) / max(len(dc), 1) * 100,
            sum(dc.values()),
            len(dc),
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
