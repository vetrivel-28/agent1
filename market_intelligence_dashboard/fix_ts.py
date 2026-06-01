import os
import re

base_dir = r"c:\Users\annie\agent1\market_intelligence_dashboard"

replacements = {
    # src/App.tsx
    "src/App.tsx": [
        (r"import DirectCompetitors from './pages/DirectCompetitors';\n", ""),
        (r"import SubstituteIntelligence from './pages/SubstituteIntelligence';\n", ""),
        (r"import ComplementIntelligence from './pages/ComplementIntelligence';\n", ""),
        (r"import BundleOpportunities from './pages/BundleOpportunities';\n", ""),
    ],
    # src/components/layout/Sidebar.tsx
    "src/components/layout/Sidebar.tsx": [
        (r"Users,\s*", ""),
        (r"ShieldAlert,\s*", ""),
        (r"LinkIcon,\s*", ""),
        (r"PackagePlus,\s*", ""),
    ],
    # src/components/ui/DataTable.tsx
    "src/components/ui/DataTable.tsx": [
        (r"import React, { ReactNode } from 'react';", "import type { ReactNode } from 'react';"),
        (r"\(item: T\) =>", "(_item: T) =>"), # Make it _item to bypass unused
    ],
    # src/pages/DemandStrength.tsx
    "src/pages/DemandStrength.tsx": [
        (r"CardHeader, CardTitle, CardDescription\s*", ""),
        (r"BarChart3,\s*", ""),
        (r"variant=\"secondary\"", "variant=\"outline\""),
    ],
    # src/pages/MarketConcentration.tsx
    "src/pages/MarketConcentration.tsx": [
        (r"Users,\s*", ""),
        (r"BarChart3,\s*", ""),
        (r"Info,\s*", ""),
        (r"Target,\s*", ""),
    ],
    # src/pages/PriceElasticity.tsx
    "src/pages/PriceElasticity.tsx": [
        (r"Tag,\s*", ""),
        (r"ArrowRight,\s*", ""),
        (r"Zap,\s*", ""),
        (r"const tierMeta = getTierMeta\(key\);", "getTierMeta(key); // tierMeta removed"),
    ],
    # src/pages/ProductIntelligence.tsx
    "src/pages/ProductIntelligence.tsx": [
        (r"import \{ Card, CardContent, CardHeader, CardTitle \} from '../components/ui/Card';\n", ""),
        (r"import \{ Button \} from '../components/ui/Button';\n", ""),
        (r"import \{ motion, AnimatePresence \} from 'framer-motion';\n", "import { motion } from 'framer-motion';\n"),
        (r"ArrowRight,\s*", ""),
    ],
    # src/pages/RevenueMomentum.tsx
    "src/pages/RevenueMomentum.tsx": [
        (r"CardDescription\s*", ""),
        (r"AlertTriangle,\s*", ""),
    ]
}

for rel_path, rules in replacements.items():
    path = os.path.join(base_dir, rel_path.replace("/", "\\"))
    if not os.path.exists(path):
        continue
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    for pattern, replacement in rules:
        content = re.sub(pattern, replacement, content)
        
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

print("TS errors fixed.")
