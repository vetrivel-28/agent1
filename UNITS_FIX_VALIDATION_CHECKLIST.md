# Revenue Momentum Units Fix — Validation Checklist

## Pre-Deployment Verification

### ✅ Phase 1: Code Review Verification

#### Backend Changes (revenue_momentum_engine.py)

**1. Column Candidates Expansion**
- [x] Line 24-37: _SALES_CANDIDATES now includes 12 variants
- [x] Priority order correct: "Parent Level Units Sold" first
- [x] Covers common variations: Units Sold, Monthly Sales, Estimated Sales
- [x] Case-insensitive matching maintained

**2. Units Export to Frontend**
- [x] Line 650: `units_sold` field added to momentum_ledger
- [x] Value is `None` when parent_sales missing (not 0)
- [x] Value is rounded float when parent_sales exists
- [x] Uses same calculation as parent_sales (brand-level SUM)

**3. Units Metadata Export**
- [x] Lines 838-844: audit_flags includes units diagnostics
- [x] Exports: units_column_detected (actual column name or None)
- [x] Exports: units_column_candidates (full list for transparency)
- [x] Exports: units_rows_with_valid_data (count)
- [x] Exports: units_rows_with_missing_data (count)

#### Frontend Changes (RevenueMomentum.tsx)

**1. Removed Dangerous Fallbacks**
- [x] Line 147: `br.units_sold || 0` → `br.units_sold ?? null`
- [x] Line 163: `(b.units_sold || 0)` → `(b.units_sold ?? 0)` with `?? null` wrapper
- [x] Line 240: `row.units_sold || 0` → `row.units_sold ?? null`

**2. Smart Display Logic**
- [x] Lines 167-169: unitsAvailable check added
- [x] Shows formatted number when available
- [x] Shows "Unavailable" when missing
- [x] Never shows misleading "0" for null data

**3. Evidence Integration**
- [x] Line 172: Uses unitsDisplay variable in calc steps
- [x] Preserves null through evidence chain
- [x] EvidenceModal type updated to allow null

#### Type System Changes (EvidenceModal.tsx)

**1. TypeScript Interface Update**
- [x] Line 26: top_records type allows `string | number | null`
- [x] Backward compatible with existing evidence
- [x] Modal rendering uses `?? '—'` for null display

---

### ✅ Phase 2: Build Verification

#### Frontend Build
```
✓ TypeScript compilation: 0 errors
✓ Vite build: 876ms
✓ All modules transformed: 2855 modules
✓ Output: dist/ folder generated
✓ No type errors related to units_sold
```

#### Backend Syntax
```
✓ Python compilation: py_compile passed
✓ No syntax errors
✓ Import structure intact
```

---

## Post-Deployment Testing

### Test Case 1: Dataset WITH Units Column

**Setup:**
- Upload BlackBox CSV with "Parent Level Units Sold" column
- Column has mix of valid values and some missing rows

**Test Steps:**

1. **Navigate to Revenue Momentum page**
   - Expected: Page loads without errors
   - Expected: audit_flags shows units_column_detected: "Parent Level Units Sold"

2. **Click "Tier A" definition card**
   - Expected: Evidence modal opens
   - Expected: Shows "Combined units: [actual sum]" (e.g., "12,345")
   - Expected: Top 15 brands table shows units column
   - Expected: Brands with units show real values (not 0)
   - Expected: Brands without units show "—"

3. **Click "Tier B" definition card**
   - Expected: Evidence modal opens
   - Expected: Shows non-zero units for brands in Tier B
   - Expected: Units sum matches brand aggregation

4. **Click "Tier C" definition card**
   - Expected: Evidence modal opens
   - Expected: Long tail brands show their actual units
   - Expected: No fake zeros

5. **Click "High Momentum" threshold card**
   - Expected: Evidence modal opens
   - Expected: Shows combined units for high momentum brands
   - Expected: Top 15 brands with momentum ≥ cutoff shown
   - Expected: Units column populated with real values

