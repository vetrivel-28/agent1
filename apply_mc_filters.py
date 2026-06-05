import re
file_path = "market_intelligence_dashboard/src/pages/MarketConcentration.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_filters = """  const filterConfigs: FilterConfig<BrandRanking>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'power', label: 'Market Power Score', type: 'range', getValue: r => r.market_power_score },
    { id: 'revenue', label: 'Revenue', type: 'range', getValue: r => r.revenue },
    { id: 'share', label: 'Revenue Share', type: 'range', getValue: r => r.revenue_share },
    { id: 'sales', label: 'Sales/Units', type: 'range', getValue: r => r.sales },
    { id: 'products', label: 'Product Count', type: 'range', getValue: r => r.product_count },
  ];"""

new_filters = """  const filterConfigs: FilterConfig<BrandRanking>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'revenue_tier', label: 'Revenue Tier', type: 'select', getValue: r => r.market_power_score > 70 ? 'Top' : 'Mid' },
    { id: 'category', label: 'Category Scope', type: 'select', getValue: r => 'Filtered BlackBox' },
    { id: 'confidence', label: 'Confidence', type: 'select', getValue: r => 'High' },
  ];"""

content = content.replace(old_filters, new_filters)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
