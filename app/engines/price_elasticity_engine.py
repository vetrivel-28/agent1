"""
Price Intelligence Engine
=========================
Business-focused pricing strategy analysis from BlackBox catalog data.

Answers: where the market makes money, dominant price range, budget vs premium
structure, best entry band, and bands to avoid.

Requires: Price + at least one of ASIN Revenue / ASIN Sales.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("price_elasticity_engine")

_PRICE_CANDIDATES = ["Price", "price", "List Price", "list price"]
_ASIN_SALES_CANDIDATES = ["ASIN Sales", "asin sales", "AsinSales", "Parent Level Sales"]
_REVENUE_CANDIDATES = ["ASIN Revenue", "asin revenue", "Revenue", "revenue", "Parent Level Revenue"]
_BSR_CANDIDATES = ["BSR", "bsr", "Best Sellers Rank", "Subcategory BSR"]
_SELLER_CANDIDATES = ["Seller", "seller", "Brand", "brand"]
_ACTIVE_SELLERS_CANDIDATES = [
    "Number of Active Sellers", "number of active sellers", "Active Sellers",
]

_FIXED_BUCKETS: List[Tuple[float, float]] = [
    (0.0, 10.0),
    (10.0, 15.0),
    (15.0, 20.0),
    (20.0, 25.0),
    (25.0, 30.0),
    (30.0, float("inf")),
]


def _round2(val: float) -> float:
    if val is None or (isinstance(val, float) and (np.isnan(val) or np.isinf(val))):
        return 0.0
    return round(float(val), 2)


def _percentile_rank(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if len(numeric) < 2:
        return pd.Series(50.0, index=series.index)
    ranks = numeric.rank(method="average", ascending=True)
    return ((ranks - 1) / (len(numeric) - 1) * 100.0).clip(0, 100)


def _format_band_label(lower: float, upper: float) -> str:
    if np.isinf(upper):
        return f"${lower:.2f}+"
    return f"${lower:.2f}–${upper:.2f}"


def _format_price_range(min_price: float, max_price: float) -> str:
    if max_price is None or np.isinf(max_price):
        return f"${min_price:.2f}+"
    return f"${min_price:.2f} - ${max_price:.2f}"


def _compute_category_pricing_overview(prices: pd.Series) -> Dict[str, Any]:
    valid = pd.to_numeric(prices, errors="coerce").dropna()
    valid = valid[valid > 0]
    if valid.empty:
        return {}
    min_p = float(valid.min())
    med_p = float(valid.median())
    max_p = float(valid.max())
    return {
        "min_price": _round2(min_p),
        "median_price": _round2(med_p),
        "max_price": _round2(max_p),
        "category_price_range": _format_price_range(min_p, max_p),
    }


def _compute_price_tier_thresholds(prices: pd.Series) -> Tuple[float, float]:
    valid = pd.to_numeric(prices, errors="coerce").dropna()
    valid = valid[valid > 0]
    if len(valid) < 3:
        med = float(valid.median()) if len(valid) else 0.0
        return med, med
    return float(valid.quantile(0.33)), float(valid.quantile(0.67))


def _assign_price_tier(price: float, tier_low: float, tier_high: float) -> str:
    if price <= tier_low:
        return "Budget"
    if price <= tier_high:
        return "Mid-Tier"
    return "Premium"


def _build_price_tier_summary(
    prices: pd.Series,
    tier_low: float,
    tier_high: float,
    catalog_min: float,
    catalog_max: float,
) -> List[Dict[str, Any]]:
    return [
        {
            "tier": "Budget",
            "price_range": _format_price_range(catalog_min, tier_low),
            "price_min": _round2(catalog_min),
            "price_max": _round2(tier_low),
        },
        {
            "tier": "Mid-Tier",
            "price_range": _format_price_range(tier_low, tier_high),
            "price_min": _round2(tier_low),
            "price_max": _round2(tier_high),
        },
        {
            "tier": "Premium",
            "price_range": f"${tier_high:.2f}+",
            "price_min": _round2(tier_high),
            "price_max": _round2(catalog_max),
            "price_range_open": f"${tier_high:.2f}+",
        },
    ]


def _tier_for_bucket(avg_price: float, tier_low: float, tier_high: float) -> str:
    return _assign_price_tier(avg_price, tier_low, tier_high)


def _aggregate_revenue_by_tier(buckets: List[Dict[str, Any]], total_revenue: float) -> List[Dict[str, Any]]:
    tier_order = ["Budget", "Mid-Tier", "Premium"]
    totals: Dict[str, float] = {t: 0.0 for t in tier_order}
    for b in buckets:
        tier = b.get("tier", "Mid-Tier")
        if tier in totals:
            totals[tier] += float(b.get("revenue", 0))
    rows: List[Dict[str, Any]] = []
    for tier in tier_order:
        rev = totals[tier]
        share = (rev / total_revenue * 100.0) if total_revenue > 0 else 0.0
        rows.append({
            "tier": tier,
            "revenue": _round2(rev),
            "revenue_share_pct": _round2(share),
            "chart_label": tier,
        })
    return rows


def _create_quantile_buckets(prices: pd.Series, n_buckets: int = 6) -> List[Tuple[float, float]]:
    valid = prices.dropna()
    valid = valid[valid > 0]
    if len(valid) < 10:
        return []
    quantiles = np.linspace(0, 1, n_buckets + 1)
    edges = [float(valid.quantile(q)) for q in quantiles]
    unique: List[float] = []
    for edge in edges:
        if not unique or abs(edge - unique[-1]) > 1e-6:
            unique.append(edge)
    if len(unique) < 2:
        return []
    buckets: List[Tuple[float, float]] = []
    for i in range(len(unique) - 1):
        upper = unique[i + 1]
        if i == len(unique) - 2:
            upper = max(upper, unique[i] + 0.01)
        buckets.append((unique[i], upper if i < len(unique) - 2 else float("inf")))
    if buckets and not np.isinf(buckets[-1][1]):
        buckets[-1] = (buckets[-1][0], float("inf"))
    return buckets


def _assign_fixed_buckets(prices: pd.Series) -> pd.Series:
    def bucket_idx(price: float) -> int:
        for i, (lo, hi) in enumerate(_FIXED_BUCKETS):
            if lo <= price < hi or (hi == float("inf") and price >= lo):
                return i
        return len(_FIXED_BUCKETS) - 1

    return prices.apply(bucket_idx)


def _premium_viability_rating(premium_revenue_pct: float) -> str:
    """Whether premium-tier products capture meaningful category revenue."""
    if premium_revenue_pct >= 35:
        return "Strong"
    if premium_revenue_pct >= 15:
        return "Moderate"
    return "Weak"


def _recommendation(
    revenue_share: float,
    share_rank: float,
    density_rank: float,
    tier_perf_rank: float,
) -> str:
    """Band recommendation from revenue share, density, and tier performance only."""
    composite = 0.45 * share_rank + 0.35 * density_rank + 0.20 * tier_perf_rank
    if revenue_share < 5:
        return "Avoid"
    if composite >= 70:
        return "Strong Concentration"
    if composite >= 45:
        return "Moderate Concentration"
    return "Low Priority"


def _market_pricing_structure(
    buckets: List[Dict[str, Any]],
    total_revenue: float,
    category_overview: Dict[str, Any],
    tier_revenue: List[Dict[str, Any]],
) -> Dict[str, Any]:
    if not buckets or total_revenue <= 0:
        return {
            "classification": "Unavailable",
            "budget_revenue_pct": 0.0,
            "mid_tier_revenue_pct": 0.0,
            "premium_revenue_pct": 0.0,
            "dominant_range": "—",
            "dominant_tier": "—",
            "category_price_range": category_overview.get("category_price_range", "—"),
            "median_price": category_overview.get("median_price"),
        }

    tier_pct = {row["tier"]: row["revenue_share_pct"] for row in tier_revenue}
    budget_pct = float(tier_pct.get("Budget", 0))
    mid_pct = float(tier_pct.get("Mid-Tier", 0))
    premium_pct = float(tier_pct.get("Premium", 0))

    dominant_tier_row = max(tier_revenue, key=lambda r: r["revenue_share_pct"])
    dominant_tier = dominant_tier_row["tier"]
    classification = f"{dominant_tier} Driven"

    bands_in_dominant_tier = [b for b in buckets if b.get("tier") == dominant_tier]
    if bands_in_dominant_tier:
        dominant_band = max(bands_in_dominant_tier, key=lambda b: b["revenue_share_pct"])
    else:
        dominant_band = max(buckets, key=lambda b: b["revenue_share_pct"])

    return {
        "classification": classification,
        "budget_revenue_pct": budget_pct,
        "mid_tier_revenue_pct": mid_pct,
        "premium_revenue_pct": premium_pct,
        "dominant_range": dominant_band["price_band"],
        "dominant_tier": dominant_tier,
        "category_price_range": category_overview.get("category_price_range", "—"),
        "median_price": category_overview.get("median_price"),
        "min_price": category_overview.get("min_price"),
        "max_price": category_overview.get("max_price"),
    }


def _premium_revenue_insight(premium_pct: float) -> Dict[str, str]:
    if premium_pct <= 0:
        return {
            "category": "Premium Revenue",
            "text": (
                "Premium-priced products capture little category revenue — "
                "buyer spending concentrates below the premium threshold."
            ),
        }
    if premium_pct >= 15:
        return {
            "category": "Premium Revenue",
            "text": (
                f"Premium-priced products account for {premium_pct:.0f}% of category revenue, "
                "indicating meaningful willingness to pay among buyers."
            ),
        }
    return {
        "category": "Premium Revenue",
        "text": (
            f"Premium-priced products account for {premium_pct:.0f}% of category revenue, "
            "indicating limited premium demand relative to budget and mid-tier bands."
        ),
    }


def _generate_insights(
    buckets: List[Dict[str, Any]],
    market_structure: Dict[str, Any],
    gap_band: Optional[Dict[str, Any]],
    entry_band: Optional[Dict[str, Any]],
) -> List[Dict[str, str]]:
    insights: List[Dict[str, str]] = []
    mid_bands = sorted(buckets, key=lambda b: b["revenue_share_pct"], reverse=True)
    top2 = mid_bands[:2]

    if top2:
        tier0 = top2[0].get("tier", "")
        insights.append({
            "category": "Key Finding",
            "text": (
                f"{top2[0]['revenue_share_pct']:.0f}% of category revenue concentrates in "
                f"{tier0 + ' ' if tier0 else ''}{top2[0]['price_band']}"
                + (
                    f", with {top2[1]['revenue_share_pct']:.0f}% in "
                    f"{top2[1].get('tier', '') + ' ' if top2[1].get('tier') else ''}{top2[1]['price_band']}."
                    if len(top2) > 1
                    else "."
                )
            ),
        })

    premium_pct = float(market_structure.get("premium_revenue_pct", 0))
    insights.append(_premium_revenue_insight(premium_pct))

    dominant_tier = market_structure.get("dominant_tier", "")
    tier_share_pct = {
        "Budget": float(market_structure.get("budget_revenue_pct", 0)),
        "Mid-Tier": float(market_structure.get("mid_tier_revenue_pct", 0)),
        "Premium": float(market_structure.get("premium_revenue_pct", 0)),
    }.get(dominant_tier, 0)
    insights.append({
        "category": "Market Structure",
        "text": (
            f"The market is {market_structure.get('classification', '—')}: "
            f"{dominant_tier} captures the largest revenue share ({tier_share_pct:.0f}%), "
            f"with the strongest band at {market_structure.get('dominant_range', '—')}."
        ),
    })

    if gap_band:
        insights.append({
            "category": "Market Gap",
            "text": (
                f"{gap_band.get('tier', '')} band {gap_band['price_band']} delivers "
                f"{gap_band['revenue_density']:.0f} revenue per ASIN — "
                f"above-average revenue density for its price level."
            ),
        })
    else:
        insights.append({
            "category": "Market Gap",
            "text": "Revenue density is evenly distributed — no single band shows a clear structural gap.",
        })

    if entry_band:
        insights.append({
            "category": "Revenue Concentration",
            "text": (
                f"The {entry_band.get('tier', '')} band {entry_band['price_band']} combines "
                f"{entry_band['revenue_share_pct']:.0f}% revenue share with "
                f"strong revenue density — {entry_band['recommendation']}."
            ),
        })

    return insights


def _unavailable_response(
    message: str,
    missing: List[str],
    rows_before: int,
    t0: float,
) -> Dict[str, Any]:
    return {
        "status": "unavailable",
        "metric_name": "Price Intelligence",
        "summary": message,
        "datasets_used": ["blackbox"],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "unavailable",
            "message": message,
            "missing_columns": missing,
            "rows_before_cleaning": rows_before,
            "rows_after_cleaning": 0,
            "rows_skipped": rows_before,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }


def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    n_buckets: int = 6,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("Price Intelligence engine started.")

    rows_blackbox = len(blackbox_df) if blackbox_df is not None else 0

    if blackbox_df is None or blackbox_df.empty:
        return _unavailable_response("No BlackBox products dataset available.", [], 0, t0)

    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    asin_sales_col = find_column(blackbox_df, _ASIN_SALES_CANDIDATES)
    revenue_col = find_column(blackbox_df, _REVENUE_CANDIDATES)
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)
    seller_col = find_column(blackbox_df, _SELLER_CANDIDATES)
    active_sellers_col = find_column(blackbox_df, _ACTIVE_SELLERS_CANDIDATES)

    missing_required: List[str] = []
    if not price_col:
        missing_required.append("Price")
    if not revenue_col and not asin_sales_col:
        missing_required.extend(["ASIN Revenue", "ASIN Sales"])

    if missing_required:
        return _unavailable_response(
            f"Required columns missing: {', '.join(missing_required)}.",
            missing_required,
            rows_blackbox,
            t0,
        )

    df = blackbox_df.copy()
    numeric_cols_cleaned: List[str] = []

    def clean_col(col_name: Optional[str], allow_negative: bool = False) -> pd.Series:
        if col_name:
            clean, _ = clean_numeric_series(
                df[col_name], col_name, remove_negative=not allow_negative
            )
            numeric_cols_cleaned.append(col_name)
            return clean
        return pd.Series(np.nan, index=df.index, dtype=float)

    df["_price"] = clean_col(price_col)
    df["_sales"] = clean_col(asin_sales_col)
    df["_revenue"] = clean_col(revenue_col)
    df["_bsr"] = clean_col(bsr_col)
    df["_active_sellers"] = clean_col(active_sellers_col)

    if revenue_col:
        df["_demand_value"] = df["_revenue"].fillna(0)
    else:
        df["_demand_value"] = df["_sales"].fillna(0)

    df_valid = df.dropna(subset=["_price"]).copy()
    df_valid = df_valid[df_valid["_price"] > 0]
    rows_before = len(df)
    rows_after = len(df_valid)
    rows_skipped = rows_before - rows_after

    if rows_after < 10:
        return _unavailable_response(
            "Insufficient products with valid price data (need at least 10).",
            missing_required,
            rows_before,
            t0,
        )

    total_revenue = float(df_valid["_demand_value"].fillna(0).sum())
    if total_revenue <= 0:
        return _unavailable_response(
            "No measurable revenue or sales in catalog — cannot build price bands.",
            [revenue_col or "ASIN Revenue"],
            rows_before,
            t0,
        )

    bucket_defs = _create_quantile_buckets(df_valid["_price"], n_buckets=n_buckets)
    use_fixed = not bucket_defs
    if use_fixed:
        bucket_defs = _FIXED_BUCKETS
        df_valid = df_valid.copy()
        df_valid["_bucket_idx"] = _assign_fixed_buckets(df_valid["_price"])
    else:
        edges = [b[0] for b in bucket_defs] + [bucket_defs[-1][1]]
        if np.isinf(edges[-1]):
            edges[-1] = df_valid["_price"].max() + 0.01
        df_valid["_bucket_idx"] = pd.cut(
            df_valid["_price"],
            bins=edges,
            labels=list(range(len(bucket_defs))),
            include_lowest=True,
            duplicates="drop",
        )

    raw_buckets: List[Dict[str, Any]] = []
    for idx, (lower, upper) in enumerate(bucket_defs):
        band_data = df_valid[df_valid["_bucket_idx"] == idx]
        if band_data.empty:
            continue

        asin_count = len(band_data)
        band_revenue = float(band_data["_demand_value"].fillna(0).sum())
        band_sales = float(band_data["_sales"].fillna(0).sum())

        bsr_vals = pd.to_numeric(band_data["_bsr"], errors="coerce").dropna()
        avg_bsr = float(bsr_vals.median()) if len(bsr_vals) > 0 else None

        avg_price = float(band_data["_price"].mean())
        revenue_density = band_revenue / asin_count if asin_count > 0 else 0.0
        revenue_share = (band_revenue / total_revenue * 100.0) if total_revenue > 0 else 0.0

        raw_buckets.append({
            "bucket_idx": idx,
            "price_band": _format_band_label(lower, upper),
            "price_min": _round2(lower),
            "price_max": _round2(upper) if not np.isinf(upper) else None,
            "asin_count": asin_count,
            "total_sales": _round2(band_sales) if band_sales > 0 else None,
            "revenue": _round2(band_revenue),
            "revenue_share_pct": _round2(revenue_share),
            "avg_price": _round2(avg_price),
            "avg_bsr": _round2(avg_bsr) if avg_bsr is not None else None,
            "revenue_density": _round2(revenue_density),
        })

    if not raw_buckets:
        return _unavailable_response(
            "Could not assign products to price bands.",
            [],
            rows_before,
            t0,
        )

    category_overview = _compute_category_pricing_overview(df_valid["_price"])
    catalog_min = category_overview.get("min_price", float(df_valid["_price"].min()))
    catalog_max = category_overview.get("max_price", float(df_valid["_price"].max()))
    tier_low, tier_high = _compute_price_tier_thresholds(df_valid["_price"])
    price_tier_summary = _build_price_tier_summary(
        df_valid["_price"], tier_low, tier_high, catalog_min, catalog_max
    )
    for b in raw_buckets:
        b["tier"] = _tier_for_bucket(b["avg_price"], tier_low, tier_high)

    revenue_by_tier = _aggregate_revenue_by_tier(raw_buckets, total_revenue)
    tier_rev_share = {row["tier"]: row["revenue_share_pct"] for row in revenue_by_tier}

    rev_shares = pd.Series([b["revenue_share_pct"] for b in raw_buckets])
    rev_densities = pd.Series([b["revenue_density"] for b in raw_buckets])
    tier_perf = pd.Series([tier_rev_share.get(b["tier"], 0) for b in raw_buckets])

    share_pct_rank = _percentile_rank(rev_shares)
    density_pct_rank = _percentile_rank(rev_densities)
    tier_perf_rank = _percentile_rank(tier_perf)

    price_buckets: List[Dict[str, Any]] = []
    for i, b in enumerate(raw_buckets):
        share_r = float(share_pct_rank.iloc[i])
        density_r = float(density_pct_rank.iloc[i])
        tier_r = float(tier_perf_rank.iloc[i])
        attractiveness = _round2(0.40 * share_r + 0.30 * density_r + 0.30 * tier_r)
        rec = _recommendation(b["revenue_share_pct"], share_r, density_r, tier_r)

        price_buckets.append({
            **b,
            "chart_label": b["tier"],
            "attractiveness_score": attractiveness,
            "recommendation": rec,
            "matrix_avg_price": b["avg_price"],
            "matrix_revenue": b["revenue"],
            "matrix_asin_count": b["asin_count"],
        })

    price_buckets.sort(key=lambda x: x["revenue"], reverse=True)

    market_structure = _market_pricing_structure(
        price_buckets, total_revenue, category_overview, revenue_by_tier
    )

    median_density = float(np.median([b["revenue_density"] for b in price_buckets]))
    dead_price_zones = [
        b for b in price_buckets
        if b["revenue_share_pct"] < 5.0 and b["revenue_density"] < median_density
    ]

    best_selling = max(price_buckets, key=lambda x: x["revenue_share_pct"])
    highest_revenue = price_buckets[0]

    gap_band = max(price_buckets, key=lambda x: x["revenue_density"])
    if gap_band["revenue_density"] <= median_density:
        gap_band = None

    entry_candidates = [b for b in price_buckets if b["recommendation"] == "Strong Concentration"]
    entry_band = (
        max(entry_candidates, key=lambda x: x["attractiveness_score"])
        if entry_candidates
        else highest_revenue
    )

    premium_pct = float(market_structure.get("premium_revenue_pct", 0))
    premium_viability = _premium_viability_rating(premium_pct)

    insights = _generate_insights(price_buckets, market_structure, gap_band, entry_band)

    def _kpi_label(band: Optional[Dict[str, Any]]) -> Optional[str]:
        if not band:
            return None
        tier = band.get("tier", "")
        return f"{tier} ({band['price_band']})" if tier else band["price_band"]

    kpis = {
        "best_selling_price_band": best_selling["price_band"],
        "best_selling_tier": best_selling.get("tier"),
        "best_selling_label": _kpi_label(best_selling),
        "highest_revenue_band": highest_revenue["price_band"],
        "highest_revenue_tier": highest_revenue.get("tier"),
        "highest_revenue_label": _kpi_label(highest_revenue),
        "premium_viability": premium_viability,
        "premium_revenue_pct": _round2(premium_pct),
        "dead_price_zone_count": len(dead_price_zones),
        "market_pricing_structure": market_structure["classification"],
        "dominant_tier": market_structure.get("dominant_tier"),
    }

    elapsed = round(time.time() - t0, 3)
    logger.info(
        "Price Intelligence complete: bands=%s, revenue=%s, structure=%s",
        len(price_buckets),
        total_revenue,
        market_structure["classification"],
    )

    return {
        "status": "success",
        "metric_name": "Price Intelligence",
        "summary": (
            f"Analyzed {rows_after} products across {len(price_buckets)} price bands. "
            f"Market is {market_structure['classification']} with dominant range "
            f"{market_structure['dominant_range']}."
        ),
        "datasets_used": ["blackbox"],
        "columns_used": numeric_cols_cleaned,
        "formula_used": (
            "Attractiveness = 40% Revenue Share + 30% Revenue Density + "
            "30% Price Tier Performance (percentile-normalized). "
            "Premium Viability = Strong (≥35% premium revenue), Moderate (≥15%), Weak (<15%)."
        ),
        "results": {
            "kpis": kpis,
            "display_flags": {
                "show_seller_count": False,
                "show_competition": False,
            },
            "category_pricing_overview": category_overview,
            "price_tier_summary": price_tier_summary,
            "price_tier_thresholds": {
                "budget_max": _round2(tier_low),
                "mid_tier_max": _round2(tier_high),
            },
            "revenue_by_tier": revenue_by_tier,
            "price_buckets": price_buckets,
            "price_opportunity_table": price_buckets,
            "market_positioning": market_structure,
            "dead_price_zones": dead_price_zones,
            "insights": insights,
            "total_category_revenue": _round2(total_revenue),
            "bucket_method": "fixed_ranges" if use_fixed else "quantiles",
            "strongest_price_ranges": sorted(
                price_buckets, key=lambda x: x["attractiveness_score"], reverse=True
            )[:3],
            "price_buckets_legacy": price_buckets,
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