6. **Click "Medium Momentum" threshold card**
   - Expected: Evidence modal opens
   - Expected: Shows combined units for medium momentum brands
   - Expected: May show "Unavailable" if no brands in medium bucket
   - Expected: Never shows 0 unless truly zero

7. **Click "Low Momentum" threshold card**
   - Expected: Evidence modal opens
   - Expected: Shows combined units for low momentum brands
   - Expected: Units values are real or "—" for missing

8. **Click "Dominant Leaders" quadrant card**
   - Expected: Evidence modal opens
   - Expected: Shows combined units for Tier A/B + High Momentum brands
   - Expected: Brand list includes units column
   - Expected: Revenue and units both populated

9. **Click "Growth Challengers" quadrant card**
   - Expected: Evidence modal opens
   - Expected: Shows combined units for Tier C + High Momentum brands
   - Expected: Units reflect actual dataset values

10. **Click "Revenue Heavyweights" quadrant card**
    - Expected: Evidence modal opens
    - Expected: Shows combined units for Tier A/B + Low Momentum brands
    - Expected: High revenue brands show their units

11. **Click "Long Tail Players" quadrant card**
    - Expected: Evidence modal opens
    - Expected: Shows combined units for Tier C + Low Momentum brands
    - Expected: Many small brands with real unit counts

12. **Click brand row in Full Momentum Ledger**
    - Expected: Evidence modal opens with brand detail
    - Expected: Shows brand units in top_records table
    - Expected: Units match brand's aggregated product units
    - Expected: Null units show as "—" not 0

**Validation Points:**
- [ ] No evidence popup shows "Units Sold: 0" when dataset has units
- [ ] All units values are positive integers or "—"
- [ ] Combined units = sum of individual brand units
- [ ] Units column name shown in source_columns
- [ ] audit_flags.units_rows_with_valid_data > 0

---

### Test Case 2: Dataset WITHOUT Units Column

**Setup:**
- Upload BlackBox CSV without any sales/units columns
- Only has revenue, brand, ASIN columns

**Test Steps:**

1. **Navigate to Revenue Momentum page**
   - Expected: Page loads without errors
   - Expected: audit_flags shows units_column_detected: null
   - Expected: audit_flags shows units_rows_with_missing_data: [total rows]

2. **Click "Tier A" definition card**
   - Expected: Evidence modal opens
   - Expected: Shows "Combined units: Unavailable"
   - Expected: Top 15 brands table shows units column with all "—"
   - Expected: No "0" values displayed

3. **Click any momentum threshold card**
   - Expected: Evidence modal opens
   - Expected: Shows "Combined units: Unavailable"
   - Expected: Brand list has units column showing "—"

4. **Click any quadrant card**
   - Expected: Evidence modal opens
   - Expected: Shows "Combined units: Unavailable"
   - Expected: No misleading zeros

5. **Click brand row in ledger**
   - Expected: Evidence modal opens
   - Expected: Brand detail shows units as "—"
   - Expected: source_columns may not include units column

**Validation Points:**
- [ ] No evidence popup shows "Units Sold: 0"
- [ ] All units show as "Unavailable" or "—"
- [ ] No misleading numeric zeros
- [ ] audit_flags confirms no units column detected
- [ ] Page still functional without units data

---

### Test Case 3: Dataset with Partial Units Data

**Setup:**
- Upload BlackBox CSV with "Monthly Sales" column
- 70% of rows have valid units, 30% missing/null

**Test Steps:**

1. **Navigate to Revenue Momentum page**
   - Expected: audit_flags shows units_column_detected: "Monthly Sales"
   - Expected: audit_flags shows units_rows_with_valid_data: ~70% of total
   - Expected: audit_flags shows units_rows_with_missing_data: ~30% of total

