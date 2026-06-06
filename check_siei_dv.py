"""Check the SIEI and demand velocity engine result structures."""
import re, inspect
from app.engines import siei_engine, demand_velocity_engine

# SIEI - find the full success return
src_siei = inspect.getsource(siei_engine)
idx = src_siei.find('"average_efficiency"')
if idx > -1:
    chunk = src_siei[max(0,idx-500):idx+3000]
    print("SIEI results context:")
    print(chunk[:3000])

print("\n\n=== DEMAND VELOCITY ===")
src_dv = inspect.getsource(demand_velocity_engine)
idx2 = src_dv.find('"velocity_score"')
if idx2 > -1:
    chunk2 = src_dv[max(0,idx2-200):idx2+2000]
    print(chunk2[:2000])
