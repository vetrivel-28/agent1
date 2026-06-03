import sys
import re

file_path = r"d:\agent1\market_intelligence_dashboard\src\pages\WhitespaceOpportunities.tsx"
with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Remove classification from SegmentKeyword type
content = content.replace(
    "  classification?: string;\n  source?: string;",
    "  source?: string;"
)

# Replace in CSV headers
content = content.replace(
    "'Classification / Opportunity Type',",
    "'Opportunity Type',"
)
content = content.replace(
    "kw.classification ?? '',",
    "kw.opportunity_label ?? '',"
)

# Replace in DataTable columns
content = content.replace(
    "{ header: 'Classification / Opportunity Type', accessorKey: 'classification', cell: (row) => <span className=\"text-sm text-muted-foreground\">{row.classification ?? '—'}</span> },",
    "{ header: 'Opportunity Type', accessorKey: 'opportunity_label', cell: (row) => <span className=\"text-sm text-muted-foreground\">{row.opportunity_label ?? '—'}</span> },"
)

# Replace in popups or tooltips if any
content = content.replace(
    "Segment classification from Keyword Classification dataset or keyword phrase rules.",
    "Segments derived from keyword phrase rules."
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete.")
