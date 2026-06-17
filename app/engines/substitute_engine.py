
import time
import pandas as pd
from typing import Any, Dict, Optional, List
from app.utils.column_mapper import find_column
from app.utils.logger import get_logger

logger = get_logger("substitute_engine")

_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_BRAND_CANDIDATES = ["Brand", "brand", "Brand Name"]

def run(kc_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Substitute dataset-backed engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return {"status": "error", "message": "Missing dataset."}

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    if not title_col: return {"status": "error", "message": "Missing BB title column."}
    
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    cat_col = find_column(blackbox_df, ["Category", "Subcategory"])
    price_col = find_column(blackbox_df, ["Price", "Current Price"])

    df = blackbox_df.dropna(subset=[title_col]).copy()
    if df.empty: return {"status": "error", "message": "No valid products."}

    products = []
    
    if cat_col and not df[cat_col].empty:
        majority_cat = df[cat_col].mode().iloc[0] if not df[cat_col].mode().empty else None
        
        if majority_cat:
            substitutes_df = df[df[cat_col] != majority_cat]
            if substitutes_df.empty:
                return {
                    "status": "success",
                    "metric_name": "Substitute Intelligence",
                    "summary": "Insufficient Cross-Category Data for substitutes.",
                    "results": {
                        "substitute_products": [],
                        "total_substitute_products": 0,
                    },
                    "processing_time_seconds": round(time.time() - t0, 3)
                }
            
            for idx, row in substitutes_df.head(top_n).iterrows():
                title = str(row[title_col])
                brand = str(row[brand_col]) if brand_col and pd.notna(row[brand_col]) else "Unknown Brand"
                price = f"${row[price_col]:.2f}" if price_col and pd.notna(row[price_col]) else "N/A"
                cat = str(row[cat_col])
                
                products.append({
                    "title": title,
                    "brand": brand,
                    "reason": [
                        {"label": "Alternative Category", "value": cat},
                        {"label": "Differentiation", "value": "Solves similar need using a different product type."},
                        {"label": "Price", "value": price}
                    ]
                })

    if not products:
        return {
            "status": "success",
            "metric_name": "Substitute Intelligence",
            "summary": "Insufficient Cross-Category Data for substitutes.",
            "results": {
                "substitute_products": [],
                "total_substitute_products": 0,
            },
            "processing_time_seconds": round(time.time() - t0, 3)
        }

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Substitute Intelligence",
        "summary": "Found valid cross-category substitutes.",
        "results": {
            "substitute_products": products,
            "total_substitute_products": len(products),
        },
        "processing_time_seconds": elapsed,
    }
