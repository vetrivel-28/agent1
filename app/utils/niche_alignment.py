"""Cross-dataset niche alignment checks for Magnet + BlackBox uploads."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

import pandas as pd

from app.utils.column_mapper import find_column
from app.utils.text_matching import tokenize_text

_KEYWORD_CANDIDATES = ["Keyword Phrase", "keyword phrase", "Keyword", "keyword"]
_TITLE_CANDIDATES = ["Title", "title", "Product Title"]
_CATEGORY_CANDIDATES = ["Category", "category"]
_SUBCATEGORY_CANDIDATES = ["Subcategory", "subcategory"]


def _top_tokens(series: pd.Series, limit: int = 30) -> Set[str]:
    counts: Dict[str, int] = {}
    for val in series.dropna().astype(str).head(500):
        for tok in tokenize_text(val):
            if len(tok) >= 3:
                counts[tok] = counts.get(tok, 0) + 1
    ranked = sorted(counts.items(), key=lambda x: -x[1])
    return {t for t, _ in ranked[:limit]}


def check_niche_alignment(
    magnet_df: Optional[pd.DataFrame],
    blackbox_df: Optional[pd.DataFrame],
) -> List[str]:
    """
    Compare Magnet keywords vs BlackBox product text for weak overlap.
    Returns warning strings (empty if alignment looks OK or data missing).
    """
    warnings: List[str] = []
    if magnet_df is None or magnet_df.empty or blackbox_df is None or blackbox_df.empty:
        return warnings

    warnings.append(
        "BlackBox and Magnet datasets are combined at market level. "
        "Please ensure both files belong to the same product niche/category."
    )

    kw_col = find_column(magnet_df, _KEYWORD_CANDIDATES)
    title_col = find_column(blackbox_df, _TITLE_CANDIDATES)
    cat_col = find_column(blackbox_df, _CATEGORY_CANDIDATES)
    sub_col = find_column(blackbox_df, _SUBCATEGORY_CANDIDATES)

    magnet_tokens: Set[str] = set()
    if kw_col:
        magnet_tokens |= _top_tokens(magnet_df[kw_col])

    bb_tokens: Set[str] = set()
    if title_col:
        bb_tokens |= _top_tokens(blackbox_df[title_col])
    if cat_col:
        bb_tokens |= _top_tokens(blackbox_df[cat_col])
    if sub_col:
        bb_tokens |= _top_tokens(blackbox_df[sub_col])

    if not magnet_tokens or not bb_tokens:
        return warnings

    overlap = magnet_tokens & bb_tokens
    overlap_ratio = len(overlap) / max(len(magnet_tokens), 1)
    if overlap_ratio < 0.15:
        warnings.append(
            "Warning: Uploaded Magnet and BlackBox datasets may not belong to the same niche. "
            "Cross-dataset metrics may be unreliable."
        )
    return warnings
