"""
Verify OpenAPI schema registration for new endpoints.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Get OpenAPI schema
response = client.get('/openapi.json')
openapi = response.json()

# Check if new endpoints are registered
paths = openapi.get('paths', {})

new_endpoints = [
    '/api/v1/whitespace-opportunities',
    '/api/v1/direct-competitors',
    '/api/v1/price-elasticity'
]

print('=== OpenAPI Schema Registration ===')
for endpoint in new_endpoints:
    if endpoint in paths:
        print(f'✓ {endpoint} registered')
        methods = list(paths[endpoint].keys())
        print(f'  Methods: {methods}')
        if 'post' in paths[endpoint]:
            post_info = paths[endpoint]['post']
            print(f'  Summary: {post_info.get("summary", "N/A")}')
    else:
        print(f'✗ {endpoint} NOT registered')

print(f'\nTotal endpoints: {len(paths)}')

# List all endpoints
print('\n=== All Endpoints ===')
for endpoint in sorted(paths.keys()):
    print(f'  {endpoint}')
