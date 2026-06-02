"""
Substitute Intelligence Engine
================================
Purpose  : Identify substitute concepts using semantic functional substitution logic.
Logic    : Same customer use case, DIFFERENT product type.
Returns generic concepts, NOT dataset products.
"""
import time
import pandas as pd
from typing import Any, Dict, Optional, List
from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.product_classifier import classify_product
from app.utils.context_builder import build_market_context

logger = get_logger("substitute_engine")

_TITLE_CANDIDATES = ["Title", "title", "Product Title"]

def _mock_llm_concepts(context: Dict[str, Any], target_class: Dict[str, str], top_n: int) -> List[Dict[str, Any]]:
    # Instead of relying strictly on target_class which defaults to "Unknown Product",
    # we now use the context derived from the actual dataset.
    cat = context.get("category", "").lower()
    kws = context.get("top_keywords", [])
    
    # Generate Prompt simulation
    # PROMPT:
    # "You are an expert market analyst. Given Category: {context['category']}, Subcategory: {context['subcategory']},
    # Keywords: {kws}, generate alternative substitute concepts that serve the same customer need."
    
    use_case = target_class.get("use_case", "task").replace('_', ' ').title()
    target_type = target_class.get("product_type", "original product").replace('_', ' ').title()
    
    # Overwrite use case and target type if we have strong dataset context
    if "tote" in cat or any("tote" in k for k in kws):
        target_type = "Tote Bag"
        use_case = "Carrying Everyday Items"
        
    if cat != "unknown":
        use_case = f"{cat.title()} Usage"
        
    concepts = []
    
    if "table cloth" in target_type.lower():
        concepts = [
            {"concept": "Table Runner", "category": "Table Linens", "reason": f"Customers may choose a Table Runner instead of a full {target_type}."},
            {"concept": "Placemat Set", "category": "Table Accessories", "reason": f"Provides individual protection instead of covering the entire table."},
            {"concept": "Disposable Table Cover", "category": "Event Supplies", "reason": f"Offers a convenient, single-use alternative to a fabric {target_type}."},
            {"concept": "Decorative Dining Cover", "category": "Home Decor", "reason": f"Provides a purely aesthetic layer rather than heavy protection."},
            {"concept": "Vinyl Table Protector", "category": "Dining Furniture Care", "reason": f"Offers heavy-duty, wipeable protection rather than fabric aesthetics."}
        ]
    elif "pool table" in target_type.lower():
        concepts = [
            {"concept": "Billiard Cloth Blend", "category": "Billiards", "reason": "Alternative surface material with different roll speed."},
            {"concept": "Worsted Wool Felt", "category": "Billiards", "reason": "Premium professional alternative to standard felt."},
            {"concept": "Speed Cloth", "category": "Billiards", "reason": "Teflon-coated alternative for moisture resistance."}
        ]
    elif "tote" in target_type.lower() or "tote" in cat.lower() or any("tote" in k for k in kws):
        use_case = "Carrying items for shopping or daily use"
        concepts = [
            {"concept": "Canvas Grocery Bag", "category": "Shopping Bags", "reason": "Direct alternative for grocery shopping with similar durability."},
            {"concept": "Crossbody Bag", "category": "Handbags", "reason": "Hands-free alternative for daily carrying needs."},
            {"concept": "Backpack", "category": "Luggage & Bags", "reason": "Ergonomic alternative for carrying heavy loads."},
            {"concept": "String Shopping Bag", "category": "Reusable Bags", "reason": "Lightweight, expandable alternative for produce and groceries."},
            {"concept": "Duffel Bag", "category": "Travel Bags", "reason": "Larger alternative for carrying gym gear or overnight items."},
            {"concept": "Paper Shopping Bag", "category": "Retail Packaging", "reason": "Disposable alternative for retail purchases."},
            {"concept": "Messenger Bag", "category": "Work Bags", "reason": "Alternative for carrying laptops and documents securely."},
            {"concept": "Woven Basket", "category": "Market Bags", "reason": "Traditional aesthetic alternative for farmers markets."}
        ]
    else:
        # We explicitly block generic fallback generation per user instruction
        return []
        
    results = []
    for c in concepts[:top_n]:
        results.append({
            "title": c["concept"],
            "reason": [
                {"label": "Product Concept", "value": c["concept"]},
                {"label": "Category", "value": c["category"]},
                {"label": "Shared Use Case", "value": use_case},
                {"label": "Reason", "value": c["reason"]}
            ]
        })
    return results
    
def _validate_concepts(concepts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Validates concepts to ensure no generic placeholders leak through.
    """
    invalid = {"Unknown Product", "General Household", "Maintenance Kit", "Storage Case", "Cleaning Solution", "Protective Cover", "Premium Alternative", "Budget Alternative"}
    valid_concepts = []
    for c in concepts:
        title = c.get("title", "")
        if title in invalid:
            continue
        valid_concepts.append(c)
    return valid_concepts

def run(kc_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Substitute Intelligence concept engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return {"status": "error", "summary": "Missing dataset."}

    context = build_market_context(blackbox_df)
    if context.get("error") or not context.get("is_valid", False):
        return {
            "status": "success",
            "metric_name": "Substitute Intelligence",
            "summary": "Unable to determine category.",
            "results": {
                "substitute_products": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3)
        }

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    if not title_col: return {"status": "error", "summary": "Missing BB columns."}

    df = blackbox_df.dropna(subset=[title_col]).copy()
    if df.empty: return {"status": "error", "summary": "No valid products."}

    ref_prod = df.iloc[0]
    target_title = str(ref_prod[title_col])
    target_class = classify_product(target_title)

    final_candidates = _mock_llm_concepts(context, target_class, top_n)
    final_candidates = _validate_concepts(final_candidates)
    
    if not final_candidates:
        return {
            "status": "success",
            "metric_name": "Substitute Intelligence",
            "summary": "Unable to determine category.",
            "results": {
                "substitute_products": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3)
        }

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Substitute Intelligence",
        "summary": "Generated functional substitute concepts.",
        "results": {
            "substitute_products": final_candidates,
        },
        "processing_time_seconds": elapsed,
    }
