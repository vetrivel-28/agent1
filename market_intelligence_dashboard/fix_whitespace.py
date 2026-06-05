import re

file_path = "src/pages/WhitespaceOpportunities.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# We need to find the early returns and the filter configs.
# In WhitespaceOpportunities.tsx, const filterConfigs: and const { filteredData... } = useDatasetFilters are currently after the if (isLoading) and if (isError) checks.

early_return_block = """  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(whitespaceData)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Whitespace Analysis Unavailable</h2>
          <p className="text-red-500/80">{getEngineErrorMessage(whitespaceData, 'Requires Magnet with Search Volume.')}</p>
        </CardContent>
      </Card>
    );
  }"""

# Find data extraction that is currently after the early return:
data_extraction = """  const r = whitespaceData.data?.results || {};
  const wsKeywords: WhitespaceKeyword[] = r.top_whitespace_keywords || [];
  const distribution = r.opportunity_distribution || {};
  const insights: { category: string; text: string }[] = r.insights || [];
  const revenueSignal = r.revenue_opportunity_pool ?? 0;
  const totalKeywords = r.total_keywords_analyzed ?? 0;
  const extremeCount = distribution.extreme_opportunity ?? 0;
  const highCount = distribution.high_opportunity ?? 0;
  const entrySegments: EntrySegment[] = (r.entry_segments || []).map((s: EntrySegment) => ({
    ...s,
    opportunity_revenue: s.opportunity_revenue ?? s.revenue_represented ?? 0,
  }));"""

filter_logic = """  const filterConfigs: FilterConfig<EntrySegment>[] = [
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
  } = useDatasetFilters<EntrySegment>(entrySegments, filterConfigs);"""

# The goal is to move data_extraction and ilter_logic BEFORE early_return_block.
# 1. Remove them from their current location.
content = content.replace(data_extraction, "")
content = content.replace(filter_logic, "")

# 2. Insert them before the early_return_block
# We need to make sure we don't break the syntax, but since whitespaceData can be undefined, we need to use optional chaining.
# Actually whitespaceData comes from useQuery. whitespaceData?.data?.results is already optional chained!
new_block = data_extraction + "\n\n" + filter_logic + "\n\n" + early_return_block
content = content.replace(early_return_block, new_block)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
