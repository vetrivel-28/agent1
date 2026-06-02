from __future__ import annotations

import time
import re
from typing import Any, Dict, Optional, List

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger

logger = get_logger("hhi_engine")

_BRAND_CANDIDATES = ["Brand", "Brand Name", "Seller"]
_REVENUE_CANDIDATES = ["Parent Level Revenue", "Revenue", "ASIN Revenue", "Monthly Revenue"]
_ASIN_CANDIDATES = ["ASIN"]
_TITLE_CANDIDATES = ["Title", "Product Title", "Product Name"]
_NUMERIC_CLEAN_RE = re.compile(r"[^\d\.\-]")


def _market_structure(hhi: float) -> str:
    if hhi < 1500:
        return "Fragmented"
    if hhi <= 2500:
        return "Moderately Concentrated"
    if hhi <= 4000:
        return "Concentrated"
    return "Highly Dominated"


def _clean_numeric_series(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype(str)
        .str.replace(_NUMERIC_CLEAN_RE, "", regex=True)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "none": pd.NA, "null": pd.NA, "-": pd.NA})
    )
    return pd.to_numeric(cleaned, errors="coerce")


def _normalize_text(value: Any) -> str:
    text = str(value).lower() if value is not None else ""
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _cluster_thresholds(brand_count: int) -> Dict[str, float]:
    if brand_count <= 5:
        return {"leader": 12.0, "strong": 4.0, "niche": 1.5}
    if brand_count <= 15:
        return {"leader": 10.0, "strong": 3.0, "niche": 1.0}
    return {"leader": 10.0, "strong": 3.0, "niche": 1.0}


def _segment_name(share: float, rank: int, thresholds: Dict[str, float]) -> str:
    if rank <= 3 or share >= thresholds["leader"]:
        return "Market Leaders"
    if share >= thresholds["strong"]:
        return "Strong Competitors"
    if share >= thresholds["niche"]:
        return "Niche Players"
    return "Long Tail"


def _concentration_interpretation(top3_share: float, top5_share: float, brand_count: int) -> str:
    if top3_share >= 70:
        return "Highly Concentrated"
    if top3_share >= 50 or top5_share >= 75:
        return "Concentrated"
    if brand_count >= 25 and top3_share < 40:
        return "Fragmented"
    return "Moderately Concentrated"


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------

