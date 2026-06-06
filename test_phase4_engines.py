"""
Quick validation test for Phase 4 engines.
Tests each engine with realistic sample data to ensure they produce valid outputs.
"""
from app.services.consumer_adoption_simulator import (
    SimulationConfidenceEngine,
    ScenarioTestingEngine,
    MarketStressTestEngine,
    SegmentStabilityEngine,
    MarketRiskEngine,
)

# Sample MarketDNA dict
sample_dna = {
    "demand_score": 68.5,
    "demand_velocity": 72.3,
    "growth_trend": "growing",
    "conversion_efficiency": 65.2,
    "recoverable_revenue": 125000.0,
    "revenue_density": 58.3,
    "hhi_score": 3250.0,
    "competitive_saturation": 42.5,
    "friction_keyword_count": 85,
    "review_sentiment_score": 68.0,
    "total_search_volume": 150000,
    "total_market_revenue": 850000.0,
    "completeness_score": 82.5,
}

# Sample enriched segments
sample_segments = [
    {
        "cluster_name": "Budget Maximizers",
        "population": 180,
        "percentage": 18.0,
        "purchase_intent": 72.5,
        "conversion_probability": 0.68,
        "trust_score": 65.2,
        "switching_probability": 0.35,
        "dominant_traits": {
            "budget_sensitivity": 0.85,
            "premium_willingness": 0.25,
            "brand_loyalty": 0.45,
            "risk_aversion": 0.55,
            "trend_focused": 0.30,
            "price_focused": 0.90,
            "switching_cost": 0.40,
        },
        "resistance": {
            "cluster_id": 1,
            "resistance_index": 35.2,
            "resistance_level": "Low",
        },
    },
    {
        "cluster_name": "Premium Quality Seekers",
        "population": 150,
        "percentage": 15.0,
        "purchase_intent": 78.2,
        "conversion_probability": 0.75,
        "trust_score": 82.5,
        "switching_probability": 0.25,
        "dominant_traits": {
            "budget_sensitivity": 0.35,
            "premium_willingness": 0.85,
            "brand_loyalty": 0.72,
            "risk_aversion": 0.65,
            "trend_focused": 0.45,
            "price_focused": 0.25,
            "switching_cost": 0.30,
        },
        "resistance": {
            "cluster_id": 2,
            "resistance_index": 28.5,
            "resistance_level": "Low",
        },
    },
    {
        "cluster_name": "Trend Followers",
        "population": 120,
        "percentage": 12.0,
        "purchase_intent": 62.8,
        "conversion_probability": 0.55,
        "trust_score": 58.3,
        "switching_probability": 0.75,
        "dominant_traits": {
            "budget_sensitivity": 0.60,
            "premium_willingness": 0.55,
            "brand_loyalty": 0.30,
            "risk_aversion": 0.35,
            "trend_focused": 0.90,
            "price_focused": 0.50,
            "switching_cost": 0.70,
        },
        "resistance": {
            "cluster_id": 3,
            "resistance_index": 45.8,
            "resistance_level": "Medium",
        },
    },
]

# Sample population summary
sample_population = {
    "total_consumers": 1000,
    "num_psychographic_segments": 20,
    "avg_purchase_intent": 65.8,
    "avg_conversion_probability": 0.62,
    "avg_trust_score": 68.2,
    "avg_emotional_resonance": 62.5,
    "avg_resistance_index": 38.5,
    "dominant_channel": "Amazon",
    "channel_distribution": {"Amazon": 720, "Direct": 180, "Retail": 100},
}

# Sample data completeness
sample_completeness = {
    "demand_score": True,
    "demand_velocity": True,
    "conversion_efficiency": True,
    "hhi_score": True,
    "recoverable_revenue": True,
    "friction_keyword_count": True,
    "review_sentiment_score": True,
    "price_elasticity": False,  # Missing
}

def test_confidence_engine():
    print("\n" + "="*70)
    print("Testing SimulationConfidenceEngine")
    print("="*70)
    
    engine = SimulationConfidenceEngine()
    result = engine.calculate(
        dna_dict=sample_dna,
        population_summary=sample_population,
        enriched_segments=sample_segments,
        data_completeness=sample_completeness,
    )
    
    print(f"✓ Overall Confidence: {result['overall_confidence']:.1f}% ({result['overall_label']})")
    print(f"✓ Breakdown:")
    for key, value in result['breakdown'].items():
        print(f"  - {key}: {value:.1f}")
    print(f"✓ Per-metric confidence: {len(result['per_metric_confidence'])} metrics evaluated")
    print(f"✓ Positive drivers: {len(result['drivers']['positive'])}")
    print(f"✓ Negative drivers: {len(result['drivers']['negative'])}")
    return True

