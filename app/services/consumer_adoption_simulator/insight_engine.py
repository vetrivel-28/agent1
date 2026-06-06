"""
SimulationInsightEngine
========================
Generates evidence-backed, structured insights from Consumer Adoption Simulator
outputs.  This is a deterministic rule-based engine — no LLM required.
Every insight includes:
  - category
  - title
  - summary
  - evidence_signals (list of contributing data points with source attribution)
  - confidence_score (0-100)
  - supporting_segments (top 3 segment names)
  - action_items (list of concrete next steps)

Optionally enhanced with LLM-generated prose when a provider is available.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from app.utils.logger import get_logger

logger = get_logger("simulation_insight_engine")


# ─── Context Builder ─────────────────────────────────────────────────────────

class InsightContextBuilder:
    """
    Assembles a token-efficient structured context object from simulation outputs.
    Avoids raw data dumps — each section is a pre-summarised dict.
    """

    def build(
        self,
        market_dna: Dict[str, Any],
        population_summary: Dict[str, Any],
        psychographic_segments: List[Dict[str, Any]],
        adoption_results: Optional[List[Dict[str, Any]]] = None,
        resistance_results: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        segs = psychographic_segments or []
        ar   = adoption_results or segs      # segments already contain adoption
        rr   = resistance_results or segs    # segments already contain resistance

        # ── Demand signals ────────────────────────────────────────────────────
        demand_ctx = {
            "demand_score":         market_dna.get("demand_score"),
            "demand_velocity":      market_dna.get("demand_velocity"),
            "total_search_volume":  market_dna.get("total_search_volume"),
            "growth_trend":         market_dna.get("growth_trend"),
            "category_trajectory":  market_dna.get("category_trajectory"),
            "top_themes":           [t.get("theme") or t.get("segment","") for t in (market_dna.get("top_demand_themes") or [])[:5]],
        }

        # ── Revenue signals ───────────────────────────────────────────────────
        revenue_ctx = {
            "total_market_revenue":  market_dna.get("total_market_revenue"),
            "recoverable_revenue":   market_dna.get("recoverable_revenue"),
            "revenue_efficiency":    market_dna.get("revenue_efficiency"),
            "sweet_spot_price":      market_dna.get("sweet_spot_price"),
            "price_floor":           market_dna.get("market_price_floor"),
            "price_ceiling":         market_dna.get("market_price_ceiling"),
        }

        # ── Competition signals ───────────────────────────────────────────────
        comp_ctx = {
            "hhi_score":             market_dna.get("hhi_score"),
            "market_type":           market_dna.get("market_concentration_type"),
            "competitive_saturation":market_dna.get("competitive_saturation"),
            "brand_dominance_top1":  market_dna.get("brand_dominance_top1"),
            "top_brands":            [(b.get("brand") or "") for b in (market_dna.get("top_brands") or [])[:3]],
        }

        # ── Consumer signals ──────────────────────────────────────────────────
        consumer_ctx = {
            "conversion_efficiency": market_dna.get("conversion_efficiency"),
            "friction_keyword_count":market_dna.get("friction_keyword_count"),
            "recoverable_revenue":   market_dna.get("recoverable_revenue"),
            "avg_purchase_intent":   population_summary.get("avg_purchase_intent"),
            "avg_conversion_prob":   population_summary.get("avg_conversion_probability"),
            "avg_trust":             population_summary.get("avg_trust_score"),
            "avg_resonance":         population_summary.get("avg_emotional_resonance"),
            "avg_resistance":        population_summary.get("avg_resistance_index"),
            "dominant_channel":      population_summary.get("dominant_channel"),
        }

        # ── Segment summary table ─────────────────────────────────────────────
        seg_table = []
        for s in segs:
            r = s.get("resistance") or {}
            seg_table.append({
                "name":             s.get("cluster_name",""),
                "population":       s.get("population", 0),
                "pct":              s.get("percentage", 0),
                "intent":           s.get("purchase_intent", 0),
                "conversion":       s.get("conversion_probability", 0),
                "trust":            s.get("trust_score", 0),
                "resonance":        s.get("emotional_resonance", 0),
                "switching_prob":   s.get("switching_probability", 0),
                "channel":          s.get("channel_preference",""),
                "resistance_idx":   r.get("resistance_index", 0),
                "resistance_level": r.get("resistance_level",""),
                "primary_barrier":  r.get("primary_barrier",""),
                "motivations":      (s.get("motivations") or [])[:2],
                "objections":       (s.get("objections") or [])[:2],
            })

        return {
            "demand":   demand_ctx,
            "revenue":  revenue_ctx,
            "competition": comp_ctx,
            "consumer": consumer_ctx,
            "segments": seg_table,
            "total_consumers": population_summary.get("total_consumers", 1000),
        }


# ─── Core Insight Engine ─────────────────────────────────────────────────────

class SimulationInsightEngine:
    """
    Produces 8 structured insight categories from simulation context.
    All insights are deterministic (rule-based), no LLM dependency.
    """

    def generate(self, context: Dict[str, Any]) -> Dict[str, Any]:
        segs     = context.get("segments", [])
        demand   = context.get("demand", {})
        revenue  = context.get("revenue", {})
        comp     = context.get("competition", {})
        consumer = context.get("consumer", {})
        total    = context.get("total_consumers", 1000)

        insights = {
            "why_consumers_buy":         self._why_buy(segs, demand, consumer),
            "why_consumers_reject":      self._why_reject(segs, consumer, comp),
            "highest_opportunity":       self._highest_opportunity(segs, revenue, consumer),
            "most_recoverable":          self._most_recoverable(segs, revenue),
            "pricing_intelligence":      self._pricing_intel(segs, revenue, consumer),
            "messaging_intelligence":    self._messaging_intel(segs, demand),
            "competitive_threats":       self._competitive_threats(segs, comp),
            "retention_intelligence":    self._retention_intel(segs, consumer, demand),
            "launch_recommendation":     self._launch_recommendation(segs, demand, revenue, comp, consumer),
        }

        executive = self._executive_narrative(insights, demand, revenue, comp, consumer, total)
        action_plan = self._action_plan(insights)

        return {
            "insights":            insights,
            "executive_narrative": executive,
            "action_plan":         action_plan,
            "key_opportunities":   self._key_opportunities(insights),
            "key_risks":           self._key_risks(insights, comp, consumer),
        }

    # ── Individual insight generators ────────────────────────────────────────

    def _why_buy(self, segs, demand, consumer) -> Dict[str, Any]:
        avg_intent = consumer.get("avg_purchase_intent") or 50.0
        avg_trust  = consumer.get("avg_trust") or 50.0
        top_segs   = sorted(segs, key=lambda s: s.get("intent", 0), reverse=True)[:3]
        top_themes = demand.get("top_themes") or []

        all_motivations: List[str] = []
        for s in top_segs:
            all_motivations.extend(s.get("motivations") or [])
        unique_motivations = list(dict.fromkeys(all_motivations))[:5]

        evidence = []
        if demand.get("demand_score") is not None:
            evidence.append({
                "source": "Demand Strength Engine",
                "signal": f"Demand score {demand['demand_score']:.1f}/100",
                "interpretation": "Strong search demand indicates consumers are actively seeking this product.",
            })
        if consumer.get("conversion_efficiency") is not None:
            evidence.append({
                "source": "Inbound Efficiency Engine",
                "signal": f"Conversion efficiency {consumer['conversion_efficiency']:.1f}/100",
                "interpretation": "Keywords convert demand into revenue at this efficiency rate.",
            })
        if top_themes:
            evidence.append({
                "source": "Demand Intelligence",
                "signal": f"Top demand themes: {', '.join(top_themes[:3])}",
                "interpretation": "These themes represent the primary consumer need categories.",
            })

        drivers = unique_motivations or [
            "Value perception relative to alternatives",
            "Convenience and ease of purchase",
            "Quality signals and social proof",
        ]

        return {
            "category": "purchase_drivers",
            "title": "Why Consumers Buy",
            "summary": (
                f"The top {len(top_segs)} segments show average purchase intent of "
                f"{avg_intent:.1f}/100 with trust at {avg_trust:.1f}/100. "
                f"Primary purchase drivers are quality, convenience, and value alignment."
            ),
            "key_drivers": drivers,
            "evidence_signals": evidence,
            "confidence_score": self._conf(len(evidence), 3),
            "supporting_segments": [s["name"] for s in top_segs],
        }

    def _why_reject(self, segs, consumer, comp) -> Dict[str, Any]:
        avg_resistance = consumer.get("avg_resistance") or 40.0
        friction_kws   = consumer.get("friction_keyword_count") or 0
        top_barrier_segs = sorted(segs, key=lambda s: s.get("resistance_idx", 0), reverse=True)[:3]

        barriers: Dict[str, int] = {}
        for s in segs:
            b = s.get("primary_barrier", "")
            if b:
                barriers[b] = barriers.get(b, 0) + 1
        top_barriers = sorted(barriers.items(), key=lambda x: x[1], reverse=True)[:3]

        all_objections: List[str] = []
        for s in top_barrier_segs:
            all_objections.extend(s.get("objections") or [])
        unique_objections = list(dict.fromkeys(all_objections))[:4]

        evidence = [
            {
                "source": "Resistance Analysis Engine",
                "signal": f"Average resistance index: {avg_resistance:.1f}/100",
                "interpretation": "Higher scores indicate stronger barriers to first purchase.",
            },
        ]
        if friction_kws:
            evidence.append({
                "source": "Inbound Efficiency Engine",
                "signal": f"{friction_kws} friction keywords detected",
                "interpretation": "These keywords attract clicks but fail to convert — indicating intent-product mismatch.",
            })
        if comp.get("hhi_score") is not None:
            evidence.append({
                "source": "Market Concentration Engine",
                "signal": f"HHI score: {comp['hhi_score']:.0f}",
                "interpretation": "Market concentration increases competitor loyalty as a rejection barrier.",
            })

        return {
            "category": "rejection_drivers",
            "title": "Why Consumers Reject",
            "summary": (
                f"Average resistance index {avg_resistance:.1f}/100. "
                f"Top barriers: {', '.join(b for b, _ in top_barriers[:2]) if top_barriers else 'Habit Lock-In, Trust Barrier'}. "
                f"{friction_kws} friction keywords indicate conversion leakage from intent-product mismatch."
            ),
            "top_barriers": [{"barrier": b, "segment_count": c} for b, c in top_barriers],
            "key_objections": unique_objections,
            "evidence_signals": evidence,
            "confidence_score": self._conf(len(evidence), 3),
            "supporting_segments": [s["name"] for s in top_barrier_segs],
        }

    def _highest_opportunity(self, segs, revenue, consumer) -> Dict[str, Any]:
        if not segs:
            return self._empty_insight("highest_opportunity", "Highest Opportunity Segment")
        best = max(segs, key=lambda s: s.get("intent", 0) * (1 - s.get("resistance_idx", 50) / 200))
        recoverable = revenue.get("recoverable_revenue") or 0
        est_rev = recoverable * best.get("pct", 0) / 100 * best.get("conversion", 0.3)

        evidence = [
            {
                "source": "Adoption Simulation Engine",
                "signal": f"Purchase intent: {best.get('intent', 0):.1f}/100",
                "interpretation": f"Segment '{best['name']}' shows the best combined intent and low resistance.",
            },
            {
                "source": "Resistance Analysis Engine",
                "signal": f"Resistance index: {best.get('resistance_idx', 0):.1f}/100",
                "interpretation": "Low resistance means fewer barriers to first purchase.",
            },
        ]
        if recoverable:
            evidence.append({
                "source": "Inbound Efficiency Engine",
                "signal": f"Recoverable revenue pool: ${recoverable:,.0f}",
                "interpretation": f"Estimated ${est_rev:,.0f} addressable from this segment.",
            })

        return {
            "category": "highest_opportunity",
            "title": "Highest Opportunity Segment",
            "summary": (
                f"'{best['name']}' is the highest opportunity segment: "
                f"{best.get('pct', 0):.1f}% of population ({best.get('population', 0):,} consumers), "
                f"purchase intent {best.get('intent', 0):.1f}/100, "
                f"resistance {best.get('resistance_idx', 0):.1f}/100."
            ),
            "segment_name":       best["name"],
            "population":         best.get("population", 0),
            "purchase_intent":    best.get("intent", 0),
            "conversion_prob":    best.get("conversion", 0),
            "resistance_index":   best.get("resistance_idx", 0),
            "estimated_revenue":  round(est_rev, 2),
            "channel":            best.get("channel", "Amazon"),
            "evidence_signals":   evidence,
            "confidence_score":   self._conf(len(evidence), 3),
            "action_items": [
                f"Prioritise '{best['name']}' in launch campaigns with highest ad spend allocation.",
                f"Use '{best.get('channel','Amazon')}' as primary acquisition channel for this segment.",
                "Craft messaging around their top motivations to maximise conversion.",
            ],
        }

    def _most_recoverable(self, segs, revenue) -> Dict[str, Any]:
        if not segs:
            return self._empty_insight("most_recoverable", "Most Recoverable Segment")
        # Segment with low intent but low resistance = best uplift potential
        candidates = [s for s in segs if s.get("intent", 0) < 60]
        if not candidates:
            candidates = segs
        best = min(candidates, key=lambda s: s.get("resistance_idx", 100))
        lift = (100 - best.get("resistance_idx", 50)) * 0.4
        recoverable = revenue.get("recoverable_revenue") or 0
        est_lift_rev = recoverable * best.get("pct", 0) / 100 * lift / 100

        evidence = [
            {
                "source": "Adoption Simulation Engine",
                "signal": f"Current intent: {best.get('intent', 0):.1f}/100, potential lift: +{lift:.1f}",
                "interpretation": "Low intent combined with low resistance = best uplift candidate.",
            },
        ]
        if recoverable:
            evidence.append({
                "source": "Revenue Lift Simulation",
                "signal": f"Estimated recoverable revenue from this segment: ${est_lift_rev:,.0f}",
                "interpretation": "Resolving the primary barrier unlocks this revenue.",
            })

        return {
            "category": "most_recoverable",
            "title": "Most Recoverable Segment",
            "summary": (
                f"'{best['name']}' has the highest uplift potential: "
                f"current intent {best.get('intent', 0):.1f}/100, "
                f"resistance {best.get('resistance_idx', 0):.1f}/100 (lowest barrier). "
                f"Resolving '{best.get('primary_barrier', 'primary barrier')}' could add +{lift:.1f} intent points."
            ),
            "segment_name":       best["name"],
            "current_intent":     best.get("intent", 0),
            "potential_lift":     round(lift, 1),
            "primary_barrier":    best.get("primary_barrier", "—"),
            "estimated_lift_revenue": round(est_lift_rev, 2),
            "evidence_signals":   evidence,
            "confidence_score":   self._conf(len(evidence), 2),
            "action_items": [
                f"Target '{best['name']}' with re-engagement campaigns addressing '{best.get('primary_barrier','the primary barrier')}'.",
                "Test lower-price bundles or trial offers to reduce switching cost perception.",
                "Use testimonial and trust-building content to reduce trust barrier.",
            ],
        }

    def _pricing_intel(self, segs, revenue, consumer) -> Dict[str, Any]:
        floor   = revenue.get("price_floor")
        ceiling = revenue.get("price_ceiling")
        sweet   = revenue.get("sweet_spot_price")

        avg_budget = sum((s.get("dominant_traits") or {}).get("budget_sensitivity", 0.5) for s in segs) / max(len(segs), 1) if segs else 0.5
        avg_premium = sum((s.get("dominant_traits") or {}).get("premium_willingness", 0.4) for s in segs) / max(len(segs), 1) if segs else 0.4

        if avg_premium > 0.6:
            price_signal = "underpriced"
            price_advice = "Consumers demonstrate high premium willingness — current or planned price may leave margin on the table."
        elif avg_budget > 0.65:
            price_signal = "overpriced"
            price_advice = "High budget sensitivity across segments suggests pricing pressure — consider tiered entry pricing."
        else:
            price_signal = "appropriately_priced"
            price_advice = "Balanced budget sensitivity and premium willingness indicates the sweet spot range is competitive."

        evidence = []
        if floor is not None and ceiling is not None:
            evidence.append({
                "source": "Pricing Intelligence Engine",
                "signal": f"Price range ${floor:.2f} – ${ceiling:.2f}, sweet spot: {sweet or 'N/A'}",
                "interpretation": "Market price distribution from BlackBox dataset.",
            })
        evidence.append({
            "source": "Consumer Population Engine",
            "signal": f"Avg budget sensitivity: {avg_budget:.2f}, avg premium willingness: {avg_premium:.2f}",
            "interpretation": "Simulated consumer price psychology across all segments.",
        })

        return {
            "category": "pricing_intelligence",
            "title": "Pricing Intelligence",
            "summary": (
                f"Market signals suggest product is {price_signal.replace('_', ' ')}. "
                f"Sweet spot: {sweet or 'Not available'}. "
                f"{price_advice}"
            ),
            "price_signal":           price_signal,
            "price_floor":            floor,
            "price_ceiling":          ceiling,
            "sweet_spot":             sweet,
            "avg_budget_sensitivity": round(avg_budget, 3),
            "avg_premium_willingness":round(avg_premium, 3),
            "recommendation":         price_advice,
            "evidence_signals":       evidence,
            "confidence_score":       self._conf(len(evidence), 2),
            "action_items": [
                f"Position pricing within the {sweet or 'sweet spot'} range to maximise volume.",
                "Test a premium SKU for segments with premium_willingness > 0.6.",
                "Use value-stacking (bundles, warranties) to justify pricing to budget-sensitive segments.",
            ],
        }

    def _messaging_intel(self, segs, demand) -> Dict[str, Any]:
        if not segs:
            return self._empty_insight("messaging_intelligence", "Messaging Intelligence")
        top_segs = sorted(segs, key=lambda s: s.get("intent", 0), reverse=True)[:5]
        themes = demand.get("top_themes") or []

        segment_messages = []
        for s in top_segs:
            motives = s.get("motivations") or []
            primary_motive = motives[0] if motives else "quality and value"
            dominant_trait = next(iter((s.get("dominant_traits") or {})), "quality_focused")
            angle = self._message_angle(dominant_trait, s.get("channel", "Amazon"))
            segment_messages.append({
                "segment":            s["name"],
                "population":         s.get("population", 0),
                "primary_angle":      angle["angle"],
                "emotional_trigger":  angle["trigger"],
                "positioning":        angle["positioning"],
                "channel_tactic":     angle["channel_tactic"],
            })

        evidence = [
            {
                "source": "Psychographic Cluster Engine",
                "signal": f"Top demand themes: {', '.join(themes[:3])}",
                "interpretation": "These themes drive the messaging context for each segment.",
            },
            {
                "source": "Adoption Simulation Engine",
                "signal": "Segment motivations derived from trait profile and market signals",
                "interpretation": "Each segment's messaging angle is calibrated to its dominant psychographic traits.",
            },
        ]

        return {
            "category": "messaging_intelligence",
            "title": "Messaging Intelligence",
            "summary": (
                f"Identified {len(segment_messages)} high-priority segments requiring distinct messaging strategies. "
                f"Primary demand context: {', '.join(themes[:2]) or 'general market themes'}."
            ),
            "segment_messages": segment_messages,
            "evidence_signals":  evidence,
            "confidence_score":  self._conf(len(evidence), 2),
        }

    def _competitive_threats(self, segs, comp) -> Dict[str, Any]:
        hhi     = comp.get("hhi_score") or 0
        top_brands = comp.get("top_brands") or []
        dom_top1   = comp.get("brand_dominance_top1") or 0
        market_type = comp.get("market_type") or "unknown"

        loyal_segs = sorted(segs, key=lambda s: s.get("resistance_idx", 0), reverse=True)[:3]
        loyal_barriers = [(s["name"], s.get("primary_barrier","—")) for s in loyal_segs]

        vulnerable = sorted(segs, key=lambda s: s.get("switching_prob", 0), reverse=True)[:3]

        if hhi > 4000:
            threat_level = "Critical"
            threat_note  = "Monopolistic market — one or two giants dominate. Direct competition is extremely difficult."
        elif hhi > 2500:
            threat_level = "High"
            threat_note  = "Highly concentrated market. Significant loyalty barriers exist among top segments."
        elif hhi > 1500:
            threat_level = "Moderate"
            threat_note  = "Moderately concentrated. A few leaders hold meaningful share but the market is contestable."
        else:
            threat_level = "Low"
            threat_note  = "Fragmented market. No dominant player — opportunity for rapid share capture."

        evidence = [
            {
                "source": "Market Concentration Engine",
                "signal": f"HHI: {hhi:.0f}, market type: {market_type}, top brand share: {dom_top1:.1f}%",
                "interpretation": threat_note,
            },
        ]
        if top_brands:
            evidence.append({
                "source": "Market Concentration Engine",
                "signal": f"Dominant brands: {', '.join(top_brands[:3])}",
                "interpretation": "These brands hold the strongest loyalty barriers in the market.",
            })

        return {
            "category": "competitive_threats",
            "title": "Competitive Threat Analysis",
            "summary": (
                f"Threat level: {threat_level}. {threat_note} "
                f"Top brand controls {dom_top1:.1f}% market share."
            ),
            "threat_level":     threat_level,
            "hhi_score":        hhi,
            "market_type":      market_type,
            "top_brand_share":  dom_top1,
            "strongest_loyalty_segments": [{"segment": n, "barrier": b} for n, b in loyal_barriers],
            "vulnerable_segments": [{"segment": s["name"], "switching_prob": s.get("switching_prob", 0)} for s in vulnerable],
            "evidence_signals": evidence,
            "confidence_score": self._conf(len(evidence), 2),
            "action_items": [
                "Target vulnerable segments (highest switching probability) in first-launch campaigns.",
                "Avoid direct brand wars with top players — differentiate on unmet segment needs.",
                "Use competitive gaps in loyal segments as wedge messaging.",
            ],
        }

    def _retention_intel(self, segs, consumer, demand) -> Dict[str, Any]:
        vel   = demand.get("demand_velocity") or 50.0
        trend = demand.get("growth_trend") or "stable"
        avg_loyalty = sum((s.get("dominant_traits") or {}).get("brand_loyalty", 0.4) for s in segs) / max(len(segs), 1) if segs else 0.4
        avg_switching = sum(s.get("switching_prob", 0.3) for s in segs) / max(len(segs), 1) if segs else 0.3

        churn_risk = avg_switching * 100
        retention_strength = (avg_loyalty * 0.6 + (vel / 100) * 0.4) * 100

        if retention_strength >= 65:
            ret_label = "Strong"
        elif retention_strength >= 45:
            ret_label = "Moderate"
        else:
            ret_label = "Weak"

        # Top retention segments = highest loyalty * lowest switching
        ret_segs = sorted(segs, key=lambda s: (s.get("dominant_traits") or {}).get("brand_loyalty", 0) - s.get("switching_prob", 0.5), reverse=True)[:3]

        evidence = [
            {
                "source": "Consumer Population Engine",
                "signal": f"Avg brand loyalty: {avg_loyalty:.2f}, avg switching probability: {avg_switching:.2f}",
                "interpretation": "Brand loyalty vs switching probability determines long-term retention.",
            },
            {
                "source": "Demand Velocity Engine",
                "signal": f"Demand velocity: {vel:.1f}/100, trend: {trend}",
                "interpretation": "Higher velocity markets attract repeat buyers faster.",
            },
        ]

        return {
            "category": "retention_intelligence",
            "title": "Retention Intelligence",
            "summary": (
                f"Retention strength: {ret_label} ({retention_strength:.1f}/100). "
                f"Average churn risk: {churn_risk:.1f}%. "
                f"Brand loyalty avg: {avg_loyalty:.2f}. "
                f"Market trend ({trend}) {'supports' if trend in ('growing','accelerating') else 'limits'} repeat purchase velocity."
            ),
            "retention_strength":    round(retention_strength, 1),
            "retention_label":       ret_label,
            "avg_churn_risk_pct":    round(churn_risk, 1),
            "avg_brand_loyalty":     round(avg_loyalty, 3),
            "avg_switching_prob":    round(avg_switching, 3),
            "top_retention_segments":[s["name"] for s in ret_segs],
            "churn_drivers": [
                "High switching probability in budget-sensitive segments",
                "Low brand differentiation enables easy substitution",
                f"{'Strong' if vel > 60 else 'Weak'} demand velocity {'sustains' if vel > 60 else 'constrains'} repeat purchase cycle",
            ],
            "evidence_signals": evidence,
            "confidence_score": self._conf(len(evidence), 2),
            "action_items": [
                "Build loyalty programmes targeting top retention segments.",
                "Invest in post-purchase experience to reduce 30-day churn.",
                "Use email/re-targeting flows to capture repeat purchase window (M1→M3).",
            ],
        }

    def _launch_recommendation(self, segs, demand, revenue, comp, consumer) -> Dict[str, Any]:
        demand_score = demand.get("demand_score") or 50.0
        velocity     = demand.get("demand_velocity") or 50.0
        hhi          = comp.get("hhi_score") or 2500.0
        avg_intent   = consumer.get("avg_purchase_intent") or 50.0
        avg_resistance = consumer.get("avg_resistance") or 40.0
        recoverable  = revenue.get("recoverable_revenue") or 0.0

        # Score each launch strategy
        pioneer_score = (demand_score * 0.3 + velocity * 0.3 + avg_intent * 0.2 + (1 - hhi / 10000) * 0.2 * 100)
        pilot_score   = (100 - avg_resistance) * 0.4 + demand_score * 0.3 + 40 * 0.3
        category_score= (100 - hhi / 100) * 0.3 + velocity * 0.4 + demand_score * 0.3
        delay_score   = (100 - demand_score) * 0.5 + (hhi / 100) * 0.3 + 20

        scores = {
            "Launch First":    round(pioneer_score, 1),
            "Regional Pilot":  round(pilot_score, 1),
            "Build Category":  round(category_score, 1),
            "Delay Entry":     round(delay_score, 1),
        }
        recommended = max(scores, key=lambda k: scores[k])

        rationale_map = {
            "Launch First":   f"Demand score {demand_score:.0f}/100 + velocity {velocity:.0f}/100 support first-mover advantage. Market fragmentation (HHI {hhi:.0f}) reduces early-entrant risk.",
            "Regional Pilot": f"Average resistance {avg_resistance:.0f}/100 is non-trivial — a controlled pilot reduces capital risk while validating product-market fit.",
            "Build Category": f"Category velocity ({velocity:.0f}/100) is building — early category investment positions the brand as the default choice before peak competition.",
            "Delay Entry":    f"Demand is still developing ({demand_score:.0f}/100) and market is concentrated ({hhi:.0f} HHI) — waiting for clearer opportunity reduces downside.",
        }

        evidence = [
            {"source": "Demand Intelligence",      "signal": f"Demand score: {demand_score:.1f}/100",       "interpretation": "Higher score favours earlier launch."},
            {"source": "Demand Velocity Engine",   "signal": f"Velocity: {velocity:.1f}/100",                "interpretation": "Accelerating velocity favours first-mover."},
            {"source": "Market Concentration",     "signal": f"HHI: {hhi:.0f}",                              "interpretation": "Lower HHI = more room for new entrants."},
            {"source": "Adoption Simulation",      "signal": f"Avg intent: {avg_intent:.1f}/100",            "interpretation": "Consumer readiness for the category."},
            {"source": "Resistance Analysis",      "signal": f"Avg resistance: {avg_resistance:.1f}/100",    "interpretation": "Lower resistance = easier conversion."},
        ]
        if recoverable:
            evidence.append({"source": "Revenue Lift Analysis", "signal": f"Recoverable revenue: ${recoverable:,.0f}", "interpretation": "Establishes the revenue ceiling for launch."})

        scenario_details = []
        for name, score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
            scenario_details.append({
                "scenario":   name,
                "score":      score,
                "rationale":  rationale_map[name],
                "recommended": name == recommended,
            })

        return {
            "category": "launch_recommendation",
            "title": "Strategic Launch Recommendation",
            "summary": (
                f"Recommended strategy: '{recommended}'. "
                f"Score: {scores[recommended]:.1f}/100. "
                f"{rationale_map[recommended]}"
            ),
            "recommended_strategy": recommended,
            "strategy_score":       scores[recommended],
            "scenario_scores":      scenario_details,
            "evidence_signals":     evidence,
            "confidence_score":     self._conf(len(evidence), 5),
            "action_items": [
                f"Execute '{recommended}' launch playbook.",
                "Align product listings to top segment messaging angles.",
                "Set 90-day adoption KPI targets based on segment intent scores.",
                "Monitor friction keyword conversion weekly post-launch.",
            ],
        }

    # ── Executive narrative ───────────────────────────────────────────────────

    def _executive_narrative(self, insights, demand, revenue, comp, consumer, total) -> Dict[str, Any]:
        ds     = demand.get("demand_score") or 50.0
        vel    = demand.get("demand_velocity") or 50.0
        hhi    = comp.get("hhi_score") or 2500.0
        intent = consumer.get("avg_purchase_intent") or 50.0
        conv   = (consumer.get("avg_conversion_prob") or 0.3) * 100
        rec    = revenue.get("recoverable_revenue") or 0.0
        rec_str= f"${rec:,.0f}" if rec else "data unavailable"

        opportunity_seg = insights.get("highest_opportunity", {}).get("segment_name","—")
        launch_rec      = insights.get("launch_recommendation", {}).get("recommended_strategy","—")
        threat_lvl      = insights.get("competitive_threats", {}).get("threat_level","Moderate")
        price_sig       = insights.get("pricing_intelligence", {}).get("price_signal","appropriately_priced").replace("_"," ")
        ret_label       = insights.get("retention_intelligence", {}).get("retention_label","Moderate")

        narrative = (
            f"This market simulation analysed {total:,} consumers across "
            f"{len(insights.get('messaging_intelligence', {}).get('segment_messages', []))} psychographic segments "
            f"using real dataset signals. "
            f"\n\n"
            f"Demand is {'strong' if ds >= 65 else 'moderate' if ds >= 45 else 'weak'} at {ds:.1f}/100 with "
            f"{'accelerating' if vel >= 65 else 'stable' if vel >= 45 else 'slowing'} velocity ({vel:.1f}/100). "
            f"Average consumer purchase intent sits at {intent:.1f}/100 with expected conversion of {conv:.1f}%. "
            f"\n\n"
            f"Competitive pressure is {threat_lvl.lower()} (HHI {hhi:.0f}). "
            f"Product pricing appears {price_sig} relative to simulated consumer price psychology. "
            f"Retention outlook is {ret_label.lower()} — the M1–M3 window is critical for cohort retention. "
            f"\n\n"
            f"The highest opportunity segment is '{opportunity_seg}'. "
            f"Recoverable revenue from friction keyword optimisation: {rec_str}. "
            f"Recommended launch strategy: '{launch_rec}'."
        )

        return {
            "narrative":          narrative,
            "headline_metrics": {
                "demand_score":           ds,
                "demand_velocity":        vel,
                "avg_purchase_intent":    intent,
                "avg_conversion_pct":     round(conv, 1),
                "competitive_threat":     threat_lvl,
                "price_signal":           price_sig,
                "retention_label":        ret_label,
                "recoverable_revenue":    rec,
                "best_segment":           opportunity_seg,
                "recommended_launch":     launch_rec,
            }
        }

    def _action_plan(self, insights) -> List[Dict[str, Any]]:
        """
        Return top 5 actions ranked by business impact.
        Each action references a specific segment and expected effect.
        Priority order: highest_opportunity > most_recoverable > launch_recommendation >
                        competitive_threats > pricing_intelligence > retention_intelligence
        """
        plan = []
        priority = 1

        # Each entry: (insight_key, max_items_from_insight)
        ordered = [
            ("highest_opportunity",  1),
            ("most_recoverable",     1),
            ("launch_recommendation",1),
            ("competitive_threats",  1),
            ("pricing_intelligence", 1),
        ]

        for key, max_items in ordered:
            if priority > 5:
                break
            insight = insights.get(key, {})
            items = (insight.get("action_items") or [])[:max_items]
            for item in items:
                if priority > 5:
                    break
                # Enrich with segment context where available
                seg_name = insight.get("segment_name", "")
                category_label = key.replace("_", " ").title()
                plan.append({
                    "priority": priority,
                    "action": item,
                    "category": key,
                    "target_segment": seg_name,
                    "why": insight.get("summary", "")[:120] if insight.get("summary") else "",
                })
                priority += 1

        return plan[:5]

    def _key_opportunities(self, insights) -> List[Dict[str, Any]]:
        opps = []
        ho = insights.get("highest_opportunity", {})
        if ho.get("segment_name"):
            opps.append({
                "title":   f"Capture '{ho['segment_name']}' segment",
                "detail":  f"Intent {ho.get('purchase_intent',0):.0f}/100, est. revenue ${ho.get('estimated_revenue',0):,.0f}",
                "type":    "segment",
            })
        mr = insights.get("most_recoverable", {})
        if mr.get("segment_name"):
            opps.append({
                "title":   f"Recover '{mr['segment_name']}' segment",
                "detail":  f"Potential lift +{mr.get('potential_lift',0):.1f} intent pts, est. ${mr.get('estimated_lift_revenue',0):,.0f}",
                "type":    "uplift",
            })
        pi = insights.get("pricing_intelligence", {})
        if pi.get("price_signal") == "underpriced":
            opps.append({"title": "Premium Pricing Opportunity", "detail": pi.get("recommendation",""), "type": "pricing"})
        ri = insights.get("retention_intelligence", {})
        opps.append({"title": "Retention Programme", "detail": f"Avg churn risk {ri.get('avg_churn_risk_pct',0):.0f}% — M1–M3 re-engagement is high ROI.", "type": "retention"})
        return opps

    def _key_risks(self, insights, comp, consumer) -> List[Dict[str, Any]]:
        risks = []
        ct = insights.get("competitive_threats", {})
        if ct.get("threat_level") in ("High","Critical"):
            risks.append({"title": "Competitive Concentration Risk", "detail": f"{ct.get('threat_level')} competitive pressure (HHI {comp.get('hhi_score',0):.0f})", "severity": ct.get("threat_level","High")})
        wr = insights.get("why_consumers_reject", {})
        if (consumer.get("avg_resistance") or 0) > 55:
            risks.append({"title": "High Resistance Barrier", "detail": f"Avg resistance {consumer.get('avg_resistance',0):.0f}/100 — conversion will be slow without barrier-breaking tactics.", "severity": "High"})
        ri = insights.get("retention_intelligence", {})
        if ri.get("retention_label") == "Weak":
            risks.append({"title": "Weak Retention Outlook", "detail": "Low brand loyalty signals high churn risk post-initial purchase.", "severity": "Medium"})
        pi = insights.get("pricing_intelligence", {})
        if pi.get("price_signal") == "overpriced":
            risks.append({"title": "Price Resistance Risk", "detail": pi.get("recommendation",""), "severity": "Medium"})
        return risks

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _conf(available: int, total: int) -> float:
        return round(min(100, available / max(total, 1) * 100), 1)

    @staticmethod
    def _empty_insight(category: str, title: str) -> Dict[str, Any]:
        return {"category": category, "title": title, "summary": "Insufficient data.", "evidence_signals": [], "confidence_score": 0.0}

    @staticmethod
    def _message_angle(dominant_trait: str, channel: str) -> Dict[str, str]:
        map_: Dict[str, Dict[str, str]] = {
            "quality_focused":          {"angle": "Quality authority",     "trigger": "Trust & excellence",     "positioning": "Category quality leader",          "channel_tactic": "Detailed comparison content"},
            "convenience_focused":      {"angle": "Effortless solution",   "trigger": "Time savings",            "positioning": "Easiest path to outcome",           "channel_tactic": "One-click Amazon ads"},
            "price_focused":            {"angle": "Best value",            "trigger": "Smart buying",            "positioning": "Best ROI in category",              "channel_tactic": "Discount promotions"},
            "trend_focused":            {"angle": "Trending choice",       "trigger": "Social proof",            "positioning": "What everyone is buying now",        "channel_tactic": "Influencer social commerce"},
            "risk_aversion":            {"angle": "Safe & proven",         "trigger": "Reassurance",             "positioning": "Most trusted in category",           "channel_tactic": "Review-forward listing"},
            "sustainability_conscious": {"angle": "Responsible choice",    "trigger": "Values alignment",        "positioning": "Eco-certified market leader",        "channel_tactic": "Brand story content"},
            "health_conscious":         {"angle": "Health-first product",  "trigger": "Wellbeing",               "positioning": "Health-optimised alternative",       "channel_tactic": "Educational content ads"},
            "premium_willingness":      {"angle": "Premium experience",    "trigger": "Status & quality",        "positioning": "The premium standard",               "channel_tactic": "Lifestyle imagery"},
        }
        default = {"angle": "Value & quality", "trigger": "Rational benefit", "positioning": "Strong category choice", "channel_tactic": "Multi-channel approach"}
        return map_.get(dominant_trait, default)
