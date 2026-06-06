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


def build_data_scope(scope_meta: Dict[str, Any], kw_meta: Dict[str, Any]) -> Dict[str, Any]:
    """Transparent labels for keyword-wide vs category-scoped product analysis."""
    kw_total = int(kw_meta.get("totalKeywordCount") or kw_meta.get("matchedKeywordCount") or 0)
    prod_active = int(scope_meta.get("active_rows") or scope_meta.get("blackbox_rows_active") or 0)
    prod_total = int(scope_meta.get("total_rows") or scope_meta.get("blackbox_rows_total") or 0)
    mode = scope_meta.get("mode", "all")
    selected = scope_meta.get("selected_categories") or []

    if mode == "selected" and selected:
        cat_label = ", ".join(selected[:3])
        if len(selected) > 3:
            cat_label += f" (+{len(selected) - 3} more)"
        product_filter = f"Category filter: {cat_label}"
        product_description = (
            f"Using {prod_active:,} products from selected categor"
            f"{'ies' if len(selected) != 1 else 'y'} ({prod_total:,} total in dataset)"
        )
    else:
        product_filter = "No category filter (full product dataset)"
        product_description = f"Using {prod_active:,} products from entire product dataset"

    return {
        "keyword_intelligence": {
            "universe": "keyword",
            "row_count": kw_total,
            "filtering": "No category or subcategory restrictions",
            "description": (
                f"Using {kw_total:,} keywords from entire keyword dataset"
                if kw_total else "Keyword dataset not loaded"
            ),
        },
        "product_intelligence": {
            "universe": "product",
            "row_count": prod_active,
            "total_rows": prod_total,
            "filtering": product_filter,
            "description": product_description,
        },
    }


def attach_scope_to_result(
    result: Dict[str, Any],
    scope_meta: Dict[str, Any],
    kw_meta: Dict[str, Any],
    page_id: Optional[str] = None,
) -> Dict[str, Any]:
    result["scope"] = scope_meta
    result["keyword_scope"] = kw_meta
    data_scope = build_data_scope(scope_meta, kw_meta)
    results = result.setdefault("results", {})
    if isinstance(results, dict):
        results["data_scope"] = data_scope
    if page_id:
        from app.utils.page_scope_registry import get_page_scope
        spec = get_page_scope(page_id)
        if spec:
            result["page_scope"] = {
                "page_id": page_id,
                "page": spec.get("page"),
                "route": spec.get("route"),
                "keyword_scope": spec.get("keyword_scope"),
                "product_scope": spec.get("product_scope"),
                "category_dependency": spec.get("category_dependency"),
                "subcategory_dependency": spec.get("subcategory_dependency"),
                "methodology": spec.get("methodology"),
            }
    return result


def enrich_evidence(
    evidence: Optional[Dict[str, Any]],
    *,
    source_page: str,
    scope_meta: Dict[str, Any],
    kw_meta: Dict[str, Any],
    confidence_score: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Attach traceability fields required by evidence drawers."""
    if not evidence or not isinstance(evidence, dict):
        return evidence
    out = dict(evidence)
    out["source_page"] = source_page
    out["data_scope"] = build_data_scope(scope_meta, kw_meta)
    if confidence_score is not None and out.get("confidence_score") is None:
        out["confidence_score"] = confidence_score
    return out


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
    full_magnet = registry.get_magnet()
    # Fix: use is_empty_dataframe to safely check DataFrame status
    magnet_for_kc = full_magnet if full_magnet is not None and not full_magnet.empty else magnet_df
    kc_df = filter_kc_to_magnet(registry.get_keyword_classification(), magnet_for_kc)
    cache_key = compute_cache_key(scope_meta, kw_meta)
    return blackbox_df, magnet_df, kc_df, scope_meta, kw_meta, cache_key
