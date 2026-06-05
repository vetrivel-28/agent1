"""Category + keyword scope resolution for analysis engines."""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import pandas as pd

from app.utils.column_mapper import find_column

_KEYWORD_CANDIDATES = [
    "Keyword Phrase", "Keyword", "keyword phrase", "keyword", "Search Term",
]


def enrich_scope_dict(scope: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    d = dict(scope or {})
    selected = d.get("selected_categories") or []
    mode = d.get("mode", "all")
    if mode == "all" or not selected:
        d["mode"] = "all"
        d["selected_categories"] = []
        d["scope_key"] = "all"
        d["keyword_scope_key"] = "all"
    else:
        d["mode"] = "selected"
        cat_key = "|".join(selected)
        d["scope_key"] = d.get("scope_key") or cat_key
        d["keyword_scope_key"] = d.get("keyword_scope_key") or f"{cat_key}_kw"
    return d


def scope_from_registry(registry_scope: Dict[str, Any]) -> Dict[str, Any]:
    return enrich_scope_dict({
        "mode": registry_scope.get("mode", "all"),
        "selected_categories": registry_scope.get("selected_categories", []),
        "category_column": registry_scope.get("category_column", ""),
        "scope_key": registry_scope.get("scope_key"),
        "keyword_scope_key": registry_scope.get("keyword_scope_key"),
    })


def compute_cache_key(scope_meta: Dict[str, Any], kw_meta: Dict[str, Any]) -> str:
    cat_key = scope_meta.get("scope_key") or "all"
    if kw_meta.get("mode") == "category_mapped":
        kw_key = kw_meta.get("scope_key") or kw_meta.get("keyword_scope_key") or "kw"
        return f"{cat_key}__{kw_key}"
    return cat_key


def filter_kc_to_magnet(
    kc_df: Optional[pd.DataFrame],
    magnet_df: Optional[pd.DataFrame],
) -> Optional[pd.DataFrame]:
    if kc_df is None or kc_df.empty:
        return kc_df
    if magnet_df is None or magnet_df.empty:
        return kc_df.iloc[0:0].copy()

    kw_col_mag = find_column(magnet_df, _KEYWORD_CANDIDATES)
    kw_col_kc = find_column(kc_df, _KEYWORD_CANDIDATES)
    if not kw_col_mag or not kw_col_kc:
        return kc_df

    allowed = {
        str(k).strip().lower()
        for k in magnet_df[kw_col_mag].dropna().unique()
        if str(k).strip()
    }
    if not allowed:
        return kc_df.iloc[0:0].copy()

    mask = kc_df[kw_col_kc].astype(str).str.strip().str.lower().isin(allowed)
    filtered = kc_df[mask].copy()
    return filtered


def attach_scope_to_result(
    result: Dict[str, Any],
    scope_meta: Dict[str, Any],
    kw_meta: Dict[str, Any],
) -> Dict[str, Any]:
    result["scope"] = scope_meta
    result["keyword_scope"] = kw_meta
    total = kw_meta.get("totalKeywordCount") or 0
    matched = kw_meta.get("matchedKeywordCount") or 0
    if kw_meta.get("mode") == "category_mapped" and total > 0 and matched < total:
        msg = (
            f"Analysis limited for selected category — only {matched:,} of {total:,} "
            f"Magnet keywords matched scoped products."
        )
        results = result.setdefault("results", {})
        if isinstance(results, dict):
            results["scope_limited_message"] = msg
    return result


def resolve_analysis_datasets(registry, scope_payload: Dict[str, Any]) -> Tuple[
    Optional[pd.DataFrame],
    Optional[pd.DataFrame],
    Optional[pd.DataFrame],
    Dict[str, Any],
    Dict[str, Any],
    str,
]:
    scope_dict = enrich_scope_dict(scope_payload)
    blackbox_df, scope_meta = registry.get_scoped_blackbox_df(scope_dict)
    magnet_df, kw_meta = registry.get_scoped_magnet_df(scope_dict, blackbox_df)
    kc_df = filter_kc_to_magnet(registry.get_keyword_classification(), magnet_df)
    cache_key = compute_cache_key(scope_meta, kw_meta)
    return blackbox_df, magnet_df, kc_df, scope_meta, kw_meta, cache_key
