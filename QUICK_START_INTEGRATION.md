# QUICK START: Data-Proven Analytics Platform

**Goal**: Integrate data lineage tracking into your engine in 30 minutes.

---

## 5-Minute Overview

The platform now tracks where every metric comes from:

```
User sees: "Search Volume: 3,000,000"
         ↓ clicks "Evidence"
         ↓
Shows:
- Source dataset: Magnet (5,000 rows)
- Formula: SUM(Search Volume) WHERE Search Volume > 0
- Rows matched: 4,163
- Row examples: [bag, tote, canvas bag, ...]
```

---

## What You Need to Do

### Option A: 30-Minute Quick Integration (Minimal)

1. **Add imports to your engine** (30 seconds)
   ```python
   from app.services.lineage_service import LineageTracker
   from app.models.lineage import SourceRow, AggregationFormula, AggregationMethod
   ```

2. **Create tracker** (1 minute)
   ```python
   def run(magnet_df, blackbox_df, top_n=10):
       tracker = LineageTracker(analysis_id="my_engine")
       # ... your code ...
   ```

3. **Add this at the END before return** (2 minutes)
   ```python
       response["evidence"] = tracker.export_evidence()
       response["audit_summary"] = tracker.export_audit_summary()
       response["evidence_enabled"] = True
       return response
   ```

4. **For each metric, add this** (5 minutes per metric)
   ```python
   # Create source rows
   source_rows = [
       SourceRow(row_index=i, values={column: df.iloc[i][column]})
       for i in matched_indices[:100]
   ]
   
   # Create formula
   formula = AggregationFormula(
       method=AggregationMethod.SUM,
       formula_text=f"SUM({column})",
       final_value=float(result_value)
   )
   
   # Track it
   tracker.track_metric(
       metric_name="my_metric",
       metric_value=result_value,
       source_dataset="magnet",
       source_rows=source_rows,
       aggregation_formula=formula,
       rows_matched=len(matched_indices)
   )
   ```

5. **Test** (5 minutes)
   ```python
   result = run(magnet_df, blackbox_df)
   assert result["evidence_enabled"] == True
   print(f"✓ Tracked {len(result['evidence']['metrics'])} metrics")
   ```

### Option B: 60-Minute Full Integration (Comprehensive)

Follow `ENGINE_INTEGRATION_GUIDE.md` for complete implementation including:
- Detailed classification tracking
- Business insight tracking
- Audit record setup
- Performance optimization

---

## Copy-Paste Template

```python
"""Your engine with evidence tracking."""
import time
from datetime import datetime
from app.services.lineage_service import LineageTracker
from app.models.lineage import SourceRow, AggregationFormula, AggregationMethod, ColumnUsage

def run(magnet_df, blackbox_df, top_n=10):
    t0 = time.time()
    tracker = LineageTracker(analysis_id="your_engine_name")
    
    # Track column
    if magnet_df is not None and "Search Volume" in magnet_df.columns:
        tracker.track_column_usage(
            column_name="Search Volume",
            dataset="magnet",
            rows_in_dataset=len(magnet_df),
            non_null_count=len(magnet_df["Search Volume"].dropna()),
            cleaning_applied="numeric_clean"
        )
    
    # YOUR CALCULATION HERE
    valid_mask = magnet_df["Search Volume"] > 0
    total_volume = magnet_df.loc[valid_mask, "Search Volume"].sum()
    
    # Track it
    source_rows = [
        SourceRow(row_index=i, values={"Search Volume": str(magnet_df.iloc[i]["Search Volume"])})
        for i in magnet_df[valid_mask].index[:100]
    ]
    
    formula = AggregationFormula(
        method=AggregationMethod.SUM,
        formula_text="SUM(Search Volume) WHERE Search Volume > 0",
        final_value=float(total_volume)
    )
    
    tracker.track_metric(
        metric_name="total_search_volume",
        metric_value=int(total_volume),
        source_dataset="magnet",
        source_rows=source_rows,
        source_columns=[ColumnUsage(
            column_name="Search Volume",
            dataset="magnet",
            rows_used=len(magnet_df[valid_mask]),
            non_null_count=len(magnet_df["Search Volume"].dropna())
        )],
        rows_matched=len(magnet_df[valid_mask]),
        aggregation_formula=formula,
        confidence_score=1.0
    )
    
    # Audit record
    tracker.set_audit_record(
        total_rows_loaded=len(magnet_df),
        total_rows_processed=len(magnet_df[valid_mask]),
        rows_ignored=len(magnet_df) - len(magnet_df[valid_mask]),
        datasets_loaded={"magnet": len(magnet_df)},
        columns_detected={"magnet": list(magnet_df.columns)},
        data_quality_score=100.0,
        processing_start_time=datetime.utcnow().isoformat(),
        processing_end_time=datetime.utcnow().isoformat(),
        processing_time_seconds=time.time() - t0
    )
    
    # RETURN WITH EVIDENCE
    return {
        "status": "success",
        "metric_name": "Your Engine",
        "summary": f"Analyzed {len(magnet_df[valid_mask])} rows",
        "results": {
            "total_search_volume": int(total_volume),
        },
        "evidence": tracker.export_evidence(),
        "audit_summary": tracker.export_audit_summary(),
        "evidence_enabled": True,
        "processing_time_seconds": round(time.time() - t0, 3),
    }
```

