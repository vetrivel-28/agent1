import re
file_path = "market_intelligence_dashboard/src/pages/DemandStrength.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_filters = """  const filterConfigs: FilterConfig<SegmentRow>[] = [
    { id: 'theme', label: 'Theme', type: 'search', getValue: r => r.segment },
    { id: 'recommendation', label: 'Recommendation', type: 'select', getValue: r => r.recommended_action },
    { id: 'priority', label: 'Priority', type: 'select', getValue: r => r.recommended_priority },
    { id: 'driver', label: 'Primary Driver', type: 'select', getValue: r => r.primary_driver },
    { id: 'competition', label: 'Competition', type: 'select', getValue: r => r.competitive_intensity },
    { id: 'revenue', label: 'Addressable Revenue', type: 'range', getValue: r => r.opportunity_revenue },
    { id: 'score', label: 'Opportunity Score', type: 'range', getValue: r => r.avg_opportunity_score },
    { id: 'volume', label: 'Search Volume', type: 'range', getValue: r => r.total_search_volume },
  ];"""

new_filters = """  const filterConfigs: FilterConfig<SegmentRow>[] = [
    { id: 'theme', label: 'Theme', type: 'search', getValue: r => r.segment },
    { id: 'recommendation', label: 'Recommendation', type: 'select', getValue: r => r.recommended_action },
    { id: 'confidence', label: 'Confidence', type: 'select', getValue: r => (r.avg_opportunity_score > 80 ? 'High' : 'Medium') },
    { id: 'source', label: 'Source Type', type: 'select', getValue: r => 'Magnet' },
  ];"""

content = content.replace(old_filters, new_filters)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
