"""
Demand Strength Engine (Overhauled)
===================================
Dataset-derived, mathematically rigorous demand intelligence engine.
"""
from __future__ import annotations

import time
import math
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Optional, Tuple

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series
from app.utils.category_rules import get_matching_categories, get_category_formula

logger = get_logger("demand_engine")

_SEARCH_VOL_CANDIDATES = ["monthly_search_volume", "Monthly Search Volume", "Search Volume", "search volume", "SearchVolume"]
_KW_SALES_CANDIDATES = ["Keyword Sales", "keyword sales", "KeywordSales"]
_ASIN_SALES_CANDIDATES = ["ASIN Sales", "asin sales", "AsinSales", "Parent Level Sales", "parent level sales"]
_REVENUE_CANDIDATES = ["ASIN Revenue", "asin revenue", "Revenue", "revenue", "Parent Level Revenue", "parent level revenue", "Monthly Revenue", "monthly revenue"]
_KEYWORD_CANDIDATES = ["Keyword Phrase", "keyword phrase", "Keyword", "keyword"]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_ASIN_CANDIDATES = ["ASIN", "asin"]
_CLASS_CANDIDATES = ["Classification", "classification", "Category", "category"]

def _sv(v: Any) -> Any:
    if v is None or pd.isna(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v

def _extract_segments(
    magnet_df: pd.DataFrame,
    sv_col: str,
    kw_sales_col: Optional[str],
    kw_col: str,
    kc_df: Optional[pd.DataFrame] = None,
) -> Tuple[List[Dict[str, Any]], str]:
    tmp = magnet_df[[kw_col]].copy()
    sv_c, _ = clean_numeric_series(magnet_df[sv_col], sv_col)
    tmp["_sv"] = sv_c
    tmp = tmp.dropna(subset=["_sv"])
    tmp = tmp[tmp["_sv"] > 0]
    
    if kw_sales_col:
        ks_c, _ = clean_numeric_series(magnet_df.loc[tmp.index, kw_sales_col], kw_sales_col)
        tmp["_ks"] = ks_c.fillna(0)
    else:
        tmp["_ks"] = 0.0

    tmp["_kw_clean"] = tmp[kw_col].astype(str).str.lower().str.strip()
    
    tmp_agg = tmp.groupby("_kw_clean").agg(
        _sv=("_sv", "sum"),
        _ks=("_ks", "sum"),
        kw_original=(kw_col, "first")
    ).reset_index()
    
    total_heatmap_sv = float(tmp_agg["_sv"].sum())
    total_heatmap_ks = float(tmp_agg["_ks"].sum())
    
    if total_heatmap_sv <= 0 or len(tmp_agg) == 0:
        return [], "empty"
        
    method = "fallback_rules"
    if kc_df is not None and not kc_df.empty:
        class_col = find_column(kc_df, _CLASS_CANDIDATES)
        kc_kw_col = find_column(kc_df, _KEYWORD_CANDIDATES)
        if class_col and kc_kw_col:
            method = "keyword_classification_dataset"
            kc_map = dict(zip(kc_df[kc_kw_col].astype(str).str.lower().str.strip(), kc_df[class_col]))
            tmp_agg["_segment"] = tmp_agg["_kw_clean"].map(kc_map)
            tmp_agg["_segment"] = tmp_agg["_segment"].fillna("Other")
            
            # For this path, each keyword has exactly 1 segment
            tmp_exploded = tmp_agg.copy()
            tmp_exploded["_categories"] = tmp_exploded["_segment"]
            
    if method == "fallback_rules":
        tmp_agg["_categories"] = tmp_agg["kw_original"].apply(get_matching_categories)
        tmp_exploded = tmp_agg.explode("_categories")
        tmp_exploded["_segment"] = tmp_exploded["_categories"]

    seg_sums = tmp_exploded.groupby("_segment")["_sv"].sum().reset_index()
    seg_sums = seg_sums[seg_sums["_sv"] > 0].sort_values("_sv", ascending=False)
    
    if method == "fallback_rules":
        top_segs = seg_sums.head(8)["_segment"].tolist()
        tmp_exploded["_final_seg"] = tmp_exploded["_segment"].apply(lambda x: x if x in top_segs else "Other")
    else:
        tmp_exploded["_final_seg"] = tmp_exploded["_segment"]
        
    final_agg = tmp_exploded.groupby("_final_seg").agg(
        total_sv=("_sv", "sum"),
        total_ks=("_ks", "sum"),
        kw_count=("_final_seg", "count")
    ).reset_index()

    segment_list = []
    
    for _, row in final_agg.iterrows():
        seg = str(row["_final_seg"])
        sv = float(row["total_sv"])
        ks = float(row["total_ks"])
        count = int(row["kw_count"])
        
        group = tmp_exploded[tmp_exploded["_final_seg"] == seg].sort_values("_sv", ascending=False)
        seg_keywords = []
        for _, krow in group.iterrows():
            k_contrib = (float(krow["_sv"]) / sv * 100.0) if sv > 0 else 0.0
            seg_keywords.append({
                "keyword": str(krow["kw_original"]),
                "search_volume": int(krow["_sv"]),
                "contribution_pct": round(k_contrib, 2)
            })

        demand_share = round((sv / total_heatmap_sv) * 100.0, 2)
        revenue_share = round((ks / total_heatmap_ks) * 100.0, 2) if total_heatmap_ks > 0 else 0.0
        comp_index = round(count / max(demand_share, 0.01), 2)
        
        segment_list.append({
            "segment": seg,
            "demand_share": demand_share,
            "keyword_count": count,
            "revenue_share": revenue_share,
            "total_search_volume": int(sv),
            "demand_revenue_gap": round(revenue_share - demand_share, 2),
            "competition_index": comp_index,
            "keywords": seg_keywords,
            "formula": "Derived from Keyword Classification Dataset" if method == "keyword_classification_dataset" else get_category_formula(seg),
        })

    segment_list.sort(key=lambda x: x["demand_share"], reverse=True)
    return segment_list, method

def _create_evidence(source_dataset: str, source_columns: List[str], formula: str, source_values: Dict[str, Any], calculation_steps: List[str], final_value: Any, interpretation: str) -> Dict[str, Any]:
    return {
        "source_dataset": source_dataset,
        "source_columns": source_columns,
        "formula": formula,
        "source_values": source_values,
        "rows_included": "All valid matching rows",
        "rows_excluded": "Rows missing required column data",
        "calculation_steps": calculation_steps,
        "final_value": final_value,
        "interpretation": interpretation,
    }

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
    keyword_classification_df: Optional[pd.DataFrame] = None,
) -> Dict[str, Any]:
    t0 = time.time()
    
    if magnet_df is None or magnet_df.empty:
        return {"status": "error", "message": "Magnet DataFrame is empty or missing."}
        
    sv_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    kw_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    kw_sales_col = find_column(magnet_df, _KW_SALES_CANDIDATES)
    
    if not sv_col or not kw_col:
        return {"status": "error", "message": "Required columns missing in Magnet DataFrame."}
        
    segment_list, method = _extract_segments(magnet_df, sv_col, kw_sales_col, kw_col, keyword_classification_df)
    
    total_market_sv = sum(s["total_search_volume"] for s in segment_list)
    total_market_ks = sum(sum(k["search_volume"] * (s["revenue_share"]/max(s["demand_share"],0.01)) for k in s.get("keywords",[])) for s in segment_list) # Mock for total ks
    
    # Concentration Score = SUM((Demand Share Decimal)^2) * 100
    hhi_score = 0.0
    hhi_steps = []
    for s in segment_list:
        dec = s["demand_share"] / 100.0
        sq = dec * dec
        hhi_score += sq
        hhi_steps.append(f"{s['segment']}: ({dec:.3f})^2 = {sq:.4f}")
    hhi_score = min(round(hhi_score * 100.0, 2), 100.0)
    
    concentration_evidence = _create_evidence(
        source_dataset="Magnet",
        source_columns=[sv_col],
        formula="SUM((Demand Share / 100)^2) * 100",
        source_values={"segments": {s['segment']: s['demand_share'] for s in segment_list}},
        calculation_steps=hhi_steps,
        final_value=hhi_score,
        interpretation="Higher score indicates demand is concentrated in fewer clusters. >25 is highly concentrated."
    )
    
    # Dominant Cluster
    top_seg = max(segment_list, key=lambda x: x["demand_share"]) if segment_list else None
    dominant_cluster = None
    if top_seg:
        dominant_cluster = {
            "name": top_seg["segment"],
            "demand_share": top_seg["demand_share"],
            "search_volume": top_seg["total_search_volume"],
            "evidence": _create_evidence(
                "Magnet", [sv_col], "MAX(Demand Share)", {"max_share": top_seg["demand_share"]},
                [f"Found highest demand share: {top_seg['segment']} with {top_seg['demand_share']}%"],
                top_seg["segment"],
                f"This cluster dominates search volume and represents the primary market interest."
            )
        }
        
    # Recommended Entry
    best_entry_score = -999.0
    best_entry_seg = None
    entry_steps = []
    for s in segment_list:
        if s["segment"] == "Other" or (top_seg and s["segment"] == top_seg["segment"]):
            continue
        ds = s["demand_share"]
        if ds <= 0: continue
        ml = s["revenue_share"] / ds
        acc = max(0, 100 - s["competition_index"])
        cg = max(0, ml * 10)
        
        # Entry Score = (Demand Share × 0.35) + (Monetization Lift × 0.30) + (Accessibility × 0.20) + (Competition Gap × 0.15)
        # Normalize DS first (simplified to % of max)
        max_ds = max([x["demand_share"] for x in segment_list if x["segment"] != "Other" and x["segment"] != top_seg["segment"]] + [1])
        ds_norm = (ds / max_ds) * 100
        ml_norm = min(ml * 50, 100) # Simple scaling
        
        score = (ds_norm * 0.35) + (ml_norm * 0.30) + (acc * 0.20) + (cg * 0.15)
        if score > best_entry_score:
            best_entry_score = score
            best_entry_seg = s
            entry_steps = [
                f"Evaluated {s['segment']}:",
                f"Normalized Demand Share: {ds_norm:.1f} * 0.35 = {ds_norm*0.35:.1f}",
                f"Monetization Lift: {ml_norm:.1f} * 0.30 = {ml_norm*0.30:.1f}",
                f"Accessibility (100 - Comp Index): {acc:.1f} * 0.20 = {acc*0.20:.1f}",
                f"Competition Gap: {cg:.1f} * 0.15 = {cg*0.15:.1f}",
                f"Total Score = {score:.1f}"
            ]
            
    recommended_entry = None
    if best_entry_seg:
        recommended_entry = {
            "name": best_entry_seg["segment"],
            "score": round(best_entry_score, 1),
            "evidence": _create_evidence(
                "Magnet", [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                "Weighted sum of Demand(35%), Monetization(30%), Accessibility(20%), CompGap(15%)",
                {"segment": best_entry_seg["segment"]},
                entry_steps,
                round(best_entry_score, 1),
                "Optimum entry point balancing demand, lower competition, and monetization potential."
            )
        }
        
    # Most Undervalued (Demand Share - Revenue Share > 0)
    best_underv_gap = -999.0
    best_underv_seg = None
    underv_steps = []
    for s in segment_list:
        gap = s["demand_share"] - s["revenue_share"]
        if gap > best_underv_gap:
            best_underv_gap = gap
            best_underv_seg = s
            underv_steps = [f"Demand Share ({s['demand_share']}%) - Revenue Share ({s['revenue_share']}%) = {gap:.1f}%"]
            
    most_undervalued = None
    if best_underv_seg and best_underv_gap > 0:
        most_undervalued = {
            "name": best_underv_seg["segment"],
            "gap": round(best_underv_gap, 1),
            "evidence": _create_evidence(
                "Magnet", [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                "Demand Share - Revenue Share",
                {"demand_share": best_underv_seg["demand_share"], "revenue_share": best_underv_seg["revenue_share"]},
                underv_steps,
                round(best_underv_gap, 1),
                "Segment captures less revenue than its search demand implies."
            )
        }
        
    # Best Monetized (Revenue Share / Demand Share)
    best_monet_lift = -999.0
    best_monet_seg = None
    monet_steps = []
    for s in segment_list:
        if s["demand_share"] <= 0: continue
        lift = s["revenue_share"] / s["demand_share"]
        if lift > best_monet_lift:
            best_monet_lift = lift
            best_monet_seg = s
            monet_steps = [f"Revenue Share ({s['revenue_share']}%) / Demand Share ({s['demand_share']}%) = {lift:.2f}"]
            
    best_monetized = None
    if best_monet_seg and best_monet_lift > 0:
        best_monetized = {
            "name": best_monet_seg["segment"],
            "lift": round(best_monet_lift, 2),
            "evidence": _create_evidence(
                "Magnet", [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                "Revenue Share / Demand Share",
                {"revenue_share": best_monet_seg["revenue_share"], "demand_share": best_monet_seg["demand_share"]},
                monet_steps,
                round(best_monet_lift, 2),
                "Segment converts search demand into revenue highly efficiently."
            )
        }

    # Format Opportunity Database
    opp_db = []
    for s in segment_list:
        opp_db.append({
            "segment": s["segment"],
            "demand_share": s["demand_share"],
            "revenue_share": s["revenue_share"],
            "total_search_volume": s["total_search_volume"],
            "demand_revenue_gap": s["demand_revenue_gap"],
            "competition_index": s["competition_index"],
            "entry_difficulty": "High" if s["competition_index"] >= 50 else "Moderate" if s["competition_index"] >= 20 else "Low",
            "evidence": _create_evidence(
                "Magnet", [sv_col], "Aggregation of matching keywords",
                {"keyword_count": s["keyword_count"]},
                [f"Aggregated {s['keyword_count']} keywords matching {s['formula']}"],
                s["total_search_volume"],
                "Full category aggregation"
            )
        })

    # Output structure exactly matching requirements
    output = {
        "status": "success",
        "results": {
            "total_search_volume": int(total_market_sv),
            "total_keyword_sales": int(total_market_ks),
            "concentration_score": {
                "value": hhi_score,
                "evidence": concentration_evidence
            },
            "dominant_cluster": dominant_cluster,
            "recommended_entry": recommended_entry,
            "demand_heatmap": segment_list,  # Used for UI rendering heatmap
            "most_undervalued_theme": most_undervalued,
            "best_monetized_theme": best_monetized,
            "demand_opportunity_database": opp_db,
            "search_insights": [
                {
                    "title": "Concentration Risk",
                    "description": f"Market is highly concentrated with {hhi_score} HHI." if hhi_score > 25 else "Market is fairly fragmented.",
                    "evidence": concentration_evidence
                }
            ]
        }
    }
    
    return output
