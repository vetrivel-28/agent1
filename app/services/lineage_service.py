"""
Data Lineage Service

Central service for tracking evidence and maintaining full audit trail.
All engines must use this service to ensure auditability.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Set
from datetime import datetime
import logging

from app.models.lineage import (
    AggregationFormula,
    AggregationMethod,
    ColumnUsage,
    SourceRow,
    MetricEvidence,
    SegmentEvidence,
    KPIEvidence,
    ChartPointEvidence,
    InsightEvidence,
    ClassificationEvidence,
    AuditRecord,
)

logger = logging.getLogger("lineage_service")


class LineageTracker:
    """
    Centralized tracker for all data lineage.
    
    Usage pattern:
    1. Create tracker for an analysis run
    2. Track sources as you process data
    3. Track aggregations as you compute metrics
    4. Export evidence with results
    """
    
    def __init__(self, analysis_id: str = ""):
        self.analysis_id = analysis_id
        self.metrics: Dict[str, MetricEvidence] = {}
        self.segments: Dict[str, SegmentEvidence] = {}
        self.kpis: Dict[str, KPIEvidence] = {}
        self.chart_points: Dict[str, List[ChartPointEvidence]] = {}
        self.insights: List[InsightEvidence] = []
        self.classifications: Dict[str, ClassificationEvidence] = {}
        self.audit_record: Optional[AuditRecord] = None
        
        self.source_columns_used: Dict[str, ColumnUsage] = {}
        self.source_rows_used: Set[tuple] = set()  # (dataset, row_index)
        
        logger.info(f"Lineage tracker initialized: {analysis_id}")
    
    def track_column_usage(
        self,
        column_name: str,
        dataset: str,
        rows_in_dataset: int,
        non_null_count: int,
        cleaning_applied: str = "none",
        normalization_applied: Optional[str] = None,
    ) -> None:
        """Track usage of a column."""
        key = f"{dataset}:{column_name}"
        self.source_columns_used[key] = ColumnUsage(
            column_name=column_name,
            dataset=dataset,
            rows_used=rows_in_dataset,
            non_null_count=non_null_count,
            cleaning_applied=cleaning_applied,
            normalization_applied=normalization_applied,
        )
    
    def track_row_usage(self, dataset: str, row_index: int) -> None:
        """Track that a row was used in analysis."""
        self.source_rows_used.add((dataset, row_index))
    
    def track_metric(
        self,
        metric_name: str,
        metric_value: Any,
        source_dataset: str,
        source_rows: List[SourceRow],
        source_columns: Optional[List[ColumnUsage]] = None,
        rows_matched: int = 0,
        rows_filtered: int = 0,
        aggregation_formula: Optional[AggregationFormula] = None,
        filters_applied: Optional[List[str]] = None,
        confidence_score: float = 1.0,
    ) -> None:
        """Track a metric and its evidence."""
        
        evidence = MetricEvidence(
            metric_name=metric_name,
            metric_value=metric_value,
            source_dataset=source_dataset,
            source_rows=source_rows,
            source_columns=source_columns or list(self.source_columns_used.values()),
            rows_matched=rows_matched,
            rows_filtered=rows_filtered,
            aggregation_formula=aggregation_formula,
            filters_applied=filters_applied or [],
            confidence_score=confidence_score,
            time_computed=datetime.utcnow().isoformat(),
        )
        
        self.metrics[metric_name] = evidence
        logger.info(f"Tracked metric: {metric_name} = {metric_value}")
    
    def track_segment(
        self,
        segment_name: str,
        segment_id: Optional[str],
        classification_method: str,
        classification_criteria: List[str],
        members: List[Dict[str, Any]],
        source_rows: List[SourceRow],
        aggregated_metrics: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Track a segment classification."""
        
        evidence = SegmentEvidence(
            segment_name=segment_name,
            segment_id=segment_id,
            classification_method=classification_method,
            classification_criteria=classification_criteria,
            members=members,
            member_count=len(members),
            source_rows=source_rows,
            aggregated_metrics=aggregated_metrics or {},
        )
        
        self.segments[segment_name] = evidence
        logger.info(f"Tracked segment: {segment_name} with {len(members)} members")
    
    def track_kpi(
        self,
        kpi_name: str,
        kpi_value: Any,
        unit: str = "",
        metric_evidences: Optional[List[MetricEvidence]] = None,
        calculation_steps: Optional[List[str]] = None,
        data_available: bool = True,
        error_message: Optional[str] = None,
    ) -> None:
        """Track a KPI card."""
        
        evidence = KPIEvidence(
            kpi_name=kpi_name,
            kpi_value=kpi_value,
            unit=unit,
            metric_evidences=metric_evidences or [],
            calculation_steps=calculation_steps or [],
            data_available=data_available,
            error_message=error_message,
        )
        
        self.kpis[kpi_name] = evidence
        logger.info(f"Tracked KPI: {kpi_name} = {kpi_value}")
    
    def track_chart_point(
        self,
        chart_name: str,
        point_name: str,
        point_value: float,
        source_rows: List[SourceRow],
        aggregation_formula: Optional[AggregationFormula] = None,
        contributing_values: Optional[List[float]] = None,
    ) -> None:
        """Track a point in a chart."""
        
        evidence = ChartPointEvidence(
            point_name=point_name,
            point_value=point_value,
            source_rows=source_rows,
            aggregation_formula=aggregation_formula,
            contributing_values=contributing_values or [],
        )
        
        if chart_name not in self.chart_points:
            self.chart_points[chart_name] = []
        self.chart_points[chart_name].append(evidence)
    
    def track_insight(
        self,
        insight_text: str,
        confidence_level: str = "medium",
        supporting_metrics: Optional[List[str]] = None,
        evidence_count: int = 0,
        source_rows_used: int = 0,
        supporting_data: Optional[Dict[str, Any]] = None,
        contradicting_signals: Optional[List[str]] = None,
    ) -> None:
        """Track a business insight."""
        
        evidence = InsightEvidence(
            insight_text=insight_text,
            confidence_level=confidence_level,
            supporting_metrics=supporting_metrics or [],
            evidence_count=evidence_count,
            source_rows_used=source_rows_used,
            supporting_data=supporting_data or {},
            contradicting_signals=contradicting_signals,
        )
        
        self.insights.append(evidence)
        logger.info(f"Tracked insight: {insight_text[:80]}...")
    
    def track_classification(
        self,
        classified_item: str,
        classification: str,
        formula_used: str,
        thresholds_used: Dict[str, float],
        score: float,
        score_components: Dict[str, float],
        source_rows: List[SourceRow],
        alternative_classifications: Optional[List[str]] = None,
        confidence: float = 1.0,
    ) -> None:
        """Track a classification decision."""
        
        evidence = ClassificationEvidence(
            classified_item=classified_item,
            classification=classification,
            formula_used=formula_used,
            thresholds_used=thresholds_used,
            score=score,
            score_components=score_components,
            source_rows=source_rows,
            alternative_classifications=alternative_classifications or [],
            confidence=confidence,
        )
        
        self.classifications[classified_item] = evidence
        logger.info(f"Tracked classification: {classified_item} -> {classification}")
    
    def set_audit_record(
        self,
        total_rows_loaded: int,
        total_rows_processed: int,
        rows_ignored: int,
        datasets_loaded: Optional[Dict[str, int]] = None,
        columns_detected: Optional[Dict[str, List[str]]] = None,
        duplicate_keywords: int = 0,
        duplicate_brands: int = 0,
        duplicate_asins: int = 0,
        missing_values_by_column: Optional[Dict[str, int]] = None,
        data_quality_score: float = 100.0,
        processing_start_time: str = "",
        processing_end_time: str = "",
        processing_time_seconds: float = 0.0,
        source_file_names: Optional[List[str]] = None,
    ) -> None:
        """Set the audit record for this analysis."""
        
        self.audit_record = AuditRecord(
            total_rows_loaded=total_rows_loaded,
            total_rows_processed=total_rows_processed,
            rows_ignored=rows_ignored,
            datasets_loaded=datasets_loaded or {},
            columns_detected=columns_detected or {},
            duplicate_keywords=duplicate_keywords,
            duplicate_brands=duplicate_brands,
            duplicate_asins=duplicate_asins,
            missing_values_by_column=missing_values_by_column or {},
            data_quality_score=data_quality_score,
            processing_start_time=processing_start_time or datetime.utcnow().isoformat(),
            processing_end_time=processing_end_time or datetime.utcnow().isoformat(),
            processing_time_seconds=processing_time_seconds,
            source_file_names=source_file_names or [],
        )
        logger.info(f"Set audit record: {total_rows_loaded} rows loaded")
    
    def export_evidence(self) -> Dict[str, Any]:
        """Export all tracked evidence as a dictionary."""
        return {
            "analysis_id": self.analysis_id,
            "metrics": {k: v.dict() for k, v in self.metrics.items()},
            "segments": {k: v.dict() for k, v in self.segments.items()},
            "kpis": {k: v.dict() for k, v in self.kpis.items()},
            "chart_points": {k: [p.dict() for p in v] for k, v in self.chart_points.items()},
            "insights": [i.dict() for i in self.insights],
            "classifications": {k: v.dict() for k, v in self.classifications.items()},
            "audit_record": self.audit_record.dict() if self.audit_record else None,
            "timestamp": datetime.utcnow().isoformat(),
        }
    
    def export_audit_summary(self) -> Dict[str, Any]:
        """Export audit summary for display."""
        if not self.audit_record:
            return {"status": "no_audit_record"}
        
        return {
            "rows_loaded": self.audit_record.total_rows_loaded,
            "rows_processed": self.audit_record.total_rows_processed,
            "rows_ignored": self.audit_record.rows_ignored,
            "datasets": self.audit_record.datasets_loaded,
            "columns_detected": self.audit_record.columns_detected,
            "data_quality": self.audit_record.data_quality_score,
            "duplicates": {
                "keywords": self.audit_record.duplicate_keywords,
                "brands": self.audit_record.duplicate_brands,
                "asins": self.audit_record.duplicate_asins,
            },
            "processing_time_seconds": self.audit_record.processing_time_seconds,
            "source_files": self.audit_record.source_file_names,
        }


