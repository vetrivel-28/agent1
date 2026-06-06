"""Check what field names the engines actually return in their results dicts."""
import re, inspect

def find_results_fields(engine_module, name):
    try:
        src = inspect.getsource(engine_module)
        # Find quoted keys inside results dicts
        keys = re.findall(r'"([a-z_]+)"\s*:', src)
        # Filter to interesting ones — score, rate, momentum, density etc.
        interesting = [k for k in keys if any(x in k for x in [
            'score', 'rate', 'momentum', 'density', 'efficiency', 'revenue',
            'index', 'total', 'market', 'demand', 'volume', 'opportunity'
        ])]
        unique = sorted(set(interesting))
        print(f"\n{name} — candidate result keys:")
        for k in unique:
            print(f"  {k}")
    except Exception as e:
        print(f"  Error: {e}")

from app.engines import revenue_momentum_engine, demand_engine, bsr_efficiency_engine, demand_velocity_engine
find_results_fields(revenue_momentum_engine, "revenue_momentum_engine")
find_results_fields(demand_engine, "demand_engine")
find_results_fields(demand_velocity_engine, "demand_velocity_engine")
find_results_fields(bsr_efficiency_engine, "bsr_efficiency_engine")
