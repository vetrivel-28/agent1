import os
import sys
import pandas as pd
import numpy as np

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.engines import whitespace_engine

def run_tests():
    print("=== Testing Whitespace Opportunity Engine Changes ===")
    
    # 1. Load the generated dummy dataset
    csv_path = "datasets/Magnet_Bamboo Towel.csv"
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} does not exist. Run create_dummy_data.py first.")
        return
        
    df = pd.read_csv(csv_path)
    
    # 2. Run engine
    print("\nRunning engine.run()...")
    res = whitespace_engine.run(df, None, top_n=2) # pass small top_n to verify if engine ignores it for total keywords
    
    if res.get("status") != "success":
        print("Engine failed:", res.get("summary"))
        return
        
    results = res.get("results", {})
    top_kws = results.get("top_whitespace_keywords", [])
    insights = results.get("insights", [])
    
    print(f"Total returned keywords in top_whitespace_keywords: {len(top_kws)}")
    print(f"Total returned keywords in heatmap_keywords: {len(results.get('heatmap_keywords', []))}")
    print(f"Total returned insights: {len(insights)}")
    
    # 3. Verify Component Score Evidence to Backend Records
    print("\n1. Verifying Component Score Evidence in top keywords:")
    failed_kws = 0
    for idx, kw in enumerate(top_kws[:3]):
        print(f"  Keyword {idx+1}: {kw.get('keyword')}")
        print(f"    opportunity_score: {kw.get('opportunity_score')}")
        print(f"    vol_pct: {kw.get('vol_pct')}")
        print(f"    sales_pct: {kw.get('sales_pct')}")
        print(f"    inv_comp_pct: {kw.get('inv_comp_pct')}")
        
        for field in ["opportunity_score", "vol_pct", "sales_pct", "inv_comp_pct"]:
            if field not in kw or kw[field] is None:
                print(f"    ERROR: Missing '{field}' in record!")
                failed_kws += 1
                
    if failed_kws == 0:
        print("  ✓ SUCCESS: Component scores verified on keyword records.")
    else:
        print("  ✗ FAILURE: Component scores missing on keyword records.")

    # 4. Verify no top 20 limit in returned keywords
    print("\n2. Verifying backend keyword limit removal:")
    # We passed top_n=2, but top_keywords should have returned all 100 rows since we removed the limit
    if len(top_kws) == len(df):
        print(f"  ✓ SUCCESS: All {len(top_kws)} keywords returned from dataset (top_n={2} was ignored for records list).")
    else:
        print(f"  ✗ FAILURE: Keyword count is {len(top_kws)} instead of expected {len(df)}.")

    # 5. Verify Insight Category Mapping & Normalization
    print("\n3. Verifying Insight Categories:")
    valid_categories = {"Key Finding", "Leading Segment", "Market Gap", "Recommended Entry"}
    failed_categories = 0
    for idx, ins in enumerate(insights):
        cat = ins.get("category")
        text = ins.get("text")
        print(f"  Insight {idx+1}: Category = '{cat}'")
        if cat not in valid_categories:
            print(f"    ERROR: Category '{cat}' is not one of {valid_categories}")
            failed_categories += 1
            
    if failed_categories == 0:
        print("  ✓ SUCCESS: Insight categories match valid frontend lookup keys.")
    else:
        print("  ✗ FAILURE: Invalid insight categories generated.")

    # 6. Verify Validation & Fallbacks
    print("\n4. Verifying Validation / Fallbacks with missing columns:")
    # Pass a dataframe with missing critical columns
    bad_df = df.copy()
    bad_df["Search Volume"] = np.nan # This should make cleaning drop rows or fail gracefully
    
    try:
        bad_res = whitespace_engine.run(bad_df, None)
        print("  ✓ SUCCESS: Failed dataset run returned gracefully without crashing.")
        print("    Status:", bad_res.get("status"))
        print("    Summary:", bad_res.get("summary"))
    except Exception as e:
        print("  ✗ FAILURE: Engine crashed with exception:", e)

if __name__ == "__main__":
    run_tests()
