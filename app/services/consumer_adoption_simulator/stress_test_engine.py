"""
MarketStressTestEngine
=======================
Runs 1,000 Monte Carlo iterations with controlled variation across demand,
conversion, competition, sentiment, and pricing to produce:
  - best case
  - expected case (median)
  - worst case

All variation parameters are anchored to actual dataset signals.
"""
from __future__ import annotations

import math
import random
from typing import Any, Dict, List

from app.utils.logger import get_logger

logger = get_logger("stress_test_engine")


class MarketStressTestEngine:

    ITERATIONS = 1000

    def run(
        self,
        dna_dict: Dict[str, Any],
        population_summary: Dict[str, Any],
        enriched_segments: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        base_intent  = population_summary.get("avg_purchase_intent", 50.0)
        base_conv    = population_summary.get("avg_conversion_probability", 0.3)
        base_rev     = dna_dict.get("recoverable_revenue") or 0.0
        base_hhi     = dna_dict.get("hhi_score") or 2500.0
        base_demand  = dna_dict.get("demand_score") or 50.0
        base_eff     = dna_dict.get("conversion_efficiency") or 50.0

        # Variation parameters derived from dataset signals
        # Higher uncertainty when fewer data signals are available
        completeness = dna_dict.get("completeness_score", 60.0) / 100.0
        demand_std   = (1 - completeness) * 20 + 5    # 5–25 std dev on demand
        conv_std     = (1 - completeness) * 0.10 + 0.02
        hhi_std      = base_hhi * 0.15
        price_std    = (1 - completeness) * 0.15 + 0.05

        rng = random.Random(42)  # deterministic

        adoptions:   List[float] = []
        conversions: List[float] = []
        revenues:    List[float] = []
        risks:       List[float] = []

        for _ in range(self.ITERATIONS):
            # Vary each signal within plausible dataset-anchored bounds
            v_demand = max(0, min(100, base_demand + rng.gauss(0, demand_std)))
            v_conv   = max(0.01, min(0.99, base_conv + rng.gauss(0, conv_std)))
            v_hhi    = max(0, base_hhi + rng.gauss(0, hhi_std))
            v_price  = 1.0 + rng.gauss(0, price_std)  # multiplicative price shock

            # Adoption = demand signal × price adjustment
            price_sensitivity = 0.5  # market-level average
            price_drag = (v_price - 1.0) * price_sensitivity * -50
            v_adoption = max(0, min(100, base_intent * (v_demand / max(base_demand, 1)) + price_drag))

            # Revenue = recoverable × conv / base_conv × price
            v_rev = base_rev * (v_conv / max(base_conv, 0.01)) * max(v_price, 0.5)

            # Risk = competition pressure + adoption uncertainty
            comp_risk = min(100, v_hhi / 100)
            adpt_risk = max(0, 100 - v_adoption)
            v_risk    = (comp_risk * 0.5 + adpt_risk * 0.5)

            adoptions.append(v_adoption)
            conversions.append(v_conv * 100)
            revenues.append(max(0, v_rev))
            risks.append(v_risk)

        adoptions.sort()
        conversions.sort()
        revenues.sort()
        risks.sort()

        def pct(lst: List[float], p: float) -> float:
            idx = int(len(lst) * p)
            return round(lst[min(idx, len(lst) - 1)], 2)

        return {
            "iterations":    self.ITERATIONS,
            "adoption": {
                "best_case":     pct(adoptions, 0.90),
                "expected_case": pct(adoptions, 0.50),
                "worst_case":    pct(adoptions, 0.10),
                "range":         round(pct(adoptions, 0.90) - pct(adoptions, 0.10), 2),
                "unit":          "/100",
            },
            "conversion": {
                "best_case":     pct(conversions, 0.90),
                "expected_case": pct(conversions, 0.50),
                "worst_case":    pct(conversions, 0.10),
                "range":         round(pct(conversions, 0.90) - pct(conversions, 0.10), 2),
                "unit":          "%",
            },
            "revenue": {
                "best_case":     pct(revenues, 0.90),
                "expected_case": pct(revenues, 0.50),
                "worst_case":    pct(revenues, 0.10),
                "range":         round(pct(revenues, 0.90) - pct(revenues, 0.10), 2),
                "unit":          "$",
            },
            "risk": {
                "best_case":     pct(risks, 0.10),   # lower risk = better
                "expected_case": pct(risks, 0.50),
                "worst_case":    pct(risks, 0.90),
                "range":         round(pct(risks, 0.90) - pct(risks, 0.10), 2),
                "unit":          "/100",
            },
            "methodology": {
                "variation_anchors": {
                    "demand_std":   round(demand_std, 2),
                    "conv_std":     round(conv_std, 4),
                    "hhi_std":      round(hhi_std, 0),
                    "price_std":    round(price_std, 3),
                },
                "completeness_score": round(completeness * 100, 1),
                "note": (
                    "Variation parameters scale with data completeness — "
                    "more available signals = narrower confidence intervals."
                ),
            },
        }