def test_scenario_engine():
    print("\n" + "="*70)
    print("Testing ScenarioTestingEngine")
    print("="*70)
    
    engine = ScenarioTestingEngine()
    result = engine.run(
        dna_dict=sample_dna,
        enriched_segments=sample_segments,
        population_summary=sample_population,
    )
    
    print(f"✓ Pricing scenarios: {len(result['pricing_scenarios'])} scenarios")
    print(f"  Example: {result['pricing_scenarios'][0]['scenario']} → "
          f"adoption Δ: {result['pricing_scenarios'][0]['adoption_delta']:.1f}")
    print(f"✓ Competitive scenarios: {len(result['competitive_scenarios'])} scenarios")
    print(f"  Example: {result['competitive_scenarios'][0]['scenario']} → "
          f"impact: {result['competitive_scenarios'][0]['adoption_impact']:.1f}")
    print(f"✓ Sentiment scenario: adoption lift = {result['sentiment_scenario']['adoption_lift']:.1f}")
    return True

def test_stress_test_engine():
    print("\n" + "="*70)
    print("Testing MarketStressTestEngine")
    print("="*70)
    
    engine = MarketStressTestEngine()
    result = engine.run(
        dna_dict=sample_dna,
        population_summary=sample_population,
        enriched_segments=sample_segments,
    )
    
    print(f"✓ Iterations: {result['iterations']}")
    print(f"✓ Adoption range:")
    print(f"  - Best case: {result['adoption']['best_case']}")
    print(f"  - Expected: {result['adoption']['expected_case']}")
    print(f"  - Worst case: {result['adoption']['worst_case']}")
    print(f"  - Range: {result['adoption']['range']}")
    print(f"✓ Revenue range:")
    print(f"  - Best case: ${result['revenue']['best_case']:,.0f}")
    print(f"  - Expected: ${result['revenue']['expected_case']:,.0f}")
    print(f"  - Worst case: ${result['revenue']['worst_case']:,.0f}")
    return True

def test_stability_engine():
    print("\n" + "="*70)
    print("Testing SegmentStabilityEngine")
    print("="*70)
    
    engine = SegmentStabilityEngine()
    result = engine.analyse(
        enriched_segments=sample_segments,
        dna_dict=sample_dna,
    )
    
    print(f"✓ Stable segments: {result['summary']['stable_count']}")
    if result['stable_segments']:
        print(f"  Top: {result['stable_segments'][0]['segment']} "
              f"(stability: {result['stable_segments'][0]['stability_score']:.1f})")
    print(f"✓ Volatile segments: {result['summary']['volatile_count']}")
    if result['volatile_segments']:
        print(f"  Top: {result['volatile_segments'][0]['segment']} "
              f"(volatility: {result['volatile_segments'][0]['volatility_score']:.1f})")
    print(f"✓ Emerging segments: {result['summary']['emerging_count']}")
    if result['emerging_segments']:
        print(f"  Top: {result['emerging_segments'][0]['segment']} "
              f"(emerging score: {result['emerging_segments'][0]['emerging_score']:.1f})")
    print(f"✓ All scores: {len(result['all_scores'])} segments analyzed")
    return True

def test_risk_engine():
    print("\n" + "="*70)
    print("Testing MarketRiskEngine")
    print("="*70)
    
    engine = MarketRiskEngine()
    result = engine.calculate(
        dna_dict=sample_dna,
        population_summary=sample_population,
        enriched_segments=sample_segments,
    )
    
    print(f"✓ Market Entry Risk Index: {result['market_entry_risk_index']:.1f} ({result['risk_label']})")
    print(f"✓ Risk components:")
    for key, value in result['components'].items():
        print(f"  - {key}: {value['score']:.1f} (weight: {value['weight']})")
    print(f"✓ Evidence signals: {len(result['evidence'])} data points used")
    return True

def main():
    print("\n" + "="*70)
    print("PHASE 4 ENGINE VALIDATION TEST")
    print("="*70)
    
    tests = [
        ("Confidence Engine", test_confidence_engine),
        ("Scenario Engine", test_scenario_engine),
        ("Stress Test Engine", test_stress_test_engine),
        ("Stability Engine", test_stability_engine),
        ("Risk Engine", test_risk_engine),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
                print(f"\n✅ {name} PASSED")
        except Exception as e:
            failed += 1
            print(f"\n❌ {name} FAILED: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "="*70)
    print(f"TEST SUMMARY: {passed}/{len(tests)} passed, {failed} failed")
    print("="*70)
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
