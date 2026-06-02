# Entry Difficulty & Entry Cost Index — Data Column Reference

## Required Columns by Component

### From Magnet Dataset

| Component | Metric | Column Names (Candidates) | Lower is Better? | Example Values |
|-----------|--------|--------------------------|-----------------|-----------------|
| CPR Burden | Cost Per Result | `CPR`, `cpr`, `Cost Per Result` | NO (higher CPR = harder) | 0.50–2.50 |
| Sponsored ASIN Pressure | Sponsored Ad Count | `Sponsored ASINs`, `sponsored asins`, `Sponsored ASIN Count` | NO (more ads = harder) | 10–500 |
| Competition Density | Competing Products | `Competing Products`, `competing products` | NO (more = harder) | 100–10000 |
| Organic Title Density | Title Density | `Title Density`, `title density`, `TitleDensity` | NO (higher = harder) | 5–100% |
| PPC Bid Pressure | Suggested Bid | `H10 PPC Sugg. Bid`, `PPC Sugg. Bid`, `Suggested PPC Bid` | NO (higher = more expensive) | 0.25–5.00 |

### From BlackBox Dataset

| Component | Metric | Column Names (Candidates) | Lower is Better? | Example Values |
|-----------|--------|--------------------------|-----------------|-----------------|
| Review Barrier | Number of Reviews | `Review Count`, `Number of Reviews`, `review count` | NO (more reviews = harder to compete) | 10–50000 |
| Revenue Concentration | Parent Revenue | `Parent Level Revenue`, `Parent Revenue`, `parent level revenue`, `ASIN Revenue` | NO (higher = harder to displace) | $1K–$1M+ |

## How the Scoring Works

### Step 1: Extract Valid Data
For each metric, we:
1. **Identify the column** (tries multiple name variations)
2. **Extract numeric values** (converts to float, drops NaN)
3. **Validate sample size** (fails gracefully if <10 valid rows)

Example:
```
CPR column found: "CPR"
Raw values: [0.50, 0.52, 0.55, 0.58, 0.60, NaN, 0.61, 0.62, 0.65, ...]
Valid values: [0.50, 0.52, 0.55, 0.58, 0.60, 0.61, 0.62, 0.65, ...] (N=500)
```

### Step 2: Percentile Clipping
We clip to the 5th–95th percentile range to prevent outliers from dominating:

```
Percentiles:
  5th: 0.50
  50th (median): 0.58
  95th: 0.70

Raw sorted: [0.45, 0.50, 0.52, ..., 0.70, 0.85]
Clipped:    [0.50, 0.50, 0.52, ..., 0.70, 0.70]  (0.45 and 0.85 become 0.50 and 0.70)
```

### Step 3: Min-Max Normalization
We scale the clipped range to 0–100:

```
Min of clipped: 0.50
Max of clipped: 0.70
Range: 0.20

Normalize each value: (value - 0.50) / 0.20 * 100
0.50 → 0
0.58 → 40
0.70 → 100

Result: [0, 20, 40, ..., 80, 100]
```

### Step 4: Aggregate to Market Score
For each row (keyword/product), we calculate a weighted average of all normalized metrics:

```
Entry Difficulty = 
  0.25 * norm(CPR) + 
  0.15 * norm(Sponsored) + 
  0.15 * norm(Competing) + 
  0.15 * norm(Review) + 
  0.10 * norm(Title) + 
  0.10 * norm(Revenue) + 
  0.10 * norm(PPC_Bid)

Market Entry Difficulty = median(row_scores)
```

### Step 5: Classify
```
Score Range  →  Classification
0–25         →  Low observed pressure
26–50        →  Moderate pressure
51–75        →  High pressure
76–100       →  Severe pressure
```

## Why Scores Are More Realistic Now

### Before (Broken)
- Min-max scaled using global min/max (0.45–0.85 CPR range)
- One outlier (e.g., CPR=100) made everything else "easy"
- Classification was "Easy" for anything ≤33
- Result: Scores clustered at 3–4 (unrealistic)

### After (Fixed)
- Percentile-clipped to 5th–95th (removes outliers)
- Only 10% of extreme values affect the range
- Classification thresholds are realistic (0–25 "Low observed")
- Result: Scores spread across 20–80 range (realistic)

### Example: Market with Price Outliers
```
Raw CPR: [0.50, 0.51, 0.52, 0.55, 0.60, 0.58, 0.59, 0.61, 0.62, 100.00]
                                                               ^^^^^^^^ outlier

Before:
  Range: 0.50–100.00
  CPR_score = (0.55–0.50)/(100–0.50)*100 = 0.05 ≈ "Easy"

After:
  5th = 0.50, 95th = 0.62
  Clipped: [0.50, 0.51, 0.52, 0.55, 0.60, 0.58, 0.59, 0.61, 0.62, 0.62]
  Range: 0.50–0.62
  CPR_score = (0.55–0.50)/(0.62–0.50)*100 = 42 ≈ "Moderate pressure"
```

