import re
file_path = "market_intelligence_dashboard/src/components/layout/Topbar.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "?  Selected",
    "? ${statusData.data.metadata.blackbox.selected_categories.length} Selected"
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
