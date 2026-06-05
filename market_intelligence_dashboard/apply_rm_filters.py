# -*- coding: utf-8 -*-
import re

file_path = "src/pages/RevenueMomentum.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Imports
imports = "import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';\nimport { FilterBar } from '../components/filters/FilterBar';\n"
content = content.replace("import { formatGenericLabel } from '../utils/formatters';", "import { formatGenericLabel } from '../utils/formatters';\n" + imports)

# Filter logic
filter_logic = """  const filterConfigs: FilterConfig<LedgerRow>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'revenue', label: 'Revenue', type: 'range', getValue: r => Number(r.revenue) || 0 },
    { id: 'score', label: 'Momentum Score', type: 'range', getValue: r => Number(r.momentum_score) || 0 },
    { id: 'signal', label: 'Signal Type', type: 'select', getValue: r => r.momentum_score && r.momentum_score >= momentumCutoff ? 'High Momentum' : 'Stagnant / Declining' },
  ];

  const {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<LedgerRow>(rm.momentum_ledger || [], filterConfigs);

  const highMomentumItems = filteredData.filter(r => (r.momentum_score ?? 0) >= momentumCutoff);
"""
content = content.replace("  const highMomentumItems = rm.momentum_ledger?.filter(r => (r.momentum_score ?? 0) >= momentumCutoff) || [];", filter_logic)

# Replace DataTable data
filter_bar_jsx = """      <FilterBar 
        configs={filterConfigs}
        activeFilters={activeFilters}
        setFilter={setFilter}
        clearFilter={clearFilter}
        clearAll={clearAll}
        filterOptions={filterOptions}
        totalRecords={rm.momentum_ledger?.length || 0}
        filteredRecords={filteredData.length}
      />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">"""
content = content.replace('      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">', filter_bar_jsx)

content = content.replace("data={highMomentumItems}", "data={highMomentumItems}")
content = content.replace("data={rm.momentum_ledger || []}", "data={filteredData}")

# Fix ledgerRowEvidence signature
content = content.replace("function ledgerRowEvidence(row: LedgerRow, momentumCutoff: number, totalRevenue: number): EvidenceData | null {", "function ledgerRowEvidence(row: LedgerRow, momentumCutoff: number, totalRevenue: number, filterContext?: any): EvidenceData | null {")

# Pass filterContext to EvidenceData return
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
content = content.replace(evidence_replace_target, evidence_replace_new)

# Add filterContext argument to calls
call_1 = """onRowClick={(row) => setSelectedEvidence(ledgerRowEvidence(row, momentumCutoff, rm.total_market_revenue || 0))}"""
call_1_new = """onRowClick={(row) => setSelectedEvidence(ledgerRowEvidence(row, momentumCutoff, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 }))}"""
content = content.replace(call_1, call_1_new)

call_2 = """onClick={(e) => { e.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0)); }}"""
call_2_new = """onClick={(e) => { e.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 })); }}"""
content = content.replace(call_2, call_2_new)

call_3 = """onClick={(e) => { e?.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0)); }}"""
call_3_new = """onClick={(e) => { e?.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumCutoff, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 })); }}"""
content = content.replace(call_3, call_3_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
