"""
Test script for the three new intelligence engines.
"""
import pandas as pd
from app.engines import whitespace_engine, direct_competitor_engine, price_elasticity_engine

# Load datasets
print("Loading datasets...")
magnet_df = pd.read_csv("datasets/Magnet_Bamboo Towel.csv")
blackbox_df = pd.read_csv("datasets/BlackBox_Products_Bamboo Towel.csv")

print(f"✓ Magnet loaded: {len(magnet_df)} rows, {len(magnet_df.columns)} cols")
print(f"✓ BlackBox loaded: {len(blackbox_df)} rows, {len(blackbox_df.columns)} cols")

# Test Whitespace Engine
print("\n=== Testing Whitespace Engine ===")
result = whitespace_engine.run(magnet_df, None, top_n=10)
print(f"Status: {result['status']}")
print(f"Metric: {result['metric_name']}")
print(f"Overall Score: {result['results'].get('overall_whitespace_score', 'N/A')}")
print(f"Top Keywords: {len(result['results'].get('top_whitespace_keywords', []))}")
print(f"Opportunity Distribution: {result['results'].get('opportunity_distribution', {})}")

# Test Direct Competitor Engine  
print("\n=== Testing Direct Competitor Engine ===")
result = direct_competitor_engine.run(None, blackbox_df, top_n=10)
print(f"Status: {result['status']}")
print(f"Metric: {result['metric_name']}")
print(f"Total Clusters: {result['results'].get('total_clusters', 'N/A')}")
print(f"Market Clusters: {len(result['results'].get('market_clusters', []))}")
price_dist = result['results'].get('price_positioning', {}).get('price_distribution', {})
print(f"Price Range: ${price_dist.get('min', 0)}-${price_dist.get('max', 0)}")

# Test Price Elasticity Engine
print("\n=== Testing Price Elasticity Engine ===")
result = price_elasticity_engine.run(None, blackbox_df, n_buckets=5)
print(f"Status: {result['status']}")
print(f"Metric: {result['metric_name']}")
print(f"Bucket Count: {result['results'].get('bucket_count', 'N/A')}")
print(f"Strongest Ranges: {len(result['results'].get('strongest_price_ranges', []))}")
print(f"Dead Zones: {len(result['results'].get('dead_zones', []))}")
print(f"Insights: {result['results'].get('pricing_insights', [])}")

print("\n✓ All engines executed successfully!")
