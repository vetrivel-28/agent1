# Entry Difficulty & Entry Cost Index Audit & Fix

## Problem Statement
Entry Difficulty and Entry Cost Index scores were unrealistically low (3–4/100), leading to false "Easy" classifications despite actual market barriers. Root causes:
1. **Simple min-max normalization** without percentile-based clipping
2. **Loose classification thresholds** (0-33 = "Easy")
3. **Single metric** conflating Entry Difficulty with Entry Cost Index
4. **No component breakdown** to understand score drivers
5. **Missing-data handled poorly** (no robust exclusion strategy)

## Solution Overview

### 1. Robust Percentile-Based Normalization
**File**: `app/analytics/finance/_utils.py`

Added `percentile_clip_and_scale()` function:
- Extracts valid numeric values, clips to 5th–95th percentile bounds
- Winsorizes outliers before min-max scaling to 0–100
- Prevents extreme values from distorting market scores
- Optionally inverts (100 - value) for metrics where higher = worse

### 2. Separate Entry Difficulty & Entry Cost Index
**File**: `app/analytics/finance/entry_cost.py` (completely rewritten)

#### Entry Difficulty (7-component weighted score)
- **CPR burden**: 25% — cost per result (higher = harder)
- **Sponsored ASIN pressure**: 15% — paid ad competition
- **Competing product density**: 15% — number of direct competitors
- **Review barrier**: 15% — review count (higher = harder to displace)
- **Organic title density**: 10% — organic search saturation
- **Revenue concentration**: 10% — parent-level revenue (harder to displace high-revenue sellers)
- **PPC bid pressure**: 10% — cost to bid for visibility

#### Entry Cost Index (5-component weighted score)
- **CPR burden**: 30% — direct cost signal
- **PPC bid pressure**: 25% — visibility acquisition cost
- **Sponsored ASIN pressure**: 20% — competitive paid presence
- **Review barrier**: 15% — cost to build credibility
- **Competition density**: 10% — market saturation

### 3. Improved Classification Thresholds
**File**: `app/analytics/finance/_utils.py`

Added `classify_pressure_level()` replacing old 0–33/34–66/67–100 system:
```
- 0–25: Low observed pressure (not "Easy" — acknowledges data quality)
- 26–50: Moderate pressure
- 51–75: High pressure
- 76–100: Severe pressure
```

### 4. Component Breakdown & Missing-Data Transparency
**Files**: `app/analytics/finance/entry_cost.py`

Returned structure now includes:
```python
{
    "entry_difficulty": {
        "score": 45.2,
        "classification": "Moderate pressure",
        "components": [
            {"component": "CPR Burden", "score": 52.3, "weight": 0.25},
            {"component": "Sponsored Pressure", "score": 38.1, "weight": 0.15},
            ...
        ],
        "components_available": 7,
        "components_missing": ["Revenue Concentration"],  # If data unavailable
    },
    "entry_cost_index": {...},
    "all_component_scores": {...},
    "components_metadata": {...},  # Detailed stats per component
    "normalization_method": "Percentile-based (5th–95th clip) with robust winsorization"
}
```

### 5. Updated Finance Intelligence Service
**File**: `app/services/finance_intelligence.py`

- Added `_extract_entry_metrics()` to parse new entry metrics structure
- Updated health component calculation to use entry_difficulty separately
- Entry difficulty contributes to Finance Health (inverted: higher difficulty = lower health)
- Updated radar chart to show both Entry Difficulty and Entry Cost Index as separate dimensions
- Updated market economics narrative to report both metrics
- Improved formula documentation with normalization method details

## Data Handling Strategy

### Missing Values
- **Excluded from component calculation**: Missing values don't contribute to the weighted average
- **Weight re-normalization**: If a component is missing, its weight is redistributed to available components
- **Transparency**: `components_missing` array shows which data points weren't available
- **Never zero-filled**: Missing values are never treated as zero (preventing false lows)

