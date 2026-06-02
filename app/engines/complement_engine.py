"""
Complement Intelligence Engine
===============================
Purpose  : Identify complement concepts using semantic co-usage logic.
Returns generic concepts, NOT dataset products.
"""
import time
import pandas as pd
from typing import Any, Dict, Optional, List
from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.product_classifier import classify_product
from app.utils.context_builder import build_market_context

logger = get_logger("complement_engine")

_TITLE_CANDIDATES = ["Title", "title", "Product Title"]

def _mock_llm_concepts(context: Dict[str, Any], target_class: Dict[str, str], top_n: int) -> List[Dict[str, Any]]:
    cat = context.get("category", "").lower()
    kws = context.get("top_keywords", [])
    
    use_case = target_class.get("use_case", "task").replace('_', ' ').title()
    target_type = target_class.get("product_type", "original product").replace('_', ' ').title()
    
    if "tote" in cat or any("tote" in k for k in kws):
        target_type = "Tote Bag"
        use_case = "Carrying Everyday Items"
        
    if cat != "unknown":
        use_case = f"{cat.title()} Usage"
        
    concepts = []
    
    if "table cloth" in target_type.lower():
        concepts = [
            {"concept": "Napkin Set", "category": "Table Linens", "reason": f"Frequently used alongside {target_type}s for dining setups."},
            {"concept": "Centerpiece", "category": "Table Decor", "reason": f"Enhances the visual presentation of the {target_type}."},
            {"concept": "Chair Cover", "category": "Furniture Protection", "reason": f"Matches the aesthetic of the {target_type} in formal dining rooms."},
            {"concept": "Table Runner", "category": "Table Linens", "reason": f"Layered on top of the {target_type} for visual depth."},
            {"concept": "Placemat Set", "category": "Table Accessories", "reason": f"Placed over the {target_type} for additional individual protection."},
            {"concept": "Candle Holder", "category": "Table Decor", "reason": "Provides ambient lighting that complements formal table settings."},
            {"concept": "Table Setting Clips", "category": "Accessories", "reason": f"Secures the {target_type} in place, especially useful for outdoor dining."},
            {"concept": "Serving Platter", "category": "Dining Serveware", "reason": "Often purchased to complete a newly decorated dining presentation."}
        ]
    elif "pool table" in target_type.lower():
        concepts = [
            {"concept": "Billiard Balls Set", "category": "Billiards", "reason": "Essential equipment used directly on the surface."},
            {"concept": "Pool Cues", "category": "Billiards", "reason": "Primary tools used in conjunction with the surface."},
            {"concept": "Chalk", "category": "Billiards Accessories", "reason": "Required maintenance accessory for cue sports."},
            {"concept": "Table Brush", "category": "Maintenance", "reason": f"Used specifically to clean and maintain the {target_type}."}
        ]
    elif "tote" in target_type.lower() or "tote" in cat.lower() or any("tote" in k for k in kws):
        use_case = "Carrying items for shopping or daily use"
        concepts = [
            {"concept": "Coin Purse / Wallet", "category": "Small Leather Goods", "reason": "Organizes money inside the large main compartment."},
            {"concept": "Cosmetic Pouch", "category": "Accessories", "reason": "Keeps small personal care items from getting lost at the bottom."},
            {"concept": "Bag Organizer Insert", "category": "Bag Accessories", "reason": "Provides structure and pockets to an unstructured tote."},
            {"concept": "Reusable Water Bottle", "category": "Drinkware", "reason": "Commonly carried in a daily tote for hydration."},
            {"concept": "Sunglasses Case", "category": "Eyewear Accessories", "reason": "Protects sunglasses when tossed into the bag."},
            {"concept": "Keychain / Lanyard", "category": "Accessories", "reason": "Keeps keys easily accessible instead of digging."},
            {"concept": "Hand Sanitizer Holder", "category": "Personal Care", "reason": "Often clipped to the exterior for quick access."}
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
    invalid = {"Unknown Product", "General Household", "Maintenance Kit", "Storage Case", "Cleaning Solution", "Protective Cover", "Premium Alternative", "Budget Alternative", "Attachment/Add-on"}
    valid_concepts = []
    for c in concepts:
        title = c.get("title", "")
        if title in invalid:
            continue
        valid_concepts.append(c)
    return valid_concepts

def run(kc_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Complement Intelligence concept engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return {"status": "error", "summary": "Missing dataset."}
        
    context = build_market_context(blackbox_df)
    if context.get("error") or not context.get("is_valid", False):
        return {
            "status": "success",
            "metric_name": "Complement Intelligence",
            "summary": "Unable to determine category.",
            "results": {
                "complement_products": [],
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
            "metric_name": "Complement Intelligence",
            "summary": "Unable to determine category.",
            "results": {
                "complement_products": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3)
        }

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Complement Intelligence",
        "summary": "Generated functional complement concepts.",
        "results": {
            "complement_products": final_candidates,
        },
        "processing_time_seconds": elapsed,
    }
