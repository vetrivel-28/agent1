import os
import re

api_file = r'c:\Users\annie\agent1\app\routes\api.py'
with open(api_file, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. We will add a StandardResponse model and standardise all endpoints
content = content.replace('from typing import Optional', 'from typing import Optional, Any\nfrom pydantic import BaseModel\nimport math\nfrom fastapi import BackgroundTasks\n\nclass StandardResponse(BaseModel):\n    success: bool\n    message: str\n    data: Any')

# 2. Add sanitize function
sanitize_fn = '''
def sanitize_payload(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_payload(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_payload(x) for x in obj]
    return obj

def format_response(result: dict) -> dict:
    status = result.get('status', 'success')
    success = status != 'error'
    message = result.get('message') or result.get('summary') or 'Success'
    return {
        'success': success,
        'message': message,
        'data': sanitize_payload(result)
    }
'''
content = content.replace('logger = get_logger("routes")', sanitize_fn + '\nlogger = get_logger("routes")')

# 3. Replace all response_model=... with response_model=StandardResponse
content = re.sub(r'response_model=[A-Za-z]+Result,', 'response_model=StandardResponse,', content)
content = re.sub(r'response_model=HHIResult,', 'response_model=StandardResponse,', content)
content = re.sub(r'response_model=UploadResponse,', 'response_model=StandardResponse,', content)
content = re.sub(r'response_model=HealthCheck,', 'response_model=StandardResponse,', content)


# 4. We will modify `upload_datasets` to accept BackgroundTasks and trigger `run_all_engines`
content = content.replace(
    'async def upload_datasets(',
    'async def upload_datasets(\n    background_tasks: BackgroundTasks,'
)

content = content.replace(
    'return {\n        "status": overall,',
    'if any_loaded:\n        background_tasks.add_task(run_all_engines)\n    return format_response({\n        "status": overall,'
)
content = content.replace(
    '        "errors": errors if errors else None,\n    }',
    '        "errors": errors if errors else None,\n    })'
)

# 5. Modify endpoints to use format_response and caching.
engines = {
    'demand_strength': ('demand', 'demand_engine.run(magnet_df, blackbox_df, top_n=top_n)'),
    'sales_momentum': ('sales_momentum', 'sales_momentum_engine.run(blackbox_df, top_n=top_n)'),
    'revenue_momentum': ('revenue_momentum', 'revenue_momentum_engine.run(blackbox_df, top_n=top_n)'),
    'bsr_efficiency': ('bsr_efficiency', 'bsr_efficiency_engine.run(blackbox_df, top_n=top_n)'),
    'demand_velocity': ('demand_velocity', 'demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n)'),
    'search_intent_efficiency': ('siei', 'siei_engine.run(magnet_df, top_n=top_n)'),
    'market_concentration': ('hhi', 'hhi_engine.run(blackbox_df, top_n=top_n)'),
    'substitute_intelligence': ('substitute', 'substitute_engine.run(kc_df, blackbox_df, top_n=top_n)'),
    'complement_intelligence': ('complement', 'complement_engine.run(kc_df, blackbox_df, top_n=top_n)'),
    'bundle_opportunities': ('bundle', 'bundle_opportunity_engine.run(kc_df, blackbox_df, top_n=top_n)'),
    'finance_intelligence': ('finance', 'run_finance_intelligence(magnet_df, blackbox_df, demand_score=demand_score)'),
    'whitespace_opportunities': ('whitespace', 'whitespace_engine.run(magnet_df, None, top_n=top_n)'),
    'direct_competitors': ('direct_competitors', 'direct_competitor_engine.run(None, blackbox_df, top_n=top_n, price_tolerance_pct=price_tolerance_pct)'),
    'price_elasticity': ('price_elasticity', 'price_elasticity_engine.run(None, blackbox_df, n_buckets=n_buckets)'),
}

for endpoint, (cache_key, run_call) in engines.items():
    # Find the function def
    if endpoint == 'finance_intelligence':
        # Need to handle finance differently
        pattern = r'(def finance_intelligence\([^)]*\):.*?)(result = run_finance_intelligence.*?)(logger\.info\()'
        repl = r'\1cached = analysis_cache.get_engine("' + cache_key + r'")\n    if cached:\n        return format_response(cached)\n    \2\3'
        content = re.sub(pattern, repl, content, flags=re.DOTALL)
        # Update return
        content = re.sub(r'(def finance_intelligence.*?)return result', r'\1return format_response(result)', content, flags=re.DOTALL)
    elif endpoint == 'direct_competitors':
        pattern = r'(def direct_competitors\([^)]*\):.*?)(result = direct_competitor_engine\.run.*?)(logger\.info\()'
        repl = r'\1cached = analysis_cache.get_engine("' + cache_key + r'")\n    if cached:\n        return format_response(cached)\n    \2\3'
        content = re.sub(pattern, repl, content, flags=re.DOTALL)
        # Update return
        content = re.sub(r'(def direct_competitors.*?)return result', r'\1return format_response(result)', content, flags=re.DOTALL)
    elif endpoint == 'price_elasticity':
        pattern = r'(def price_elasticity\([^)]*\):.*?)(result = price_elasticity_engine\.run.*?)(logger\.info\()'
        repl = r'\1cached = analysis_cache.get_engine("' + cache_key + r'")\n    if cached:\n        return format_response(cached)\n    \2\3'
        content = re.sub(pattern, repl, content, flags=re.DOTALL)
        # Update return
        content = re.sub(r'(def price_elasticity.*?)return result', r'\1return format_response(result)', content, flags=re.DOTALL)
    elif endpoint == 'whitespace_opportunities':
        pattern = r'(def whitespace_opportunities\([^)]*\):.*?)(result = whitespace_engine\.run.*?)(logger\.info\()'
        repl = r'\1cached = analysis_cache.get_engine("' + cache_key + r'")\n    if cached:\n        return format_response(cached)\n    \2\3'
        content = re.sub(pattern, repl, content, flags=re.DOTALL)
        # Update return
        content = re.sub(r'(def whitespace_opportunities.*?)return result', r'\1return format_response(result)', content, flags=re.DOTALL)
    else:
        # Standard replacements
        if f'def {endpoint}(' in content:
            # find where it runs the engine and returns
            pattern = rf'(def {endpoint}\([^)]*\):.*?)(return {run_call.split("(")[0]}.*?)$'
            
            # For some, they assign to result first, some return directly.
            if f'result = {run_call.split("(")[0]}' in content:
                pattern2 = rf'(def {endpoint}\([^)]*\):.*?)(result = {run_call.split("(")[0]}.*?)(logger\.info\()'
                repl = rf'\1cached = analysis_cache.get_engine("{cache_key}")\n    if cached:\n        return format_response(cached)\n    \2\3'
                content = re.sub(pattern2, repl, content, flags=re.DOTALL)
                content = re.sub(rf'(def {endpoint}.*?)return result', rf'\1return format_response(result)', content, flags=re.DOTALL)
            else:
                pattern2 = rf'(def {endpoint}\([^)]*\):.*?)(return {run_call.split("(")[0]}.*?)$'
                repl = rf'\1cached = analysis_cache.get_engine("{cache_key}")\n    if cached:\n        return format_response(cached)\n    result = {run_call.split("(")[0]}(...)\n    return format_response(result)'
                # Actually, let's just do a simpler search and replace for endpoints that return directly.
                if 'return demand_velocity_engine.run' in content:
                    content = content.replace('return demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n)', f'cached = analysis_cache.get_engine("{cache_key}")\n    if cached:\n        return format_response(cached)\n    return format_response(demand_velocity_engine.run(magnet_df, blackbox_df, top_n=top_n))')
                if 'return siei_engine.run' in content:
                    content = content.replace('return siei_engine.run(magnet_df, top_n=top_n)', f'cached = analysis_cache.get_engine("{cache_key}")\n    if cached:\n        return format_response(cached)\n    return format_response(siei_engine.run(magnet_df, top_n=top_n))')
                if 'return hhi_engine.run' in content:
                    content = content.replace('return hhi_engine.run(blackbox_df, top_n=top_n)', f'cached = analysis_cache.get_engine("{cache_key}")\n    if cached:\n        return format_response(cached)\n    return format_response(hhi_engine.run(blackbox_df, top_n=top_n))')

# Update _build_report_from_snapshot
content = content.replace(
    'snapshot = run_all_engines(top_n=top_n)',
    'snapshot = analysis_cache.get_snapshot()\n    if not snapshot or snapshot.get("top_n") != top_n:\n        snapshot = run_all_engines(top_n=top_n)'
)

# Update market_report return
content = content.replace(
    'return report',
    'return format_response(report)'
)

# Update _datasets_not_loaded return
content = content.replace(
    'return {\n        "status": "error",\n        "metric_name"',
    'return format_response({\n        "status": "error",\n        "message": msg,\n        "metric_name"'
)

# Replace all return _datasets_not_loaded with return format_response?
# No, _datasets_not_loaded now returns format_response so we just return _datasets_not_loaded().

# Replace /health return
content = content.replace(
    'return {\n        "status": "ok",\n        "message": "Market Intelligence Agent is running",',
    'return format_response({\n        "status": "ok",\n        "message": "Market Intelligence Agent is running",'
)
# Note: we need to make sure we close the dict!
content = content.replace(
    '"datasets_loaded": registry.get_status(),\n    }',
    '"datasets_loaded": registry.get_status(),\n    })'
)

# Replace /status return
content = content.replace(
    'return {\n        "status": "ok",\n        "datasets": registry.get_status(),',
    'return format_response({\n        "status": "ok",\n        "datasets": registry.get_status(),'
)
content = content.replace(
    '"rows_loaded": registry.rows_loaded(),\n    }',
    '"rows_loaded": registry.rows_loaded(),\n    })'
)

# Replace /analysis-snapshot return
content = content.replace(
    'return {"status": "empty", "message": "No analysis run yet. Upload data and open Dashboard or Market Report."}',
    'return format_response({"status": "error", "message": "No analysis run yet. Upload data and open Dashboard or Market Report."})'
)
content = content.replace(
    'return {"status": "success", **snap}',
    'return format_response({"status": "success", **snap})'
)

with open(api_file, 'w', encoding='utf-8') as f:
    f.write(content)
print("api.py updated successfully.")
