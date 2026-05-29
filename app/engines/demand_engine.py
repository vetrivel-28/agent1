"""
Demand Strength Engine
======================
Purpose  : Measure overall market demand health.
Datasets : Magnet Keyword + BlackBox Products
Formula  : Demand Strength = mean of available normalised metrics
           (Search Volume, Keyword Sales, ASIN Sales, ASIN Revenue)
           Each metric is min-max normalised to 0-100 before averaging.

Numeric cleaning is applied before every normalisation step.
Rows are NEVER dropped unless both BSR and Revenue are simultaneously NaN.
"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column, minmax_normalize
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("demand_engine")

# ---------------------------------------------------------------------------
# Column candidate lists  (ordered by preference, case-insensitive lookup)
# ---------------------------------------------------------------------------
_SEARCH_VOL_CANDIDATES = [
    "Search Volume", "search volume", "SearchVolume", "Monthly Search Volume",
]
_KW_SALES_CANDIDATES = [
    "Keyword Sales", "keyword sales", "KeywordSales",
]
_ASIN_SALES_CANDIDATES = [
    "ASIN Sales", "asin sales", "AsinSales",
    "Parent Level Sales", "parent level sales",
]
_REVENUE_CANDIDATES = [
    "ASIN Revenue", "asin revenue",
    "Revenue", "revenue",
    "Parent Level Revenue", "parent level revenue",
    "Monthly Revenue", "monthly revenue",
]
_SALES_TREND_CANDIDATES = [
    "Sales Trend (90 days) (%)", "sales trend (90 days) (%)",
    "Sales Trend (%)", "sales trend (%)",
    "Sales Trend", "sales trend",
]
_KEYWORD_CANDIDATES = [
    "Keyword Phrase", "keyword phrase", "Keyword", "keyword",
]
_KC_KEYWORD_CANDIDATES = ["keyword", "Keyword", "Keyword Phrase"]
_KC_CLASS_CANDIDATES = [
    "classification", "Classification", "Category Type", "category type",
]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_ASIN_CANDIDATES  = ["ASIN", "asin"]

# Configurable weights for demand score components (re-normalized when columns missing)
_DEMAND_WEIGHTS = {
    "search_volume": 0.30,
    "product_sales": 0.25,
    "revenue": 0.20,
    "keyword_sales": 0.15,
    "trend": 0.10,
}


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def _weighted_demand_score(components: Dict[str, float]) -> tuple[float, Dict[str, float]]:
    """Compute weighted demand score; re-normalize weights for available components."""
    active = {k: v for k, v in components.items() if v is not None and not np.isnan(v)}
    if not active:
        return 0.0, {}
    weight_sum = sum(_DEMAND_WEIGHTS[k] for k in active)
    score = sum(active[k] * (_DEMAND_WEIGHTS[k] / weight_sum) for k in active)
    score_clamped = max(0.0, min(100.0, score))
    return round(float(score_clamped), 2), {f"{k}_score": round(v, 4) for k, v in active.items()}


def _normalize_keyword(text: Any) -> str:
    """Normalize keyword text for matching: case-, whitespace-, and punctuation-tolerant."""
    if text is None:
        return ""
    normalized = str(text).strip().lower()
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _sort_classified_keywords(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def sort_key(item: Dict[str, Any]) -> tuple[float, float]:
        sv = item.get("search_volume")
        ks = item.get("keyword_sales")
        sv_rank = float(sv) if isinstance(sv, (int, float)) and not np.isnan(sv) else -1.0
        ks_rank = float(ks) if isinstance(ks, (int, float)) and not np.isnan(ks) else -1.0
        return (-sv_rank, -ks_rank)

    return sorted(items, key=sort_key)


def _classify_keywords(
    magnet_df: Optional[pd.DataFrame],
    kc_df: Optional[pd.DataFrame],
    sv_col: Optional[str],
    kw_col: Optional[str],
    top_n: int,
) -> Dict[str, Any]:
    """Split keywords into direct niche, broader category, and related lists."""
    direct: List[Dict[str, Any]] = []
    broader: List[Dict[str, Any]] = []
    related: List[Dict[str, Any]] = []
    enriched_count = 0
    missing_count = 0

    magnet_lookup: Dict[str, Dict[str, Any]] = {}
    if magnet_df is not None and not magnet_df.empty and kw_col:
        tmp = magnet_df.copy()
        kw_sales_col = find_column(tmp, _KW_SALES_CANDIDATES)
        if sv_col:
            sv_clean, _ = clean_numeric_series(tmp[sv_col], sv_col)
            tmp["_sv_raw"] = sv_clean
            tmp["_sv_norm"] = minmax_normalize(sv_clean)
        else:
            tmp["_sv_raw"] = pd.Series([None] * len(tmp))
            tmp["_sv_norm"] = pd.Series([None] * len(tmp))

        if kw_sales_col:
            ks_clean, _ = clean_numeric_series(tmp[kw_sales_col], kw_sales_col)
            tmp["_ks_raw"] = ks_clean
        else:
            tmp["_ks_raw"] = pd.Series([None] * len(tmp))

        for _, row in tmp.iterrows():
            norm_kw = _normalize_keyword(row[kw_col])
            if not norm_kw or norm_kw in magnet_lookup:
                continue
            magnet_lookup[norm_kw] = {
                "search_volume": _sv(row.get("_sv_raw")),
                "search_volume_norm": _sv(row.get("_sv_norm")),
                "keyword_sales": _sv(row.get("_ks_raw")),
            }

    if kc_df is not None and not kc_df.empty:
        kc_kw = find_column(kc_df, _KC_KEYWORD_CANDIDATES)
        kc_class = find_column(kc_df, _KC_CLASS_CANDIDATES)
        if kc_kw and kc_class:
            direct_norms: List[float] = []
            broader_norms: List[float] = []
            for _, row in kc_df.iterrows():
                keyword_text = str(row[kc_kw]).strip()
                if not keyword_text:
                    continue

                classification_text = str(row[kc_class]).strip()
                cls = classification_text.lower()
                norm_kw = _normalize_keyword(keyword_text)
                metrics = magnet_lookup.get(norm_kw)
                if metrics is None:
                    missing_count += 1

                entry: Dict[str, Any] = {
                    "keyword": keyword_text,
                    "classification": classification_text,
                    "search_volume": metrics.get("search_volume") if metrics else None,
                    "keyword_sales": metrics.get("keyword_sales") if metrics else None,
                }
                if metrics is not None:
                    enriched_count += 1
                    if metrics.get("search_volume_norm") is not None:
                        if "direct" in cls or "niche" in cls:
                            direct_norms.append(metrics["search_volume_norm"])
                        elif any(token in cls for token in ("generic", "broader", "broad", "category")):
                            broader_norms.append(metrics["search_volume_norm"])

                if "direct" in cls or "niche" in cls:
                    direct.append(entry)
                elif any(token in cls for token in ("generic", "broader", "broad", "category")):
                    broader.append(entry)
                elif "related" in cls:
                    related.append(entry)
                else:
                    related.append(entry)

            direct = _sort_classified_keywords(direct)
            broader = _sort_classified_keywords(broader)
            related = _sort_classified_keywords(related)

            direct_niche_search_score = round(float(np.mean(direct_norms)), 2) if direct_norms else None
            broader_category_search_score = round(float(np.mean(broader_norms)), 2) if broader_norms else None

            return {
                "direct_niche_keywords": direct[:top_n],
                "broader_category_keywords": broader[:top_n],
                "related_keywords": related[:top_n],
                "direct_keywords_count": len(direct),
                "broader_keywords_count": len(broader),
                "related_keywords_count": len(related),
                "classified_keywords_enriched_count": enriched_count,
                "classified_keywords_missing_magnet_metrics_count": missing_count,
                "direct_niche_search_score": direct_niche_search_score,
                "broader_category_search_score": broader_category_search_score,
            }

    # Fallback: top magnet keywords by search volume (not niche-specific proof)
    if magnet_df is not None and sv_col and kw_col:
        tmp = magnet_df.copy()
        sv_c, _ = clean_numeric_series(tmp[sv_col], sv_col)
        tmp["_sv"] = sv_c
        tmp = tmp.dropna(subset=["_sv"]).sort_values("_sv", ascending=False)
        for _, row in tmp.head(top_n).iterrows():
            direct.append({
                "keyword": str(row[kw_col]),
                "search_volume": _sv(row["_sv"]),
                "keyword_sales": None,
                "classification": "Unknown",
            })
    return {
        "direct_niche_keywords": direct[:top_n],
        "broader_category_keywords": broader[:top_n],
        "related_keywords": related[:top_n],
        "direct_keywords_count": len(direct),
        "broader_keywords_count": len(broader),
        "related_keywords_count": len(related),
        "classified_keywords_enriched_count": enriched_count,
        "classified_keywords_missing_magnet_metrics_count": missing_count,
        "direct_niche_search_score": None,
        "broader_category_search_score": None,
    }


def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
    keyword_classification_df: Optional[pd.DataFrame] = None,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Demand Strength engine started.")

    rows_magnet   = len(magnet_df)   if magnet_df   is not None else 0
    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    logger.info(f"Input rows — magnet={rows_magnet}, blackbox={rows_blackbox}")

    columns_used: List[str]      = []
    datasets_used: List[str]     = []
    metrics_available: List[str] = []
    score_components_raw: Dict[str, Optional[float]] = {
        "search_volume": None,
        "keyword_sales": None,
        "product_sales": None,
        "revenue": None,
        "trend": None,
    }
    valid_rows_by_metric: Dict[str, int] = {}
    numeric_cols_cleaned: List[str] = []

    # -----------------------------------------------------------------------
    # 1. Search Volume  (Magnet)
    # -----------------------------------------------------------------------
    sv_col: Optional[str] = None
    if magnet_df is not None and not magnet_df.empty:
        sv_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
        if sv_col:
            sv_clean, sv_stats = clean_numeric_series(magnet_df[sv_col], sv_col)
            logger.info(
                f"Search Volume '{sv_col}': "
                f"original={sv_stats['original_count']}, "
                f"cleaned={sv_stats['cleaned_count']}, "
                f"nan={sv_stats['nan_introduced']}"
            )
            sv_norm = minmax_normalize(sv_clean)
            sv_mean = float(sv_norm.mean(skipna=True))
            valid_rows_by_metric["search_volume"] = int(sv_norm.notna().sum())
            if not np.isnan(sv_mean):
                metrics_available.append("Search Volume")
                score_components_raw["search_volume"] = round(sv_mean, 4)
                columns_used.append(sv_col)
                datasets_used.append("magnet")
                numeric_cols_cleaned.append(sv_col)

    # -----------------------------------------------------------------------
    # 2. Keyword Sales  (Magnet)
    # -----------------------------------------------------------------------
    kw_sales_col: Optional[str] = None
    if magnet_df is not None and not magnet_df.empty:
        kw_sales_col = find_column(magnet_df, _KW_SALES_CANDIDATES)
        if kw_sales_col:
            ks_clean, ks_stats = clean_numeric_series(magnet_df[kw_sales_col], kw_sales_col)
            logger.info(
                f"Keyword Sales '{kw_sales_col}': "
                f"original={ks_stats['original_count']}, "
                f"cleaned={ks_stats['cleaned_count']}, "
                f"nan={ks_stats['nan_introduced']}"
            )
            ks_norm = minmax_normalize(ks_clean)
            ks_mean = float(ks_norm.mean(skipna=True))
            valid_rows_by_metric["keyword_sales"] = int(ks_norm.notna().sum())
            if not np.isnan(ks_mean):
                metrics_available.append("Keyword Sales")
                score_components_raw["keyword_sales"] = round(ks_mean, 4)
                columns_used.append(kw_sales_col)
                if "magnet" not in datasets_used:
                    datasets_used.append("magnet")
                numeric_cols_cleaned.append(kw_sales_col)

    # -----------------------------------------------------------------------
    # 3. ASIN Sales  (BlackBox)
    # -----------------------------------------------------------------------
    asin_sales_col: Optional[str] = None
    if blackbox_df is not None and not blackbox_df.empty:
        asin_sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
        if asin_sales_col:
            as_clean, as_stats = clean_numeric_series(blackbox_df[asin_sales_col], asin_sales_col)
            logger.info(
                f"ASIN Sales '{asin_sales_col}': "
                f"original={as_stats['original_count']}, "
                f"cleaned={as_stats['cleaned_count']}, "
                f"nan={as_stats['nan_introduced']}"
            )
            as_norm = minmax_normalize(as_clean)
            as_mean = float(as_norm.mean(skipna=True))
            valid_rows_by_metric["product_sales"] = int(as_norm.notna().sum())
            if not np.isnan(as_mean):
                metrics_available.append("ASIN Sales")
                score_components_raw["product_sales"] = round(as_mean, 4)
                columns_used.append(asin_sales_col)
                datasets_used.append("blackbox")
                numeric_cols_cleaned.append(asin_sales_col)

    # -----------------------------------------------------------------------
    # 4. Revenue  (BlackBox)
    # -----------------------------------------------------------------------
    revenue_col: Optional[str] = None
    if blackbox_df is not None and not blackbox_df.empty:
        revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
        if revenue_col:
            rev_clean, rev_stats = clean_numeric_series(blackbox_df[revenue_col], revenue_col)
            logger.info(
                f"Revenue '{revenue_col}': "
                f"original={rev_stats['original_count']}, "
                f"cleaned={rev_stats['cleaned_count']}, "
                f"nan={rev_stats['nan_introduced']}"
            )
            rev_norm = minmax_normalize(rev_clean)
            rev_mean = float(rev_norm.mean(skipna=True))
            valid_rows_by_metric["revenue"] = int(rev_norm.notna().sum())
            if not np.isnan(rev_mean):
                metrics_available.append("Revenue")
                score_components_raw["revenue"] = round(rev_mean, 4)
                columns_used.append(revenue_col)
                if "blackbox" not in datasets_used:
                    datasets_used.append("blackbox")
                numeric_cols_cleaned.append(revenue_col)

    # -----------------------------------------------------------------------
    # 5. Trend  (BlackBox - Sales Trend or Search Trend)
    # -----------------------------------------------------------------------
    trend_col: Optional[str] = None
    if blackbox_df is not None and not blackbox_df.empty:
        trend_col = find_column(blackbox_df, _SALES_TREND_CANDIDATES)
        if trend_col:
            trend_clean, trend_stats = clean_numeric_series(blackbox_df[trend_col], trend_col)
            logger.info(
                f"Sales Trend '{trend_col}': "
                f"original={trend_stats['original_count']}, "
                f"cleaned={trend_stats['cleaned_count']}, "
                f"nan={trend_stats['nan_introduced']}"
            )
            # Normalize trend from percentage to 0-100 scale (assuming trend is in %)
            trend_norm = minmax_normalize(trend_clean)
            trend_mean = float(trend_norm.mean(skipna=True))
            valid_rows_by_metric["trend"] = int(trend_norm.notna().sum())
            if not np.isnan(trend_mean):
                metrics_available.append("Sales Trend")
                score_components_raw["trend"] = round(trend_mean, 4)
                columns_used.append(trend_col)
                if "blackbox" not in datasets_used:
                    datasets_used.append("blackbox")
                numeric_cols_cleaned.append(trend_col)

    # -----------------------------------------------------------------------
    # Guard: at least one metric required
    # -----------------------------------------------------------------------
    if not metrics_available:
        logger.warning("Demand Strength: no usable metric columns found.")
        return {
            "status": "error",
            "metric_name": "Demand Strength",
            "summary": "No usable metric columns found in uploaded datasets.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No usable metric columns found.",
                "missing_columns": (
                    _SEARCH_VOL_CANDIDATES[:1] + _KW_SALES_CANDIDATES[:1]
                    + _ASIN_SALES_CANDIDATES[:1] + _REVENUE_CANDIDATES[:1]
                ),
                "rows_before_cleaning": rows_magnet + rows_blackbox,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_magnet + rows_blackbox,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # 5. Overall Demand Score (weighted, re-normalized when metrics missing)
    # -----------------------------------------------------------------------
    overall_score, score_components = _weighted_demand_score(score_components_raw)
    metric_means = {
        "Search Volume": score_components_raw.get("search_volume"),
        "Keyword Sales": score_components_raw.get("keyword_sales"),
        "ASIN Sales": score_components_raw.get("product_sales"),
        "Revenue": score_components_raw.get("revenue"),
        "Trend": score_components_raw.get("trend"),
    }
    metric_means = {k: v for k, v in metric_means.items() if v is not None}

    kw_col = find_column(magnet_df, _KEYWORD_CANDIDATES) if magnet_df is not None else None
    keyword_splits = _classify_keywords(
        magnet_df, keyword_classification_df, sv_col, kw_col, top_n
    )

    # -----------------------------------------------------------------------
    # 6. Top demand keywords  (by Search Volume)
    # -----------------------------------------------------------------------
    top_keywords: List[Dict] = []
    if magnet_df is not None and sv_col:
        tmp = magnet_df.copy()
        sv_c, _ = clean_numeric_series(tmp[sv_col], sv_col)
        tmp["_sv"] = sv_c
        tmp = tmp.dropna(subset=["_sv"]).sort_values("_sv", ascending=False)
        logger.info(f"Top keywords pool: {len(tmp)} rows with valid Search Volume")
        for _, row in tmp.head(top_n).iterrows():
            entry: Dict[str, Any] = {"search_volume": _sv(row["_sv"])}
            if kw_col:
                entry["keyword"] = str(row[kw_col])
            if kw_sales_col:
                ks_c, _ = clean_numeric_series(
                    pd.Series([row[kw_sales_col]]), kw_sales_col
                )
                entry["keyword_sales"] = _sv(ks_c.iloc[0])
            top_keywords.append(entry)

    # -----------------------------------------------------------------------
    # 7. Top demand products  (by ASIN Sales or Revenue)
    # -----------------------------------------------------------------------
    top_products: List[Dict] = []
    if blackbox_df is not None:
        sort_col = asin_sales_col or revenue_col
        if sort_col:
            title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
            asin_col  = find_column(blackbox_df, _ASIN_CANDIDATES)
            tmp2 = blackbox_df.copy()
            sort_c, _ = clean_numeric_series(tmp2[sort_col], sort_col)
            tmp2["_sort"] = sort_c
            tmp2 = tmp2.dropna(subset=["_sort"]).sort_values("_sort", ascending=False)
            logger.info(f"Top products pool: {len(tmp2)} rows with valid {sort_col}")
            for _, row in tmp2.head(top_n).iterrows():
                entry2: Dict[str, Any] = {sort_col: _sv(row["_sort"])}
                if title_col:
                    entry2["title"] = str(row[title_col])[:120]
                if asin_col:
                    entry2["asin"] = str(row[asin_col])
                if revenue_col and revenue_col != sort_col:
                    rc, _ = clean_numeric_series(
                        pd.Series([row[revenue_col]]), revenue_col
                    )
                    entry2["revenue"] = _sv(rc.iloc[0])
                top_products.append(entry2)

    # -----------------------------------------------------------------------
    # 8. Interpretation (percentile-relative to score distribution)
    # -----------------------------------------------------------------------
    if overall_score >= 75:
        interpretation = (
            "Strong market demand. High search volume and sales activity "
            "indicate a healthy, active market."
        )
    elif overall_score >= 50:
        interpretation = (
            "Moderate market demand. The market shows reasonable activity "
            "but may have room for growth."
        )
    elif overall_score >= 25:
        interpretation = (
            "Below-average demand. Market activity is limited — "
            "consider niche positioning."
        )
    else:
        interpretation = (
            "Weak demand signals. Low search and sales activity detected "
            "across available metrics."
        )

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Demand Strength complete: score={overall_score}, "
        f"metrics={metrics_available}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Demand Strength",
        "summary": interpretation,
        "datasets_used": list(dict.fromkeys(datasets_used)),   # preserve order, dedupe
        "columns_used": list(dict.fromkeys(columns_used)),
        "formula_used": (
            "Market Demand Score = weighted average of available normalized components: "
            "Search Volume (0.35), Keyword Sales (0.20), Product Sales (0.25), Revenue (0.20). "
            "Missing metrics are excluded and weights re-normalized. "
            f"Metrics used: {metrics_available}"
        ),
        "results": {
            "overall_demand_score": overall_score,
            "score_components": {
                "direct_niche_search_score": keyword_splits.get("direct_niche_search_score"),
                "broader_category_search_score": keyword_splits.get("broader_category_search_score"),
                "search_volume_score": score_components.get("search_volume_score"),
                "keyword_sales_score": score_components.get("keyword_sales_score"),
                "product_sales_score": score_components.get("product_sales_score"),
                "revenue_score": score_components.get("revenue_score"),
                "final_weighted_score": overall_score,
            },
            "metrics_contributing": metric_means,
            "metrics_available": metrics_available,
            "top_demand_keywords": top_keywords,
            "top_demand_products": top_products,
            **keyword_splits,
            "keyword_classification_note": (
                "Broader category keywords represent general category demand and should not "
                "be interpreted as niche-specific demand."
            ),
        },
        "validation": {
            "status": "passed",
            "metrics_found": len(metrics_available),
            "rows_before_cleaning": rows_magnet + rows_blackbox,
            "rows_after_cleaning": rows_magnet + rows_blackbox,
            "rows_skipped": 0,
            "columns_used": list(dict.fromkeys(columns_used)),
            "valid_rows_by_metric": valid_rows_by_metric,
            "skipped_rows_by_metric": {},
            "warnings": (
                [] if keyword_splits.get("classified_keywords_missing_magnet_metrics_count", 0) == 0
                else [
                    f"{keyword_splits.get('classified_keywords_missing_magnet_metrics_count', 0)} classified keywords could not be enriched with Magnet metrics."
                ]
            ),
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "rows_magnet": rows_magnet,
            "rows_blackbox": rows_blackbox,
            "direct_keywords_count": keyword_splits.get("direct_keywords_count", 0),
            "broader_keywords_count": keyword_splits.get("broader_keywords_count", 0),
            "related_keywords_count": keyword_splits.get("related_keywords_count", 0),
            "classified_keywords_enriched_count": keyword_splits.get("classified_keywords_enriched_count", 0),
            "classified_keywords_missing_magnet_metrics_count": keyword_splits.get("classified_keywords_missing_magnet_metrics_count", 0),
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _sv(v: Any) -> Any:
    """Convert numpy scalars / NaN to JSON-safe Python types."""
    if v is None:
        return None
    try:
        if np.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v
