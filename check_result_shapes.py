"""Deep-check the actual top-level results keys for each engine."""
import re, inspect

def get_top_level_results_keys(engine_module, name):
    """Find keys directly inside 'results': { ... } blocks."""
    try:
        src = inspect.getsource(engine_module)
        # Find the return statement that has results dict
        # Look for patterns like: "key": value at top level of results
        # Simple approach: find all return { "results": { ... } blocks
        results_blocks = re.findall(
            r'"results"\s*:\s*\{((?:[^{}]|\{[^{}]*\})*)\}',
            src, re.DOTALL
        )
        all_keys = []
        for block in results_blocks:
            keys = re.findall(r'"([a-z_A-Z0-9]+)"\s*:', block)
            all_keys.extend(keys[:20])
        
        print(f"\n{name} results top-level keys:")
        for k in sorted(set(all_keys)):
            print(f"  {k}")
    except Exception as e:
        print(f"  Error: {e}")

from app.engines import revenue_momentum_engine, demand_velocity_engine, bsr_efficiency_engine

# Also check SIEI engine
from app.engines import siei_engine

get_top_level_results_keys(revenue_momentum_engine, "revenue_momentum_engine")
get_top_level_results_keys(demand_velocity_engine, "demand_velocity_engine")
get_top_level_results_keys(bsr_efficiency_engine, "bsr_efficiency_engine")
get_top_level_results_keys(siei_engine, "siei_engine")

# Now also check what the velocity engine actually puts in results
src = inspect.getsource(demand_velocity_engine)
print("\n--- demand_velocity_engine full result return block ---")
match = re.search(r'return\s*\{[^}]*"results"[^}]*\{(.{0,1200})', src, re.DOTALL)
if match:
    print(match.group(0)[:1200])
