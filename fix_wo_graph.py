import re
file_path = "market_intelligence_dashboard/src/pages/WhitespaceOpportunities.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('title="Revenue Opportunity by Segment"', 'title="Revenue Opportunity by Keyword Theme"')
content = content.replace('xAxisLabel="Product Segment"', 'xAxisLabel="Keyword Theme"')
content = content.replace('businessExplanation="Visualizes addressable revenue by product theme', 'businessExplanation="Visualizes addressable revenue by keyword theme')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
