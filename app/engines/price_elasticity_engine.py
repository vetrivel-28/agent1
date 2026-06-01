"""
Price Economics Engine
======================
Completely rebuilt for decile/quantile based pricing intelligence,
median calculations, strict sample size validation, and scatter map generation.
Now includes explicit product-level data (Title, ASIN, Brand, BSR) to eliminate synthetic placeholders.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("price_elasticity_engine")

_PRICE_CANDIDATES = ["Price", "price", "List Price", "list price"]
_REVENUE_CANDIDATES = ["ASIN Revenue", "asin revenue", "Revenue", "revenue", "Parent Level Revenue"]
_ASIN_SALES_CANDIDATES = ["ASIN Sales", "asin sales", "AsinSales", "Parent Level Sales"]
_REVIEW_COUNT_CANDIDATES = ["Review Count", "review count", "Reviews", "ratings", "rating count"]
_RATING_CANDIDATES = ["Rating", "rating", "Review Rating", "Star Rating"]
_TITLE_CANDIDATES = ["Title", "Product Title", "Product Name"]
_ASIN_CANDIDATES = ["ASIN", "asin", "Product ID"]
_BRAND_CANDIDATES = ["Brand", "brand", "Brand Name"]
_BSR_CANDIDATES = ["BSR", "Best Sellers Rank", "Sales Rank"]

def _round2(val: float) -> float:
    if pd.isna(val) or (isinstance(val, float) and np.isinf(val)):
        return 0.0
    return round(float(val), 2)

def _safe_str(val: Any) -> str:
    if pd.isna(val) or val is None:
        return "Unknown"
    return str(val).strip()

def _unavailable_response(message: str) -> Dict[str, Any]:
    return {
        "status": "unavailable",
        "metric_name": "Price Economics",
        "summary": message,
        "results": {},
    }

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Price Economics Engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _unavailable_response("No BlackBox catalog dataset available.")

    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
    review_col = find_column(blackbox_df, _REVIEW_COUNT_CANDIDATES)
    rating_col = find_column(blackbox_df, _RATING_CANDIDATES)
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)

    if not price_col:
        return _unavailable_response("Missing required 'Price' column.")
    if not revenue_col and not sales_col:
        return _unavailable_response("Missing required Revenue/Sales columns.")

    df = blackbox_df.copy()
    
    # Clean numerical columns
    df["_price"] = clean_numeric_series(df[price_col], price_col)[0] if price_col else np.nan
    df["_revenue"] = clean_numeric_series(df[revenue_col], revenue_col)[0] if revenue_col else np.nan
    df["_sales"] = clean_numeric_series(df[sales_col], sales_col)[0] if sales_col else np.nan
    df["_reviews"] = clean_numeric_series(df[review_col], review_col)[0] if review_col else pd.Series(0, index=df.index)
    df["_rating"] = clean_numeric_series(df[rating_col], rating_col)[0] if rating_col else pd.Series(np.nan, index=df.index)
    df["_bsr"] = clean_numeric_series(df[bsr_col], bsr_col)[0] if bsr_col else pd.Series(0, index=df.index)
    
    df["_title"] = df[title_col] if title_col else "Unknown"
    df["_asin"] = df[asin_col] if asin_col else "Unknown"
    df["_brand"] = df[brand_col] if brand_col else "Unknown"

    # Determine Demand Value
    if revenue_col:
        df["_demand"] = df["_revenue"].fillna(0)
    else:
        df["_demand"] = df["_sales"].fillna(0)

    # Filter Valid Price
    df_valid = df.dropna(subset=["_price"])
    df_valid = df_valid[df_valid["_price"] > 0].copy()

    if len(df_valid) < 5:
        return _unavailable_response("Insufficient products with valid price data (need at least 5).")

    total_revenue = float(df_valid["_demand"].sum())
    total_products = len(df_valid)
    total_reviews = float(df_valid["_reviews"].sum())

    if total_revenue <= 0:
        return _unavailable_response("Total category revenue is zero. Cannot construct economics model.")

    # 1. Market Price Structure
    p_series = df_valid["_price"]
    min_p = float(p_series.min())
    max_p = float(p_series.max())
    median_p = float(p_series.median())
    mean_p = float(p_series.mean())
    p25 = float(p_series.quantile(0.25))
    p75 = float(p_series.quantile(0.75))

    market_structure = {
        "floor": _round2(min_p),
        "ceiling": _round2(max_p),
        "spread_str": f"${min_p:.2f} - ${max_p:.2f}",
        "spread_val": _round2(max_p - min_p),
        "median": _round2(median_p),
        "average": _round2(mean_p),
        "p25": _round2(p25),
        "p75": _round2(p75)
    }

    # Premium Viability
    premium_df = df_valid[df_valid["_price"] > median_p]
    premium_revenue = float(premium_df["_demand"].sum())
    premium_count = len(premium_df)
    
    premium_rev_share = _round2((premium_revenue / total_revenue) * 100) if total_revenue > 0 else 0.0
    premium_prod_share = _round2((premium_count / total_products) * 100) if total_products > 0 else 0.0
    premium_efficiency = _round2(premium_rev_share / premium_prod_share) if premium_prod_share > 0 else 0.0

    premium_viability = {
        "revenue_share_pct": premium_rev_share,
        "product_share_pct": premium_prod_share,
        "revenue_efficiency": premium_efficiency
    }

    # Quantile Bands (Deciles if possible)
    try:
        df_valid["_band_idx"], bins = pd.qcut(
            df_valid["_price"], 
            q=10, 
            labels=False, 
            retbins=True, 
            duplicates="drop"
        )
    except Exception:
        # Fallback to 5 buckets if 10 fails due to extreme lack of unique values
        try:
            df_valid["_band_idx"], bins = pd.qcut(df_valid["_price"], q=5, labels=False, retbins=True, duplicates="drop")
        except Exception:
            return _unavailable_response("Failed to generate quantile price bands due to insufficient variance.")

    num_bins = len(bins) - 1
    pct_step = 100 // num_bins if num_bins > 0 else 100
    
    bands = []
    # To map band_idx to band_label for positioning data
    idx_to_label = {}
    
    for idx in range(num_bins):
        lo = bins[idx]
        hi = bins[idx+1]
        
        band_df = df_valid[df_valid["_band_idx"] == idx]
        if band_df.empty:
            continue
            
        b_count = len(band_df)
        b_rev = float(band_df["_demand"].sum())
        b_rev_share = (b_rev / total_revenue) * 100
        b_revs = float(band_df["_reviews"].sum())
        b_revs_share = (b_revs / total_reviews) * 100 if total_reviews > 0 else 0.0
        b_prod_share = (b_count / total_products) * 100
        
        b_avg_rev = float(band_df["_reviews"].mean())
        b_avg_rat = float(band_df["_rating"].mean())
        
        # Median Revenue Per Listing instead of mean
        b_rev_per_list = float(band_df["_demand"].median()) if b_count > 0 else 0.0
        
        start_pct = idx * pct_step
        end_pct = (idx + 1) * pct_step
        quantile_label = f"P{start_pct}-P{end_pct}"
        
        if np.isinf(hi):
            band_label = f"${lo:.2f}+"
        else:
            band_label = f"${lo:.2f}-${hi:.2f}"
            
        idx_to_label[idx] = band_label
        
        # Top Product Calculation
        sorted_band = band_df.sort_values(by="_demand", ascending=False)
        top_row = sorted_band.iloc[0]
        
        top_product = {
            "title": _safe_str(top_row["_title"]),
            "asin": _safe_str(top_row["_asin"]),
            "brand": _safe_str(top_row["_brand"]),
            "revenue": _round2(top_row["_demand"])
        }
        
        # Top Brand Calculation
        if "_brand" in band_df.columns:
            brand_revs = band_df.groupby("_brand")["_demand"].sum()
            top_brand_name = _safe_str(brand_revs.idxmax()) if not brand_revs.empty else "Unknown"
        else:
            top_brand_name = "Unknown"

        bands.append({
            "price_band": band_label,
            "price_range": band_label,
            "product_count": b_count,
            "revenue": _round2(b_rev),
            "revenue_share_pct": _round2(b_rev_share),
            "review_share_pct": _round2(b_revs_share),
            "market_share_pct": _round2(b_prod_share),
            "avg_reviews": _round2(b_avg_rev),
            "avg_rating": _round2(b_avg_rat),
            "revenue_per_listing": _round2(b_rev_per_list),
            "is_valid_sample": b_count >= 10,
            "lo": lo,
            "hi": hi,
            "quantile_label": quantile_label,
            "top_product": top_product,
            "top_brand": top_brand_name
        })
    
    if not bands:
        return _unavailable_response("Failed to generate populated price bands.")

    # Opportunity Score & Classification
    valid_bands = [b for b in bands if b["is_valid_sample"]]
    if valid_bands:
        max_rev_share = max([b["revenue_share_pct"] for b in valid_bands]) or 1.0
        max_rev_per = max([b["revenue_per_listing"] for b in valid_bands]) or 1.0
        avg_comp_density = 100.0 / len(valid_bands)
        avg_rev_density = 100.0 / len(valid_bands)
    else:
        max_rev_share = 1.0
        max_rev_per = 1.0
        avg_comp_density = 10.0
        avg_rev_density = 10.0

    category_avg_reviews = float(df_valid["_reviews"].mean())

    market_sweet_spot = None
    best_sweet_spot_score = -1

    white_space_opportunities = []

    for b in bands:
        if not b["is_valid_sample"]:
            b["opportunity_score"] = 0
            b["quadrant"] = "Insufficient Sample Size"
            b["is_white_space"] = False
            continue

        norm_rev_share = (b["revenue_share_pct"] / max_rev_share) * 100.0
        norm_rev_per = (b["revenue_per_listing"] / max_rev_per) * 100.0
        comp_gap = max(0.0, 100.0 - b["market_share_pct"])
        
        opp_score = (0.4 * norm_rev_share) + (0.4 * norm_rev_per) + (0.2 * comp_gap)
        b["opportunity_score"] = _round2(opp_score)
        
        # Sweet Spot Check: Highest Revenue Share + Above Median Reviews + Valid Sample
        sweet_score = b["revenue_share_pct"]
        if b["avg_reviews"] > category_avg_reviews and sweet_score > best_sweet_spot_score:
            best_sweet_spot_score = sweet_score
            market_sweet_spot = b

        # White Space Check
        is_white_space = (b["revenue_share_pct"] >= avg_rev_density) and (b["market_share_pct"] <= avg_comp_density)
        b["is_white_space"] = is_white_space
        if is_white_space:
            white_space_opportunities.append(b)

        # Quadrant Assignment
        if is_white_space:
            b["quadrant"] = "Best Opportunity"
        elif b["revenue_share_pct"] >= avg_rev_density and b["market_share_pct"] > avg_comp_density:
            b["quadrant"] = "Competitive Core"
        elif b["revenue_share_pct"] < avg_rev_density and b["market_share_pct"] <= avg_comp_density:
            b["quadrant"] = "Niche"
        else:
            b["quadrant"] = "Avoid"

    bands.sort(key=lambda x: x["revenue_share_pct"], reverse=True)
    
    # Recommended Entry
    recommended_entry = {
        "price_band": None,
        "confidence_score": "Insufficient",
        "reasoning": "Insufficient evidence for reliable price recommendation."
    }
    
    if valid_bands:
        best_band = max(valid_bands, key=lambda x: x["opportunity_score"])
        # Check Sample Size & Confidence thresholds
        if best_band["product_count"] > 30 and best_band["opportunity_score"] > 70:
            recommended_entry = {
                "price_band": best_band["price_band"],
                "price_range": best_band["price_range"],
                "confidence_score": "High",
                "reasoning": (
                    f"{best_band['market_share_pct']}% competition density, "
                    f"{best_band['revenue_share_pct']}% revenue share, "
                    f"and strong median revenue per listing."
                ),
                "opportunity_score": best_band["opportunity_score"]
            }

    # Product Positioning Map Data
    # Sort by revenue to ensure the largest revenue items are represented, limit to top 200 for payload size
    top_products = df_valid.sort_values(by="_demand", ascending=False).head(200)
    positioning_data = []
    for idx, row in top_products.iterrows():
        b_idx = row.get("_band_idx")
        b_label = idx_to_label.get(b_idx, "Unknown")
        
        positioning_data.append({
            "title": _safe_str(row["_title"]),
            "asin": _safe_str(row["_asin"]),
            "brand": _safe_str(row["_brand"]),
            "bsr": _round2(row["_bsr"]),
            "price": _round2(row["_price"]),
            "revenue": _round2(row["_demand"]),
            "reviews": _round2(row["_reviews"]),
            "rating": _round2(row["_rating"]),
            "price_band": b_label,
            "market_share_pct": _round2((1.0 / total_products) * 100.0) if total_products else 0.0
        })

    bands_power = sorted(valid_bands, key=lambda x: x["revenue_per_listing"], reverse=True)

    elapsed = round(time.time() - t0, 3)
    logger.info("Price Economics complete: %d bands evaluated.", len(bands))

    return {
        "status": "success",
        "metric_name": "Price Economics",
        "processing_time_seconds": elapsed,
        "results": {
            "market_structure": market_structure,
            "premium_viability": premium_viability,
            "price_bands": bands,
            "top_opportunity_bands": sorted(valid_bands, key=lambda x: x["opportunity_score"], reverse=True),
            "highest_revenue_per_listing_bands": bands_power[:3],
            "market_sweet_spot": market_sweet_spot,
            "white_space_opportunities": white_space_opportunities,
            "recommended_entry": recommended_entry,
            "positioning_map_data": positioning_data,
            "total_revenue": total_revenue,
            "total_products": total_products
        }
    }
