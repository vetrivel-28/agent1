"""
Audit Mode Endpoints

Endpoints that provide full auditability and data quality information.
These endpoints support the "View Evidence" functionality.
"""
from __future__ import annotations

from fastapi import APIRouter, Query
from typing import Optional, Dict, Any

from app.services.lineage_service import get_global_tracker
from app.services.dataset_registry import registry
from app.utils.logger import get_logger

logger = get_logger("audit_endpoints")

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.get(
    "/",
    summary="Audit Summary",
    description=(
        "Get high-level audit information about the current analysis.\n\n"
        "Returns: Rows loaded, processed, ignored, data quality score, datasets used."
    ),
)
def get_audit_summary() -> Dict[str, Any]:
    """Get audit summary for current session."""
    tracker = get_global_tracker()
    audit_summary = tracker.export_audit_summary()
    
    if audit_summary.get("status") == "no_audit_record":
        return {
            "status": "warning",
            "message": "No audit data available. Run an analysis first.",
            "audit_summary": audit_summary,
        }
    
    return {
        "status": "success",
        "audit_summary": audit_summary,
    }


@router.get(
    "/datasets",
    summary="Dataset Audit",
    description="Get detailed information about loaded datasets.",
)
def get_datasets_audit() -> Dict[str, Any]:
    """Get information about all loaded datasets."""
    
    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    keyword_df = registry.get_keyword_classification()
    
    datasets = {}
    
    if magnet_df is not None and not magnet_df.empty:
        datasets["magnet"] = {
            "rows": len(magnet_df),
            "columns": list(magnet_df.columns),
            "memory_usage_mb": magnet_df.memory_usage(deep=True).sum() / 1024 / 1024,
            "missing_values": magnet_df.isnull().sum().to_dict(),
            "dtypes": magnet_df.dtypes.astype(str).to_dict(),
        }
    
    if blackbox_df is not None and not blackbox_df.empty:
        datasets["blackbox"] = {
            "rows": len(blackbox_df),
            "columns": list(blackbox_df.columns),
            "memory_usage_mb": blackbox_df.memory_usage(deep=True).sum() / 1024 / 1024,
            "missing_values": blackbox_df.isnull().sum().to_dict(),
            "dtypes": blackbox_df.dtypes.astype(str).to_dict(),
        }
    
    if keyword_df is not None and not keyword_df.empty:
        datasets["keyword_classification"] = {
            "rows": len(keyword_df),
            "columns": list(keyword_df.columns),
            "memory_usage_mb": keyword_df.memory_usage(deep=True).sum() / 1024 / 1024,
            "missing_values": keyword_df.isnull().sum().to_dict(),
            "dtypes": keyword_df.dtypes.astype(str).to_dict(),
        }
    
    return {
        "status": "success",
        "datasets": datasets,
        "total_datasets_loaded": len(datasets),
    }


@router.get(
    "/quality",
    summary="Data Quality Report",
    description="Get data quality metrics for all loaded datasets.",
)
def get_data_quality_report() -> Dict[str, Any]:
    """Get data quality metrics."""
    
    magnet_df = registry.get_magnet()
    blackbox_df = registry.get_blackbox()
    
    quality_metrics = {}
    
    # Magnet quality
    if magnet_df is not None and not magnet_df.empty:
        total_cells = len(magnet_df) * len(magnet_df.columns)
        null_cells = magnet_df.isnull().sum().sum()
        completeness = ((total_cells - null_cells) / total_cells * 100) if total_cells > 0 else 0
        
        quality_metrics["magnet"] = {
            "rows": len(magnet_df),
            "columns": len(magnet_df.columns),
            "total_cells": total_cells,
            "null_cells": int(null_cells),
            "completeness_percent": round(completeness, 2),
            "duplicate_rows": len(magnet_df) - len(magnet_df.drop_duplicates()),
        }
    
    # BlackBox quality
    if blackbox_df is not None and not blackbox_df.empty:
        total_cells = len(blackbox_df) * len(blackbox_df.columns)
        null_cells = blackbox_df.isnull().sum().sum()
        completeness = ((total_cells - null_cells) / total_cells * 100) if total_cells > 0 else 0
        
        quality_metrics["blackbox"] = {
            "rows": len(blackbox_df),
            "columns": len(blackbox_df.columns),
            "total_cells": total_cells,
            "null_cells": int(null_cells),
            "completeness_percent": round(completeness, 2),
            "duplicate_rows": len(blackbox_df) - len(blackbox_df.drop_duplicates()),
        }
    
    # Overall quality score (0-100)
    if quality_metrics:
        avg_completeness = sum(
            m["completeness_percent"] for m in quality_metrics.values()
        ) / len(quality_metrics)
        
        overall_quality = min(100, avg_completeness)
    else:
        overall_quality = 0.0
    
    return {
        "status": "success",
        "quality_metrics": quality_metrics,
        "overall_quality_score": round(overall_quality, 2),
    }