2. **Click tier/momentum/quadrant cards**
   - Expected: Combined units = sum of only valid units
   - Expected: Missing units excluded from sum (not counted as 0)
   - Expected: Brand list shows mix of values and "—"

3. **Click brand row with valid units**
   - Expected: Shows real units value

4. **Click brand row with missing units**
   - Expected: Shows "—" for units
   - Expected: Revenue still shown correctly
   - Expected: No "0" displayed

**Validation Points:**
- [ ] Partial data handled gracefully
- [ ] Missing units don't corrupt aggregation
- [ ] Real zeros (if any) preserved
- [ ] Null/missing displayed as "—"

---

### Test Case 4: Dataset with Alternative Column Names

**Setup:**
- Test with datasets having different units columns:
  - "Units Sold" (no "Parent Level")
  - "Estimated Sales"
  - "Units"

**Test Steps:**

1. **Upload dataset with "Units Sold" column**
   - Expected: audit_flags shows units_column_detected: "Units Sold"
   - Expected: All evidence shows real units from this column

2. **Upload dataset with "Estimated Sales" column**
   - Expected: audit_flags shows units_column_detected: "Estimated Sales"
   - Expected: Evidence uses this column for units

3. **Upload dataset with "Units" column**
   - Expected: audit_flags shows units_column_detected: "Units"
   - Expected: Lower priority but still detected

**Validation Points:**
- [ ] Column detection follows priority order
- [ ] Alternative column names work correctly
- [ ] First matching column is used
- [ ] audit_flags accurately reports detected column

---

### Test Case 5: Edge Cases

**Scenario A: All brands have zero units**
- Expected: Shows "0" (real zero from dataset)
- Expected: Not same as "Unavailable"
- Expected: Evidence distinguishes real zero from missing

**Scenario B: Dataset has both "Parent Level Units Sold" and "Units Sold"**
- Expected: Uses "Parent Level Units Sold" (higher priority)
- Expected: Ignores "Units Sold" column
- Expected: audit_flags shows only the selected column

**Scenario C: Units column has text values**
- Expected: Backend _clean_numeric converts to float
- Expected: Invalid values become NaN → None
- Expected: Shown as "—" not 0

**Scenario D: Units column has comma-formatted numbers**
- Expected: Backend _clean_numeric strips commas
- Expected: "1,234" → 1234.0
- Expected: Displays correctly

**Scenario E: Very large brand list (200+ brands)**
- Expected: Evidence shows top 15 only
- Expected: Combined units = sum of all (not just top 15)
- Expected: No performance issues

---

## Regression Testing

### Verify No Breaking Changes:

1. **Revenue Momentum page without units column**
   - [ ] Page still loads
   - [ ] Momentum scores calculated correctly
   - [ ] Revenue tier classification works
   - [ ] No JavaScript errors in console

2. **Revenue Momentum page with units column**
   - [ ] All existing features work
   - [ ] Momentum score calculation unchanged
   - [ ] Classification logic unchanged
   - [ ] PDF export still works (if applicable)

3. **Other dashboard pages**
   - [ ] DashboardOverview unaffected
   - [ ] MarketConcentration unaffected
   - [ ] FinanceIntelligence unaffected
   - [ ] No cascade failures

4. **Evidence Modal component**
   - [ ] Works on other pages (DemandStrength, etc.)
   - [ ] Backward compatible with old evidence format
   - [ ] No type errors in other pages

---

## Performance Testing

1. **Large dataset (10,000+ products)**
   - [ ] Units aggregation completes in <2s
   - [ ] Frontend renders evidence in <500ms
   - [ ] No memory leaks

2. **Many brands (500+ brands)**
   - [ ] Brand-level grouping efficient
   - [ ] Evidence modal loads quickly
   - [ ] Top 15 limit prevents DOM bloat

---

## User Experience Validation

### Visual Inspection:

1. **Evidence Modal Layout**
   - [ ] Units displayed in readable format (commas)
   - [ ] "Unavailable" clearly visible
   - [ ] "—" symbol properly aligned in tables
   - [ ] No layout shifts when units missing

