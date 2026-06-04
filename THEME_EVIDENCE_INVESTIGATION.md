# Theme Search Volume Evidence Investigation

## USER REPORT

**Observed Values in Evidence Popup:**
- Theme: Generic
- Theme Search Volume: 105,280,005
- Total Search Volume: 146,404,661
- Rows used: 12,165

**User Concern:** These numbers seem suspiciously high and may not match the active uploaded dataset.

---

## INVESTIGATION FINDINGS

### Current Data Flow

**Backend Calculation (`demand_engine.py`):**

1. **Load Magnet Dataset** (lines 105-133):
   ```python
   tmp = magnet_df[[kw_col]].copy()
   sv_c, _ = clean_numeric_series(magnet_df[sv_col], sv_col)
   tmp["_sv"] = sv_c
   tmp = tmp.dropna(subset=["_sv"])
   tmp = tmp[tmp["_sv"] > 0]
   ```
   - Cleans numeric values in Search Volume column
   - Drops rows with missing/invalid/zero search volume

2. **Deduplicate Keywords** (lines 122-128):
   ```python
   tmp_agg = tmp.groupby("_kw_clean").agg(
       _sv=("_sv", "sum"),
       _ks=("_ks", "sum"),
       kw_original=(kw_col, "first"),
   ).reset_index()
   ```
   - Groups by normalized keyword (lowercase, trimmed)
   - Sums search volume for duplicate keywords
   - **This is correct behavior** — avoids double-counting

3. **Calculate Total Search Volume** (line 130):
   ```python
   total_heatmap_sv = float(tmp_agg["_sv"].sum())
   ```
   - Sums search volume across all deduplicated valid keywords
   - This becomes `total_search_volume` in the response

4. **Calculate Theme Search Volume** (lines 250-269):
   ```python
   for seg, seg_df in tmp_exploded.groupby("_final_seg"):
       sv = float(seg_df["_sv"].sum())
       ...
       segment_list.append({
           "segment": seg,
           "total_search_volume": int(sv),
           ...
       })
   ```
   - Groups keywords by assigned theme
   - Sums search volume for each theme
   - This becomes `theme_search_volume` in theme evidence

5. **Evidence Creation** (lines 565-586):
   ```python
   "evidence": _create_evidence(
       "Magnet",
       [sv_col, kw_col],
       "Demand Share = Theme Search Volume / Total Search Volume × 100",
       {
           "theme_search_volume": top_seg["total_search_volume"],
           "total_search_volume": total_market_sv,
           ...
       },
       ...
   )
   ```

**Frontend Display (`DemandStrength.tsx`, lines 220-261):**
```typescript
counts: {
  theme_search_volume: row.total_search_volume,
  total_search_volume: diag.total_search_volume ?? 0,
  keyword_count: row.keyword_count ?? 0,
  ...
}
```
- Displays `total_search_volume` directly from backend
- No frontend calculation or manipulation

**Cache Management (`analysis_cache.py`):**
- Cache is cleared on every dataset upload (verified in `api.py` lines 189, 207, 225)
- No stale data should persist across uploads

---

## VALIDATION POINTS

### Are the values actually wrong?

**Possibility 1: Values are CORRECT but seem high**
- If the uploaded Magnet dataset contains 12,165 unique keywords
- And those keywords have legitimate search volumes in millions
- Then Total Search Volume of 146M is plausible
- Theme Search Volume of 105M for "Generic" (72% of total) suggests most keywords lack specific classification

**Possibility 2: Values are WRONG due to data quality issue**
- Search Volume column might contain cumulative values instead of monthly values
- Search Volume might be pre-summed or aggregated incorrectly in source file
- Duplicate keyword rows not being deduplicated correctly
- Wrong column being read as Search Volume

**Possibility 3: Values are CACHED from previous upload**
- ❌ **Ruled Out** — cache is cleared on upload (verified in code)
- Session ID tracks which dataset version was used

---

## REQUIRED FIXES

### Fix 1: Add Detailed Count Verification to Evidence

**Backend (`demand_engine.py`):**

Add to evidence `source_values` for every theme:

```python
{
    "theme_search_volume": top_seg["total_search_volume"],
    "total_search_volume": total_market_sv,
    "keyword_count": top_seg["keyword_count"],
    "total_keyword_count": diag_meta["total_keyword_count"],
    
    # ADD THESE:
    "total_dataset_rows": len(magnet_df),  # Raw uploaded rows
    "rows_with_valid_sv": len(tmp),  # After dropping invalid SV
    "rows_excluded_invalid_sv": len(magnet_df) - len(tmp),
    "deduped_keyword_count": len(tmp_agg),  # After deduplication
    "theme_keyword_count": top_seg["keyword_count"],  # Keywords in this theme
    "theme_rows_raw": <count before dedup>,  # If available
}
```

Add to `calculation_steps`:

```python
[
    f"1. Total dataset rows uploaded: {len(magnet_df):,}",
    f"2. Rows with valid Search Volume: {len(tmp):,}",
    f"3. Rows excluded (invalid/missing/zero SV): {len(magnet_df) - len(tmp):,}",
    f"4. Unique keywords after deduplication: {len(tmp_agg):,}",
    f"5. Total Search Volume = SUM(Search Volume for {len(tmp_agg):,} unique keywords) = {total_market_sv:,}",
    f"6. Theme '{top_seg['segment']}' keywords: {top_seg['keyword_count']:,}",
    f"7. Theme '{top_seg['segment']}' Search Volume = {top_seg['total_search_volume']:,}",
    f"8. Demand Share = {top_seg['total_search_volume']:,} / {total_market_sv:,} × 100 = {top_seg['demand_share']:.1f}%",
]
```

