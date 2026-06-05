import re

file1 = "market_intelligence_dashboard/src/pages/DatasetUpload.tsx"
with open(file1, "r", encoding="utf-8") as f:
    content1 = f.read()
if "import { Modal }" not in content1:
    content1 = content1.replace("import { AnalysisProgressModal", "import { Modal } from '../components/ui/Modal';\nimport { AnalysisProgressModal")
with open(file1, "w", encoding="utf-8") as f:
    f.write(content1)

file2 = "market_intelligence_dashboard/src/pages/WhitespaceOpportunities.tsx"
with open(file2, "r", encoding="utf-8") as f:
    content2 = f.read()
content2 = content2.replace("r.opportunity_tier || (r.avg_opportunity_score", "(r as any).opportunity_tier || (r.avg_opportunity_score")
with open(file2, "w", encoding="utf-8") as f:
    f.write(content2)
