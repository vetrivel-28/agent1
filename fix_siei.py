import os
import re

file_path = "app/engines/siei_engine.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace the signature of _records
content = content.replace(
    "def _records(df: pd.DataFrame, limit: Optional[int] = None) -> List[Dict]:",
    "def _records(df: pd.DataFrame, thresholds: Dict[str, float], limit: Optional[int] = None) -> List[Dict]:"
)

# 2. Add thresholds dictionary definition right before _records
thresholds_def = """    # ── Define Segmentation Thresholds ────────────────────────────────────────
    thresholds = {
        "high_demand_cutoff": 60.0,
        "low_demand_cutoff": 60.0,
        "high_eff_cutoff": 60.0,
        "low_eff_cutoff": 40.0,
    }

    def _records(df: pd.DataFrame, thresholds: Dict[str, float], limit: Optional[int] = None) -> List[Dict]:"""

content = content.replace(
    "def _records(df: pd.DataFrame, thresholds: Dict[str, float], limit: Optional[int] = None) -> List[Dict]:",
    thresholds_def
)

# 3. Replace the evidence variables inside _records
content = content.replace(
    "high_demand_cutoff=high_demand_cutoff,",
    "high_demand_cutoff=thresholds['high_demand_cutoff'],"
)
content = content.replace(
    "low_demand_cutoff=low_demand_cutoff,",
    "low_demand_cutoff=thresholds['low_demand_cutoff'],"
)
content = content.replace(
    "high_eff_cutoff=high_eff_cutoff,",
    "high_eff_cutoff=thresholds['high_eff_cutoff'],"
)
content = content.replace(
    "low_eff_cutoff=low_eff_cutoff,",
    "low_eff_cutoff=thresholds['low_eff_cutoff'],"
)

# 4. Replace rule_based_explanation formatting inside _records
content = content.replace(
    "high_demand≥{high_demand_cutoff:.1f}",
    "high_demand≥{thresholds['high_demand_cutoff']:.1f}"
)
content = content.replace(
    "low_demand≤{low_demand_cutoff:.1f}",
    "low_demand≤{thresholds['low_demand_cutoff']:.1f}"
)
content = content.replace(
    "high_eff≥{high_eff_cutoff:.1f}",
    "high_eff≥{thresholds['high_eff_cutoff']:.1f}"
)
content = content.replace(
    "low_eff≤{low_eff_cutoff:.1f}",
    "low_eff≤{thresholds['low_eff_cutoff']:.1f}"
)

# 5. Fix dynamic quantile section
old_dynamic = """    # ── Dynamic quantile-based segmentation thresholds ───────────────────────
    # Compute dataset-relative thresholds so all four segments can appear
    # when there is enough variance in the data.
    demand_arr = work["demand_percentile"].values
    efficiency_arr = work["revenue_efficiency_percentile"].values

    high_demand_cutoff = 60.0
    low_eff_cutoff = 40.0
    high_eff_cutoff = 60.0

    def _quadrant_dynamic(demand_pct: float, efficiency_pct: float) -> str:
        if demand_pct >= 60 and efficiency_pct >= 60:
            return "Demand Winners"
        if demand_pct >= 60 and efficiency_pct < 40:
            return "Friction Keywords"
        if demand_pct < 60 and efficiency_pct >= 60:
            return "Hidden Gems"
        if demand_pct < 60 and efficiency_pct < 40:
            return "Low Priority"
        return "Monitor\"\"\""""

new_dynamic = """    # ── Dynamic quantile-based segmentation thresholds ───────────────────────
    demand_arr = work["demand_percentile"].values
    efficiency_arr = work["revenue_efficiency_percentile"].values

    def _quadrant_dynamic(demand_pct: float, efficiency_pct: float) -> str:
        if demand_pct >= thresholds["high_demand_cutoff"] and efficiency_pct >= thresholds["high_eff_cutoff"]:
            return "Demand Winners"
        if demand_pct >= thresholds["high_demand_cutoff"] and efficiency_pct < thresholds["low_eff_cutoff"]:
            return "Friction Keywords"
        if demand_pct < thresholds["low_demand_cutoff"] and efficiency_pct >= thresholds["high_eff_cutoff"]:
            return "Hidden Gems"
        if demand_pct < thresholds["low_demand_cutoff"] and efficiency_pct < thresholds["low_eff_cutoff"]:
            return "Low Priority"
        return "Monitor\"\"\""""