@router.get(
    "/lineage/{metric_name}",
    summary="Metric Lineage",
    description="Get complete lineage information for a specific metric.",
)
def get_metric_lineage(metric_name: str) -> Dict[str, Any]:
    """Get lineage information for a metric."""
    
    tracker = get_global_tracker()
    
    if metric_name not in tracker.metrics:
        return {
            "status": "error",
            "message": f"Metric '{metric_name}' not found in lineage",
            "available_metrics": list(tracker.metrics.keys()),
        }
    
    metric_evidence = tracker.metrics[metric_name]
    
    return {
        "status": "success",
        "metric_name": metric_name,
        "evidence": metric_evidence.dict(),
    }


@router.get(
    "/all-evidence",
    summary="Complete Evidence Export",
    description="Export all tracked evidence for the current analysis.",
)
def get_all_evidence() -> Dict[str, Any]:
    """Get all tracked evidence."""
    
    tracker = get_global_tracker()
    evidence = tracker.export_evidence()
    
    return {
        "status": "success",
        "evidence": evidence,
    }


@router.get(
    "/metrics",
    summary="Tracked Metrics List",
    description="List all metrics for which we have evidence.",
)
def get_tracked_metrics() -> Dict[str, Any]:
    """Get list of tracked metrics."""
    
    tracker = get_global_tracker()
    
    metrics_summary = [
        {
            "name": name,
            "value": str(evidence.metric_value),
            "dataset": evidence.source_dataset,
            "rows_matched": evidence.rows_matched,
            "confidence": evidence.confidence_score,
        }
        for name, evidence in tracker.metrics.items()
    ]
    
    return {
        "status": "success",
        "metrics": metrics_summary,
        "total_metrics_tracked": len(metrics_summary),
    }


@router.get(
    "/segments",
    summary="Tracked Segments List",
    description="List all segments with their classification evidence.",
)
def get_tracked_segments() -> Dict[str, Any]:
    """Get list of tracked segments."""
    
    tracker = get_global_tracker()
    
    segments_summary = [
        {
            "name": name,
            "id": evidence.segment_id,
            "method": evidence.classification_method,
            "member_count": evidence.member_count,
            "source_rows_count": len(evidence.source_rows),
        }
        for name, evidence in tracker.segments.items()
    ]
    
    return {
        "status": "success",
        "segments": segments_summary,
        "total_segments_tracked": len(segments_summary),
    }


@router.get(
    "/insights",
    summary="Tracked Insights",
    description="List all insights with their supporting evidence.",
)
def get_tracked_insights() -> Dict[str, Any]:
    """Get list of tracked insights."""
    
    tracker = get_global_tracker()
    
    insights_summary = [
        {
            "text": insight.insight_text[:100],
            "confidence": insight.confidence_level,
            "evidence_count": insight.evidence_count,
            "supporting_metrics": insight.supporting_metrics,
        }
        for insight in tracker.insights
    ]
    
    return {
        "status": "success",
        "insights": insights_summary,
        "total_insights_tracked": len(insights_summary),
    }
