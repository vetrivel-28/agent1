
import time
import pandas as pd
from typing import Any, Dict, Optional, List
from app.utils.column_mapper import find_column
from app.utils.logger import get_logger

logger = get_logger("bundle_engine")

_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_BRAND_CANDIDATES = ["Brand", "brand", "Brand Name"]

def run(kc_df: Optional[pd.DataFrame], blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Bundle dataset-backed engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return {"status": "error", "summary": "Missing dataset."}

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    if not title_col: return {"status": "error", "summary": "Missing BB title column."}
    
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)

    df = blackbox_df.dropna(subset=[title_col]).copy()
    if df.empty: return {"status": "error", "summary": "No valid products."}

    # We will pick a few products from the scoped blackbox_df
    # In a real scenario, we would match based on 'substitute', 'complement' keyword overlap or classification
    
    products = []
    
    if "bundle" == "substitute":
        # Deterministic: grab products that don't share the exact same top terms but are in the same category
        for idx, row in df.head(top_n).iterrows():
            title = str(row[title_col])
            brand = str(row[brand_col]) if brand_col and pd.notna(row[brand_col]) else "Unknown Brand"
            products.append({
                "title": title,
                "reason": [
                    {"label": "Source", "value": "Scoped BlackBox Dataset"},
                    {"label": "Brand", "value": brand},
                    {"label": "Confidence", "value": "High (Category Match)"},
                    {"label": "Selection", "value": "Alternative within same category scope"}
                ]
            })
    elif "bundle" == "complement":
        # Complements: look for "accessories", "kit", "pack", or just other items
        for idx, row in df.head(top_n).iterrows():
            title = str(row[title_col])
            brand = str(row[brand_col]) if brand_col and pd.notna(row[brand_col]) else "Unknown Brand"
            products.append({
                "title": title,
                "reason": [
                    {"label": "Source", "value": "Scoped BlackBox Dataset"},
                    {"label": "Brand", "value": brand},
                    {"label": "Confidence", "value": "Moderate (Co-occurrence)"},
                    {"label": "Selection", "value": "Potential complementary usage within scope"}
                ]
            })
    elif "bundle" == "bundle":
        # Bundles: look for "set", "pack", "bundle"
        mask = df[title_col].str.lower().str.contains(r'\b(set|pack|bundle|kit|multipack)\b', regex=True, na=False)
        bundle_df = df[mask] if not df[mask].empty else df.head(top_n)
        for idx, row in bundle_df.head(top_n).iterrows():
            title = str(row[title_col])
            brand = str(row[brand_col]) if brand_col and pd.notna(row[brand_col]) else "Unknown Brand"
            products.append({
                "title": title,
                "reason": [
                    {"label": "Source", "value": "Scoped BlackBox Dataset"},
                    {"label": "Brand", "value": brand},
                    {"label": "Confidence", "value": "High (Bundle Keyword Match)" if mask.loc[idx] else "Low"},
                    {"label": "Selection", "value": "Bundle or kit configuration"}
                ]
            })

    if not products:
        return {
            "status": "success",
            "metric_name": "Bundle Intelligence",
            "summary": "No validated substitute/complement/bundle products found from the active scoped dataset.",
            "results": {
                "bundle_products": [],
                "total_bundle_products": 0,
                "bundle_opportunities": [],
                "total_bundle_opportunities": 0
            },
            "processing_time_seconds": round(time.time() - t0, 3)
        }

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Bundle Intelligence",
        "summary": f"Found dataset-backed bundles.",
        "results": {
            "bundle_products": products,
            "total_bundle_products": len(products),
            "bundle_opportunities": products,
            "total_bundle_opportunities": len(products)
        },
        "processing_time_seconds": elapsed,
    }
