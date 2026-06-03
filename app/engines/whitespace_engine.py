"""
Whitespace Engine
=================
Purpose  : Find high-demand keywords with weak competitor optimization.
Datasets : Magnet Keyword dataset

Opportunity Score (0-100) — percentile-ranked composite:
  40% Search Volume Percentile       — demand signal
  35% Keyword Sales Percentile       — revenue signal
  25% Inverse Competition Density    — low saturation signal
  Final score = percentile rank of weighted composite (full 0–100 spread)

Classification:
  >= 80  Extreme Opportunity
  65-79  High Opportunity
  50-64  Moderate Opportunity
  < 50   Low Opportunity

Opportunity Driver: determined by the strongest contributing factor(s).

Numeric cleaning is applied before every normalisation step.
"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.category_rules import get_matching_categories
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("whitespace_engine")

_KEYWORD_CANDIDATES = [
    "Keyword Phrase", "keyword phrase", "Keyword", "keyword",
]
_SEARCH_VOL_CANDIDATES = [
    "Search Volume", "search volume", "SearchVolume", "Monthly Search Volume",
]
_TITLE_DENSITY_CANDIDATES = [
    "Title Density", "title density", "TitleDensity",
]
_CONV_CANDIDATES = [
    "Conversion Rate", "ABA Total Conv. Share", "conversion rate", "ABA Total Conversion Share"
]
_SALES_CANDIDATES = [
    "Keyword Sales", "keyword sales", "Sales", "sales"
]
_COMP_CANDIDATES = [
    "Competing Products", "competing products", "CPR"
]
_TREND_CANDIDATES = [
    "Search Volume Trend", "search volume trend", "Trend", "trend"
]
_IQ_CANDIDATES = [
    "Cerebro IQ Score", "cerebro iq score", "IQ Score", "iq score", "IQ",
]
_CLICK_SHARE_CANDIDATES = [
    "ABA Total Click Share", "ABA Total Click Share (%)", "Click Share", "click share"
]
_CONV_SHARE_CANDIDATES = [
    "ABA Total Conv. Share", "ABA Total Conversion Share", "Conversion Share", "conversion share"
]

_SEGMENT_COLUMN_CANDIDATES = [
    "Segment", "segment",
    "Category", "category",
    "Theme", "theme",
    "Classification", "classification",
    "Product Theme", "product theme",
    "Keyword Category", "keyword category",
]

_PRICE_CANDIDATES = [
    "Estimated Price", "ASP", "Average Selling Price", "avg selling price",
    "Price", "price", "List Price", "list price",
]

_REVENUE_CANDIDATES = [
    "Keyword Revenue", "keyword revenue", "Revenue", "revenue",
    "Estimated Revenue", "estimated revenue",
]

_STOP_SEGMENT_WORDS = {
    "for", "and", "the", "with", "in", "of", "a", "an", "to", "on", "at", "by",
    "from", "or", "as", "is", "it", "be", "are", "was", "were", "has", "have",
    "women", "womens", "men", "mens", "large", "small", "new", "best", "top",
    "good", "great", "thin", "thick", "pack", "set", "lot", "sale", "buy",
}


def _normalize_keyword_text(keyword: Any) -> Optional[str]:
    if keyword is None or pd.isna(keyword):
        return None
    normalized = re.sub(r"\s+", " ", str(keyword).strip()).lower()
    return normalized if normalized != "" else None


def _build_keyword_classification_map(kc_df: Optional[pd.DataFrame]) -> Dict[str, str]:
    if kc_df is None or kc_df.empty:
        return {}
    kw_col = find_column(kc_df, _KEYWORD_CANDIDATES)
    class_col = find_column(kc_df, [
        "classification", "Classification",
        "category", "Category",
        "segment", "Segment",
        "theme", "Theme",
    ])
    if not kw_col or not class_col:
        return {}

    mapping: Dict[str, str] = {}
    for _, row in kc_df[[kw_col, class_col]].iterrows():
        normalized = _normalize_keyword_text(row.get(kw_col))
        label = str(row.get(class_col, "")).strip()
        if normalized and label:
            if normalized not in mapping:
                mapping[normalized] = label
    return mapping


def _assign_dynamic_segment(keyword: str) -> str:
    normalized = _normalize_keyword_text(keyword)
    if not normalized:
        return "General Search Terms"
    tokens = [
        re.sub(r"[^a-z0-9]+", "", token)
        for token in normalized.split()
        if token and token not in _STOP_SEGMENT_WORDS
    ]
    tokens = [token for token in tokens if len(token) > 2]
    if tokens:
        root = max(tokens, key=len)
        return f"{root.title()} Segment"
    return "General Search Terms"


def _compute_conversion_efficiency_score(
    click_share: Optional[float],
    conversion_share: Optional[float],
) -> Optional[float]:
    if click_share is None or conversion_share is None:
        return None
    if click_share <= 0:
        return None
    score = (conversion_share / click_share) * 100.0
    return float(np.clip(score, 0.0, 100.0))


def _keyword_revenue_value(row: Dict[str, Any]) -> float:
    sales = float(row.get("_sales_clean", 0) or 0)
    price = float(row.get("_price_clean", 0) or 0)
    revenue = float(row.get("_revenue_clean", 0) or 0)
    if sales > 0 and price > 0:
        return round(sales * price, 2)
    if revenue > 0:
        return round(revenue, 2)
    if sales > 0:
        return round(sales, 2)
    return 0.0


def _build_segment_keyword_record(row: Dict[str, Any], keyword_col: str) -> Dict[str, Any]:
    normalized_keyword = _normalize_keyword_text(row.get(keyword_col)) or ""
    click_share = float(row.get("_click_clean")) if pd.notna(row.get("_click_clean")) else None
    conversion_share = float(row.get("_conv_clean")) if pd.notna(row.get("_conv_clean")) else None
    return {
        "keyword": str(row[keyword_col]).strip() if keyword_col and row.get(keyword_col) is not None else "",
        "normalized_keyword": normalized_keyword,
        "search_volume": int(row.get("_vol_clean", 0)) if pd.notna(row.get("_vol_clean")) else 0,
        "click_share": click_share,
        "conversion_share": conversion_share,
        "keyword_sales": int(row.get("_sales_clean", 0)) if pd.notna(row.get("_sales_clean")) else 0,
        "conversion_efficiency_score": _compute_conversion_efficiency_score(click_share, conversion_share),
        "opportunity_score": _format_score(float(row.get("_opp_score", 0))) if row.get("_opp_score") is not None else None,
        "classification": str(row.get("_opp_label", "")) if row.get("_opp_label") is not None else "",
        "source_dataset": "Magnet",
        "title_density": float(row.get("_density_clean")) if pd.notna(row.get("_density_clean")) else None,
    }


def _dedupe_keyword_rows(rows: List[Dict[str, Any]], keyword_col: str) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    ordered: List[Dict[str, Any]] = []
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            -float(r.get("_opp_score", 0) or 0),
            -float(r.get("_sales_clean", 0) or 0),
        ),
    )
    for row in sorted_rows:
        normalized = _normalize_keyword_text(row.get(keyword_col))
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(row)
    return ordered


def _classify_opportunity(score: float) -> str:
    if score >= 80:
        return "Extreme Opportunity"
    elif score >= 65:
        return "High Opportunity"
    elif score >= 50:
        return "Moderate Opportunity"
    else:
        return "Low Opportunity"


def _opportunity_driver(
    vol_pct: float,
    sales_pct: float,
    inv_competition_pct: float,
) -> str:
    HIGH = 70.0
    drivers = []
    if vol_pct >= HIGH:
        drivers.append("High Demand")
    if sales_pct >= HIGH:
        drivers.append("High Revenue")
    if inv_competition_pct >= HIGH:
        drivers.append("Low Competition")
    if vol_pct >= HIGH and sales_pct >= HIGH:
        return "High Demand + High Revenue"
    if vol_pct >= HIGH and inv_competition_pct >= HIGH:
        return "High Demand + Low Competition"
    if sales_pct >= HIGH and inv_competition_pct >= HIGH:
        return "Revenue Gap"
    if not drivers:
        best = max(
            [
                ("High Demand", vol_pct),
                ("High Revenue", sales_pct),
                ("Low Competition", inv_competition_pct),
            ],
            key=lambda x: x[1],
        )
        return best[0]
    return " + ".join(drivers[:2])


def _assess_title_density_reliability(density: pd.Series) -> bool:
    """True when title density has enough non-zero variance to use as competition proxy."""
    numeric = pd.to_numeric(density, errors="coerce").fillna(0)
    if numeric.empty:
        return False
    zero_share = float((numeric == 0).sum()) / len(numeric)
    nonzero = numeric[numeric > 0]
    if zero_share >= 0.85:
        return False
    if len(nonzero) < 10 or nonzero.nunique() < 5:
        return False
    return True


def _build_competition_density(
    df: pd.DataFrame,
    title_density_reliable: bool,
) -> pd.Series:
    """
    Higher values = more competitive saturation.
    Prefer title density when reliable; otherwise competing products count.
    """
    if title_density_reliable:
        return df["_density_clean"].fillna(0).astype(float)
    comp = df["_comp_clean"]
    if comp.notna().sum() >= max(10, len(comp) * 0.05) and comp.fillna(0).gt(0).sum() >= 10:
        return comp.fillna(comp.median()).astype(float)
    return pd.Series(50.0, index=df.index, dtype=float)


def _format_score(val: float) -> float:
    if np.isnan(val):
        return 0.0
    return round(float(np.clip(val, 0.0, 100.0)), 2)


def _percentile_rank(series: pd.Series) -> pd.Series:
    n = series.notna().sum()
    if n < 2:
        return pd.Series(50.0, index=series.index)
    ranks = series.rank(method="average", ascending=True, na_option="keep")
    pct = (ranks - 1) / (n - 1) * 100.0
    return pct.clip(0, 100)


def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    keyword_classification_df: Optional[pd.DataFrame] = None,
    top_n: int = 15,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Whitespace engine started.")

    rows_magnet = len(magnet_df) if magnet_df is not None else 0

    if magnet_df is None or magnet_df.empty:
        return _error_response(
            "No Magnet keyword dataset available.", [], [],
            rows_magnet, 0, rows_magnet, t0,
        )

    keyword_col       = find_column(magnet_df, _KEYWORD_CANDIDATES)
    search_vol_col    = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    title_density_col = find_column(magnet_df, _TITLE_DENSITY_CANDIDATES)
    sales_col         = find_column(magnet_df, _SALES_CANDIDATES)
    comp_col          = find_column(magnet_df, _COMP_CANDIDATES)
    trend_col         = find_column(magnet_df, _TREND_CANDIDATES)
    iq_col            = find_column(magnet_df, _IQ_CANDIDATES)

    if not search_vol_col:
        return _error_response(
            "Required column 'Search Volume' not found in Magnet dataset.",
            ["magnet"], ["Search Volume"], rows_magnet, 0, rows_magnet, t0,
        )

    df = magnet_df.copy()
    numeric_cols_cleaned: List[str] = []

    def process_col(col_name: Optional[str]) -> pd.Series:
        if col_name:
            clean, _ = clean_numeric_series(df[col_name], col_name)
            numeric_cols_cleaned.append(col_name)
            return clean
        return pd.Series(0.0, index=df.index)

    click_share_col = find_column(df, _CLICK_SHARE_CANDIDATES)
    conv_share_col = find_column(df, _CONV_SHARE_CANDIDATES)
    price_col = find_column(df, _PRICE_CANDIDATES)
    revenue_col = find_column(df, _REVENUE_CANDIDATES)

    df["_vol_clean"]     = process_col(search_vol_col)
    df["_density_clean"] = process_col(title_density_col)
    df["_sales_clean"]   = process_col(sales_col)
    df["_comp_clean"]    = process_col(comp_col)
    df["_trend_clean"]   = process_col(trend_col)
    df["_iq_clean"]      = process_col(iq_col)
    df["_click_clean"]   = process_col(click_share_col)
    df["_conv_clean"]    = process_col(conv_share_col)
    df["_price_clean"]   = process_col(price_col)
    df["_revenue_clean"] = process_col(revenue_col)

    classification_map = _build_keyword_classification_map(keyword_classification_df)

    df_valid = df.dropna(subset=["_vol_clean"]).copy()
    rows_before  = len(df)
    rows_after   = len(df_valid)
    rows_skipped = rows_before - rows_after

    if rows_after == 0:
        return _error_response(
            "No valid keyword data after cleaning.",
            ["magnet"], [search_vol_col],
            rows_before, 0, rows_before, t0,
        )

    n = rows_after

    title_density_reliable = (
        title_density_col is not None
        and _assess_title_density_reliability(df_valid["_density_clean"])
    )
    df_valid["_comp_density"] = _build_competition_density(df_valid, title_density_reliable)

    # ── Percentile ranks (0-100) ─────────────────────────────────────────────
    df_valid["_vol_pct"] = _percentile_rank(df_valid["_vol_clean"])
    sales_series = df_valid["_sales_clean"].fillna(0)
    df_valid["_sales_pct"] = 0.0
    sales_positive_mask = sales_series > 0
    if int(sales_positive_mask.sum()) >= 2:
        df_valid.loc[sales_positive_mask, "_sales_pct"] = _percentile_rank(
            sales_series[sales_positive_mask]
        )
    df_valid["_comp_pct"] = _percentile_rank(df_valid["_comp_density"])
    # Lower competition density percentile → better opportunity
    df_valid["_inv_comp_pct"] = 100.0 - df_valid["_comp_pct"]

    # ── Opportunity Score: percentile-rank weighted composite (full 0–100) ───
    composite_signal = (
        0.40 * df_valid["_vol_pct"].fillna(0.0)
        + 0.35 * df_valid["_sales_pct"].fillna(0.0)
        + 0.25 * df_valid["_inv_comp_pct"].fillna(0.0)
    )
    df_valid["_opp_score"] = _percentile_rank(composite_signal)

    # ── Classification & driver ──────────────────────────────────────────────
    df_valid["_opp_label"] = [_classify_opportunity(x) for x in df_valid["_opp_score"]]
    df_valid["_opp_driver"] = [
        _opportunity_driver(v, s, c)
        for v, s, c in zip(df_valid["_vol_pct"], df_valid["_sales_pct"], df_valid["_inv_comp_pct"])
    ]

    # ── Aggregate stats ──────────────────────────────────────────────────────
    overall_score = _format_score(float(df_valid["_opp_score"].mean()))

    opp_counts = df_valid["_opp_label"].value_counts().to_dict()
    opportunity_distribution = {
        "low_opportunity":      int(opp_counts.get("Low Opportunity",      0)),
        "moderate_opportunity": int(opp_counts.get("Moderate Opportunity", 0)),
        "high_opportunity":     int(opp_counts.get("High Opportunity",     0)),
        "extreme_opportunity":  int(opp_counts.get("Extreme Opportunity",  0)),
    }

    extreme_count = opportunity_distribution["extreme_opportunity"]
    high_count    = opportunity_distribution["high_opportunity"]

    # ── Revenue opportunity signal (realistic, not gross category sales) ───────
    high_extreme_mask = df_valid["_opp_label"].isin(["High Opportunity", "Extreme Opportunity"])
    measurable_sales_mask = df_valid["_sales_clean"].fillna(0) > 0

    total_measurable_keyword_sales = float(
        df_valid.loc[measurable_sales_mask, "_sales_clean"].fillna(0).sum()
    )
    total_category_keyword_sales = total_measurable_keyword_sales

    sales_values = df_valid["_sales_clean"].fillna(0)
    extreme_mask = df_valid["_opp_label"] == "Extreme Opportunity"
    high_mask = df_valid["_opp_label"] == "High Opportunity"

    revenue_extreme_tier = float(sales_values.loc[extreme_mask].sum())
    revenue_high_tier = float(sales_values.loc[high_mask].sum())
    revenue_gross_high_extreme = float(sales_values.loc[high_extreme_mask].sum())

    # Addressable signal: full extreme-tier sales + partial high-tier (moderate excluded)
    revenue_opportunity_pool = revenue_extreme_tier + (0.35 * revenue_high_tier)

    # Realistic ceiling: whitespace cannot exceed ~60% of measurable category sales
    _MAX_ADDRESSABLE_SHARE = 0.60
    realistic_cap = total_measurable_keyword_sales * _MAX_ADDRESSABLE_SHARE
    revenue_capped = False
    if total_measurable_keyword_sales > 0 and revenue_opportunity_pool > realistic_cap:
        revenue_opportunity_pool = realistic_cap
        revenue_capped = True

    revenue_opportunity_pool = min(revenue_opportunity_pool, total_measurable_keyword_sales)

    revenue_pct_of_category_sales = (
        round(revenue_opportunity_pool / total_measurable_keyword_sales * 100.0, 1)
        if total_measurable_keyword_sales > 0
        else 0.0
    )
    revenue_pct_of_category_sales = min(revenue_pct_of_category_sales, 100.0)

    opportunity_universe_count = int(high_extreme_mask.sum())
    revenue_pct_of_opportunity_universe = (
        round(opportunity_universe_count / n * 100.0, 1) if n > 0 else 0.0
    )

    # ── Top keywords ─────────────────────────────────────────────────────────
    df_sorted = df_valid.sort_values("_opp_score", ascending=False)

    def _build_record(row: pd.Series) -> Dict[str, Any]:
        record: Dict[str, Any] = {
            "keyword": str(row[keyword_col]) if keyword_col else "N/A",
            "search_volume": int(row["_vol_clean"]) if pd.notna(row["_vol_clean"]) else 0,
            "keyword_sales": int(row["_sales_clean"]) if pd.notna(row["_sales_clean"]) else 0,
            "competition_percentile": _format_score(row["_comp_pct"]),
            "whitespace_score": _format_score(row["_opp_score"]),
            "opportunity_label": row["_opp_label"],
            "opportunity_driver": row["_opp_driver"],
            "opportunity_score": _format_score(row["_opp_score"]),
        }
        density_val = row["_density_clean"]
        if title_density_reliable and pd.notna(density_val):
            record["title_density"] = _format_score(density_val)
        else:
            record["title_density"] = None
            
        if "exact_search_volume" in row.index:
            record["exact_search_volume"] = int(row["exact_search_volume"]) if pd.notna(row["exact_search_volume"]) else 0
        if "variant_count" in row.index:
            record["variant_count"] = int(row["variant_count"]) if pd.notna(row["variant_count"]) else 0
            
        return record

    top_keywords: List[Dict[str, Any]] = [
        _build_record(row) for _, row in df_sorted.head(top_n).iterrows()
    ]

    high_search_low_density_keywords: List[Dict[str, Any]] = [
        _build_record(row)
        for _, row in df_sorted[df_sorted["_opp_score"] >= 65].head(top_n).iterrows()
    ]

    # ── Best opportunity keyword ─────────────────────────────────────────────
    best_kw: Dict[str, Any] = {}
    if not df_sorted.empty:
        best_row = df_sorted.iloc[0]
        best_kw = {
            "keyword":            str(best_row[keyword_col]) if keyword_col else "N/A",
            "search_volume":      int(best_row["_vol_clean"])   if pd.notna(best_row["_vol_clean"])   else 0,
            "keyword_sales":      int(best_row["_sales_clean"]) if pd.notna(best_row["_sales_clean"]) else 0,
            "opportunity_score":  _format_score(best_row["_opp_score"]),
            "opportunity_driver": best_row["_opp_driver"],
        }

    top_drivers = df_valid.loc[high_extreme_mask, "_opp_driver"].value_counts()
    most_common_driver = str(top_drivers.index[0]) if not top_drivers.empty else "Low Competition"

    # ── Keyword theme analysis (top opportunities by score) ─────────────────
    theme_keyword_sample: List[str] = []
    if keyword_col:
        theme_keyword_sample = [
            str(kw).lower()
            for kw in df_sorted.loc[df_sorted["_opp_score"] >= 50, keyword_col]
            .dropna()
            .head(150)
            .tolist()
        ]

    heatmap_limit = min(100, len(df_sorted))
    heatmap_keywords: List[Dict[str, Any]] = [
        _build_record(row) for _, row in df_sorted.head(heatmap_limit).iterrows()
    ]

    df_high_extreme = df_valid.loc[high_extreme_mask] if high_extreme_mask.any() else df_sorted.head(0)
    entry_segments, best_entry_cluster, segments_reliable = _build_entry_segments(
        df_high_extreme, keyword_col, classification_map
    )
    top_entry_segments = _build_top_entry_segments_analysis(entry_segments)

    # ── Insights (segment-first) ─────────────────────────────────────────────
    insights = _generate_insights(
        extreme_count=extreme_count,
        high_count=high_count,
        total_keywords=n,
        overall_score=overall_score,
        revenue_opportunity_pool=revenue_opportunity_pool,
        revenue_pct_of_category_sales=revenue_pct_of_category_sales,
        entry_segments=entry_segments,
        best_entry_cluster=best_entry_cluster,
        top_entry_segments=top_entry_segments,
    )

    # ── Summary ──────────────────────────────────────────────────────────────
    if extreme_count > 0:
        summary = (
            f"Found {extreme_count} extreme whitespace opportunities "
            f"({extreme_count/n*100:.1f}% of keywords). "
            f"An additional {high_count} high-opportunity keywords identified."
        )
    elif high_count > 0:
        summary = (
            f"Found {high_count} high-opportunity keywords "
            f"({high_count/n*100:.1f}% of keywords). "
            f"Overall opportunity score: {overall_score}/100."
        )
    else:
        summary = (
            f"Whitespace analysis complete. Most keywords show existing competitor optimization. "
            f"Overall opportunity score: {overall_score}/100."
        )

    # ── Evidence metadata for frontend drawers ──────────────────────────────
    competition_source = title_density_col if title_density_reliable else comp_col
    evidence_metadata = {
        "formula": {
            "opportunity_score": (
                "Opportunity Score = percentile-rank("
                "Search Volume × 40% + Keyword Sales × 35% + Inverse Competition × 25%"
                "). Final score = percentile rank of the composite within all valid keywords."
            ),
            "extreme_opportunity": "Opportunity Score ≥ 80 (top tier — highest demand + revenue + accessibility)",
            "high_opportunity": "Opportunity Score ≥ 65 and < 80 (strong but not top tier)",
            "revenue_signal": (
                "Revenue Signal = (Extreme-tier keyword sales) + 0.35 × (High-tier keyword sales), "
                "capped at 60% of total measurable category keyword sales."
            ),
        },
        "source_dataset": "Magnet",
        "columns_used": {
            "search_volume": search_vol_col,
            "keyword_sales": sales_col,
            "competition": competition_source,
            "title_density": title_density_col if title_density_reliable else None,
            "click_share": click_share_col,
            "conversion_share": conv_share_col,
        },
        "rows_included": rows_after,
        "rows_excluded": rows_skipped,
        "total_keywords": n,
        "extreme_threshold": 80,
        "high_threshold": 65,
        "score_weights": {
            "search_volume_pct": 0.40,
            "keyword_sales_pct": 0.35,
            "inv_competition_pct": 0.25,
        },
        "competition_column_used": competition_source,
        "title_density_reliable": title_density_reliable,
        "revenue_signal_source": "Keyword Sales" if sales_col else "Not available",
        "revenue_capped": revenue_capped,
        "revenue_cap_threshold_pct": 60,
        "top_extreme_keywords": [
            {k: v for k, v in kw.items() if k in ("keyword", "search_volume", "keyword_sales", "opportunity_score", "opportunity_driver")}
            for kw in top_keywords[:5]
            if kw.get("opportunity_score", 0) >= 80
        ] or [{k: v for k, v in kw.items() if k in ("keyword", "search_volume", "keyword_sales", "opportunity_score", "opportunity_driver")} for kw in top_keywords[:3]],
    }

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Whitespace engine complete: n={n}, score={overall_score}, "
        f"extreme={extreme_count}, high={high_count}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Whitespace Opportunity",
        "summary": summary,
        "datasets_used": ["magnet"],
        "columns_used": numeric_cols_cleaned,
        "formula_used": (
            "Opportunity Score = percentile-rank(40%×SearchVolPct + 35%×KeywordSalesPct "
            "+ 25%×InvCompetitionDensityPct). Competition from title density or competing products."
        ),
        "results": {
            "overall_whitespace_score":         overall_score,
            "total_keywords_analyzed":          n,
            "revenue_opportunity_pool":         round(revenue_opportunity_pool, 2),
            "total_category_keyword_sales":     round(total_category_keyword_sales, 2),
            "revenue_pct_of_category_sales":    revenue_pct_of_category_sales,
            "revenue_pct_of_opportunity_universe": revenue_pct_of_opportunity_universe,
            "title_density_reliable":           title_density_reliable,
            "best_opportunity_keyword":         best_kw,
            "most_common_driver":               most_common_driver,
            "top_whitespace_keywords":          top_keywords,
            "heatmap_keywords":                 heatmap_keywords,
            "high_search_low_density_keywords": high_search_low_density_keywords,
            "opportunity_distribution":         opportunity_distribution,
            "entry_segments":                   entry_segments,
            "best_entry_cluster":               best_entry_cluster,
            "segments_reliable":                segments_reliable,
            "top_entry_segments":               top_entry_segments,
            "opportunity_driver_breakdown":     [],  # legacy; replaced by top_entry_segments
            "revenue_opportunity_gross":        round(revenue_gross_high_extreme, 2),
            "revenue_signal_capped": revenue_capped,
            "revenue_signal_method": (
                "Extreme-tier keyword sales plus 35% of high-tier sales, "
                "capped at 60% of measurable category sales to reflect realistic addressable opportunity."
            ),
            "insights":                         insights,
            "evidence_metadata":                evidence_metadata,
        },
        "validation": {
            "rows_before_cleaning":    rows_before,
            "rows_after_cleaning":     rows_after,
            "rows_skipped":            rows_skipped,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "missing_columns":         [],
        },
        "processing_time_seconds": elapsed,
    }


# Removed legacy _SEGMENT_RULES and _assign_entry_segment since we are using get_matching_categories now.


def _derive_cluster_name(rows: List[Dict[str, Any]], keyword_col: str) -> str:
    """Name a keyword cluster from its dominant search themes (never 'Other Niches')."""
    if not rows or keyword_col not in rows[0]:
        return "Emerging Micro-Segment"
    keywords = [str(r[keyword_col]).lower() for r in rows if pd.notna(r[keyword_col])]
    themes = _extract_themes(keywords, top_n=3)
    if len(themes) >= 2:
        return " / ".join(t.title() for t in themes[:2])
    if themes:
        t = themes[0]
        return t.title() if " " in t else f"{t.title()} Segment"
    words = [
        w.strip(".,!?-()[]\"'")
        for kw in keywords
        for w in kw.split()
        if len(w.strip(".,!?-()[]\"'")) > 3
    ]
    if words:
        from collections import Counter
        top = Counter(words).most_common(1)[0][0]
        return f"{top.title()} Segment"
    return f"Micro-Segment ({len(rows)} keywords)"


def _competitive_intensity_label(mean_comp_pct: float) -> str:
    if mean_comp_pct <= 33:
        return "Low"
    if mean_comp_pct <= 66:
        return "Moderate"
    return "High"


def _recommended_action(priority: str) -> str:
    actions = {
        "Enter First": "Launch catalog and positioning in this segment first",
        "Evaluate": "Validate demand with limited SKU test before scaling",
        "Low Priority": "Monitor — enter only after priority segments are established",
    }
    return actions.get(priority, "Evaluate segment fit before investment")


def _build_entry_segments(
    df_opp: pd.DataFrame,
    keyword_col: Optional[str],
    classification_map: Optional[Dict[str, str]] = None,
    min_cluster_size: int = 3,
) -> tuple:
    """Aggregate high/extreme opportunity keywords into entry segments."""
    if df_opp.empty or not keyword_col or keyword_col not in df_opp.columns:
        return [], None, False

    segment_col = find_column(df_opp, _SEGMENT_COLUMN_CANDIDATES)
    classification_map = classification_map or {}

    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for row in df_opp.to_dict("records"):
        normalized_keyword = _normalize_keyword_text(row.get(keyword_col))
        if not normalized_keyword:
            continue

        labels = set()

        # From HEAD: Check segment column
        if segment_col and row.get(segment_col) is not None:
            label_value = str(row.get(segment_col)).strip()
            if label_value:
                labels.add(label_value)

        # From HEAD: Check classification map
        if normalized_keyword in classification_map:
            labels.add(classification_map[normalized_keyword])

        # From remote: Match categories
        rule_labels = get_matching_categories(str(row[keyword_col]))
        for rl in rule_labels:
            if rl != "Other":
                labels.add(rl)

        # Fallbacks if no labels yet
        if not labels:
            dyn_label = _assign_dynamic_segment(str(row[keyword_col]))
            if dyn_label != "General Search Terms":
                labels.add(dyn_label)
            elif "Other" in rule_labels:
                labels.add("Other")
            else:
                labels.add(dyn_label)

        for label in labels:
            buckets.setdefault(label, []).append(row)

    merged: Dict[str, List[Dict[str, Any]]] = {}
    for label, rows in buckets.items():
        seg_name = label if len(rows) >= min_cluster_size else _derive_cluster_name(rows, keyword_col)
        base = seg_name
        suffix = 1
        while seg_name in merged:
            seg_name = f"{base} ({suffix})"
            suffix += 1
        merged.setdefault(seg_name, []).extend(rows)

    segments: List[Dict[str, Any]] = []
    for label, rows in merged.items():
        unique_rows = _dedupe_keyword_rows(rows, keyword_col)
        raw_row_count = len(rows)
        keyword_records = [_build_segment_keyword_record(row, keyword_col) for row in unique_rows]
        keyword_count = len(keyword_records)

        revenue = round(sum(_keyword_revenue_value(row) for row in unique_rows), 2)
        mean_vol = float(np.mean([float(r["_vol_clean"]) for r in unique_rows])) if unique_rows else 0.0
        mean_comp = float(np.mean([float(r["_comp_pct"]) for r in unique_rows])) if unique_rows else 0.0
        drivers = [str(r["_opp_driver"]) for r in unique_rows]
        primary_driver = max(set(drivers), key=drivers.count) if drivers else "—"
        avg_opportunity_score = (
            round(float(np.mean([_format_score(float(r.get("_opp_score", 0) or 0)) for r in unique_rows])), 2)
            if unique_rows else None
        )

        segments.append({
            "segment": label,
            "opportunity_keywords": keyword_count,
            "keyword_count": keyword_count,
            "unique_keywords_after_dedupe": keyword_count,
            "raw_rows_before_dedupe": raw_row_count,
            "duplicate_rows_removed": raw_row_count - keyword_count,
            "opportunity_revenue": revenue,
            "revenue_represented": revenue,
            "mean_search_volume": mean_vol,
            "mean_competition_pct": mean_comp,
            "primary_driver": primary_driver,
            "keywords": keyword_records,
            "avg_opportunity_score": avg_opportunity_score,
        })

    if len(segments) >= 2:
        vols = pd.Series([s["mean_search_volume"] for s in segments])
        revs = pd.Series([s["opportunity_revenue"] for s in segments])
        comps = pd.Series([s["mean_competition_pct"] for s in segments])
        composite = (
            0.40 * _percentile_rank(vols)
            + 0.35 * _percentile_rank(revs)
            + 0.25 * (100.0 - _percentile_rank(comps))
        )
        spread_scores = _percentile_rank(composite)
        for seg, spread in zip(segments, spread_scores):
            seg["avg_opportunity_score"] = round(float(spread), 2)
    elif len(segments) == 1:
        if segments[0]["avg_opportunity_score"] is None:
            segments[0]["avg_opportunity_score"] = 75.0

    for seg in segments:
        keyword_length = len(seg.get("keywords", []))
        if seg.get("opportunity_keywords") != keyword_length:
            logger.error(
                "Segment '%s' opportunity_keywords mismatch: %s vs actual keywords %s",
                seg.get("segment"),
                seg.get("opportunity_keywords"),
                keyword_length,
            )
            seg["opportunity_keywords"] = keyword_length
        if seg.get("keyword_count") != keyword_length:
            seg["keyword_count"] = keyword_length
        if seg.get("unique_keywords_after_dedupe") != keyword_length:
            seg["unique_keywords_after_dedupe"] = keyword_length
        expected_dupes = seg.get("raw_rows_before_dedupe", 0) - keyword_length
        if seg.get("duplicate_rows_removed") != expected_dupes:
            logger.error(
                "Segment '%s' duplicate_removed_count recalculated: %s -> %s",
                seg.get("segment"),
                seg.get("duplicate_rows_removed"),
                expected_dupes,
            )
            seg["duplicate_rows_removed"] = expected_dupes

    segments.sort(
        key=lambda s: (
            s["opportunity_revenue"],
            s.get("avg_opportunity_score") or 0,
            s["keyword_count"],
        ),
        reverse=True,
    )
    max_revenue = segments[0]["opportunity_revenue"] if segments else 0.0
    for rank, seg in enumerate(segments, start=1):
        seg["rank"] = rank
        priority = _recommended_priority(
            rank,
            float(seg.get("avg_opportunity_score") if seg.get("avg_opportunity_score") is not None else 0.0),
            seg["opportunity_revenue"],
            max_revenue,
        )
        seg["recommended_priority"] = priority
        seg["competitive_intensity"] = _competitive_intensity_label(
            float(seg.get("mean_competition_pct", 50))
        )
        seg["recommended_action"] = _recommended_action(priority)

    _BROAD_CATCHALL_NAMES = {
        "generic", "other", "general search terms", "general", "misc", "miscellaneous",
        "broad", "catch-all", "catchall", "unclassified",
    }

    def _is_broad_catchall(name: str) -> bool:
        return name.strip().lower() in _BROAD_CATCHALL_NAMES

    best = segments[0]["segment"] if segments else None
    # Prefer the first actionable (non-catchall) segment if the top segment is a broad catch-all
    if best and _is_broad_catchall(best):
        for seg in segments[1:]:
            if not _is_broad_catchall(seg["segment"]):
                # Only prefer it if it has meaningful keywords
                if seg.get("keyword_count", 0) >= 3:
                    best = seg["segment"]
                    break
    reliable = (
        len(segments) >= 2
        and segments[0]["keyword_count"] >= min_cluster_size
        and any(s["keyword_count"] >= min_cluster_size for s in segments[1:3])
    )
    return segments, best, reliable


def get_revenue_segment_keywords(
    magnet_df: Optional[pd.DataFrame],
    segment_name: str,
    keyword_classification_df: Optional[pd.DataFrame] = None,
) -> Dict[str, Any]:
    if magnet_df is None or magnet_df.empty:
        return {
            "success": False,
            "segment": segment_name,
            "raw_row_count": 0,
            "duplicate_removed_count": 0,
            "keyword_count": 0,
            "keywords": [],
        }

    keyword_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    if not keyword_col:
        return {
            "success": False,
            "segment": segment_name,
            "raw_row_count": 0,
            "duplicate_removed_count": 0,
            "keyword_count": 0,
            "keywords": [],
        }

    search_vol_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    title_density_col = find_column(magnet_df, _TITLE_DENSITY_CANDIDATES)
    sales_col = find_column(magnet_df, _SALES_CANDIDATES)
    comp_col = find_column(magnet_df, _COMP_CANDIDATES)
    trend_col = find_column(magnet_df, _TREND_CANDIDATES)
    iq_col = find_column(magnet_df, _IQ_CANDIDATES)
    click_share_col = find_column(magnet_df, _CLICK_SHARE_CANDIDATES)
    conv_share_col = find_column(magnet_df, _CONV_SHARE_CANDIDATES)

    df = magnet_df.copy()

    def process_col(col_name: Optional[str]) -> pd.Series:
        if col_name:
            clean, _ = clean_numeric_series(df[col_name], col_name)
            return clean
        return pd.Series(0.0, index=df.index)

    df["_vol_clean"] = process_col(search_vol_col)
    df["_density_clean"] = process_col(title_density_col)
    df["_sales_clean"] = process_col(sales_col)
    df["_comp_clean"] = process_col(comp_col)
    df["_trend_clean"] = process_col(trend_col)
    df["_iq_clean"] = process_col(iq_col)
    df["_click_clean"] = process_col(click_share_col)
    df["_conv_clean"] = process_col(conv_share_col)

    df_valid = df.dropna(subset=["_vol_clean"]).copy()
    if df_valid.empty:
        return {
            "success": False,
            "segment": segment_name,
            "raw_row_count": 0,
            "duplicate_removed_count": 0,
            "keyword_count": 0,
            "keywords": [],
        }

    sales_series = df_valid["_sales_clean"].fillna(0)
    df_valid["_sales_pct"] = 0.0
    sales_positive_mask = sales_series > 0
    if int(sales_positive_mask.sum()) >= 2:
        df_valid.loc[sales_positive_mask, "_sales_pct"] = _percentile_rank(
            sales_series[sales_positive_mask]
        )
    df_valid["_comp_pct"] = _percentile_rank(df_valid["_comp_clean"])
    df_valid["_inv_comp_pct"] = 100.0 - df_valid["_comp_pct"]
    composite_signal = (
        0.40 * _percentile_rank(df_valid["_vol_clean"].fillna(0.0))
        + 0.35 * df_valid["_sales_pct"].fillna(0.0)
        + 0.25 * df_valid["_inv_comp_pct"].fillna(0.0)
    )
    df_valid["_opp_score"] = _percentile_rank(composite_signal)
    df_valid["_opp_label"] = [_classify_opportunity(x) for x in df_valid["_opp_score"]]
    df_valid["_opp_driver"] = [
        _opportunity_driver(v, s, c)
        for v, s, c in zip(df_valid["_vol_clean"], df_valid["_sales_pct"], df_valid["_inv_comp_pct"])
    ]

    high_extreme_mask = df_valid["_opp_label"].isin(["High Opportunity", "Extreme Opportunity"])
    df_high_extreme = df_valid.loc[high_extreme_mask] if high_extreme_mask.any() else df_valid.head(0)
    classification_map = _build_keyword_classification_map(keyword_classification_df)
    segments, _, _ = _build_entry_segments(df_high_extreme, keyword_col, classification_map)

    for seg in segments:
        seg_key = seg["segment"]
        if seg_key == segment_name or seg_key.strip().lower() == segment_name.strip().lower():
            kw_list = seg.get("keywords", [])
            raw_count = seg.get("raw_rows_before_dedupe", len(kw_list))
            dupe_count = seg.get("duplicate_rows_removed", 0)
            return {
                "success": True,
                "segment": segment_name,
                "opportunity_revenue": seg.get("opportunity_revenue", 0.0),
                "opportunity_keywords": seg.get("opportunity_keywords", len(kw_list)),
                "keyword_count": len(kw_list),
                "avg_opportunity_score": seg.get("avg_opportunity_score"),
                "raw_rows_before_dedupe": raw_count,
                "unique_keywords_after_dedupe": len(kw_list),
                "duplicate_rows_removed": dupe_count,
                "raw_row_count": raw_count,
                "duplicate_removed_count": dupe_count,
                "recommended_priority": seg.get("recommended_priority", "Evaluate"),
                "keywords": kw_list,
            }

    available = [s.get("segment") for s in segments]
    return {
        "success": False,
        "segment": segment_name,
        "opportunity_revenue": 0.0,
        "opportunity_keywords": 0,
        "keyword_count": 0,
        "avg_opportunity_score": None,
        "raw_rows_before_dedupe": 0,
        "unique_keywords_after_dedupe": 0,
        "duplicate_rows_removed": 0,
        "raw_row_count": 0,
        "duplicate_removed_count": 0,
        "recommended_priority": "Evaluate",
        "keywords": [],
        "message": (
            f"Segment '{segment_name}' not found. "
            f"Available: {', '.join(str(a) for a in available[:10])}."
        ),
    }


def _recommended_priority(
    rank: int,
    avg_score: float,
    revenue: float,
    max_revenue: float,
) -> str:
    rev_share = revenue / max_revenue if max_revenue > 0 else 0.0
    if rank <= 2 and avg_score >= 65 and rev_share >= 0.12:
        return "Enter First"
    if rank <= 6 and avg_score >= 50:
        return "Evaluate"
    return "Low Priority"


def _build_top_entry_segments_analysis(
    entry_segments: List[Dict[str, Any]],
    limit: int = 12,
) -> List[Dict[str, Any]]:
    """Actionable segment table for executives (replaces category-wide driver chart)."""
    rows: List[Dict[str, Any]] = []
    for seg in entry_segments[:limit]:
        rows.append({
            "segment": seg["segment"],
            "revenue_opportunity": seg["opportunity_revenue"],
            "keyword_count": seg["keyword_count"],
            "primary_driver": seg.get("primary_driver", "—"),
            "competitive_intensity": seg.get("competitive_intensity", "—"),
            "recommended_action": seg.get("recommended_action", "Evaluate"),
            "avg_opportunity_score": seg.get("avg_opportunity_score", 0),
            "recommended_priority": seg.get("recommended_priority", "Evaluate"),
            "rank": seg.get("rank", 0),
        })
    return rows


def _extract_themes(keywords: List[str], top_n: int = 4) -> List[str]:
    """Extract frequent unigrams and bigrams from opportunity keywords."""
    STOP = {
        "for", "and", "the", "with", "in", "of", "a", "an", "to", "on", "at", "by",
        "from", "or", "as", "is", "it", "be", "are", "was", "were", "has", "have",
        "bag", "bags", "tote", "totes", "purse", "women", "womens", "mens", "men",
        "large", "small", "black", "white", "blue", "red", "pink", "brown",
        "set", "pack", "lot", "new", "best", "top", "good", "great", "cute",
        "cheap", "sale", "buy", "get", "my", "your", "our", "its", "this", "that",
    }
    token_counts: Dict[str, int] = {}

    def add_token(token: str, weight: int = 1) -> None:
        token = token.strip(".,!?-()[]\"'").lower()
        if len(token) > 2 and token not in STOP:
            token_counts[token] = token_counts.get(token, 0) + weight

    for kw in keywords:
        words = [w.strip(".,!?-()[]\"'").lower() for w in kw.split() if w.strip()]
        for word in words:
            add_token(word)
        for i in range(len(words) - 1):
            bigram = f"{words[i]} {words[i + 1]}"
            if all(w not in STOP for w in words[i : i + 2]):
                add_token(bigram, weight=2)

    sorted_tokens = sorted(token_counts.items(), key=lambda x: x[1], reverse=True)
    themes: List[str] = []
    used_words: set = set()
    for token, _ in sorted_tokens:
        if token in themes:
            continue
        # Prefer diverse themes (avoid redundant singular/plural)
        root = token.split()[0]
        if root in used_words and " " not in token:
            continue
        themes.append(token)
        used_words.add(root)
        if len(themes) >= top_n:
            break
    return themes


def _is_niche_search_pattern(keywords: List[str]) -> bool:
    if not keywords:
        return True
    lengths = [len(kw.split()) for kw in keywords[:40]]
    return float(np.median(lengths)) >= 3.0


def _revenue_concentration_note(df_opportunities: pd.DataFrame) -> Optional[str]:
    if df_opportunities.empty or "_sales_clean" not in df_opportunities.columns:
        return None
    sales = df_opportunities["_sales_clean"].fillna(0)
    total = float(sales.sum())
    if total <= 0:
        return None
    top_share = float(sales.nlargest(min(10, len(sales))).sum()) / total * 100.0
    if top_share >= 60:
        return f"Revenue opportunity is concentrated — top keywords represent {top_share:.0f}% of the pool."
    if top_share >= 40:
        return f"Revenue is moderately concentrated across leading keywords ({top_share:.0f}% in the top set)."
    return "Revenue opportunity is spread across multiple keyword clusters."


def _generate_insights(
    extreme_count: int,
    high_count: int,
    total_keywords: int,
    overall_score: float,
    revenue_opportunity_pool: float,
    revenue_pct_of_category_sales: float,
    entry_segments: Optional[List[Dict[str, Any]]] = None,
    best_entry_cluster: Optional[str] = None,
    top_entry_segments: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, str]]:
    insights: List[Dict[str, str]] = []
    entry_segments = entry_segments or []
    top_entry_segments = top_entry_segments or []
    total_opp = extreme_count + high_count
    opp_pct = (total_opp / total_keywords * 100) if total_keywords else 0.0
    top_seg = entry_segments[0] if entry_segments else None
    top_action_row = top_entry_segments[0] if top_entry_segments else None

    if entry_segments:
        insights.append({
            "category": "Key Finding",
            "text": (
                f"What: {len(entry_segments)} entry segments contain {total_opp:,} high-opportunity "
                f"keywords ({opp_pct:.1f}% of the {total_keywords:,}-keyword universe). "
                f"Why: Whitespace is concentrated in product themes, not evenly across the category. "
                f"Action: Use segment ranking — not individual keywords — to plan market entry."
            ),
        })
    else:
        insights.append({
            "category": "Key Finding",
            "text": (
                f"What: Category whitespace score averages {overall_score:.0f}/100 across "
                f"{total_keywords:,} keywords. "
                f"Why: Opportunity signals are diffuse without a dominant segment cluster. "
                f"Action: Review driver breakdown and representative keywords before committing inventory."
            ),
        })

    if top_seg:
        insights.append({
            "category": "Leading Segment",
            "text": (
                f"What: {top_seg['segment']} leads with {top_seg['opportunity_revenue']:,.0f} "
                f"opportunity revenue across {top_seg['keyword_count']:,} keywords "
                f"(avg score {top_seg['avg_opportunity_score']:.0f}/100). "
                f"Why: This segment combines the strongest revenue signal with accessible competition. "
                f"Action: Prioritise {top_seg['recommended_priority'].lower()} — "
                f"{'launch here first' if top_seg['recommended_priority'] == 'Enter First' else 'validate before scaling'}."
            ),
        })

    if top_seg and top_seg.get("primary_driver"):
        insights.append({
            "category": "Market Gap",
            "text": (
                f"What: {top_seg['segment']} is led by {top_seg['primary_driver']} "
                f"with {top_seg.get('competitive_intensity', '—').lower()} competitive intensity. "
                f"Why: This segment concentrates the strongest revenue–accessibility balance. "
                f"Action: {top_seg.get('recommended_action', 'Evaluate segment fit before investment')}."
            ),
        })
    else:
        insights.append({
            "category": "Market Gap",
            "text": (
                "What: Opportunity is fragmented across multiple segment themes. "
                "Why: No single driver dominates the category. "
                "Action: Use the Top Entry Segments table to sequence launch priorities."
            ),
        })

    if best_entry_cluster and top_seg:
        enter_segments = [s["segment"] for s in entry_segments if s.get("recommended_priority") == "Enter First"][:3]
        seg_list = ", ".join(enter_segments) if enter_segments else best_entry_cluster
        insights.append({
            "category": "Recommended Entry",
            "text": (
                f"What: Enter through {seg_list} first — representing "
                f"{revenue_opportunity_pool:,.0f} in opportunity revenue "
                f"({revenue_pct_of_category_sales:.1f}% of measurable category keyword sales). "
                f"Why: These segments offer the best revenue-to-competition balance. "
                f"Action: Build catalog coverage for the leading segment, then expand to 'Evaluate' tiers."
            ),
        })
    elif total_opp > 0:
        insights.append({
            "category": "Recommended Entry",
            "text": (
                f"What: {total_opp:,} opportunity keywords represent "
                f"{revenue_opportunity_pool:,.0f} in sales signal "
                f"({revenue_pct_of_category_sales:.1f}% of measurable category keyword sales). "
                f"Why: Revenue is concentrated in a subset of searches. "
                f"Action: Phase entry by segment revenue, not keyword rank alone."
            ),
        })
    else:
        insights.append({
            "category": "Recommended Entry",
            "text": (
                "What: Limited high-confidence entry segments in this category. "
                "Why: Competitive coverage is broad across major search themes. "
                "Action: Pursue differentiated micro-segments before broad expansion."
            ),
        })

    return insights


def _error_response(
    message: str,
    datasets: List[str],
    missing_cols: List[str],
    rows_before: int,
    rows_after: int,
    rows_skipped: int,
    t0: float,
) -> Dict[str, Any]:
    return {
        "status": "error",
        "metric_name": "Whitespace Opportunity",
        "summary": message,
        "datasets_used": datasets,
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": message,
            "missing_columns": missing_cols,
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning":  rows_after,
            "rows_skipped":         rows_skipped,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
