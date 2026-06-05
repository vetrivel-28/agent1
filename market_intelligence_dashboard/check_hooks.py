import os

files = [
    "src/pages/DemandStrength.tsx",
    "src/pages/MarketConcentration.tsx",
    "src/pages/IntentEfficiency.tsx",
    "src/pages/PriceElasticity.tsx",
    "src/pages/DirectCompetitors.tsx",
    "src/pages/SubstituteIntelligence.tsx",
    "src/pages/ComplementIntelligence.tsx",
    "src/pages/BundleOpportunities.tsx",
    "src/pages/RevenueMomentum.tsx",
    "src/pages/WhitespaceOpportunities.tsx"
]

for file in files:
    with open(file, "r", encoding="utf-8") as f:
        content = f.read()
    
    is_loading_idx = content.find("if (isLoading)")
    if is_loading_idx == -1:
        is_loading_idx = content.find("if (isError)")
        
    use_filter_idx = content.find("= useDatasetFilters<")
    
    if use_filter_idx != -1 and is_loading_idx != -1:
        if use_filter_idx > is_loading_idx:
            print(f"{file}: VIOLATION")
        else:
            print(f"{file}: OK")
    else:
        print(f"{file}: Missing hook or return. loading: {is_loading_idx}, hook: {use_filter_idx}")
