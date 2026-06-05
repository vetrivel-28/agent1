import re

files = [
    "src/pages/DirectCompetitors.tsx",
    "src/pages/SubstituteIntelligence.tsx",
    "src/pages/ComplementIntelligence.tsx",
    "src/pages/BundleOpportunities.tsx"
]

old_filters_pattern = r"  const filterConfigs: FilterConfig<any>\[\] = \[\n.*?\];"
new_filters = """  const filterConfigs: FilterConfig<any>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'classification', label: 'Product Type / Classification', type: 'select', getValue: r => r.category || 'Product' },
    { id: 'price_band', label: 'Price Band', type: 'select', getValue: r => r.price ? (r.price > 50 ? 'Premium' : 'Standard') : 'Unknown' },
    { id: 'category_scope', label: 'Category Scope', type: 'select', getValue: r => 'Filtered BlackBox' },
  ];"""

for file_path in files:
    full_path = "market_intelligence_dashboard/" + file_path
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()

    content = re.sub(old_filters_pattern, new_filters, content, flags=re.DOTALL)
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
