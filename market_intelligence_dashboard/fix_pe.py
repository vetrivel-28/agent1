import re
file_path = "src/pages/PriceElasticity.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

early_return_idx = content.find("if (isLoading) return <DashboardSkeleton />;")

start_extract = content.find("const pi = memoized;")
end_extract = content.find("const {", start_extract)
end_extract = content.find("} = useDatasetFilters<BrandPosition>(pi.brand_position_by_price_range || [], filterConfigs);", end_extract)
end_extract += len("} = useDatasetFilters<BrandPosition>(pi.brand_position_by_price_range || [], filterConfigs);")

block_to_move = content[start_extract:end_extract]

content = content[:start_extract] + content[end_extract:]
# Wait, pi relies on memoized, but if memoized is null, pi.brand_position_by_price_range will throw error!
# We must use memoized?.brand_position_by_price_range || []
block_to_move = block_to_move.replace("const struct = pi.market_price_structure;", "const struct = memoized?.market_price_structure || {};")
block_to_move = block_to_move.replace("pi.brand_position_by_price_range", "memoized?.brand_position_by_price_range")

content = content[:early_return_idx] + block_to_move + "\n\n  " + content[early_return_idx:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
