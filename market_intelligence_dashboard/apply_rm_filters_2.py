# -*- coding: utf-8 -*-
import re

file_path = "src/pages/RevenueMomentum.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Imports
if "import { useDatasetFilters" not in content:
    content = content.replace("import { formatGenericLabel } from '../utils/formatters';", "import { formatGenericLabel } from '../utils/formatters';\nimport { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';\nimport { FilterBar } from '../components/filters/FilterBar';\n")

# Inject Hooks right after rm is defined
hook_injection_point = """    };
  
    const groupCards = useMemo("""
hook_injection = """    };
  
  const filterConfigs: FilterConfig<LedgerRow>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'revenue', label: 'Revenue', type: 'range', getValue: r => Number(r.revenue) || 0 },
    { id: 'score', label: 'Momentum Score', type: 'range', getValue: r => Number(r.momentum_score) || 0 },
    { id: 'signal', label: 'Signal Type', type: 'select', getValue: r => r.momentum_score && r.momentum_score >= 75 ? 'High Momentum' : 'Stagnant / Declining' },
  ];

  const {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<LedgerRow>(rm.momentum_ledger || [], filterConfigs);

  const highMomentumItems = filteredData.filter(r => (r.momentum_score ?? 0) >= 75);

    const groupCards = useMemo("""
content = content.replace(hook_injection_point, hook_injection)

# Add FilterBar to UI
filter_bar_ui = """      <PageHeader 
        badge="Live Momentum Feed"
        title="Revenue Momentum"
        description="Track brand-level revenue trends, market power, and sales velocity."
      />

      <FilterBar 
        configs={filterConfigs}
        activeFilters={activeFilters}
        setFilter={setFilter}
        clearFilter={clearFilter}
        clearAll={clearAll}
        filterOptions={filterOptions}
        totalRecords={rm.momentum_ledger?.length || 0}
        filteredRecords={filteredData.length}
      />"""
content = content.replace("""      <PageHeader 
        badge="Live Momentum Feed"
        title="Revenue Momentum"
        description="Track brand-level revenue trends, market power, and sales velocity."
      />""", filter_bar_ui)

# Make ledgerRowEvidence receive filterContext
evidence_replace_target = """    source_datasets: ['BlackBox', 'Magnet'],
    source_columns: ['brand', 'category', 'estimated_sales', 'revenue', 'review_velocity'],
    source_row_count: row.product_count || 1,"""
evidence_replace_new = """    source_datasets: ['BlackBox', 'Magnet'],
    source_columns: ['brand', 'category', 'estimated_sales', 'revenue', 'review_velocity'],
    source_row_count: row.product_count || 1,
    active_filters: filterContext?.active_filters,
    filtered_row_count: filterContext?.filtered_row_count,
    total_row_count: filterContext?.total_row_count,
    calculation_scope: filterContext ? 'Filtered' : 'Global',"""
content = content.replace("function ledgerRowEvidence(row: LedgerRow, momentumCutoff: number, totalRevenue: number): EvidenceData | null {", "function ledgerRowEvidence(row: LedgerRow, momentumCutoff: number, totalRevenue: number, filterContext?: any): EvidenceData | null {")
content = content.replace(evidence_replace_target, evidence_replace_new)

# Update DataTable data to use filteredData
content = content.replace("data={rm.momentum_ledger || []}", "data={filteredData}")
content = content.replace("data={rm.momentum_ledger}", "data={filteredData}")
content = content.replace("data={highMomentumItems}", "data={highMomentumItems}")

# Use exact replacement for the drillColumns
call_1 = """onClick={(e) => { e.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0)); }} /> },"""
call_1_new = """onClick={(e) => { e.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 })); }} /> },"""
content = content.replace(call_1, call_1_new)

call_2 = """onClick={(e) => { e?.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0)); }} /> },"""
call_2_new = """onClick={(e) => { e?.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 })); }} /> },"""
content = content.replace(call_2, call_2_new)

call_3 = """onRowClick={(row) => setSelectedEvidence(ledgerRowEvidence(row, momentumCutoff, rm.total_market_revenue || 0))}"""
call_3_new = """onRowClick={(row) => setSelectedEvidence(ledgerRowEvidence(row, momentumCutoff, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 }))}"""
content = content.replace(call_3, call_3_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
