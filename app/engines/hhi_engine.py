from __future__ import annotations

import time
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("hhi_engine")

_BRAND_CANDIDATES = ["Brand", "Seller"]
_REVENUE_CANDIDATES = ["ASIN Revenue", "Revenue", "Parent Level Revenue", "Monthly Revenue"]


def run(blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()

    rows_before_cleaning = len(blackbox_df) if blackbox_df is not None else 0
    if blackbox_df is None or blackbox_df.empty:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Market Concentration Index (HHI)",
            "summary": "BlackBox dataset is required.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)

    if brand_col is None or revenue_col is None:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Market Concentration Index (HHI)",
            "summary": "Required Brand or ASIN Revenue columns are missing.",
            "datasets_used": ["blackbox"],
            "columns_used": [c for c in [brand_col, revenue_col] if c],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip()
    work["revenue"], _ = clean_numeric_series(blackbox_df[revenue_col], revenue_col)
    work = work.dropna(subset=["revenue"])
    work = work[work["brand"] != ""]

    if work.empty:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Market Concentration Index (HHI)",
            "summary": "No valid brand revenue rows after cleaning.",
            "datasets_used": ["blackbox"],
            "columns_used": [brand_col, revenue_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [revenue_col],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    brand_revenue = work.groupby("brand", as_index=False, sort=False)["revenue"].sum()
    total_revenue = float(brand_revenue["revenue"].sum())
    if total_revenue == 0:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Market Concentration Index (HHI)",
            "summary": "Total market revenue is zero after cleaning.",
            "datasets_used": ["blackbox"],
            "columns_used": [brand_col, revenue_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [revenue_col],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    brand_revenue["market_share"] = brand_revenue["revenue"] / total_revenue
    brand_revenue["market_share_pct"] = brand_revenue["market_share"] * 100.0
    brand_revenue["hhi_component"] = np.square(brand_revenue["market_share_pct"])
    hhi_score = float(brand_revenue["hhi_component"].sum())

    if hhi_score < 1500:
        structure = "fragmented market"
    elif hhi_score <= 2500:
        structure = "moderately concentrated market"
    elif hhi_score <= 5000:
        structure = "concentrated market"
    else:
        structure = "monopoly danger"

    top_brands = (
        brand_revenue.sort_values("market_share_pct", ascending=False)
        .head(top_n)
        .round({"revenue": 2, "market_share_pct": 4, "hhi_component": 4})
        .replace({np.nan: None})
        .to_dict(orient="records")
    )

    p25 = float(brand_revenue["market_share_pct"].quantile(0.25))
    p75 = float(brand_revenue["market_share_pct"].quantile(0.75))
    concentration_distribution = {
        "brands_below_p25_share": int((brand_revenue["market_share_pct"] <= p25).sum()),
        "brands_between_p25_p75_share": int(
            ((brand_revenue["market_share_pct"] > p25) & (brand_revenue["market_share_pct"] < p75)).sum()
        ),
        "brands_above_p75_share": int((brand_revenue["market_share_pct"] >= p75).sum()),
    }

    rows_after_cleaning = int(work.shape[0])
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)

    return {
        "status": "success",
        "metric_name": "Market Concentration Index (HHI)",
        "summary": f"HHI indicates a {structure}.",
        "datasets_used": ["blackbox"],
        "columns_used": [brand_col, revenue_col],
        "formula_used": (
            "Total Revenue = SUM(Revenue); "
            "Brand Market Share = Brand Revenue / Total Revenue; "
            "HHI = SUM((market_share * 100)^2)."
        ),
        "results": {
            "hhi_score": round(hhi_score, 2),
            "market_structure_type": structure,
            "top_brands_by_market_share": top_brands,
            "concentration_distribution": concentration_distribution,
            "fragmentation_analysis": {
                "total_brands": int(brand_revenue.shape[0]),
                "total_market_revenue": round(total_revenue, 2),
                "largest_brand_share_pct": round(float(brand_revenue["market_share_pct"].max()), 4),
            },
        },
        "validation": {
            "rows_before_cleaning": rows_before_cleaning,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": [revenue_col],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
