import re
file_path = "market_intelligence_dashboard/src/pages/PriceElasticity.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_filters = """  const filterConfigs: FilterConfig<BrandPosition>[] = [
    { id: 'range', label: 'Price Range', type: 'search', getValue: r => r.price_range },
    { id: 'tier', label: 'Tier', type: 'select', getValue: r => r.tier },
    { id: 'leader', label: 'Leading Brand', type: 'search', getValue: r => r.leading_brand },
    { id: 'revenue', label: 'Total Revenue', type: 'range', getValue: r => r.total_parent_revenue },
    { id: 'sales', label: 'Total Sales', type: 'range', getValue: r => r.total_parent_sales },
    { id: 'products', label: 'Product Count', type: 'range', getValue: r => r.product_count },
    { id: 'brands', label: 'Brand Count', type: 'range', getValue: r => r.brand_count },
  ];"""

new_filters = """  const filterConfigs: FilterConfig<BrandPosition>[] = [
    { id: 'range', label: 'Price Band', type: 'select', getValue: r => r.price_range },
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.leading_brand },
    { id: 'revenue_band', label: 'Revenue Band', type: 'select', getValue: r => r.total_parent_revenue > 1000000 ? 'High' : 'Normal' },
    { id: 'category', label: 'Category Scope', type: 'select', getValue: r => 'Filtered BlackBox' },
  ];"""

content = content.replace(old_filters, new_filters)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
