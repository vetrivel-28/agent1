# -*- coding: utf-8 -*-
import re

file_path = "src/pages/IntentEfficiency.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Imports
imports = "import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';\nimport { FilterBar } from '../components/filters/FilterBar';\n"
content = content.replace("import { formatGenericLabel } from '../utils/formatters';", "import { formatGenericLabel } from '../utils/formatters';\n" + imports)

# Remove activeFilter useState
content = re.sub(r"const \[activeFilter, setActiveFilter\] = useState<[^>]+>\('all'\);", "", content)

filter_logic = """
  const filterConfigs: FilterConfig<any>[] = [
    { id: 'keyword', label: 'Keyword', type: 'search', getValue: r => r.keyword },
    { id: 'segment', label: 'Segment', type: 'select', getValue: r => r.segment },
    { id: 'search_volume', label: 'Search Volume', type: 'range', getValue: r => r.search_volume },
    { id: 'demand_percentile', label: 'Demand Percentile', type: 'range', getValue: r => r.demand_percentile },
    { id: 'efficiency_score', label: 'Efficiency Index', type: 'range', getValue: r => r.efficiency_score },
    { id: 'keyword_sales', label: 'Keyword Sales', type: 'range', getValue: r => r.keyword_sales ?? r.keyword_revenue ?? r.revenue },
    { id: 'rev_per_1k', label: 'Rev / 1K Searches', type: 'range', getValue: r => r.revenue_per_1000_searches },
  ];

  const {
    filteredData: filteredKeywordRows,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<any>(rows, filterConfigs);

  const displayScatter = useMemo(() => {
    if (Object.keys(activeFilters).length === 0) return scatterRaw;
    const allowed = new Set(filteredKeywordRows.map(r => r.keyword));
    return scatterRaw.filter(pt => allowed.has(pt.keyword));
  }, [scatterRaw, filteredKeywordRows, activeFilters]);

  const frictionRowsSorted = useMemo(() => {
    let baseFriction = friction;
    if (Object.keys(activeFilters).length > 0) {
      const allowed = new Set(filteredKeywordRows.map(r => r.keyword));
      baseFriction = friction.filter(f => allowed.has(f.keyword));
    }
    return [...baseFriction].sort((a, b) =>
      Number(b.estimated_revenue_leakage ?? b.recoverable_revenue ?? 0) - 
      Number(a.estimated_revenue_leakage ?? a.recoverable_revenue ?? 0)
    );
  }, [friction, filteredKeywordRows, activeFilters]);
"""

# Replace existing filteredKeywordRows, frictionRowsSorted, displayScatter
content = re.sub(r"const displayScatter = useMemo\(\(\) => \{.*?\}, \[scatterRaw, activeFilter\]\);", "", content, flags=re.DOTALL)
content = re.sub(r"const displayScatter = useMemo\(\(\) => \{.*?\}, \[scatter, activeFilter\]\);", "", content, flags=re.DOTALL)
content = re.sub(r"const filteredKeywordRows = useMemo\(\(\) => \{.*?\}, \[rows, activeFilter\]\);", "", content, flags=re.DOTALL)
content = re.sub(r"const frictionRowsSorted = useMemo\(\(\) => \{.*?\}, \[friction\]\);", filter_logic, content, flags=re.DOTALL)

# Fix empty state UI bug
content = re.sub(r"activeFilter === 'all'", "Object.keys(activeFilters).length === 0", content)
content = re.sub(r"activeFilter !== 'all'", "Object.keys(activeFilters).length > 0", content)
content = re.sub(r"Filter: \{quadrantLabel\(activeFilter\)\}", "Filtered View", content)
content = re.sub(r"No \{quadrantLabel\(activeFilter\)\} keywords", "No filtered keywords", content)
content = re.sub(r"activeFilter === seg.key", "activeFilters.segment === quadrantLabel(seg.key)", content)
content = content.replace("setActiveFilter('all')", "clearAll()")

# Update click handler for Segment Cards
content = re.sub(r"onClick=\{\(\) => \{\s*//.*?setActiveFilter\(newFilter\);\s*\}\}", "onClick={() => { const targetSegment = quadrantLabel(seg.key); if (activeFilters.segment === targetSegment) { clearFilter('segment'); } else { setFilter('segment', targetSegment); } }}", content, flags=re.DOTALL)

# Add FilterBar
filter_bar_jsx = """
      <PageSection title="Keyword Detail & Conversion Opportunities">
        <FilterBar 
          configs={filterConfigs}
          activeFilters={activeFilters}
          setFilter={setFilter}
          clearFilter={clearFilter}
          clearAll={clearAll}
          filterOptions={filterOptions}
          totalRecords={rows.length}
          filteredRecords={filteredKeywordRows.length}
        />
"""
content = content.replace('<PageSection title="Keyword Detail & Conversion Opportunities">', filter_bar_jsx)

# Evidence context updates
content = content.replace("onRowClick={row => setSelectedEvidence(keywordRowEvidence(row, benchmarkRps1k))}", "onRowClick={row => setSelectedEvidence(keywordRowEvidence(row, benchmarkRps1k, { active_filters: activeFilters, filtered_row_count: filteredKeywordRows.length, total_row_count: rows.length }))}")
content = content.replace("function keywordRowEvidence(k: any, benchmark: number): EvidenceData | null {", "function keywordRowEvidence(k: any, benchmark: number, filterContext?: any): EvidenceData | null {")
content = content.replace("source_row_count: 1,", "source_row_count: 1,\n    active_filters: filterContext?.active_filters,\n    filtered_row_count: filterContext?.filtered_row_count,\n    total_row_count: filterContext?.total_row_count,\n    calculation_scope: filterContext ? 'Filtered' : 'Global',")

# KPICard scopes
content = content.replace('label="Total Demand"', 'label="Total Demand" scope="Global"')
content = content.replace('label="Revenue / 1K"', 'label="Revenue / 1K" scope="Global"')
content = content.replace('label="Friction Gap"', 'label="Friction Gap" scope="Global"')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
