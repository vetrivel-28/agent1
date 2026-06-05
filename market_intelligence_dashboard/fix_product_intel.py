import re

files = [
    ("src/pages/DirectCompetitors.tsx", "direct_competitors", "top_competitors"),
    ("src/pages/SubstituteIntelligence.tsx", "substitute_products", "substitutes"),
    ("src/pages/ComplementIntelligence.tsx", "complementary_products", "complements"),
    ("src/pages/BundleOpportunities.tsx", "bundle_opportunities", "bundle_components")
]

for file_path, result_key, item_key in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    early_return_idx = content.find("if (isLoading) return <DashboardSkeleton />;")
    
    start_extract = content.find("const results = data?.data?.results || {};")
    if start_extract == -1:
        start_extract = content.find("const results = data.data?.results || {};")
        
    end_extract = content.find("const {", start_extract)
    end_extract = content.find("} = useDatasetFilters", end_extract)
    end_extract = content.find(";", end_extract) + 1

    if start_extract != -1 and end_extract != -1 and start_extract > early_return_idx:
        block_to_move = content[start_extract:end_extract]
        
        # Make extraction safe if data is undefined
        block_to_move = block_to_move.replace("const results = data.data?.results || {};", "const results = data?.data?.results || {};")
        
        content = content[:start_extract] + content[end_extract:]
        content = content[:early_return_idx] + block_to_move + "\n\n  " + content[early_return_idx:]

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed {file_path}")
    else:
        print(f"Skipped {file_path} - couldn't find block or already moved")
