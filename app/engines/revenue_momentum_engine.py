"""
Growth Velocity Intelligence Engine
===================================
Purpose  : Identify brands rapidly gaining market traction.
Dataset  : BlackBox Products
Group By : Brand
Formula  : Revenue Momentum Score =
           0.40 × Sales Velocity +
           0.30 × Review Velocity +
           0.20 × BSR Momentum +
           0.10 × Revenue Strength

           Sales Velocity = normalized sales trend / sales YoY
           Review Velocity = normalized review count + review growth
           BSR Momentum = normalized current BSR and BSR trend
           Revenue Strength = log-normalized brand revenue

           Final score is normalised to 0-100.

Partial analysis is returned when one or more component signals are unavailable.
Numeric cleaning is applied before every aggregation step.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import min_max_normalize, rolling_trend_smoothing, safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("revenue_momentum_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
# ---------------------------------------------------------------------------
_BRAND_CANDIDATES = [
    "Brand", "brand", "Seller", "seller",
]
_REVENUE_CANDIDATES = [
    "ASIN Revenue", "asin revenue",
    "Revenue", "revenue",
    "Parent Level Revenue", "parent level revenue",
    "Monthly Revenue", "monthly revenue",
]
_ASIN_SALES_CANDIDATES = [
    "ASIN Sales", "asin sales",
    "Sales", "sales",
    "Parent Level Sales", "parent level sales",
]
_SALES_TREND_CANDIDATES = [
    "Sales Trend (90 days) (%)", "sales trend (90 days) (%)",
    "Sales Trend (%)", "sales trend (%)",
    "Sales Trend", "sales trend",
]
_SALES_YOY_CANDIDATES = [
    "Sales Year Over Year (%)", "sales year over year (%)",
    "Sales YoY (%)", "sales yoy (%)",
]
_REVIEW_COUNT_CANDIDATES = [
    "Review Count", "review count", "Reviews", "reviews", "Total Reviews", "total reviews",
]
_REVIEW_GROWTH_CANDIDATES = [
    "Monthly Review Growth", "monthly review growth",
    "Review Growth Rate", "review growth rate",
    "Review Growth", "review growth",
    "Review Velocity", "review velocity",
    "Monthly Review Growth (%)", "review growth (%)",
]
_BSR_CANDIDATES = [
    "BSR", "bsr", "Sales Rank", "sales rank",
    "Best Sellers Rank", "best sellers rank",
    "Rank", "rank",
]
_BSR_TREND_CANDIDATES = [
    "BSR Trend", "bsr trend", "BSR Change", "bsr change",
    "BSR Trend (%)", "bsr trend (%)", "Rank Trend", "rank trend",
    "Sales Rank Trend", "sales rank trend",
]


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Revenue Momentum engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _no_data_error("blackbox")

    rows_original = len(blackbox_df)
    logger.info(f"Original rows: {rows_original}")

    # -----------------------------------------------------------------------
    # Locate columns
    # -----------------------------------------------------------------------
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    rev_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
    sales_trend_col = find_column(blackbox_df, _SALES_TREND_CANDIDATES)
    sales_yoy_col = find_column(blackbox_df, _SALES_YOY_CANDIDATES)
    review_count_col = find_column(blackbox_df, _REVIEW_COUNT_CANDIDATES)
    review_growth_col = find_column(blackbox_df, _REVIEW_GROWTH_CANDIDATES)
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)
    bsr_trend_col = find_column(blackbox_df, _BSR_TREND_CANDIDATES)

    logger.info(
        f"Columns mapped — brand='{brand_col}', revenue='{rev_col}', "
        f"sales_trend='{sales_trend_col}', sales_yoy='{sales_yoy_col}', "
        f"review_count='{review_count_col}', review_growth='{review_growth_col}', "
        f"bsr='{bsr_col}', bsr_trend='{bsr_trend_col}'"
    )

    columns_used: List[str] = []
    metrics_available: List[str] = []
    numeric_cols_cleaned: List[str] = []
    partial = False

    if brand_col is None:
        return {
            "status": "error",
            "metric_name": "Revenue Momentum",
            "summary": "Brand column not found in BlackBox dataset.",
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

    if rev_col is None:
        return {
            "status": "error",
            "metric_name": "Revenue Momentum",
            "summary": "No revenue column found in BlackBox dataset.",
            "datasets_used": ["blackbox"],
            "columns_used": [brand_col],
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "No revenue column found.",
                "missing_columns": _REVENUE_CANDIDATES[:3],
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    columns_used.extend([brand_col, rev_col])
    metrics_available.append("Revenue")

    if sales_trend_col:
        columns_used.append(sales_trend_col)
        metrics_available.append("Sales Trend")
    if sales_yoy_col and sales_yoy_col != sales_trend_col:
        columns_used.append(sales_yoy_col)
        metrics_available.append("Sales YoY")
    if review_count_col:
        columns_used.append(review_count_col)
        metrics_available.append("Review Count")
    if review_growth_col:
        columns_used.append(review_growth_col)
        metrics_available.append("Review Growth")
    if bsr_col:
        columns_used.append(bsr_col)
        metrics_available.append("BSR")
    if bsr_trend_col:
        columns_used.append(bsr_trend_col)
        metrics_available.append("BSR Trend")

    if not any([sales_trend_col, sales_yoy_col, review_count_col, review_growth_col, bsr_col, bsr_trend_col]):
        partial = True
        logger.info(
            "Revenue Momentum: only revenue strength available — total momentum score will depend on revenue scale."
        )

    # -----------------------------------------------------------------------
    # Build working dataframe with cleaned numerics
    # -----------------------------------------------------------------------
    work = pd.DataFrame(index=blackbox_df.index)
    work["brand"] = blackbox_df[brand_col].astype(str).str.strip()

    rev_clean, rev_stats = clean_numeric_series(blackbox_df[rev_col], rev_col)
    logger.info(
        f"Revenue '{rev_col}': original={rev_stats['original_count']}, "
        f"cleaned={rev_stats['cleaned_count']}, nan={rev_stats['nan_introduced']}"
    )
    work["revenue"] = rev_clean
    numeric_cols_cleaned.append(rev_col)

    if sales_col:
        sales_clean, sales_stats = clean_numeric_series(blackbox_df[sales_col], sales_col)
        logger.info(
            f"Sales '{sales_col}': original={sales_stats['original_count']}, "
            f"cleaned={sales_stats['cleaned_count']}, nan={sales_stats['nan_introduced']}"
        )
        work["sales"] = sales_clean
        numeric_cols_cleaned.append(sales_col)


    if sales_trend_col:
        sales_trend_clean, sales_trend_stats = clean_numeric_series(
            blackbox_df[sales_trend_col], sales_trend_col
        )
        logger.info(
            f"Sales Trend '{sales_trend_col}': original={sales_trend_stats['original_count']}, "
            f"cleaned={sales_trend_stats['cleaned_count']}, nan={sales_trend_stats['nan_introduced']}"
        )
        work["sales_trend"] = sales_trend_clean
        numeric_cols_cleaned.append(sales_trend_col)

    if sales_yoy_col:
        sales_yoy_clean, sales_yoy_stats = clean_numeric_series(
            blackbox_df[sales_yoy_col], sales_yoy_col
        )
        logger.info(
            f"Sales YoY '{sales_yoy_col}': original={sales_yoy_stats['original_count']}, "
            f"cleaned={sales_yoy_stats['cleaned_count']}, nan={sales_yoy_stats['nan_introduced']}"
        )
        work["sales_yoy"] = sales_yoy_clean
        numeric_cols_cleaned.append(sales_yoy_col)

    if review_count_col:
        review_count_clean, review_count_stats = clean_numeric_series(
            blackbox_df[review_count_col], review_count_col
        )
        logger.info(
            f"Review Count '{review_count_col}': original={review_count_stats['original_count']}, "
            f"cleaned={review_count_stats['cleaned_count']}, nan={review_count_stats['nan_introduced']}"
        )
        work["review_count"] = review_count_clean
        numeric_cols_cleaned.append(review_count_col)

    if review_growth_col:
        review_growth_clean, review_growth_stats = clean_numeric_series(
            blackbox_df[review_growth_col], review_growth_col
        )
        logger.info(
            f"Review Growth '{review_growth_col}': original={review_growth_stats['original_count']}, "
            f"cleaned={review_growth_stats['cleaned_count']}, nan={review_growth_stats['nan_introduced']}"
        )
        work["review_growth"] = review_growth_clean
        numeric_cols_cleaned.append(review_growth_col)

    if bsr_col:
        bsr_clean, bsr_stats = clean_numeric_series(blackbox_df[bsr_col], bsr_col)
        logger.info(
            f"BSR '{bsr_col}': original={bsr_stats['original_count']}, "
            f"cleaned={bsr_stats['cleaned_count']}, nan={bsr_stats['nan_introduced']}"
        )
        work["bsr"] = bsr_clean
        numeric_cols_cleaned.append(bsr_col)

    if bsr_trend_col:
        bsr_trend_clean, bsr_trend_stats = clean_numeric_series(
            blackbox_df[bsr_trend_col], bsr_trend_col
        )
        logger.info(
            f"BSR Trend '{bsr_trend_col}': original={bsr_trend_stats['original_count']}, "
            f"cleaned={bsr_trend_stats['cleaned_count']}, nan={bsr_trend_stats['nan_introduced']}"
        )
        work["bsr_trend"] = bsr_trend_clean
        numeric_cols_cleaned.append(bsr_trend_col)

    rows_after_cleaning = len(work)
    logger.info(f"Rows after numeric cleaning: {rows_after_cleaning}")

    # -----------------------------------------------------------------------
    # Brand-level aggregation
    # -----------------------------------------------------------------------
    agg_dict: Dict[str, str] = {"revenue": "sum"}
    if "sales" in work.columns:
        agg_dict["sales"] = "sum"
    if "sales_trend" in work.columns:
        agg_dict["sales_trend"] = "mean"
    if "sales_yoy" in work.columns:
        agg_dict["sales_yoy"] = "mean"
    if "review_count" in work.columns:
        agg_dict["review_count"] = "sum"
    if "review_growth" in work.columns:
        agg_dict["review_growth"] = "mean"
    if "bsr" in work.columns:
        agg_dict["bsr"] = "mean"
    if "bsr_trend" in work.columns:
        agg_dict["bsr_trend"] = "mean"

    brand_agg = work.groupby("brand", as_index=False).agg(agg_dict)
    logger.info(f"Brands aggregated: {len(brand_agg)}")

    # -----------------------------------------------------------------------
    # Normalise each component and compute scores
    # -----------------------------------------------------------------------
    if "sales_trend" in brand_agg.columns:
        brand_agg["smooth_sales_trend"] = rolling_trend_smoothing(brand_agg["sales_trend"], window=5)
        brand_agg["norm_sales_trend"] = safe_log_normalize(brand_agg["smooth_sales_trend"])

    if "sales_yoy" in brand_agg.columns:
        brand_agg["norm_sales_yoy"] = safe_log_normalize(brand_agg["sales_yoy"])

    if "review_count" in brand_agg.columns:
        brand_agg["norm_review_count"] = safe_log_normalize(brand_agg["review_count"])

    if "review_growth" in brand_agg.columns:
        brand_agg["norm_review_growth"] = min_max_normalize(brand_agg["review_growth"])

    if "bsr" in brand_agg.columns:
        brand_agg["norm_current_bsr"] = (100.0 - min_max_normalize(brand_agg["bsr"]))

    if "bsr_trend" in brand_agg.columns:
        # Assume negative BSR change indicates improvement (lower rank number). Invert for positive momentum.
        brand_agg["norm_bsr_trend"] = min_max_normalize(-brand_agg["bsr_trend"])

    brand_agg["revenue_strength_score"] = safe_log_normalize(brand_agg["revenue"])
    valid_revenue = brand_agg["revenue"].notna()
    brand_agg.loc[valid_revenue & (brand_agg["revenue_strength_score"] == 0.0), "revenue_strength_score"] = 1.0

    def _mean_available(*cols: str) -> pd.Series:
        available = [brand_agg[col] for col in cols if col in brand_agg.columns]
        if not available:
            return pd.Series(np.nan, index=brand_agg.index, dtype=float)
        stack = pd.concat(available, axis=1)
        return stack.mean(axis=1)

    brand_agg["sales_velocity_score"] = _mean_available("norm_sales_trend", "norm_sales_yoy")
    brand_agg["review_velocity_score"] = _mean_available("norm_review_count", "norm_review_growth")
    brand_agg["bsr_momentum_score"] = _mean_available("norm_current_bsr", "norm_bsr_trend")

    # Ensure all component scores are numeric and clipped to 0-100
    for col in [
        "sales_velocity_score",
        "review_velocity_score",
        "bsr_momentum_score",
        "revenue_strength_score",
    ]:
        brand_agg[col] = pd.to_numeric(brand_agg[col], errors="coerce").clip(0.0, 100.0)

    weight_map = {
        "sales_velocity_score": 0.4,
        "review_velocity_score": 0.3,
        "bsr_momentum_score": 0.2,
        "revenue_strength_score": 0.1,
    }

    brand_agg["momentum_weight_sum"] = 0.0
    brand_agg["momentum_raw_score"] = 0.0

    for component, weight in weight_map.items():
        if component in brand_agg.columns:
            valid = brand_agg[component].notna()
            brand_agg.loc[valid, "momentum_raw_score"] += brand_agg.loc[valid, component] * weight
            brand_agg.loc[valid, "momentum_weight_sum"] += weight

    brand_agg["momentum_score"] = (
        brand_agg["momentum_raw_score"] / brand_agg["momentum_weight_sum"].replace({0.0: np.nan})
    ).fillna(0.0).clip(0.0, 100.0)

    brand_agg["momentum_category"] = brand_agg["momentum_score"].apply(_momentum_category)

    def _weakest_driver(row: pd.Series) -> str:
        candidates = {
            "Sales Velocity": row.get("sales_velocity_score"),
            "Review Velocity": row.get("review_velocity_score"),
            "BSR Momentum": row.get("bsr_momentum_score"),
            "Revenue Strength": row.get("revenue_strength_score"),
        }
        valid = {k: float(v) for k, v in candidates.items() if v is not None and not pd.isna(v)}
        if not valid:
            return "Insufficient data"
        return min(valid, key=valid.get)

    def _primary_driver(row: pd.Series) -> str:
        candidates = {
            "Sales Velocity": row.get("sales_velocity_score"),
            "Review Velocity": row.get("review_velocity_score"),
            "BSR Momentum": row.get("bsr_momentum_score"),
            "Revenue Strength": row.get("revenue_strength_score"),
        }
        valid = {k: float(v) for k, v in candidates.items() if v is not None and not pd.isna(v)}
        if not valid:
            return "Unknown"
        return max(valid, key=valid.get)

    def _market_position(row: pd.Series) -> str:
        revenue_strength = float(row.get("revenue_strength_score") or 0)
        momentum = float(row.get("momentum_score") or 0)
        if revenue_strength >= 50 and momentum >= 60:
            return "Market Leader"
        if revenue_strength < 50 and momentum >= 60:
            return "Emerging Challenger"
        if revenue_strength >= 50 and momentum < 40:
            return "Mature Incumbent"
        return "Weak Player"

    def _momentum_risk(row: pd.Series) -> str:
        revenue_strength = float(row.get("revenue_strength_score") or 0)
        momentum = float(row.get("momentum_score") or 0)
        if revenue_strength > 70 and momentum < 40:
            return "Losing Momentum"
        if momentum > 75 and revenue_strength < 40:
            return "Emerging Opportunity"
        return ""

    def _segment_label(row: pd.Series) -> str:
        revenue_strength = float(row.get("revenue_strength_score") or 0)
        momentum = float(row.get("momentum_score") or 0)
        if revenue_strength < 50 and momentum >= 60:
            return "Emerging Challengers"
        if revenue_strength >= 50 and momentum >= 60:
            return "Market Leaders"
        if revenue_strength >= 50 and momentum < 60:
            return "Mature Incumbents"
        return "Weak Players"

    brand_agg["primary_driver"] = brand_agg.apply(_primary_driver, axis=1)
    brand_agg["market_position"] = brand_agg.apply(_market_position, axis=1)
    brand_agg["momentum_risk"] = brand_agg.apply(_momentum_risk, axis=1)
    brand_agg["weakest_driver"] = brand_agg.apply(_weakest_driver, axis=1)

    # -----------------------------------------------------------------------
    # Percentile-based classification
    # -----------------------------------------------------------------------
    p75 = brand_agg["momentum_score"].quantile(0.75)
    p25 = brand_agg["momentum_score"].quantile(0.25)

    brand_sorted = brand_agg.sort_values("momentum_score", ascending=False)

    momentum_leaders = _brand_records(
        brand_sorted[brand_sorted["momentum_score"] >= p75], top_n
    )
    momentum_laggards = _brand_records(
        brand_sorted[brand_sorted["momentum_score"] <= p25].sort_values("momentum_score"),
        top_n,
    )
    all_brands = _brand_records(brand_sorted, len(brand_sorted))

    brand_agg["segment_label"] = brand_agg.apply(lambda row: _segment_label(row), axis=1)

    segment_labels = [
        "Emerging Challengers",
        "Market Leaders",
        "Mature Incumbents",
        "Weak Players",
    ]
    momentum_segments = []
    for label in segment_labels:
        segment_df = brand_agg[brand_agg["segment_label"] == label]
        momentum_segments.append({
            "segment_label": label,
            "brand_count": int(len(segment_df)),
            "avg_momentum_score": round(float(segment_df["momentum_score"].mean(skipna=True) or 0.0), 1),
            "top_brands": [
                str(x) for x in segment_df.sort_values("momentum_score", ascending=False).head(3)["brand"].tolist()
            ],
        })

    momentum_risks = _brand_records(
        brand_agg[brand_agg["momentum_risk"] == "Losing Momentum"], top_n
    )
    momentum_opportunities = _brand_records(
        brand_agg[brand_agg["momentum_risk"] == "Emerging Opportunity"], top_n
    )

    emerging_challengers_count = int(
        brand_agg[brand_agg["momentum_category"].isin(["Breakout Brand", "Hyper Growth"])].shape[0]
    )
    incumbents_losing_momentum_count = int(
        brand_agg[(brand_agg["revenue_strength_score"] > 70) & (brand_agg["momentum_score"] < 40)].shape[0]
    )

    # -----------------------------------------------------------------------
    # Market direction
    # -----------------------------------------------------------------------
    market_mean = float(brand_agg["momentum_score"].mean(skipna=True))
    market_median = float(brand_agg["momentum_score"].median(skipna=True))
    total_revenue = float(brand_agg["revenue"].sum(skipna=True))

    brand_agg["revenue_share"] = (brand_agg["revenue"] / total_revenue * 100.0).fillna(0.0) if total_revenue > 0 else 0.0

    if market_mean >= 60:
        direction = "Growing"
    elif market_mean >= 40:
        direction = "Stable"
    else:
        direction = "Declining"

    top10_sum = float(brand_sorted.head(10)["momentum_score"].sum(skipna=True))
    total_momentum_sum = float(brand_sorted["momentum_score"].sum(skipna=True))
    momentum_concentration = (top10_sum / total_momentum_sum * 100.0) if total_momentum_sum > 0 else 0.0
    if momentum_concentration < 25:
        momentum_distribution_label = "Distributed"
    elif momentum_concentration < 50:
        momentum_distribution_label = "Balanced"
    elif momentum_concentration < 75:
        momentum_distribution_label = "Concentrated"
    else:
        momentum_distribution_label = "Dominated"

    fastest_growth_brand = momentum_leaders[0] if momentum_leaders else {}
    highest_review_velocity_brand = None
    if "review_velocity_score" in brand_agg.columns:
        best_review_idx = brand_agg["review_velocity_score"].idxmax()
        if pd.notna(best_review_idx):
            highest_review_velocity_brand = _brand_records(brand_agg.loc[[best_review_idx]], 1)[0]
    highest_review_velocity_brand = highest_review_velocity_brand or {}

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"Revenue Momentum complete: {len(brand_agg)} brands, "
        f"market_mean={market_mean:.2f}, partial={partial}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "Revenue Momentum",
        "summary": (
            f"Market revenue momentum is {direction.lower()}. "
            f"Mean brand score: {round(market_mean, 2)}/100. "
            f"Total market revenue: ${total_revenue:,.2f}."
            + (" (Partial — many momentum signals unavailable.)" if partial else "")
        ),
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            "Revenue Momentum Score = 0.40×SalesVelocity + 0.30×ReviewVelocity + "
            "0.20×BSRMomentum + 0.10×RevenueStrength, normalized to 0-100. "
            f"Metrics used: {metrics_available}"
        ),
        "audit_flags": {
            "sales_trend_available": bool(sales_trend_col),
            "sales_yoy_available": bool(sales_yoy_col),
            "review_growth_available": bool(review_growth_col),
            "bsr_trend_available": bool(bsr_trend_col),
        },
        "results": {
            "market_momentum_direction": direction,
            "market_mean_score": round(market_mean, 2),
            "market_median_score": round(market_median, 2),
            "total_market_revenue": round(total_revenue, 2),
            "total_brands_analysed": len(brand_agg),
            "partial_analysis": partial,
            "momentum_concentration": round(momentum_concentration, 2),
            "momentum_distribution_label": momentum_distribution_label,
            "emerging_challengers_count": emerging_challengers_count,
            "incumbents_losing_momentum_count": incumbents_losing_momentum_count,
            "momentum_segments": momentum_segments,
            "momentum_risks": momentum_risks,
            "momentum_opportunities": momentum_opportunities,
            "fastest_growth_brand": fastest_growth_brand,
            "highest_review_velocity_brand": highest_review_velocity_brand,
            "momentum_leaders": momentum_leaders,
            "momentum_laggards": momentum_laggards,
            "all_brands_momentum": all_brands,
            # backward compatible fields
            "top_revenue_growth_brands": momentum_leaders,
            "declining_revenue_brands": momentum_laggards,
            "all_brands_revenue_momentum": all_brands,
        },
        "validation": {
            "status": "passed",
            "metrics_found": metrics_available,
            "partial_analysis": partial,
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_original - rows_after_cleaning,
            "numeric_columns_cleaned": numeric_cols_cleaned,
            "brands_found": len(brand_agg),
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _momentum_category(score: float) -> str:
    if pd.isna(score):
        return "Unknown"
    value = float(score)
    if value >= 90:
        return "Breakout Brand"
    if value >= 75:
        return "Hyper Growth"
    if value >= 60:
        return "Strong Momentum"
    if value >= 40:
        return "Stable"
    if value >= 20:
        return "Weak Momentum"
    return "Declining"


def _brand_records(df: pd.DataFrame, n: int) -> List[Dict]:
    records = []
    for _, row in df.head(n).iterrows():
        drivers = {
            "sales_velocity": _sv(row.get("sales_velocity_score")),
            "review_velocity": _sv(row.get("review_velocity_score")),
            "bsr_momentum": _sv(row.get("bsr_momentum_score")),
            "revenue_strength": _sv(row.get("revenue_strength_score")),
        }
        
        # Validation Rule
        valid_drivers = {k: v for k, v in drivers.items() if v is not None}
        primary_engine_calc = "Unknown"
        
        if valid_drivers:
            # max() by value. We map keys back to their capitalized display names
            driver_name_map = {
                "sales_velocity": "Sales Velocity",
                "review_velocity": "Review Velocity",
                "bsr_momentum": "BSR Momentum",
                "revenue_strength": "Revenue Strength"
            }
            max_driver_key = max(valid_drivers, key=valid_drivers.get)
            primary_engine_calc = driver_name_map[max_driver_key]
            
        primary_engine = _sv(row.get("primary_driver")) or primary_engine_calc

        if primary_engine != primary_engine_calc and primary_engine != "Unknown" and primary_engine_calc != "Unknown":
            logger.error(f"Validation Error for {row['brand']}: Computed Primary Engine '{primary_engine}' does not match highest driver '{primary_engine_calc}'")

        rec: Dict[str, Any] = {
            "brand": str(row["brand"]),
            "momentum_score": _sv(row.get("momentum_score")),
            "revenue_momentum_score": _sv(row.get("momentum_score")),
            "sales_velocity_score": _sv(row.get("sales_velocity_score")),
            "review_velocity_score": _sv(row.get("review_velocity_score")),
            "bsr_momentum_score": _sv(row.get("bsr_momentum_score")),
            "revenue_strength_score": _sv(row.get("revenue_strength_score")),
            "total_revenue": _sv(row.get("revenue")),
            "revenue_share": _sv(row.get("revenue_share")),
            "sales_estimate": _sv(row.get("sales")),
            "momentum_category": _sv(row.get("momentum_category")),
            "weakest_driver": _sv(row.get("weakest_driver")),
            "primary_engine": primary_engine,
            "drivers": drivers,
        }
        if "sales_trend" in row.index:
            rec["avg_sales_trend_pct"] = _sv(row.get("sales_trend"))
        if "sales_yoy" in row.index:
            rec["avg_sales_yoy_pct"] = _sv(row.get("sales_yoy"))
        if "review_count" in row.index:
            rec["total_review_count"] = _sv(row.get("review_count"))
        if "review_growth" in row.index:
            rec["avg_review_growth_pct"] = _sv(row.get("review_growth"))
        if "bsr" in row.index:
            rec["average_bsr"] = _sv(row.get("bsr"))
        if "bsr_trend" in row.index:
            rec["avg_bsr_trend"] = _sv(row.get("bsr_trend"))
        records.append(rec)
    return records


def _sv(v: Any) -> Any:
    if v is None:
        return None
    if pd.isna(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v


def _no_data_error(dataset: str) -> Dict:
    return {
        "status": "error",
        "metric_name": "Revenue Momentum",
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