---

### Fix 2: Add Validation Check for Sum Integrity

**Backend (`demand_engine.py`):**

Add to diagnostics evidence:

```python
# Calculate sum of all theme search volumes
theme_sv_sum = sum(s["total_search_volume"] for s in segment_list)
unclassified_sv = diag_meta["unclassified_search_volume"]
reconstructed_total = theme_sv_sum + unclassified_sv

# Check if it matches
mismatch = abs(reconstructed_total - total_market_sv)
mismatch_pct = (mismatch / total_market_sv * 100) if total_market_sv > 0 else 0

calculation_steps.append(
    f"Validation: Sum of all theme SVs = {theme_sv_sum:,}"
)
calculation_steps.append(
    f"Validation: Unclassified SV = {unclassified_sv:,}"
)
calculation_steps.append(
    f"Validation: Reconstructed Total = {reconstructed_total:,}"
)
calculation_steps.append(
    f"Validation: Original Total = {total_market_sv:,}"
)

if mismatch > 1:
    calculation_steps.append(
        f"⚠️ MISMATCH: Difference = {mismatch:,} ({mismatch_pct:.2f}%)"
    )
else:
    calculation_steps.append(
        "✓ Sum Validation PASSED: Theme SVs + Unclassified = Total"
    )
```

---

### Fix 3: Add Top Contributing Keywords to Theme Evidence

**Backend (`demand_engine.py`):**

Ensure `top_keywords` in evidence includes actual search volumes:

```python
"top_keywords": [
    {
        "keyword": k["keyword"],
        "search_volume": k["search_volume"],
        "contribution_pct": (k["search_volume"] / top_seg["total_search_volume"] * 100) if top_seg["total_search_volume"] > 0 else 0,
    }
    for k in top_seg["keywords"][:20]
]
```

This allows user to manually verify: "Do these 20 keywords actually sum to a reasonable portion of 105M?"

---

### Fix 4: Add Data Source Transparency

**Backend (`demand_engine.py`):**

Add to evidence:

```python
{
    "source_file_name": <if available from registry>,
    "upload_timestamp": <from registry>,
    "dataset_session_id": session_id,  # Already included
    "search_volume_column_detected": sv_col,
    "keyword_column_detected": kw_col,
}
```

This helps user verify: "Is this reading from the correct dataset and correct columns?"

---

## TESTING INSTRUCTIONS

### Manual Verification Steps

1. **Export Evidence to Check**:
   - Click theme in UI
   - Evidence popup appears
   - Manually record:
     - Theme Search Volume
     - Total Search Volume
     - Rows used
     - Top 10 keywords shown

2. **Verify Against Source File**:
   - Open the original uploaded CSV/Excel
   - Filter to keywords matching the theme
   - Sum Search Volume column manually or in Excel
   - Compare to Theme Search Volume in evidence

3. **Check Total**:
   - Sum entire Search Volume column in source file
   - Compare to Total Search Volume in evidence
   - Account for:
     - Duplicate keywords (should be deduplicated)
     - Invalid/missing values (should be excluded)
     - Zero values (should be excluded)

4. **Check Keyword Count**:
   - Count unique keywords in source file (after cleaning)
   - Compare to "Rows used" in evidence

### Expected Discrepancies (OK):

- **Source file total > Evidence total**: Some rows excluded due to invalid/missing/zero search volume (OK)
- **Source file keyword count > Evidence count**: Duplicate keywords deduplicated (OK)
- **Theme SV < sum of theme keywords in source**: Deduplication occurred (OK)

### Actual Problems (NOT OK):

- **Evidence total >> source file total**: Wrong column being read, or cumulative values
- **Theme SV > Total SV**: Math error, should be impossible
- **Sum of all themes ≠ Total**: Missing classification or double-counting
- **Theme shows 0 keywords but SV > 0**: Data integrity issue

---

## DECISION TREE

**IF** user manually verifies evidence values match source file:
→ Values are CORRECT, just unexpectedly high due to dataset characteristics
→ No code fix needed, add transparency (Fix 1-4 above)

**IF** user manually verifies evidence values DON'T match source file:
→ Values are WRONG, investigate:
1. Is correct column being detected as Search Volume?
2. Is deduplication working correctly?
3. Is theme assignment logic correct?
4. Is there a pandas aggregation bug?

---

## NEXT STEPS

**OPTION A: Add Transparency (Recommended)**
- Implement Fix 1-4 above
- User can validate evidence against source file
- No logic changes, just better visibility

**OPTION B: Wait for User Confirmation**
- User provides sample of source dataset
- Agent verifies calculation manually
- Confirms if bug exists or values are legitimate

**OPTION C: Add Debug Endpoint (Advanced)**
- Create `/api/debug/demand-calculation` endpoint
- Returns raw intermediate DataFrames
- Shows step-by-step: raw → cleaned → deduplicated → themed
- User can see exact transformation pipeline

---

**CURRENT STATUS:** Investigation complete, awaiting user decision on which fix to implement.

**RECOMMENDATION:** Implement Fix 1 (detailed count verification) first. This adds transparency without changing logic. If user confirms values are still wrong after seeing detailed breakdown, then investigate further.

