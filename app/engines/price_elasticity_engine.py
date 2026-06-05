"""
Price Economics Engine
======================
Refactored to split large ranges into 6 tiers, emit consistent color mapping,
and analyze cross-tier brand competition using Parent Level Revenue and Sales.
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

_PRICE_CANDIDATES = ["Price", "price", "List Price", "list price", "Buy Box Price", "Current Price", "Parent Level Price", "ASP"]
_REVENUE_CANDIDATES = ["Parent Level Revenue", "Revenue", "Monthly Revenue", "Estimated Revenue"]
_ASIN_SALES_CANDIDATES = ["Parent Level Sales", "ASIN Sales", "Units Sold", "Sales", "Monthly Sales"]
_TITLE_CANDIDATES = ["Title", "Product Title", "Product Name"]
_ASIN_CANDIDATES = ["ASIN", "asin", "Product ID"]
_BRAND_CANDIDATES = ["Brand", "brand", "Brand Name"]
_BSR_CANDIDATES = ["BSR", "Best Sellers Rank", "Sales Rank"]
_REVIEW_CANDIDATES = ["Review Count", "review count", "Reviews", "ratings"]
_RATING_CANDIDATES = ["Rating", "rating", "Review Rating", "Star Rating"]

TIERS = ["Budget", "Mass Market", "Mass Premium", "Premium", "Luxury", "Ultra Luxury"]
COLOR_KEYS = ["tier_budget", "tier_mass_market", "tier_mass_premium", "tier_premium", "tier_luxury", "tier_ultra_luxury"]

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
        "metric_name": "Pricing Intelligence",
        "summary": message,
        "results": {},
    }

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    **kwargs
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Pricing Intelligence Engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _unavailable_response("No BlackBox catalog dataset available.")

    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
    
    if not price_col:
        return _unavailable_response("Missing required 'Price' column.")
    if not revenue_col:
        return _unavailable_response("Missing required 'Parent Level Revenue' column for calculations.")

    df = blackbox_df.copy()
    
    df["_price"] = clean_numeric_series(df[price_col], price_col)[0]
    df["_revenue"] = clean_numeric_series(df[revenue_col], revenue_col)[0]
    df["_sales"] = clean_numeric_series(df[sales_col], sales_col)[0] if sales_col else pd.Series(0, index=df.index)
    
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)
    review_col = find_column(blackbox_df, _REVIEW_CANDIDATES)
    rating_col = find_column(blackbox_df, _RATING_CANDIDATES)

    df["_title"] = df[title_col] if title_col else "Unknown"
    df["_asin"] = df[asin_col] if asin_col else "Unknown"
    df["_brand"] = df[brand_col] if brand_col else "Unknown"
    df["_bsr"] = clean_numeric_series(df[bsr_col], bsr_col)[0] if bsr_col else pd.Series(0, index=df.index)
    df["_reviews"] = clean_numeric_series(df[review_col], review_col)[0] if review_col else pd.Series(0, index=df.index)
    df["_rating"] = clean_numeric_series(df[rating_col], rating_col)[0] if rating_col else pd.Series(0, index=df.index)

    df_valid = df.dropna(subset=["_price", "_revenue"])
    df_valid = df_valid[(df_valid["_price"] > 0) & (df_valid["_revenue"] > 0)].copy()

    if len(df_valid) < 5:
        products = []
        for _, row in df.head(50).iterrows():
            p_val = row["_price"] if "_price" in row else np.nan
            r_val = row["_revenue"] if "_revenue" in row else np.nan
            products.append({
                "title": _safe_str(row["_title"]),
                "brand": _safe_str(row["_brand"]),
                "price": _round2(p_val) if pd.notna(p_val) else 0,
                "parent_revenue": _round2(r_val) if pd.notna(r_val) else 0
            })
        
        valid_price_cnt = int(df["_price"].gt(0).sum()) if "_price" in df else 0
        valid_rev_cnt = int(df["_revenue"].gt(0).sum()) if "_revenue" in df else 0
        missing_cnt = len(df) - len(df_valid)
            
        return {
            "status": "insufficient_data",
            "metric_name": "Pricing Intelligence",
            "summary": f"Pricing Economics Limited — only {len(df_valid)} products have valid Price and Revenue in selected category.",
            "results": {
                "product_count": len(df),
                "valid_price_count": valid_price_cnt,
                "valid_revenue_count": valid_rev_cnt,
                "missing_count": missing_cnt,
                "products": products
            }
        }

    total_revenue = float(df_valid["_revenue"].sum())
    total_products = len(df_valid)

    # 1. Market Price Structure
    min_p = float(df_valid["_price"].min())
    max_p = float(df_valid["_price"].max())
    spread_p = max_p - min_p

    # Determine dynamic bands prioritizing splitting high ends
    # We use percentiles: 0, 20, 40, 60, 80, 95, 100 to tightly bound the Ultra Luxury top 5%
    try:
        raw_bins = np.percentile(df_valid["_price"], [0, 20, 40, 60, 80, 95, 100])
        bins = np.unique(raw_bins)
        if len(bins) < 2:
            bins = np.linspace(min_p, max_p, 7)
    except Exception:
        bins = np.linspace(min_p, max_p, 7)

    df_valid["_band_idx"] = pd.cut(df_valid["_price"], bins=bins, labels=False, include_lowest=True, duplicates="drop")
    # Clean up index in case pd.cut dropped some bins entirely
    unique_bands = sorted(df_valid["_band_idx"].dropna().unique())
    band_mapping = {old_idx: new_idx for new_idx, old_idx in enumerate(unique_bands)}
    df_valid["_band_idx"] = df_valid["_band_idx"].map(band_mapping)

    num_bins = len(unique_bands)
    bands = []
    color_map = {}
    
    for idx in range(num_bins):
        band_df = df_valid[df_valid["_band_idx"] == idx]
        if band_df.empty:
            continue
            
        b_count = len(band_df)
        b_rev = float(band_df["_revenue"].sum())
        b_sales = float(band_df["_sales"].sum())
        b_rev_share = (b_rev / total_revenue) * 100
        
        lo = float(band_df["_price"].min())
        hi = float(band_df["_price"].max())
        
        top_products_df = band_df.sort_values(by="_revenue", ascending=False).head(200)
        b_products = []
        for _, row in top_products_df.iterrows():
            b_products.append({
                "title": _safe_str(row["_title"]),
                "brand": _safe_str(row["_brand"]),
                "asin": _safe_str(row["_asin"]),
                "price": _round2(row["_price"]),
                "parent_revenue": _round2(row["_revenue"]),
                "parent_sales": _round2(row["_sales"])
            })

        tier_idx = int(round(idx * (5 / (num_bins - 1)))) if num_bins > 1 else 3
        tier_name = TIERS[tier_idx]
        color_key = COLOR_KEYS[tier_idx]
        color_map[tier_name] = color_key

        band_label = f"${lo:.2f} - ${hi:.2f}"
        if lo == hi:
             band_label = f"${lo:.2f}"

        bands.append({
            "idx": idx, # internal
            "range_label": band_label,
            "min_price": _round2(lo),
            "max_price": _round2(hi),
            "tier": tier_name,
            "color_key": color_key,
            "product_count": b_count,
            "parent_revenue": _round2(b_rev),
            "parent_sales": _round2(b_sales),
            "products": b_products,
            "revenue_share": _round2(b_rev_share),
            "evidence": {
                "source_dataset": "BlackBox",
                "source_columns": [price_col, revenue_col],
                "formula": "sum(Parent Level Revenue) where Price in range",
                "source_values": f"{b_count} rows",
                "rows_included": b_count,
                "rows_excluded": total_products - b_count,
                "calculation_steps": [
                    f"Identified {b_count} products between ${lo:.2f} and ${hi:.2f}",
                    f"Summed Parent Level Revenue for these products: ${b_rev:,.2f}"
                ],
                "final_value": _round2(b_rev),
                "interpretation": f"This {tier_name} range accounts for {b_rev_share:.1f}% of total category revenue."
            }
        })

    if not bands:
        return _unavailable_response("No valid bands formed.")

    highest_rev_band = max(bands, key=lambda x: x["parent_revenue"])
    highest_sales_band = max(bands, key=lambda x: x["parent_sales"])

    market_price_structure = {
        "price_floor": _round2(min_p),
        "price_ceiling": _round2(max_p),
        "price_spread": _round2(spread_p),
        "evidence": {
            "source_dataset": "BlackBox",
            "source_columns": [price_col],
            "formula": "Floor = min(Price), Ceiling = max(Price), Spread = Ceiling - Floor",
            "source_values": f"Min: ${min_p:.2f}, Max: ${max_p:.2f}",
            "rows_included": total_products,
            "rows_excluded": len(df) - total_products,
            "calculation_steps": [
                f"Found absolute minimum price: ${min_p:.2f}",
                f"Found absolute maximum price: ${max_p:.2f}",
                f"Calculated spread: ${max_p:.2f} - ${min_p:.2f} = ${spread_p:.2f}"
            ],
            "final_value": f"${min_p:.2f} to ${max_p:.2f}",
            "interpretation": f"The market ranges from ${min_p:.2f} to ${max_p:.2f} with a spread of ${spread_p:.2f}."
        }
    }

    # Brand Position by Price Range
    brand_position_by_price_range = []
    cross_tier_competitors = []

    global_brands = df_valid.groupby("_brand")
    for brand, group in global_brands:
        brand_str = _safe_str(brand)
        ranges_present = group["_band_idx"].nunique()
        tot_rev = group["_revenue"].sum()
        tot_sales = group["_sales"].sum()

        if ranges_present > 1 and (tot_rev > 1000 or len(group) > 2):
            best_idx = group.groupby("_band_idx")["_revenue"].sum().idxmax()
            best_band = next(b for b in bands if b["idx"] == best_idx)
            cross_tier_competitors.append({
                "brand": brand_str,
                "price_ranges_present": int(ranges_present),
                "total_parent_revenue": _round2(tot_rev),
                "total_parent_sales": _round2(tot_sales),
                "strongest_price_range": best_band["range_label"],
                "strategic_note": f"{brand_str} appears in {ranges_present} price ranges, dominating strongest in the {best_band['tier']} tier.",
                "evidence": {
                    "source_dataset": "BlackBox",
                    "source_columns": [brand_col, price_col, revenue_col],
                    "formula": "Count unique bands for Brand",
                    "source_values": f"{ranges_present} bands",
                    "rows_included": len(group),
                    "rows_excluded": total_products - len(group),
                    "calculation_steps": [
                        f"Grouped products by brand: {brand_str}",
                        f"Found products in {ranges_present} distinct price quartiles.",
                        f"Determined {best_band['range_label']} generated the most revenue."
                    ],
                    "final_value": ranges_present,
                    "interpretation": f"This brand is a cross-tier competitor competing broadly."
                }
            })

    cross_tier_competitors.sort(key=lambda x: x["total_parent_revenue"], reverse=True)

    for b in bands:
        b_idx = b["idx"]
        band_df = df_valid[df_valid["_band_idx"] == b_idx]
        if band_df.empty:
            continue
            
        b_brands = band_df.groupby("_brand")
        brand_breakdown = []
        brand_count = 0
        
        for brand, group in b_brands:
            rev = group["_revenue"].sum()
            sales = group["_sales"].sum()
            count = len(group)
            
            if rev == 0 and count == 0:
                continue
                
            brand_count += 1
            brand_share = (rev / b["parent_revenue"] * 100) if b["parent_revenue"] > 0 else 0
            
            top_prods_df = group.sort_values(by="_revenue", ascending=False).head(5)
            top_prods = []
            for _, r in top_prods_df.iterrows():
                 top_prods.append({
                     "title": _safe_str(r["_title"]),
                     "parent_revenue": _round2(r["_revenue"]),
                     "parent_sales": _round2(r["_sales"]),
                     "price": _round2(r["_price"])
                 })
            
            brand_breakdown.append({
                "brand": _safe_str(brand),
                "parent_revenue": _round2(rev),
                "parent_sales": _round2(sales),
                "product_count": count,
                "brand_share": _round2(brand_share),
                "top_products": top_prods
            })
            
        if not brand_breakdown:
            continue
            
        brand_breakdown.sort(key=lambda x: x["parent_revenue"], reverse=True)
        leading = brand_breakdown[0]
        leading_brand = leading["brand"]
        leading_rev = leading["parent_revenue"]
        leading_share = leading["brand_share"]
        
        if leading_share > 50:
            conc_note = "Concentrated (Leading brand holds > 50% share)"
        elif leading_share < 20 and brand_count > 5:
            conc_note = "Fragmented (Many brands with low share)"
        else:
            conc_note = "Balanced (Moderate distribution)"
            
        brand_position_by_price_range.append({
            "price_range": b["range_label"],
            "tier": b["tier"],
            "color_key": b["color_key"],
            "total_parent_revenue": _round2(b["parent_revenue"]),
            "total_parent_sales": _round2(b["parent_sales"]),
            "product_count": b["product_count"],
            "brand_count": brand_count,
            "leading_brand": leading_brand,
            "leading_brand_revenue": leading_rev,
            "leading_brand_share": leading_share,
            "concentration_note": conc_note,
            "brand_breakdown": brand_breakdown,
            "evidence": {
                "source_dataset": "BlackBox",
                "source_columns": ["Price", "Brand", "Parent Level Revenue", "Parent Level Sales", "ASIN/Title"],
                "formula": "Aggregated Brand metrics within Price Range",
                "source_values": f"Range: {b['range_label']}",
                "rows_included": b["product_count"],
                "rows_excluded": total_products - b["product_count"],
                "calculation_steps": [
                    f"Grouped {b['product_count']} products in {b['range_label']} by Brand.",
                    f"Found {brand_count} unique brands.",
                    f"Identified {leading_brand} as the leader with ${leading_rev:,.2f}."
                ],
                "final_value": brand_count,
                "interpretation": f"This tier has {brand_count} competing brands. It is {conc_note.split(' ')[0].lower()}."
            }
        })
        
    brand_position_by_price_range.sort(key=lambda x: (bands.index(next(bb for bb in bands if bb["range_label"] == x["price_range"]))))

    # Market Sweet Spot
    sweet_spot = {
        "tier": highest_rev_band["tier"],
        "range_label": highest_rev_band["range_label"],
        "parent_revenue": highest_rev_band["parent_revenue"],
        "parent_sales": highest_rev_band["parent_sales"],
        "product_count": highest_rev_band["product_count"],
        "formula": "max(sum(Parent Level Revenue)) grouped by price_range",
        "insight": f"This range is the sweet spot because it balances strong Parent Level Revenue (${highest_rev_band['parent_revenue']:,.2f}) and steady demand ({highest_rev_band['parent_sales']:,.0f} units) across {highest_rev_band['product_count']} competing products.",
        "evidence": {
            "source_dataset": "BlackBox",
            "source_columns": [price_col, revenue_col],
            "formula": "Find price range with highest Parent Level Revenue",
            "source_values": f"Highest Range: {highest_rev_band['range_label']}",
            "rows_included": highest_rev_band["product_count"],
            "rows_excluded": total_products - highest_rev_band["product_count"],
            "calculation_steps": [
                "Grouped valid products into calculated price tiers.",
                f"Summed Parent Level Revenue for each group.",
                f"Identified {highest_rev_band['range_label']} as having the absolute highest revenue (${highest_rev_band['parent_revenue']:,.2f})."
            ],
            "final_value": highest_rev_band["parent_revenue"],
            "interpretation": f"The {highest_rev_band['tier']} tier captures the most market value."
        }
    }



    # Top Pricing Opportunities
    top_opportunities = []
    for b in bands:
        avg_density = 100.0 / len(bands)
        comp_density = (b["product_count"] / total_products * 100)
        
        comp_gap = max(0, avg_density - comp_density)
        rev_opp = (b["revenue_share"] / 100) * 40
        gap_opp = (comp_gap / avg_density) * 30 if avg_density > 0 else 0
        sweet_opp = 20 if b == highest_rev_band else 0
        
        opp_score = min(100, rev_opp + gap_opp + sweet_opp)
        
        top_opportunities.append({
            "price_range": b["range_label"],
            "tier": b["tier"],
            "color_key": b["color_key"],
            "parent_revenue": b["parent_revenue"],
            "parent_sales": b["parent_sales"],
            "product_count": b["product_count"],
            "competition_density": _round2(comp_density),
            "opportunity_score": _round2(opp_score),
            "evidence": {
                "source_dataset": "BlackBox",
                "source_columns": [price_col, revenue_col],
                "formula": "Revenue Opportunity + Competition Gap + Sweet Spot",
                "source_values": f"RevShare: {b['revenue_share']}%, CompDensity: {comp_density}%",
                "rows_included": b["product_count"],
                "rows_excluded": total_products - b["product_count"],
                "calculation_steps": [
                    f"Calculated Revenue Score contribution: {rev_opp:.1f}",
                    f"Calculated Competition Gap contribution: {gap_opp:.1f}",
                    f"Evaluated Sweet Spot Alignment: +{sweet_opp}",
                    f"Summed components to yield total score: {opp_score:.1f}"
                ],
                "final_value": _round2(opp_score),
                "interpretation": f"A score of {opp_score:.1f} representing market entry attractiveness."
            }
        })
    top_opportunities.sort(key=lambda x: x["opportunity_score"], reverse=True)

    # Entry Recommendation
    best_entry = top_opportunities[0]
    best_entry_band = next(b for b in bands if b["range_label"] == best_entry["price_range"])
    
    # Identify dominating brands in the recommended tier
    dominating_str = "various brands"
    b_bands = [bb for bb in brand_position_by_price_range if bb["price_range"] == best_entry["price_range"]]
    if b_bands:
        dominating_str = b_bands[0]["leading_brand"]
    
    llm_strat = (f"The {best_entry['tier']} range ({best_entry['price_range']}) is the most attractive entry point. "
                 f"It captures ${best_entry['parent_revenue']:,.2f} in revenue while units sold remain healthy at {best_entry['parent_sales']:,.0f}. "
                 f"Entering as a {best_entry['tier']} brand here requires understanding that {dominating_str} is a major player. "
                 f"To compete effectively, focus on premium differentiation or bundle value rather than a direct price war, "
                 f"as competition density here is {best_entry['competition_density']}%.")
    
    rule_reason = f"Recommended tier: {best_entry['tier']}. Reason: Highest opportunity score ({best_entry['opportunity_score']}). Favorable revenue-to-competition ratio."
    
    entry_price_recommendation = {
        "recommended_range": best_entry["price_range"],
        "tier": best_entry["tier"],
        "strategy": "Balance pricing to capture established revenue pools without facing maximum competition density.",
        "llm_strategy": llm_strat,
        "rule_based_strategy": rule_reason,
        "evidence": {
            "source_dataset": "Calculated Opportunity Scores",
            "source_columns": ["Opportunity Score"],
            "formula": "max(Opportunity Score)",
            "source_values": str(best_entry["opportunity_score"]),
            "rows_included": len(bands),
            "rows_excluded": 0,
            "calculation_steps": [
                "Computed opportunity scores for all available price bands.",
                f"Selected {best_entry['price_range']} as the highest-scoring band ({best_entry['opportunity_score']}).",
                f"Generated strategic insight identifying {dominating_str} as a key competitor."
            ],
            "final_value": best_entry["price_range"],
            "interpretation": f"The statistical model indicates {best_entry['price_range']} is the optimal entry point."
        }
    }

    # Positioning Map
    map_data = []
    top_200 = df_valid.sort_values(by="_revenue", ascending=False).head(200)
    for _, row in top_200.iterrows():
        b_idx = row["_band_idx"]
        matched_band = next((b for b in bands if b["idx"] == b_idx), bands[-1])
        
        map_data.append({
            "title": _safe_str(row["_title"]),
            "brand": _safe_str(row["_brand"]),
            "asin": _safe_str(row["_asin"]),
            "price": _round2(row["_price"]),
            "tier": matched_band["tier"],
            "color_key": matched_band["color_key"],
            "parent_revenue": _round2(row["_revenue"]),
            "parent_sales": _round2(row["_sales"]),
            "evidence": {
                "source_dataset": "BlackBox",
                "source_columns": [title_col, brand_col, price_col, revenue_col],
                "formula": "Direct extraction",
                "source_values": f"Price: ${row['_price']}, Rev: ${row['_revenue']}",
                "rows_included": 1,
                "rows_excluded": 0,
                "calculation_steps": ["Extracted exact values from dataset row."],
                "final_value": f"${row['_price']} / ${row['_revenue']}",
                "interpretation": "Direct data point mapping."
            }
        })

    # Revenue Pricing & Competition Density Chart Data
    revenue_distribution = []
    competition_density_chart = []
    
    for b in bands:
        revenue_distribution.append({
            "tier": b["tier"],
            "range_label": b["range_label"],
            "color_key": b["color_key"],
            "parent_revenue": b["parent_revenue"]
        })
        competition_density_chart.append({
            "tier": b["tier"],
            "range_label": b["range_label"],
            "color_key": b["color_key"],
            "product_count": b["product_count"]
        })

    # Remove internal idx from bands
    for b in bands:
        del b["idx"]

    elapsed = round(time.time() - t0, 3)
    logger.info("Pricing Intelligence Engine completed.")

    return {
        "status": "success",
        "metric_name": "Pricing Intelligence",
        "processing_time_seconds": elapsed,
        "results": {
            "price_tiers": bands,
            "color_map": color_map,
            "market_price_structure": market_price_structure,
            "product_positioning_map": map_data,
            "revenue_distribution": revenue_distribution,
            "competition_density": competition_density_chart,
            "market_sweet_spot": sweet_spot,
            "entry_price_recommendation": entry_price_recommendation,
            "top_pricing_opportunities": top_opportunities,
            "brand_position_by_price_range": brand_position_by_price_range,
            "cross_tier_competitors": cross_tier_competitors
        }
    }