def run(blackbox_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()

    rows_before_cleaning = len(blackbox_df) if blackbox_df is not None else 0
    if blackbox_df is None or blackbox_df.empty:
        return _error_response("BlackBox dataset is required.", [], [], t0, rows_before_cleaning)

    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)

    if brand_col is None or revenue_col is None:
        return _error_response(
            "Required Brand or Parent Level Revenue columns are missing.",
            ["blackbox"],
            [c for c in [brand_col, revenue_col] if c],
            t0,
            rows_before_cleaning,
        )

    asin_col = find_column(blackbox_df, _ASIN_CANDIDATES)
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)

    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip().replace({"": "Unknown Brand"})
    work["revenue"] = _clean_numeric_series(blackbox_df[revenue_col])
    if asin_col:
        work["asin"] = blackbox_df[asin_col].astype(str).str.strip()
    if title_col:
        work["title_norm"] = blackbox_df[title_col].map(_normalize_text)
    work = work.dropna(subset=["revenue"])
    work = work[work["revenue"] > 0]
    work = work[work["brand"] != ""]

    if work.empty:
        return _error_response(
            "No valid brand revenue rows after cleaning.",
            ["blackbox"],
            [brand_col, revenue_col],
            t0,
            rows_before_cleaning,
        )

    if "asin" in work.columns:
        asin_values = work["asin"].replace({"": pd.NA, "nan": pd.NA, "none": pd.NA, "null": pd.NA}).dropna()
        total_products = int(asin_values.nunique())
        product_count_source = "ASIN"
    elif "title_norm" in work.columns:
        title_values = work["title_norm"]
        title_values = title_values[title_values != ""]
        total_products = int(title_values.nunique())
        product_count_source = "normalized_title"
    else:
        total_products = int(work.shape[0])
        product_count_source = "row_count"

    product_key = None
    if "asin" in work.columns:
        product_key = "asin"
    elif "title_norm" in work.columns:
        product_key = "title_norm"

    brand_revenue = work.groupby("brand", as_index=False, sort=False)["revenue"].sum()
    if product_key:
        brand_products = (
            work.loc[work[product_key].notna() & (work[product_key] != "")]
            .groupby("brand", as_index=False)[product_key]
            .nunique()
            .rename(columns={product_key: "product_count"})
        )
        brand_revenue = brand_revenue.merge(brand_products, on="brand", how="left")
    else:
        brand_revenue["product_count"] = work.groupby("brand", as_index=False).size()["size"]
    brand_revenue["product_count"] = brand_revenue["product_count"].fillna(0).astype(int)
    total_revenue = float(brand_revenue["revenue"].sum())

    if total_revenue == 0:
        return _error_response(
            "Total market revenue is zero after cleaning.",
            ["blackbox"],
            [brand_col, revenue_col],
            t0,
            rows_before_cleaning,
        )

    brand_revenue["market_share_pct"] = brand_revenue["revenue"] / total_revenue * 100.0
    brand_revenue["hhi_component"] = np.square(brand_revenue["market_share_pct"])
    hhi_score = float(brand_revenue["hhi_component"].sum())

    brand_revenue_sorted = brand_revenue.sort_values("market_share_pct", ascending=False).reset_index(drop=True)
    total_brands = int(brand_revenue_sorted.shape[0])

    market_structure = _market_structure(hhi_score)
    top3_share = float(brand_revenue_sorted["market_share_pct"].head(3).sum())
    top5_share = float(brand_revenue_sorted["market_share_pct"].head(5).sum())
    top1_share = float(brand_revenue_sorted["market_share_pct"].head(1).sum())
    largest_share = float(brand_revenue_sorted["market_share_pct"].iloc[0]) if total_brands > 0 else 0.0
    largest_brand = str(brand_revenue_sorted["brand"].iloc[0]) if total_brands > 0 else "N/A"
    concentration_type = _concentration_interpretation(top3_share, top5_share, total_brands)

    top_brands_list: List[Dict[str, Any]] = []
    thresholds = _cluster_thresholds(total_brands)
    for rank_idx, row in brand_revenue_sorted.head(max(top_n, 25)).iterrows():
        rank = rank_idx + 1
        share = float(row["market_share_pct"])
        product_count = int(row.get("product_count", 0) or 0)
        avg_revenue_per_product = float(row["revenue"]) / float(product_count) if product_count > 0 else 0.0
        segment = _segment_name(share, rank, thresholds)
        top_brands_list.append({
            "rank": rank,
            "brand": str(row["brand"]),
            "parent_revenue": round(float(row["revenue"]), 2),
            "revenue_share": round(share, 4),
            "product_count": product_count,
            "avg_revenue_per_product": round(avg_revenue_per_product, 2),
            "segment": segment,
        })

    segment_order = ["Market Leaders", "Strong Competitors", "Niche Players", "Long Tail"]
    segment_entries: List[Dict[str, Any]] = []
    segment_df = pd.DataFrame(top_brands_list)
    for seg in segment_order:
        seg_rows = segment_df[segment_df["segment"] == seg]
        if seg_rows.empty:
            continue
        combined_revenue = float(seg_rows["parent_revenue"].sum())
        combined_share = float(seg_rows["revenue_share"].sum())
        top_brands = seg_rows.sort_values("parent_revenue", ascending=False)["brand"].head(5).tolist()
        segment_entries.append({
            "segment": seg,
            "brand_count": int(seg_rows.shape[0]),
            "combined_revenue": round(combined_revenue, 2),
            "combined_share": round(combined_share, 4),
            "top_brands": top_brands,
        })

    rows_after_cleaning = int(work.shape[0])
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)

    return {
        "status": "success",
        "metric_name": "Market Concentration Index (HHI)",
        "summary": (
            f"Revenue-based market structure computed from Parent Level Revenue. "
            f"Top 3 brands control {top3_share:.1f}% of ${total_revenue:,.0f} total revenue."
        ),
        "datasets_used": ["blackbox"],
        "columns_used": [brand_col, revenue_col],
        "formula_used": (
            "Total Market Revenue = SUM(Parent Level Revenue); "
            "Brand Revenue = SUM(Parent Level Revenue) by Brand; "
            "Brand Revenue Share = Brand Revenue / Total Market Revenue × 100."
        ),
        "results": {
            "hhi_score": round(hhi_score, 2),
            "market_structure_type": market_structure,
            "top_3_share": round(top3_share, 2),
            "top_5_share": round(top5_share, 2),
            "largest_brand_share": round(largest_share, 2),
            "largest_brand_name": largest_brand,
            "top_brands_by_market_share": [
                {
                    "rank": b["rank"],
                    "brand": b["brand"],
                    "revenue": b["parent_revenue"],
                    "market_share_pct": b["revenue_share"],
                    "tier": b["segment"],
                }
                for b in top_brands_list
            ],
            "market_structure": {
                "total_market_revenue": round(total_revenue, 2),
                "active_brand_count": total_brands,
                "top_1_share": round(top1_share, 4),
                "top_3_share": round(top3_share, 4),
                "top_5_share": round(top5_share, 4),
                "concentration_type": concentration_type,
                "product_count_source": product_count_source,
                "total_products": total_products,
                "brand_rankings": top_brands_list,
                "competitive_landscape": segment_entries,
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


def _error_response(
    message: str,
    datasets_used: list,
    columns_used: list,
    t0: float,
    rows_before: int,
) -> Dict[str, Any]:
    return {
        "status": "warning",
        "message": message,
        "metric_name": "Market Concentration Index (HHI)",
        "summary": message,
        "datasets_used": datasets_used,
        "columns_used": columns_used,
        "formula_used": "",
        "results": {},
        "validation": {
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning": 0,
            "rows_skipped": rows_before,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
