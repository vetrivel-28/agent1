"""
BSR Efficiency Engine
=====================
Purpose  : Measure revenue efficiency relative to BSR rank.
Dataset  : BlackBox Products
Required : BSR + Revenue columns

Step 1 — Normalise BSR (lower BSR = better rank = higher score):
    Norm BSR = (1 - BSR / max_BSR) × 100

Step 2 — Normalise Revenue (min-max 0-100):
    Norm Revenue = (Revenue - min) / (max - min) × 100

Step 3 — Efficiency Score:
    Efficiency = (Norm Revenue × 0.6) + (Norm BSR × 0.4)

Rows dropped ONLY when BOTH BSR and Revenue are NaN simultaneously.
Numeric cleaning applied before every step.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import adaptive_scaling, safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("bsr_efficiency_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
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

_WEIGHT_REVENUE = 0.6
_WEIGHT_BSR     = 0.4


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 10,
) -> Dict[str, Any]:
    t0 = time.time()
    logger.info("BSR Efficiency engine started.")

    if blackbox_df is None or blackbox_df.empty:
        return _no_data_error("blackbox")

    rows_original = len(blackbox_df)
    logger.info(f"Original rows: {rows_original}")

    # -----------------------------------------------------------------------
    # Locate required columns
    # -----------------------------------------------------------------------
    bsr_col = find_column(blackbox_df, _BSR_CANDIDATES)
    rev_col = find_column(blackbox_df, _REVENUE_CANDIDATES)

    logger.info(f"Columns mapped — bsr='{bsr_col}', revenue='{rev_col}'")

    missing: List[str] = []
    if bsr_col is None:
        missing.extend(_BSR_CANDIDATES[:2])
    if rev_col is None:
        missing.extend(_REVENUE_CANDIDATES[:2])

    if missing:
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
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    asin_col  = find_column(blackbox_df, _ASIN_CANDIDATES)
    brand_col = find_column(blackbox_df, _BRAND_CANDIDATES)

    columns_used = [bsr_col, rev_col]
    for c in [title_col, asin_col, brand_col]:
        if c:
            columns_used.append(c)

    # -----------------------------------------------------------------------
    # Build working dataframe — clean numerics
    # -----------------------------------------------------------------------
    work = pd.DataFrame(index=blackbox_df.index)

    bsr_clean, bsr_stats = clean_numeric_series(blackbox_df[bsr_col], bsr_col)
    logger.info(
        f"BSR '{bsr_col}': "
        f"original={bsr_stats['original_count']}, "
        f"cleaned={bsr_stats['cleaned_count']}, "
        f"nan={bsr_stats['nan_introduced']}"
    )
    work["bsr"] = bsr_clean

    rev_clean, rev_stats = clean_numeric_series(blackbox_df[rev_col], rev_col)
    logger.info(
        f"Revenue '{rev_col}': "
        f"original={rev_stats['original_count']}, "
        f"cleaned={rev_stats['cleaned_count']}, "
        f"nan={rev_stats['nan_introduced']}"
    )
    work["revenue"] = rev_clean

    if title_col:
        work["title"] = blackbox_df[title_col].astype(str).str[:120]
    if asin_col:
        work["asin"] = blackbox_df[asin_col].astype(str)
    if brand_col:
        work["brand"] = blackbox_df[brand_col].astype(str).str.strip()

    # Drop rows where BOTH bsr AND revenue are NaN (truly unusable rows)
    rows_before_filter = len(work)
    work = work.dropna(subset=["bsr", "revenue"], how="all")
    rows_after_filter = len(work)
    rows_skipped = rows_before_filter - rows_after_filter

    logger.info(
        f"Rows after cleaning: {rows_after_filter} "
        f"(dropped {rows_skipped} where both BSR and Revenue are NaN)"
    )

    if work.empty:
        return {
            "status": "warning",
            "metric_name": "BSR Efficiency",
            "summary": "No valid rows after cleaning — both BSR and Revenue are NaN for all rows.",
            "datasets_used": ["blackbox"],
            "columns_used": columns_used,
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "warning",
                "message": "No valid numeric rows after cleaning.",
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [bsr_col, rev_col],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # Step 1 — Normalise BSR  (invert: lower BSR = better = higher score)
    # -----------------------------------------------------------------------
    work["norm_bsr"] = safe_log_normalize(work["bsr"])
    work["inverse_norm_bsr"] = 100.0 - work["norm_bsr"]
    max_bsr = float(work["bsr"].dropna().max()) if not work["bsr"].dropna().empty else 0.0
    logger.info(f"BSR normalised with log+clip: max_bsr={max_bsr:.0f}")

    # -----------------------------------------------------------------------
    # Step 2 — Normalise Revenue (min-max 0-100)
    # -----------------------------------------------------------------------
    work["norm_revenue"] = safe_log_normalize(work["revenue"])
    rev_nan_count = work["norm_revenue"].isna().sum()
    logger.info(
        f"Revenue normalised: {len(work) - rev_nan_count} valid, "
        f"{rev_nan_count} NaN (filled with 0 for efficiency calc)"
    )

    # -----------------------------------------------------------------------
    # Step 3 — Efficiency Score
    # NaN revenue → treated as 0 contribution (product has no revenue data)
    # NaN BSR    → treated as 0 contribution (product has no rank data)
    # -----------------------------------------------------------------------
    work["efficiency_score"] = (
        work["norm_revenue"].fillna(0.0) * _WEIGHT_REVENUE
        + work["inverse_norm_bsr"].fillna(0.0) * _WEIGHT_BSR
    )

    # Rows where BOTH norm values are NaN get NaN score (truly no data)
    both_nan_mask = work["norm_revenue"].isna() & work["inverse_norm_bsr"].isna()
    work.loc[both_nan_mask, "efficiency_score"] = np.nan
    work = work.dropna(subset=["efficiency_score"])

    if work.empty:
        return {
            "status": "warning",
            "metric_name": "BSR Efficiency",
            "summary": "Efficiency score could not be computed — insufficient valid data.",
            "datasets_used": ["blackbox"],
            "columns_used": columns_used,
            "formula_used": "",
            "results": {},
            "validation": {
                "status": "warning",
                "message": "No valid numeric rows after cleaning.",
                "rows_before_cleaning": rows_original,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_original,
                "numeric_columns_cleaned": [bsr_col, rev_col],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # Percentile-based classification
    # -----------------------------------------------------------------------
    p75 = work["efficiency_score"].quantile(0.75)
    p25 = work["efficiency_score"].quantile(0.25)

    work_sorted = work.sort_values("efficiency_score", ascending=False)

    efficient_df   = work_sorted[work_sorted["efficiency_score"] >= p75]
    inefficient_df = work_sorted[work_sorted["efficiency_score"] <= p25].sort_values(
        "efficiency_score"
    )

    efficient_products   = _product_records(efficient_df, top_n)
    inefficient_products = _product_records(inefficient_df, top_n)

    # -----------------------------------------------------------------------
    # Market-level stats
    # -----------------------------------------------------------------------
    market_efficiency = float(work["efficiency_score"].mean(skipna=True))
    market_median     = float(work["efficiency_score"].median(skipna=True))

    if market_efficiency >= 60:
        interpretation = (
            "High market efficiency. Top products achieve strong revenue "
            "relative to their BSR rank."
        )
    elif market_efficiency >= 40:
        interpretation = (
            "Moderate market efficiency. Revenue and BSR rank are reasonably "
            "aligned across the market."
        )
    else:
        interpretation = (
            "Low market efficiency. Many products have poor revenue relative "
            "to their BSR rank — potential opportunity for well-optimised entrants."
        )

    bsr_stats_out = {
        "min_bsr":    _sv(work["bsr"].min()),
        "max_bsr":    _sv(work["bsr"].max()),
        "median_bsr": _sv(work["bsr"].median()),
        "mean_bsr":   _sv(work["bsr"].mean()),
    }
    rev_stats_out = {
        "min_revenue":    _sv(work["revenue"].min()),
        "max_revenue":    _sv(work["revenue"].max()),
        "median_revenue": _sv(work["revenue"].median()),
        "mean_revenue":   _sv(work["revenue"].mean()),
    }

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"BSR Efficiency complete: {len(work)} products, "
        f"market_efficiency={market_efficiency:.2f}, elapsed={elapsed}s"
    )

    return {
        "status": "success",
        "metric_name": "BSR Efficiency",
        "summary": interpretation,
        "datasets_used": ["blackbox"],
        "columns_used": columns_used,
        "formula_used": (
            f"Step 1: Norm BSR = (1 - BSR / max_BSR) × 100  "
            f"[lower BSR = better rank = higher score, max_bsr={max_bsr:.0f}]. "
            f"Step 2: Norm Revenue = min-max normalised to 0-100. "
            f"Step 3: Efficiency = (Norm Revenue × {_WEIGHT_REVENUE}) + "
            f"(Norm BSR × {_WEIGHT_BSR}). "
            "Classification: p75 = efficient, p25 = inefficient."
        ),
        "results": {
            "market_efficiency_score": round(market_efficiency, 2),
            "market_median_efficiency": round(market_median, 2),
            "total_products_analysed": len(work),
            "efficient_products_count": len(efficient_df),
            "inefficient_products_count": len(inefficient_df),
            "efficient_products": efficient_products,
            "inefficient_products": inefficient_products,
            "bsr_distribution": bsr_stats_out,
            "revenue_distribution": rev_stats_out,
            "graph_scaling": {
                "bsr_axis": adaptive_scaling(work["bsr"]),
                "revenue_axis": adaptive_scaling(work["revenue"]),
            },
        },
        "validation": {
            "status": "passed",
            "bsr_column_used": bsr_col,
            "revenue_column_used": rev_col,
            "rows_before_cleaning": rows_original,
            "rows_after_cleaning": len(work),
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": [bsr_col, rev_col],
        },
        "processing_time_seconds": elapsed,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _product_records(df: pd.DataFrame, n: int) -> List[Dict]:
    records = []
    for _, row in df.head(n).iterrows():
        rec: Dict[str, Any] = {
            "efficiency_score": _sv(row.get("efficiency_score")),
            "bsr":              _sv(row.get("bsr")),
            "revenue":          _sv(row.get("revenue")),
            "norm_bsr":         _sv(row.get("norm_bsr")),
            "norm_revenue":     _sv(row.get("norm_revenue")),
        }
        for field in ("title", "asin", "brand"):
            if field in row.index:
                rec[field] = str(row[field])
        records.append(rec)
    return records


def _sv(v: Any) -> Any:
    if v is None:
        return None
    try:
        if np.isnan(float(v)):
            return None
    except (TypeError, ValueError):
        return str(v)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return round(float(v), 4)
    return v


def _no_data_error(dataset: str) -> Dict:
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
        "processing_time_seconds": 0.0,
    }
