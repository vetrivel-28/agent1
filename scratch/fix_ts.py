import os
from glob import glob
import re

base = r'c:\Users\annie\agent1\market_intelligence_dashboard\src\pages'

# 1. Fix Product Intelligence 4 files
for fpath in glob(os.path.join(base, '*.tsx')):
    if os.path.basename(fpath) in ['DirectCompetitors.tsx', 'SubstituteIntelligence.tsx', 'ComplementIntelligence.tsx', 'BundleOpportunities.tsx']:
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove impossible if conditions
        lines = content.split('\n')
        new_lines = []
        for line in lines:
            if 'if (' in line and '===' in line and ') return api.get' in line:
                match = re.search(r"if \('([^']+)' === '([^']+)'\)", line)
                if match:
                    if match.group(1) == match.group(2):
                        ret_stmt = line.split(')')[1].strip()
                        new_lines.append(f'      {ret_stmt}')
                    else:
                        pass
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)
        content = '\n'.join(new_lines)
        
        # Also fix the bundle opportunities check
        content = re.sub(r"if \(item.primary_product && '[^']+' === 'bundle-opportunities'\)", r"if (item.primary_product)", content)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)

# 2. Fix DemandStrength.tsx badge variant
fp = os.path.join(base, 'DemandStrength.tsx')
with open(fp, 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("'secondary'", "'warning'")
with open(fp, 'w', encoding='utf-8') as f:
    f.write(c)

# 3. Fix RevenueMomentum.tsx badge variant
fp = os.path.join(base, 'RevenueMomentum.tsx')
with open(fp, 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("'secondary'", "'warning'").replace("'destructive'", "'danger'")
with open(fp, 'w', encoding='utf-8') as f:
    f.write(c)

# 4. Fix PriceElasticity.tsx badge variant
fp = os.path.join(base, 'PriceElasticity.tsx')
with open(fp, 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("variant: 'secondary' as const", "variant: 'warning' as const").replace("variant: 'destructive' as const", "variant: 'danger' as const")
with open(fp, 'w', encoding='utf-8') as f:
    f.write(c)

print('Typescript errors fixed')
