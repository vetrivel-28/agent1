import pandas as pd
import json
from app.engines.revenue_momentum_engine import run

# AWXZOM test case with low momentum
data = {
    'Brand': ['AWXZOM', 'BrandB', 'BrandC', 'BrandD', 'BrandE', 'BrandF', 'BrandG', 'BrandH', 'BrandI', 'BrandJ'],
    'Parent Level Revenue': [60000, 20000, 5000, 5000, 5000, 1000, 1000, 1000, 1000, 1000],
    'Parent Level Sales': [600, 200, 50, 50, 50, 10, 10, 10, 10, 10],
    'Sales Trend (90 days) (%)': [5, 90, 80, 70, 60, 50, 40, 30, 20, 10], # AWXZOM will have low momentum relative to the others
    'BSR': [1000, 100, 200, 300, 400, 500, 600, 700, 800, 900]
}
df = pd.DataFrame(data)

result = run(df)
ledger = result['results']['revenue_momentum']['momentum_ledger']

for row in ledger:
    print(f"{row['brand']}: Tier {row['revenue_tier']}, Share {row['revenue_share']:.1f}%, Mom {row['momentum_score']:.1f} -> {row['classification']}")

print("\nMatrix Counts:")
counts = result['results']['revenue_momentum']['quadrant_audit']['counts_by_label']
for label, count in counts.items():
    print(f"{label}: {count}")

print("\nAWXZOM Evidence:")
for row in ledger:
    if row['brand'] == 'AWXZOM':
        print(row['evidence']['intermediate_values']['calculation'])
