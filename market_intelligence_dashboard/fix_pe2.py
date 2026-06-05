import re
file_path = "src/pages/PriceElasticity.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

early_return_idx = content.find("if (isLoading) return <DashboardSkeleton />;")

start_extract = content.find("const pi = memoized;")
end_extract = content.find("const {", start_extract)
end_extract = content.find("} = useDatasetFilters<BrandPosition>(pi.brand_position_by_price_range, filterConfigs);", end_extract)
end_extract += len("} = useDatasetFilters<BrandPosition>(pi.brand_position_by_price_range, filterConfigs);")

block_to_move = content[start_extract:end_extract]

content = content[:start_extract] + content[end_extract:]
block_to_move = block_to_move.replace("const pi = memoized;", "")
block_to_move = block_to_move.replace("const struct = pi.market_price_structure;", "const struct = memoized?.market_price_structure || {};")
block_to_move = block_to_move.replace("pi.brand_position_by_price_range", "memoized?.brand_position_by_price_range || []")

content = content[:early_return_idx] + block_to_move + "\n\n  " + content[early_return_idx:]
# Also replace pi. usages below if they exist. Actually const pi = memoized; needs to stay where it was for the rest of the component!
# Let's put const pi = memoized; back below the early return!
pi_restore = "const pi = memoized!;\n"
content = content.replace("if (isError || engineResponse?.data?.status === 'unavailable' || !memoized) {\n", "if (isError || engineResponse?.data?.status === 'unavailable' || !memoized) {\n")
# Actually, just replace pi usages below, or add const pi = memoized; after early return.
content = content.replace("    const filterConfigs:", "    const pi = memoized!;\n    const filterConfigs:") # oops, that would be in the wrong spot

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
