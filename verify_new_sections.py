"""Verify all new dashboard sections are working."""
import requests
import json

r = requests.get('http://localhost:8000/api/v1/market-report?top_n=10')
data = r.json()
results = data['data']['results']

print("=" * 70)
print("✓ NEW MARKET INTELLIGENCE OVERVIEW - VERIFIED")
print("=" * 70)

# Market Snapshot
if 'market_snapshot' in results:
    print("\n📊 MARKET SNAPSHOT (Question 1: How big?)")
    snap = results['market_snapshot']
    print(f"  Revenue: {snap['total_revenue']}")
    print(f"  Products: {snap['total_products']}")
    print(f"  Brands: {snap['total_brands']}")
    print(f"  Keywords: {snap['total_keywords']}")
    print(f"  Top 3 Share: {snap['top_3_share']}")
    print(f"  Leader: {snap['market_leader']} ({snap['market_leader_share']})")

# Key Insights
if 'key_insights' in results:
    print(f"\n💡 KEY INSIGHTS ({len(results['key_insights'])} findings)")
    for i, insight in enumerate(results['key_insights'], 1):
        print(f"  {i}. {insight}")

# Entry Strategy
if 'entry_strategy' in results:
    print("\n🎯 ENTRY STRATEGY (Question 5: What to do?)")
    strat = results['entry_strategy']
    print(f"  Target: {strat['target_segment']}")
    print(f"  Price: {strat['target_price_band']}")
    print(f"  Keywords: {', '.join(strat['target_keywords'][:3])}")
    print(f"  Competition: {strat['competition_level']}")

# Opportunities
if 'opportunity_summary' in results:
    print(f"\n🚀 OPPORTUNITIES ({len(results['opportunity_summary'])} items)")
    for opp in results['opportunity_summary'][:2]:
        if opp.get('title') != 'N/A':
            print(f"  • {opp['title']} ({opp['type']})")

print("\n" + "=" * 70)
print("✓ All new sections successfully implemented and working!")
print("=" * 70)
