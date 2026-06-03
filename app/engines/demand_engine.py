"""
Demand Strength Engine (Overhauled)
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
from app.utils.theme_extraction import extract_dynamic_themes, extract_hierarchical_themes, assign_themes


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
        
    method = "dynamic_extraction"
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
            
    if method == "dynamic_extraction":
        keywords_list = tmp_agg["kw_original"].tolist()
        sv_list = tmp_agg["_sv"].tolist()
        
        # PASS 1: Hierarchical Extraction
        h_themes, h_roots = extract_hierarchical_themes(keywords_list, sv_list, num_themes=10)
        h_assigned = assign_themes(keywords_list, h_themes, h_roots)
        
        # Check Other %
        total_sv = sum(sv_list)
        other_sv = sum(sv for a, sv in zip(h_assigned, sv_list) if a == "Other")
        
        if total_sv > 0 and (other_sv / total_sv) > 0.75:
            # PASS 2: Loose Fallback
            logger.info(f"Hierarchical extraction failed (Other={other_sv/total_sv*100:.1f}%). Falling back to loose N-Gram.")
            l_themes = extract_dynamic_themes(keywords_list, sv_list, num_themes=12)
            l_assigned = assign_themes(keywords_list, l_themes)
            tmp_agg["_segment"] = l_assigned
        else:
            tmp_agg["_segment"] = h_assigned
            
        tmp_exploded = tmp_agg.copy()
        tmp_exploded["_categories"] = tmp_exploded["_segment"]

    seg_sums = tmp_exploded.groupby("_segment")["_sv"].sum().reset_index()
    seg_sums = seg_sums[seg_sums["_sv"] > 0].sort_values("_sv", ascending=False)
    
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
            "formula": "Derived from Keyword Classification Dataset" if method == "keyword_classification_dataset" else f"Contains phrase: '{seg}'",
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

def _run_internal(
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
    
    # Diagnostic Logging
    other_seg = next((s for s in segment_list if s["segment"] == "Other"), None)
    other_pct = other_seg["demand_share"] if other_seg else 0.0
    quality_score = 100.0 - other_pct
    
    logger.info("=== Demand Classification Diagnostics ===")
    logger.info(f"Method: {method}")
    logger.info(f"Quality Score: {quality_score:.1f}/100")
    logger.info(f"Other %: {other_pct:.1f}%")
    logger.info(f"Total Clusters: {len(segment_list)}")
    for s in segment_list[:10]:
        logger.info(f"  {s['segment']}: {s['demand_share']}% ({s['keyword_count']} keywords)")
    logger.info("=========================================")
    
    # Graceful degradation: The engine no longer hard fails on >75%.
        
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
    
    # Classification Confidence level
    if quality_score > 80.0:
        confidence_level = "High"
    elif quality_score >= 50.0:
        confidence_level = "Medium"
    elif quality_score >= 20.0:
        confidence_level = "Low"
    else:
        confidence_level = "Critical"

    # Calculate Opportunity Score for all segments
    for s in segment_list:
        if s["segment"] == "Other":
            s["opportunity_score"] = 0.0
            s["score_breakdown"] = {}
            continue
            
        ds = s["demand_share"]
        if ds <= 0:
            s["opportunity_score"] = 0.0
            s["score_breakdown"] = {}
            continue
            
        ml = s["revenue_share"] / ds
        acc = max(0, 100 - s["competition_index"])
        cg = max(0, ml * 10)
        
        max_ds = max([x["demand_share"] for x in segment_list if x["segment"] != "Other"] + [1])
        ds_norm = (ds / max_ds) * 100
        ml_norm = min(ml * 50, 100) # Simple scaling
        
        comp_demand = round(ds_norm * 0.35, 1)
        comp_monetization = round(ml_norm * 0.30, 1)
        comp_accessibility = round(acc * 0.20, 1)
        comp_gap = round(cg * 0.15, 1)
        
        score = comp_demand + comp_monetization + comp_accessibility + comp_gap
        s["opportunity_score"] = round(score, 1)
        s["score_breakdown"] = {
            "Demand Strength": comp_demand,
            "Revenue Gap": comp_gap,
            "Monetization Lift": comp_monetization,
            "Competition Adjustment": comp_accessibility
        }

    # Filter out "Other" for Top Cards
    valid_segments = [s for s in segment_list if s["segment"] != "Other"]

    # 1. Largest Demand Segment
    largest_demand = None
    if valid_segments:
        top_seg = max(valid_segments, key=lambda x: x["demand_share"])
        largest_demand = {
            "name": top_seg["segment"],
            "demand_share": top_seg["demand_share"],
            "search_volume": top_seg["total_search_volume"],
            "confidence": confidence_level,
            "business_implication": f"{top_seg['segment']} commands {top_seg['demand_share']}% of the market. High volume provides scale but may face intense competition.",
            "evidence": _create_evidence(
                "Magnet", [sv_col], "MAX(Demand Share)", {"max_share": top_seg["demand_share"]},
                [f"Found highest demand share excluding 'Other': {top_seg['segment']} ({top_seg['demand_share']}%)"],
                top_seg["segment"],
                "This segment represents the primary market interest and largest theoretical ceiling."
            )
        }

    # 2. Highest Revenue Efficiency Segment (Best Monetized)
    best_monetized = None
    best_lift = -999.0
    best_monet_seg = None
    for s in valid_segments:
        if s["demand_share"] <= 0: continue
        lift = s["revenue_share"] / s["demand_share"]
        if lift > best_lift:
            best_lift = lift
            best_monet_seg = s
            
    if best_monet_seg and best_lift > 0:
        best_monetized = {
            "name": best_monet_seg["segment"],
            "lift": round(best_lift, 2),
            "confidence": confidence_level,
            "business_implication": f"{best_monet_seg['segment']} converts demand into revenue {best_lift:.2f}x better than average. Highly efficient for paid acquisition.",
            "evidence": _create_evidence(
                "Magnet", [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                "Revenue Share / Demand Share",
                {"revenue_share": best_monet_seg["revenue_share"], "demand_share": best_monet_seg["demand_share"]},
                [f"{best_monet_seg['revenue_share']}% / {best_monet_seg['demand_share']}% = {best_lift:.2f}"],
                round(best_lift, 2),
                "Segment converts search demand into revenue highly efficiently."
            )
        }

    # 3. Largest Demand-Revenue Gap (Most Undervalued)
    most_undervalued = None
    best_gap = -999.0
    best_gap_seg = None
    for s in valid_segments:
        gap = s["demand_share"] - s["revenue_share"]
        if gap > best_gap:
            best_gap = gap
            best_gap_seg = s
            
    if best_gap_seg and best_gap > 0:
        most_undervalued = {
            "name": best_gap_seg["segment"],
            "gap": round(best_gap, 1),
            "confidence": confidence_level,
            "business_implication": f"{best_gap_seg['segment']} captures {best_gap:.1f}% less revenue than demand implies. Strong potential to seize unmet search intent.",
            "evidence": _create_evidence(
                "Magnet", [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                "Demand Share - Revenue Share",
                {"demand_share": best_gap_seg["demand_share"], "revenue_share": best_gap_seg["revenue_share"]},
                [f"{best_gap_seg['demand_share']}% - {best_gap_seg['revenue_share']}% = {best_gap:.1f}%"],
                round(best_gap, 1),
                "Segment captures less revenue than its search demand implies, revealing underserved buyers."
            )
        }

    # 4. Best Entry Opportunity
    recommended_entry = None
    if valid_segments:
        best_entry_seg = max(valid_segments, key=lambda x: x.get("opportunity_score", 0))
        why_ranked_1 = [
            f"Demand Strength: +{best_entry_seg['score_breakdown']['Demand Strength']}",
            f"Revenue Gap: +{best_entry_seg['score_breakdown']['Revenue Gap']}",
            f"Competition Adjustment: +{best_entry_seg['score_breakdown']['Competition Adjustment']}",
            f"Monetization Lift: +{best_entry_seg['score_breakdown']['Monetization Lift']}",
        ]
        
        recommended_entry = {
            "name": best_entry_seg["segment"],
            "score": best_entry_seg.get("opportunity_score", 0),
            "confidence": confidence_level,
            "why_ranked_1": why_ranked_1,
            "business_implication": f"{best_entry_seg['segment']} offers the best risk/reward balance (Score: {best_entry_seg.get('opportunity_score', 0)}/100). Prime target for new product launches.",
            "evidence": _create_evidence(
                "Magnet", [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                "Weighted sum of components",
                {"segment": best_entry_seg["segment"]},
                why_ranked_1 + [f"Total Composite Score: {best_entry_seg.get('opportunity_score', 0)}"],
                best_entry_seg.get("opportunity_score", 0),
                "Optimum entry point balancing demand, lower competition, and monetization potential."
            )
        }

    # Executive Market Summary
    exec_summary = f"Classification confidence is {confidence_level} ({quality_score:.1f}%). "
    if largest_demand:
        exec_summary += f"The largest demand segment is {largest_demand['name']}. "
    if best_monetized:
        exec_summary += f"{best_monetized['name']} converts most efficiently. "
    if recommended_entry:
        exec_summary += f"The overall best entry opportunity is {recommended_entry['name']}."

    # Format Opportunity Database
    opp_db = []
    for s in segment_list:
        score = s.get("opportunity_score", 0)
        if s["segment"] == "Other":
            rec = "N/A"
            diff = "N/A"
        else:
            diff = "High" if s["competition_index"] >= 50 else "Moderate" if s["competition_index"] >= 20 else "Low"
            # Replace Avoid labels
            if score >= 70:
                rec = "Prime Entry"
            elif score >= 50:
                rec = "Strong Opportunity"
            elif score >= 30:
                rec = "Monitor"
            else:
                rec = "Low Priority"
            
        opp_db.append({
            "segment": s["segment"],
            "demand_share": s["demand_share"],
            "revenue_share": s["revenue_share"],
            "total_search_volume": s["total_search_volume"],
            "demand_revenue_gap": s["demand_revenue_gap"],
            "competition_index": s["competition_index"],
            "entry_difficulty": diff,
            "opportunity_score": score,
            "score_breakdown": s.get("score_breakdown", {}),
            "recommendation": rec,
            "evidence": _create_evidence(
                "Magnet", [sv_col], "Aggregation of matching keywords",
                {"keyword_count": s["keyword_count"]},
                [
                    f"Aggregated {s['keyword_count']} keywords matching {s['formula']}",
                    f"Demand Strength: +{s.get('score_breakdown', {}).get('Demand Strength', 0)}",
                    f"Revenue Gap: +{s.get('score_breakdown', {}).get('Revenue Gap', 0)}",
                    f"Competition Adjustment: +{s.get('score_breakdown', {}).get('Competition Adjustment', 0)}",
                    f"Monetization Lift: +{s.get('score_breakdown', {}).get('Monetization Lift', 0)}"
                ] if s["segment"] != "Other" else [f"Aggregated {s['keyword_count']} keywords matching {s['formula']}"],
                score,
                "Composite score analysis."
            )
        })
        
    opp_db.sort(key=lambda x: x["opportunity_score"], reverse=True)

    # Classification Quality Warning & Diagnostics
    is_degraded = True if quality_score < 75.0 else False

    classification_diagnostics = {
        "total_clusters": len(segment_list),
        "other_share_pct": round(other_pct, 1),
        "quality_score": round(quality_score, 1),
        "confidence_level": confidence_level,
        "minimum_threshold": 75.0,
        "is_degraded": is_degraded,
        "failure_reason": "Excessive Other bucket" if is_degraded else None
    }

    # Output structure
    output = {
        "status": "success",
        "results": {
            "total_search_volume": int(total_market_sv),
            "total_keyword_sales": int(total_market_ks),
            "classification_diagnostics": classification_diagnostics,
            "executive_summary": exec_summary,
            "concentration_score": {
                "value": hhi_score,
                "evidence": concentration_evidence
            },
            "largest_demand_segment": largest_demand,
            "recommended_entry": recommended_entry,
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

def run(magnet_df, blackbox_df=None, top_n=10, keyword_classification_df=None):
    try:
        return _run_internal(magnet_df, blackbox_df, top_n, keyword_classification_df)
    except Exception as e:
        import traceback
        logger.error(f"Engine failed: {e}")
        logger.error(traceback.format_exc())
        return {
            "status": "error",
            "message": f"Demand Intelligence could not be generated due to an internal processing error: {e}"
        }
