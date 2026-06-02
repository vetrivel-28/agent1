# Engine Integration Guide: Adding Data Lineage Tracking

This guide shows developers how to integrate data lineage tracking into existing engines.

## Step-by-Step Integration

### 1. Import Required Modules

```python
from app.services.lineage_service import LineageTracker
from app.services.evidence_service import EvidenceCollector, add_evidence_to_response
from app.models.lineage import SourceRow, AggregationFormula, AggregationMethod
```

### 2. Create Tracker at Engine Start

```python
def run(magnet_df, blackbox_df, top_n=10):
    tracker = LineageTracker(analysis_id="demand_strength")
    
    # ... rest of engine code
    
    # Add evidence to response before returning
    response["evidence"] = tracker.export_evidence()
    response["audit_summary"] = tracker.export_audit_summary()
    response["evidence_enabled"] = True
    
    return response
```

### 3. Track Column Usage

```python
if sv_col:
    tracker.track_column_usage(
        column_name=sv_col,
        dataset="magnet",
        rows_in_dataset=len(magnet_df),
        non_null_count=len(magnet_df[sv_col].dropna()),
        cleaning_applied="numeric_clean"
    )
```

### 4. Identify Source Rows

```python
# Create mask for valid rows
valid_mask = (magnet_df[sv_col] > 0) & (magnet_df[sv_col].notna())

# Get row indices
used_indices = magnet_df[valid_mask].index.tolist()

# Create SourceRow objects (showing first 100 rows max)
source_rows = [
    SourceRow(
        row_index=int(i),
        values={
            sv_col: str(magnet_df.iloc[i][sv_col]),
            kw_col: str(magnet_df.iloc[i][kw_col]) if kw_col else "N/A"
        }
    )
    for i in used_indices[:100]  # Limit for performance
]
```

### 5. Document Aggregation Formula

```python
agg_formula = AggregationFormula(
    method=AggregationMethod.SUM,
    formula_text=f"SUM({sv_col}) WHERE {sv_col} > 0 AND NOT NULL",
    final_value=float(total_sv)
)
```

### 6. Track the Metric

```python
tracker.track_metric(
    metric_name="total_search_volume",
    metric_value=int(total_sv),
    source_dataset="magnet",
    source_rows=source_rows,
    source_columns=[...],  # Include ColumnUsage objects
    rows_matched=len(used_indices),
    rows_filtered=len(magnet_df) - len(used_indices),
    aggregation_formula=agg_formula,
    confidence_score=1.0
)
```

### 7. For Classified Items (Segments, Categories)

```python
# When classifying items into groups
tracker.track_segment(
    segment_name="Tote Bags",
    segment_id="segment_001",
    classification_method="semantic",
    classification_criteria=[
        "MATCH(keyword, 'tote')",
        "MATCH(keyword, 'bag')",
        "NOT MATCH(keyword, 'seasonal')"
    ],
    members=[
        {"keyword": "tote bag", "search_volume": 500000},
        {"keyword": "canvas tote", "search_volume": 250000},
    ],
    source_rows=[SourceRow(...), ...],
    aggregated_metrics={
        "total_search_volume": 750000,
        "total_keywords": 2,
        "market_share": 25.0
    }
)
```

### 8. For Classifications (Why was this classified as X?)

```python
tracker.track_classification(
    classified_item="Revenue Momentum - Brand1",
    classification="Market Leader",
    formula_used="revenue_momentum_score >= 75 AND revenue_share >= 15%",
    thresholds_used={
        "momentum_threshold": 75.0,
        "revenue_share_threshold": 15.0,
    },
    score=82.5,
    score_components={
        "sales_velocity": 40.0,
        "review_velocity": 20.0,
        "bsr_momentum": 15.0,
        "revenue_strength": 7.5,
    },
    source_rows=[SourceRow(...), ...],
    confidence=0.95
)
```

### 9. For Business Insights

```python
tracker.track_insight(
    insight_text="Tote bags dominate seasonal demand with 45% market share",
    confidence_level="high",
    supporting_metrics=["total_search_volume", "market_share"],
    evidence_count=150,  # 150 source rows
    source_rows_used=150,
    supporting_data={
        "search_volume": 3000000,
        "market_share": 45.0,
        "growth": 18.0,
    }
)
```