content = re.sub(
    r'    # ── Dynamic quantile-based segmentation thresholds ───────────────────────\n.*?return "Monitor"',
    new_dynamic.replace('"""', ''),
    content,
    flags=re.DOTALL
)

# Fix references at the end of the file
content = content.replace(
    '"high_demand_cutoff":   round(high_demand_cutoff, 2),',
    '"high_demand_cutoff":   round(thresholds["high_demand_cutoff"], 2),'
)
content = content.replace(
    '"low_demand_cutoff":    round(low_demand_cutoff, 2),',
    '"low_demand_cutoff":    round(thresholds["low_demand_cutoff"], 2),'
)
content = content.replace(
    '"high_eff_cutoff":      round(high_eff_cutoff, 2),',
    '"high_eff_cutoff":      round(thresholds["high_eff_cutoff"], 2),'
)
content = content.replace(
    '"low_eff_cutoff":       round(low_eff_cutoff, 2),',
    '"low_eff_cutoff":       round(thresholds["low_eff_cutoff"], 2),'
)

content = content.replace(
    "Demand ≥ high_demand_cutoff AND Efficiency ≥ high_eff_cutoff",
    "Demand ≥ thresholds['high_demand_cutoff'] AND Efficiency ≥ thresholds['high_eff_cutoff']"
).replace(
    "Demand ≥ high_demand_cutoff AND Efficiency ≤ low_eff_cutoff",
    "Demand ≥ thresholds['high_demand_cutoff'] AND Efficiency ≤ thresholds['low_eff_cutoff']"
).replace(
    "Demand < high_demand_cutoff AND Efficiency ≥ high_eff_cutoff",
    "Demand < thresholds['high_demand_cutoff'] AND Efficiency ≥ thresholds['high_eff_cutoff']"
).replace(
    "Demand ≤ low_demand_cutoff AND Efficiency ≤ low_eff_cutoff",
    "Demand ≤ thresholds['low_demand_cutoff'] AND Efficiency ≤ thresholds['low_eff_cutoff']"
)

# Update threshold references in evidence blocks
content = content.replace(
    "Demand Percentile ≥ {high_demand_cutoff:.1f}",
    "Demand Percentile ≥ {thresholds['high_demand_cutoff']:.1f}"
).replace(
    "Revenue Efficiency Index ≥ {high_eff_cutoff:.1f}",
    "Revenue Efficiency Index ≥ {thresholds['high_eff_cutoff']:.1f}"
).replace(
    "Revenue Efficiency Index ≤ {low_eff_cutoff:.1f}",
    "Revenue Efficiency Index ≤ {thresholds['low_eff_cutoff']:.1f}"
)
content = content.replace('"demand_percentile_min": high_demand_cutoff,', '"demand_percentile_min": thresholds["high_demand_cutoff"],')
content = content.replace('"revenue_efficiency_percentile_min": high_eff_cutoff,', '"revenue_efficiency_percentile_min": thresholds["high_eff_cutoff"],')
content = content.replace('"demand_high_cutoff": high_demand_cutoff,', '"demand_high_cutoff": thresholds["high_demand_cutoff"],')
content = content.replace('"efficiency_high_cutoff": high_eff_cutoff,', '"efficiency_high_cutoff": thresholds["high_eff_cutoff"],')
content = content.replace('"efficiency_low_cutoff": low_eff_cutoff,', '"efficiency_low_cutoff": thresholds["low_eff_cutoff"],')

# 6. Add defensive validation
missing_cols_block = """    # ── Full drill-down data extraction ───────────────────────────────────────
    required_cols = ["keyword", "search_vol", "kw_sales", "demand_percentile", "revenue_efficiency_percentile"]
    missing_cols = [c for c in required_cols if c not in work.columns]
    if missing_cols:
        return {
            "status": "error",
            "message": "Missing required columns for segmentation: " + ", ".join(missing_cols),
            "missing_fields": missing_cols,
        }
"""
content = content.replace(
    "    # ── Full drill-down data extraction ───────────────────────────────────────",
    missing_cols_block
)

