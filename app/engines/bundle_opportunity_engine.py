"""
Bundle Opportunity Engine
=========================
Purpose  : Identify bundle concepts by combining the target product with generic complements.
Returns generic concepts, NOT dataset products.
"""
import time
import pandas as pd
from typing import Any, Dict, Optional, List
from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.product_classifier import classify_product
from app.utils.context_builder import build_market_context
import app.engines.complement_engine as complement_engine

logger = get_logger("bundle_opportunity_engine")

_TITLE_CANDIDATES = ["Title", "title", "Product Title"]

def _generate_bundles_from_complements(context: Dict[str, Any], target_class: Dict[str, str], comp_concepts: List[Dict[str, Any]], top_n: int) -> List[Dict[str, Any]]:
    cat = context.get("category", "").lower()
    kws = context.get("top_keywords", [])
    
    use_case = target_class.get("use_case", "task").replace('_', ' ').title()
    target_type = target_class.get("product_type", "original product").replace('_', ' ').title()
    
    if "tote" in cat or any("tote" in k for k in kws):
        target_type = "Tote Bag"
        use_case = "Carrying Everyday Items"
        
    if cat != "unknown":
        use_case = f"{cat.title()} Usage"
        
    results = []
    for c in comp_concepts[:top_n]:
        # 'title' field in complement response holds the concept string
        cand_type = c["title"] 
        cat_reason = ""
        for r in c.get("reason", []):
            if r["label"] == "Category": cat_reason = r["value"]
            
        results.append({
            "title": f"{target_type} + {cand_type}",
            "reason": [
                {"label": "Product Concept", "value": f"{target_type} + {cand_type}"},
                {"label": "Category", "value": "Bundle Concepts"},
                {"label": "Shared Use Case", "value": use_case},
                {"label": "Bundle Benefit", "value": f"Creates a complete {use_case.lower()} package by pairing the core item with its primary accessory."}
            ]
        })
    return results

def run(kc_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Bundle Opportunity concept engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return {"status": "error", "summary": "Missing dataset."}

    context = build_market_context(blackbox_df)
    if context.get("error") or not context.get("is_valid", False):
        return {
            "status": "success",
            "metric_name": "Bundle Opportunity",
            "summary": "Unable to determine category.",
            "results": {
                "bundle_opportunities": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3)
        }

    # Fetch complement concepts first
    comp_results = complement_engine.run(kc_df, blackbox_df, top_n=top_n)
    if comp_results["status"] == "error":
        return comp_results
        
    complement_prods = comp_results.get("results", {}).get("complement_products", [])
    if not complement_prods:
        return {
            "status": "success", 
            "metric_name": "Bundle Opportunity",
            "summary": "Unable to determine category.",
            "results": {"bundle_opportunities": []}, 
            "processing_time_seconds": round(time.time() - t0, 3)
        }

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    df = blackbox_df.dropna(subset=[title_col]).copy()
    ref_prod = df.iloc[0]
    target_title = str(ref_prod[title_col])
    target_class = classify_product(target_title)

    final_candidates = _generate_bundles_from_complements(context, target_class, complement_prods, top_n)

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Bundle Opportunity",
        "summary": "Generated functional bundle concepts.",
        "results": {
            "bundle_opportunities": final_candidates,
        },
        "processing_time_seconds": elapsed,
    }