### 10. Add Audit Record

```python
from datetime import datetime
import time

start_time = time.time()

# ... engine processing ...

tracker.set_audit_record(
    total_rows_loaded=len(magnet_df),
    total_rows_processed=len(magnet_df[valid_mask]),
    rows_ignored=len(magnet_df) - len(magnet_df[valid_mask]),
    datasets_loaded={"magnet": len(magnet_df)},
    columns_detected={"magnet": list(magnet_df.columns)},
    data_quality_score=98.5,
    processing_start_time=datetime.utcnow().isoformat(),
    processing_end_time=datetime.utcnow().isoformat(),
    processing_time_seconds=time.time() - start_time
)
```

## Complete Engine Template

```python
"""Example Engine with Full Lineage Tracking"""
from __future__ import annotations

import time
import pandas as pd
from typing import Any, Dict, Optional
from datetime import datetime

from app.services.lineage_service import LineageTracker
from app.models.lineage import SourceRow, AggregationFormula, AggregationMethod, ColumnUsage
from app.utils.column_mapper import find_column


def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    """Engine with complete evidence tracking."""
    
    t0 = time.time()
    tracker = LineageTracker(analysis_id="example_engine")
    
    # Input validation
    rows_magnet = len(magnet_df) if magnet_df is not None else 0
    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    
    if rows_magnet == 0 and rows_blackbox == 0:
        return {
            "status": "error",
            "summary": "No data available",
            "evidence_enabled": False,
        }
    
    # TRACK: Column usage
    sv_col = find_column(magnet_df, ["Search Volume", "Monthly Search Volume"])
    if sv_col:
        tracker.track_column_usage(
            column_name=sv_col,
            dataset="magnet",
            rows_in_dataset=rows_magnet,
            non_null_count=len(magnet_df[sv_col].dropna()),
            cleaning_applied="numeric_clean"
        )
    
    # PROCESS: Your engine logic
    valid_mask = (magnet_df[sv_col] > 0) & (magnet_df[sv_col].notna())
    used_indices = magnet_df[valid_mask].index.tolist()
    total_sv = float(magnet_df.loc[valid_mask, sv_col].sum())
    
    # TRACK: Source rows (limit to 100 for performance)
    source_rows = [
        SourceRow(
            row_index=int(i),
            values={
                sv_col: str(magnet_df.iloc[i][sv_col]),
            }
        )
        for i in used_indices[:100]
    ]
    
    # TRACK: Aggregation formula
    agg_formula = AggregationFormula(
        method=AggregationMethod.SUM,
        formula_text=f"SUM({sv_col}) WHERE {sv_col} > 0",
        final_value=total_sv
    )
    
    # TRACK: The metric
    tracker.track_metric(
        metric_name="total_search_volume",
        metric_value=int(total_sv),
        source_dataset="magnet",
        source_rows=source_rows,
        source_columns=[ColumnUsage(
            column_name=sv_col,
            dataset="magnet",
            rows_used=len(used_indices),
            non_null_count=len(magnet_df[sv_col].dropna())
        )],
        rows_matched=len(used_indices),
        rows_filtered=rows_magnet - len(used_indices),
        aggregation_formula=agg_formula,
        confidence_score=1.0
    )
    
    # TRACK: Audit record
    tracker.set_audit_record(
        total_rows_loaded=rows_magnet + rows_blackbox,
        total_rows_processed=len(used_indices),
        rows_ignored=rows_magnet - len(used_indices),
        datasets_loaded={"magnet": rows_magnet, "blackbox": rows_blackbox},
        columns_detected={"magnet": list(magnet_df.columns) if magnet_df is not None else []},
        data_quality_score=100.0,
        processing_start_time=datetime.utcnow().isoformat(),
        processing_end_time=datetime.utcnow().isoformat(),
        processing_time_seconds=time.time() - t0,
    )
    
    # BUILD: Response with evidence
    response = {
        "status": "success",
        "metric_name": "Example Engine",
        "summary": f"Processed {len(used_indices)} rows from magnet dataset",
        "datasets_used": ["magnet"],
        "columns_used": [sv_col],
        "formula_used": f"SUM({sv_col}) WHERE {sv_col} > 0",
        "results": {
            "total_search_volume": int(total_sv),
        },
        "validation": {
            "rows_before_cleaning": rows_magnet,
            "rows_after_cleaning": len(used_indices),
            "rows_skipped": rows_magnet - len(used_indices),
        },
        "processing_time_seconds": round(time.time() - t0, 3),
        
        # EVIDENCE: Add lineage tracking
        "evidence": tracker.export_evidence(),
        "audit_summary": tracker.export_audit_summary(),
        "evidence_enabled": True,
    }
    
    return response
```

