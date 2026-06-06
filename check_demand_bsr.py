"""Check demand engine and BSR result structures for market DNA fixes."""
import re, inspect
from app.engines import demand_engine, bsr_efficiency_engine

# BSR - find total_recoverable_revenue usage
src_bsr = inspect.getsource(bsr_efficiency_engine)
idx = src_bsr.find('total_recoverable_revenue')
if idx > -1:
    chunk = src_bsr[max(0,idx-100):idx+2000]
    print("BSR results context:")
    print(chunk[:1500])

# Demand engine - what's the top-level result for total_search_volume
src_d = inspect.getsource(demand_engine)
idx2 = src_d.find('"total_search_volume"')
if idx2 > -1:
    chunk2 = src_d[max(0,idx2-300):idx2+500]
    print("\n\nDEMAND engine total_search_volume context:")
    print(chunk2)

# Check what 'market_demand_score' or similar exists
matches = [l.strip() for l in src_d.split('\n') if 'demand_score' in l.lower() or 'market_score' in l.lower()]
print("\nDemand lines with 'demand_score'/'market_score':")
for m in matches[:10]:
    print(f"  {m}")
