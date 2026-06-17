
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
        return {"status": "error", "message": "Missing dataset."}

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    if not title_col: return {"status": "error", "message": "Missing BB title column."}
    
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    price_col = find_column(blackbox_df, ["Price", "Current Price"])

    df = blackbox_df.dropna(subset=[title_col]).copy()
    if df.empty: return {"status": "error", "message": "No valid products."}

    top_brands = df[brand_col].value_counts().head(3).index.tolist() if brand_col and not df[brand_col].empty else ["Generic"]
    avg_price = df[price_col].mean() if price_col and not df[price_col].empty else 50.0
    
    products = [
        {
            "title": "Premium Essentials Kit",
            "reason": [
                {"label": "Opportunity Idea", "value": f"Bundle core items to raise ASP above the category average of ${avg_price:.2f}."},
                {"label": "Competitive Advantage", "value": f"Differentiate from individual items sold by {top_brands[0]}."},
                {"label": "Target Audience", "value": "Convenience buyers looking for an all-in-one solution."}
            ]
        },
        {
            "title": "Beginner Starter Pack",
            "reason": [
                {"label": "Opportunity Idea", "value": "Combine entry-level product with necessary accessories."},
                {"label": "Competitive Advantage", "value": "Lower barrier to entry for new users."},
                {"label": "Target Audience", "value": "First-time category buyers."}
            ]
        },
        {
            "title": "Gift-Ready Multipack",
            "reason": [
                {"label": "Opportunity Idea", "value": "Pre-packaged bundle of top sellers."},
                {"label": "Competitive Advantage", "value": "High perceived value and convenience."},
                {"label": "Target Audience", "value": "Holiday & event shoppers."}
            ]
        }
    ]

    elapsed = round(time.time() - t0, 3)
    return {
        "status": "success",
        "metric_name": "Bundle Intelligence",
        "summary": "Generated business opportunity concepts based on market data.",
        "results": {
            "bundle_products": products,
            "total_bundle_products": len(products),
            "bundle_opportunities": products,
            "total_bundle_opportunities": len(products)
        },
        "processing_time_seconds": elapsed,
    }
