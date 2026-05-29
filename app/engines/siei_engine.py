from __future__ import annotations

import time
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.logger import get_logger
from app.utils.normalization import safe_log_normalize
from app.utils.numeric_cleaner import clean_numeric_series

logger = get_logger("siei_engine")

_CLICK_SHARE_CANDIDATES = ["ABA Total Click Share"]
_CONV_SHARE_CANDIDATES = ["ABA Total Conv. Share", "ABA Total Conversion Share"]
_KEYWORD_CANDIDATES = ["Keyword Phrase", "Keyword"]


def run(magnet_df: Optional[pd.DataFrame], top_n: int = 10) -> Dict[str, Any]:
    t0 = time.time()

    rows_before_cleaning = len(magnet_df) if magnet_df is not None else 0
    if magnet_df is None or magnet_df.empty:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Intent Efficiency Index (SIEI)",
            "summary": "Magnet dataset is required.",
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

    click_col = find_column(magnet_df, _CLICK_SHARE_CANDIDATES)
    conv_col = find_column(magnet_df, _CONV_SHARE_CANDIDATES)
    keyword_col = find_column(magnet_df, _KEYWORD_CANDIDATES)

    if click_col is None or conv_col is None:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Intent Efficiency Index (SIEI)",
            "summary": "Required ABA click/conversion share columns are missing.",
            "datasets_used": ["magnet"],
            "columns_used": [c for c in [click_col, conv_col] if c],
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

    work = pd.DataFrame(index=magnet_df.index)
    work["click_share"], _ = clean_numeric_series(magnet_df[click_col], click_col)
    work["conv_share"], _ = clean_numeric_series(magnet_df[conv_col], conv_col)
    if keyword_col:
        work["keyword"] = magnet_df[keyword_col].astype(str)

    click_nonzero = work["click_share"].replace(0, np.nan)
    work["siei"] = work["conv_share"] / click_nonzero
    work["siei"] = work["siei"].replace([np.inf, -np.inf], np.nan)
    work["siei_rank_score"] = safe_log_normalize(work["siei"])

    valid = work.dropna(subset=["siei"])
    if valid.empty:
        return {
            "status": "warning",
            "message": "No valid numeric rows after cleaning",
            "metric_name": "Search Intent Efficiency Index (SIEI)",
            "summary": "SIEI could not be computed after safe division.",
            "datasets_used": ["magnet"],
            "columns_used": [click_col, conv_col] + ([keyword_col] if keyword_col else []),
            "formula_used": "",
            "results": {},
            "validation": {
                "rows_before_cleaning": rows_before_cleaning,
                "rows_after_cleaning": 0,
                "rows_skipped": rows_before_cleaning,
                "numeric_columns_cleaned": [click_col, conv_col],
            },
            "processing_time_seconds": round(time.time() - t0, 3),
        }

    p20 = float(valid["siei"].quantile(0.2))
    p80 = float(valid["siei"].quantile(0.8))
    click_p80 = float(valid["click_share"].quantile(0.8))

    highest_efficiency = (
        valid.sort_values("siei", ascending=False)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    lowest_efficiency = (
        valid.sort_values("siei", ascending=True)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    market_friction = (
        valid[valid["siei"] <= p20]
        .sort_values("siei", ascending=True)
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    click_heavy_low_conversion = (
        valid[(valid["click_share"] >= click_p80) & (valid["siei"] <= p20)]
        .sort_values(["click_share", "siei"], ascending=[False, True])
        .head(top_n)
        .replace({np.nan: None})
        .to_dict(orient="records")
    )

    rows_after_cleaning = int(valid.shape[0])
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)

    return {
        "status": "success",
        "metric_name": "Search Intent Efficiency Index (SIEI)",
        "summary": "SIEI computed with safe division and percentile-based ranking.",
        "datasets_used": ["magnet"],
        "columns_used": [click_col, conv_col] + ([keyword_col] if keyword_col else []),
        "formula_used": "SIEI = ABA Total Conv. Share / ABA Total Click Share.",
        "results": {
            "siei_percentile_20": round(p20, 6),
            "siei_percentile_80": round(p80, 6),
            "market_siei_score": round(float(valid["siei_rank_score"].mean(skipna=True)), 2),
            "highest_efficiency_keywords": highest_efficiency,
            "lowest_efficiency_keywords": lowest_efficiency,
            "market_friction_keywords": market_friction,
            "click_heavy_low_conversion_keywords": click_heavy_low_conversion,
        },
        "validation": {
            "rows_before_cleaning": rows_before_cleaning,
            "rows_after_cleaning": rows_after_cleaning,
            "rows_skipped": rows_skipped,
            "numeric_columns_cleaned": [click_col, conv_col],
        },
        "processing_time_seconds": round(time.time() - t0, 3),
    }
