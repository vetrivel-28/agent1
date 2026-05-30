import json
import pandas as pd
from app.services.dataset_registry import registry
from app.engines import (
    demand_engine,
    sales_momentum_engine,
    revenue_momentum_engine,
    bsr_efficiency_engine,
    siei_engine,
    whitespace_engine,
    direct_competitor_engine,
    substitute_engine,
    complement_engine,
    bundle_opportunity_engine,
    price_elasticity_engine,
)
from app.services.report_builder import build_report

# 1. Create mock data
bb_data = {
    'Title': ['Product A', 'Product B', 'Product C', 'Product D', 'Product E'],
    'Brand': ['Brand1', 'Brand2', 'Brand1', 'Brand3', 'Brand2'],
    'Category': ['Cat', 'Cat', 'Cat', 'Cat', 'Cat'],
    'Price': [10, 20, 15, 25, 30],
    'Sales': [1000, 800, 1200, 500, 300],
    'Revenue': [10000, 16000, 18000, 12500, 9000],
    'BSR': [1, 5, 2, 10, 20],
    'Review Count': [100, 50, 200, 30, 10],
    'Rating': [4.5, 4.0, 4.8, 3.5, 4.2],
    'Sales Trend': [5, -2, 10, -5, 0],
    'Price Trend': [1, 0, 2, -1, 0],
}
mag_data = {
    'Keyword': ['key a', 'key b', 'key c', 'key d', 'key e'],
    'Search Volume': [10000, 5000, 2000, 1000, 500],
    'Search Volume Trend': [10, -5, 2, 0, -1],
    'Keyword Sales': [2000, 1000, 500, 200, 100],
    'Title Density': [5, 2, 8, 1, 0],
}

bb_df = pd.DataFrame(bb_data)
mag_df = pd.DataFrame(mag_data)

registry.set_blackbox(bb_df)
registry.set_magnet(mag_df)
registry.set_keyword_classification(mag_df)

# 2. Run engines
demand = demand_engine.run(mag_df, bb_df)
sales = sales_momentum_engine.run(bb_df)
revenue = revenue_momentum_engine.run(bb_df)
bsr = bsr_efficiency_engine.run(bb_df)
siei = siei_engine.run(mag_df)
ws = whitespace_engine.run(mag_df, None)
direct = direct_competitor_engine.run(None, bb_df)
sub = substitute_engine.run(mag_df, bb_df)
comp = complement_engine.run(mag_df, bb_df)
bundle = bundle_opportunity_engine.run(mag_df, bb_df)
price = price_elasticity_engine.run(None, bb_df)

report = build_report(
    demand_result=demand,
    sales_result=sales,
    revenue_result=revenue,
    bsr_result=bsr,
    siei_result=siei,
    whitespace_result=ws,
    direct_comp_result=direct,
    price_elasticity_result=price,
    substitute_result=sub,
    complement_result=comp,
    bundle_result=bundle,
    blackbox_df=bb_df,
    magnet_df=mag_df
)

# Dump to file
with open('sample_output.json', 'w') as f:
    json.dump({'report': report}, f, indent=2)

print('Sample output generated successfully!')