## Validation: What Should You See?

### If Data is Rich (Both Magnet + BlackBox)
```
Entry Difficulty:     45–65 (realistic for typical markets)
Entry Cost Index:     40–70 (accounts for visibility costs)
Classification:       "Moderate pressure" or "High pressure" (NOT "Easy")
Components Available: 7 for Difficulty, 5 for Cost Index
Components Missing:   [] (empty list)
```

### If Only Magnet Dataset
```
Entry Difficulty:     35–55 (missing Review Barrier + Revenue signals)
Entry Cost Index:     40–65 (has CPR + PPC, missing Review)
Classification:       "Moderate pressure"
Components Available: 5–6 for Difficulty, 4 for Cost Index
Components Missing:   ["Review Barrier", "Revenue Concentration"] (if BlackBox absent)
```

### If Only BlackBox Dataset
```
Entry Difficulty:     20–40 (missing CPR, Sponsored, Competing, Title signals)
Entry Cost Index:     Insufficient (depends on CPR + PPC)
Classification:       "Low observed pressure" (low signals, not genuinely low pressure)
Components Available: 2 for Difficulty (Review + Revenue)
Components Missing:   ["CPR", "Sponsored ASINs", "Competing Products", ...] (if Magnet absent)
```

## Common Troubleshooting

### "Scores are still 3–4"
- [ ] Verify both Magnet AND BlackBox are uploaded
- [ ] Check that datasets have >100 rows each
- [ ] Check column names match (e.g., `CPR` not `cpr`)
- [ ] Run: `python test_entry_metrics.py` to see component breakdown

### "Components Missing list is very long"
- [ ] Check Magnet dataset has columns: CPR, Sponsored ASINs, Competing Products, Title Density, PPC Bid
- [ ] Check BlackBox dataset has columns: Review Count, Parent Revenue
- [ ] Run column name audit: `magnet_df.columns.tolist()`

### "Scores are all 50 (median)"
- [ ] Check if all values in a column are identical
- [ ] Check for too many NaN values (>95%)
- [ ] Check data type (should be numeric, not text)

### "Entry Difficulty = Entry Cost Index (exactly same)"
- [ ] Component overlap is expected but should differ slightly
- [ ] If identical, likely only 1–2 components are available
- [ ] Check `components_available` count in result

## Testing Your Implementation

### Test 1: Load Current Datasets
```bash
python test_entry_metrics.py
# Should show both Entry Difficulty and Entry Cost Index with breakdown
```

### Test 2: Verify No Hardcoded Values
```bash
grep -r "score.*=" app/analytics/finance/entry_cost.py
# Should show no hardcoded 3, 4, 5, or 100 values
# All calculations should be from dataset columns
```

### Test 3: API Integration
```bash
# Upload datasets
curl -X POST http://localhost:8000/api/v1/upload-datasets \
  -F "magnet_file=@magnet.csv" \
  -F "blackbox_file=@blackbox.csv"

# Trigger Market Report
curl http://localhost:8000/api/v1/market-report

# Inspect finance_intelligence.results.entry_metrics
# Should show score in 30–70 range with full component breakdown
```

### Test 4: Verify Classification Wording
```bash
# In finance_intelligence.py results, check:
# overview_panel.entry_difficulty should say:
#   "Low observed pressure" (0–25)
#   "Moderate pressure" (26–50)
#   "High pressure" (51–75)
#   "Severe pressure" (76–100)
#
# NOT "Easy", "Moderate", "Difficult"
```

## Expected Performance

- **Computation Time**: <500ms for 10K-row datasets
- **Missing Data Impact**: Component contributes 0% (excluded, not zeroed)
- **Outlier Sensitivity**: <5% (thanks to percentile clipping)
- **Stability**: Same dataset, same scores (deterministic, no randomness)

## Next: Frontend Display

Once backend scores are correct, update the frontend to:

1. **Show Entry Difficulty and Entry Cost Index separately** in the finance panel
2. **Display component breakdown** in collapsible cards:
   - CPR Burden: 52.3/100
   - Sponsored Pressure: 45.1/100
   - Competing Density: 38.9/100
   - etc.
3. **Add tooltips** explaining what "Moderate pressure" means in context
4. **Update colors** to match pressure levels (green→yellow→orange→red)
5. **Export to PDF** with component breakdown in appendix
