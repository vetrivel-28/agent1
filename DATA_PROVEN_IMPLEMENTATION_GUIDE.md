# Data-Proven Analytics Implementation Guide

## Overview

The platform has been rebuilt to ensure ZERO synthetic logic. Every metric, score, and insight must be:
1. Derived exclusively from uploaded CSV data
2. Fully auditable with complete evidence trail
3. Click-to-verify traceable back to source rows

## Key Principles

### NO SYNTHETIC DATA
- ❌ Hardcoded values
- ❌ Mock data in production code
- ❌ Sample data responses
- ❌ Estimated values
- ❌ AI-generated numbers
- ❌ Fabricated insights
- ✅ Only uploaded CSV data

### COMPLETE TRACEABILITY
- Every metric knows its source rows
- Every calculation is documented
- Every value is clickable for evidence
- Every segment has members list
- Every classification has formula

## Core Components

### 1. LineageTracker (`app/services/lineage_service.py`)
Central system for tracking evidence. Usage:

```python
from app.services.lineage_service import LineageTracker

# Create tracker for analysis run
tracker = LineageTracker(analysis_id="demand_strength_2024-01-01")

# Track column usage
tracker.track_column_usage(
    column_name="Search Volume",
    dataset="magnet",
    rows_in_dataset=5000,
    non_null_count=4900,
    cleaning_applied="numeric_clean"
)

# Track metric
from app.models.lineage import SourceRow, AggregationFormula, AggregationMethod

source_rows = [
    SourceRow(row_index=0, values={"keyword": "bag"}),
    SourceRow(row_index=5, values={"keyword": "tote"}),
]

agg_formula = AggregationFormula(
    method=AggregationMethod.SUM,
    formula_text="SUM(search_volume) WHERE keyword LIKE 'bag%'",
    final_value=3000000.0
)

tracker.track_metric(
    metric_name="Total Bag Search Volume",
    metric_value=3000000,
    source_dataset="magnet",
    source_rows=source_rows,
    aggregation_formula=agg_formula,
    confidence_score=1.0
)

# Export evidence with results
evidence = tracker.export_evidence()
```

### 2. EvidenceCollector (`app/services/evidence_service.py`)
Helper class for engines. Usage:

```python
from app.services.evidence_service import EvidenceCollector
from app.models.lineage import AggregationMethod

collector = EvidenceCollector("demand_engine")

# Track DataFrame usage
indices, non_null_count = collector.track_dataframe_usage(
    df=magnet_df,
    dataset_name="magnet",
    column="Search Volume",
    valid_mask=(magnet_df["Search Volume"] > 0)
)

# Record metric with evidence
collector.record_metric(
    metric_name="top_keyword_volume",
    value=3000000,
    dataset="magnet",
    source_indices=indices,
    aggregation_method=AggregationMethod.SUM,
    formula="SUM(Search Volume)",
    key_columns=["Keyword"]
)

# Export all collected evidence
evidence_data = collector.export()
```

### 3. Lineage Models (`app/models/lineage.py`)
Pydantic models for evidence:
- `MetricEvidence`: Complete evidence for a metric
- `SegmentEvidence`: Segment classification with members
- `KPIEvidence`: Dashboard widget value
- `ChartPointEvidence`: Single chart point
- `InsightEvidence`: Business insight with support
- `ClassificationEvidence`: Why something was classified
- `AuditRecord`: Dataset audit statistics

## Engine Implementation Pattern

### BEFORE (No Lineage)
```python
def run(magnet_df, blackbox_df, top_n=10):
    # Load data
    sv = magnet_df["Search Volume"].sum()
    
    # Compute metric (no evidence)
    demand_score = sv / total_keywords * 100
    
    return {
        "status": "success",
        "results": {
            "demand_score": demand_score
        }
    }
```

