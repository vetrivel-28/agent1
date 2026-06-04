"""
Demand Strength Engine — dataset-derived demand intelligence.
All metrics trace to active uploaded Magnet / Keyword Classification datasets.
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
from app.utils.demand_classification import (
    apply_enhanced_classification,
    build_unclassified_keyword_table,
    compute_row_confidence,
    find_near_duplicate_themes,
    group_unclassified_keywords,
    is_generic_theme,
    normalize_theme_display,
    qualification_label,
)
from app.services.dataset_registry import registry


logger = get_logger("demand_engine")

_SEARCH_VOL_CANDIDATES = ["monthly_search_volume", "Monthly Search Volume", "Search Volume", "search volume", "SearchVolume"]
_KW_SALES_CANDIDATES = ["Keyword Sales", "keyword sales", "KeywordSales"]
_KEYWORD_CANDIDATES = ["Keyword Phrase", "keyword phrase", "Keyword", "keyword"]
_CLASS_CANDIDATES = ["Classification", "classification", "Category", "category", "Theme", "theme"]

UNDervalued_GAP_THRESHOLD = 2.0
MIN_THEME_CONFIDENCE_HIGH = 80.0
MIN_THEME_CONFIDENCE_MEDIUM = 50.0


def _dataset_session_id() -> str:
    meta = registry.get_meta()
    parts = []
    for key in ("magnet", "keyword_classification", "blackbox"):
        ts = meta.get(key, {}).get("timestamp")
        rows = meta.get(key, {}).get("rows", 0)
        if ts:
            parts.append(f"{key}:{rows}@{ts}")
    return "|".join(parts) if parts else "no-session"


def _create_evidence(
    source_dataset: str,
    source_columns: List[str],
    formula: str,
    source_values: Dict[str, Any],
    calculation_steps: List[str],
    final_value: Any,
    interpretation: str,
    rows_included: int = 0,
    rows_excluded: int = 0,
    missing_fields: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "source_dataset": source_dataset,
        "source_columns": source_columns,
        "formula": formula,
        "source_values": source_values,
        "rows_included": rows_included,
        "rows_excluded": rows_excluded,
        "missing_fields": missing_fields or [],
        "calculation_steps": calculation_steps,
        "final_value": final_value,
        "interpretation": interpretation,
    }


def _calculate_confidence(required_fields_found: int, required_fields_total: int) -> float:
    if required_fields_total <= 0:
        return 0.0
    return round((required_fields_found / required_fields_total) * 100.0, 1)


def _confidence_level_from_pct(pct: float) -> str:
    if pct >= MIN_THEME_CONFIDENCE_HIGH:
        return "High"
    if pct >= MIN_THEME_CONFIDENCE_MEDIUM:
        return "Medium"
    return "Low"


def _normalize_demand_revenue_label(demand_share: float, revenue_share: float) -> Tuple[str, float]:
    gap = demand_share - revenue_share
    if gap > 0:
        return "Revenue Gap", round(gap, 2)
    premium = revenue_share - demand_share
    return "Revenue Premium", round(premium, 2)


def _extract_segments(
    magnet_df: pd.DataFrame,
    sv_col: str,
    kw_sales_col: Optional[str],
    kw_col: str,
    kc_df: Optional[pd.DataFrame] = None,
) -> Tuple[List[Dict[str, Any]], str, Dict[str, Any]]:
    total_raw_rows = len(magnet_df)
    tmp_full = magnet_df[[kw_col]].copy()
    
    # Calculate excluded rows for evidence popup
    sv_raw = magnet_df[sv_col]
    missing_mask = sv_raw.isna()
    missing_count = missing_mask.sum()
    
    sv_c, _ = clean_numeric_series(magnet_df[sv_col], sv_col)
    non_numeric_mask = (~missing_mask) & (sv_c.isna())
    non_numeric_count = non_numeric_mask.sum()
    
    tmp_full["_sv"] = sv_c
    tmp = tmp_full.dropna(subset=["_sv"]).copy()
    tmp = tmp[tmp["_sv"] > 0]
    valid_count = len(tmp)


    if kw_sales_col:
        ks_c, _ = clean_numeric_series(magnet_df.loc[tmp.index, kw_sales_col], kw_sales_col)
        tmp["_ks"] = ks_c.fillna(0)
    else:
        tmp["_ks"] = 0.0

    tmp["_kw_clean"] = tmp[kw_col].astype(str).str.lower().str.strip()

    tmp_agg = tmp.groupby("_kw_clean").agg(
        _sv=("_sv", "sum"),
        _ks=("_ks", "sum"),
        kw_original=(kw_col, "first"),
    ).reset_index()

    total_heatmap_sv = float(tmp_agg["_sv"].sum())
    total_heatmap_ks = float(tmp_agg["_ks"].sum())
    total_kw_count = len(tmp_agg)

    if total_heatmap_sv <= 0 or len(tmp_agg) == 0:
        return [], "empty", {"total_keyword_count": 0, "total_search_volume": 0}

    keywords_list = tmp_agg["kw_original"].tolist()
    sv_list = tmp_agg["_sv"].tolist()

    method = "dynamic_extraction"
    classification_type = "Derived From Keyword Text"
    original_assignments: List[str] = []
    enhanced_applied = False

    if kc_df is not None and not kc_df.empty:
        class_col = find_column(kc_df, _CLASS_CANDIDATES)
        kc_kw_col = find_column(kc_df, _KEYWORD_CANDIDATES)
        if class_col and kc_kw_col:
            method = "keyword_classification_dataset"
            classification_type = "Original Classification"
            kc_map = dict(
                zip(
                    kc_df[kc_kw_col].astype(str).str.lower().str.strip(),
                    kc_df[class_col].astype(str).str.strip(),
                )
            )
            original_assignments = [
                kc_map.get(k.lower().strip()) or "Other"
                for k in keywords_list
            ]

    if not original_assignments:
        h_themes, h_roots = extract_hierarchical_themes(keywords_list, sv_list, num_themes=10)
        h_assigned = assign_themes(keywords_list, h_themes, h_roots)
        total_sv = sum(sv_list)
        other_sv = sum(sv for a, sv in zip(h_assigned, sv_list) if a == "Other")
        if total_sv > 0 and (other_sv / total_sv) > 0.75:
            logger.info(
                "Hierarchical extraction high Other (%.1f%%). Falling back to loose N-Gram.",
                other_sv / total_sv * 100,
            )
            l_themes = extract_dynamic_themes(keywords_list, sv_list, num_themes=12)
            original_assignments = assign_themes(keywords_list, l_themes)
        else:
            original_assignments = h_assigned

    seed_kw = keywords_list[0] if keywords_list else None
    existing_theme_names = list(
        {normalize_theme_display(a) for a in original_assignments if a != "Other"}
    )
    final_assignments, new_themes, enhanced_applied = apply_enhanced_classification(
        original_assignments,
        keywords_list,
        sv_list,
        existing_theme_names,
        seed_keyword=seed_kw,
    )

    if enhanced_applied:
        method_note = f"{method}+enhanced_phrase_grouping"
    else:
        method_note = method

    def _classified_sv(assignments: List[str]) -> float:
        return sum(sv for a, sv in zip(assignments, sv_list) if a != "Other")

    def _classified_kw_count(assignments: List[str]) -> int:
        return sum(1 for a in assignments if a != "Other")

    original_classified_sv = _classified_sv(original_assignments)
    enhanced_classified_sv = _classified_sv(final_assignments)

    original_coverage = round((original_classified_sv / total_heatmap_sv) * 100, 1) if total_heatmap_sv else 0
    enhanced_coverage = round((enhanced_classified_sv / total_heatmap_sv) * 100, 1) if total_heatmap_sv else 0
    unclassified_pct = round(100 - enhanced_coverage, 1)

    tmp_agg["_segment_orig"] = original_assignments
    tmp_agg["_segment"] = final_assignments

    def _seg_source(orig: str, final: str) -> str:
        if orig != "Other" and orig == final:
            return "Original Classification"
        if orig == "Other" and final != "Other":
            return "Derived From Keyword Text"
        if orig != "Other":
            return "Original Classification"
        return "Unclassified"

    tmp_agg["_classification_source"] = [
        _seg_source(o, f) for o, f in zip(original_assignments, final_assignments)
    ]

    tmp_exploded = tmp_agg.copy()
    tmp_exploded["_final_seg"] = tmp_exploded["_segment"]

    final_agg = tmp_exploded.groupby("_final_seg").agg(
        total_sv=("_sv", "sum"),
        total_ks=("_ks", "sum"),
        kw_count=("_final_seg", "count"),
        classification_source=("_classification_source", lambda x: (
            "Derived From Keyword Text"
            if (x == "Derived From Keyword Text").any() and not (x == "Original Classification").all()
            else ("Original Classification" if (x == "Original Classification").any() else "Mixed")
        )),
    ).reset_index()

    segment_list = []
    for _, row in final_agg.iterrows():
        seg = str(row["_final_seg"])
        sv = float(row["total_sv"])
        ks = float(row["total_ks"])
        count = int(row["kw_count"])
        src = str(row["classification_source"])

        group = tmp_exploded[tmp_exploded["_final_seg"] == seg].sort_values("_sv", ascending=False)
        seg_keywords = []
        for _, krow in group.iterrows():
            k_contrib = (float(krow["_sv"]) / sv * 100.0) if sv > 0 else 0.0
            seg_keywords.append({
                "keyword": str(krow["kw_original"]),
                "search_volume": int(krow["_sv"]),
                "contribution_pct": round(k_contrib, 2),
                "classification_source": str(krow["_classification_source"]),
            })

        demand_share = round((sv / total_heatmap_sv) * 100.0, 2)
        revenue_share = round((ks / total_heatmap_ks) * 100.0, 2) if total_heatmap_ks > 0 else 0.0
        comp_index = round(count / max(demand_share, 0.01), 2)
        gap_label, gap_val = _normalize_demand_revenue_label(demand_share, revenue_share)

        derived_confidence = 100.0 if src == "Original Classification" else min(
            95.0,
            round(50 + (count / max(total_kw_count, 1)) * 200 + demand_share * 0.5, 1),
        )

        segment_list.append({
            "segment": seg,
            "demand_share": demand_share,
            "keyword_count": count,
            "revenue_share": revenue_share,
            "total_search_volume": int(sv),
            "demand_revenue_gap": gap_val if gap_label == "Revenue Gap" else -gap_val,
            "revenue_gap_label": gap_label,
            "revenue_gap_value": gap_val,
            "competition_index": comp_index,
            "keywords": seg_keywords,
            "classification_source": src,
            "derived_confidence": derived_confidence,
            "formula": (
                "Derived from Keyword Classification Dataset"
                if method == "keyword_classification_dataset" and src == "Original Classification"
                else f"Deterministic phrase grouping — theme '{seg}'"
            ),
        })

    segment_list.sort(key=lambda x: x["demand_share"], reverse=True)

    unclassified_items = []
    for _, krow in tmp_exploded[tmp_exploded["_final_seg"] == "Other"].iterrows():
        reason = "No theme/classification value"
        if krow["_segment_orig"] != "Other":
            reason = "Low confidence match"
        elif not str(krow["kw_original"]).strip():
            reason = "Missing keyword text"
        unclassified_items.append({
            "keyword": str(krow["kw_original"]),
            "search_volume": int(krow["_sv"]),
            "reason_unclassified": reason,
            "suggested_action": "Add classification or review phrase rules",
        })

    unclassified_groups = group_unclassified_keywords(
        unclassified_items, total_heatmap_sv, seed_keyword=seed_kw, max_groups=10,
    )
    for g in unclassified_groups:
        phrase = g["suggested_theme"].lower()
        for item in unclassified_items:
            if phrase in item["keyword"].lower():
                item["suggested_theme"] = g["suggested_theme"]

    diagnostics_meta = {
        "total_raw_rows": total_raw_rows,
        "valid_sv_count": valid_count,
        "missing_sv_count": int(missing_count),
        "non_numeric_sv_count": int(non_numeric_count),
        "total_keyword_count": total_kw_count,
        "total_search_volume": int(total_heatmap_sv),
        "total_keyword_sales": int(total_heatmap_ks),
        "classified_keyword_count": _classified_kw_count(final_assignments),
        "classified_search_volume": int(enhanced_classified_sv),
        "classified_demand_pct": enhanced_coverage,
        "unclassified_keyword_count": total_kw_count - _classified_kw_count(final_assignments),
        "unclassified_search_volume": int(total_heatmap_sv - enhanced_classified_sv),
        "unclassified_demand_pct": unclassified_pct,
        "theme_extraction_confidence": enhanced_coverage,
        "original_classification_coverage": original_coverage,
        "enhanced_classification_coverage": enhanced_coverage,
        "enhanced_classification_applied": enhanced_applied,
        "enhanced_classification_note": (
            "Enhanced classification was applied using deterministic keyword phrase grouping."
            if enhanced_applied
            else (
                "Enhanced classification did not improve coverage beyond original assignment."
                if method == "keyword_classification_dataset"
                else "Fallback phrase grouping was already applied during initial extraction."
            )
        ),
        "classification_method": method_note,
        "unclassified_keywords": unclassified_items,
        "top_unclassified_groups": unclassified_groups,
        "top_unclassified_keywords_table": build_unclassified_keyword_table(unclassified_items, 10),
        "suggested_theme_repairs": [
            {
                "suggested_theme": g["suggested_theme"],
                "matched_search_volume": g["total_search_volume"],
                "keyword_count": g["keyword_count"],
                "top_keywords": g["top_keywords"],
                "reason_suggested": g["reason_suggested"],
                "source_dataset": "Magnet",
                "derived_confidence": g["derived_confidence"],
                "suggested_action": g["suggested_action"],
            }
            for g in unclassified_groups[:10]
        ],
        "possible_duplicate_themes": find_near_duplicate_themes(
            [s["segment"] for s in segment_list if s["segment"] != "Other"]
        ),
    }

    return segment_list, method_note, diagnostics_meta


def _compute_opportunity_score(s: Dict[str, Any], max_ds: float) -> Tuple[float, Dict[str, float], Dict[str, str]]:
    ds = s["demand_share"]
    if ds <= 0:
        return 0.0, {}, {}

    ml = s["revenue_share"] / ds if ds > 0 else 0
    acc = max(0, min(100, 100 - s["competition_index"]))
    gap_label = s.get("revenue_gap_label", "Revenue Gap")
    gap_val = s.get("revenue_gap_value", 0)

    ds_norm = (ds / max(max_ds, 0.01)) * 100
    ml_norm = min(ml * 50, 100)

    if gap_label == "Revenue Gap":
        gap_component = max(0, gap_val * 10)
    else:
        gap_component = max(0, (100 - min(gap_val * 10, 100)) * 0.5)

    comp_demand = round(ds_norm * 0.35, 1)
    comp_monetization = round(ml_norm * 0.30, 1)
    comp_accessibility = round(acc * 0.20, 1)
    comp_gap = round(gap_component * 0.15, 1)
    score = round(comp_demand + comp_monetization + comp_accessibility + comp_gap, 1)

    breakdown = {
        "Demand Strength": comp_demand,
        gap_label: comp_gap,
        "Monetization Lift": comp_monetization,
        "Competition Adjustment": comp_accessibility,
    }
    formulas = {
        "Demand Strength": "Norm(Demand Share) × 0.35",
        gap_label: f"{gap_label} component × 0.15",
        "Competition Adjustment": "Max(0, 100 - Competition Index) × 0.20",
        "Monetization Lift": "Min(100, (Rev Share / Demand Share) × 50) × 0.30",
        "Opportunity Score": "Sum of weighted components",
    }
    return score, breakdown, formulas


def _best_entry_score(
    s: Dict[str, Any],
    max_ds: float,
    max_rs: float,
    row_confidence: float,
) -> float:
    opp = s.get("opportunity_score", 0)
    ds = s["demand_share"]
    rs = s["revenue_share"]
    comp_adv = max(0, min(100, 100 - s["competition_index"]))
    ds_score = (ds / max(max_ds, 0.01)) * 100
    rs_score = (rs / max(max_rs, 0.01)) * 100 if max_rs > 0 else 0
    return round(
        0.35 * opp + 0.20 * rs_score + 0.20 * comp_adv + 0.15 * ds_score + 0.10 * row_confidence,
        2,
    )


def _kpi_confidence(fields: Dict[str, Any], required: List[str]) -> Tuple[float, List[str]]:
    missing = []
    found = 0
    for f in required:
        val = fields.get(f)
        ok = val is not None and val != "" and val != "N/A"
        if isinstance(val, (int, float)) and f not in ("keyword_count",) and val == 0:
            ok = False
        if isinstance(val, list) and len(val) == 0 and f == "top_keywords":
            ok = False
        if ok:
            found += 1
        else:
            missing.append(f)
    total = len(required)
    pct = _calculate_confidence(found, total)
    return pct, missing


def _run_internal(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
    keyword_classification_df: Optional[pd.DataFrame] = None,
) -> Dict[str, Any]:
    t0 = time.time()
    session_id = _dataset_session_id()

    if magnet_df is None or magnet_df.empty:
        return {"status": "error", "message": "Magnet DataFrame is empty or missing."}

    sv_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    kw_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    kw_sales_col = find_column(magnet_df, _KW_SALES_CANDIDATES)

    missing_columns = []
    if not sv_col:
        missing_columns.append("search_volume")
    if not kw_col:
        missing_columns.append("keyword")

    if not sv_col or not kw_col:
        return {
            "status": "error",
            "message": "Theme classification cannot be calculated because keyword/theme fields are unavailable.",
            "missing_columns": missing_columns,
        }

    segment_list, method, diag_meta = _extract_segments(
        magnet_df, sv_col, kw_sales_col, kw_col, keyword_classification_df,
    )

    if not segment_list:
        return {
            "status": "error",
            "message": "No validated theme opportunities available. Upload complete Keyword datasets to generate scoring.",
        }

    has_revenue = kw_sales_col is not None and diag_meta.get("total_keyword_sales", 0) > 0
    total_market_sv = diag_meta["total_search_volume"]
    total_market_ks = diag_meta.get("total_keyword_sales", 0)

    theme_confidence = diag_meta["theme_extraction_confidence"]
    confidence_level = _confidence_level_from_pct(theme_confidence)
    is_degraded = theme_confidence < MIN_THEME_CONFIDENCE_HIGH
    show_warning = theme_confidence < MIN_THEME_CONFIDENCE_MEDIUM

    other_seg = next((s for s in segment_list if s["segment"] == "Other"), None)
    other_pct = other_seg["demand_share"] if other_seg else diag_meta["unclassified_demand_pct"]

    if show_warning:
        warning_message = (
            f"{diag_meta['unclassified_demand_pct']:.1f}% of search demand is currently unclassified. "
            "Review the top unclassified keyword groups below to improve theme coverage."
        )
    elif confidence_level == "Medium":
        warning_message = "Theme classification is moderate. Some demand remains unassigned."
    else:
        warning_message = None

    if diag_meta.get("enhanced_classification_applied"):
        orig = diag_meta["original_classification_coverage"]
        enh = diag_meta["enhanced_classification_coverage"]
        rem = diag_meta["unclassified_demand_pct"]
        enhanced_note = (
            f"Original classification covered {orig:.1f}% of demand. "
            f"Deterministic phrase grouping increased coverage to {enh:.1f}%. "
            f"Remaining unclassified demand: {rem:.1f}%."
        )
    else:
        enhanced_note = diag_meta.get("enhanced_classification_note", "")

    max_ds = max([x["demand_share"] for x in segment_list if x["segment"] != "Other"] + [1])
    max_rs = max([x["revenue_share"] for x in segment_list if x["segment"] != "Other"] + [1])

    for s in segment_list:
        if s["segment"] == "Other":
            s["opportunity_score"] = 0.0
            s["reliable_opportunity_score"] = 0.0
            s["row_confidence"] = 0.0
            s["score_breakdown"] = {}
            s["formula_breakdown"] = {}
            continue
        score, breakdown, formulas = _compute_opportunity_score(s, max_ds)
        s["opportunity_score"] = score
        s["score_breakdown"] = breakdown
        s["formula_breakdown"] = formulas
        s["row_confidence"] = compute_row_confidence(s, has_revenue)
        s["reliable_opportunity_score"] = round(score * (s["row_confidence"] / 100), 1)

    valid_segments = [s for s in segment_list if s["segment"] != "Other"]

    # HHI concentration
    hhi_score = 0.0
    hhi_steps = []
    for s in segment_list:
        dec = s["demand_share"] / 100.0
        sq = dec * dec
        hhi_score += sq
        hhi_steps.append(f"{s['segment']}: ({dec:.3f})^2 = {sq:.4f}")
    hhi_score = min(round(hhi_score * 100.0, 2), 100.0)

    # Largest Demand Segment
    largest_demand = None
    if valid_segments:
        top_seg = max(valid_segments, key=lambda x: x["demand_share"])
        req = ["segment", "total_search_volume", "demand_share", "keyword_count", "keywords"]
        fields = {
            "segment": top_seg["segment"],
            "total_search_volume": top_seg["total_search_volume"],
            "demand_share": top_seg["demand_share"],
            "keyword_count": top_seg["keyword_count"],
            "keywords": top_seg["keywords"],
        }
        kpi_conf, missing = _kpi_confidence(fields, req)
        
        # Validation checks
        sum_themes_sv = sum(s["total_search_volume"] for s in valid_segments)
        unclassified_sv = diag_meta["unclassified_search_volume"]
        validation_sum = sum_themes_sv + unclassified_sv
        
        print("Total Search Volume from dataset =", total_market_sv)
        print("Generic Search Volume from dataset =", next((s["total_search_volume"] for s in segment_list if s["segment"].lower() == "generic"), 0))
        print("Generic row count =", next((s["keyword_count"] for s in segment_list if s["segment"].lower() == "generic"), 0))
        print("Rows used (valid SV rows) =", diag_meta.get("valid_sv_count", diag_meta["total_keyword_count"]))
        print("Rows excluded (missing+non-numeric) =", diag_meta.get("missing_sv_count", 0) + diag_meta.get("non_numeric_sv_count", 0))
        
        if validation_sum != total_market_sv:
            print(f"WARNING: Validation check failed! Sum of themes ({sum_themes_sv}) + unclassified ({unclassified_sv}) = {validation_sum}, but total market SV = {total_market_sv}.")
            
        largest_demand = {
            "name": top_seg["segment"],
            "demand_share": top_seg["demand_share"],
            "search_volume": top_seg["total_search_volume"],
            "confidence": kpi_conf,
            "confidence_level": _confidence_level_from_pct(kpi_conf),
            "business_implication": (
                f"{top_seg['segment']} commands {top_seg['demand_share']}% of search demand — "
                "the largest addressable segment in the active dataset."
            ),
            "subtitle": (
                f"Represents {top_seg['demand_share']}% of total search volume "
                f"({top_seg['total_search_volume']:,} searches across {top_seg['keyword_count']} keywords)."
            ),
            "evidence": _create_evidence(
                "Magnet",
                [sv_col, kw_col],
                "Demand Share = Theme Search Volume / Total Search Volume × 100",
                {
                    "theme_search_volume": top_seg["total_search_volume"],
                    "total_search_volume": total_market_sv,
                    "keyword_count": top_seg["keyword_count"],
                    "total_keyword_count": diag_meta["total_keyword_count"],
                    "themes_compared": len(valid_segments),
                    "dataset_session_id": session_id,
                    "total_raw_rows": diag_meta.get("total_raw_rows", 0),
                    "valid_sv_count": diag_meta.get("valid_sv_count", 0),
                    "missing_sv_count": diag_meta.get("missing_sv_count", 0),
                    "non_numeric_sv_count": diag_meta.get("non_numeric_sv_count", 0)
                },
                [
                    f"1. Total dataset rows: {diag_meta.get('total_raw_rows', 0):,}",
                    f"2. Excluded rows (missing search volume): {diag_meta.get('missing_sv_count', 0):,}",
                    f"3. Excluded rows (non-numeric): {diag_meta.get('non_numeric_sv_count', 0):,}",
                    f"4. Valid rows included: {diag_meta.get('valid_sv_count', 0):,}",
                    f"Total SV Formula: SUM(Search Volume) across {diag_meta.get('valid_sv_count', 0):,} valid rows",
                    f"Total SV: {total_market_sv:,}",
                    f"Theme SV Formula: SUM(Search Volume) where Theme = '{top_seg['segment']}'",
                    f"Theme SV: {top_seg['total_search_volume']:,} from {top_seg['keyword_count']:,} keywords",
                    f"Final Calculation: {top_seg['total_search_volume']:,} / {total_market_sv:,} × 100 = {top_seg['demand_share']}%",
                    f"Validation: Sum of all themes + unclassified = {validation_sum:,} == Total SV ({total_market_sv:,})"
                ],
                top_seg["segment"],
                "Primary demand driver from active Magnet keyword dataset. Calculated directly from raw exact search volumes to prevent double counting.",
                rows_included=top_seg["keyword_count"],
                missing_fields=missing,
            ),
            "top_keywords": top_seg["keywords"][:20],
        }

    # Highest Efficiency
    best_monetized = None
    if has_revenue and valid_segments:
        best_monet_seg = None
        best_lift = -999.0
        for s in valid_segments:
            if s["demand_share"] <= 0:
                continue
            lift = s["revenue_share"] / s["demand_share"]
            if lift > best_lift:
                best_lift = lift
                best_monet_seg = s
        if best_monet_seg and best_lift > 0:
            req = ["segment", "demand_share", "revenue_share", "keywords"]
            fields = {**{k: best_monet_seg[k] for k in ("segment", "demand_share", "revenue_share")}, "keywords": best_monet_seg["keywords"]}
            if total_market_ks:
                fields["total_revenue"] = total_market_ks
                fields["theme_revenue"] = int(best_monet_seg["revenue_share"] / 100 * total_market_ks)
            kpi_conf, missing = _kpi_confidence(fields, req + (["total_revenue"] if has_revenue else []))
            best_monetized = {
                "name": best_monet_seg["segment"],
                "lift": round(best_lift, 2),
                "confidence": kpi_conf,
                "confidence_level": _confidence_level_from_pct(kpi_conf),
                "business_implication": (
                    f"{best_monet_seg['segment']} converts search demand into revenue "
                    f"{best_lift:.2f}× more efficiently than average — strong monetization vs demand share."
                ),
                "subtitle": (
                    f"Revenue efficiency ratio {best_lift:.2f}× "
                    f"(revenue share {best_monet_seg['revenue_share']}% vs demand share {best_monet_seg['demand_share']}%)."
                ),
                "evidence": _create_evidence(
                    "Magnet",
                    [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                    "Revenue Efficiency = Revenue Share / Demand Share",
                    {
                        "revenue_share": best_monet_seg["revenue_share"],
                        "demand_share": best_monet_seg["demand_share"],
                        "efficiency_ratio": round(best_lift, 2),
                        "dataset_session_id": session_id,
                    },
                    [
                        f"Revenue Share = {best_monet_seg['revenue_share']}%",
                        f"Demand Share = {best_monet_seg['demand_share']}%",
                        f"Efficiency = {best_monet_seg['revenue_share']}/{best_monet_seg['demand_share']} = {best_lift:.2f}",
                    ],
                    round(best_lift, 2),
                    "Highest revenue capture relative to search demand.",
                    rows_included=best_monet_seg["keyword_count"],
                    missing_fields=missing,
                ),
                "top_keywords": best_monet_seg["keywords"][:10],
            }

    # Undervalued theme
    most_undervalued = None
    undervalued_candidates = []
    for s in valid_segments:
        gap = s["demand_share"] - s["revenue_share"]
        if gap > UNDervalued_GAP_THRESHOLD:
            undervalued_candidates.append({**s, "gap": round(gap, 1)})
    undervalued_candidates.sort(key=lambda x: x["gap"], reverse=True)

    if undervalued_candidates:
        best_gap_seg = undervalued_candidates[0]
        req = ["segment", "demand_share", "revenue_share", "gap", "keyword_count"]
        fields = {
            "segment": best_gap_seg["segment"],
            "demand_share": best_gap_seg["demand_share"],
            "revenue_share": best_gap_seg["revenue_share"],
            "gap": best_gap_seg["gap"],
            "keyword_count": best_gap_seg["keyword_count"],
        }
        kpi_conf, missing = _kpi_confidence(fields, req)
        most_undervalued = {
            "name": best_gap_seg["segment"],
            "gap": best_gap_seg["gap"],
            "confidence": kpi_conf,
            "confidence_level": _confidence_level_from_pct(kpi_conf),
            "business_implication": (
                f"{best_gap_seg['segment']} has demand share {best_gap_seg['demand_share']}% but revenue share "
                f"{best_gap_seg['revenue_share']}% — a {best_gap_seg['gap']:.1f} pt under-monetization gap."
            ),
            "subtitle": (
                f"Revenue gap of {best_gap_seg['gap']:.1f} pts "
                f"(threshold: {UNDervalued_GAP_THRESHOLD} pts above revenue share)."
            ),
            "evidence": _create_evidence(
                "Magnet",
                [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                "Revenue Gap = Demand Share - Revenue Share",
                {
                    "demand_share": best_gap_seg["demand_share"],
                    "revenue_share": best_gap_seg["revenue_share"],
                    "gap": best_gap_seg["gap"],
                    "minimum_gap_threshold": UNDervalued_GAP_THRESHOLD,
                    "themes_checked": len(valid_segments),
                    "themes_passing_threshold": len(undervalued_candidates),
                    "candidate_themes": [
                        {"segment": c["segment"], "gap": c["gap"]} for c in undervalued_candidates[:5]
                    ],
                    "dataset_session_id": session_id,
                },
                [
                    f"Demand Share - Revenue Share = {best_gap_seg['demand_share']} - {best_gap_seg['revenue_share']} = {best_gap_seg['gap']}",
                    f"Threshold applied: > {UNDervalued_GAP_THRESHOLD} pts",
                ],
                best_gap_seg["gap"],
                "Theme captures less revenue than search demand implies.",
                rows_included=best_gap_seg["keyword_count"],
                missing_fields=missing,
            ),
        }
    else:
        req = ["themes_checked"]
        kpi_conf, missing = _kpi_confidence({"themes_checked": len(valid_segments)}, req)
        undervalued_empty_msg = (
            f"Checked {len(valid_segments)} themes; none exceeded "
            f"{UNDervalued_GAP_THRESHOLD} pt demand-over-revenue gap threshold."
        )
        most_undervalued = {
            "empty_state": True,
            "name": None,
            "title": "No undervalued theme detected",
            "subtitle": (
                "No theme currently has demand share meaningfully above revenue share "
                "based on available data."
            ),
            "gap": None,
            "confidence": kpi_conf,
            "confidence_level": _confidence_level_from_pct(kpi_conf),
            "minimum_gap_threshold": UNDervalued_GAP_THRESHOLD,
            "themes_checked": len(valid_segments),
            "themes_passing_threshold": 0,
            "business_implication": undervalued_empty_msg,
            "evidence": _create_evidence(
                "Magnet",
                [sv_col],
                "Revenue Gap = Demand Share - Revenue Share; threshold > 2 pts",
                {
                    "minimum_gap_threshold": UNDervalued_GAP_THRESHOLD,
                    "themes_checked": len(valid_segments),
                    "themes_passing_threshold": 0,
                    "dataset_session_id": session_id,
                },
                [f"No theme passed gap threshold of {UNDervalued_GAP_THRESHOLD} pts"],
                "No undervalued theme",
                undervalued_empty_msg,
                rows_included=diag_meta["total_keyword_count"],
                missing_fields=missing,
            ),
        }

    # Best Entry — balanced score
    recommended_entry = None
    entry_candidates = []
    excluded_count = 0
    for s in valid_segments:
        if s.get("row_confidence", 0) < 20:
            excluded_count += 1
            continue
        bes = _best_entry_score(s, max_ds, max_rs, s.get("row_confidence", 0))
        s["best_entry_score"] = bes
        entry_candidates.append(s)

    if entry_candidates:
        entry_candidates.sort(key=lambda x: x.get("best_entry_score", 0), reverse=True)
        best_entry_seg = entry_candidates[0]
        rec_base = (
            "Prime Entry" if best_entry_seg["opportunity_score"] >= 70
            else "Strong Opportunity" if best_entry_seg["opportunity_score"] >= 50
            else "Monitor" if best_entry_seg["opportunity_score"] >= 30
            else "Low Priority"
        )
        rec = qualification_label(rec_base, best_entry_seg.get("row_confidence", 0))
        req = [
            "opportunity_score", "demand_share", "revenue_share",
            "competition_index", "row_confidence", "candidates",
        ]
        kpi_conf, missing = _kpi_confidence(
            {
                "opportunity_score": best_entry_seg["opportunity_score"],
                "demand_share": best_entry_seg["demand_share"],
                "revenue_share": best_entry_seg["revenue_share"],
                "competition_index": best_entry_seg["competition_index"],
                "row_confidence": best_entry_seg["row_confidence"],
                "candidates": entry_candidates,
            },
            req,
        )
        comp_adv = max(0, min(100, 100 - best_entry_seg["competition_index"]))
        recommended_entry = {
            "name": best_entry_seg["segment"],
            "score": best_entry_seg.get("best_entry_score", 0),
            "opportunity_score": best_entry_seg["opportunity_score"],
            "confidence": kpi_conf,
            "confidence_level": _confidence_level_from_pct(kpi_conf),
            "recommendation": rec,
            "business_implication": (
                f"{best_entry_seg['segment']} offers the best balanced entry profile "
                f"(Best Entry Score {best_entry_seg.get('best_entry_score', 0):.1f}) — "
                "combines opportunity, competition advantage, and monetization."
            ),
            "subtitle": (
                "Selected using balanced entry scoring (not raw opportunity score alone) "
                "to avoid highly competitive themes."
            ),
            "why_selected": (
                f"Highest Best Entry Score among {len(entry_candidates)} evaluated themes "
                f"({excluded_count} excluded for low confidence)."
            ),
            "candidate_ranking": [
                {
                    "segment": c["segment"],
                    "best_entry_score": c.get("best_entry_score", 0),
                    "opportunity_score": c["opportunity_score"],
                    "competition_index": c["competition_index"],
                }
                for c in entry_candidates[:5]
            ],
            "evidence": _create_evidence(
                "Magnet",
                [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                (
                    "Best Entry Score = 0.35×Opportunity + 0.20×Revenue Share Score "
                    "+ 0.20×Competition Advantage + 0.15×Demand Share Score + 0.10×Confidence"
                ),
                {
                    "opportunity_score": best_entry_seg["opportunity_score"],
                    "revenue_share_score": round((best_entry_seg["revenue_share"] / max(max_rs, 0.01)) * 100, 1),
                    "competition_advantage": comp_adv,
                    "demand_share_score": round((best_entry_seg["demand_share"] / max(max_ds, 0.01)) * 100, 1),
                    "confidence_score": best_entry_seg["row_confidence"],
                    "best_entry_score": best_entry_seg.get("best_entry_score", 0),
                    "candidates_evaluated": len(entry_candidates),
                    "candidates_excluded": excluded_count,
                    "dataset_session_id": session_id,
                },
                [
                    f"0.35 × {best_entry_seg['opportunity_score']} = {0.35 * best_entry_seg['opportunity_score']:.1f}",
                    f"Competition Advantage = 100 - {best_entry_seg['competition_index']} = {comp_adv}",
                    f"Best Entry Score = {best_entry_seg.get('best_entry_score', 0)}",
                ],
                best_entry_seg.get("best_entry_score", 0),
                "Balanced entry point accounting for competition, not just raw opportunity.",
                rows_included=best_entry_seg["keyword_count"],
                missing_fields=missing,
            ),
        }

    # Opportunity database
    opp_db = []
    for s in segment_list:
        score = s.get("opportunity_score", 0)
        row_conf = s.get("row_confidence", 0)
        reliable = s.get("reliable_opportunity_score", 0)

        if s["segment"] == "Other":
            rec = "N/A"
            diff = "N/A"
        else:
            diff = "High" if s["competition_index"] >= 50 else "Moderate" if s["competition_index"] >= 20 else "Low"
            if score >= 70:
                rec_base = "Prime Entry"
            elif score >= 50:
                rec_base = "Strong Opportunity"
            elif score >= 30:
                rec_base = "Monitor"
            else:
                rec_base = "Low Priority"
            rec = qualification_label(rec_base, row_conf)

        breakdown_steps = []
        if s["segment"] != "Other":
            breakdown_steps.append(f"Aggregated {s['keyword_count']} keywords — {s.get('classification_source', '')}")
            for k, v in s.get("score_breakdown", {}).items():
                breakdown_steps.append(f"{k}: +{v}")
            breakdown_steps.append(f"Reliable Opportunity Score = {score} × {row_conf/100:.2f} = {reliable}")

        formulas = "\n".join(s.get("formula_breakdown", {}).values()) if s.get("formula_breakdown") else ""

        opp_db.append({
            "segment": s["segment"],
            "demand_share": s["demand_share"],
            "revenue_share": s["revenue_share"],
            "total_search_volume": s["total_search_volume"],
            "demand_revenue_gap": s["demand_revenue_gap"],
            "revenue_gap_label": s.get("revenue_gap_label", "Revenue Gap"),
            "revenue_gap_value": s.get("revenue_gap_value", 0),
            "competition_index": s["competition_index"],
            "entry_difficulty": diff,
            "opportunity_score": score,
            "reliable_opportunity_score": reliable,
            "row_confidence": row_conf,
            "classification_source": s.get("classification_source", ""),
            "derived_confidence": s.get("derived_confidence", 0),
            "score_breakdown": s.get("score_breakdown", {}),
            "formula_breakdown": s.get("formula_breakdown", {}),
            "recommendation": rec,
            "keyword_count": s["keyword_count"],
            "top_keywords": s.get("keywords", [])[:10],
            "evidence": _create_evidence(
                "Magnet",
                [sv_col, kw_sales_col] if kw_sales_col else [sv_col],
                formulas or "Opportunity Score = weighted demand, monetization, competition, gap components",
                {
                    "theme_search_volume": s["total_search_volume"],
                    "total_search_volume": total_market_sv,
                    "keyword_count": s["keyword_count"],
                    "total_keyword_count": diag_meta["total_keyword_count"],
                    "classification_source": s.get("classification_source", ""),
                    "reliable_opportunity_score": reliable,
                    "row_confidence": row_conf,
                    "dataset_session_id": session_id,
                },
                breakdown_steps,
                score,
                "Composite opportunity from active dataset rows only.",
                rows_included=s["keyword_count"],
            ),
        })

    opp_db.sort(key=lambda x: x.get("reliable_opportunity_score", 0), reverse=True)

    pct_sum_check = round(diag_meta["classified_demand_pct"] + diag_meta["unclassified_demand_pct"], 1)
    volume_check_ok = abs(
        diag_meta["classified_search_volume"] + diag_meta["unclassified_search_volume"] - total_market_sv
    ) < 2

    classification_diagnostics = {
        **diag_meta,
        "other_share_pct": round(other_pct, 1),
        "quality_score": round(theme_confidence, 1),
        "confidence_level": confidence_level,
        "is_degraded": is_degraded,
        "show_warning": show_warning,
        "warning_message": warning_message,
        "enhanced_coverage_note": enhanced_note,
        "dataset_session_id": session_id,
        "missing_columns": missing_columns,
        "pct_sum_check": pct_sum_check,
        "pct_sum_valid": abs(pct_sum_check - 100) < 0.2,
        "volume_sum_valid": volume_check_ok,
        "failure_reason": "Excessive unclassified demand" if show_warning else None,
        "evidence": _create_evidence(
            "Magnet / Keyword Classification",
            [sv_col, kw_col],
            (
                "Classified Demand % = Classified SV / Total SV × 100\n"
                "Unclassified Demand % = Unclassified SV / Total SV × 100"
            ),
            {
                "total_keyword_count": diag_meta["total_keyword_count"],
                "total_search_volume": total_market_sv,
                "classified_keyword_count": diag_meta["classified_keyword_count"],
                "classified_search_volume": diag_meta["classified_search_volume"],
                "unclassified_keyword_count": diag_meta["unclassified_keyword_count"],
                "unclassified_search_volume": diag_meta["unclassified_search_volume"],
                "classified_demand_pct": diag_meta["classified_demand_pct"],
                "unclassified_demand_pct": diag_meta["unclassified_demand_pct"],
                "original_classification_coverage": diag_meta["original_classification_coverage"],
                "enhanced_classification_coverage": diag_meta["enhanced_classification_coverage"],
                "dataset_session_id": session_id,
            },
            [
                f"Classified: {diag_meta['classified_search_volume']:,} / {total_market_sv:,} = {diag_meta['classified_demand_pct']}%",
                f"Unclassified: {diag_meta['unclassified_search_volume']:,} / {total_market_sv:,} = {diag_meta['unclassified_demand_pct']}%",
                f"Sum check: {pct_sum_check}% (valid={abs(pct_sum_check - 100) < 0.2})",
            ],
            f"{theme_confidence}%",
            warning_message or "Theme coverage is sufficient for confident recommendations.",
            rows_included=diag_meta["total_keyword_count"],
        ),
    }

    exec_summary = f"Theme extraction confidence is {confidence_level} ({theme_confidence:.1f}% coverage). "
    if diag_meta.get("enhanced_classification_applied"):
        exec_summary += enhanced_note + " "
    if largest_demand:
        exec_summary += f"Largest demand segment: {largest_demand['name']}. "
    if recommended_entry:
        exec_summary += f"Best balanced entry: {recommended_entry['name']}. "

    return {
        "status": "success",
        "dataset_session_id": session_id,
        "results": {
            "total_search_volume": int(total_market_sv),
            "total_keyword_sales": int(total_market_ks),
            "classification_diagnostics": classification_diagnostics,
            "executive_summary": exec_summary,
            "concentration_score": {
                "value": hhi_score,
                "evidence": _create_evidence(
                    "Magnet", [sv_col], "SUM((Demand Share/100)^2)×100",
                    {"segments": {s["segment"]: s["demand_share"] for s in segment_list}},
                    hhi_steps, hhi_score,
                    "Higher = more concentrated demand.",
                ),
            },
            "largest_demand_segment": largest_demand,
            "recommended_entry": recommended_entry,
            "most_undervalued_theme": most_undervalued,
            "best_monetized_theme": best_monetized,
            "demand_opportunity_database": opp_db,
            "search_insights": [],
        },
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
    }


def run(magnet_df, blackbox_df=None, top_n=10, keyword_classification_df=None):
    try:
        return _run_internal(magnet_df, blackbox_df, top_n, keyword_classification_df)
    except Exception as e:
        import traceback
        logger.error("Engine failed: %s", e)
        logger.error(traceback.format_exc())
        return {
            "status": "error",
            "message": f"Demand Intelligence could not be generated: {e}",
        }
