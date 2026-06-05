import re
file_path = "market_intelligence_dashboard/src/pages/IntentEfficiency.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_filters = """  const filterConfigs: FilterConfig<EfficiencyRow>[] = [
    { id: 'keyword', label: 'Keyword', type: 'search', getValue: r => r.keyword },
    { id: 'segment', label: 'Segment', type: 'select', getValue: r => r.segment },
    { id: 'intent', label: 'Intent Bucket', type: 'select', getValue: r => r.intent_bucket },
    { id: 'volume', label: 'Search Volume', type: 'range', getValue: r => r.search_volume },
    { id: 'efficiency', label: 'Efficiency Score', type: 'range', getValue: r => r.efficiency_score },
    { id: 'gap', label: 'Search/Rev Gap', type: 'range', getValue: r => r.search_rev_gap },
    { id: 'cpr', label: 'CPR', type: 'range', getValue: r => r.cpr },
  ];"""

new_filters = """  const filterConfigs: FilterConfig<EfficiencyRow>[] = [
    { id: 'keyword', label: 'Keyword Search', type: 'search', getValue: r => r.keyword },
    { id: 'segment', label: 'Segment', type: 'select', getValue: r => r.segment },
    { id: 'opportunity', label: 'Opportunity Level', type: 'select', getValue: r => r.efficiency_score > 70 ? 'High' : 'Normal' },
    { id: 'source', label: 'Source Dataset', type: 'select', getValue: r => 'Magnet' },
  ];"""

content = content.replace(old_filters, new_filters)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
