"""Find the actual top-level results keys in the revenue momentum engine."""
import re, inspect
from app.engines import revenue_momentum_engine

src = inspect.getsource(revenue_momentum_engine)

# Find the success return block - look for "success" status near results
idx = src.find('"Explainable revenue momentum')
if idx > -1:
    # Get surrounding context
    chunk = src[max(0, idx-200):idx+2000]
    print("Context around success return:")
    print(chunk[:2000])
