# -*- coding: utf-8 -*-
import re

file_path = "src/pages/WhitespaceOpportunities.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Imports
imports = "import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';\nimport { FilterBar } from '../components/filters/FilterBar';\n"
content = content.replace("import { formatGenericLabel } from '../utils/formatters';", "import { formatGenericLabel } from '../utils/formatters';\n" + imports)

# Filter Logic
filter_logic = """
    const entrySegments: EntrySegment[] = (r.entry_segments || []).map((s: EntrySegment) => ({
      ...s,
      opportunity_revenue: s.opportunity_revenue ?? s.revenue_represented ?? 0,
    }));

    const filterConfigs: FilterConfig<EntrySegment>[] = [
      { id: 'segment', label: 'Segment', type: 'search', getValue: r => r.segment },
      { id: 'action', label: 'Action', type: 'select', getValue: r => r.recommended_action },
      { id: 'priority', label: 'Priority', type: 'select', getValue: r => r.recommended_priority },
      { id: 'driver', label: 'Driver', type: 'select', getValue: r => r.primary_driver },
      { id: 'competition', label: 'Competition', type: 'select', getValue: r => r.competitive_intensity },
      { id: 'revenue', label: 'Opportunity Revenue', type: 'range', getValue: r => r.opportunity_revenue },
      { id: 'score', label: 'Opportunity Score', type: 'range', getValue: r => r.avg_opportunity_score },
      { id: 'keywords', label: 'Keywords', type: 'range', getValue: r => r.keyword_count },
    ];

    const {
      filteredData: filteredEntrySegments,
      activeFilters,
      setFilter,
      clearFilter,
      clearAll,
      filterOptions
    } = useDatasetFilters<EntrySegment>(entrySegments, filterConfigs);

    const filteredTopEntrySegments: TopEntrySegment[] = filteredEntrySegments.map((s) => ({
      segment: s.segment,
      revenue_opportunity: s.opportunity_revenue,
      keyword_count: s.keyword_count,
      primary_driver: s.primary_driver ?? '—',
      competitive_intensity: s.competitive_intensity ?? '—',
      recommended_action: s.recommended_action ?? 'Evaluate',
      avg_opportunity_score: s.avg_opportunity_score,
      recommended_priority: s.recommended_priority ?? 'Evaluate',
      rank: s.rank,
    }));
"""
old_entry_segments = """    const entrySegments: EntrySegment[] = (r.entry_segments || []).map((s: EntrySegment) => ({
      ...s,
      opportunity_revenue: s.opportunity_revenue ?? s.revenue_represented ?? 0,
    }));
    const topEntrySegments: TopEntrySegment[] = r.top_entry_segments?.length
      ? r.top_entry_segments
      : entrySegments.map((s) => ({
          segment: s.segment,
          revenue_opportunity: s.opportunity_revenue,
          keyword_count: s.keyword_count,
          primary_driver: s.primary_driver ?? '—',
          competitive_intensity: s.competitive_intensity ?? '—',
          recommended_action: s.recommended_action ?? 'Evaluate',
          avg_opportunity_score: s.avg_opportunity_score,
          recommended_priority: s.recommended_priority ?? 'Evaluate',
          rank: s.rank,
        }));"""

# Handle unicode dashes that could be in the source code
old_entry_segments_alt = re.sub(r"—", "—", old_entry_segments)
if old_entry_segments in content:
    content = content.replace(old_entry_segments, filter_logic)
else:
    # Use regex
    content = re.sub(r"const entrySegments: EntrySegment\[\] =.*?rank: s\.rank,\s*\}\)\);", filter_logic, content, flags=re.DOTALL)

# Insert FilterBar and use filtered collections
filter_bar_jsx = """      {entrySegments.length > 0 && (
          <PageSection title="3. Segment Revenue Analysis">
            <div className="space-y-6">
              <FilterBar 
                configs={filterConfigs}
                activeFilters={activeFilters}
                setFilter={setFilter}
                clearFilter={clearFilter}
                clearAll={clearAll}
                filterOptions={filterOptions}
                totalRecords={entrySegments.length}
                filteredRecords={filteredEntrySegments.length}
              />
"""
content = content.replace('{entrySegments.length > 0 && (\n          <PageSection title="3. Segment Revenue Analysis">\n            <div className="space-y-6">', filter_bar_jsx)
content = content.replace('data={entrySegments.slice(0, 12)}', 'data={filteredEntrySegments.slice(0, 12)}')
content = content.replace('data={entrySegments}', 'data={filteredEntrySegments}')
content = content.replace('data={topEntrySegments}', 'data={filteredTopEntrySegments}')

# Evidence context updates
content = content.replace("onRowClick={(row) => setSelectedEvidence(createSegmentRowEvidence(row))}", "onRowClick={(row) => setSelectedEvidence(createSegmentRowEvidence(row, { active_filters: activeFilters, filtered_row_count: filteredEntrySegments.length, total_row_count: entrySegments.length }))}")
content = content.replace("onRowClick={(row) => setSelectedEvidence(createTopEntrySegmentEvidence(row))}", "onRowClick={(row) => setSelectedEvidence(createTopEntrySegmentEvidence(row, { active_filters: activeFilters, filtered_row_count: filteredEntrySegments.length, total_row_count: entrySegments.length }))}")

content = content.replace("const createSegmentRowEvidence = (row: EntrySegment): EvidenceData => {", "const createSegmentRowEvidence = (row: EntrySegment, filterContext?: any): EvidenceData => {")
content = content.replace("const createTopEntrySegmentEvidence = (row: TopEntrySegment): EvidenceData => {", "const createTopEntrySegmentEvidence = (row: TopEntrySegment, filterContext?: any): EvidenceData => {")

evidence_additions = """        source_row_count: row.keyword_count,
        active_filters: filterContext?.active_filters,
        filtered_row_count: filterContext?.filtered_row_count,
        total_row_count: filterContext?.total_row_count,
        calculation_scope: filterContext ? 'Filtered' : 'Global',"""
content = content.replace("source_row_count: row.keyword_count,", evidence_additions)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
