# Data Integrity Audit Report — Post Scope Refactor

**Date:** 2026-06-04  
**Status:** Audit complete; defects fixed where flagged below.

## Executive summary

| Universe | Rule | Enforcement |
|----------|------|-------------|
| **Keyword Intelligence** | Full Magnet, no category filter | `get_scoped_magnet_df()` always returns full dataset |
| **Product Intelligence** | Scoped BlackBox by category/subcategory | `get_scoped_blackbox_df()` |
| **Blended** | Documented dual-universe methodology | `page_scope_registry.py` + API `page_scope` fields |

### Defects found and fixed in this audit

| Issue | Impact | Fix |
|-------|--------|-----|
| CAS used unscoped cache fallback | Wrong category engine inputs | Cache lookup uses `compute_cache_key` only |
| Product Intelligence ignored cache_key | Stale cross-category results | Scoped cache_key on all PI engines |
| `run_all_engines` snapshot plain keys | `get_engine(name, cache_key)` failed after full run | Snapshot stores `{engine}_{cache_key}` keys |
| `overview_verification` unscoped BlackBox | Misleading verification totals | Uses `_resolve_context()` |
| Whitespace segment keywords unscoped cache | Wrong segment keywords after category change | Accepts `scope_key` param |
| Misleading `scope_limited_message` UI | False keyword coverage warning | Removed from Demand Strength |

---

## 1. Demand Intelligence (`/demand-strength`)

| Metric | Dataset | Filters | Formula | Validation |
|--------|---------|---------|---------|------------|
| Demand Score | Magnet | SV > 0, valid keyword | Theme-weighted demand share → market demand index | ✅ Global |
| Demand Velocity | Magnet | Same rows | Search/YoY trend columns when present | ✅ Global |
| Demand Momentum | Magnet | Theme segments | Opportunity score from demand/revenue share gap | ✅ Global |
| Demand Distribution | Magnet | Theme assignment | `demand_share = theme SV / total SV × 100` | ✅ Global |
| Demand Growth | Magnet | Trend columns | YoY / search trend normalization | ✅ Global |

**Note:** `blackbox_df` parameter exists in `demand_engine.run()` but is **not used** in `_run_internal`. Category selection does not affect keyword demand metrics.

---

## 2. Revenue / Market Entry Intelligence

### Inbound Efficiency (`/search-intent-efficiency`) — keyword-only

| Metric | Keyword input | Product input | Weighting | Status |
|--------|---------------|---------------|-----------|--------|
| Revenue Per Search | Magnet: KW Sales, SV | None | `KW Sales / SV` | ✅ |
| Conversion Efficiency | Magnet RPS percentile | None | Rank within Magnet | ✅ |
| Revenue Capture Rate | Efficiency percentile vs P75 | None | Benchmark gap | ✅ |
| Friction Keywords | Demand≥60 & Eff<40 | None | Quadrant rules | ✅ |
| Recoverable Revenue | `(P75 RPS − RPS) × SV / 1000` | None | Friction rows only | ✅ |

### Finance Intelligence (`/finance-intelligence`) — intentional blend

| Metric | Keyword | Product | Weighting |
|--------|---------|---------|-----------|
| Advertising Pressure | Magnet CPC/SV | — | Module score |
| Premium Viability | — | Scoped BB price bands | Band revenue share |
| Margin Compression | — | Scoped BB | Cost/price columns |
| Capital Efficiency | — | Scoped BB | Revenue/investment proxy |
| Entry Cost | Magnet + scoped BB | Both | Module-specific |
| Finance Health | Composite | 25/20/25/15/15 sub-scores | Documented |

### Revenue Growth (`/revenue-momentum`) — product-only

| Metric | Dataset | Filters | Status |
|--------|---------|---------|--------|
| Revenue Density | Scoped BlackBox | Category | ✅ |
| Momentum Score | Scoped BlackBox brands | Category | ✅ |
| Direction | Scoped BlackBox trends | Category | ✅ |

---

## 3. Competition / Market Structure (`/market-structure`)

| Metric | Dataset | Filters | Status |
|--------|---------|---------|--------|
| HHI | Scoped BlackBox | Category | ✅ |
| Brand Share | Scoped BlackBox | Category | ✅ |
| Market Concentration | Scoped BlackBox | Category | ✅ |
| Competitive Saturation | Scoped BlackBox | Category | ✅ |

Cache key includes category scope — changing category invalidates cache and recalculates.

---

## 4. Customer / Product Intelligence (`/product-intelligence`)

| Signal | Dataset | Scope | Status |
|--------|---------|-------|--------|
| Direct competitors | BlackBox | Filtered | ✅ Fixed cache |
| Substitutes | KC ∩ Magnet + BlackBox | KC global, BB filtered | ✅ |
| Complements | KC ∩ Magnet + BlackBox | KC global, BB filtered | ✅ |
| Bundle opportunities | KC ∩ Magnet + BlackBox | KC global, BB filtered | ✅ |

