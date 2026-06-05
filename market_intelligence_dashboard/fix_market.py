import re
file_path = "src/pages/MarketConcentration.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

early_return_idx = content.find("if (isLoading) return <DashboardSkeleton />;")

start_extract = content.find("const structure        = data.data?.results?.market_structure || {};")
end_extract = content.find("const {", start_extract)
end_extract = content.find("} = useDatasetFilters<BrandRanking>(topBrands, filterConfigs);", end_extract)
end_extract += len("} = useDatasetFilters<BrandRanking>(topBrands, filterConfigs);")

block_to_move = content[start_extract:end_extract]

content = content[:start_extract] + content[end_extract:]
content = content[:early_return_idx] + block_to_move + "\n\n  " + content[early_return_idx:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
