"""
Whitespace Engine
=================
Purpose  : Find high-demand keywords with weak competitor optimization.
Datasets : Magnet Keyword dataset
Formula  : Whitespace Score = Normalized Search Volume × (1 - Normalized Title Density)

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
from app.utils.normalization import min_max_normalize, percentile_clip, safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("whitespace_engine")

# ---------------------------------------------------------------------------
# Column candidate lists
# ---------------------------------------------------------------------------
_KEYWORD_CANDIDATES = [
    "Keyword Phrase", "keyword phrase", "Keyword", "keyword",
]
_SEARCH_VOL_CANDIDATES = [
    "Search Volume", "search volume", "SearchVolume", "Monthly Search Volume",
]
_TITLE_DENSITY_CANDIDATES = [
    "Title Density", "title density", "TitleDensity",
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _format_score(val: float) -> float:
    """Round to 2 decimals, clip to 0-100."""
    if np.isnan(val):
        return 0.0
    return round(float(np.clip(val, 0.0, 100.0)), 2)


# ---------------------------------------------------------------------------
# Main engine function
# ---------------------------------------------------------------------------

def run(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
    top_n: int = 15,
) -> Dict[str, Any]:
    """
    Analyze Magnet dataset to find high-search, low-density keywords.

    Args:
        magnet_df: Magnet keyword dataset
        blackbox_df: (unused for this engine)
        top_n: Number of top keywords to return

    Returns:
        Structured result dict with whitespace analysis
    """
    t0 = time.time()
    logger.info("Whitespace engine started.")

    rows_magnet = len(magnet_df) if magnet_df is not None else 0
    logger.info(f"Input rows — magnet={rows_magnet}")

    # -----------------------------------------------------------------------
    # 1. Validate dataset availability
    # -----------------------------------------------------------------------
    if magnet_df is None or magnet_df.empty:
        logger.warning("Whitespace: no Magnet dataset provided.")
        return {
            "status": "error",
            "metric_name": "Whitespace Opportunity",
            "summary": "No Magnet keyword dataset available.",
            "datasets_used": [],
            "columns_used": [],
            "formula_used": "Whitespace = Norm(Search Volume) × (1 - Norm(Title Density))",
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

    # -----------------------------------------------------------------------
    # 2. Find required columns
    # -----------------------------------------------------------------------
    keyword_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    search_vol_col = find_column(magnet_df, _SEARCH_VOL_CANDIDATES)
    title_density_col = find_column(magnet_df, _TITLE_DENSITY_CANDIDATES)

    if not search_vol_col:
        logger.warning("Whitespace: Search Volume column not found.")
        return {
            "status": "error",
            "metric_name": "Whitespace Opportunity",
            "summary": "Required column 'Search Volume' not found in Magnet dataset.",
            "datasets_used": ["magnet"],
            "columns_used": [],
            "formula_used": "Whitespace = Norm(Search Volume) × (1 - Norm(Title Density))",
            "results": {},
            "validation": {
                "status": "failed",
                "message": "Search Volume column missing.",
                "missing_columns": ["Search Volume", "Title Density"],
                "rows_before_cleaning": rows_magnet,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_magnet,
                "numeric_columns_cleaned": [],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    # -----------------------------------------------------------------------
    # 3. Prepare working dataframe
    # -----------------------------------------------------------------------
    df = magnet_df.copy()
    numeric_cols_cleaned = []

    # Clean Search Volume
    sv_clean, sv_stats = clean_numeric_series(df[search_vol_col], search_vol_col)
    logger.info(
        f"Search Volume '{search_vol_col}': "
        f"original={sv_stats['original_count']}, "
        f"cleaned={sv_stats['cleaned_count']}, "
        f"nan={sv_stats['nan_introduced']}"
    )
    df["_search_volume_clean"] = sv_clean
    numeric_cols_cleaned.append(search_vol_col)

    # Clean Title Density (if available)
    td_clean = None
    if title_density_col:
        td_clean, td_stats = clean_numeric_series(
            df[title_density_col], title_density_col
        )
        logger.info(
            f"Title Density '{title_density_col}': "
            f"original={td_stats['original_count']}, "
            f"cleaned={td_stats['cleaned_count']}, "
            f"nan={td_stats['nan_introduced']}"
        )
        df["_title_density_clean"] = td_clean
        numeric_cols_cleaned.append(title_density_col)
    else:
        # Assume no competition if column missing
        logger.info("Title Density not found; assuming 0 density for all keywords.")
        df["_title_density_clean"] = 0.0

    # -----------------------------------------------------------------------
    # 4. Filter rows with valid Search Volume
    # -----------------------------------------------------------------------
    df_valid = df.dropna(subset=["_search_volume_clean"])
    rows_before = len(df)
    rows_after = len(df_valid)
    rows_skipped = rows_before - rows_after
    logger.info(f"Rows with valid Search Volume: {rows_after}/{rows_before}")

    if rows_after == 0:
        logger.warning("Whitespace: no valid rows after cleaning Search Volume.")
        return {
            "status": "error",
            "metric_name": "Whitespace Opportunity",
            "summary": "No valid keyword data after cleaning.",
            "datasets_used": ["magnet"],
            "columns_used": [search_vol_col, title_density_col] if title_density_col else [search_vol_col],
            "formula_used": "Whitespace = Norm(Search Volume) × (1 - Norm(Title Density))",
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

    # -----------------------------------------------------------------------
    # 5. Apply log scaling and percentile clipping
    # -----------------------------------------------------------------------
    sv_log = safe_log_normalize(df_valid["_search_volume_clean"])
    logger.info(f"Search Volume after log scaling: min={sv_log.min():.2f}, max={sv_log.max():.2f}")

    # -----------------------------------------------------------------------
    # 6. Normalize metrics to 0-100
    # -----------------------------------------------------------------------
    sv_norm = min_max_normalize(sv_log)
    logger.info(f"Search Volume normalized: min={sv_norm.min():.2f}, max={sv_norm.max():.2f}")

    # Normalize Title Density
    td_norm = min_max_normalize(df_valid["_title_density_clean"])
    logger.info(f"Title Density normalized: min={td_norm.min():.2f}, max={td_norm.max():.2f}")

    # -----------------------------------------------------------------------
    # 7. Calculate Whitespace Score
    # -----------------------------------------------------------------------
    # Whitespace = Search Volume × (1 - Title Density)
    # High search volume + low title density = high whitespace (opportunity)
    df_valid["_whitespace_score"] = sv_norm * (100.0 - td_norm) / 100.0

    # Re-normalize to 0-100 scale
    df_valid["_whitespace_score"] = min_max_normalize(df_valid["_whitespace_score"])

    overall_score = _format_score(df_valid["_whitespace_score"].mean())
    logger.info(f"Overall whitespace score: {overall_score}")

    # -----------------------------------------------------------------------
    # 8. Classify opportunities by score
    # -----------------------------------------------------------------------
    def classify_opportunity(score: float) -> str:
        """Deterministic opportunity label based on score."""
        if score < 30:
            return "low opportunity"
        elif score < 60:
            return "moderate opportunity"
        elif score < 80:
            return "high opportunity"
        else:
            return "extreme opportunity"

    df_valid["_opportunity_label"] = df_valid["_whitespace_score"].apply(
        classify_opportunity
    )

    # -----------------------------------------------------------------------
    # 9. Extract top whitespace keywords
    # -----------------------------------------------------------------------
    df_sorted = df_valid.sort_values("_whitespace_score", ascending=False)
    top_keywords: List[Dict[str, Any]] = []

    for _, row in df_sorted.head(top_n).iterrows():
        entry: Dict[str, Any] = {
            "keyword": str(row[keyword_col]) if keyword_col else "N/A",
            "search_volume": int(row["_search_volume_clean"]),
            "title_density": _format_score(row["_title_density_clean"]),
            "whitespace_score": _format_score(row["_whitespace_score"]),
            "opportunity_label": row["_opportunity_label"],
        }
        top_keywords.append(entry)

    # -----------------------------------------------------------------------
    # 10. Find high-search, low-density keywords
    # -----------------------------------------------------------------------
    high_search_low_density = df_sorted[
        (df_sorted["_whitespace_score"] >= 60)
    ].copy()

    high_search_low_density_keywords: List[Dict[str, Any]] = []
    for _, row in high_search_low_density.head(top_n).iterrows():
        entry = {
            "keyword": str(row[keyword_col]) if keyword_col else "N/A",
            "search_volume": int(row["_search_volume_clean"]),
            "title_density": _format_score(row["_title_density_clean"]),
            "whitespace_score": _format_score(row["_whitespace_score"]),
        }
        high_search_low_density_keywords.append(entry)

    # -----------------------------------------------------------------------
    # 11. Opportunity distribution
    # -----------------------------------------------------------------------
    opportunity_counts = df_valid["_opportunity_label"].value_counts().to_dict()
    opportunity_distribution = {
        "low_opportunity": int(opportunity_counts.get("low opportunity", 0)),
        "moderate_opportunity": int(opportunity_counts.get("moderate opportunity", 0)),
        "high_opportunity": int(opportunity_counts.get("high opportunity", 0)),
        "extreme_opportunity": int(opportunity_counts.get("extreme opportunity", 0)),
    }

    # -----------------------------------------------------------------------
    # 12. Generate interpretation
    # -----------------------------------------------------------------------
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
    logger.info(f"Whitespace complete: score={overall_score}, elapsed={elapsed}s")

    return {
        "status": "success",
        "metric_name": "Whitespace Opportunity",
        "summary": summary,
        "datasets_used": ["magnet"],
        "columns_used": [col for col in [search_vol_col, title_density_col] if col],
        "formula_used": (
            "Whitespace Score = Norm(Search Volume) × (1 - Norm(Title Density)), "
            "then normalized to 0-100. "
            "Log scaling and percentile clipping applied before normalization."
        ),
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
