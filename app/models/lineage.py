"""
Data Lineage Models

Every metric, score, and insight must be traceable back to source data.
This module defines the evidence tracking structures that enable full auditability.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set
from pydantic import BaseModel, Field
from enum import Enum


class AggregationMethod(str, Enum):
    """Method used to compute final value from rows."""
    SUM = "sum"
    MEAN = "mean"
    MEDIAN = "median"
    MAX = "max"
    MIN = "min"
    COUNT = "count"
    WEIGHTED_AVERAGE = "weighted_average"
    CUSTOM = "custom"


class SourceRow(BaseModel):
    """Reference to a single source row."""
    row_index: int = Field(..., description="Zero-based row index in source dataset")
    row_id: Optional[str] = Field(None, description="Unique row ID if available")
    values: Dict[str, Any] = Field(default_factory=dict, description="Key columns from this row")

    class Config:
        extra = "allow"


class AggregationFormula(BaseModel):
    """Description of how values were aggregated."""
    method: AggregationMethod = Field(..., description="Type of aggregation")
    formula_text: str = Field(..., description="Human-readable formula (e.g., 'SUM(revenue)')")
    weights: Optional[Dict[str, float]] = Field(None, description="For weighted aggregations")
    intermediate_values: Optional[List[float]] = Field(None, description="Values before final aggregation")
    final_value: float = Field(..., description="Final computed value")

    class Config:
        extra = "allow"


class ColumnUsage(BaseModel):
    """Record of how a column was used in calculation."""
    column_name: str = Field(..., description="Source column name")
    dataset: str = Field(..., description="Dataset name (magnet, blackbox, keyword_classification)")
    rows_used: int = Field(..., description="Number of rows in this dataset using this column")
    non_null_count: int = Field(..., description="Non-null values in this column")
    cleaning_applied: str = Field(default="none", description="Data cleaning applied (numeric_clean, etc)")
    normalization_applied: Optional[str] = Field(None, description="Normalization method if applied")

    class Config:
        extra = "allow"


class MetricEvidence(BaseModel):
    """Complete evidence for a single metric value."""
    
    metric_name: str = Field(..., description="Name of the metric")
    metric_value: Any = Field(..., description="The actual displayed value")
    
    # Data sources
    source_dataset: str = Field(..., description="Dataset(s) used (magnet, blackbox, keyword_classification)")
    source_rows: List[SourceRow] = Field(default_factory=list, description="All rows that contributed")
    source_columns: List[ColumnUsage] = Field(default_factory=list, description="All columns used")
    rows_matched: int = Field(..., description="Total rows that matched filter criteria")
    rows_filtered: int = Field(..., description="Rows excluded after cleaning")
    
    # Calculation
    aggregation_formula: Optional[AggregationFormula] = Field(None, description="How value was computed")
    filters_applied: List[str] = Field(default_factory=list, description="Filters used (e.g., 'revenue > 0')")
    
    # Metadata
    confidence_score: float = Field(default=1.0, description="Confidence in value (0.0-1.0)")
    time_computed: str = Field(..., description="ISO timestamp of computation")
    engine_version: str = Field(default="1.0", description="Version of engine that computed value")

    class Config:
        extra = "allow"


class SegmentEvidence(BaseModel):
    """Evidence for a classified segment (keyword cluster, product category, etc)."""
    
    segment_name: str = Field(..., description="Name of segment")
    segment_id: Optional[str] = Field(None, description="Unique segment ID")
    
    # Classification
    classification_method: str = Field(..., description="Method used (semantic, heuristic, rule-based)")
    classification_criteria: List[str] = Field(default_factory=list, description="Rules applied")
    
    # Members
    members: List[Dict[str, Any]] = Field(default_factory=list, description="Items in segment")
    member_count: int = Field(..., description="Total items")
    
    # Evidence
    source_rows: List[SourceRow] = Field(default_factory=list, description="Source rows")
    aggregated_metrics: Dict[str, Any] = Field(default_factory=dict, description="Segment-level metrics")
    
    class Config:
        extra = "allow"


class KPIEvidence(BaseModel):
    """Evidence for a KPI card or dashboard widget."""
    
    kpi_name: str = Field(..., description="Display name of KPI")
    kpi_value: Any = Field(..., description="The KPI value displayed")
    unit: str = Field(default="", description="Unit of measurement")
    
    # Calculation path
    metric_evidences: List[MetricEvidence] = Field(default_factory=list, description="Component metrics")
    calculation_steps: List[str] = Field(default_factory=list, description="Steps in calculation")
    
    # Status
    data_available: bool = Field(default=True, description="Was data available for this KPI?")
    error_message: Optional[str] = Field(None, description="Error if unavailable")
    
    class Config:
        extra = "allow"


class ChartPointEvidence(BaseModel):
    """Evidence for a single chart data point."""
    
    point_name: str = Field(..., description="X-axis label or point identifier")
    point_value: float = Field(..., description="Y-axis value")
    
    source_rows: List[SourceRow] = Field(default_factory=list, description="Rows contributing")
    aggregation_formula: Optional[AggregationFormula] = Field(None, description="How value was computed")
    contributing_values: List[float] = Field(default_factory=list, description="Individual values before aggregation")
    
    class Config:
        extra = "allow"


class InsightEvidence(BaseModel):
    """Evidence for a business insight."""
    
    insight_text: str = Field(..., description="The insight statement")
    confidence_level: str = Field(default="medium", description="confidence: high/medium/low")
    
    supporting_metrics: List[str] = Field(default_factory=list, description="Metric names supporting this")
    evidence_count: int = Field(..., description="Number of data points supporting insight")
    
    source_rows_used: int = Field(..., description="Total source rows involved")
    supporting_data: Dict[str, Any] = Field(default_factory=dict, description="Key supporting numbers")
    
    contradicting_signals: Optional[List[str]] = Field(None, description="Signals that partially contradict")
    
    class Config:
        extra = "allow"


class AuditRecord(BaseModel):
    """Dataset audit information."""
    
    total_rows_loaded: int = Field(..., description="Rows in CSV")
    total_rows_processed: int = Field(..., description="Rows actually used in analysis")
    rows_ignored: int = Field(..., description="Rows excluded")
    
    datasets_loaded: Dict[str, int] = Field(default_factory=dict, description="Dataset name -> row count")
    columns_detected: Dict[str, List[str]] = Field(default_factory=dict, description="Dataset -> column names")
    
    duplicate_keywords: int = Field(default=0, description="Exact keyword duplicates found")
    duplicate_brands: int = Field(default=0, description="Brand name duplicates")
    duplicate_asins: int = Field(default=0, description="ASIN duplicates")
    
    missing_values_by_column: Dict[str, int] = Field(default_factory=dict, description="Column -> missing count")
    data_quality_score: float = Field(default=100.0, description="0-100 quality metric")
    
    processing_start_time: str = Field(..., description="ISO timestamp")
    processing_end_time: str = Field(..., description="ISO timestamp")
    processing_time_seconds: float = Field(..., description="Total time")
    
    source_file_names: List[str] = Field(default_factory=list, description="Original CSV file names")
    
    class Config:
        extra = "allow"


class ClassificationEvidence(BaseModel):
    """Evidence for why something was classified a certain way."""
    
    classified_item: str = Field(..., description="What was classified")
    classification: str = Field(..., description="The classification label")
    
    formula_used: str = Field(..., description="Classification rule/formula")
    thresholds_used: Dict[str, float] = Field(default_factory=dict, description="Threshold values")
    
    score: float = Field(..., description="Computed score leading to classification")
    score_components: Dict[str, float] = Field(default_factory=dict, description="Breakdown of score")
    
    source_rows: List[SourceRow] = Field(default_factory=list, description="Rows supporting classification")
    alternative_classifications: List[str] = Field(default_factory=list, description="Other possibilities")
    
    confidence: float = Field(default=1.0, description="Confidence in classification")
    
    class Config:
        extra = "allow"