Review sentiment/themes: derived from BlackBox review columns when present — scoped with category.

---

## 5. Inbound Efficiency — methodology (SIEI)

```
RPS = Keyword Sales / Search Volume
RPS_1K = RPS × 1000
Efficiency = percentile_rank(RPS_1K) × 100
Friction = demand_percentile ≥ 60 AND efficiency < 40
Recoverable = max(0, P75(RPS_1K) − RPS_1K) × Search Volume / 1000  [friction only]
```

**Mathematically valid:** all operands from same Magnet row. No BlackBox mixing.

---

## 6. Market Direction

| Page | Growth / Momentum | Scope |
|------|-----------------|-------|
| Sales Momentum | BlackBox sales trends | Product filtered ✅ |
| Revenue Momentum | BlackBox revenue/review/BSR | Product filtered ✅ |
| Demand Velocity | Magnet search/YoY + BB sales/revenue trends | **Blended** ⚠️ documented |

No hidden keyword category filtering.

---

## 7. Consumer Adoption Simulator

| Component | Keyword source | Product source | Status |
|-----------|----------------|----------------|--------|
| MarketDNA demand | Cached demand (global Magnet) | — | ✅ |
| MarketDNA recoverable | Cached SIEI (global Magnet) | — | ✅ |
| MarketDNA HHI/saturation | Cached HHI (scoped BB) | Scoped | ✅ |
| MarketDNA revenue density | Cached revenue_momentum | Scoped | ✅ |
| Adoption / Cluster / Resistance | Simulation on DNA | Scoped inputs | ✅ |

**Fixed:** engine cache uses category `cache_key`; removed unscoped fallback.

---

## 8. Evidence validation

Evidence drawers now support:
- `source_page` — originating page label
- `data_scope` — keyword + product universe descriptions
- `confidence_score` — numeric confidence
- Calculation steps from engine `_create_evidence` payloads

**Remaining manual gap:** legacy pages may still pass evidence without `source_page`; attach at call site incrementally.

---

## 9. Scope registry (single source of truth)

| Location | Purpose |
|----------|---------|
| `app/utils/page_scope_registry.py` | Backend page → scope spec |
| `market_intelligence_dashboard/src/constants/pageDataScope.ts` | Frontend mirror |
| API `page_scope` + `results.data_scope` | Runtime proof on responses |

---

## 10. Full calculation verification table

| Section | Metric | Dataset | Filters | Formula | Status |
|---------|--------|---------|---------|---------|--------|
| Demand | Demand Score | Magnet | SV>0 | Theme demand index | ✅ |
| Demand | Distribution | Magnet | Themes | SV share | ✅ |
| SIEI | RPS | Magnet | Valid rows | Sales/SV | ✅ |
| SIEI | Recoverable | Magnet | Friction | Gap×SV/1000 | ✅ |
| HHI | Concentration | BlackBox | Category | Σ(share²×10⁴) | ✅ |
| Revenue Mom | Momentum | BlackBox | Category | Weighted velocity | ✅ |
| Finance | Health | Both | See §2 | Weighted pillars | ⚠️ Blend OK |
| Demand Velocity | Velocity | Both | Category BB | Mean normalized trends | ⚠️ Blend OK |
| Whitespace | Segments | Magnet+BB | BB filtered | Keyword clustering + overlap | ⚠️ Blend OK |
| Overview | Revenue KPI | BlackBox | Category | SUM(revenue) | ✅ |
| Overview | Keywords KPI | Magnet | None | COUNT(rows) | ✅ |
| CAS | MarketDNA | Cached engines | cache_key | Aggregated signals | ✅ Fixed |

### Flags (no action required — documented blends)

- **Demand Velocity:** intentionally averages global keyword trends with scoped product trends.
- **Finance Intelligence:** intentionally combines Magnet economics with scoped product economics.
- **Whitespace:** keyword segments global; product overlap optional from scoped BB.

### No remaining invalid mixes

- Category-scoped keyword filtering **removed** from data layer.
- Stale unscoped cache lookups **fixed** for CAS, Product Intelligence, analysis snapshot.

---

## Validation commands

```bash
python -m pytest tests/test_scope_resolver.py -q
cd market_intelligence_dashboard && npm run build
```

## Manual checks

1. Select category A → note HHI and product counts.
2. Select category B → HHI and products must change; Demand Keywords count unchanged.
3. Run CAS → verify `engine_cache_key` matches active category in network response.
4. Open evidence drawer → confirm scope descriptions appear when API provides `data_scope`.
