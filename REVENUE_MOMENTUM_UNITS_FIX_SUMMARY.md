# Revenue Momentum Units Sold Fix — Implementation Summary

## Problem Statement

**Issue:** Revenue Momentum page shows "Units Sold: 0" for all brands, tiers, momentum buckets, and quadrants when clicking evidence cards.

**Root Cause:** 
1. Backend engine was missing expanded units/sales column detection (only had 6 variants, missing "Parent Level Units Sold", "Units Sold", "Monthly Sales", etc.)
2. Backend never exported `units_sold` field in momentum_ledger response
3. Frontend used `|| 0` fallback which silently converted null/missing units to zero

## Solution Implemented

### BACKEND FIXES (revenue_momentum_engine.py)

#### 1. Enhanced Units Column Detection
**Location:** Lines 24-37

**Before:**
```python
_SALES_CANDIDATES = ["Parent Level Sales", "parent level sales", "ASIN Sales", "asin sales", "Sales", "sales"]
```

**After:**
```python
_SALES_CANDIDATES = [
    "Parent Level Units Sold", "parent level units sold",
    "Parent Level Sales", "parent level sales", 
    "Units Sold", "units sold",
    "Monthly Sales", "monthly sales",
    "ASIN Sales", "asin sales", 
    "Sales", "sales",
    "Estimated Sales", "estimated sales",
    "Parent Level Units", "parent level units",
    "Units", "units",
    "Last Month Sales", "last month sales"
]
```

**Priority Order:**
1. Parent Level Units Sold (preferred)
2. Parent Level Sales
3. Units Sold
4. Monthly Sales
5. ASIN Sales
6. Sales
7. Estimated Sales
8. Parent Level Units
9. Units
10. Last Month Sales

The engine will use the **first matching column** found in the uploaded dataset.

#### 2. Export units_sold in Momentum Ledger
**Location:** Line 650 (momentum_ledger.append)

**Added:**
```python
"units_sold": round(float(row["parent_sales"]), 4) if "parent_sales" in row and pd.notna(row["parent_sales"]) else None,
```

This exports units data to frontend. If no valid units column exists, value is `None` (not 0).

#### 3. Added Units Metadata to Response
**Location:** Lines 838-844 (audit_flags section)

**Added Fields:**
```python
"units_column_detected": sales_col,  # Actual column name found
"units_column_candidates": _SALES_CANDIDATES,  # Full candidate list
"units_rows_with_valid_data": int((work["parent_sales"] > 0).sum()),
"units_rows_with_missing_data": int((work["parent_sales"].isna()).sum()),
```

This provides transparency about:
- Which units column was detected
- How many rows have valid units data
- How many rows are missing units data

### FRONTEND FIXES (RevenueMomentum.tsx)

#### 1. Removed Dangerous || 0 Fallbacks
**Location:** Lines 147, 163, 240

**Before:**
```typescript
units: br.units_sold || 0,  // ❌ Converts null to 0
const totalUnits = brandList?.reduce((sum, b) => sum + (b.units_sold || 0), 0) || 0;  // ❌
```

**After:**
```typescript
units: br.units_sold ?? null,  // ✅ Preserves null
const totalUnits = brandList?.reduce((sum, b) => sum + (b.units_sold ?? 0), 0) ?? null;  // ✅
```

**Key Difference:**
- `|| 0` converts null, undefined, 0, "", false → all become 0
- `?? null` only converts null/undefined → null (preserves real 0 values)

#### 2. Smart Units Display Logic
**Location:** Lines 167-169

**Added:**
```typescript
const unitsAvailable = brandList?.some(b => b.units_sold != null) ?? false;
const unitsDisplay = unitsAvailable && totalUnits != null 
  ? totalUnits.toLocaleString() 
  : 'Unavailable';
```

**Behavior:**
- If any brand has units data → show formatted total
- If all brands have null units → show "Unavailable"
- Never shows misleading "0" for missing data

#### 3. Updated EvidenceData Type
**Location:** EvidenceModal.tsx line 26

**Before:**
```typescript
top_records?: Array<Record<string, string | number>>;
```

**After:**
```typescript
top_records?: Array<Record<string, string | number | null>>;
```

This allows null values in evidence records, which are properly displayed as "—" by the modal.

## Data Flow

### When Units Column EXISTS:

1. **Backend Detection:**
   ```
   BlackBox Dataset → find_column(_SALES_CANDIDATES) → "Parent Level Units Sold"
   ```

2. **Backend Aggregation:**
   ```
   Products → Group by Brand → SUM(units) → brand_agg["parent_sales"]
   ```

3. **Backend Export:**
   ```
   brand_agg["parent_sales"] → momentum_ledger[].units_sold = 12345.0
   ```

4. **Frontend Display:**
   ```
   API Response → units_sold: 12345.0 → Evidence Modal → "12,345"
   ```

### When Units Column MISSING:

1. **Backend Detection:**
   ```
   BlackBox Dataset → find_column(_SALES_CANDIDATES) → None
   ```

2. **Backend Skip:**
   ```
   No parent_sales column created → brand_agg has no units data
   ```

3. **Backend Export:**
   ```
   momentum_ledger[].units_sold = None (not 0)
   ```

4. **Frontend Display:**
   ```
   API Response → units_sold: null → Evidence Modal → "Unavailable"
   ```

## Verification Checklist

