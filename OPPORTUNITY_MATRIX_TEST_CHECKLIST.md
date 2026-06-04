# Opportunity Matrix Fix — Quick Test Checklist

## Build Status ✅
- [x] Frontend build: 0 TypeScript errors, 867ms
- [x] No diagnostic issues
- [x] Code changes verified

---

## Visual Testing Required

### Test 1: Initial Page Load (No Filter)
- [ ] Navigate to "Keyword Conversion Intelligence" page
- [ ] **Scatter plot shows multiple colored points** (purple, green, red, gray)
- [ ] **No filter badge visible**
- [ ] **All 4 segment cards show counts > 0** (if data exists for those segments)
- [ ] Demand Winner card shows count
- [ ] Hidden Gem card shows count  
- [ ] Friction Keyword card shows count
- [ ] Low Priority card shows count
- [ ] "All Keyword Conversion Records" table has rows

---

### Test 2: Click Demand Winner Card
- [ ] Click "Demand Winner" segment card (purple)
- [ ] **Card highlights** (border changes to primary color)
- [ ] **Filter badge appears**: "FILTER: Demand Winner"
- [ ] **Scatter plot shows only purple points**
- [ ] **Table shows only Demand Winner keywords**
- [ ] **CRITICAL: Hidden Gem count still shows original value (NOT 0)**
- [ ] **CRITICAL: Friction Keyword count still shows original value (NOT 0)**
- [ ] **CRITICAL: Low Priority count still shows original value (NOT 0)**
- [ ] **CRITICAL: Demand Winner count still shows original value (unchanged)**

---

### Test 3: Toggle Filter Off
- [ ] Click "Demand Winner" card again (or click "Clear" button)
- [ ] **Filter badge disappears**
- [ ] **Card highlight disappears**
- [ ] **Scatter plot shows all colored points** (back to multi-color view)
- [ ] **Table shows all keywords**
- [ ] **All segment card counts remain unchanged**

---

### Test 4: Click Hidden Gem Card
- [ ] Click "Hidden Gem" segment card (green)
- [ ] **Card highlights**
- [ ] **Filter badge appears**: "FILTER: Hidden Gem"
- [ ] **Scatter plot shows only green points**
- [ ] **Table shows only Hidden Gem keywords**
- [ ] **All segment card counts remain unchanged** (including Demand Winner, Friction, Low Priority)

---

### Test 5: Click Friction Keyword Card
- [ ] Clear any active filter first
- [ ] Click "Friction Keyword" segment card (red)
- [ ] **Card highlights**
- [ ] **Filter badge appears**: "FILTER: Friction Keyword"
- [ ] **Scatter plot shows only red points**
- [ ] **Table shows only Friction keywords**
- [ ] **All segment card counts remain unchanged**

---

### Test 6: Click Low Priority Card
- [ ] Clear any active filter first
- [ ] Click "Low Priority" segment card (gray)
- [ ] **Card highlights**
- [ ] **Filter badge appears**: "FILTER: Low Priority"
- [ ] **Scatter plot shows only gray points**
- [ ] **Table shows only Low Priority keywords**
- [ ] **All segment card counts remain unchanged**

---

### Test 7: Double-Click Segment Card (Evidence)
- [ ] Clear any active filter first
- [ ] **Double-click** "Demand Winner" segment card
- [ ] **Evidence popup opens**
- [ ] Evidence shows: "Demand Winner — Segment Analysis"
- [ ] Evidence shows: normalized segment label
- [ ] Evidence shows: full dataset row count
- [ ] Evidence shows: scatter plot point count
- [ ] Evidence shows: rows excluded (if any)
- [ ] Evidence shows: top 20 keywords by search volume
- [ ] Close evidence popup

---

### Test 8: Scatter Point Colors
- [ ] Clear any active filter (view all)
- [ ] Verify scatter plot shows 4 distinct colors:
  - [ ] **Purple points** (Demand Winners)
  - [ ] **Green points** (Hidden Gems)
  - [ ] **Red points** (Friction Keywords)
  - [ ] **Gray points** (Low Priority)
