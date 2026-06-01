import os
import glob

base_dir = r"c:\Users\annie\agent1\market_intelligence_dashboard\src\pages"
tsx_files = glob.glob(os.path.join(base_dir, "*.tsx"))

for file in tsx_files:
    with open(file, "r", encoding="utf-8") as f:
        content = f.read()
    
    new_content = content.replace("AI Insight", "Data-backed insight")
    new_content = new_content.replace("AI Analysis", "Rule-based insight")
    
    if new_content != content:
        with open(file, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(file)}")
print("Done.")
