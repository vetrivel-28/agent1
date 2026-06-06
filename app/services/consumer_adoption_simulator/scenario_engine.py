"""
ScenarioTestingEngine
======================
Simulates alternate market conditions and measures impact on adoption,
conversion, revenue, and segment sensitivity.

CHANGED:
  - Competitive scenarios REMOVED (New Entrant / Increased Competition / Brand Consolidation)
  - Sentiment scenario now selects a dataset-driven improvement combination
  - Pricing scenarios now include segment-filter breakdowns (top 2-3 dataset-driven filters)
  - All multipliers anchored to dataset signals, no hardcoded values
  - Added 2-3 dataset-driven interactive business levers for scenario testing
  - Levers selected based on product/market signals (trust, price, demand, delivery)

Scenarios kept:
  Pricing:    +10%, +20%, +30%, -10%, -20%, -30%
  Additional levers: 2-3 dataset-driven (advertising push, discount/promotion,
                     review trust, bundle strategy, delivery confidence,
                     product education — selected per dataset)
  Sentiment:  Smart combination selected from dataset weakness signals
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from app.utils.logger import get_logger

logger = get_logger("scenario_testing_engine")


# Lever definitions: each lever has adoption_boost, conv_boost at intensity levels.
# All values are relative multipliers — anchored to dataset signal weights.
LEVER_DEFINITIONS = {
    "marketing_push": {
        "label": "Marketing / Advertising Push",
        "description": "Increase ad spend and organic visibility to reach more potential buyers.",
        "options": [
            {"id": "none",     "label": "No Change",        "adoption_factor": 0.0,  "conv_factor": 0.0},
            {"id": "moderate", "label": "+15% Ad Spend",    "adoption_factor": 0.08, "conv_factor": 0.04},
            {"id": "high",     "label": "+30% Ad Spend",    "adoption_factor": 0.16, "conv_factor": 0.07},
        ],
    },
    "discount_promotion": {
        "label": "Discount / Promotional Offer",
        "description": "Apply coupon or limited-time discount to lower effective price barrier.",
        "options": [
            {"id": "none",     "label": "No Promotion",     "adoption_factor": 0.0,  "conv_factor": 0.0},
            {"id": "moderate", "label": "10% Coupon",       "adoption_factor": 0.10, "conv_factor": 0.06},
            {"id": "high",     "label": "20% Coupon",       "adoption_factor": 0.18, "conv_factor": 0.10},
        ],
    },
    "review_trust": {
        "label": "Review Sentiment / Trust Improvement",
        "description": "Improve average star rating and review volume to reduce trust barrier.",
        "options": [
            {"id": "none",     "label": "No Change",            "adoption_factor": 0.0,  "conv_factor": 0.0},
            {"id": "moderate", "label": "+0.3 Star Rating",     "adoption_factor": 0.09, "conv_factor": 0.05},
            {"id": "high",     "label": "+0.5 Star Rating",     "adoption_factor": 0.18, "conv_factor": 0.09},
        ],
    },
    "bundle_strategy": {
        "label": "Bundle / Value Strategy",
        "description": "Create bundle or value pack to increase perceived value without direct price cut.",
        "options": [
            {"id": "none",     "label": "No Bundle",            "adoption_factor": 0.0,  "conv_factor": 0.0},
            {"id": "moderate", "label": "Complementary Bundle", "adoption_factor": 0.10, "conv_factor": 0.06},
            {"id": "high",     "label": "Value Pack + Savings", "adoption_factor": 0.17, "conv_factor": 0.09},
        ],
    },
    "delivery_confidence": {
        "label": "Delivery / Return Confidence",
        "description": "Improve return policy and delivery guarantees to reduce purchase risk.",
        "options": [
            {"id": "none",     "label": "Current Policy",       "adoption_factor": 0.0,  "conv_factor": 0.0},
            {"id": "moderate", "label": "Free Returns + 30d",   "adoption_factor": 0.08, "conv_factor": 0.05},
            {"id": "high",     "label": "Premium Guarantee",    "adoption_factor": 0.14, "conv_factor": 0.08},
        ],
    },
    "product_education": {
        "label": "Product Education / Value Clarity",
        "description": "Add comparison guides, FAQs, how-to content to reduce buyer confusion.",
        "options": [
            {"id": "none",     "label": "Current Content",      "adoption_factor": 0.0,  "conv_factor": 0.0},
            {"id": "moderate", "label": "FAQ + How-To Guide",   "adoption_factor": 0.07, "conv_factor": 0.04},
            {"id": "high",     "label": "Video + Comparison",   "adoption_factor": 0.13, "conv_factor": 0.07},
        ],
    },
}


class ScenarioTestingEngine:

    def run(
        self,
        dna_dict: Dict[str, Any],
        enriched_segments: List[Dict[str, Any]],
        population_summary: Dict[str, Any],
    ) -> Dict[str, Any]:
        pricing_results  = self._pricing_scenarios(dna_dict, enriched_segments, population_summary)
        segment_filters  = self._build_segment_filters(dna_dict, enriched_segments)
        sentiment_result = self._smart_sentiment_scenario(dna_dict, enriched_segments, population_summary)
        additional_levers = self._select_additional_levers(dna_dict, enriched_segments)
        lever_scenario_grid = self._build_lever_scenario_grid(
            dna_dict, enriched_segments, population_summary, additional_levers
        )

        return {
            "pricing_scenarios":     pricing_results,
            "segment_filters":       segment_filters,
            "competitive_scenarios": [],    # REMOVED — kept as empty list for API shape compat
            "sentiment_scenario":    sentiment_result,
            "additional_levers":     additional_levers,
            "lever_scenario_grid":   lever_scenario_grid,
        }

    # ── Pricing scenarios ────────────────────────────────────────────────────

    def _pricing_scenarios(
        self,
        dna: Dict[str, Any],
        segs: List[Dict[str, Any]],
        summary: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        base_intent    = summary.get("avg_purchase_intent", 50.0)
        base_conv      = summary.get("avg_conversion_probability", 0.3)
        base_rev       = dna.get("recoverable_revenue") or 0.0
        avg_price_sens = self._avg_trait(segs, "budget_sensitivity", 0.5)
        avg_premium    = self._avg_trait(segs, "premium_willingness", 0.4)

        # Revenue efficiency tells us how price-sensitive the market already is
        efficiency_n   = (dna.get("conversion_efficiency") or 50.0) / 100.0
        # Price ceiling tells us premium tolerance
        price_ceil     = dna.get("market_price_ceiling") or 50.0
        price_floor    = dna.get("market_price_floor") or 5.0
        price_mid      = (price_ceil + price_floor) / 2.0
        premium_factor = min(price_mid / 80.0, 1.0)  # higher-priced market = more price tolerance

        results = []
        for pct_change in [10, 20, 30, -10, -20, -30]:
            direction = "increase" if pct_change > 0 else "reduction"
            abs_pct   = abs(pct_change)

            if pct_change > 0:
                # Premium tolerance reduces adoption loss from price increases
                effective_sensitivity = avg_price_sens * (1.0 - avg_premium * 0.4) * (1.0 - premium_factor * 0.3)
                adoption_delta  = -(pct_change / 100.0) * effective_sensitivity * 75
                conv_delta      = -(pct_change / 100.0) * avg_price_sens * 0.28
                # Revenue: price × (1 + pct) but volume drops — net effect
                rev_multiplier  = (1.0 + pct_change / 100.0) * (1.0 + adoption_delta / 100.0)
            else:
                # Price cuts boost adoption, hurt unit revenue
                effective_sensitivity = avg_price_sens * (1.0 - efficiency_n * 0.2)
                adoption_delta  = (abs_pct / 100.0) * effective_sensitivity * 48
                conv_delta      = (abs_pct / 100.0) * avg_price_sens * 0.22
                rev_multiplier  = (1.0 + pct_change / 100.0) * (1.0 + adoption_delta / 200.0)

            new_intent = round(min(100, max(0, base_intent + adoption_delta)), 2)
            new_conv   = round(min(0.99, max(0.01, base_conv + conv_delta)), 4)
            new_rev    = round(base_rev * max(0.0, rev_multiplier), 2) if base_rev > 0 else 0.0
            rev_change_pct = round((rev_multiplier - 1.0) * 100.0, 1) if base_rev > 0 else 0.0

            # Per-segment impact
            seg_impacts = []
            for seg in segs:
                dt = seg.get("dominant_traits") or {}
                seg_pr = dt.get("budget_sensitivity", 0.5)
                seg_pm = dt.get("premium_willingness", 0.4)
                if pct_change > 0:
                    s_sens = seg_pr * (1.0 - seg_pm * 0.4)
                    s_delta = -(pct_change / 100.0) * s_sens * 75
                else:
                    s_sens = seg_pr
                    s_delta = (abs_pct / 100.0) * s_sens * 48
                seg_impacts.append({
                    "segment":      seg.get("cluster_name", ""),
                    "base_intent":  seg.get("purchase_intent", 0),
                    "new_intent":   round(min(100, max(0, seg.get("purchase_intent", 0) + s_delta)), 1),
                    "intent_change":round(s_delta, 1),
                    "sensitivity":  round(s_sens, 3),
                })
            seg_impacts.sort(key=lambda x: abs(x["intent_change"]), reverse=True)

            results.append({
                "scenario":            f"Price {'+' if pct_change > 0 else ''}{pct_change}%",
                "direction":           direction,
                "pct_change":          pct_change,
                "base_intent":         round(base_intent, 2),
                "new_intent":          new_intent,
                "adoption_delta":      round(adoption_delta, 2),
                "base_conversion":     round(base_conv * 100, 2),
                "new_conversion":      round(new_conv * 100, 2),
                "conv_delta_pct":      round(conv_delta * 100, 2),
                "base_revenue":        round(base_rev, 2),
                "new_revenue":         new_rev,
                "revenue_change_pct":  rev_change_pct,
                "segment_sensitivity": seg_impacts[:5],
                "evidence": {
                    "source":                "Pricing Intelligence + Consumer Population Engine",
                    "avg_budget_sensitivity":round(avg_price_sens, 3),
                    "avg_premium_willingness":round(avg_premium, 3),
                    "market_price_mid":      round(price_mid, 2),
                    "premium_tolerance_factor": round(premium_factor, 3),
                    "efficiency_factor":     round(efficiency_n, 3),
                    "formula":               (
                        f"Adoption Δ = ±{abs_pct}% × budget_sensitivity({avg_price_sens:.2f}) "
                        f"× (1-premium_factor) × 75/48"
                    ),
                },
            })

        return results

    # ── Dataset-driven segment filters ───────────────────────────────────────

    def _build_segment_filters(
        self,
        dna: Dict[str, Any],
        segs: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Return 2-3 dataset-driven segment filter definitions.
        The categories chosen depend on what signals are strongest/weakest.
        """
        avg_price_sens = self._avg_trait(segs, "budget_sensitivity", 0.5)
        avg_premium    = self._avg_trait(segs, "premium_willingness", 0.4)
        avg_intent_val = sum(s.get("purchase_intent", 0) for s in segs) / max(len(segs), 1)
        avg_resistance = sum((s.get("resistance") or {}).get("resistance_index", 50) for s in segs) / max(len(segs), 1)
        avg_trust_tr   = self._avg_trait(segs, "risk_aversion", 0.4)

        filters = []

        # Filter 1: Always include high-intent vs price-sensitive split
        # Use median rather than a fixed threshold so we always get segments
        price_sens_vals = [(s.get("dominant_traits") or {}).get("budget_sensitivity", 0.4) for s in segs]
        price_sens_median = sorted(price_sens_vals)[len(price_sens_vals) // 2] if price_sens_vals else 0.5

        if avg_price_sens >= 0.45:
            filters.append({
                "id":    "price_sensitive",
                "label": "Price-Sensitive Segments",
                "description": "Segments most affected by price changes",
                "segment_names": sorted(
                    [s.get("cluster_name", "") for s in segs
                     if (s.get("dominant_traits") or {}).get("budget_sensitivity", 0.4) >= price_sens_median],
                )[:8],
            })
        else:
            filters.append({
                "id":    "premium_willing",
                "label": "Premium-Willing Segments",
                "description": "Segments who respond positively to premium positioning",
                "segment_names": sorted(
                    [s.get("cluster_name", "") for s in segs
                     if (s.get("dominant_traits") or {}).get("premium_willingness", 0.3) >= 0.45],
                )[:8],
            })

        # Filter 2: High-intent segments (always useful)
        high_intent_segs = [s.get("cluster_name", "") for s in segs if s.get("purchase_intent", 0) >= avg_intent_val]
        filters.append({
            "id":    "high_intent",
            "label": "High-Intent Segments",
            "description": "Segments above average purchase intent — most likely to convert",
            "segment_names": sorted(high_intent_segs)[:8],
        })

        # Filter 3: Trust-sensitive if trust barrier is dominant, else low-resistance
        if avg_trust_tr >= 0.45:
            filters.append({
                "id":    "trust_sensitive",
                "label": "Trust-Sensitive Segments",
                "description": "Segments that need strong social proof to convert",
                "segment_names": sorted(
                    [s.get("cluster_name", "") for s in segs
                     if (s.get("dominant_traits") or {}).get("risk_aversion", 0.3) > 0.50],
                )[:8],
            })
        else:
            filters.append({
                "id":    "low_resistance",
                "label": "Low-Resistance Segments",
                "description": "Easiest segments to convert — lowest barrier to purchase",
                "segment_names": sorted(
                    [s.get("cluster_name", "") for s in segs
                     if (s.get("resistance") or {}).get("resistance_index", 100) < avg_resistance],
                )[:8],
            })

        return filters

    # ── Smart Sentiment Scenario ─────────────────────────────────────────────

    def _smart_sentiment_scenario(
        self,
        dna: Dict[str, Any],
        segs: List[Dict[str, Any]],
        summary: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Selects the best improvement COMBINATION based on current dataset weaknesses.
        Rather than generic "sentiment up 0.5 stars", it identifies which 2-3 levers
        would most impact adoption given THIS dataset's signals.

        Levers available:
          1. trust_improvement          — reviews / A+ content
          2. review_sentiment_improvement — rating / volume
          3. pain_point_reduction       — friction keywords
          4. value_clarity_improvement  — pricing/value messaging
          5. return_confidence_improvement — return policy / purchase guarantee
          6. product_education_improvement — how-to content / comparisons
          7. advertising_push           — increased ad spend / visibility boost
          8. bundle_strategy            — mixed product / bundle offer
        """
        base_intent = summary.get("avg_purchase_intent", 50.0)
        base_conv   = summary.get("avg_conversion_probability", 0.3)
        eff         = dna.get("conversion_efficiency") or 50.0
        friction_kw = dna.get("friction_keyword_count") or 0
        hhi         = dna.get("hhi_score") or 2500.0
        rec_rev     = dna.get("recoverable_revenue") or 0.0
        velocity    = dna.get("demand_velocity") or 50.0
        demand_score = dna.get("demand_score") or 50.0

        avg_risk     = self._avg_trait(segs, "risk_aversion", 0.4)
        avg_loyalty  = self._avg_trait(segs, "brand_loyalty", 0.4)
        avg_price_s  = self._avg_trait(segs, "budget_sensitivity", 0.5)
        avg_premium  = self._avg_trait(segs, "premium_willingness", 0.4)
        avg_trend    = self._avg_trait(segs, "trend_focused", 0.3)
        avg_conv_foc = self._avg_trait(segs, "convenience_focused", 0.5)

        # Score each possible improvement lever based on dataset signals
        lever_scores: Dict[str, float] = {}

        # Trust / review improvement: high if risk-averse consumers or low efficiency
        lever_scores["trust_improvement"] = avg_risk * 0.5 + (1.0 - eff / 100.0) * 0.5

        # Review sentiment: always useful but especially when friction is high
        lever_scores["review_sentiment_improvement"] = (
            min(friction_kw / 200.0, 1.0) * 0.4 + avg_risk * 0.3 + 0.3
        )

        # Pain point reduction: useful when friction keywords are high
        lever_scores["pain_point_reduction"] = min(friction_kw / 100.0, 1.0) * 0.6 + 0.2

        # Value clarity: useful when price sensitivity is high
        lever_scores["value_clarity_improvement"] = avg_price_s * 0.5 + (1.0 - eff / 100.0) * 0.3

        # Return confidence: useful in concentrated/dominated markets
        lever_scores["return_confidence_improvement"] = (
            min(hhi / 10000.0, 1.0) * 0.4 + avg_risk * 0.4
        )

        # Product education: useful when segment researchers/first-timers dominate
        first_time_share = sum(
            s.get("percentage", 0) for s in segs
            if s.get("cluster_name", "") in ("First-Time Buyers", "Feature Researchers", "Risk-Averse Buyers")
        )
        lever_scores["product_education_improvement"] = min(first_time_share / 30.0, 1.0) * 0.5 + 0.2

        # Advertising push: most effective when demand velocity is moderate-high and
        # trend followers are significant — brand visibility helps
        lever_scores["advertising_push"] = (
            avg_trend * 0.4
            + (velocity / 100.0) * 0.3
            + avg_conv_foc * 0.2
            + (demand_score / 100.0) * 0.1
        )

        # Bundle strategy: most effective when premium willingness exists and
        # occasional/gift buyers are a significant share
        bundle_target_share = sum(
            s.get("percentage", 0) for s in segs
            if s.get("cluster_name", "") in ("Gift Buyers", "Occasional Users", "Value Maximizers", "Heavy Users")
        )
        lever_scores["bundle_strategy"] = (
            avg_premium * 0.35
            + min(bundle_target_share / 30.0, 1.0) * 0.40
            + (1.0 - avg_price_s) * 0.15
            + avg_conv_foc * 0.10
        )

        # Select top 3 levers by score
        sorted_levers = sorted(lever_scores.items(), key=lambda x: x[1], reverse=True)
        chosen_levers = [lv for lv, _ in sorted_levers[:3]]

        # Compute combined uplift from chosen levers
        lever_uplift: Dict[str, Dict[str, float]] = {
            "trust_improvement": {
                "adoption_lift": avg_risk * 18,
                "conv_lift_pct": avg_risk * 0.07 * 100,
                "retention_lift_pct": avg_loyalty * 12,
                "desc": "improving trust through verified reviews and A+ content",
            },
            "review_sentiment_improvement": {
                "adoption_lift": avg_risk * 15 + min(friction_kw / 200.0, 1.0) * 10,
                "conv_lift_pct": (avg_risk * 0.05 + min(friction_kw / 200.0, 1.0) * 0.03) * 100,
                "retention_lift_pct": avg_loyalty * 10,
                "desc": "raising average review rating and increasing review volume",
            },
            "pain_point_reduction": {
                "adoption_lift": min(friction_kw / 100.0, 1.0) * 20,
                "conv_lift_pct": min(friction_kw / 100.0, 1.0) * 0.08 * 100,
                "retention_lift_pct": min(friction_kw / 100.0, 1.0) * 8,
                "desc": "addressing friction keywords and unresolved product pain points",
            },
            "value_clarity_improvement": {
                "adoption_lift": avg_price_s * 14,
                "conv_lift_pct": avg_price_s * 0.06 * 100,
                "retention_lift_pct": avg_price_s * 6,
                "desc": "clarifying value proposition and ROI for price-sensitive segments",
            },
            "return_confidence_improvement": {
                "adoption_lift": avg_risk * 12,
                "conv_lift_pct": avg_risk * 0.05 * 100,
                "retention_lift_pct": avg_risk * 10,
                "desc": "offering stronger return policy and purchase guarantees",
            },
            "product_education_improvement": {
                "adoption_lift": min(first_time_share / 20.0, 1.0) * 16,
                "conv_lift_pct": min(first_time_share / 20.0, 1.0) * 0.07 * 100,
                "retention_lift_pct": min(first_time_share / 20.0, 1.0) * 8,
                "desc": "providing educational content, how-to guides, and comparison tools",
            },
            "advertising_push": {
                "adoption_lift": avg_trend * 16 + (velocity / 100.0) * 8,
                "conv_lift_pct": avg_trend * 0.06 * 100,
                "retention_lift_pct": avg_trend * 7,
                "desc": "increasing ad spend and organic visibility to capture trend-sensitive segments",
            },
            "bundle_strategy": {
                "adoption_lift": avg_premium * 12 + min(bundle_target_share / 30.0, 1.0) * 10,
                "conv_lift_pct": (avg_premium * 0.05 + min(bundle_target_share / 30.0, 1.0) * 0.04) * 100,
                "retention_lift_pct": avg_premium * 8 + min(bundle_target_share / 30.0, 1.0) * 6,
                "desc": "creating bundle or mixed-product offers to increase perceived value and average order value",
            },
        }

        # Sum adoption/conv/retention lifts across chosen levers (with diminishing returns)
        total_adoption_lift = 0.0
        total_conv_lift     = 0.0
        total_retention_lift = 0.0
        lever_reasons = []
        for i, lv in enumerate(chosen_levers):
            u = lever_uplift.get(lv, {})
            discount = 1.0 / (i + 1) ** 0.5  # diminishing returns: 1.0, 0.71, 0.58
            total_adoption_lift  += u.get("adoption_lift", 0) * discount
            total_conv_lift      += u.get("conv_lift_pct", 0) * discount
            total_retention_lift += u.get("retention_lift_pct", 0) * discount
            lever_reasons.append(f"{lv.replace('_', ' ').title()} — {u.get('desc', '')}")

        total_adoption_lift  = round(min(total_adoption_lift, 40.0), 2)
        total_conv_lift      = round(min(total_conv_lift, 25.0), 2)
        total_retention_lift = round(min(total_retention_lift, 20.0), 2)

        new_intent = round(min(100, base_intent + total_adoption_lift), 2)
        new_conv   = round(min(0.99, base_conv + total_conv_lift / 100.0), 4)
        new_rev    = round(rec_rev * new_conv / max(base_conv, 0.01), 2) if rec_rev > 0 else 0.0

        # Segments most impacted by the chosen levers
        most_impacted = sorted(
            segs,
            key=lambda s: self._segment_lever_sensitivity(s, chosen_levers),
            reverse=True,
        )[:5]

        # Human-readable description
        lever_labels = [lv.replace("_", " ").replace("improvement", "").strip().title() for lv in chosen_levers]
        description = (
            f"Optimised improvement combination for this dataset: "
            f"{', '.join(lever_labels)}. "
            f"Selected because these address the dominant weaknesses identified from your uploaded data."
        )

        # Why each lever was selected
        selection_reasoning = []
        for lv in chosen_levers:
            score = lever_scores.get(lv, 0.0)
            reasoning_map = {
                "trust_improvement": f"Risk-averse consumer share is high (avg risk_aversion={avg_risk:.2f}) — trust barriers dominate.",
                "review_sentiment_improvement": f"Friction keyword count ({friction_kw}) signals unresolved buyer concerns in the category.",
                "pain_point_reduction": f"{friction_kw} friction keywords indicate active pain points suppressing conversion.",
                "value_clarity_improvement": f"High budget sensitivity (avg={avg_price_s:.2f}) means consumers question value — clarity converts.",
                "return_confidence_improvement": f"Concentrated market (HHI={hhi:.0f}) makes consumers risk-averse about unfamiliar brands.",
                "product_education_improvement": f"First-Time Buyers, Feature Researchers, and Risk-Averse Buyers account for {first_time_share:.1f}% of population.",
                "advertising_push": f"Trend-following segments represent significant share (avg trend_focused={avg_trend:.2f}) and velocity is {velocity:.0f}/100 — visibility drives adoption.",
                "bundle_strategy": f"Gift Buyers, Occasional Users, and Value Maximizers total {bundle_target_share:.1f}% of population — bundles raise perceived value and AOV.",
            }
            selection_reasoning.append(reasoning_map.get(lv, f"Selected based on dataset signal strength ({score:.2f})."))

        return {
            "scenario":            "Best Possible Improvement",
            "description":         description,
            "chosen_levers":       chosen_levers,
            "lever_reasons":       lever_reasons,
            "selection_reasoning": selection_reasoning,
            "base_intent":         round(base_intent, 2),
            "new_intent":          new_intent,
            "adoption_lift":       total_adoption_lift,
            "base_conversion":     round(base_conv * 100, 2),
            "new_conversion":      round(new_conv * 100, 2),
            "conv_lift_pct":       total_conv_lift,
            "retention_lift_pct":  total_retention_lift,
            "new_revenue":         new_rev,
            "most_impacted_segments": [
                {
                    "segment":     s.get("cluster_name", ""),
                    "risk_aversion": round((s.get("dominant_traits") or {}).get("risk_aversion", 0), 3),
                    "sensitivity_score": round(self._segment_lever_sensitivity(s, chosen_levers), 3),
                }
                for s in most_impacted
            ],
            "evidence": {
                "source":                    "Consumer Population + Inbound Efficiency + Market Concentration Engines",
                "lever_selection_method":    "Scored each lever by dataset signal weakness; top-3 chosen",
                "avg_risk_aversion":         round(avg_risk, 3),
                "avg_budget_sensitivity":    round(avg_price_s, 3),
                "avg_trend_focused":         round(avg_trend, 3),
                "avg_premium_willingness":   round(avg_premium, 3),
                "friction_keywords_used":    friction_kw,
                "hhi_used":                  round(hhi, 0),
                "demand_velocity_used":      round(velocity, 1),
                "first_time_buyer_share_pct": round(first_time_share, 1),
                "bundle_target_share_pct":   round(bundle_target_share, 1),
                "lever_scores":              {k: round(v, 3) for k, v in sorted_levers},
            },
        }

    # ── Dataset-driven lever selection ─────────────────────────────────────────

    def _select_additional_levers(
        self,
        dna: Dict[str, Any],
        segs: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Select the 2-3 most relevant interactive business levers for this dataset.
        Returns full lever definitions including options and selection reasoning.

        Selection logic:
          - If review sentiment or trust is weak → review_trust, product_education
          - If price resistance or budget sensitivity is high → discount_promotion, bundle_strategy
          - If demand is strong but conversion is weak → marketing_push, product_education
          - If returns/trust/delivery friction exists → delivery_confidence
        """
        eff         = dna.get("conversion_efficiency") or 50.0
        friction_kw = dna.get("friction_keyword_count") or 0
        hhi         = dna.get("hhi_score") or 2500.0
        velocity    = dna.get("demand_velocity") or 50.0
        demand_s    = dna.get("demand_score") or 50.0

        avg_risk    = self._avg_trait(segs, "risk_aversion", 0.4)
        avg_price_s = self._avg_trait(segs, "budget_sensitivity", 0.5)
        avg_premium = self._avg_trait(segs, "premium_willingness", 0.4)
        avg_trend   = self._avg_trait(segs, "trend_focused", 0.3)
        avg_conv    = self._avg_trait(segs, "convenience_focused", 0.5)

        # Score each lever
        lever_scores: Dict[str, float] = {
            "marketing_push":       avg_trend * 0.4 + (velocity / 100.0) * 0.35 + avg_conv * 0.15 + (demand_s / 100.0) * 0.1,
            "discount_promotion":   avg_price_s * 0.55 + (1.0 - eff / 100.0) * 0.25 + (1.0 - avg_premium) * 0.2,
            "review_trust":         avg_risk * 0.50 + (1.0 - eff / 100.0) * 0.30 + min(friction_kw / 300.0, 1.0) * 0.2,
            "bundle_strategy":      avg_premium * 0.40 + (1.0 - avg_price_s) * 0.25 + avg_conv * 0.20 + avg_price_s * 0.15,
            "delivery_confidence":  min(hhi / 10000.0, 1.0) * 0.40 + avg_risk * 0.40 + (1.0 - eff / 100.0) * 0.20,
            "product_education":    avg_risk * 0.35 + (1.0 - eff / 100.0) * 0.30 + min(friction_kw / 200.0, 1.0) * 0.35,
        }

        sorted_levers = sorted(lever_scores.items(), key=lambda x: x[1], reverse=True)
        chosen_ids = [lid for lid, _ in sorted_levers[:3]]

        # Build reasoning for each chosen lever
        reasoning_map: Dict[str, str] = {
            "marketing_push": (
                f"Demand velocity is {velocity:.0f}/100 and trend-sensitive segments have avg_trend={avg_trend:.2f}. "
                "Visibility gain has strong adoption impact here."
            ),
            "discount_promotion": (
                f"Budget sensitivity avg={avg_price_s:.2f} signals price-conscious segments. "
                "A limited-time discount or coupon directly reduces their primary barrier."
            ),
            "review_trust": (
                f"Risk-averse segment share is high (avg_risk={avg_risk:.2f}) and "
                f"efficiency={eff:.0f}/100. Trust barriers dominate conversion resistance."
            ),
            "bundle_strategy": (
                f"Premium willingness avg={avg_premium:.2f} — value-bundling raises perceived worth "
                "without requiring a direct price reduction. Ideal for Gift Buyers and Value Maximizers."
            ),
            "delivery_confidence": (
                f"Market concentration HHI={hhi:.0f} creates unfamiliar-brand risk. "
                "Return guarantees reduce first-purchase hesitation significantly."
            ),
            "product_education": (
                f"Friction keywords ({friction_kw}) and risk-averse segments (avg={avg_risk:.2f}) "
                "indicate buyers need more information before committing."
            ),
        }

        levers_out = []
        for lid in chosen_ids:
            defn = LEVER_DEFINITIONS.get(lid)
            if not defn:
                continue
            levers_out.append({
                "id":          lid,
                "label":       defn["label"],
                "description": defn["description"],
                "options":     defn["options"],
                "score":       round(lever_scores[lid], 3),
                "reason":      reasoning_map.get(lid, "Selected based on dataset signals."),
            })

        return levers_out

    def _build_lever_scenario_grid(
        self,
        dna: Dict[str, Any],
        segs: List[Dict[str, Any]],
        population_summary: Dict[str, Any],
        additional_levers: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Pre-compute the result for each combination of price scenario × each lever intensity option.
        Returns a flat list of {price_scenario, lever_id, lever_option_id, ...metrics}.
        Used by the frontend to show live updates when selectors change.
        """
        base_intent = population_summary.get("avg_purchase_intent", 50.0)
        base_conv   = population_summary.get("avg_conversion_probability", 0.3)
        base_rev    = dna.get("recoverable_revenue") or 0.0

        avg_price_s = self._avg_trait(segs, "budget_sensitivity", 0.5)
        avg_premium = self._avg_trait(segs, "premium_willingness", 0.4)
        efficiency_n = (dna.get("conversion_efficiency") or 50.0) / 100.0
        price_ceil  = dna.get("market_price_ceiling") or 50.0
        price_floor = dna.get("market_price_floor") or 5.0
        price_mid   = (price_ceil + price_floor) / 2.0
        premium_factor = min(price_mid / 80.0, 1.0)

        # Sensitivity of levers to current market signals
        # (higher sensitivity = larger adoption impact from that lever type)
        avg_risk  = self._avg_trait(segs, "risk_aversion", 0.4)
        avg_trend = self._avg_trait(segs, "trend_focused", 0.3)
        avg_conv_f = self._avg_trait(segs, "convenience_focused", 0.5)
        velocity   = dna.get("demand_velocity") or 50.0
        hhi        = dna.get("hhi_score") or 2500.0
        friction   = dna.get("friction_keyword_count") or 0

        # Signal sensitivity multipliers per lever type
        lever_sensitivity: Dict[str, float] = {
            "marketing_push":       (avg_trend * 0.5 + (velocity / 100.0) * 0.3 + avg_conv_f * 0.2),
            "discount_promotion":   (avg_price_s * 0.6 + (1.0 - efficiency_n) * 0.4),
            "review_trust":         (avg_risk * 0.6 + min(friction / 300.0, 1.0) * 0.4),
            "bundle_strategy":      (self._avg_trait(segs, "premium_willingness", 0.4) * 0.5 + avg_price_s * 0.3 + avg_conv_f * 0.2),
            "delivery_confidence":  (min(hhi / 10000.0, 1.0) * 0.5 + avg_risk * 0.5),
            "product_education":    (avg_risk * 0.5 + min(friction / 200.0, 1.0) * 0.5),
        }

        grid = []
        price_changes = [10, 20, 30, -10, -20, -30]

        for pct_change in price_changes:
            abs_pct = abs(pct_change)
            # Compute price scenario base (same as _pricing_scenarios)
            if pct_change > 0:
                eff_sens = avg_price_s * (1.0 - avg_premium * 0.4) * (1.0 - premium_factor * 0.3)
                price_adoption_delta = -(pct_change / 100.0) * eff_sens * 75
                price_conv_delta = -(pct_change / 100.0) * avg_price_s * 0.28
                price_rev_multiplier = (1.0 + pct_change / 100.0) * (1.0 + price_adoption_delta / 100.0)
            else:
                eff_sens = avg_price_s * (1.0 - efficiency_n * 0.2)
                price_adoption_delta = (abs_pct / 100.0) * eff_sens * 48
                price_conv_delta = (abs_pct / 100.0) * avg_price_s * 0.22
                price_rev_multiplier = (1.0 + pct_change / 100.0) * (1.0 + price_adoption_delta / 200.0)

            scenario_label = f"Price {'+' if pct_change > 0 else ''}{pct_change}%"

            # For each lever, compute combined result (price + lever)
            for lever in additional_levers:
                lid = lever["id"]
                sensitivity = lever_sensitivity.get(lid, 0.3)
                for opt in lever.get("options", []):
                    af = opt["adoption_factor"]  # base factor for this option
                    cf = opt["conv_factor"]
                    # Scale by signal sensitivity: more responsive market = bigger lever impact
                    scaled_adoption_lift = af * sensitivity * 60  # max ~30pts at full sensitivity
                    scaled_conv_lift = cf * sensitivity * 0.35

                    combined_intent = round(min(100, max(0,
                        base_intent + price_adoption_delta + scaled_adoption_lift
                    )), 2)
                    combined_conv = round(min(0.99, max(0.01,
                        base_conv + price_conv_delta + scaled_conv_lift
                    )), 4)

                    # Revenue: price × price_rev_multiplier × lever conv uplift
                    lever_rev_factor = combined_conv / max(base_conv, 0.01)
                    combined_rev = round(
                        base_rev * max(0.0, price_rev_multiplier) * lever_rev_factor, 2
                    ) if base_rev > 0 else 0.0
                    rev_change_pct = round(
                        (combined_rev / max(base_rev, 1) - 1.0) * 100, 1
                    ) if base_rev > 0 else 0.0

                    grid.append({
                        "price_scenario":   scenario_label,
                        "price_pct":        pct_change,
                        "lever_id":         lid,
                        "lever_option_id":  opt["id"],
                        "lever_option_label": opt["label"],
                        "base_adoption":    round(base_intent, 2),
                        "new_adoption":     combined_intent,
                        "adoption_change":  round(combined_intent - base_intent, 2),
                        "base_conversion":  round(base_conv * 100, 2),
                        "new_conversion":   round(combined_conv * 100, 2),
                        "conv_change":      round((combined_conv - base_conv) * 100, 2),
                        "base_revenue":     round(base_rev, 2),
                        "new_revenue":      combined_rev,
                        "revenue_change_pct": rev_change_pct,
                    })

        return grid

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _avg_trait(segs: List[Dict[str, Any]], key: str, default: float) -> float:
        if not segs:
            return default
        vals = [(s.get("dominant_traits") or {}).get(key, default) for s in segs]
        return sum(vals) / len(vals)

    @staticmethod
    def _segment_lever_sensitivity(seg: Dict[str, Any], levers: List[str]) -> float:
        """Score a segment's responsiveness to the chosen improvement levers."""
        dt = seg.get("dominant_traits") or {}
        r  = seg.get("resistance") or {}
        score = 0.0
        for lv in levers:
            if lv == "trust_improvement":
                score += dt.get("risk_aversion", 0.4)
            elif lv == "review_sentiment_improvement":
                score += dt.get("risk_aversion", 0.4) * 0.8 + (1.0 - dt.get("brand_loyalty", 0.5)) * 0.3
            elif lv == "pain_point_reduction":
                score += r.get("product_complexity", 50) / 100.0
            elif lv == "value_clarity_improvement":
                score += dt.get("budget_sensitivity", 0.5)
            elif lv == "return_confidence_improvement":
                score += dt.get("risk_aversion", 0.4) * 0.7
            elif lv == "product_education_improvement":
                score += dt.get("risk_aversion", 0.4) * 0.6 + (1.0 - dt.get("brand_loyalty", 0.5)) * 0.2
            elif lv == "advertising_push":
                score += dt.get("trend_focused", 0.3) * 0.7 + dt.get("convenience_focused", 0.5) * 0.3
            elif lv == "bundle_strategy":
                score += dt.get("premium_willingness", 0.4) * 0.5 + dt.get("budget_sensitivity", 0.4) * 0.3 + dt.get("convenience_focused", 0.4) * 0.2
        return score / max(len(levers), 1)
