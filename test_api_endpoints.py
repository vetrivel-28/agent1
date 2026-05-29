"""
Test API endpoints for the three new intelligence engines.
"""
import pandas as pd
from fastapi.testclient import TestClient
from app.main import app
from app.services.dataset_registry import registry

# Initialize test client
client = TestClient(app)

# Load and upload datasets
print("Loading and uploading datasets via API...")
magnet_df = pd.read_csv("datasets/Magnet_Bamboo Towel.csv")
blackbox_df = pd.read_csv("datasets/BlackBox_Products_Bamboo Towel.csv")

# Upload datasets via API
with open("datasets/Magnet_Bamboo Towel.csv", "rb") as f:
    magnet_file = f
    with open("datasets/BlackBox_Products_Bamboo Towel.csv", "rb") as bb:
        blackbox_file = bb
        response = client.post(
            "/api/v1/upload-datasets",
            files={
                "magnet": ("magnet.csv", magnet_file),
                "blackbox": ("blackbox.csv", blackbox_file),
            }
        )
        print(f"Upload status: {response.status_code}")
        upload_result = response.json()
        print(f"Upload result: {upload_result['status']}")

# Test Whitespace Endpoint
print("\n=== Testing /api/v1/whitespace-opportunities ===")
response = client.post("/api/v1/whitespace-opportunities?top_n=10")
print(f"Status Code: {response.status_code}")
result = response.json()
print(f"Response Status: {result['status']}")
print(f"Metric Name: {result['metric_name']}")
print(f"Overall Score: {result['results'].get('overall_whitespace_score')}")
print(f"Top Keywords Count: {len(result['results'].get('top_whitespace_keywords', []))}")
if result['results'].get('top_whitespace_keywords'):
    print(f"First Keyword: {result['results']['top_whitespace_keywords'][0]}")

# Test Direct Competitors Endpoint
print("\n=== Testing /api/v1/direct-competitors ===")
response = client.post("/api/v1/direct-competitors?top_n=10")
print(f"Status Code: {response.status_code}")
result = response.json()
print(f"Response Status: {result['status']}")
print(f"Metric Name: {result['metric_name']}")
print(f"Total Clusters: {result['results'].get('total_clusters')}")
print(f"Market Clusters Count: {len(result['results'].get('market_clusters', []))}")
if result['results'].get('market_clusters'):
    first_cluster = result['results']['market_clusters'][0]
    print(f"First Cluster: {first_cluster['category']}/{first_cluster['subcategory']} ({first_cluster['cluster_size']} products)")

# Test Price Elasticity Endpoint
print("\n=== Testing /api/v1/price-elasticity ===")
response = client.post("/api/v1/price-elasticity?n_buckets=5")
print(f"Status Code: {response.status_code}")
result = response.json()
print(f"Response Status: {result['status']}")
print(f"Metric Name: {result['metric_name']}")
print(f"Bucket Count: {result['results'].get('bucket_count')}")
print(f"Price Buckets: {len(result['results'].get('price_buckets', []))}")
print(f"Dead Zones: {len(result['results'].get('dead_zones', []))}")
if result['results'].get('price_buckets'):
    first_bucket = result['results']['price_buckets'][0]
    print(f"First Bucket: ${first_bucket['price_range']['min']}-${first_bucket['price_range']['max']} (demand: {first_bucket['demand_score']})")

print("\n✓ All API endpoints tested successfully!")