### AFTER (With Lineage)
```python
from app.services.lineage_service import LineageTracker
from app.models.lineage import SourceRow, AggregationFormula, AggregationMethod

def run(magnet_df, blackbox_df, top_n=10):
    tracker = LineageTracker(analysis_id="demand_engine")
    
    # Track column usage
    sv_col = find_column(magnet_df, ["Search Volume", ...])
    if sv_col:
        tracker.track_column_usage(
            column_name=sv_col,
            dataset="magnet",
            rows_in_dataset=len(magnet_df),
            non_null_count=len(magnet_df[sv_col].dropna())
        )
    
    # Compute metric WITH evidence
    valid_mask = magnet_df[sv_col] > 0
    source_rows = [
        SourceRow(
            row_index=i,
            values={"keyword": magnet_df.iloc[i]["Keyword"], 
                    "sv": magnet_df.iloc[i][sv_col]}
        )
        for i in valid_mask.index[valid_mask]
    ]
    
    sv_total = float(magnet_df.loc[valid_mask, sv_col].sum())
    
    # Track the metric
    agg_formula = AggregationFormula(
        method=AggregationMethod.SUM,
        formula_text=f"SUM({sv_col}) WHERE {sv_col} > 0",
        final_value=sv_total
    )
    
    tracker.track_metric(
        metric_name="total_search_volume",
        metric_value=int(sv_total),
        source_dataset="magnet",
        source_rows=source_rows,
        rows_matched=len(valid_mask),
        aggregation_formula=agg_formula
    )
    
    # Build response with evidence
    response = {
        "status": "success",
        "results": {
            "total_search_volume": int(sv_total),
        },
        "evidence": tracker.export_evidence(),
        "audit_summary": tracker.export_audit_summary(),
        "evidence_enabled": True
    }
    
    return response
```

## Response Format with Evidence

All engine responses now include:

```python
{
    "status": "success",
    "metric_name": "Demand Strength",
    "summary": "...",
    "datasets_used": ["magnet"],
    "columns_used": ["Search Volume"],
    "formula_used": "...",
    "results": { ... },
    "validation": { ... },
    "processing_time_seconds": 1.23,
    
    # NEW: Evidence & Audit
    "evidence": {
        "analysis_id": "demand_engine",
        "metrics": {
            "total_search_volume": {
                "metric_name": "total_search_volume",
                "metric_value": 3000000,
                "source_dataset": "magnet",
                "source_rows": [...],
                "source_columns": [...],
                "rows_matched": 4163,
                "aggregation_formula": {...},
                "time_computed": "2024-01-01T12:00:00"
            }
        },
        "segments": {...},
        "kpis": {...},
        "insights": {...},
        "audit_record": {...}
    },
    "audit_summary": {
        "rows_loaded": 5000,
        "rows_processed": 4900,
        "rows_ignored": 100,
        "datasets": {"magnet": 5000},
        "data_quality": 98.5
    },
    "evidence_enabled": true
}
```

## Frontend Integration

### 1. Evidence Button Component

```tsx
// components/ui/EvidenceButton.tsx
export function EvidenceButton({ 
  metric: MetricEvidence, 
  onView: (evidence: MetricEvidence) => void 
}) {
  return (
    <button 
      onClick={() => onView(metric)}
      className="text-xs text-blue-500 hover:underline"
    >
      View Evidence ({metric.rows_matched} rows)
    </button>
  );
}
```

### 2. Evidence Drawer Component

