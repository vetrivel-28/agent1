import re
file_path = "market_intelligence_dashboard/src/pages/WhitespaceOpportunities.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace filterConfigs in WhitespaceOpportunities.tsx
old_filters = """  const filterConfigs: FilterConfig<EntrySegment>[] = [
    { id: 'segment', label: 'Segment', type: 'search', getValue: r => r.segment },
    { id: 'action', label: 'Action', type: 'select', getValue: r => r.recommended_action },
    { id: 'priority', label: 'Priority', type: 'select', getValue: r => r.recommended_priority },
    { id: 'driver', label: 'Driver', type: 'select', getValue: r => r.primary_driver },
    { id: 'competition', label: 'Competition', type: 'select', getValue: r => r.competitive_intensity },
    { id: 'revenue', label: 'Opportunity Revenue', type: 'range', getValue: r => r.opportunity_revenue },
    { id: 'score', label: 'Opportunity Score', type: 'range', getValue: r => r.avg_opportunity_score },
    { id: 'keywords', label: 'Keywords', type: 'range', getValue: r => r.keyword_count },
  ];"""

new_filters = """  const filterConfigs: FilterConfig<EntrySegment>[] = [
    { id: 'tier', label: 'Opportunity Tier', type: 'select', getValue: r => r.opportunity_tier || (r.avg_opportunity_score > 80 ? 'High' : 'Medium') },
    { id: 'dataset', label: 'Source Dataset', type: 'select', getValue: r => 'BlackBox / Magnet' },
    { id: 'action', label: 'Suggested Action', type: 'select', getValue: r => r.recommended_action },
    { id: 'search', label: 'Search Keyword/Segment', type: 'search', getValue: r => r.segment },
  ];"""

content = content.replace(old_filters, new_filters)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
