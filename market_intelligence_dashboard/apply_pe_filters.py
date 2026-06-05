import re
file_path = "src/pages/PriceElasticity.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add imports
content = content.replace("import { DashboardSkeleton } from '../components/ui/Skeletons';", "import { DashboardSkeleton } from '../components/ui/Skeletons';\nimport { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';\nimport { FilterBar } from '../components/filters/FilterBar';")

# Find where to inject
injection_point = """  const memoized = useMemo(() => {
    const engineData = engineResponse?.data;
    if (engineData?.status === 'unavailable') return null;
    
    const results = engineData?.results;
    if (!results || Object.keys(results).length === 0) return null;
    return results as PricingIntelligenceData;
  }, [engineResponse]);"""

filter_injection = """  const filterConfigs: FilterConfig<BrandPosition>[] = [
    { id: 'range', label: 'Price Range', type: 'search', getValue: r => r.price_range },
    { id: 'tier', label: 'Tier', type: 'select', getValue: r => r.tier },
    { id: 'leader', label: 'Leading Brand', type: 'search', getValue: r => r.leading_brand },
    { id: 'revenue', label: 'Total Revenue', type: 'range', getValue: r => r.total_parent_revenue },
    { id: 'sales', label: 'Total Sales', type: 'range', getValue: r => r.total_parent_sales },
    { id: 'products', label: 'Product Count', type: 'range', getValue: r => r.product_count },
    { id: 'brands', label: 'Brand Count', type: 'range', getValue: r => r.brand_count },
  ];

  const {
    filteredData: filteredBrandPositions,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<BrandPosition>(memoized?.brand_position_by_price_range || [], filterConfigs);"""

content = content.replace(injection_point, injection_point + "\n\n" + filter_injection)

# Add FilterBar before <div className="space-y-6"> in the main return
filter_bar_ui = """      <FilterBar 
        configs={filterConfigs}
        activeFilters={activeFilters}
        setFilter={setFilter}
        clearFilter={clearFilter}
        clearAll={clearAll}
        filterOptions={filterOptions}
        totalRecords={memoized?.brand_position_by_price_range?.length || 0}
        filteredRecords={filteredBrandPositions.length}
      />
      
      <div className="space-y-6">"""
content = content.replace('      <div className="space-y-6">', filter_bar_ui)

# Update DataTable to use filteredBrandPositions
content = content.replace("data={pi.brand_position_by_price_range}", "data={filteredBrandPositions}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
