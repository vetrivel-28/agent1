import re
file_path = "market_intelligence_dashboard/src/pages/RevenueMomentum.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_filters = """  const filterConfigs: FilterConfig<LedgerRow>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'tier', label: 'Revenue Tier', type: 'select', getValue: r => r.revenue_tier },
    { id: 'engine', label: 'Primary Engine', type: 'select', getValue: r => r.primary_engine },
    { id: 'classification', label: 'Classification', type: 'select', getValue: r => r.classification },
    { id: 'revenue', label: 'Parent Revenue', type: 'range', getValue: r => r.parent_revenue },
    { id: 'share', label: 'Market Share', type: 'range', getValue: r => r.revenue_share },
    { id: 'power', label: 'Market Power Score', type: 'range', getValue: r => r.market_power_score },
    { id: 'momentum', label: 'Momentum Score', type: 'range', getValue: r => r.momentum_score },
  ];"""

new_filters = """  const filterConfigs: FilterConfig<LedgerRow>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'tier', label: 'Revenue Tier', type: 'select', getValue: r => r.revenue_tier },
    { id: 'momentum_bucket', label: 'Momentum Bucket', type: 'select', getValue: r => (r.momentum_score && r.momentum_score > 75) ? 'High' : 'Low' },
    { id: 'classification', label: 'Classification', type: 'select', getValue: r => r.classification },
    { id: 'growth_driver', label: 'Growth Driver', type: 'select', getValue: r => r.primary_engine },
  ];"""

content = content.replace(old_filters, new_filters)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
