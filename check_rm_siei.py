"""Check revenue_momentum and siei engine result shapes in detail."""
import re, inspect
from app.engines import revenue_momentum_engine, siei_engine

def extract_return_blocks(module, name):
    src = inspect.getsource(module)
    # Find return statements near 'results'
    blocks = re.findall(r'(\"results\"\s*:\s*\{[^}]{0,2000})', src, re.DOTALL)
    print(f"\n=== {name} 'results' blocks (first 2) ===")
    for b in blocks[:2]:
        print(b[:1000])
        print("---")

extract_return_blocks(revenue_momentum_engine, "revenue_momentum_engine")
extract_return_blocks(siei_engine, "siei_engine")

# Also look at the summary/overall fields in RM
src_rm = inspect.getsource(revenue_momentum_engine)
# Find market_momentum_score specifically
momentum_lines = [l.strip() for l in src_rm.split('\n') if 'momentum' in l.lower() and ('score' in l.lower() or 'return' in l.lower() or '=' in l) and len(l) < 200]
print("\nRM lines with 'momentum':")
for l in momentum_lines[:20]:
    print(f"  {l}")

# Find what summary/aggregate score RM returns
summary_lines = [l.strip() for l in src_rm.split('\n') if any(x in l for x in ['summary', 'aggregate', 'market_score', 'overall', 'market_momentum'])]
print("\nRM summary-related lines:")
for l in summary_lines[:15]:
    print(f"  {l}")
