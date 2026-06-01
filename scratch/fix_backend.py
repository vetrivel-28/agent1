import os
import re

base_dir = r'c:\Users\annie\agent1\app'

def modify_bundle():
    path = os.path.join(base_dir, 'engines', 'bundle_opportunity_engine.py')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    safe_float_code = """
def safe_float(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, str):
        value = value.strip().replace("$", "").replace(",", "").replace("%", "")
        if value in ["", "-", "—", "N/A", "NA", "nan", "None", "null"]:
            return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

def _sv"""
    
    content = content.replace("def _sv", safe_float_code)

    content = content.replace("float(p or 0.0)", "safe_float(p)")
    content = content.replace("float(rev or 0.0)", "safe_float(rev)")
    content = content.replace("float(_sv(prow.get(price_col, 0)) or 0.0)", "safe_float(_sv(prow.get(price_col, 0)))")
    content = content.replace("float(_sv(prow.get(rev_col, 0)) or 0.0)", "safe_float(_sv(prow.get(rev_col, 0)))")

    # Add import for analysis_cache
    if "from app.services.analysis_cache import analysis_cache" not in content:
        content = content.replace("from app.engines import complement_engine", 
                                  "from app.engines import complement_engine\nfrom app.services.analysis_cache import analysis_cache")

    # Rewrite the call to complement_engine
    old_call = """    logger.info("Running complement engine for bundle analysis...")
    comp_result = complement_engine.run(kc_df, blackbox_df, top_n=rows_bb)"""
    
    new_call = """    logger.info("Running complement engine for bundle analysis...")
    comp_cached = analysis_cache.get_engine("complement")
    if comp_cached and comp_cached.get("status") == "success":
        logger.info("Using cached complement engine results.")
        comp_result = comp_cached
    else:
        logger.info("Running complement engine from scratch...")
        comp_result = complement_engine.run(kc_df, blackbox_df, top_n=rows_bb)"""
    
    content = content.replace(old_call, new_call)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def modify_complement():
    path = os.path.join(base_dir, 'engines', 'complement_engine.py')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    old_code = """    if vol_col:
        vol_clean, _ = clean_numeric_series(comp_df[vol_col], vol_col)
        comp_df["_vol"] = vol_clean
    else:
        comp_df["_vol"] = 0.0

    comp_keywords: List[Dict] = []"""

    new_code = """    if vol_col:
        vol_clean, _ = clean_numeric_series(comp_df[vol_col], vol_col)
        comp_df["_vol"] = vol_clean
    else:
        comp_df["_vol"] = 0.0

    # SORT BY VOLUME DESCENDING AND TAKE TOP 100
    comp_df = comp_df.sort_values("_vol", ascending=False).head(100)

    comp_keywords: List[Dict] = []"""

    content = content.replace(old_code, new_code)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def modify_direct_competitor():
    path = os.path.join(base_dir, 'engines', 'direct_competitor_engine.py')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    old_check = "if magnet_df is None or magnet_df.empty or blackbox_df is None or blackbox_df.empty:"
    new_check = "if blackbox_df is None or blackbox_df.empty:"
    
    old_log = 'logger.warning("Direct Competitor: missing required dataset (magnet_df or blackbox_df).")'
    new_log = 'logger.warning("Direct Competitor: missing required dataset (blackbox_df).")'

    content = content.replace(old_check, new_check)
    content = content.replace(old_log, new_log)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def modify_analysis_runner():
    path = os.path.join(base_dir, 'services', 'analysis_runner.py')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    old_code = "engines = {name: future.result() for name, future in futures.items()}"
    new_code = """for name, future in futures.items():
            try:
                engines[name] = future.result()
            except Exception as exc:
                logger.exception(f"{name} engine failed")
                engines[name] = {
                    "status": "error",
                    "message": f"{name} engine failed: {str(exc)}",
                    "results": {},
                    "processing_time_seconds": 0.0,
                }"""

    content = content.replace(old_code, new_code)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

modify_bundle()
modify_complement()
modify_direct_competitor()
modify_analysis_runner()
print('Backend modifications complete.')
