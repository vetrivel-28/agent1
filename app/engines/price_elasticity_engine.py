"""
Price Elasticity Engine
========================
Purpose  : Find strongest-performing pricing ranges.
Datasets : BlackBox Products dataset
Logic    : Create Low/Mid/Premium price buckets (33% quantiles), analyze 
           averages for sales, revenue, rating, review count, bsr.

Numeric cleaning is applied before every normalisation step.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import min_max_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("price_elasticity_engine")

_PRICE_CANDIDATES = ["Price", "price", "List Price", "list price"]
_ASIN_SALES_CANDIDATES = ["ASIN Sales", "asin sales", "AsinSales", "Parent Level Sales"]
_REVENUE_CANDIDATES = ["ASIN Revenue", "asin revenue", "Revenue", "revenue", "Monthly Revenue"]
_BSR_CANDIDATES = ["BSR", "bsr", "Best Sellers Rank"]
_RATING_CANDIDATES = ["Rating", "rating", "Review Rating"]
_REVIEW_COUNT_CANDIDATES = ["Review Count", "review count", "Reviews", "reviews"]


def _format_score(val: float) -> float:
    if np.isnan(val) or pd.isna(val):
        return 0.0
    return round(float(np.clip(val, 0.0, 100.0)), 2)

def _format_price(val: float) -> float:
    if np.isnan(val) or pd.isna(val):
        return 0.0
    return round(float(val), 2)

def _create_price_buckets(series: pd.Series, n_buckets: int = 3) -> List[Tuple[float, float]]:
    valid = series.dropna()
    if valid.empty:
        return []
    
    quantiles = [i / n_buckets for i in range(n_buckets + 1)]
    edges = [valid.quantile(q) for q in quantiles]
    
    unique_edges = []
    for edge in edges:
        if not unique_edges or edge != unique_edges[-1]:
            unique_edges.append(edge)
    
    if len(unique_edges) < 2:
        return [(valid.min(), valid.max())]

    buckets = []
    for i in range(len(unique_edges) - 1):
        lower = unique_edges[i]
        upper = unique_edges[i + 1]
        if i == len(unique_edges) - 2:
            upper = upper + 0.01
        buckets.append((lower, upper))
    
    return buckets


def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
) -> Dict[str, Any]:
    t0 = time.time()
    n_buckets = 3

    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0

    if blackbox_df is None or blackbox_df.empty:
        return {
            "status": "error",
            "metric_name": "Price Elasticity",
            "summary": "No BlackBox products dataset available.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "BlackBox dataset not loaded.",
                "missing_columns": _PRICE_CANDIDATES[:1],
                "rows_before_cleaning": 0,
                "rows_after_cleaning": 0,
                "rows_skipped": 0,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    asin_sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)
    rating_col = find_column(blackbox_df, _RATING_CANDIDATES)
    reviews_col = find_column(blackbox_df, _REVIEW_COUNT_CANDIDATES)

    if not price_col:
        return {
            "status": "error",
            "metric_name": "Price Elasticity",
            "summary": "Required column 'Price' not found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Price column missing.",
                "missing_columns": ["Price"],
                "rows_before_cleaning": rows_blackbox,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_blackbox,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    df = blackbox_df.copy()
    numeric_cols_cleaned = []

    def clean_col(col_name):
        if col_name:
            clean, _ = clean_numeric_series(df[col_name], col_name, remove_negative=True)
            numeric_cols_cleaned.append(col_name)
            return clean
        return pd.Series(0.0, index=df.index)

    df["_price_clean"] = clean_col(price_col)
    df["_asin_sales_clean"] = clean_col(asin_sales_col)
    df["_revenue_clean"] = clean_col(revenue_col)
    df["_bsr_clean"] = clean_col(bsr_col)
    df["_rating_clean"] = clean_col(rating_col)
    df["_reviews_clean"] = clean_col(reviews_col)

    df_valid = df.dropna(subset=["_price_clean"])
    df_valid = df_valid[df_valid["_price_clean"] > 0]
    
    rows_before = len(df)
    rows_after = len(df_valid)
    rows_skipped = rows_before - rows_after

    if rows_after == 0:
        return {
            "status": "error",
            "metric_name": "Price Elasticity",
            "summary": "No valid product data after cleaning.",
            "datasets_used": ["blackbox"],
            "columns_used": [price_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No rows with valid price.",
                "missing_columns": [],
                "rows_before_cleaning": rows_before,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_skipped,
                "numeric_columns_cleaned": numeric_cols_cleaned,
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    buckets = _create_price_buckets(df_valid["_price_clean"], n_buckets)

    df_valid["_bucket_idx"] = pd.cut(
        df_valid["_price_clean"],
        bins=[b[0] for b in buckets] + [buckets[-1][1]],
        labels=list(range(len(buckets))),
        include_lowest=True,
    )

    bucket_avgs = []
    for bucket_idx, (lower, upper) in enumerate(buckets):
        bucket_data = df_valid[df_valid["_bucket_idx"] == bucket_idx]
        if bucket_data.empty:
            continue
        
        avg_sales = bucket_data["_asin_sales_clean"].mean()
        avg_rev = bucket_data["_revenue_clean"].mean()
        avg_rating = bucket_data["_rating_clean"].mean()
        avg_reviews = bucket_data["_reviews_clean"].mean()
        avg_bsr = bucket_data["_bsr_clean"].mean()
        
        bucket_avgs.append({
            "bucket_idx": bucket_idx,
            "lower": lower,
            "upper": upper,
            "avg_sales": avg_sales,
            "avg_revenue": avg_rev,
            "avg_rating": avg_rating,
            "avg_reviews": avg_reviews,
            "avg_bsr": avg_bsr,
            "product_count": len(bucket_data)
        })

    def normalize_arr(arr):
        if not arr: return []
        ma, mi = max(arr), min(arr)
        if ma == mi: return [50.0]*len(arr)
        return [(x - mi)/(ma - mi)*100.0 for x in arr]

    norm_sales = normalize_arr([b["avg_sales"] for b in bucket_avgs])
    norm_rev = normalize_arr([b["avg_revenue"] for b in bucket_avgs])
    norm_rating = normalize_arr([b["avg_rating"] for b in bucket_avgs])

    price_buckets = []
    tiers = ["Low", "Mid", "Premium"]
    for i, b in enumerate(bucket_avgs):
        score = (norm_sales[i] + norm_rev[i] + norm_rating[i]) / 3.0
        price_buckets.append({
            "tier": tiers[min(i, 2)],
            "price_range": {"min": _format_price(b["lower"]), "max": _format_price(b["upper"])},
            "average_sales": _format_score(b["avg_sales"]),
            "average_revenue": _format_score(b["avg_revenue"]),
            "average_rating": _format_score(b["avg_rating"]),
            "average_review_count": _format_score(b["avg_reviews"]),
            "average_bsr": _format_score(b["avg_bsr"]),
            "pricing_strength_score": _format_score(score),
            "product_count": b["product_count"],
        })

    strongest_ranges = sorted(price_buckets, key=lambda x: x["pricing_strength_score"], reverse=True)

    summary = f"Price elasticity analyzed across {len(price_buckets)} price ranges."
    if strongest_ranges:
        best = strongest_ranges[0]
        summary += f" The strongest tier is {best['tier']} ({best['price_range']['min']}-{best['price_range']['max']}) with the best combination of sales, revenue, and ratings."

    elapsed = round(time.time() - t0, 3)

    return {
        "status": "success",
        "metric_name": "Price Elasticity",
        "summary": summary,
        "datasets_used": ["blackbox"],
        "columns_used": numeric_cols_cleaned,
        "formula_used": "Pricing Strength Score combines normalized averages of sales, revenue, and rating per tier.",
        "results": {
            "price_buckets": price_buckets,
            "strongest_price_ranges": strongest_ranges,
            "bucket_count": len(price_buckets),
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