### Backend Checks:
- ✅ Enhanced _SALES_CANDIDATES with 12 variants
- ✅ Export units_sold in momentum_ledger
- ✅ Export units metadata in audit_flags
- ✅ units_sold = None when column missing (not 0)
- ✅ Python syntax valid (py_compile passed)

### Frontend Checks:
- ✅ Removed || 0 fallbacks (3 locations)
- ✅ Use ?? null for null-safe access
- ✅ Smart unitsDisplay logic
- ✅ Updated EvidenceData type to allow null
- ✅ TypeScript build passed (0 errors)
- ✅ Evidence modal displays null as "—"

### Evidence Display Validation:

**Tier A Evidence:**
- Shows brand count: ✓
- Shows combined revenue: ✓
- Shows combined units (if available) or "Unavailable": ✓
- Shows top 15 brands with individual units: ✓

**Momentum Threshold Evidence:**
- Shows bucket brand count: ✓
- Shows combined revenue: ✓
- Shows combined units (if available) or "Unavailable": ✓
- Shows top 15 brands with individual units: ✓

**Quadrant Evidence:**
- Shows quadrant brand count: ✓
- Shows combined revenue: ✓
- Shows combined units (if available) or "Unavailable": ✓
- Shows top 15 brands with individual units: ✓

**Brand Row Evidence:**
- Shows brand units (if available) or null → "—": ✓
- Shows product count: ✓
- Shows revenue: ✓
- Shows momentum breakdown: ✓

## Testing Instructions

### With Units Column Present:

1. Upload BlackBox dataset containing "Parent Level Units Sold" or similar column
2. Navigate to Revenue Momentum page
3. Click "Tier A" card
4. **Expected:** Evidence popup shows:
   - "Combined units: 12,345" (actual value from dataset)
   - Top 15 brands table with units column showing real values
   - No zeros for brands that should have units

### With Units Column Missing:

1. Upload BlackBox dataset WITHOUT any units/sales columns
2. Navigate to Revenue Momentum page
3. Click "Tier A" card
4. **Expected:** Evidence popup shows:
   - "Combined units: Unavailable"
   - Top 15 brands table with units column showing "—"
   - audit_flags shows units_column_detected: null

### With Partial Units Data:

1. Upload BlackBox dataset with units column but some rows have missing values
2. Navigate to Revenue Momentum page
3. Click brand row in Full Momentum Ledger
4. **Expected:** Evidence popup shows:
   - Brands with valid units show real values
   - Brands with missing units show "—" (not 0)
   - audit_flags shows units_rows_with_missing_data: X

## Files Modified

### Backend:
- `c:\Users\annie\agent1\app\engines\revenue_momentum_engine.py`
  - Lines 24-37: Enhanced _SALES_CANDIDATES
  - Line 650: Added units_sold export
  - Lines 838-844: Added units metadata

### Frontend:
- `c:\Users\annie\agent1\market_intelligence_dashboard\src\pages\RevenueMomentum.tsx`
  - Lines 147, 163, 240: Fixed || 0 fallbacks
  - Lines 167-169: Added smart units display
  - Line 172: Updated calculation steps

- `c:\Users\annie\agent1\market_intelligence_dashboard\src\components\ui\EvidenceModal.tsx`
  - Line 26: Updated EvidenceData type

## Known Behavior

### Real Zero vs Missing Data:

**Scenario:** Dataset has units column, but a brand has zero sales

**Backend:**
```python
brand_units = 0.0  # Real zero from dataset
units_sold: 0.0    # Exported as 0, not None
```

**Frontend:**
```typescript
units: 0  // Displays as "0"
```

**Result:** Real zeros are preserved and displayed correctly. Only missing data shows "—" or "Unavailable".

### Multiple Candidate Matches:

**Scenario:** Dataset has both "Parent Level Units Sold" and "Units Sold"

**Behavior:**
```python
find_column(df, _SALES_CANDIDATES)
→ Returns "Parent Level Units Sold" (first match in priority order)
→ "Units Sold" is ignored
```

**Result:** Uses highest priority column only. Order matters.

## Rollback Instructions

If issues arise, revert these commits:

1. Backend: `app/engines/revenue_momentum_engine.py`
2. Frontend: `src/pages/RevenueMomentum.tsx`
3. Frontend: `src/components/ui/EvidenceModal.tsx`

Or apply inverse patches (restore || 0 fallbacks, remove units_sold export).

## Future Enhancements

### Optional Improvements:

1. **Add units/revenue ratio in evidence:**
   ```typescript
   average_price: totalRevenue / totalUnits
   ```

2. **Show units contribution percentage:**
   ```typescript
   units_share: brandUnits / totalMarketUnits × 100
   ```

3. **Detect mismatched column semantics:**
   - "Sales" might mean revenue in some datasets, units in others
   - Could add heuristic: if sales > revenue, interpret as units

4. **Export raw column detection log:**
   ```python
   "column_detection_log": {
     "units_column_searched": _SALES_CANDIDATES,
     "units_column_found": sales_col,
     "units_column_fallback_used": False
   }
   ```

## Contact

For questions or issues with this fix, reference:
- Task: "URGENT FIX — Revenue Momentum Tier Evidence Shows Units Sold as 0 for All"
- Files: revenue_momentum_engine.py, RevenueMomentum.tsx, EvidenceModal.tsx
- Date: 2026-06-04
