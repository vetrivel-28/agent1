import re
file_path = "src/pages/DemandStrength.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

early_return_idx = content.find("if (isLoading) return <DashboardSkeleton />;")

start_extract = content.find("const results = data.data?.results || {};")
end_extract = content.find("const {", start_extract)
end_extract = content.find("} = useDatasetFilters<SegmentRow>(db, filterConfigs);", end_extract)
end_extract += len("} = useDatasetFilters<SegmentRow>(db, filterConfigs);")

block_to_move = content[start_extract:end_extract]

# Remove it from current location
content = content[:start_extract] + content[end_extract:]

# Insert it before early return
# Wait, we need to handle data being undefined. data.data?.results is already optional chained.
content = content[:early_return_idx] + block_to_move + "\n\n  " + content[early_return_idx:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
