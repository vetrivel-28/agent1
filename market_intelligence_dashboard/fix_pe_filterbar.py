import re
file_path = "src/pages/PriceElasticity.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove the wrongfully placed FilterBar
bad_filter_bar = """      {modalState?.type === 'brand_details' && (
        <FilterBar 
        configs={filterConfigs}
        activeFilters={activeFilters}
        setFilter={setFilter}
        clearFilter={clearFilter}
        clearAll={clearAll}
        filterOptions={filterOptions}
        totalRecords={memoized?.brand_position_by_price_range?.length || 0}
        filteredRecords={filteredBrandPositions.length}
      />
      
      <div className="space-y-6">
            <BrandDetailsModalContent tier={modalState.tier} brandBreakdown={modalState.brand_breakdown} />"""

good_brand_details = """      {modalState?.type === 'brand_details' && (
        <div className="space-y-6">
            <BrandDetailsModalContent tier={modalState.tier} brandBreakdown={modalState.brand_breakdown} />"""

content = content.replace(bad_filter_bar, good_brand_details)

# 2. Inject FilterBar after PageHeader
page_header = """      <PageHeader 
        badge="Pricing Strategy"
        title="Price Elasticity & Structure"
        description="Analyze how pricing impacts revenue and conversion rates across different market tiers."
      />"""

new_page_header = page_header + """
      <FilterBar 
        configs={filterConfigs}
        activeFilters={activeFilters}
        setFilter={setFilter}
        clearFilter={clearFilter}
        clearAll={clearAll}
        filterOptions={filterOptions}
        totalRecords={memoized?.brand_position_by_price_range?.length || 0}
        filteredRecords={filteredBrandPositions.length}
      />"""

content = content.replace(page_header, new_page_header)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
