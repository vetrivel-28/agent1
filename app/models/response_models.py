"""Pydantic response models for deterministic API endpoints."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ValidationResponse(BaseModel):
    """Standard validation block returned by all engines."""

    rows_before_cleaning: int = 0
    rows_after_cleaning: int = 0
    rows_skipped: int = 0
    numeric_columns_cleaned: List[str] = Field(default_factory=list)
    missing_columns: List[str] = Field(default_factory=list)

    class Config:
        extra = "allow"


class ErrorResponse(BaseModel):
    """Standard error/warning envelope."""

    status: str = Field(default="error", description="'error' or 'warning'")
    metric_name: str = ""
    summary: str = ""
    datasets_used: List[str] = Field(default_factory=list)
    columns_used: List[str] = Field(default_factory=list)
    formula_used: str = ""
    results: Dict[str, Any] = Field(default_factory=dict)
    validation: ValidationResponse = Field(default_factory=ValidationResponse)
    message: Optional[str] = None
    processing_time_seconds: float = 0.0

    class Config:
        extra = "allow"


class EngineResponse(BaseModel):
    """Standard success/error envelope for engine responses."""

    status: str = Field(..., description="'success', 'error', or 'warning'")
    metric_name: str
    summary: str
    datasets_used: List[str] = Field(default_factory=list)
    columns_used: List[str] = Field(default_factory=list)
    formula_used: str = ""
    results: Dict[str, Any] = Field(default_factory=dict)
    validation: ValidationResponse = Field(default_factory=ValidationResponse)
    processing_time_seconds: float = 0.0
    message: Optional[str] = None

    class Config:
        extra = "allow"


class DemandStrengthResponse(EngineResponse):
    metric_name: str = "Demand Strength"


class SalesMomentumResponse(EngineResponse):
    metric_name: str = "Sales Momentum"


class RevenueMomentumResponse(EngineResponse):
    metric_name: str = "Revenue Momentum"


class BSREfficiencyResponse(EngineResponse):
    metric_name: str = "BSR Efficiency"


class MarketReportResponse(EngineResponse):
    metric_name: str = "Market Intelligence Report"


# Backward-compatible names used in existing routes.
DemandStrengthResult = DemandStrengthResponse
SalesMomentumResult = SalesMomentumResponse
RevenueMomentumResult = RevenueMomentumResponse
BSREfficiencyResult = BSREfficiencyResponse
MarketReportResult = MarketReportResponse


class DemandVelocityResult(EngineResponse):
    metric_name: str = "Demand Velocity"


class SIEIResult(EngineResponse):
    metric_name: str = "Search Intent Efficiency Index (SIEI)"


class HHIResult(EngineResponse):
    metric_name: str = "Market Concentration Index (HHI)"


class WhitespaceOpportunityResult(EngineResponse):
    metric_name: str = "Whitespace Opportunity"


class DirectCompetitorsResult(EngineResponse):
    metric_name: str = "Direct Competitors"


class PriceElasticityResult(EngineResponse):
    metric_name: str = "Price Intelligence"


class SubstituteIntelligenceResult(EngineResponse):
    """
    Substitute Intelligence analysis result.

    Key fields in `results`:
    - substitute_keywords (list)
    - substitute_products (list)
    - substitute_clusters (list)
    - market_overlap_score (float 0-100)
    - total_substitute_keywords (int)
    - total_substitute_products (int)
    """
    metric_name: str = "Substitute Intelligence"


class ComplementIntelligenceResult(EngineResponse):
    """
    Complement Intelligence analysis result.

    Key fields in `results`:
    - complement_keywords (list)
    - complement_products (list)
    - ecosystem_clusters (list)
    - cross_sell_opportunities (list)
    - ecosystem_strength (float 0-100)
    - total_complement_keywords (int)
    - total_complement_products (int)
    """
    metric_name: str = "Complement Intelligence"


class FinanceIntelligenceResult(EngineResponse):
    """
    Finance Intelligence analysis result.

    Key fields in `results`:
    - finance_health (dict)
    - overview_panel (dict)
    - advertising_pressure, premium_viability, margin_compression,
      capital_efficiency, entry_cost (dicts)
    - radar_chart (list)
    - economic_risk_gauge (float)
    - economic_verdict (str)
    - market_economics_narrative (str)
    """
    metric_name: str = "Finance Intelligence"


class BundleOpportunityResult(EngineResponse):
    """
    Bundle Opportunity analysis result.

    Key fields in `results`:
    - bundle_opportunities (list)
    - high_potential_bundles (list)
    - bundle_clusters (list)
    - ecosystem_strength (float 0-100)
    - total_bundle_opportunities (int)
    """
    metric_name: str = "Bundle Opportunity"


class DatasetsLoaded(BaseModel):
    blackbox: bool = False
    magnet: bool = False
    keyword_classification: bool = False


class UploadResponse(BaseModel):
    status: str
    message: Optional[str] = None
    datasets_loaded: Optional[DatasetsLoaded] = None
    rows_loaded: Optional[Dict[str, int]] = None
    errors: Optional[List[Dict[str, Any]]] = None


class HealthCheck(BaseModel):
    status: str
    message: str
    datasets_loaded: Dict[str, bool]
