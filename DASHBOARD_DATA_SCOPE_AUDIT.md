# Dashboard Data Scope Audit

**Date:** 2026-06-04  
**Objective:** Keyword Intelligence = global Magnet universe; Product Intelligence = category-scoped BlackBox.

## Root cause fixed

`get_scoped_magnet_df()` previously filtered Magnet keywords by token overlap with **scoped product titles**, producing misleading messages such as *"3,200 of 11,000 magnet keywords matched scoped products"*. That mixed universes and was **removed**. Magnet now always returns the full keyword dataset; only BlackBox is category-filtered.

---

## Dashboard Overview (`/overview`)

| Section | Data source | Filtering | Calculation | Status |
|---------|-------------|-----------|-------------|--------|
| Executive KPI — Revenue, Products, Brands | BlackBox | Category + subcategory via `get_scoped_blackbox_df` | Sum/count on scoped rows | ✅ Valid |
| Executive KPI — Demand Keywords | Magnet | **None** (full universe) | Row count | ✅ Fixed |
| Market Structure (HHI, Top 3, Leader) | BlackBox | Category-scoped | HHI engine on scoped products | ✅ Valid |
| Revenue Vulnerability | Magnet SV + scoped revenue | Keywords global; revenue scoped | Hotspot SV / total SV × scoped revenue | ✅ Fixed (was hardcoded 68%) |
| Key Market Insights | Engine outputs | Mixed labels; each insight has evidence | Threshold rules on computed metrics | ✅ Fixed UI (`description` field) |
| Priority Business Actions | Report builder | Product-scoped metrics | Priority/difficulty scores from revenue/BSR | ✅ Fixed (`why_recommended`) |

**Removed:** Trend vs Previous Run (`TrendComparison`).

---

## Market report API (`/market-report`)

| Engine | Product input | Keyword input | Cache key |
|--------|---------------|---------------|-----------|
| demand, siei, whitespace, demand_velocity, finance (partial) | Scoped BlackBox | **Full Magnet** | `scope_key` (category only) |
| hhi, bsr, revenue_momentum, sales_momentum, direct_competitors, price_elasticity | Scoped BlackBox | N/A | `scope_key` |
| substitute, complement, bundle | Scoped BlackBox | KC filtered to **full** Magnet | `scope_key` |

---

## Other dashboard pages (validation summary)

| Page | Keyword scope | Product scope | Mixed? |
|------|---------------|---------------|--------|
| Demand Strength | Full Magnet | Scoped BB for product metrics | ⚠️ Label with `data_scope` on API |
| Intent Efficiency | Full Magnet | Scoped | ⚠️ Monitor |
| Market Concentration | N/A | Scoped | ✅ |
| Revenue Momentum | N/A | Scoped | ✅ |
| White Space | Full Magnet | Scoped BB optional | ✅ |
| Market Report (same as overview) | Full | Scoped | ✅ Fixed |

---

## Data scope API fields

Report results now include:

```json
{
  "data_scope": {
    "keyword_intelligence": { "description", "filtering", "row_count" },
    "product_intelligence": { "description", "filtering", "row_count" }
  }
}
```

UI: `DataScopeIndicator` on each major overview section.

---

## Manual checks

1. Select a category → product KPIs and HHI change; keyword count stays at full Magnet row count.
2. Key insights show text + open evidence drawer with formulas.
3. Actions show "Why:" line from calculations.
4. No banner about "X of Y keywords matched scoped products".
