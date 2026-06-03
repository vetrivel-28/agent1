import sys

file_path = r"d:\agent1\market_intelligence_dashboard\src\pages\WhitespaceOpportunities.tsx"
with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Replacement 1
content = content.replace(
    "  conversion_efficiency_score?: number | null;\n  classification?: string;\n  source_dataset?: string;",
    "  conversion_efficiency_score?: number | null;\n  source_dataset?: string;"
)

# Replacement 2
# Note: Since the dash might be an unusual character, we replace it using a more robust matching if needed, but we'll try exact first.
content = content.replace(
    "  const wk = kw as WsKeyword;\n  const sk = kw as SegmentKeywordRaw;\n  const score = wk.opportunity_score ?? 0;\n  const compPct = wk.competition_percentile ?? 50;\n  const tier = wk.opportunity_label ?? sk.classification ??",
    "  const wk = kw as WsKeyword;\n  const score = wk.opportunity_score ?? 0;\n  const compPct = wk.competition_percentile ?? 50;\n  const tier = wk.opportunity_label ??"
)

# Replacement 3
content = content.replace(
    "Generated from Magnet keyword data. Segment classification from Keyword Classification dataset or keyword phrase rules.",
    "Generated from Magnet keyword data. Segments derived from keyword phrase rules."
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete.")
