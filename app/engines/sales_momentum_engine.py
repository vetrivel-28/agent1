"""
Sales Momentum Engine
=====================
Purpose  : Measure brand-level competitive momentum and market ownership.
Dataset  : BlackBox Products
Group By : Brand (Brand or Seller column ONLY — never product titles)

Logic    :
1. Aggregate revenue and sales at brand level using Brand/Seller field only.
2. Compute market share = brand_revenue / total_category_revenue.
3. Flag any brand with >50% share as a monopoly risk.
4. Momentum Score = percentile-normalized composite of:
   - Revenue Share (market power)
   - ASIN Sales velocity (sales performance)
   - Sales Trend acceleration (growth trajectory)
   - Revenue Efficiency (revenue per product = quality of share)
5. Classify brands into business roles:
   - Market Leaders        (high share + high momentum)
   - Emerging Challengers  (low share + high momentum)
   - Declining Players     (low share + low momentum)
   - Vulnerable Leaders    (high share + low momentum)
6. Market Concentration: Top 5 / Top 10 share, HHI proxy.
7. Share Gainers / Losers via revenue efficiency movement proxy.

Percentile normalization ensures scores spread 0-100:
   0-20  Declining
   20-40 Stable
   40-60 Emerging
   60-80 Accelerating
   80-100 Dominating
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import min_max_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("sales_momentum_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
# ---------------------------------------------------------------------------
_BRAND_CANDIDATES = [
    "Brand", "brand",
    "Seller", "seller",
]
_SALES_TREND_CANDIDATES = [
    "Sales Trend (90 days) (%)", "sales trend (90 days) (%)",
    "Sales Trend (%)", "sales trend (%)",
    "Sales Trend", "sales trend",
    "Sales Year Over Year (%)", "sales year over year (%)",
]
_ASIN_SALES_CANDIDATES = [
    "ASIN Sales", "asin sales",
    "Parent Level Sales", "parent level sales",
]
_REVENUE_CANDIDATES = [
    "ASIN Revenue", "asin revenue",
    "Revenue", "revenue",
    "Parent Level Revenue", "parent level revenue",
    "Monthly Revenue", "monthly revenue",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sv(v: Any) -> Any:
    if v is None or pd.isna(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v


def _percentile_normalize(series: pd.Series) -> pd.Series:
    """Convert to percentile ranks (0-100) for even score distribution."""
    if series.empty or series.notna().sum() == 0:
        return pd.Series(50.0, index=series.index)
    ranks = series.rank(method="average", pct=True, na_option="keep")
    return (ranks * 100.0).fillna(0.0)


def _momentum_tier(score: float) -> str:
    if score < 20:
        return "Declining"
    if score < 40:
        return "Stable"
    if score < 60:
        return "Emerging"
    if score < 80:
        return "Accelerating"
    return "Dominating"


def _business_label(share_pct: float, momentum_score: float) -> str:
    high_share = share_pct >= 10.0  # top-tier share threshold
    high_momentum = momentum_score >= 60.0
    if high_share and high_momentum:
        return "Market Leader"
    if not high_share and high_momentum:
        return "Emerging Challenger"
    if high_share and not high_momentum:
        return "Vulnerable Leader"
    return "Declining Player"


def _market_structure(top5_share: float) -> str:
    if top5_share < 40:
        return "Fragmented"
    if top5_share < 60:
        return "Moderately Concentrated"
    if top5_share < 80:
        return "Concentrated"
    return "Highly Dominated"


def _brand_records(df: pd.DataFrame, n: int) -> List[Dict[str, Any]]:
    records = []
    for _, row in df.head(n).iterrows():
        rec: Dict[str, Any] = {
            "brand": str(row["brand"]),
            "momentum_score": _sv(row.get("momentum_score")),
            "momentum_tier": _momentum_tier(float(row.get("momentum_score", 0))),
            "market_share_pct": _sv(row.get("market_share_pct")),
            "revenue": _sv(row.get("revenue")),
            "product_count": _sv(row.get("product_count")),
            "revenue_per_product": _sv(row.get("revenue_per_product")),
            "business_label": str(row.get("business_label", "")),
        }
        if "sales_trend" in row.index:
            rec["avg_sales_trend_pct"] = _sv(row.get("sales_trend"))
        if "asin_sales" in row.index:
            rec["total_asin_sales"] = _sv(row.get("asin_sales"))
        if "sales_trend_norm" in row.index:
            rec["sales_trend_score"] = _sv(row.get("sales_trend_norm"))
        if "revenue_share_norm" in row.index:
            rec["revenue_power_score"] = _sv(row.get("revenue_share_norm"))
        if "efficiency_norm" in row.index:
            rec["efficiency_score"] = _sv(row.get("efficiency_norm"))
        records.append(rec)
    return records


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------

def run(
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Sales Momentum engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _no_data_error("blackbox")

    rows_original = len(blackbox_df)
    logger.info(f"Original rows: {rows_original}")

    # -----------------------------------------------------------------------
    # 1. Locate columns — Brand/Seller ONLY, never title
    # -----------------------------------------------------------------------
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    trend_col = find_column(blackbox_df, _SALES_TREND_CANDIDATES)
    asin_sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)

    logger.info(
        f"Columns mapped — brand='{brand_col}', trend='{trend_col}', "
        f"asin_sales='{asin_sales_col}', revenue='{revenue_col}'"
    )

    columns_used: List[str] = []
    metrics_available: List[str] = []
    numeric_cols_cleaned: List[str] = []

    if brand_col is None:
        return {
            "status": "error",
            "metric_name": "Sales Momentum",
            "summary": "Brand or Seller column not found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": [],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Brand column not found.",
                "missing_columns": _BRAND_CANDIDATES[:2],
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    columns_used.append(brand_col)

    # -----------------------------------------------------------------------
    # 2. Build working dataframe — use Brand/Seller field ONLY
    # -----------------------------------------------------------------------
    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip()

    # Drop rows with missing/empty brand
    work = work[work["brand"] != ""]
    work = work[~work["brand"].str.lower().isin({"unknown", "n/a", "na", "none", ""})]

    # Clean numeric columns
    if trend_col:
        trend_clean, trend_stats = clean_numeric_series(blackbox_df[trend_col], trend_col)
        work["sales_trend"] = trend_clean
        numeric_cols_cleaned.append(trend_col)
        columns_used.append(trend_col)
        metrics_available.append("Sales Trend")

    if asin_sales_col:
        sales_clean, sales_stats = clean_numeric_series(blackbox_df[asin_sales_col], asin_sales_col)
        work["asin_sales"] = sales_clean
        numeric_cols_cleaned.append(asin_sales_col)
        columns_used.append(asin_sales_col)
        metrics_available.append("ASIN Sales")

    if revenue_col:
        rev_clean, rev_stats = clean_numeric_series(blackbox_df[revenue_col], revenue_col)
        work["revenue"] = rev_clean
        numeric_cols_cleaned.append(revenue_col)
        columns_used.append(revenue_col)
        metrics_available.append("Revenue")

    rows_after_cleaning = len(work)
    logger.info(f"Rows after brand + numeric cleaning: {rows_after_cleaning}")

    # -----------------------------------------------------------------------
    # 3. Brand-level aggregation
    # -----------------------------------------------------------------------
    agg_ops: Dict[str, str] = {}
    if "sales_trend" in work.columns:
        agg_ops["sales_trend"] = "mean"
    if "asin_sales" in work.columns:
        agg_ops["asin_sales"] = "sum"
    if "revenue" in work.columns:
        agg_ops["revenue"] = "sum"

    brand_agg = work.groupby("brand", as_index=False).agg(agg_ops)
    brand_agg["product_count"] = work.groupby("brand").size().values
    logger.info(f"Brands aggregated: {len(brand_agg)}")

    if brand_agg.empty:
        return _no_data_error("blackbox")

    # -----------------------------------------------------------------------
    # 4. Market share by REVENUE (not keyword counts)
    # -----------------------------------------------------------------------
    total_revenue = float(brand_agg["revenue"].sum()) if "revenue" in brand_agg.columns else 0.0
    total_products = int(brand_agg["product_count"].sum())

    if "revenue" in brand_agg.columns and total_revenue > 0:
        brand_agg["market_share_pct"] = brand_agg["revenue"] / total_revenue * 100.0
    else:
        # Fallback to sales-based share if revenue unavailable
        total_sales = float(brand_agg["asin_sales"].sum()) if "asin_sales" in brand_agg.columns else 0.0
        if total_sales > 0:
            brand_agg["market_share_pct"] = brand_agg["asin_sales"] / total_sales * 100.0
        else:
            brand_agg["market_share_pct"] = 0.0

    # Revenue efficiency = revenue per product (quality of market share)
    if "revenue" in brand_agg.columns and "product_count" in brand_agg.columns:
        brand_agg["revenue_per_product"] = brand_agg["revenue"] / brand_agg["product_count"].clip(lower=1)
    else:
        brand_agg["revenue_per_product"] = 0.0

    # -----------------------------------------------------------------------
    # 5. Flag dominant brands (>50% share)
    # -----------------------------------------------------------------------
    dominant_brands = brand_agg[brand_agg["market_share_pct"] > 50.0]["brand"].tolist()
    if dominant_brands:
        logger.warning(f"Dominant brand(s) detected with >50% share: {dominant_brands}")

    # -----------------------------------------------------------------------
    # 6. Percentile-normalized momentum score
    # -----------------------------------------------------------------------
    # Build component scores using percentile normalization for even spread
    norm_components: List[str] = []

    if "market_share_pct" in brand_agg.columns:
        brand_agg["revenue_share_norm"] = _percentile_normalize(brand_agg["market_share_pct"])
        norm_components.append("revenue_share_norm")

    if "asin_sales" in brand_agg.columns:
        brand_agg["asin_sales_norm"] = _percentile_normalize(brand_agg["asin_sales"])
        norm_components.append("asin_sales_norm")

    if "sales_trend" in brand_agg.columns:
        brand_agg["sales_trend_norm"] = _percentile_normalize(brand_agg["sales_trend"])
        norm_components.append("sales_trend_norm")

    if "revenue_per_product" in brand_agg.columns:
        brand_agg["efficiency_norm"] = _percentile_normalize(brand_agg["revenue_per_product"])
        norm_components.append("efficiency_norm")

    # Composite momentum score = weighted average of percentile norms
    weights = {
        "revenue_share_norm": 0.30,
        "asin_sales_norm": 0.25,
        "sales_trend_norm": 0.25,
        "efficiency_norm": 0.20,
    }

    momentum_score = pd.Series(0.0, index=brand_agg.index)
    weight_sum = 0.0
    for col, w in weights.items():
        if col in brand_agg.columns:
            momentum_score += brand_agg[col].fillna(0.0) * w
            weight_sum += w

    if weight_sum > 0:
        brand_agg["momentum_score"] = (momentum_score / weight_sum).clip(0.0, 100.0)
    else:
        brand_agg["momentum_score"] = 50.0

    # Ensure full 0-100 spread by re-percentiling if needed
    score_range = float(brand_agg["momentum_score"].max() - brand_agg["momentum_score"].min())
    if score_range < 30.0 and len(brand_agg) > 3:
        # Force percentile spread when original components cluster
        brand_agg["momentum_score"] = _percentile_normalize(brand_agg["momentum_score"])

    # -----------------------------------------------------------------------
    # 7. Business labels + tiers
    # -----------------------------------------------------------------------
    brand_agg["momentum_tier"] = brand_agg["momentum_score"].apply(_momentum_tier)
    brand_agg["business_label"] = brand_agg.apply(
        lambda row: _business_label(
            float(row.get("market_share_pct", 0)),
            float(row.get("momentum_score", 0)),
        ),
        axis=1,
    )

    # Sort by momentum score descending
    brand_sorted = brand_agg.sort_values("momentum_score", ascending=False).reset_index(drop=True)

    # -----------------------------------------------------------------------
    # 8. Segment counts
    # -----------------------------------------------------------------------
    market_leaders = brand_sorted[brand_sorted["business_label"] == "Market Leader"]
    emerging_challengers = brand_sorted[brand_sorted["business_label"] == "Emerging Challenger"]
    declining_players = brand_sorted[brand_sorted["business_label"] == "Declining Player"]
    vulnerable_leaders = brand_sorted[brand_sorted["business_label"] == "Vulnerable Leader"]

    # -----------------------------------------------------------------------
    # 9. Market concentration metrics
    # -----------------------------------------------------------------------
    # Sort by market share for concentration metrics
    brand_by_share = brand_sorted.sort_values("market_share_pct", ascending=False).reset_index(drop=True)

    top5_share = float(brand_by_share["market_share_pct"].head(5).sum())
    top10_share = float(brand_by_share["market_share_pct"].head(10).sum())
    top3_share = float(brand_by_share["market_share_pct"].head(3).sum())
    largest_share = float(brand_by_share["market_share_pct"].iloc[0]) if len(brand_by_share) > 0 else 0.0
    largest_brand = str(brand_by_share["brand"].iloc[0]) if len(brand_by_share) > 0 else "N/A"
    total_brands = len(brand_sorted)

    market_structure = _market_structure(top5_share)

    # HHI proxy from revenue shares
    hhi_proxy = float(np.square(brand_sorted["market_share_pct"]).sum())

    # -----------------------------------------------------------------------
    # 10. Share Gainers / Losers (revenue efficiency proxy)
    # -----------------------------------------------------------------------
    # Gainers = high efficiency + high momentum (capturing quality share)
    # Losers  = low efficiency + low momentum (losing quality share)
    if "efficiency_norm" in brand_sorted.columns:
        gainers = brand_sorted[
            (brand_sorted["efficiency_norm"] >= 60) &
            (brand_sorted["momentum_score"] >= 50)
        ].sort_values("momentum_score", ascending=False)
        losers = brand_sorted[
            (brand_sorted["efficiency_norm"] <= 40) &
            (brand_sorted["momentum_score"] <= 45)
        ].sort_values("momentum_score", ascending=True)
    else:
        gainers = brand_sorted[brand_sorted["momentum_score"] >= 65].sort_values("momentum_score", ascending=False)
        losers = brand_sorted[brand_sorted["momentum_score"] <= 35].sort_values("momentum_score", ascending=True)

    # -----------------------------------------------------------------------
    # 11. Executive summary construction
    # -----------------------------------------------------------------------
    exec_summary_parts: List[str] = []

    # Who owns the market
    if largest_share >= 30:
        exec_summary_parts.append(
            f"{largest_brand} dominates with {largest_share:.1f}% share. "
            f"The market is {market_structure.lower()}."
        )
    elif top5_share >= 50:
        exec_summary_parts.append(
            f"No single brand dominates. The top 5 control {top5_share:.1f}% collectively. "
            f"The market is {market_structure.lower()}."
        )
    else:
        exec_summary_parts.append(
            f"The market is fragmented across {total_brands} brands. "
            f"Top 5 hold only {top5_share:.1f}%."
        )

    # Who is gaining
    if len(gainers) > 0:
        top_gainer = gainers.iloc[0]
        exec_summary_parts.append(
            f"{top_gainer['brand']} is gaining share with {float(top_gainer['momentum_score']):.1f} momentum "
            f"and {float(top_gainer['market_share_pct']):.1f}% current share."
        )

    # Who is losing
    if len(losers) > 0:
        top_loser = losers.iloc[0]
        exec_summary_parts.append(
            f"{top_loser['brand']} is losing ground with {float(top_loser['momentum_score']):.1f} momentum "
            f"despite {float(top_loser['market_share_pct']):.1f}% share."
        )

    # Disruption signal
    if len(vulnerable_leaders) > 0 and len(emerging_challengers) > 0:
        exec_summary_parts.append(
            f"Disruption risk: {len(vulnerable_leaders)} vulnerable leader(s) face "
            f"{len(emerging_challengers)} emerging challenger(s)."
        )
    elif len(emerging_challengers) > 0:
        exec_summary_parts.append(
            f"{len(emerging_challengers)} emerging challenger(s) are climbing the rankings."
        )

    if dominant_brands:
        exec_summary_parts.append(
            f"WARNING: {', '.join(dominant_brands)} holds >50% share — monopoly risk detected."
        )

    executive_summary = " ".join(exec_summary_parts)

    # -----------------------------------------------------------------------
    # 12. Build records
    # -----------------------------------------------------------------------
    all_brands = _brand_records(brand_sorted, len(brand_sorted))
    leaders_records = _brand_records(market_leaders, top_n)
    challengers_records = _brand_records(emerging_challengers, top_n)
    declining_records = _brand_records(declining_players, top_n)
    vulnerable_records = _brand_records(vulnerable_leaders, top_n)
    gainer_records = _brand_records(gainers, top_n)
    loser_records = _brand_records(losers, top_n)

    # Market direction based on mean momentum tier
    mean_score = float(brand_sorted["momentum_score"].mean(skipna=True))
    if mean_score >= 60:
        market_direction = "Accelerating"
    elif mean_score >= 40:
        market_direction = "Emerging"
    elif mean_score >= 20:
        market_direction = "Stable"
    else:
        market_direction = "Declining"

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Sales Momentum complete: {total_brands} brands, "
        f"mean_score={mean_score:.2f}, direction={market_direction}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Sales Momentum",
        "summary": (
            f"{market_direction} market — {total_brands} brands analysed. "
            f"{len(market_leaders)} market leaders, {len(emerging_challengers)} emerging challengers, "
            f"{len(vulnerable_leaders)} vulnerable leaders, {len(declining_players)} declining players. "
            f"Top 5 control {top5_share:.1f}%."
        ),
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            "Momentum Score = percentile-normalized composite of "
            "Revenue Share (30%) + ASIN Sales (25%) + Sales Trend (25%) + Revenue Efficiency (20%). "
            "Market Share = brand_revenue / total_category_revenue."
        ),
        "results": {
            "market_direction": market_direction,
            "mean_momentum_score": round(mean_score, 2),
            "total_brands_analysed": total_brands,
            "total_market_revenue": round(total_revenue, 2) if total_revenue else None,
            "total_products": total_products,

            # Business segments
            "market_leaders": leaders_records,
            "emerging_challengers": challengers_records,
            "declining_players": declining_records,
            "vulnerable_leaders": vulnerable_records,
            "all_brands_momentum": all_brands,

            # Share movement
            "share_gainers": gainer_records,
            "share_losers": loser_records,

            # Market concentration
            "market_concentration": {
                "top_3_share": round(top3_share, 2),
                "top_5_share": round(top5_share, 2),
                "top_10_share": round(top10_share, 2),
                "largest_brand": largest_brand,
                "largest_brand_share": round(largest_share, 2),
                "market_structure": market_structure,
                "hhi_proxy": round(hhi_proxy, 2),
                "total_brands": total_brands,
            },

            # Dominance warnings
            "dominant_brands": dominant_brands,
            "dominant_brand_warning": len(dominant_brands) > 0,

            # Executive summary
            "executive_summary": executive_summary,
        },
        "validation": {
            "status": "passed",
            "metrics_found": metrics_available,
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_original - rows_after_cleaning,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "brands_found": total_brands,
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Error response helper
# ---------------------------------------------------------------------------

def _no_data_error(dataset: str) -> Dict:
    return {
        "status": "error",
        "metric_name": "Sales Momentum",
        "summary": f"Dataset '{dataset}' not uploaded or is empty.",
        "datasets_used": [dataset],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": f"Dataset '{dataset}' not uploaded or is empty.",
            "rows_before_cleaning": 0,
            "rows_after_cleaning": 0,
            "rows_skipped": 0,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": 0.0,
    }
