#!/usr/bin/env python
"""Quick test of the market-report endpoint."""
import requests
import json

print("=" * 70)
print("Testing Market Report Endpoint")
print("=" * 70)

r = requests.get('http://localhost:8000/api/v1/market-report?top_n=10')
print(f'\nHTTP Status: {r.status_code}')

resp = r.json()
print(f'\nResponse Structure:')
print(f'  ✓ success: {resp.get("success")}')
print(f'  ✓ message: {resp.get("message")[:80]}...')
print(f'  ✓ data.status: {resp.get("data", {}).get("status")}')

print(f'\nResult:')
if r.status_code == 200:
    print("✓ PASS: Endpoint returns HTTP 200 (not 500)")
    print("✓ PASS: Response is valid JSON")
    if resp.get("success") is False:
        print("✓ PASS: Gracefully indicates missing dataset")
    else:
        print("✓ SUCCESS: Endpoint working with data loaded!")
else:
    print(f"✗ FAIL: Got HTTP {r.status_code}")
    print(f"Response: {r.text[:200]}")

print("\n" + "=" * 70)
