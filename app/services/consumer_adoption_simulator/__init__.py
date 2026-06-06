"""
Consumer Adoption Simulator Package
=====================================
Simulates how 1,000 realistic consumers react to a product opportunity
derived from the active marketplace dataset.

Architecture:
  MarketDNAEngine           → aggregates all dashboard outputs into one market profile
  ConsumerPopulationEngine  → generates 1,000 data-driven simulated consumers
  PsychographicClusterEngine → clusters consumers into 20 dynamic segments
  AdoptionSimulationEngine  → computes purchase intent / conversion per cluster
  ResistanceAnalysisEngine  → calculates habit lock-in, trust barriers, etc.
"""

from .market_dna import MarketDNAEngine
from .consumer_population import ConsumerPopulationEngine
from .psychographic_clusters import PsychographicClusterEngine
from .adoption_simulation import AdoptionSimulationEngine
from .resistance_analysis import ResistanceAnalysisEngine
from .scenario_engine import ScenarioTestingEngine
from .stress_test_engine import MarketStressTestEngine
from .stability_risk_engine import SegmentStabilityEngine, MarketRiskEngine
from .confidence_engine import SimulationConfidenceEngine

__all__ = [
    "MarketDNAEngine",
    "ConsumerPopulationEngine",
    "PsychographicClusterEngine",
    "AdoptionSimulationEngine",
    "ResistanceAnalysisEngine",
    "ScenarioTestingEngine",
    "MarketStressTestEngine",
    "SegmentStabilityEngine",
    "MarketRiskEngine",
    "SimulationConfidenceEngine",
]
