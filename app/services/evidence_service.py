"""
Evidence Service

Helper service for engines to easily track evidence without having to manage lineage tracker directly.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
import logging
from datetime import datetime

from app.models.lineage import SourceRow, ColumnUsage, AggregationFormula, AggregationMethod
from app.services.lineage_service import LineageTracker

logger = logging.getLogger("evidence_service")


class EvidenceCollector:
    """
    Helper class to collect evidence during engine execution.
    Engines can use this to easily track sources without dealing with LineageTracker directly.
    """
    
    def __init__(self, engine_name: str, lineage_tracker: Optional[LineageTracker] = None):
        self.engine_name = engine_name
        self.tracker = lineage_tracker or LineageTracker(analysis_id=engine_name)
        self.tracked_rows: Dict[str, List[int]] = {}  # dataset -> row indices
        self.tracked_columns: Dict[str, str] = {}  # column_name -> dataset
    
    def track_dataframe_usage(
        self,
        df: pd.DataFrame,
        dataset_name: str,
        column: str,
        valid_mask: Optional[pd.Series] = None,
    ) -> Tuple[List[int], int]:
        """
        Track which rows from a DataFrame were used.
        
        Returns:
            (row_indices_used, non_null_count)
        """
        
        if df.empty:
            return [], 0
        
        # Get rows that were used
        if valid_mask is not None:
            used_rows = df[valid_mask].index.tolist()
        else:
            used_rows = list(range(len(df)))
        
        # Track columns
        self.tracker.track_column_usage(
            column_name=column,
            dataset=dataset_name,
            rows_in_dataset=len(df),
            non_null_count=len(df[column].dropna()),
        )
        
        # Track rows
        if dataset_name not in self.tracked_rows:
            self.tracked_rows[dataset_name] = []
        self.tracked_rows[dataset_name].extend(used_rows)
        
        return used_rows, len(df[column].dropna())
    
    def create_source_rows(
        self,
        df: pd.DataFrame,
        indices: List[int],
        key_columns: Optional[List[str]] = None,
    ) -> List[SourceRow]:
        """Create SourceRow objects from DataFrame rows."""
        
        source_rows = []
        for idx in indices:
            if idx >= len(df):
                continue
            
            row_data = {}
            if key_columns:
                for col in key_columns:
                    if col in df.columns:
                        row_data[col] = str(df.iloc[idx][col])
            else:
                # Include all non-null values
                for col in df.columns:
                    val = df.iloc[idx][col]
                    if pd.notna(val):
                        row_data[col] = str(val)
            
            source_rows.append(SourceRow(
                row_index=idx,
                values=row_data[:5],  # Limit to 5 key columns in display
            ))
        
        return source_rows
    
    def record_metric(
        self,
        metric_name: str,
        value: Any,
        dataset: str,
        source_indices: List[int],
        aggregation_method: AggregationMethod = AggregationMethod.CUSTOM,
        formula: str = "",
        key_columns: Optional[List[str]] = None,
        confidence: float = 1.0,
    ) -> None:
        """Record a computed metric with full evidence."""
        
        source_rows = self.create_source_rows(
            pd.DataFrame(),  # Placeholder, would need actual DF
            source_indices,
            key_columns,
        )
        
        agg_formula = AggregationFormula(
            method=aggregation_method,
            formula_text=formula,
            final_value=float(value) if isinstance(value, (int, float)) else 0.0,
        )
        
        self.tracker.track_metric(
            metric_name=metric_name,
            metric_value=value,
            source_dataset=dataset,
            source_rows=source_rows,
            rows_matched=len(source_indices),
            aggregation_formula=agg_formula,
            confidence_score=confidence,
        )
        
        logger.info(f"Recorded metric: {metric_name} = {value} ({len(source_indices)} rows)")
    
    def get_tracker(self) -> LineageTracker:
        """Get the underlying lineage tracker."""
        return self.tracker
    
    def export(self) -> Dict[str, Any]:
        """Export all collected evidence."""
        return self.tracker.export_evidence()
    
    def export_audit_summary(self) -> Dict[str, Any]:
        """Export audit summary."""
        return self.tracker.export_audit_summary()


class SimpleEvidenceBuilder:
    """
    Minimal evidence builder for quick metric tracking.
    Use this when you just need basic source row tracking.
    """
    
    @staticmethod
    def create_metric_with_evidence(
        metric_name: str,
        value: Any,
        source_dataset: str,
        df: pd.DataFrame,
        column_used: str,
        valid_mask: Optional[pd.Series] = None,
        formula_description: str = "",
    ) -> Dict[str, Any]:
        """Create a metric with basic evidence."""
        
        if valid_mask is not None:
            used_rows = df[valid_mask].index.tolist()
        else:
            used_rows = list(range(len(df)))
        
        source_rows = [
            {
                "row_index": i,
                "values": {column_used: str(df.iloc[i][column_used])}
            }
            for i in used_rows[:10]  # Show first 10 rows
        ]
        
        return {
            "metric_name": metric_name,
            "metric_value": value,
            "source_dataset": source_dataset,
            "rows_matched": len(used_rows),
            "column_used": column_used,
            "formula": formula_description,
            "sample_source_rows": source_rows,
            "full_row_count": len(used_rows),
        }


def add_evidence_to_response(
    response: Dict[str, Any],
    tracker: Optional[LineageTracker] = None,
    include_full_evidence: bool = False,
) -> Dict[str, Any]:
    """
    Add evidence fields to an engine response.
    
    Args:
        response: The engine response dict
        tracker: LineageTracker instance (or None if not tracking)
        include_full_evidence: Include full evidence detail (can be large)
    
    Returns:
        Response with evidence fields added
    """
    
    if tracker:
        audit_summary = tracker.export_audit_summary()
        response["audit_summary"] = audit_summary
        response["evidence_enabled"] = True
        
        if include_full_evidence:
            evidence = tracker.export_evidence()
            response["evidence"] = evidence
        else:
            # Light evidence: just metrics
            response["evidence"] = {
                "metrics": {k: v.dict() for k, v in tracker.metrics.items()},
                "metrics_tracked": len(tracker.metrics),
            }
    else:
        response["evidence_enabled"] = False
        response["audit_summary"] = None
    
    return response
