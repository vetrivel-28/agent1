"""
Keyword Conversion / Revenue Efficiency Engine
==============================================
Deterministic keyword-level revenue efficiency analytics based on uploaded datasets.
All KPI values are derived from Magnet keyword data (and optional keyword classification).
No model-generated calculations are used.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("siei_engine")

_KEYWORD_CANDIDATES  = ["Keyword Phrase", "Keyword"]
_SEARCH_VOL_CANDIDATES = ["Search Volume", "search volume", "SearchVolume", "Monthly Search Volume"]
_KEYWORD_SALES_CANDIDATES = ["Keyword Sales", "keyword sales", "Sales", "sales"]
_CLASS_KEYWORD_CANDIDATES = ["Keyword Phrase", "Keyword", "keyword"]
_CLASS_LABEL_CANDIDATES = ["Classification", "classification", "Class", "class"]


def _prefer_exact(df: pd.DataFrame, name: str) -> Optional[str]:
    for c in df.columns:
        if str(c).strip().lower() == name.strip().lower():
            return str(c)
    return None


def _quadrant(demand_pct: float, efficiency_pct: float) -> str:
    if demand_pct >= 60 and efficiency_pct >= 60:
        return "Demand Winner"
    if demand_pct >= 60 and efficiency_pct < 40:
        return "Friction Keyword"
    if demand_pct < 60 and efficiency_pct >= 60:
        return "Hidden Gem"
    return "Low Priority"


def _opportunity_level(recoverable_revenue: float, efficiency_gap: float) -> str:
    if recoverable_revenue >= 1000 or efficiency_gap >= 100:
        return "Critical"
    if recoverable_revenue >= 300 or efficiency_gap >= 50:
        return "High"
    if recoverable_revenue > 0:
        return "Moderate"
    return "Low"


def _mk_evidence(
    metric_name: str,
    metric_value: Any,
    formula: str,
    source_columns: List[str],
    rows_included: int,
    rows_excluded: int,
    thresholds: Optional[Dict[str, Any]] = None,
    example: Optional[Dict[str, Any]] = None,
    source_dataset: str = "magnet",
    rows: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    return {
        "metric_name": metric_name,
        "metric_value": metric_value,
        "source_dataset": source_dataset,
        "source_columns": source_columns,
        "formula": formula,
        "thresholds": thresholds or {},
        "rows_included": rows_included,
        "rows_excluded": rows_excluded,
        "rows_matched": rows_included,
        "example_calculation": example or {},
        "items": rows or [],
    }


def _format_num(v: Any, digits: int = 4) -> Optional[float]:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(float(v), digits)


def _keyword_row_evidence(
    row: pd.Series,
    benchmark_rps_1k: float,
    rows_included: int,
    rows_excluded: int,
) -> Dict[str, Any]:
    keyword = str(row.get("keyword", ""))
    search_volume = float(row.get("search_vol", 0.0) or 0.0)
    keyword_sales = float(row.get("kw_sales", 0.0) or 0.0)
    rps_1k = float(row.get("revenue_per_1000_searches", 0.0) or 0.0)
    eff_idx = float(row.get("revenue_efficiency_percentile", 0.0) or 0.0)
    demand_pct = float(row.get("demand_percentile", 0.0) or 0.0)
    recoverable = float(row.get("recoverable_revenue", 0.0) or 0.0)
    gap = float(row.get("efficiency_gap_per_1k", 0.0) or 0.0)
    segment = str(row.get("quadrant", "Low Priority"))
    classification_rule = (
        "Demand Winner: demand>=60 AND efficiency>=60; "
        "Friction Keyword: demand>=60 AND efficiency<40; "
        "Hidden Gem: demand<60 AND efficiency>=60; "
        "Low Priority: demand<60 AND efficiency<40"
    )
    classification_reason = (
        f"This keyword is '{segment}' because Demand Percentile={demand_pct:.2f} "
        f"and Revenue Efficiency Index={eff_idx:.2f} satisfy the '{segment}' rule."
    )
    calc_steps = [
        f"Revenue / 1K Searches = ({keyword_sales:.6f} / {search_volume:.6f}) * 1000 = {rps_1k:.6f}",
        f"Revenue Efficiency Index = percentile_rank({rps_1k:.6f}) * 100 = {eff_idx:.2f}",
        f"Demand Percentile = percentile_rank({search_volume:.6f}) * 100 = {demand_pct:.2f}",
    ]
    if segment == "Friction Keyword":
        calc_steps.append(
            f"Recoverable Revenue = max(0, {benchmark_rps_1k:.6f} - {rps_1k:.6f}) * {search_volume:.6f} / 1000 = {recoverable:.6f}"
        )
    return {
        "source_dataset": "Magnet Keyword Dataset",
        "source_columns": ["Keyword Phrase", "Search Volume", "Keyword Sales"],
        "source_values": {
            "keyword_phrase": keyword,
            "search_volume": _format_num(search_volume, 6),
            "keyword_sales": _format_num(keyword_sales, 6),
            "benchmark_revenue_per_1k_searches": _format_num(benchmark_rps_1k, 6),
            "actual_revenue_per_1k_searches": _format_num(rps_1k, 6),
            "revenue_efficiency_index": _format_num(eff_idx, 2),
            "demand_percentile": _format_num(demand_pct, 2),
            "efficiency_gap_per_1k_searches": _format_num(gap, 6),
            "recoverable_revenue": _format_num(recoverable, 6),
        },
        "formula": (
            "Revenue / 1K Searches = Keyword Sales / Search Volume * 1000; "
            "Revenue Efficiency Index = percentile_rank(Revenue / 1K Searches) * 100; "
            "Demand Percentile = percentile_rank(Search Volume) * 100; "
            "Recoverable Revenue (friction only) = max(0, Benchmark - Actual) * Search Volume / 1000"
        ),
        "thresholds": {
            "demand_threshold": 60,
            "efficiency_high_threshold": 60,
            "efficiency_low_threshold": 40,
            "benchmark_percentile": 75,
        },
        "calculation_steps": calc_steps,
        "intermediate_values": {
            "benchmark_revenue_per_1k_searches": _format_num(benchmark_rps_1k, 6),
            "actual_revenue_per_1k_searches": _format_num(rps_1k, 6),
            "efficiency_gap_per_1k_searches": _format_num(gap, 6),
        },
        "final_value": {
            "segment": segment,
            "revenue_efficiency_index": _format_num(eff_idx, 2),
            "demand_percentile": _format_num(demand_pct, 2),
            "recoverable_revenue": _format_num(recoverable, 6),
        },
        "rows_included": rows_included,
        "rows_excluded": rows_excluded,
        "excluded_reason": "Excluded rows have missing keyword phrase, non-positive search volume, or non-numeric keyword sales.",
        "classification_rule": classification_rule,
        "classification_reason": classification_reason,
    }


def _attach_classification(
    work: pd.DataFrame,
    keyword_classification_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    if keyword_classification_df is None or keyword_classification_df.empty:
        work["classification"] = None
        return {"available": False, "column_used": None, "rows_joined": 0}
    cls_kw_col = find_column(keyword_classification_df, _CLASS_KEYWORD_CANDIDATES)
    cls_label_col = find_column(keyword_classification_df, _CLASS_LABEL_CANDIDATES)
    if cls_kw_col is None or cls_label_col is None:
        work["classification"] = None
        return {"available": False, "column_used": None, "rows_joined": 0}
    cls_df = keyword_classification_df[[cls_kw_col, cls_label_col]].copy()
    cls_df["keyword_norm"] = cls_df[cls_kw_col].astype(str).str.strip().str.lower()
    cls_df["classification"] = cls_df[cls_label_col].astype(str).str.strip()
    cls_df = cls_df.dropna(subset=["keyword_norm"]).drop_duplicates(subset=["keyword_norm"])
    work["keyword_norm"] = work["keyword"].astype(str).str.strip().str.lower()
    work.merge(cls_df[["keyword_norm", "classification"]], on="keyword_norm", how="left", copy=False)
    mapped = work["keyword_norm"].map(cls_df.set_index("keyword_norm")["classification"])
    work["classification"] = mapped
    return {
        "available": True,
        "column_used": cls_label_col,
        "rows_joined": int(work["classification"].notna().sum()),
    }
def _normalize_stem(kw: str) -> str:
    """Reduce keyword to a normalized root for clustering comparison."""
    kw = kw.lower().strip()
    # Strip trailing plural suffixes (simple English rules)
    if kw.endswith("ies") and len(kw) > 4:
        return kw[:-3] + "y"
    if kw.endswith("es") and len(kw) > 4 and not kw.endswith("ss"):
        return kw[:-2]
    if kw.endswith("s") and len(kw) > 3 and not kw.endswith("ss"):
        return kw[:-1]
    return kw


def _is_fragment(kw: str) -> bool:
    """Return True if the keyword looks like a truncated fragment (not a real word/phrase)."""
    stripped = kw.strip().lower()
    # Very short single tokens with no vowels or obviously incomplete
    if len(stripped) <= 3:
        return True
    tokens = stripped.split()
    if len(tokens) == 1:
        # Single token: flag if <= 4 chars
        if len(stripped) <= 4:
            return True
        # Flag single tokens that look like word fragments (no vowels, or end abruptly)
        if len(stripped) <= 5:
            # Check if it has vowels - fragments often don't
            if not any(c in 'aeiouy' for c in stripped):
                return True
    # Multi-token: last token is suspiciously short (looks cut off mid-word)
    if len(tokens) >= 2:
        last = tokens[-1]
        if len(last) <= 2:
            return True
        # "tote ba" — last token is start of a word (ba → bag)
        # Expanded list of common short words that are valid
        valid_short_words = {
            "bag", "tub", "set", "kit", "cup", "mat", "pad", "cap", "hat", "lap", "bib",
            "box", "jar", "pan", "pot", "bin", "bag", "mug", "jug", "bowl", "dish",
            "toy", "top", "pop", "map", "gap", "tap", "rap", "nap", "sap", "zap",
            "pen", "pin", "tin", "fan", "van", "can", "man", "pan", "tan", "ran",
            "bed", "red", "led", "fed", "wed", "kid", "lid", "bid", "did", "rid",
            "dog", "log", "fog", "hog", "jog", "bog", "cog", "nog", "sog", "tog",
            "cat", "bat", "rat", "hat", "mat", "pat", "sat", "vat", "fat", "gat",
            "car", "bar", "far", "jar", "tar", "war", "par", "mar", "gar", "lar",
        }
        if len(last) <= 3 and last not in valid_short_words:
            return True
        # Check if last token ends abruptly (consonant-only ending that looks cut off)
        if len(last) == 4 and not any(c in 'aeiouy' for c in last[-2:]):
            return True
    return False


def _cluster_friction_keywords(records: List[Dict[str, Any]], benchmark_rps_1k: float) -> List[Dict[str, Any]]:
    """
    Groups friction keywords into clusters using rapidfuzz Levenshtein distance on
    normalized stems. Strategy:
    1. Sort by search volume descending — highest-volume keyword becomes cluster seed.
    2. For each unseeded keyword, compute edit distance between its normalized stem
       and every existing cluster head's stem. Merge if distance <= 2.
    3. Additionally merge if one normalized phrase is a substring of the other
       (handles "bath towel" merging with "towel" cluster).
    4. Cluster label = the longest complete (non-fragment) keyword phrase in the cluster
       with the highest search volume among those of sufficient length.
    5. Suppress clusters whose label is still a fragment.
    """
    try:
        from rapidfuzz.distance import Levenshtein as _Lev
        _lev_dist = _Lev.distance
    except ImportError:
        # Fallback: simple substring check only
        def _lev_dist(a: str, b: str) -> int:  # type: ignore
            return 0 if a in b or b in a else 99

    # Filter out any record with a blank keyword
    valid = [r for r in records if str(r.get("keyword", "")).strip()]
    if not valid:
        return []

    # Sort by search volume descending so high-volume keywords seed clusters first
    sorted_recs = sorted(valid, key=lambda x: float(x.get("search_volume") or 0.0), reverse=True)

    # Each cluster: { "head_stem": str, "head_kw": str, "members": [rec, ...] }
    clusters: List[Dict[str, Any]] = []

    for rec in sorted_recs:
        kw = str(rec.get("keyword", "")).lower().strip()
        kw_norm = _normalize_stem(kw)
        placed = False

        for cl in clusters:
            head_norm = cl["head_norm"]
            # Condition 1: edit distance on stems
            if _lev_dist(kw_norm, head_norm) <= 2:
                cl["members"].append(rec)
                placed = True
                break
            # Condition 2: one is a substring of the other (multi-word phrases)
            if len(kw_norm) >= 4 and len(head_norm) >= 4:
                if kw_norm in head_norm or head_norm in kw_norm:
                    cl["members"].append(rec)
                    placed = True
                    break
            # Condition 3: share at least one significant token (≥ 4 chars)
            kw_tokens = {t for t in kw.split() if len(t) >= 4}
            head_tokens = {t for t in cl["head_kw"].split() if len(t) >= 4}
            if kw_tokens and head_tokens and kw_tokens & head_tokens:
                cl["members"].append(rec)
                placed = True
                break

        if not placed:
            clusters.append({
                "head_norm": kw_norm,
                "head_kw": kw,
                "members": [rec],
            })

    result = []
    for cl in clusters:
        members = cl["members"]
        # Sort members by search volume descending
        members_sorted = sorted(members, key=lambda x: float(x.get("search_volume") or 0.0), reverse=True)

        # Choose best label: prioritize complete meaningful phrases
        best_label = None
        best_label_score = -1

        for m in members_sorted:
            kw_cand = str(m.get("keyword", "")).strip()
            if not kw_cand:
                continue

            # Skip fragments entirely for label selection
            if _is_fragment(kw_cand):
                continue

            # Score candidates based on:
            # 1. Length (longer is better for multi-word phrases)
            # 2. Search volume (higher is better)
            # 3. Completeness (prefer phrases that contain other members)
            tokens = kw_cand.split()
            length_score = len(tokens) * 10  # Multi-word phrases get bonus
            volume_score = float(m.get("search_volume") or 0.0) / 1000.0  # Normalize volume
            completeness_score = 0
            
            # Check if this phrase could be a parent of other members
            for other in members_sorted:
                other_kw = str(other.get("keyword", "")).strip().lower()
                if other_kw != kw_cand.lower() and other_kw in kw_cand.lower():
                    completeness_score += 5  # Bonus for containing other keywords

            total_score = length_score + volume_score + completeness_score

            if total_score > best_label_score:
                best_label = kw_cand
                best_label_score = total_score

        # Fallback: if no non-fragment found, use the highest-volume keyword
        if best_label is None:
            for m in members_sorted:
                kw_cand = str(m.get("keyword", "")).strip()
                if kw_cand:
                    best_label = kw_cand
                    break

        # Skip cluster if the label is a fragment with only 1 member
        if _is_fragment(best_label) and len(members) == 1:
            logger.warning(f"Suppressing fragment cluster: '{best_label}'")
            continue

        total_sv = sum(float(m.get("search_volume") or 0.0) for m in members)
        total_rev = sum(float(m.get("keyword_revenue") or m.get("revenue") or 0.0) for m in members)
        weighted_rps_1k = (total_rev / total_sv * 1000.0) if total_sv > 0 else 0.0
        eff_gap = max(0.0, benchmark_rps_1k - weighted_rps_1k)
        est_leakage = eff_gap * total_sv / 1000.0

        # Aggregate opportunity level from members
        opp_levels = [str(m.get("opportunity_level", "")) for m in members]
        opp_level = "Low"
        for lvl in ("Critical", "High", "Moderate"):
            if lvl in opp_levels:
                opp_level = lvl
                break

        # Build clean member keyword list for the cluster popup
        cluster_keywords = [
            {
                "keyword": str(m.get("keyword", "")),
                "search_volume": float(m.get("search_volume") or 0.0),
                "keyword_sales": float(m.get("keyword_revenue") or m.get("revenue") or 0.0),
                "revenue_per_1k_searches": round(float(m.get("revenue_per_1000_searches") or 0.0), 6),
                "revenue_efficiency_index": round(float(m.get("efficiency_score") or m.get("revenue_efficiency_index") or 0.0), 2),
                "demand_percentile": round(float(m.get("demand_percentile") or 0.0), 2),
                "segment": str(m.get("quadrant") or m.get("segment") or "Friction Keyword"),
                "benchmark_revenue_per_1k": round(benchmark_rps_1k, 6),
                "efficiency_gap": round(max(0.0, benchmark_rps_1k - float(m.get("revenue_per_1000_searches") or 0.0)), 6),
                "estimated_revenue_leakage": round(float(m.get("estimated_revenue_leakage") or m.get("recoverable_revenue") or 0.0), 4),
            }
            for m in members_sorted
        ]

        calc_steps = [
            f"Cluster: '{best_label}' ({len(members)} keywords)",
            f"Total Search Volume = {total_sv:,.0f}",
            f"Total Keyword Sales = {total_rev:.4f}",
            f"Weighted Revenue / 1K Searches = {total_rev:.4f} / {total_sv:.0f} × 1000 = {weighted_rps_1k:.6f}",
            f"Benchmark Revenue / 1K Searches (p75) = {benchmark_rps_1k:.6f}",
            f"Efficiency Gap = max(0, {benchmark_rps_1k:.6f} − {weighted_rps_1k:.6f}) = {eff_gap:.6f}",
            f"Estimated Revenue Gap = {eff_gap:.6f} × {total_sv:.0f} / 1000 = {est_leakage:.4f}",
        ]

        result.append({
            "cluster_label": best_label,
            "keyword": best_label,  # alias for frontend compat
            "keyword_count": len(members),
            "search_volume": total_sv,
            "total_search_volume": total_sv,
            "keyword_revenue": total_rev,
            "revenue": total_rev,
            "total_keyword_sales": total_rev,
            "revenue_per_1000_searches": round(weighted_rps_1k, 6),
            "weighted_revenue_per_1k": round(weighted_rps_1k, 6),
            "benchmark_revenue_per_1000_searches": round(benchmark_rps_1k, 6),
            "benchmark_revenue_per_1k": round(benchmark_rps_1k, 6),
            "efficiency_gap": round(eff_gap, 6),
            "estimated_revenue_leakage": round(est_leakage, 4),
            "estimated_revenue_gap": round(est_leakage, 4),
            "recoverable_revenue": round(est_leakage, 4),
            "opportunity_level": opp_level,
            "keywords": cluster_keywords,
            "member_keywords": [m for m in members_sorted],  # raw records for legacy compat
            "calculation_steps": calc_steps,
            "recommendation": (
                f"Cluster '{best_label}' has {len(members)} friction keywords with "
                f"{total_sv:,.0f} total monthly searches but weighted revenue of "
                f"${weighted_rps_1k:.4f} per 1K searches vs benchmark ${benchmark_rps_1k:.4f}. "
                f"Priority: {opp_level}. Test exact-match PPC for top cluster members, "
                f"verify listing relevance, and confirm the product satisfies this search intent."
            ),
        })

    # Sort by estimated revenue gap descending
    result.sort(key=lambda x: float(x.get("estimated_revenue_leakage") or 0.0), reverse=True)
    return result


def run(
    magnet_df: Optional[pd.DataFrame],
    keyword_classification_df: Optional[pd.DataFrame] = None,
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()

    rows_before = len(magnet_df) if magnet_df is not None else 0
    if magnet_df is None or magnet_df.empty:
        return _error("Magnet dataset is required.", [], [], rows_before, t0)

    keyword_col = _prefer_exact(magnet_df, "Keyword Phrase") or find_column(magnet_df, _KEYWORD_CANDIDATES)
    vol_col     = _prefer_exact(magnet_df, "Search Volume") or find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    sales_col   = _prefer_exact(magnet_df, "Keyword Sales") or find_column(magnet_df, _KEYWORD_SALES_CANDIDATES)
    missing_required = []
    if keyword_col is None:
        missing_required.append("Keyword Phrase")
    if vol_col is None:
        missing_required.append("Search Volume")
    if sales_col is None:
        missing_required.append("Keyword Sales")
    if missing_required:
        return _error(
            f"Required columns not found in Magnet dataset: {', '.join(missing_required)}",
            ["magnet"],
            [],
            rows_before,
            t0,
        )

    columns_used = [c for c in [keyword_col, vol_col, sales_col] if c]

    # ── Build working frame ──────────────────────────────────────────────────
    work = pd.DataFrame(index=magnet_df.index)
    work["keyword"] = magnet_df[keyword_col].astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    work["search_vol"], _ = clean_numeric_series(magnet_df[vol_col], vol_col)
    work["kw_sales"], _ = clean_numeric_series(magnet_df[sales_col], sales_col)
    work = work.dropna(subset=["keyword", "search_vol", "kw_sales"])
    work = work[work["keyword"] != ""]
    work = work[(work["search_vol"] > 0) & (work["kw_sales"] >= 0)]
    rows_after = len(work)

    if rows_after < 3:
        return _error("Insufficient valid rows after cleaning (need ≥ 3).", ["magnet"], columns_used, rows_before, t0)

    n = rows_after

    class_info = _attach_classification(work, keyword_classification_df)
    confidence_level = "High" if class_info["available"] else "Medium"
    data_quality_warning = False

    # ── Revenue efficiency metrics ────────────────────────────────────────────
    work["revenue_per_search"] = work["kw_sales"] / work["search_vol"]
    work["revenue_per_1000_searches"] = work["revenue_per_search"] * 1000.0
    work["rps_rank"] = work["revenue_per_1000_searches"].rank(method="average", ascending=True, pct=True)
    work["efficiency"] = work["rps_rank"] * 100.0

    # ── Demand percentile ─────────────────────────────────────────────────────
    work["vol_rank"]    = work["search_vol"].rank(method="average", ascending=False)
    work["vol_pct"]     = (1.0 - (work["vol_rank"] - 1) / max(n - 1, 1)) * 100.0
    work["vol_pct"]     = work["vol_pct"].clip(0, 100)
    work["demand_percentile"] = work["vol_pct"]
    work["revenue_efficiency_percentile"] = work["efficiency"]
    work["quadrant"] = work.apply(lambda r: _quadrant(r["demand_percentile"], r["revenue_efficiency_percentile"]), axis=1)
    work["is_high_revenue_potential"] = (work["demand_percentile"] >= 60.0) & (work["revenue_efficiency_percentile"] >= 60.0)
    work["is_friction_keyword"] = (work["demand_percentile"] >= 60.0) & (work["revenue_efficiency_percentile"] < 40.0)

    # ── Segment counts ────────────────────────────────────────────────────────
    quad_counts = work["quadrant"].value_counts().to_dict()
    high_intent_count = int(work["is_high_revenue_potential"].sum())
    friction_count = int(work["is_friction_keyword"].sum())

    avg_efficiency    = round(float(work["efficiency"].mean()), 2)

    # ── Recoverable revenue (friction only) ──────────────────────────────────
    benchmark_rps_1k = float(work["revenue_per_1000_searches"].quantile(0.75))
    work["efficiency_gap_per_1k"] = (benchmark_rps_1k - work["revenue_per_1000_searches"]).clip(lower=0)
    work["recoverable_revenue"] = np.where(
        work["is_friction_keyword"],
        work["efficiency_gap_per_1k"] * work["search_vol"] / 1000.0,
        0.0,
    )
    total_lost_revenue = round(float(work.loc[work["is_friction_keyword"], "recoverable_revenue"].sum()), 2)
    work["root_cause"] = np.where(
        work["is_friction_keyword"],
        "High demand with below-benchmark revenue efficiency",
        None,
    )
    work["opportunity_level"] = work.apply(
        lambda r: _opportunity_level(float(r["recoverable_revenue"]), float(r["efficiency_gap_per_1k"])),
        axis=1,
    )

    # ── Top/bottom products ───────────────────────────────────────────────────
    demand_winners_df  = work[work["is_high_revenue_potential"]].sort_values("revenue_efficiency_percentile", ascending=False)
    friction_df        = work[work["is_friction_keyword"]].sort_values("recoverable_revenue", ascending=False)
    hidden_gems_df     = work[work["quadrant"] == "Hidden Gem"].sort_values("efficiency", ascending=False)

    best_converting = work.sort_values("revenue_efficiency_percentile", ascending=False).iloc[0] if n > 0 else None
    biggest_friction = friction_df.iloc[0] if not friction_df.empty else None
    largest_gap_kw = work.sort_values("efficiency_gap_per_1k", ascending=False).iloc[0] if n > 0 else None

    def _kw(row: pd.Series) -> str:
        return str(row.get("keyword", "—")) if row is not None else "—"

    # ── Record builder ────────────────────────────────────────────────────────
    def _records(df: pd.DataFrame, limit: Optional[int] = None) -> List[Dict]:
        out = []
        subset = df.head(limit) if limit is not None else df
        for _, row in subset.iterrows():
            rec: Dict[str, Any] = {
                "search_volume":      _sv(row.get("search_vol")),
                "demand_percentile":  round(float(row["demand_percentile"]), 2),
                "efficiency_score":   round(float(row["revenue_efficiency_percentile"]), 2),
                "revenue_efficiency_index": round(float(row["revenue_efficiency_percentile"]), 2),
                "revenue_per_search": _sv(row.get("revenue_per_search")),
                "revenue_per_1000_searches": _sv(row.get("revenue_per_1000_searches")),
                "revenue_per_1k_searches": _sv(row.get("revenue_per_1000_searches")),
                "benchmark_revenue_per_1000_searches": _sv(benchmark_rps_1k),
                "efficiency_gap_per_1000_searches": _sv(row.get("efficiency_gap_per_1k")),
                "gap":                round(float(row.get("efficiency_gap_per_1k", 0)), 2),
                "quadrant":           row["quadrant"],
                "segment":            row["quadrant"],
                "opportunity_level":  row["opportunity_level"],
                "keyword_revenue":    _sv(row.get("kw_sales")),
                "revenue":            _sv(row.get("kw_sales")),
                "lost_revenue_estimate": _sv(row.get("recoverable_revenue")),
                "estimated_revenue_leakage": _sv(row.get("recoverable_revenue")),
                "recoverable_revenue": _sv(row.get("recoverable_revenue")),
                "root_cause":         row.get("root_cause"),
                "classification":     row.get("classification"),
                "formula_used": "Revenue / 1K Searches = Keyword Sales / Search Volume * 1000",
                "source_columns": ["Keyword Phrase", "Search Volume", "Keyword Sales"],
                "source_values": {
                    "keyword_sales": _sv(row.get("kw_sales")),
                    "search_volume": _sv(row.get("search_vol")),
                    "benchmark_revenue_per_1000_searches": _sv(benchmark_rps_1k),
                },
                "evidence": _keyword_row_evidence(row, benchmark_rps_1k, n, rows_before - rows_after),
                "llm_explanation": None,
                "rule_based_explanation": (
                    f"Keyword '{str(row.get('keyword', ''))}' is '{str(row.get('quadrant', 'Low Priority'))}' "
                    f"because Demand Percentile={float(row.get('demand_percentile', 0.0)):.2f} and "
                    f"Revenue Efficiency Index={float(row.get('revenue_efficiency_percentile', 0.0)):.2f}."
                ),
            }
            rec["llm_explanation"] = rec["rule_based_explanation"]
            if "exact_search_volume" in row.index:
                rec["exact_search_volume"] = _sv(row.get("exact_search_volume"))
            if "variant_count" in row.index:
                rec["variant_count"] = int(row.get("variant_count") or 0)
            if "keyword" in row.index:
                rec["keyword"] = str(row["keyword"])
            out.append(rec)
        return out

    # ── Scatter data ──────────────────────────────────────────────────────────
    scatter = []
    for _, row in work.head(300).iterrows():
        pt: Dict[str, Any] = {
            "demand_percentile":  round(float(row["demand_percentile"]), 2),
            "efficiency_score":   round(float(row["revenue_efficiency_percentile"]), 2),
            "gap":                round(float(row.get("efficiency_gap_per_1k", 0)), 2),
            "quadrant":           row["quadrant"],
            "search_volume":      _sv(row["search_vol"]),
            "keyword_revenue":    _sv(row["kw_sales"]),
            "revenue":            _sv(row["kw_sales"]),
            "revenue_per_search": _sv(row.get("revenue_per_search")),
            "revenue_per_1000_searches": _sv(row.get("revenue_per_1000_searches")),
        }
        if "exact_search_volume" in row.index:
            pt["exact_search_volume"] = _sv(row.get("exact_search_volume"))
        if "variant_count" in row.index:
            pt["variant_count"] = int(row.get("variant_count") or 0)
        if "keyword" in row.index:
            pt["keyword"] = str(row["keyword"])
        scatter.append(pt)

    # ── Automated insights ────────────────────────────────────────────────────
    classified_total = int(work["classification"].notna().sum()) if class_info["available"] else n

    benchmark_cards = {
        "current_efficiency": {
            "value": round(float(work["revenue_per_1000_searches"].mean()), 4),
            "formula": "Current Efficiency = average(Revenue / 1K Searches)",
            "source_columns": ["Keyword Sales", "Search Volume"],
        },
        "top_quartile": {
            "value": round(float(benchmark_rps_1k), 4),
            "formula": "Top Quartile = 75th percentile(Revenue / 1K Searches)",
            "source_columns": ["Keyword Sales", "Search Volume"],
        },
        "category_average": {
            "value": round(float(work["revenue_efficiency_percentile"].mean()), 4),
            "formula": "Category Average = mean(Revenue Efficiency Index)",
            "source_columns": ["Keyword Sales", "Search Volume"],
        },
        "keyword_leakage_rate": {
            "value": round((friction_count / max(classified_total, 1)) * 100.0, 4),
            "formula": "Keyword Leakage Rate = Friction Keywords / Total Classified Keywords * 100",
            "source_columns": ["Keyword Sales", "Search Volume", "Classification"] if class_info["available"] else ["Keyword Sales", "Search Volume"],
        },
    }

    insights = _generate_insights(
        n=n,
        high_intent_count=high_intent_count,
        friction_count=friction_count,
        avg_efficiency=avg_efficiency,
        best_converting=best_converting,
        biggest_friction=biggest_friction,
        total_lost_revenue=total_lost_revenue,
        demand_winners_count=int(high_intent_count),
    )

    # ── Category health ───────────────────────────────────────────────────────
    friction_rate = round(friction_count / n * 100, 1)
    winner_rate   = round(int(quad_counts.get("Demand Winner", 0)) / n * 100, 1)

    if avg_efficiency >= 65:
        efficiency_status = "High — most keywords convert demand effectively"
    elif avg_efficiency >= 45:
        efficiency_status = "Moderate — meaningful conversion improvement possible"
    else:
        efficiency_status = "Low — significant demand is failing to convert"

    if friction_rate >= 30:
        conversion_leak_status = "High — large proportion of keywords underconvert"
    elif friction_rate >= 15:
        conversion_leak_status = "Moderate — notable friction across the keyword set"
    else:
        conversion_leak_status = "Low — most keywords convert near expectations"

    category_health = {
        "average_conversion_efficiency": avg_efficiency,
        "conversion_leak_rate":          f"{friction_rate}%",
        "demand_winner_ratio":           f"{winner_rate}%",
        "recoverable_revenue_pool":      total_lost_revenue,
        "efficiency_status":             efficiency_status,
        "conversion_leak_status":        conversion_leak_status,
        "data_quality_warning":          data_quality_warning,
    }

    elapsed = round(time.time() - t0, 3)
    
    # ── Full drill-down data extraction ───────────────────────────────────────
    high_intent_full_records = _records(work[work["is_high_revenue_potential"]].sort_values("revenue_efficiency_percentile", ascending=False))
    friction_full_records = _records(friction_df)
    
    clustered_friction_rows = _cluster_friction_keywords(friction_full_records, benchmark_rps_1k)

    
    # Audit Logging
    logger.info("====== SIEI AUDIT LOG ======")
    logger.info(f"Confidence Level: {confidence_level}")
    logger.info(f"High Intent Count: {high_intent_count} (Returned: {len(high_intent_full_records)})")
    for i, r in enumerate(high_intent_full_records[:5]):
        logger.info(f"  HI [{i+1}] {r.get('keyword', '—')}: Eff={r.get('efficiency_score')}, DemandPct={r.get('demand_percentile')}")
    
    logger.info(f"Friction Count: {friction_count} (Returned: {len(friction_full_records)})")
    for i, r in enumerate(friction_full_records[:5]):
        logger.info(f"  FR [{i+1}] {r.get('keyword', '—')}: Eff={r.get('efficiency_score')}, Gap={r.get('gap')}, Recoverable={r.get('recoverable_revenue')}")
    logger.info("============================")

    logger.info(
        f"Keyword Conversion Intelligence complete: n={n}, avg_eff={avg_efficiency}, "
        f"friction={friction_count}, winners={quad_counts.get('Demand Winner',0)}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Keyword Conversion Intelligence",
        "summary": (
            f"{high_intent_count} high-intent keywords identified. "
            f"{friction_count} friction keywords detected. "
            f"Average conversion efficiency: {avg_efficiency}/100."
        ),
        "datasets_used": ["magnet"],
        "columns_used": columns_used,
        "formula_used": (
                "Revenue / 1K Searches = Keyword Sales / Search Volume × 1000; "
                "Demand Percentile = percentile_rank(Search Volume); "
                "Revenue Efficiency Percentile = percentile_rank(Revenue / 1K Searches); "
                "High Revenue Potential = Demand Percentile >= 60 AND Revenue Efficiency Percentile >= 60; "
                "Friction Keyword = Demand Percentile >= 60 AND Revenue Efficiency Percentile < 40; "
                "Recoverable Revenue = max(0, Benchmark Revenue / 1K Searches - Actual Revenue / 1K Searches) × Search Volume / 1000, "
                "Benchmark Revenue / 1K Searches = 75th percentile(Revenue / 1K Searches)."
        ),
        "results": {
            # KPI summary
            "confidence_level":         confidence_level,
            "high_intent_count":        high_intent_count,
            "friction_count":           friction_count,
            "total_lost_revenue":       total_lost_revenue,
            "average_efficiency":       avg_efficiency,
            "total_keywords_analysed":  n,

            # Spotlight keywords
            "top_revenue_efficiency_keyword": {},
            "biggest_friction_keyword": {},

            # Segment tables
            "demand_winners":   _records(demand_winners_df,  max(top_n, 20)),
            "friction_keywords": _records(friction_df,       max(top_n, 20)),
            "hidden_gems":      _records(hidden_gems_df,     max(top_n, 20)),
            "all_keywords":     _records(work.sort_values("efficiency", ascending=False), min(n, 300)),
            
            # Full drill-down data
            "high_intent_keywords_full": high_intent_full_records,
            "friction_keywords_full":    friction_full_records,

            # Scatter data
            "scatter_data": scatter,

            # Quadrant counts
            "quadrant_summary": {
                "demand_winners":   int(quad_counts.get("Demand Winner",    0)),
                "hidden_gems":      int(quad_counts.get("Hidden Gem",       0)),
                "friction_keywords":int(quad_counts.get("Friction Keyword", 0)),
                "low_priority":     int(quad_counts.get("Low Priority",     0)),
            },

            # Category health
            "category_health": category_health,
            "benchmarks": {},

            # Insights
            "insights": insights,

            "summary_cards": {
                "high_revenue_potential": {
                    "count": high_intent_count,
                    "formula": "Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                    "thresholds": {"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                    "items": _records(demand_winners_df, max(top_n, 50)),
                    "evidence": _mk_evidence(
                        metric_name="High Revenue Potential Keywords",
                        metric_value=high_intent_count,
                        formula="Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=high_intent_count,
                        rows_excluded=n - high_intent_count,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                        example={
                            "rule": "Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                            "top_keyword": _kw(best_converting),
                            "top_keyword_demand_percentile": _sv(best_converting.get("demand_percentile")) if best_converting is not None else None,
                            "top_keyword_efficiency_index": _sv(best_converting.get("revenue_efficiency_percentile")) if best_converting is not None else None,
                        },
                    ),
                },
                "friction_keywords": {
                    "count": friction_count,
                    "formula": "Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                    "thresholds": {"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                    "items": _records(friction_df, min(len(friction_df), 300)),  # individual keywords for popup
                    "clusters": clustered_friction_rows[:max(top_n, 50)],        # clusters for table
                    "evidence": _mk_evidence(
                        metric_name="Friction Keywords",
                        metric_value=friction_count,
                        formula="Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=friction_count,
                        rows_excluded=n - friction_count,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                        example={
                            "rule": "Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                            "top_friction_keyword": _kw(biggest_friction),
                            "top_friction_demand_percentile": _sv(biggest_friction.get("demand_percentile")) if biggest_friction is not None else None,
                            "top_friction_efficiency_index": _sv(biggest_friction.get("revenue_efficiency_percentile")) if biggest_friction is not None else None,
                        },
                    ),
                },
            },
                "recoverable_revenue": {
                    "value": total_lost_revenue,
                    "formula": "SUM(Recoverable Revenue) where Keyword is Friction Keyword",
                    "thresholds": {"benchmark_percentile": 75},
                    "evidence": _mk_evidence(
                        metric_name="Recoverable Revenue",
                        metric_value=total_lost_revenue,
                        formula="SUM(max(0, Benchmark Revenue/1K - Actual Revenue/1K) * Search Volume / 1000) for Friction Keywords",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=friction_count,
                        rows_excluded=n - friction_count,
                        thresholds={"benchmark_percentile": 75},
                        example={
                            "top_friction_keyword": _kw(biggest_friction),
                            "recoverable_revenue_contribution": _sv(biggest_friction.get("recoverable_revenue")) if biggest_friction is not None else None,
                        },
                    ),
                },
                "top_revenue_efficiency_keyword": {
                    "keyword": _kw(best_converting),
                    "evidence": _mk_evidence(
                        metric_name="Top Revenue Efficiency Keyword",
                        metric_value=_kw(best_converting),
                        formula="Keyword with MAX(Revenue Efficiency Index)",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=1,
                        rows_excluded=n - 1,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                        example={
                            "keyword": _kw(best_converting),
                            "efficiency_index": _sv(best_converting.get("revenue_efficiency_percentile")) if best_converting is not None else None,
                            "demand_percentile": _sv(best_converting.get("demand_percentile")) if best_converting is not None else None,
                        },
                    ),
                },
                "biggest_friction_keyword": {
                    "keyword": _kw(biggest_friction),
                    "evidence": _mk_evidence(
                        metric_name="Biggest Friction Keyword",
                        metric_value=_kw(biggest_friction),
                        formula="Keyword with MAX(Recoverable Revenue) among Friction Keywords",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=1,
                        rows_excluded=n - 1,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                        example={
                            "keyword": _kw(biggest_friction),
                            "recoverable_revenue": _sv(biggest_friction.get("recoverable_revenue")) if biggest_friction is not None else None,
                            "efficiency_gap": _sv(biggest_friction.get("efficiency_gap_per_1k")) if biggest_friction is not None else None,
                        },
                    ),
                },
            },
            "matrix": {
                "points": scatter,
                "segment_counts": {
                    "demand_winners": int(quad_counts.get("Demand Winner", 0)),
                    "hidden_gems": int(quad_counts.get("Hidden Gem", 0)),
                    "friction_keywords": int(quad_counts.get("Friction Keyword", 0)),
                    "low_priority": int(quad_counts.get("Low Priority", 0)),
                },
            },
            "keyword_rows": _records(work.sort_values("revenue_efficiency_percentile", ascending=False), min(n, 300)),
            "friction_rows": clustered_friction_rows[:max(top_n, 50)],
            "keyword_conversion": {
                "summary_cards": {
                "high_revenue_potential": {
                    "count": high_intent_count,
                    "formula": "Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                    "thresholds": {"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                    "items": _records(demand_winners_df, max(top_n, 50)),
                    "evidence": _mk_evidence(
                        metric_name="High Revenue Potential Keywords",
                        metric_value=high_intent_count,
                        formula="Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=high_intent_count,
                        rows_excluded=n - high_intent_count,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_min": 60},
                        example={
                            "rule": "Demand Percentile >= 60 AND Revenue Efficiency Index >= 60",
                            "top_keyword": _kw(best_converting),
                            "top_keyword_demand_percentile": _sv(best_converting.get("demand_percentile")) if best_converting is not None else None,
                            "top_keyword_efficiency_index": _sv(best_converting.get("revenue_efficiency_percentile")) if best_converting is not None else None,
                        },
                    ),
                },
                "friction_keywords": {
                    "count": friction_count,
                    "formula": "Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                    "thresholds": {"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                    "items": _records(friction_df, min(len(friction_df), 300)),  # individual keywords for popup
                    "clusters": clustered_friction_rows[:max(top_n, 50)],        # clusters for table
                    "evidence": _mk_evidence(
                        metric_name="Friction Keywords",
                        metric_value=friction_count,
                        formula="Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                        source_columns=["Keyword Phrase", "Search Volume", "Keyword Sales"],
                        rows_included=friction_count,
                        rows_excluded=n - friction_count,
                        thresholds={"demand_percentile_min": 60, "revenue_efficiency_percentile_max_exclusive": 40},
                        example={
                            "rule": "Demand Percentile >= 60 AND Revenue Efficiency Index < 40",
                            "top_friction_keyword": _kw(biggest_friction),
                            "top_friction_demand_percentile": _sv(biggest_friction.get("demand_percentile")) if biggest_friction is not None else None,
                            "top_friction_efficiency_index": _sv(biggest_friction.get("revenue_efficiency_percentile")) if biggest_friction is not None else None,
                        },
                    ),
                },
            },

            # Legacy fields (backward compat with existing SIEI consumers)
            "market_siei_score":                avg_efficiency,
            "highest_efficiency_keywords":      _records(demand_winners_df, top_n),
            "lowest_efficiency_keywords":       _records(friction_df,       top_n),
            "market_friction_keywords":         _records(friction_df,       top_n),
            "click_heavy_low_conversion_keywords": _records(friction_df,    top_n),
            "siei_percentile_20":               round(float(work["efficiency"].quantile(0.20)), 2),
            "siei_percentile_80":               round(float(work["efficiency"].quantile(0.80)), 2),
        },
        "validation": {
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning":  rows_after,
            "rows_skipped":         rows_before - rows_after,
            "numeric_columns_cleaned": [vol_col, sales_col],
            "data_quality_warning": data_quality_warning,
            "missing_required_columns": missing_required,
            "classification_dataset": class_info,
        },
        "processing_time_seconds": elapsed,
    }


def _generate_insights(
    n: int,
    high_intent_count: int,
    friction_count: int,
    avg_efficiency: float,
    best_converting: Any,
    biggest_friction: Any,
    total_lost_revenue: float,
    demand_winners_count: int,
) -> List[str]:
    insights: List[str] = []

    if high_intent_count > 0:
        insights.append(
            f"{high_intent_count} keyword{'s' if high_intent_count > 1 else ''} convert "
            f"above category expectations — these are your strongest demand-to-sales drivers."
        )

    if friction_count > 0:
        insights.append(
            f"{friction_count} keyword{'s' if friction_count > 1 else ''} attract significant "
            f"demand but under-convert into revenue — representing the highest optimization priority."
        )

    if best_converting is not None:
        kw = str(best_converting.get("keyword", "—"))
        short = kw[:45] + "…" if len(kw) > 45 else kw
        eff = float(best_converting.get("efficiency", 0))
        insights.append(
            f"'{short}' delivers the strongest revenue per search "
            f"with a Revenue Efficiency Index of {eff:.1f}/100."
        )

    if biggest_friction is not None:
        kw = str(biggest_friction.get("keyword", "—"))
        short = kw[:45] + "…" if len(kw) > 45 else kw
        insights.append(
            f"'{short}' attracts significant demand but under-converts relative to demand — "
            f"the largest single conversion leak in the category."
        )

    if total_lost_revenue > 0:
        insights.append(
            f"Estimated recoverable revenue from friction keywords: "
            f"${total_lost_revenue:,.0f}. Improving conversion on these keywords "
            f"represents the highest ROI optimization opportunity."
        )

    if avg_efficiency < 40:
        insights.append(
            "Overall conversion efficiency is low. Most keywords are failing to convert "
            "demand into sales — a well-optimised listing could capture significant share."
        )
    elif avg_efficiency >= 65:
        insights.append(
            "Category conversion efficiency is strong. Most keywords are converting "
            "demand effectively into sales."
        )

    return insights


def _sv(v: Any) -> Any:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 6)
    return v


def _error(msg: str, datasets: list, cols: list, rows: int, t0: float) -> Dict:
    return {
        "status": "error",
        "metric_name": "Keyword Conversion Intelligence",
        "summary": msg,
        "datasets_used": datasets,
        "columns_used": cols,
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": msg,
            "rows_before_cleaning": rows,
            "rows_after_cleaning": 0,
            "rows_skipped": rows,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