### Percentile Clipping
- **Lower bound**: 5th percentile
- **Upper bound**: 95th percentile
- **Effect**: Extreme values (rare expensive CPR in one category, cheap CPR in another) don't dominate the score
- **Real-world example**: 
  - Raw CPR values: [0.50, 0.55, 1.20, 2.50, 100.00] (outlier)
  - After clipping to 5th–95th: [0.50, 0.55, 1.20, 2.50, 2.50]
  - Prevents one outlier from making all others appear "easy"

## Validation Checklist

Before deploying:
- [ ] Upload current datasets (Magnet + BlackBox)
- [ ] Run Market Report (trigger `finance_intelligence.run()`)
- [ ] Check Entry Difficulty score (should be 30–60 range for typical competitive markets)
- [ ] Check Entry Cost Index score (should be 20–70 range)
- [ ] Verify component breakdown shows which columns were used
- [ ] Confirm radar chart includes both metrics separately
- [ ] Review market economics narrative includes both classifications
- [ ] Test with datasets of varying sizes (100s, 1000s, 10000s rows)
- [ ] Verify no hardcoded values appear in scores (all dataset-driven)

## Breaking Changes

### API Changes
- **Old**: `entry_cost.get("score")` returns single Entry Cost Index
- **New**: Entry metrics returns dict with separate `entry_difficulty` and `entry_cost_index` dicts
- **Migration**: Finance Intelligence now extracts both and handles properly

### Classification Changes
- **Old**: "Easy", "Moderate", "Difficult"
- **New**: "Low observed pressure", "Moderate pressure", "High pressure", "Severe pressure"
- **Rationale**: Avoids false confidence from incomplete data

## Testing with Current Data

To verify the fix works with your uploaded data:

```bash
# 1. Start the API
uvicorn app.main:app --reload

# 2. Trigger Market Report endpoint
GET /api/v1/market-report?top_n=50

# 3. Check the finance_intelligence result
# Look for entry_metrics with proper component breakdown
# Verify scores are 30-80 range (not 3-4)
# Verify "Low observed pressure" not "Easy"

# 4. Inspect individual components in the breakdown
# Review which data sources contributed to each score
```

## Example Output Structure

```json
{
  "finance_intelligence": {
    "entry_metrics": {
      "status": "success",
      "entry_difficulty": {
        "score": 48.5,
        "classification": "Moderate pressure",
        "components": [
          {
            "component": "CPR Burden",
            "score": 52.3,
            "weight": 0.25
          },
          {
            "component": "Sponsored Pressure",
            "score": 45.1,
            "weight": 0.15
          }
        ],
        "components_available": 7,
        "components_missing": []
      },
      "entry_cost_index": {
        "score": 52.1,
        "classification": "Moderate pressure",
        "components": [
          {
            "component": "CPR Burden",
            "score": 52.3,
            "weight": 0.30
          },
          {
            "component": "PPC Bid Pressure",
            "score": 60.2,
            "weight": 0.25
          }
        ],
        "components_available": 5,
        "components_missing": []
      },
      "normalization_method": "Percentile-based (5th–95th clip) with robust winsorization"
    }
  }
}
```

## Files Modified

1. **`app/analytics/finance/_utils.py`**
   - Added `percentile_clip_and_scale()` function
   - Added `classify_pressure_level()` function
   - Kept other utilities unchanged for backward compatibility

2. **`app/analytics/finance/entry_cost.py`**
   - Completely rewritten with 7-component Entry Difficulty score
   - Added separate 5-component Entry Cost Index score
   - Added component breakdown with metadata
   - Added `compute_entry_metrics()` as main function
   - Created `compute_entry_cost` alias for backward compatibility

3. **`app/services/finance_intelligence.py`**
   - Added `_extract_entry_metrics()` helper
   - Updated health component calculation
   - Updated narrative function signature and logic
   - Updated result structure to include `entry_metrics`
   - Updated radar chart to show both Entry Difficulty and Entry Cost Index
   - Improved formula documentation

## Next Steps

1. Test with your current datasets
2. Verify scores are realistic (30–80 range, not 3–4)
3. Confirm component breakdown shows actual market pressures
4. Review if any adjustments to weights are needed for your market
5. Update frontend to display both Entry Difficulty and Entry Cost Index separately
6. Update reports to show component-level breakdowns in PDF/HTML exports
