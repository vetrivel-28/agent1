import os

base_dir = r"c:\Users\annie\agent1\market_intelligence_dashboard\src\pages"

files = {
    "ComplementIntelligence.tsx": "This product frequently accompanies your market's main items. The high complement strength indicates strong potential for cross-selling and ecosystem synergy.",
    "BundleOpportunities.tsx": "This pairing demonstrates high demand overlap and complement strength. Bundling these items can increase average order value and capture adjacent market demand.",
    "SubstituteIntelligence.tsx": "This product represents a direct alternative to your main offerings. Its high substitute strength indicates buyers frequently consider this instead.",
    "DirectCompetitors.tsx": "This product shares significant feature and audience overlap with your offerings, indicating direct market competition."
}

for filename, old_text in files.items():
    path = os.path.join(base_dir, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # We replace the hardcoded text with a dynamic one that checks item.reason
    new_text = "{item.reason || '" + old_text + "'}"
    
    content = content.replace(old_text, new_text)
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Patched {filename}")
