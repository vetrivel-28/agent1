
import time
import pandas as pd
from typing import Any, Dict, Optional, List
from app.utils.column_mapper import find_column
from app.utils.logger import get_logger

logger = get_logger("complement_engine")

_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_BRAND_CANDIDATES = ["Brand", "brand", "Brand Name"]

def run(kc_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Complement dataset-backed engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return {"status": "error", "message": "Missing dataset."}

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    if not title_col: return {"status": "error", "message": "Missing BB title column."}
    
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    price_col = find_column(blackbox_df, ["Price", "Current Price"])

    df = blackbox_df.dropna(subset=[title_col]).copy()
    if df.empty: return {"status": "error", "message": "No valid products."}

    # Complements: look for accessories, parts, refills, etc.
    mask = df[title_col].str.lower().str.contains(r'\b(accessory|case|charger|mount|refill|kit|cable|cover|replacement|part)\b', regex=True, na=False)
    complement_df = df[mask]
    
    products = []
    
    if complement_df.empty:
        return {
            "status": "success",
            "metric_name": "Complement Intelligence",
            "summary": "Insufficient data to confidently identify true complementary products.",
            "results": {
                "complement_products": [],
                "total_complement_products": 0,
            },
            "processing_time_seconds": round(time.time() - t0, 3)
        }
        
    for idx, row in complement_df.head(top_n).iterrows():
        title = str(row[title_col])
        brand = str(row[brand_col]) if brand_col and pd.notna(row[brand_col]) else "Unknown Brand"
        price = f"${row[price_col]:.2f}" if price_col and pd.notna(row[price_col]) else "N/A"
        
        products.append({
            "title": title,
            "brand": brand,
            "reason": [
                {"label": "Complement Factor", "value": "Accessory or add-on detected."},
                {"label": "Role", "value": "Enhances or completes the primary product experience."},
                {"label": "Price", "value": price}
            ]
        })

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Complement Intelligence",
        "summary": "Found valid complementary products (accessories/add-ons).",
        "results": {
            "complement_products": products,
            "total_complement_products": len(products),
        },
        "processing_time_seconds": elapsed,
    }