---

## Testing Your Integration

### Test 1: Evidence is included
```python
result = run(magnet_df, blackbox_df)
assert result["evidence_enabled"] == True, "Missing evidence_enabled"
assert "evidence" in result, "Missing evidence object"
assert "audit_summary" in result, "Missing audit_summary"
print("✓ Test 1 passed: Evidence is included")
```

### Test 2: Metrics are tracked
```python
evidence = result["evidence"]
assert len(evidence["metrics"]) > 0, "No metrics tracked"
metric_name = list(evidence["metrics"].keys())[0]
print(f"✓ Test 2 passed: Tracked metric '{metric_name}'")
```

### Test 3: Source rows recorded
```python
metric = evidence["metrics"][metric_name]
assert len(metric["source_rows"]) > 0, "No source rows"
assert metric["rows_matched"] > 0, "No rows matched"
print(f"✓ Test 3 passed: {metric['rows_matched']} source rows tracked")
```

### Test 4: Formula documented
```python
assert metric["aggregation_formula"] is not None, "No formula"
formula = metric["aggregation_formula"]
assert len(formula["formula_text"]) > 0, "Empty formula"
print(f"✓ Test 4 passed: Formula documented")
```

---

## Common Pitfalls & Solutions

### ❌ "Evidence not showing"
**Fix**: Add these 3 lines before return:
```python
response["evidence"] = tracker.export_evidence()
response["audit_summary"] = tracker.export_audit_summary()
response["evidence_enabled"] = True
```

### ❌ "Source rows are empty"
**Fix**: Row indices must be 0-based:
```python
# WRONG
source_rows = [SourceRow(row_index=1, ...)]  # Should be 0

# CORRECT
for i in range(len(df)):
    source_rows.append(SourceRow(row_index=i, ...))
```

### ❌ "Performance is slow"
**Fix**: Limit source rows to 100:
```python
source_rows = [... for i in indices][:100]  # Show first 100 only
```

### ❌ "Formula looks wrong"
**Fix**: Make formulas descriptive:
```python
# WRONG
formula_text = "SUM"

# CORRECT
formula_text = "SUM(revenue) WHERE revenue > 0 AND NOT NULL"
```

---

## Next: Frontend Integration

Once backend is done, add this to your component:

```tsx
import { EvidenceButton } from '../components/ui/EvidenceButton';
import { EvidenceDrawer } from '../components/ui/EvidenceDrawer';
import { useEvidence } from '../hooks/useEvidence';

function MyComponent() {
  const { selectedEvidence, showEvidence, closeEvidence } = useEvidence();
  const { data } = useQuery(['my-engine'], () => api.getMyEngine());
  
  const metricEvidence = data?.evidence?.metrics?.total_search_volume;
  
  return (
    <>
      <div>
        <h2>Total Search Volume: {metricEvidence?.metric_value}</h2>
        <EvidenceButton 
          metric={metricEvidence}
          onView={showEvidence}
        />
      </div>
      <EvidenceDrawer 
        evidence={selectedEvidence}
        onClose={closeEvidence}
      />
    </>
  );
}
```

---

## Files You Need

1. `ENGINE_INTEGRATION_GUIDE.md` - Detailed reference
2. `DATA_PROVEN_IMPLEMENTATION_GUIDE.md` - Architecture guide
3. `app/models/lineage.py` - Data models (read-only)
4. `app/services/lineage_service.py` - Tracker API
5. This file - Quick start reference

---

## Estimated Timeline

| Task | Time | Status |
|------|------|--------|
| Read this guide | 10 min | 📖 |
| Copy-paste template | 5 min | 📋 |
| Add to your engine | 15 min | 💻 |
| Test with data | 10 min | ✅ |
| **Total** | **40 min** | |

---

## Getting Help

1. **Template doesn't work?** → Copy-paste the template above
2. **Don't understand X?** → Check `ENGINE_INTEGRATION_GUIDE.md` section
3. **Still stuck?** → Check troubleshooting section in this file
4. **Found a bug?** → Check lineage.py for data model docs

---

## One Last Thing

> Every metric you track becomes auditable.
> Every calculation becomes transparent.
> Every insight becomes provable.
>
> You're building a financial-audit-grade analytics platform.
>
> **Make it count. Make it traceable. Make it real.**

---

**Ready?** Start with the template above. It's 90% of what you need.

**Questions?** See the guides referenced above.

**Done?** Test it, commit it, move to next engine.

**Let's go! 🚀**
