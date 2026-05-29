"""Pydantic models for Finance Intelligence structured outputs."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class FinanceMetricResult(BaseModel):
    status: str = Field(..., description="'success' or 'insufficient_data'")
    score: Optional[float] = None
    classification: str = "Not Available"
    mini_insight: str = ""
    formula_used: str = ""
    columns_used: List[str] = Field(default_factory=list)
    missing_columns: List[str] = Field(default_factory=list)
    datasets_required: List[str] = Field(default_factory=list)

    class Config:
        extra = "allow"


class AdvertisingPressureResult(FinanceMetricResult):
    capital_requirement: str = "Not Available"


class PremiumViabilityResult(FinanceMetricResult):
    best_price_band: str = "Not Available"
    price_elasticity_heatmap: List[Dict[str, Any]] = Field(default_factory=list)


class MarginCompressionResult(FinanceMetricResult):
    risk: str = "Not Available"


class CapitalEfficiencyResult(FinanceMetricResult):
    median_efficiency_ratio: Optional[float] = None


class EntryCostResult(FinanceMetricResult):
    pass


class FinanceHealthResult(BaseModel):
    finance_health: float = 0.0
    classification: str = "Not Available"
    formula_used: str = ""


class FinanceOverviewPanel(BaseModel):
    finance_health_score: float = 0.0
    economic_attractiveness: str = "Not Available"
    capital_requirement: str = "Not Available"
    entry_difficulty: str = "Not Available"
    pricing_power: str = "Not Available"
    price_war_risk: str = "Not Available"


class FinanceRadarDimension(BaseModel):
    dimension: str
    score: float = 0.0


class EconomicAttractivenessMatrix(BaseModel):
    x_axis: str = "Finance Health"
    y_axis: str = "Demand Strength"
    finance_health: float = 0.0
    demand_strength: float = 0.0
    threshold: float = 50.0
    quadrant: str = ""
    launch_recommendation: str = ""


class FinanceIntelligenceResults(BaseModel):
    finance_health: FinanceHealthResult
    overview_panel: FinanceOverviewPanel
    advertising_pressure: Dict[str, Any]
    premium_viability: Dict[str, Any]
    margin_compression: Dict[str, Any]
    capital_efficiency: Dict[str, Any]
    entry_cost: Dict[str, Any]
    radar_chart: List[FinanceRadarDimension] = Field(default_factory=list)
    economic_risk_gauge: float = 0.0
    economic_verdict: str = ""
    market_economics_narrative: str = ""
    economic_attractiveness_matrix: EconomicAttractivenessMatrix = Field(
        default_factory=EconomicAttractivenessMatrix
    )

    class Config:
        extra = "allow"
