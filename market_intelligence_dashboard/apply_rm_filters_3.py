# -*- coding: utf-8 -*-
import re

file_path = "src/pages/RevenueMomentum.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix import
content = content.replace("import { EvidenceModal, type EvidenceData } from '../components/ui/EvidenceModal';", "import { EvidenceDrawer, type EvidenceData } from '../components/ui/EvidenceDrawer';\nimport { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';\nimport { FilterBar } from '../components/filters/FilterBar';")
content = content.replace("<EvidenceModal isOpen={!!selectedEvidence} onClose={() => setSelectedEvidence(null)} evidence={selectedEvidence} />", "<EvidenceDrawer isOpen={!!selectedEvidence} onClose={() => setSelectedEvidence(null)} evidence={selectedEvidence} />")

# Inject Hooks right after rm is defined
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

  const groupCards = useMemo("""

content = re.sub(r"\s*};\s*const groupCards = useMemo\(", hook_injection, content, count=1)

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
content = re.sub(r'\s*<PageHeader\s*badge="Live Momentum Feed"\s*title="Revenue Momentum"\s*description="Track brand-level revenue trends, market power, and sales velocity."\s*/>', filter_bar_ui, content, count=1)

# Fix highMomentumItems
content = re.sub(r'const highMomentumItems = rm\.momentum_ledger\?\.filter\(.*? \? \d+\) >= momentumCutoff\) \|\| \[\];', 'const highMomentumItems = filteredData.filter(r => (r.momentum_score ?? 0) >= momentumCutoff);', content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