# Global tracker instance
_global_tracker: Optional[LineageTracker] = None


def get_global_tracker() -> LineageTracker:
    """Get or create global lineage tracker."""
    global _global_tracker
    if _global_tracker is None:
        _global_tracker = LineageTracker()
    return _global_tracker


def reset_tracker() -> None:
    """Reset global tracker (use between analysis runs)."""
    global _global_tracker
    _global_tracker = None


def create_metric_evidence(
    metric_name: str,
    value: Any,
    dataset: str,
    column: str,
    rows: List[int],
    aggregation: str,
    formula: str,
) -> MetricEvidence:
    """Convenience function to create metric evidence."""
    
    source_rows = [SourceRow(row_index=r) for r in rows]
    
    agg_formula = AggregationFormula(
        method=AggregationMethod.CUSTOM,
        formula_text=formula,
        final_value=float(value) if isinstance(value, (int, float)) else 0.0,
    )
    
    return MetricEvidence(
        metric_name=metric_name,
        metric_value=value,
        source_dataset=dataset,
        source_rows=source_rows,
        source_columns=[ColumnUsage(
            column_name=column,
            dataset=dataset,
            rows_used=len(rows),
            non_null_count=len(rows),
        )],
        rows_matched=len(rows),
        rows_filtered=0,
        aggregation_formula=agg_formula,
        time_computed=datetime.utcnow().isoformat(),
    )