2. **Calculation Steps**
   - [ ] Step 7 shows "Combined units: X" or "Unavailable"
   - [ ] No confusing "0" in steps
   - [ ] Clear language about data availability

3. **Top Records Table**
   - [ ] Units column header visible
   - [ ] Units values right-aligned (if numeric)
   - [ ] "—" centered in cell
   - [ ] No overlapping text

---

## Error Handling

1. **API returns malformed units data**
   - [ ] Frontend doesn't crash
   - [ ] Gracefully shows "—"
   - [ ] Console error logged

2. **Backend fails to detect column**
   - [ ] Returns units_column_detected: null
   - [ ] Frontend handles gracefully
   - [ ] No fake zeros displayed

3. **Network timeout during load**
   - [ ] Frontend shows loading state
   - [ ] Retry mechanism works
   - [ ] No stale zero data cached

---

## Documentation Verification

1. **Code Comments**
   - [ ] Backend: _SALES_CANDIDATES documented
   - [ ] Frontend: Null handling explained
   - [ ] EvidenceData type change noted

2. **User-Facing Messages**
   - [ ] "Unavailable" is clear to users
   - [ ] No technical jargon in evidence
   - [ ] Calculation steps readable

3. **API Response Schema**
   - [ ] units_sold field documented
   - [ ] audit_flags fields documented
   - [ ] Null vs 0 distinction clear

---

## Sign-Off Checklist

### Development Complete:
- [x] Backend changes implemented
- [x] Frontend changes implemented
- [x] Type system updated
- [x] Builds pass (frontend + backend)
- [x] No syntax errors

### Ready for Testing:
- [ ] Test Case 1 passed (dataset with units)
- [ ] Test Case 2 passed (dataset without units)
- [ ] Test Case 3 passed (partial units data)
- [ ] Test Case 4 passed (alternative column names)
- [ ] Test Case 5 passed (edge cases)

### Ready for Production:
- [ ] All regression tests passed
- [ ] Performance acceptable
- [ ] UX validated
- [ ] Error handling verified
- [ ] Documentation complete

---

## Known Limitations

1. **Column Semantic Ambiguity:**
   - Some datasets use "Sales" to mean units, others for revenue
   - Current fix assumes "Sales" = units (lower priority than "Units Sold")
   - If mismatch detected, manual column mapping needed

2. **No Historical Units:**
   - Fix only handles current/monthly units
   - No trend analysis for units over time
   - Backend note: "historical_period_records_available": False

3. **Single Column Detection:**
   - Uses first matching column only
   - If dataset has multiple valid columns, others ignored
   - No multi-column fallback logic

---

## Rollback Triggers

**Rollback if:**
- Units show incorrect values (not matching dataset)
- Page crashes when units column missing
- Performance degrades significantly (>5s load time)
- Evidence modal fails to open
- Other pages break due to EvidenceData type change

**Rollback Steps:**
1. Revert revenue_momentum_engine.py to previous version
2. Revert RevenueMomentum.tsx to previous version
3. Revert EvidenceModal.tsx to previous version
4. Rebuild frontend
5. Restart backend
6. Verify old behavior restored

---

## Success Criteria

**Fix is successful when:**
1. ✅ No evidence popup shows fake "Units Sold: 0"
2. ✅ Real units from dataset display correctly
3. ✅ Missing units show as "Unavailable" or "—"
4. ✅ audit_flags provide transparency
5. ✅ Build passes with zero errors
6. ✅ No regression on other pages
7. ✅ User feedback confirms fix addresses original issue

---

## Next Steps After Validation

1. Deploy to staging environment
2. Run full test suite
3. Get user acceptance testing
4. Monitor production logs for edge cases
5. Gather feedback on "Unavailable" messaging
6. Consider enhancements (units/revenue ratio, etc.)
