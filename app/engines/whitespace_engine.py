"""
Whitespace Engine
=================
Purpose  : Find high-demand keywords with weak competitor optimization.
Datasets : Magnet Keyword dataset
Formula  : 0.3*vol + 0.2*conv + 0.2*sales + 0.15*inv_density + 0.1*inv_comp + 0.05*trend

Identifies SEO opportunities: high search demand + low keyword optimization.

Numeric cleaning is applied before every normalisation step.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import min_max_normalize, safe_log_normalize
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

def _format_score(val: float) -> float:
    if np.isnan(val):
        return 0.0
    return round(float(np.clip(val, 0.0, 100.0)), 2)


def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 15,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Whitespace engine started.")

    rows_magnet = len(magnet_df) if magnet_df is not None else 0

    if magnet_df is None or magnet_df.empty:
        return {
            "status": "error",
            "metric_name": "Whitespace Opportunity",
            "summary": "No Magnet keyword dataset available.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Magnet dataset not loaded.",
                "missing_columns": _SEARCH_VOL_CANDIDATES[:1] + _TITLE_DENSITY_CANDIDATES[:1],
                "rows_before_cleaning": 0,
                "rows_after_cleaning": 0,
                "rows_skipped": 0,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    keyword_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    search_vol_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    title_density_col = find_column(magnet_df, _TITLE_DENSITY_CANDIDATES)
    conv_col = find_column(magnet_df, _CONV_CANDIDATES)
    sales_col = find_column(magnet_df, _SALES_CANDIDATES)
    comp_col = find_column(magnet_df, _COMP_CANDIDATES)
    trend_col = find_column(magnet_df, _TREND_CANDIDATES)

    if not search_vol_col:
        return {
            "status": "error",
            "metric_name": "Whitespace Opportunity",
            "summary": "Required column 'Search Volume' not found in Magnet dataset.",
            "datasets_used": ["magnet"],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Search Volume column missing.",
                "missing_columns": ["Search Volume"],
                "rows_before_cleaning": rows_magnet,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_magnet,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    df = magnet_df.copy()
    numeric_cols_cleaned = []

    def process_col(col_name):
        if col_name:
            clean, _ = clean_numeric_series(df[col_name], col_name)
            numeric_cols_cleaned.append(col_name)
            return clean
        return pd.Series(0.0, index=df.index)

    df["_vol_clean"] = process_col(search_vol_col)
    df["_density_clean"] = process_col(title_density_col)
    df["_conv_clean"] = process_col(conv_col)
    df["_sales_clean"] = process_col(sales_col)
    df["_comp_clean"] = process_col(comp_col)
    df["_trend_clean"] = process_col(trend_col)

    df_valid = df.dropna(subset=["_vol_clean"])
    rows_before = len(df)
    rows_after = len(df_valid)
    rows_skipped = rows_before - rows_after

    if rows_after == 0:
        return {
            "status": "error",
            "metric_name": "Whitespace Opportunity",
            "summary": "No valid keyword data after cleaning.",
            "datasets_used": ["magnet"],
            "columns_used": [search_vol_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No rows with valid Search Volume.",
                "missing_columns": [],
                "rows_before_cleaning": rows_before,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_skipped,
                "numeric_columns_cleaned": numeric_cols_cleaned,
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    vol_norm = min_max_normalize(safe_log_normalize(df_valid["_vol_clean"]))
    conv_norm = min_max_normalize(df_valid["_conv_clean"])
    sales_norm = min_max_normalize(safe_log_normalize(df_valid["_sales_clean"]))
    density_norm = min_max_normalize(df_valid["_density_clean"])
    comp_norm = min_max_normalize(safe_log_normalize(df_valid["_comp_clean"]))
    trend_norm = min_max_normalize(df_valid["_trend_clean"])

    inv_density = 100.0 - density_norm.fillna(0.0)
    inv_comp = 100.0 - comp_norm.fillna(0.0)

    score = (
        0.3 * vol_norm.fillna(0.0) +
        0.2 * conv_norm.fillna(0.0) +
        0.2 * sales_norm.fillna(0.0) +
        0.15 * inv_density +
        0.1 * inv_comp +
        0.05 * trend_norm.fillna(0.0)
    )

    vol_p20 = float(df_valid["_vol_clean"].quantile(0.20))
    sales_p20 = float(df_valid["_sales_clean"].quantile(0.20))

    mask_low = (df_valid["_vol_clean"] < vol_p20) & (df_valid["_sales_clean"] < sales_p20)
    score.loc[mask_low] = score.loc[mask_low].clip(upper=60.0)

    df_valid["_whitespace_score"] = score

    overall_score = _format_score(df_valid["_whitespace_score"].mean())

    def classify_opportunity(score: float) -> str:
        if score < 30:
            return "low opportunity"
        elif score < 60:
            return "moderate opportunity"
        elif score < 80:
            return "high opportunity"
        else:
            return "extreme opportunity"

    df_valid["_opportunity_label"] = df_valid["_whitespace_score"].apply(classify_opportunity)

    df_sorted = df_valid.sort_values("_whitespace_score", ascending=False)
    top_keywords: List[Dict[str, Any]] = []

    for _, row in df_sorted.head(top_n).iterrows():
        entry: Dict[str, Any] = {
            "keyword": str(row[keyword_col]) if keyword_col else "N/A",
            "search_volume": int(row["_vol_clean"]),
            "title_density": _format_score(row["_density_clean"]),
            "whitespace_score": _format_score(row["_whitespace_score"]),
            "opportunity_label": row["_opportunity_label"],
        }
        top_keywords.append(entry)

    high_search_low_density = df_sorted[(df_sorted["_whitespace_score"] >= 60)].copy()

    high_search_low_density_keywords: List[Dict[str, Any]] = []
    for _, row in high_search_low_density.head(top_n).iterrows():
        entry = {
            "keyword": str(row[keyword_col]) if keyword_col else "N/A",
            "search_volume": int(row["_vol_clean"]),
            "title_density": _format_score(row["_density_clean"]),
            "whitespace_score": _format_score(row["_whitespace_score"]),
        }
        high_search_low_density_keywords.append(entry)

    opportunity_counts = df_valid["_opportunity_label"].value_counts().to_dict()
    opportunity_distribution = {
        "low_opportunity": int(opportunity_counts.get("low opportunity", 0)),
        "moderate_opportunity": int(opportunity_counts.get("moderate opportunity", 0)),
        "high_opportunity": int(opportunity_counts.get("high opportunity", 0)),
        "extreme_opportunity": int(opportunity_counts.get("extreme opportunity", 0)),
    }

    extreme_count = opportunity_distribution.get("extreme_opportunity", 0)
    high_count = opportunity_distribution.get("high_opportunity", 0)
    total_keywords = len(df_valid)
    extreme_pct = (extreme_count / total_keywords * 100) if total_keywords > 0 else 0
    high_pct = (high_count / total_keywords * 100) if total_keywords > 0 else 0

    if extreme_count > 0:
        summary = (
            f"Found {extreme_count} extreme SEO opportunities "
            f"({extreme_pct:.1f}% of keywords). "
            f"These keywords have high search demand but weak competitor optimization. "
            f"An additional {high_count} high-opportunity keywords identified."
        )
    elif high_count > 0:
        summary = (
            f"Found {high_count} high-opportunity keywords "
            f"({high_pct:.1f}% of keywords). "
            f"These represent strong SEO targets with moderate search demand "
            f"and limited competitor optimization."
        )
    else:
        summary = (
            f"Whitespace analysis complete. Most keywords show existing competitor optimization. "
            f"Overall opportunity score: {overall_score}/100."
        )

    elapsed = round(time.time() - t0, 3)

    return {
        "status": "success",
        "metric_name": "Whitespace Opportunity",
        "summary": summary,
        "datasets_used": ["magnet"],
        "columns_used": numeric_cols_cleaned,
        "formula_used": "0.3*vol + 0.2*conv + 0.2*sales + 0.15*inv_density + 0.1*inv_comp + 0.05*trend. Capped at 60 if vol & sales < 20th percentile.",
        "results": {
            "overall_whitespace_score": overall_score,
            "top_whitespace_keywords": top_keywords,
            "high_search_low_density_keywords": high_search_low_density_keywords,
            "opportunity_distribution": opportunity_distribution,
            "total_keywords_analyzed": total_keywords,
        },
        "validation": {
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning": rows_after,
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "missing_columns": [],
        },
        "processing_time_seconds": elapsed,
    }
