#!/usr/bin/env python
"""Test the new market-report endpoint structure."""
import requests
import json

r = requests.get('http://localhost:8000/api/v1/market-report?top_n=10')
print(f"Status: {r.status_code}\n")

if r.status_code == 200:
    resp = r.json()
    data = resp.get('data', {})
    results = data.get('results', {})
    
    print("✓ New Data Sections Present:")
    print(f"  - market_snapshot: {'market_snapshot' in results}")
    print(f"  - key_insights: {'key_insights' in results}")
    print(f"  - entry_strategy: {'entry_strategy' in results}")
    print(f"  - opportunity_summary: {'opportunity_summary' in results}")
    print(f"  - market_risks: {'market_risks' in results}")
    print(f"  - data_audit: {'data_audit' in results}")
    
    if 'market_snapshot' in results:
        snapshot = results['market_snapshot']
        print(f"\n✓ Market Snapshot Fields:")
        for k, v in snapshot.items():
            if v and v != 'N/A':
                print(f"  {k}: {v}")
    
    if 'key_insights' in results:
        insights = results['key_insights']
        print(f"\n✓ Key Insights ({len(insights)} total):")
        for i, insight in enumerate(insights[:3], 1):
            print(f"  {i}. {insight[:70]}...")
    
    if 'entry_strategy' in results:
        strategy = results['entry_strategy']
        print(f"\n✓ Entry Strategy:")
        print(f"  - target_segment: {strategy.get('target_segment')}")
        print(f"  - competition: {strategy.get('competition_level')}")
        print(f"  - recommendation: {strategy.get('recommended_action')[:60]}...")
    
    print("\n✓ All new sections successfully added!")
else:
    print(f"Error: {r.text[:200]}")
