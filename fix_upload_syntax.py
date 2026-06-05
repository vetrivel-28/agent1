import re
file_path = "market_intelligence_dashboard/src/pages/DatasetUpload.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'description={Your BlackBox dataset contains multiple product categories. Select the category you want to analyze before calculations begin. Detected from: }',
    'description={Your BlackBox dataset contains multiple product categories. Select the category you want to analyze before calculations begin. Detected from: }'
)

content = content.replace(
    'className={p-4 border rounded-xl cursor-pointer transition-all }',
    'className={p-4 border rounded-xl cursor-pointer transition-all }'
)

content = content.replace(
    'className={w-5 h-5 rounded-sm border flex items-center justify-center }',
    'className={w-5 h-5 rounded-sm border flex items-center justify-center }'
)

content = content.replace(
    '{c.product_count} products | {c.revenue > 0 ?  : 0 units}',
    '{c.product_count} products | {c.revenue > 0 ? $ : ${c.units_sold} units}'
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
