"""
BSR Efficiency Engine  —  Product Performance Intelligence
==========================================================
Purpose  : Identify products that outperform or underperform market expectations
           using market-relative percentile analysis.
Dataset  : BlackBox Products
Required : BSR + Revenue columns

Core logic (no fixed thresholds — all market-relative):

  Step 1  BSR Percentile
          Rank all products by BSR.  Best BSR (lowest number) = 100, worst = 0.
          bsr_percentile = (1 - rank(bsr) / n) * 100   [rank ascending]

  Step 2  Revenue Percentile
          Rank all products by Revenue.  Highest = 100, lowest = 0.
          rev_percentile = rank(revenue) / n * 100      [rank descending]

  Step 3  Revenue-Rank Gap
          gap = rev_percentile - bsr_percentile
          Positive gap  → product earns more than its rank would predict.
          Negative gap  → product ranks well but monetises poorly.

  Step 4  Efficiency Score (0-100)
          efficiency = 50% * norm(gap) + 30% * rev_percentile + 20% * bsr_percentile
          Normalised to 0-100 across the product set.

Segment classification (gap-based):
  gap > +20   Revenue Outlier
  +10 to +20  Highly Efficient
  -10 to +10  Market Normal
  -10 to -20  Underperforming
  < -20       Revenue Leakage
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

logger = get_logger("bsr_efficiency_engine")

# ---------------------------------------------------------------------------
# Column candidates
# ---------------------------------------------------------------------------
_BSR_CANDIDATES = [
    "BSR", "bsr",
    "Best Sellers Rank", "best sellers rank",
    "Best Seller Rank", "best seller rank",
    "Subcategory BSR", "subcategory bsr",
]
_REVENUE_CANDIDATES = [
    "ASIN Revenue", "asin revenue",
    "Revenue", "revenue",
    "Parent Level Revenue", "parent level revenue",
    "Monthly Revenue", "monthly revenue",
]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_ASIN_CANDIDATES  = ["ASIN", "asin"]
_BRAND_CANDIDATES = ["Brand", "brand", "Seller", "seller"]
_PRICE_CANDIDATES = ["Price", "price"]
_REVIEW_CANDIDATES = ["Review Count", "review count", "Reviews", "reviews"]
_SALES_CANDIDATES = ["ASIN Sales", "asin sales", "Parent Level Sales", "Sales", "sales"]


# ---------------------------------------------------------------------------
# Segment classification
# ---------------------------------------------------------------------------

def _segment(gap: float) -> str:
    if gap > 20:
        return "Revenue Outlier"
    elif gap > 10:
        return "Highly Efficient"
    elif gap >= -10:
        return "Market Normal"
    elif gap >= -20:
        return "Underperforming"
    else:
        return "Revenue Leakage"


def _quadrant(bsr_pct: float, rev_pct: float) -> str:
    """Scatter-plot quadrant label (midpoint = 50)."""
    if bsr_pct >= 50 and rev_pct >= 50:
        return "Elite Performers"
    elif bsr_pct < 50 and rev_pct >= 50:
        return "High Rev, Weak Rank"
    elif bsr_pct >= 50 and rev_pct < 50:
        return "Strong Rank, Low Rev"
    else:
        return "Underperformers"


def _opportunity_priority(gap: float, recovery: float, bsr_pct: float) -> str:
    """
    Classify leakage products by optimization urgency.
    Uses gap magnitude, recovery potential, and BSR strength.
    """
    score = (abs(gap) / 100.0) * 0.4 + (min(recovery, 1e6) / 1e6) * 0.3 + (bsr_pct / 100.0) * 0.3
    if score >= 0.55:
        return "Critical"
    elif score >= 0.35:
        return "High"
    elif score >= 0.18:
        return "Medium"
    else:
        return "Low"


def _likely_cause(gap: float, bsr_pct: float, rev_pct: float, row: pd.Series, median_reviews: Optional[float], median_price: Optional[float], median_sales: Optional[float]) -> str:
    """
    Infer the most probable root cause of revenue leakage from available metrics.
    Now includes evidence-based explanations if data is available.
    """
    reviews = row.get("reviews")
    price = row.get("price")
    sales = row.get("sales")
    
    # Review Deficit
    if bsr_pct >= 40 and rev_pct <= 50 and pd.notna(reviews) and median_reviews and reviews < median_reviews:
        return f"Review Deficit|{int(reviews)} reviews vs category median of {int(median_reviews)}"
        
    # Pricing Issue
    if bsr_pct >= 60 and rev_pct <= 40 and pd.notna(price) and median_price and price > median_price:
        pct_diff = int(((price - median_price) / median_price) * 100)
        return f"Pricing Issue|{pct_diff}% above category median price"
        
    # Weak Conversion
    if bsr_pct >= 70 and rev_pct <= 20 and pd.notna(sales) and median_sales and sales < median_sales:
        return f"Weak Conversion|Traffic present but sales velocity ({int(sales)}) below expected level ({int(median_sales)})"

    # Fallbacks without evidence
    if bsr_pct >= 70 and rev_pct <= 20:
        return "Weak Conversion|Traffic present but conversion to revenue is weak"
    if bsr_pct >= 60 and rev_pct <= 40:
        return "Pricing Issue|Pricing may be suppressing AOV"
    if bsr_pct >= 40 and rev_pct <= 15:
        return "Traffic Deficit|Traffic not reaching the listing"
    if bsr_pct < 40 and rev_pct <= 25:
        return "Poor Visibility|BSR weak and revenue weak"
    
    return "Review Deficit|Social proof gap relative to rank peers"


def _expected_revenue(bsr_pct: float, work: pd.DataFrame, band: float = 10.0) -> Optional[float]:
    """
    Estimate expected revenue for a product by averaging revenue of products
    with a similar BSR percentile (within ±band points).
    Returns None if fewer than 2 comparable products exist.
    """
    peers = work[
        (work["bsr_pct"] >= bsr_pct - band) &
        (work["bsr_pct"] <= bsr_pct + band)
    ]["revenue"]
    if len(peers) < 2:
        # Widen band if too few peers
        peers = work[
            (work["bsr_pct"] >= bsr_pct - band * 2) &
            (work["bsr_pct"] <= bsr_pct + band * 2)
        ]["revenue"]
    if len(peers) < 2:
        return None
    return float(peers.median())


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------

def run(
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("BSR Efficiency engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _no_data_error("blackbox", t0)

    rows_original = len(blackbox_df)

    # ── Locate columns ──────────────────────────────────────────────────────
    bsr_col   = find_column(blackbox_df, _BSR_CANDIDATES)
    rev_col   = find_column(blackbox_df, _REVENUE_CANDIDATES)
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    asin_col  = find_column(blackbox_df, _ASIN_CANDIDATES)
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)
    price_col = find_column(blackbox_df, _PRICE_CANDIDATES)
    review_col = find_column(blackbox_df, _REVIEW_CANDIDATES)
    sales_col  = find_column(blackbox_df, _SALES_CANDIDATES)

    missing: List[str] = []
    if bsr_col is None:
        missing.extend(_BSR_CANDIDATES[:2])
    if rev_col is None:
        missing.extend(_REVENUE_CANDIDATES[:2])
    if missing:
        return _missing_columns_error(missing, rows_original, t0)

    columns_used = [c for c in [bsr_col, rev_col, title_col, asin_col, brand_col, price_col, review_col, sales_col] if c]
    
    # ── Data Confidence ─────────────────────────────────────────────────────
    confidence = "Low"
    bonus_cols = sum(1 for c in [price_col, review_col, sales_col] if c)
    if bonus_cols == 3:
        confidence = "High"
    elif bonus_cols > 0:
        confidence = "Medium"

    # ── Build working frame ─────────────────────────────────────────────────
    work = pd.DataFrame(index=blackbox_df.index)
    work["bsr"],     _ = clean_numeric_series(blackbox_df[bsr_col],   bsr_col)
    work["revenue"], _ = clean_numeric_series(blackbox_df[rev_col],   rev_col)
    if title_col: work["title"] = blackbox_df[title_col].astype(str).str[:120]
    if asin_col:  work["asin"]  = blackbox_df[asin_col].astype(str)
    if brand_col: work["brand"] = blackbox_df[brand_col].astype(str).str.strip()
    if price_col: work["price"], _ = clean_numeric_series(blackbox_df[price_col], price_col)
    if review_col: work["reviews"], _ = clean_numeric_series(blackbox_df[review_col], review_col)
    if sales_col: work["sales"], _ = clean_numeric_series(blackbox_df[sales_col], sales_col)

    # Require both BSR and Revenue to be valid
    work = work.dropna(subset=["bsr", "revenue"])
    work = work[(work["bsr"] > 0) & (work["revenue"] >= 0)]
    rows_after = len(work)

    if rows_after < 3:
        return _insufficient_data_error(rows_original, rows_after, columns_used, t0)

    n = rows_after

    # ── Step 1: BSR Percentile (lower BSR = better rank = higher percentile) ─
    # rank(ascending) so rank 1 = best BSR → percentile = (n - rank + 1) / n * 100
    work["bsr_rank"]    = work["bsr"].rank(method="average", ascending=True)
    work["bsr_pct"]     = (1.0 - (work["bsr_rank"] - 1) / (n - 1)) * 100.0
    work["bsr_pct"]     = work["bsr_pct"].clip(0, 100)

    # ── Step 2: Revenue Percentile (higher revenue = higher percentile) ──────
    work["rev_rank"]    = work["revenue"].rank(method="average", ascending=False)
    work["rev_pct"]     = (1.0 - (work["rev_rank"] - 1) / (n - 1)) * 100.0
    work["rev_pct"]     = work["rev_pct"].clip(0, 100)

    # ── Step 3: Revenue-Rank Gap ─────────────────────────────────────────────
    work["gap"]         = work["rev_pct"] - work["bsr_pct"]

    # ── Step 4: Efficiency Score ─────────────────────────────────────────────
    # Raw: 50% gap (shifted to 0-100) + 30% rev_pct + 20% bsr_pct
    gap_shifted         = (work["gap"] + 100.0) / 2.0          # map -100..+100 → 0..100
    raw_score           = 0.50 * gap_shifted + 0.30 * work["rev_pct"] + 0.20 * work["bsr_pct"]
    work["efficiency"]  = min_max_normalize(raw_score)          # final 0-100

    # ── Segment & quadrant ───────────────────────────────────────────────────
    work["segment"]     = work["gap"].apply(_segment)
    work["quadrant"]    = work.apply(lambda r: _quadrant(r["bsr_pct"], r["rev_pct"]), axis=1)

    # ── Segment counts ───────────────────────────────────────────────────────
    seg_counts = work["segment"].value_counts().to_dict()
    outlier_count  = int(seg_counts.get("Revenue Outlier",  0))
    leakage_count  = int(seg_counts.get("Revenue Leakage",  0))
    efficient_count= int(seg_counts.get("Highly Efficient", 0))
    normal_count   = int(seg_counts.get("Market Normal",    0))
    under_count    = int(seg_counts.get("Underperforming",  0))

    # Elite performers: above average in BOTH rev_pct and bsr_pct
    elite_mask      = (work["rev_pct"] >= 50) & (work["bsr_pct"] >= 50)
    elite_count     = int(elite_mask.sum())

    avg_efficiency  = round(float(work["efficiency"].mean()), 2)

    # ── Largest outlier / leakage ────────────────────────────────────────────
    outlier_df  = work[work["segment"] == "Revenue Outlier"].sort_values("gap", ascending=False)
    leakage_df  = work[work["segment"] == "Revenue Leakage"].sort_values("gap", ascending=True)

    # ── Expected revenue + recovery for every product ────────────────────────
    work["expected_revenue"] = work["bsr_pct"].apply(
        lambda p: _expected_revenue(p, work)
    )
    work["revenue_recovery"] = (work["expected_revenue"] - work["revenue"]).clip(lower=0)
    
    # Calculate Recovery ROI
    work["recovery_roi_pct"] = np.where(
        work["revenue"] > 0,
        ((work["expected_revenue"] - work["revenue"]) / work["revenue"]) * 100,
        0
    )
    work["recovery_roi_pct"] = work["recovery_roi_pct"].clip(lower=0)
    
    # Calculate category medians for evidence
    median_reviews = float(work["reviews"].median()) if "reviews" in work.columns and not work["reviews"].isna().all() else None
    median_price = float(work["price"].median()) if "price" in work.columns and not work["price"].isna().all() else None
    median_sales = float(work["sales"].median()) if "sales" in work.columns and not work["sales"].isna().all() else None
    
    category_median_revenue = float(work["revenue"].median())
    top_quartile_revenue = float(work["revenue"].quantile(0.75))
    median_bsr = float(work["bsr"].median())

    # Re-sort leakage by opportunity priority after recovery is computed
    def _priority_row(row: pd.Series) -> str:
        rec = float(row["revenue_recovery"]) if pd.notna(row["revenue_recovery"]) else 0.0
        return _opportunity_priority(float(row["gap"]), rec, float(row["bsr_pct"]))

    def _apply_likely_cause(row: pd.Series) -> str:
        return _likely_cause(float(row["gap"]), float(row["bsr_pct"]), float(row["rev_pct"]), row, median_reviews, median_price, median_sales)

    leakage_df = work[work["segment"] == "Revenue Leakage"].copy()
    leakage_df["opportunity_priority"] = leakage_df.apply(_priority_row, axis=1)
    if "expected_revenue" in leakage_df.columns:
        leakage_df["likely_cause"] = leakage_df.apply(_apply_likely_cause, axis=1)
    
    _priority_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    leakage_df["_pri_sort"] = leakage_df["opportunity_priority"].map(_priority_order).fillna(4)
    leakage_df = leakage_df.sort_values(["_pri_sort", "gap"], ascending=[True, True])

    # Total recoverable revenue
    total_recoverable = float(
        work.loc[work["segment"] == "Revenue Leakage", "revenue_recovery"].sum()
    )

    # ── Elite benchmark stats ────────────────────────────────────────────────
    elite_df = work[elite_mask].sort_values("efficiency", ascending=False)
    benchmark_revenue    = float(elite_df["revenue"].median())    if not elite_df.empty else 0.0
    benchmark_bsr        = float(elite_df["bsr"].median())        if not elite_df.empty else 0.0
    benchmark_efficiency = float(elite_df["efficiency"].median()) if not elite_df.empty else 0.0
    best_benchmark_title = ""
    if not elite_df.empty:
        best_row = elite_df.iloc[0]
        best_benchmark_title = str(best_row.get("title", best_row.get("asin", "—")))

    def _top_product(df: pd.DataFrame) -> Dict:
        if df.empty:
            return {}
        row = df.iloc[0]
        rec = {
            "title":      str(row.get("title", row.get("asin", "—"))),
            "asin":       str(row.get("asin", "—")),
            "gap":        round(float(row["gap"]), 2),
            "efficiency": round(float(row["efficiency"]), 2),
            "revenue":    _sv(row["revenue"]),
            "bsr":        _sv(row["bsr"]),
        }
        if pd.notna(row.get("expected_revenue")):
            rec["expected_revenue"]  = _sv(row["expected_revenue"])
            rec["revenue_recovery"]  = _sv(row["revenue_recovery"])
        return rec

    largest_outlier = _top_product(outlier_df)
    largest_leakage = _top_product(leakage_df)

    # ── Product record builder ───────────────────────────────────────────────
    def _records(df: pd.DataFrame, limit: int, include_recovery: bool = False, include_priority: bool = False) -> List[Dict]:
        out = []
        for _, row in df.head(limit).iterrows():
            rec: Dict[str, Any] = {
                "bsr":                _sv(row["bsr"]),
                "revenue":            _sv(row["revenue"]),
                "bsr_percentile":     round(float(row["bsr_pct"]),   2),
                "revenue_percentile": round(float(row["rev_pct"]),   2),
                "monetization_gap":   round(float(row["gap"]),       2),
                "revenue_rank_gap":   round(float(row["gap"]),       2), # keep for compat
                "efficiency_score":   round(float(row["efficiency"]),2),
                "segment":            row["segment"],
                "quadrant":           row["quadrant"],
            }
            if include_recovery and "expected_revenue" in row.index:
                rec["expected_revenue"] = _sv(row["expected_revenue"])
                rec["revenue_recovery"] = _sv(row["revenue_recovery"])
                if "recovery_roi_pct" in row.index:
                    rec["recovery_roi_pct"] = round(float(row["recovery_roi_pct"]), 1)
                if "likely_cause" in row.index:
                    parts = str(row["likely_cause"]).split('|')
                    rec["likely_cause"] = parts[0]
                    rec["root_cause_evidence"] = parts[1] if len(parts) > 1 else ""
                else:
                    rec["likely_cause"] = "Review Deficit"
                    rec["root_cause_evidence"] = "Social proof gap relative to rank peers"
                    
            if include_priority and "opportunity_priority" in row.index:
                rec["opportunity_priority"] = row["opportunity_priority"]
            for f in ("title", "asin", "brand"):
                if f in row.index:
                    rec[f] = str(row[f])
            out.append(rec)
        return out

    # ── Scatter data (up to 300 points) ─────────────────────────────────────
    scatter = []
    for _, row in work.head(300).iterrows():
        pt: Dict[str, Any] = {
            "bsr_percentile":     round(float(row["bsr_pct"]),   2),
            "revenue_percentile": round(float(row["rev_pct"]),   2),
            "monetization_gap":   round(float(row["gap"]),       2),
            "revenue_rank_gap":   round(float(row["gap"]),       2),
            "efficiency_score":   round(float(row["efficiency"]),2),
            "segment":            row["segment"],
            "quadrant":           row["quadrant"],
            "revenue":            _sv(row["revenue"]),
            "bsr":                _sv(row["bsr"]),
        }
        for f in ("title", "asin", "brand"):
            if f in row.index:
                pt[f] = str(row[f])
        scatter.append(pt)

    # ── Quadrant counts ──────────────────────────────────────────────────────
    quad_counts = work["quadrant"].value_counts().to_dict()

    # ── Automated insights ───────────────────────────────────────────────────
    insights = _generate_insights(
        n=n,
        outlier_count=outlier_count,
        leakage_count=leakage_count,
        elite_count=elite_count,
        avg_efficiency=avg_efficiency,
        largest_outlier=largest_outlier,
        largest_leakage=largest_leakage,
        normal_count=normal_count,
        total_recoverable=total_recoverable,
        best_benchmark_title=best_benchmark_title,
        benchmark_efficiency=benchmark_efficiency,
    )

    # ── Market health metrics (business-oriented) ────────────────────────────
    if avg_efficiency >= 65:
        efficiency_status = "High — category is well-monetised"
    elif avg_efficiency >= 45:
        efficiency_status = "Moderate — meaningful optimization headroom"
    else:
        efficiency_status = "Low — significant revenue being left on the table"

    leakage_pct = round(leakage_count / n * 100, 1)
    if leakage_pct >= 30:
        monetization_quality = "Poor — high proportion of undermonetised products"
    elif leakage_pct >= 15:
        monetization_quality = "Fair — notable leakage across the category"
    else:
        monetization_quality = "Good — most products monetise near expectations"

    outlier_pct = round(outlier_count / n * 100, 1)
    if outlier_pct >= 20:
        opportunity_density = "High — many products outperform rank expectations"
    elif outlier_pct >= 10:
        opportunity_density = "Moderate — selective outperformance visible"
    else:
        opportunity_density = "Low — few products exceed rank-based expectations"

    market_health = {
        "category_efficiency_status": efficiency_status,
        "monetization_quality":       monetization_quality,
        "opportunity_density":        opportunity_density,
        "recoverable_revenue_pool":   round(total_recoverable, 2),
        "average_category_efficiency": avg_efficiency,
        # kept for backward compat
        "revenue_outlier_ratio":  round(outlier_count / n * 100, 2),
        "revenue_leakage_ratio":  round(leakage_count / n * 100, 2),
        "elite_performer_ratio":  round(elite_count   / n * 100, 2),
        "efficiency_distribution": {
            "p25": round(float(work["efficiency"].quantile(0.25)), 2),
            "p50": round(float(work["efficiency"].quantile(0.50)), 2),
            "p75": round(float(work["efficiency"].quantile(0.75)), 2),
            "p90": round(float(work["efficiency"].quantile(0.90)), 2),
        },
    }

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"BSR Efficiency complete: n={n}, avg_eff={avg_efficiency}, "
        f"outliers={outlier_count}, leakage={leakage_count}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "BSR Efficiency",
        "summary": (
            f"{outlier_count} revenue outliers and {leakage_count} revenue leakage products "
            f"identified across {n} products. Average category efficiency: {avg_efficiency}/100. "
            f"Recoverable revenue: ${total_recoverable:,.0f}."
        ),
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            "BSR Percentile = (1 - rank(BSR,asc) / n) × 100; "
            "Revenue Percentile = (1 - rank(Revenue,desc) / n) × 100; "
            "Gap = Revenue Percentile − BSR Percentile; "
            "Efficiency = norm(0.5×gap_shifted + 0.3×rev_pct + 0.2×bsr_pct); "
            "Expected Revenue = median revenue of products with similar BSR percentile (±10 pts); "
            "Revenue Recovery = max(0, Expected Revenue − Actual Revenue)."
        ),
        "results": {
            # KPI summary
            "average_category_efficiency": avg_efficiency,
            "total_products_analysed":     n,
            "revenue_outlier_count":       outlier_count,
            "revenue_leakage_count":       leakage_count,
            "elite_performer_count":       elite_count,
            "highly_efficient_count":      efficient_count,
            "market_normal_count":         normal_count,
            "underperforming_count":       under_count,
            "data_confidence":             confidence,

            # Recovery KPI
            "total_recoverable_revenue":   round(total_recoverable, 2),

            # Category Benchmarks
            "category_median_revenue":     round(category_median_revenue, 2),
            "top_quartile_revenue":        round(top_quartile_revenue, 2),
            "median_bsr":                  round(median_bsr, 2),
            "median_efficiency":           avg_efficiency, # reusing avg for median simplification

            # Spotlight products
            "largest_revenue_outlier":  largest_outlier,
            "largest_revenue_leakage":  largest_leakage,

            # Elite benchmark
            "elite_benchmark": {
                "benchmark_revenue":    round(benchmark_revenue,    2),
                "benchmark_bsr":        round(benchmark_bsr,        2),
                "benchmark_efficiency": round(benchmark_efficiency, 2),
                "best_product_title":   best_benchmark_title,
            },

            # Segment tables
            "revenue_outliers":  _records(outlier_df,  max(top_n, 20)),
            "revenue_leakage":   _records(leakage_df,  max(top_n, 20), include_recovery=True, include_priority=True),
            "elite_performers":  _records(elite_df,    max(top_n, 20)),
            "all_products":      _records(work.sort_values("efficiency", ascending=False), min(n, 300)),

            # Scatter matrix
            "scatter_data": scatter,

            # Quadrant counts
            "quadrant_summary": {
                "elite_performers":   int(quad_counts.get("Elite Performers",  0)),
                "high_rev_weak_rank": int(quad_counts.get("High Rev, Weak Rank",  0)),
                "strong_rank_low_rev": int(quad_counts.get("Strong Rank, Low Rev",   0)),
                "underperformers":    int(quad_counts.get("Underperformers",   0)),
            },

            # Market health (business-oriented)
            "market_health": market_health,

            # Automated insights
            "insights": insights,

            # Legacy fields (backward compat)
            "market_efficiency_score":    avg_efficiency,
            "efficient_products_count":   outlier_count + efficient_count,
            "inefficient_products_count": leakage_count + under_count,
            "efficient_products":   _records(work[work["gap"] > 10].sort_values("gap", ascending=False), top_n),
            "inefficient_products": _records(work[work["gap"] < -10].sort_values("gap", ascending=True),  top_n),
        },
        "validation": {
            "status": "passed",
            "bsr_column_used":     bsr_col,
            "revenue_column_used": rev_col,
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning":  rows_after,
            "rows_skipped":         rows_original - rows_after,
            "numeric_columns_cleaned": [bsr_col, rev_col],
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Insight generator
# ---------------------------------------------------------------------------

def _generate_insights(
    n: int,
    outlier_count: int,
    leakage_count: int,
    elite_count: int,
    avg_efficiency: float,
    largest_outlier: Dict,
    largest_leakage: Dict,
    normal_count: int,
    total_recoverable: float = 0.0,
    best_benchmark_title: str = "",
    benchmark_efficiency: float = 0.0,
) -> List[str]:
    insights: List[str] = []

    # Biggest revenue opportunity
    if total_recoverable > 0:
        insights.append(
            f"Total recoverable revenue across leakage products: "
            f"${total_recoverable:,.0f}. Optimising these listings represents the "
            f"highest-value opportunity in this category."
        )

    # Largest revenue outlier
    if largest_outlier.get("gap"):
        gap = abs(largest_outlier["gap"])
        title = largest_outlier.get("title") or largest_outlier.get("asin") or "Unknown"
        short = title[:40] + "…" if len(title) > 40 else title
        insights.append(
            f"Largest revenue outlier: '{short}' outperforms comparable ranked products "
            f"by {gap:.0f} percentile points — a strong signal of premium positioning or superior conversion."
        )

    # Leakage count
    if leakage_count > 0:
        insights.append(
            f"{leakage_count} product{'s' if leakage_count > 1 else ''} rank well "
            f"but monetise below category expectations. Likely causes include weak conversion, "
            f"pricing issues, or listing quality gaps."
        )

    # Outlier count
    if outlier_count > 0:
        insights.append(
            f"{outlier_count} product{'s' if outlier_count > 1 else ''} generate "
            f"substantially more revenue than similarly ranked competitors — "
            f"study these for positioning and conversion benchmarks."
        )

    # Best benchmark product
    if best_benchmark_title and benchmark_efficiency > 0:
        short = best_benchmark_title[:40] + "…" if len(best_benchmark_title) > 40 else best_benchmark_title
        insights.append(
            f"Best-in-class benchmark: '{short}' leads elite performers "
            f"with an efficiency score of {benchmark_efficiency:.1f}/100."
        )

    # Category efficiency assessment
    if avg_efficiency < 40:
        insights.append(
            "Category efficiency is low. Many products have poor revenue relative "
            "to their rank — a well-optimised entrant could capture significant share."
        )
    elif avg_efficiency >= 65:
        insights.append(
            "Category efficiency is high. Top products are well-optimised and "
            "revenue closely tracks rank performance."
        )
    else:
        insights.append(
            f"Category efficiency is moderate at {avg_efficiency}/100. "
            "Meaningful optimization headroom exists across the product set."
        )

    return insights


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sv(v: Any) -> Any:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v


def _no_data_error(dataset: str, t0: float) -> Dict:
    return {
        "status": "error",
        "metric_name": "BSR Efficiency",
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
        "processing_time_seconds": round(time.time() - t0, 3),
    }


def _missing_columns_error(missing: List[str], rows: int, t0: float) -> Dict:
    return {
        "status": "error",
        "metric_name": "BSR Efficiency",
        "summary": "Required columns (BSR and/or Revenue) not found.",
        "datasets_used": ["blackbox"],
        "columns_used": [],
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "failed",
            "message": "Required columns not found.",
            "missing_columns": missing,
            "rows_before_cleaning": rows,
            "rows_after_cleaning": 0,
            "rows_skipped": rows,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }


def _insufficient_data_error(rows_orig: int, rows_after: int, cols: List[str], t0: float) -> Dict:
    return {
        "status": "warning",
        "metric_name": "BSR Efficiency",
        "summary": "Insufficient valid rows after cleaning (need ≥ 3 products with both BSR and Revenue).",
        "datasets_used": ["blackbox"],
        "columns_used": cols,
        "formula_used": "",
        "results": {},
        "validation": {
            "status": "warning",
            "message": "Insufficient valid rows.",
            "rows_before_cleaning": rows_orig,
            "rows_after_cleaning": rows_after,
            "rows_skipped": rows_orig - rows_after,
            "numeric_columns_cleaned": [],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
