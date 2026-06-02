import pandas as pd
import numpy as np
from app.engines import revenue_momentum_engine as rme

np.random.seed(42)
df = pd.DataFrame({
    'Brand': [f'Brand_{i}' for i in range(136)],
    'Parent Level Revenue': np.where(np.random.rand(136) < 0.3, np.nan, np.random.rand(136)*1000),
    'Parent Level Sales': np.random.rand(136)*100
})
df.loc[0, 'Parent Level Revenue'] = 4000000

res = rme.run(df)

lines = [
    '| Brand | Revenue | Sales | Revenue Percentile | Momentum Value | Classification |',
    '|---|---|---|---|---|---|'
]
for r in res['results']['revenue_momentum']['momentum_ledger']:
    lines.append(f"| {r['brand']} | {r['parent_revenue']:.2f} | {r.get('parent_sales', 0)} | {r['revenue_percentile']:.1f} | {r['momentum_score']} | {r['classification']} |")

with open('C:/Users/vetri/.gemini/antigravity/brain/0d24f910-3666-4401-92a5-c203eb7b368c/audit_table.md', 'w') as f:
    f.write('\n'.join(lines))
