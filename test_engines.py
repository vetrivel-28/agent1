"""
Engine Tests - Data-Driven Only

POLICY: No mock data, no synthetic data.
All tests must use actual CSV files uploaded through the API.

To test engines:
1. Prepare test CSV files (Magnet, BlackBox, etc.)
2. Upload via POST /api/v1/upload-datasets
3. Call engine endpoints
4. Verify results are traceable to source data

Example test pattern:
    import requests
    
    # Upload test data
    files = {
        'magnet_file': open('test_data/magnet.csv', 'rb'),
        'blackbox_file': open('test_data/blackbox.csv', 'rb')
    }
    requests.post('http://localhost:8000/api/v1/upload-datasets', files=files)
    
    # Run engine
    response = requests.post('http://localhost:8000/api/v1/demand-strength?top_n=10')
    
    # Verify evidence is included
    assert response.json()['evidence_enabled'] == True
    assert 'audit_summary' in response.json()
"""

# If you need to run a quick test with real data files, use this pattern:
# This file is NO LONGER used for mock data testing.
# See integration test files in tests/ directory for real data examples.
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
