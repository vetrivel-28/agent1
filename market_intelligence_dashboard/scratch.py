import re

file_path = "src/pages/MarketConcentration.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add imports
imports = "import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';\nimport { FilterBar } from '../components/filters/FilterBar';\n"
content = content.replace("import { formatGenericLabel } from '../utils/formatters';", "import { formatGenericLabel } from '../utils/formatters';\n" + imports)

# Filter logic insertion point
filter_logic = """
  const filterConfigs: FilterConfig<BrandRanking>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'segment', label: 'Segment', type: 'select', getValue: r => r.segment },
    { id: 'revenue', label: 'Revenue', type: 'range', getValue: r => r.parent_revenue },
    { id: 'units', label: 'Units Sold', type: 'range', getValue: r => r.units_sold },
    { id: 'products', label: 'Products', type: 'range', getValue: r => r.product_count },
    { id: 'share', label: 'Market Share %', type: 'range', getValue: r => r.revenue_share },
  ];

  const {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<BrandRanking>(topBrands, filterConfigs);

  const filteredTop10Brands = filteredData.slice(0, 10);
  const filteredOthersRevenue = filteredData.slice(10).reduce((s: number, b) => s + (b.parent_revenue ?? 0), 0);
  const filteredOthersShare   = filteredData.slice(10).reduce((s: number, b) => s + (b.revenue_share  ?? 0), 0);
"""

# Replace top10Brands mapping
content = content.replace("const leader           = topBrands[0] || null;", "const leader           = topBrands[0] || null;\n" + filter_logic)

content = content.replace("...top10Brands.map((b)", "...filteredTop10Brands.map((b)")
content = content.replace("othersShare > 0", "filteredOthersShare > 0")
content = content.replace("parent_revenue: othersRevenue,", "parent_revenue: filteredOthersRevenue,")
content = content.replace("revenue_share: parseFloat(othersShare.toFixed(2)),", "revenue_share: parseFloat(filteredOthersShare.toFixed(2)),")

# DataTable updates
filter_bar_jsx = """
        <FilterBar 
          configs={filterConfigs}
          activeFilters={activeFilters}
          setFilter={setFilter}
          clearFilter={clearFilter}
          clearAll={clearAll}
          filterOptions={filterOptions}
          totalRecords={topBrands.length}
          filteredRecords={filteredData.length}
        />
        <DataTable
"""
content = content.replace("<DataTable", filter_bar_jsx, 1) # Only replace the first DataTable, wait, there's only one.
content = content.replace("data={topBrands}", "data={filteredData}")

# Evidence Drawer filter context
content = content.replace("onRowClick={(row) => setEvidence(brandRowEvidence(row))}", "onRowClick={(row) => setEvidence(brandRowEvidence(row, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: topBrands.length }))}")

# Function signature update for brandRowEvidence
content = content.replace("function brandRowEvidence(row: BrandRanking): EvidenceData {", "function brandRowEvidence(row: BrandRanking, filterContext?: { active_filters: Record<string, any>; filtered_row_count: number; total_row_count: number; }): EvidenceData {")

content = content.replace("source_row_count: row.product_count,", "source_row_count: row.product_count,\n    active_filters: filterContext?.active_filters,\n    filtered_row_count: filterContext?.filtered_row_count,\n    total_row_count: filterContext?.total_row_count,\n    calculation_scope: filterContext ? 'Filtered' : 'Global',")


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