# 7. Update all _records() calls
# This requires a bit of care because limit argument is optional.
# _records(df, limit) -> _records(df, thresholds, limit)
# We can do this with regex.
# Cases:
# _records(demand_winners_df)
# _records(friction_df)
# _records(hidden_gems_df)
# _records(work.sort_values("efficiency", ascending=False), min(n, 300))
# _records(work[work["is_high_revenue_potential"]].sort_values("revenue_efficiency_percentile", ascending=False))
# _records(demand_winners_df, max(top_n, 50))
# _records(demand_winners_df, top_n)

# We can replace `_records(` with `__records_placeholder__(`
# But since the first argument could be complex, it's easier to find the exact lines or just add `thresholds, ` to the arguments list.
# A simpler regex: `_records\(([^,]+)(,.*?)?\)` -> wait, it might contain commas inside the first argument. e.g. `work.sort_values("efficiency", ascending=False)`

# Let's do it precisely line by line or pattern by pattern:
content = content.replace(
    'high_intent_full_records = _records(work[work["is_high_revenue_potential"]].sort_values("revenue_efficiency_percentile", ascending=False))',
    'high_intent_full_records = _records(work[work["is_high_revenue_potential"]].sort_values("revenue_efficiency_percentile", ascending=False), thresholds)'
)
content = content.replace(
    'friction_full_records = _records(friction_df)',
    'friction_full_records = _records(friction_df, thresholds)'
)
content = content.replace(
    '"demand_winners":    _records(demand_winners_df),',
    '"demand_winners":    _records(demand_winners_df, thresholds),'
)
content = content.replace(
    '"friction_keywords": _records(friction_df),',
    '"friction_keywords": _records(friction_df, thresholds),'
)
content = content.replace(
    '"hidden_gems":       _records(hidden_gems_df),',
    '"hidden_gems":       _records(hidden_gems_df, thresholds),'
)
content = content.replace(
    '"all_keywords":      _records(work.sort_values("efficiency", ascending=False), min(n, 300)),',
    '"all_keywords":      _records(work.sort_values("efficiency", ascending=False), thresholds, min(n, 300)),'
)
content = content.replace(
    '"items": _records(demand_winners_df, max(top_n, 50)),',
    '"items": _records(demand_winners_df, thresholds, max(top_n, 50)),'
)
content = content.replace(
    '"items": _records(friction_df),  # all friction keywords — no cap',
    '"items": _records(friction_df, thresholds),  # all friction keywords — no cap'
)
# Note: "items": _records(friction_df),  # all friction keywords - no cap (might have different dash)
content = content.replace(
    '"items": _records(friction_df),',
    '"items": _records(friction_df, thresholds),'
)
content = content.replace(
    '"keyword_rows": _records(work.sort_values("revenue_efficiency_percentile", ascending=False), min(n, 300)),',
    '"keyword_rows": _records(work.sort_values("revenue_efficiency_percentile", ascending=False), thresholds, min(n, 300)),'
)
content = content.replace(
    '"highest_efficiency_keywords":         _records(demand_winners_df, top_n),',
    '"highest_efficiency_keywords":         _records(demand_winners_df, thresholds, top_n),'
)
content = content.replace(
    '"lowest_efficiency_keywords":          _records(friction_df,       top_n),',
    '"lowest_efficiency_keywords":          _records(friction_df,       thresholds, top_n),'
)
content = content.replace(
    '"market_friction_keywords":            _records(friction_df,       top_n),',
    '"market_friction_keywords":            _records(friction_df,       thresholds, top_n),'
)
content = content.replace(
    '"click_heavy_low_conversion_keywords": _records(friction_df,       top_n),',
    '"click_heavy_low_conversion_keywords": _records(friction_df,       thresholds, top_n),'
)

# 8. Fix NaN -> None in _sv()
sv_old = "if v is None or (isinstance(v, float) and np.isnan(v)):"
sv_new = "if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):"
content = content.replace(sv_old, sv_new)

# write it back
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done fixing siei_engine.py")
