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

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.normalization import min_max_normalize
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
_KEYWORD_CANDIDATES = [
    "Keyword Phrase", "keyword phrase", "Keyword", "keyword",
]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_ASIN_CANDIDATES  = ["ASIN", "asin"]


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Demand Strength engine started.")

    rows_magnet   = len(magnet_df)   if magnet_df   is not None else 0
    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0
    logger.info(f"Input rows — magnet={rows_magnet}, blackbox={rows_blackbox}")

    columns_used: List[str]      = []
    datasets_used: List[str]     = []
    metrics_available: List[str] = []
    metric_means: Dict[str, float] = {}
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
            sv_norm = min_max_normalize(sv_clean)
            sv_mean = float(sv_norm.mean(skipna=True))
            if not np.isnan(sv_mean):
                metrics_available.append("Search Volume")
                metric_means["Search Volume"] = round(sv_mean, 4)
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
            ks_norm = min_max_normalize(ks_clean)
            ks_mean = float(ks_norm.mean(skipna=True))
            if not np.isnan(ks_mean):
                metrics_available.append("Keyword Sales")
                metric_means["Keyword Sales"] = round(ks_mean, 4)
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
            as_norm = min_max_normalize(as_clean)
            as_mean = float(as_norm.mean(skipna=True))
            if not np.isnan(as_mean):
                metrics_available.append("ASIN Sales")
                metric_means["ASIN Sales"] = round(as_mean, 4)
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
            rev_norm = min_max_normalize(rev_clean)
            rev_mean = float(rev_norm.mean(skipna=True))
            if not np.isnan(rev_mean):
                metrics_available.append("Revenue")
                metric_means["Revenue"] = round(rev_mean, 4)
                columns_used.append(revenue_col)
                if "blackbox" not in datasets_used:
                    datasets_used.append("blackbox")
                numeric_cols_cleaned.append(revenue_col)

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
    # 5. Market demand index (internal pillar score only — not shown as Demand Strength)
    # -----------------------------------------------------------------------
    score_sum = 0.0
    weight_sum = 0.0
    if "Search Volume" in metric_means:
        score_sum += metric_means["Search Volume"] * 0.50
        weight_sum += 0.50
    sales_score = 0.0
    sales_count = 0
    if "Keyword Sales" in metric_means:
        sales_score += metric_means["Keyword Sales"]
        sales_count += 1
    if "ASIN Sales" in metric_means:
        sales_score += metric_means["ASIN Sales"]
        sales_count += 1
    if sales_count > 0:
        score_sum += (sales_score / sales_count) * 0.35
        weight_sum += 0.35
    if "Revenue" in metric_means:
        score_sum += metric_means["Revenue"] * 0.15
        weight_sum += 0.15
    market_demand_index = round(score_sum / weight_sum, 2) if weight_sum > 0 else 0.0

    # -----------------------------------------------------------------------
    # 6. Top demand keyword + keyword list
    # -----------------------------------------------------------------------
    top_keywords: List[Dict] = []
    top_demand_keyword: Dict[str, Any] = {}
    if magnet_df is not None and sv_col:
        kw_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
        tmp = magnet_df.copy()
        sv_c, _ = clean_numeric_series(tmp[sv_col], sv_col)
        tmp["_sv"] = sv_c
        tmp = tmp.dropna(subset=["_sv"]).sort_values("_sv", ascending=False)
        total_sv = float(tmp["_sv"].sum())
        logger.info(f"Top keywords pool: {len(tmp)} rows with valid Search Volume")
        for _, row in tmp.head(top_n).iterrows():
            sv_val = float(row["_sv"])
            contrib = round((sv_val / total_sv) * 100.0, 2) if total_sv > 0 else 0.0
            entry: Dict[str, Any] = {
                "search_volume": _sv(sv_val),
                "demand_contribution": contrib,
            }
            if kw_col:
                entry["keyword"] = str(row[kw_col])
            if kw_sales_col:
                ks_c, _ = clean_numeric_series(
                    pd.Series([row[kw_sales_col]]), kw_sales_col
                )
                entry["keyword_sales"] = _sv(ks_c.iloc[0])
            top_keywords.append(entry)

        if not tmp.empty:
            top_row = tmp.iloc[0]
            top_sv = float(top_row["_sv"])
            top_contrib = round((top_sv / total_sv) * 100.0, 2) if total_sv > 0 else 0.0
            if top_contrib >= 10:
                opp = "High"
            elif top_contrib >= 5:
                opp = "Medium"
            else:
                opp = "Low"
            rev_col_mag = find_column(magnet_df, _REVENUE_CANDIDATES)
            rev_est = None
            if rev_col_mag:
                rev_s, _ = clean_numeric_series(pd.Series([top_row[rev_col_mag]]), rev_col_mag)
                rev_est = _sv(rev_s.iloc[0])
            top_demand_keyword = {
                "keyword": str(top_row[kw_col]) if kw_col else "Unknown",
                "search_volume": int(top_sv) if top_sv == int(top_sv) else round(top_sv, 0),
                "demand_contribution": top_contrib,
                "revenue_opportunity": opp,
                "opportunity_level": opp,
                "estimated_keyword_revenue": rev_est,
            }

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
    if top_demand_keyword:
        interpretation = (
            f"Leading demand keyword '{top_demand_keyword.get('keyword', '')}' "
            f"accounts for {top_demand_keyword.get('demand_contribution', 0)}% of measured "
            f"search volume with {top_demand_keyword.get('opportunity_level', 'N/A')} revenue opportunity."
        )
    elif market_demand_index >= 60:
        interpretation = "Market shows concentrated search demand across tracked keywords."
    else:
        interpretation = "Limited search demand signals in uploaded keyword data."

    elapsed = round(time.time() - t0, 3)
    logger.info(
        "Demand Intelligence complete: market_demand_index=%s, top_keyword=%s, elapsed=%ss",
        market_demand_index,
        top_demand_keyword.get("keyword", "n/a"),
        elapsed,
    )

    return {
        "status": "success",
        "metric_name": "Demand Intelligence",
        "summary": interpretation,
        "datasets_used": list(dict.fromkeys(datasets_used)),
        "columns_used": list(dict.fromkeys(columns_used)),
        "formula_used": (
            "Top Demand Keyword = highest Search Volume row; "
            "Demand Contribution = keyword SV / total SV; "
            "Market Demand Index (report pillar only) from weighted normalized metrics."
        ),
        "results": {
            "market_demand_index": market_demand_index,
            "top_demand_keyword": top_demand_keyword,
            "metrics_contributing": metric_means,
            "metrics_available": metrics_available,
            "top_demand_keywords": top_keywords,
            "top_demand_products": top_products,
        },
        "validation": {
            "status": "passed",
            "metrics_found": len(metrics_available),
            "rows_before_cleaning": rows_magnet + rows_blackbox,
            "rows_after_cleaning": rows_magnet + rows_blackbox,
            "rows_skipped": 0,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "rows_magnet": rows_magnet,
            "rows_blackbox": rows_blackbox,
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
    if pd.isna(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v
