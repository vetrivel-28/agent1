import os

def patch_file(path, replacements):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

engine_dir = r"c:\Users\annie\agent1\app\engines"

# 1. Substitute
sub_path = os.path.join(engine_dir, "substitute_engine.py")
patch_file(sub_path, [
    (
        '"substitute_products": substitute_products[:top_n],',
        '"substitute_products": [{**p, "reason": f"Matched because keyword \'{p.get(\'keyword\', \'N/A\')}\' is classified as Substitute and overlaps with title. Similarity Score: {p.get(\'similarity_score\', 0)}"} for p in substitute_products[:5]],'
    )
])

# 2. Complement
comp_path = os.path.join(engine_dir, "complement_engine.py")
patch_file(comp_path, [
    (
        '"complement_products": complement_products[:top_n],',
        '"complement_products": [{**p, "reason": f"Matched because keyword \'{p.get(\'keyword\', \'N/A\')}\' is classified as Complement and overlaps with title. Synergy Score: {p.get(\'synergy_score\', 0)}"} for p in complement_products[:5]],'
    )
])

# 3. Bundle
bundle_path = os.path.join(engine_dir, "bundle_opportunity_engine.py")
patch_file(bundle_path, [
    (
        '"bundle_opportunities": bundle_opportunities[:top_n],',
        '"bundle_opportunities": [{**p, "reason": f"Bundled based on Complement classification for keyword \'{p.get(\'keyword\', \'N/A\')}\'. Opportunity Score: {p.get(\'opportunity_score\', 0)}"} for p in bundle_opportunities[:5]],'
    )
])

# 4. Direct Competitor
dir_path = os.path.join(engine_dir, "direct_competitor_engine.py")
patch_file(dir_path, [
    (
        'product_competitors.append(product_entry)',
        'product_entry["top_competitors"] = [{**c, "reason": f"Direct market competition identified via category overlap and price similarity. Score: {c.get(\'similarity_score\', 0)}"} for c in product_entry["top_competitors"][:5]]; product_competitors.append(product_entry)'
    ),
    (
        'all_direct_competitors.append(product_entry)',
        'product_entry["reason"] = f"Direct competitor identified based on shared subcategory {product_entry.get(\'subcategory\', \'\')}."; all_direct_competitors.append(product_entry)'
    ),
    (
        '"all_direct_competitors": all_direct_competitors,',
        '"all_direct_competitors": all_direct_competitors[:5],'
    ),
    (
        '"market_clusters": market_clusters,',
        '"market_clusters": market_clusters[:5],'
    )
])

print("Engines patched successfully!")