- [ ] Click a purple point → verify evidence opens for that keyword
- [ ] Click a green point → verify evidence opens
- [ ] Click a red point → verify evidence opens
- [ ] Click a gray point → verify evidence opens

---

### Test 9: Table Row Click
- [ ] Click any keyword row in "All Keyword Conversion Records" table
- [ ] **Evidence popup opens** with keyword details
- [ ] Evidence shows: keyword name, segment, demand percentile, efficiency score
- [ ] Close evidence popup

---

### Test 10: Empty State (If Applicable)
- [ ] If scatter plot shows empty state warning instead of points:
  - [ ] Warning message is visible (not blank white box)
  - [ ] Warning explains missing data (demand_percentile or efficiency_score)
  - [ ] Check if segment cards show counts > 0 but chart is empty
  - [ ] This indicates data quality issue (some keywords missing x/y values)

---

## Critical Success Criteria

### MUST PASS (Most Important):
- [ ] **Scatter plot shows points on page load** (not blank)
- [ ] **Segment card counts NEVER change when filtering** (always show full dataset counts)
- [ ] **Hidden Gem count does NOT become 0 after clicking Demand Winner**
- [ ] **Scatter plot filters correctly** (shows only selected segment's color)
- [ ] **Table filters correctly** (matches scatter plot filter)
- [ ] **Filter badge appears/disappears correctly**
- [ ] **Clicking same card clears filter** (toggles off)

### SHOULD PASS:
- [ ] Segment colors match between scatter plot, cards, and legend
- [ ] Evidence popups show detailed calculation steps
- [ ] Empty state warning appears if no valid chart data (not silent blank)
- [ ] Table and scatter plot always show matching filtered data

---

## Bug Indicators (FAIL if any occur)

❌ **Hidden Gem count becomes 0 after filtering to Demand Winners**  
❌ **Scatter plot is blank when segment cards show counts > 0**  
❌ **Segment card counts change when filtering**  
❌ **Clicking segment card doesn't filter scatter plot**  
❌ **Scatter plot shows all points when filter badge is active**  
❌ **Table shows all rows when filter badge says "FILTER: [Segment]"**  
❌ **Scatter points all show same color (no purple/green/red/gray variation)**  
❌ **Filter badge doesn't disappear when clicking same card again**

---

## Setup Instructions

1. **Start Backend:**
   ```bash
   cd c:\Users\annie\agent1
   uvicorn app.main:app --reload --port 8000
   ```

2. **Start Frontend:**
   ```bash
   cd c:\Users\annie\agent1\market_intelligence_dashboard
   npm run dev
   ```

3. **Upload Test Dataset:**
   - Navigate to Upload page
   - Upload Magnet keyword dataset with columns:
     - Keyword Phrase
     - Search Volume
     - Keyword Sales (or Keyword Revenue)
   - Wait for analysis to complete

4. **Navigate to Test Page:**
   - Click "Keyword Conversion Intelligence" in sidebar
   - Page should load with scatter plot and segment cards

---

## Expected Counts (Example Data)

If your test dataset has these actual counts:
- Demand Winner: 15 keywords
- Hidden Gem: 8 keywords
- Friction Keyword: 23 keywords
- Low Priority: 121 keywords

**Then after ANY filtering, segment cards should still show:**
- Demand Winner: **15** (unchanged)
- Hidden Gem: **8** (unchanged)
- Friction Keyword: **23** (unchanged)
- Low Priority: **121** (unchanged)

**The counts should NEVER change based on activeFilter.**

---

## Testing Complete

**Date Tested:** _______________  
**Tester:** _______________  
**Dataset Used:** _______________

**Overall Result:**
- [ ] ✅ PASS — All critical tests passed, Opportunity Matrix working correctly
- [ ] ⚠️ PARTIAL — Some non-critical issues found (document below)
- [ ] ❌ FAIL — Critical bugs still present (document below)

**Notes:**
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________

---

**FIX COMPLETED:** June 4, 2026  
**TESTING CHECKLIST VERSION:** 1.0