## Testing Your Integration

```python
# Test 1: Verify evidence is present
result = run(magnet_df, blackbox_df)
assert result["evidence_enabled"] == True
assert "evidence" in result
assert "audit_summary" in result

# Test 2: Verify metrics are tracked
evidence = result["evidence"]
assert "metrics" in evidence
assert len(evidence["metrics"]) > 0

# Test 3: Verify source rows are recorded
metric_evidence = list(evidence["metrics"].values())[0]
assert len(metric_evidence["source_rows"]) > 0
assert metric_evidence["rows_matched"] > 0

# Test 4: Verify formulas are documented
assert metric_evidence["aggregation_formula"] is not None
assert len(metric_evidence["aggregation_formula"]["formula_text"]) > 0
```

## Performance Considerations

1. **Limit source rows to 100** - Full row lists can get large
2. **Use sampling for huge datasets** - Show representative rows
3. **Cache evidence** - Don't recalculate on repeated calls
4. **Lazy load details** - Show summary first, details on demand

## Checklist for Integration

- [ ] Import LineageTracker and related modules
- [ ] Create tracker at engine start
- [ ] Track all column usages
- [ ] Track all source rows (limited to 100 for performance)
- [ ] Document aggregation formulas
- [ ] Track each metric with evidence
- [ ] Track classifications and segments
- [ ] Set audit record at engine end
- [ ] Add evidence to response
- [ ] Test evidence is present
- [ ] Test metrics are traceable

## Common Patterns

### Pattern 1: Simple Aggregation
```python
# Track simple SUM/MEAN/MAX aggregation
source_rows = [SourceRow(row_index=i, values={col: df.iloc[i][col]}) for i in indices]
agg_formula = AggregationFormula(
    method=AggregationMethod.SUM,
    formula_text=f"SUM({col})",
    final_value=float(result)
)
tracker.track_metric(..., source_rows=source_rows, aggregation_formula=agg_formula)
```

### Pattern 2: Grouped Aggregation
```python
# Track grouped aggregation (by brand, category, etc.)
groups = df.groupby(group_col)[agg_col].sum()
for group_name, group_value in groups.items():
    # Track each group's rows
    group_rows = [SourceRow(...) for i in group_indices]
    tracker.track_metric(
        metric_name=f"{group_col}_{group_name}",
        metric_value=float(group_value),
        source_rows=group_rows
    )
```

### Pattern 3: Filtering & Aggregation
```python
# Track filtered aggregation
mask = (df[col1] > threshold) & (df[col2].notna())
filtered_rows = df[mask]
result = filtered_rows[agg_col].sum()
tracker.track_metric(
    metric_name=name,
    metric_value=float(result),
    source_rows=[SourceRow(row_index=i, values={...}) for i in filtered_rows.index],
    filters_applied=[
        f"{col1} > {threshold}",
        f"{col2} IS NOT NULL"
    ]
)
```

## Troubleshooting

**Issue: Evidence not appearing in response**
- Check: Is `evidence_enabled` set to True?
- Check: Is tracker.export_evidence() called before returning?

**Issue: Source rows are empty**
- Check: Are row indices correct (0-based)?
- Check: Are rows being added to tracker before export?

**Issue: Formulas not showing**
- Check: Is AggregationFormula being created?
- Check: Is formula_text descriptive enough?

**Issue: Performance degradation**
- Check: Are you limiting source rows to 100?
- Check: Are large DataFrames being copied unnecessarily?
- Solution: Use sampling for very large datasets