```tsx
// components/ui/EvidenceDrawer.tsx
export function EvidenceDrawer({ 
  evidence: MetricEvidence | null, 
  onClose: () => void 
}) {
  if (!evidence) return null;
  
  return (
    <div className="fixed right-0 top-0 w-96 h-full bg-white shadow">
      <div className="p-6">
        <h2>{evidence.metric_name}</h2>
        <p>Value: {evidence.metric_value}</p>
        
        <section>
          <h3>Source Data</h3>
          <p>Dataset: {evidence.source_dataset}</p>
          <p>Rows matched: {evidence.rows_matched}</p>
          
          <h4>Source Rows (showing first 10)</h4>
          <table>
            {evidence.source_rows.slice(0, 10).map(row => (
              <tr key={row.row_index}>
                <td>Row {row.row_index}</td>
                <td>
                  {Object.entries(row.values).map(([k, v]) => 
                    <span>{k}: {v}</span>
                  )}
                </td>
              </tr>
            ))}
          </table>
        </section>
        
        <section>
          <h3>Calculation</h3>
          <p>Formula: {evidence.aggregation_formula?.formula_text}</p>
          <p>Method: {evidence.aggregation_formula?.method}</p>
          <p>Final Value: {evidence.aggregation_formula?.final_value}</p>
        </section>
      </div>
    </div>
  );
}
```

### 3. Usage in Components

```tsx
function DemandMetricsPanel() {
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const { data } = useQuery(['demand'], () => api.getDemandStrength());
  
  const evidence = data?.evidence?.metrics || {};
  
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        {Object.values(evidence).map(metric => (
          <MetricCard
            key={metric.metric_name}
            metric={metric}
          >
            <EvidenceButton 
              metric={metric}
              onView={setSelectedEvidence}
            />
          </MetricCard>
        ))}
      </div>
      
      <EvidenceDrawer 
        evidence={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />
    </>
  );
}
```

## Segment Evidence Pattern

For classifications like keyword clusters or product categories:

```python
# Track a segment
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
        # ... all members
    ],
    source_rows=[SourceRow(...), ...],
    aggregated_metrics={
        "total_search_volume": 750000,
        "total_keywords": 2,
        "market_share": 25.0
    }
)
```

Frontend would then show:
- Segment name and metrics
- All members with individual values
- Classification rules used
- Source rows that matched

## API Audit Endpoint

New endpoint: `GET /api/v1/audit`

Response:
```json
{
  "total_rows_loaded": 5000,
  "total_rows_processed": 4900,
  "rows_ignored": 100,
  "datasets_loaded": {
    "magnet": 5000,
    "blackbox": 500
  },
  "data_quality_score": 98.5,
  "duplicate_keywords": 45,
  "missing_values_by_column": {
    "Search Volume": 100,
    "Revenue": 200
  },
  "processing_time_seconds": 5.23,
  "source_file_names": [
    "Magnet_Keyword_Data.csv",
    "BlackBox_Products.csv"
  ]
}
```

## Removal of Synthetic Logic

Files to delete or heavily modify:
- `create_dummy_data.py` - DELETE
- Mock sections in all test files - REMOVE
- Hardcoded arrays in engines - REVIEW and remove if not data-driven
- Placeholder responses - DELETE

Files to check:
- All `*_engine.py` files - Add lineage tracking
- `report_builder.py` - Add evidence aggregation
- All route handlers - Add tracker to responses

## Checklist for Each Engine

- [ ] Import LineageTracker
- [ ] Create tracker at start
- [ ] Track all column usages
- [ ] Track all source rows
- [ ] Document all aggregations with AggregationFormula
- [ ] Track each metric with evidence
- [ ] Return tracker.export_evidence() in response
- [ ] Add evidence_enabled=True flag

## Testing Strategy

1. Load known test dataset with 100 rows
2. Run engine
3. Verify evidence contains exactly 100 rows referenced
4. Click evidence on each metric
5. Verify drill-down shows matching rows
6. Verify formulas calculate correctly
7. Verify no hardcoded values present

## Gotchas

1. **Row indices**: Always use 0-based row indices in evidence
2. **Filtering**: Track which rows were excluded and why
3. **Normalization**: Document normalization applied to columns
4. **Aggregation**: Always specify AggregationMethod
5. **Confidence**: Be honest about confidence scores
6. **Performance**: Evidence tracking adds ~5-10% overhead
