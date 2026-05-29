"""Shared scoring helpers for complement and substitute intelligence engines."""
from __future__ import annotations

from typing import FrozenSet, List, Optional, Sequence, Set

import numpy as np

from app.utils.text_matching import (
    combined_similarity,
    contains_any_token,
    keyword_overlap_score,
    tokenize_text,
)

ACCESSORY_TOKENS: FrozenSet[str] = frozenset({
    "rack", "holder", "shelf", "ladder", "dispenser", "organizer", "stand",
    "mount", "hook", "bar", "storage",
})

TOWEL_LIKE_TOKENS: FrozenSet[str] = frozenset({
    "towel", "towels", "bath", "sheet", "sheets", "washcloth", "wash", "linen",
})

SUBSTITUTE_MATERIAL_TOKENS: FrozenSet[str] = frozenset({
    "cotton", "microfiber", "bamboo", "rayon", "linen", "terry", "turkish",
})


def product_type_key(title: str, subcategory: str = "") -> str:
    """Stable product-type key for deduplication."""
    tokens = sorted(set(tokenize_text(f"{title} {subcategory}")))[:4]
    return " ".join(tokens) if tokens else "unknown"


def is_accessory_product(title: str) -> bool:
    return contains_any_token(title, ACCESSORY_TOKENS)


def is_towel_like_product(title: str, subcategory: str = "") -> bool:
    text = f"{title} {subcategory}".lower()
    return contains_any_token(text, TOWEL_LIKE_TOKENS)


def accessory_relationship_score(title: str) -> float:
    """Higher when title looks like an accessory used with the target product."""
    if not title:
        return 0.0
    tokens = set(tokenize_text(title))
    overlap = tokens & ACCESSORY_TOKENS
    if overlap:
        return float(min(100.0, 55.0 + 15.0 * len(overlap)))
    if is_towel_like_product(title):
        return 15.0
    return 25.0


def shared_keyword_context_score(title: str, keywords: Sequence[str]) -> float:
    if not keywords:
        return 0.0
    return float(max(combined_similarity(kw, title) for kw in keywords))


def different_subcategory_score(subcategory: str, primary_subcategory: str) -> float:
    if not subcategory or not primary_subcategory:
        return 50.0
    if subcategory.strip().lower() != primary_subcategory.strip().lower():
        return 100.0
    return 15.0


def price_compatibility_score(
    price: Optional[float],
    reference_prices: Sequence[float],
    tolerance_pct: float = 35.0,
) -> float:
    if price is None or not reference_prices:
        return 50.0
    try:
        price_f = float(price)
        median_p = float(np.median(reference_prices))
    except (TypeError, ValueError):
        return 50.0
    if median_p <= 0 or price_f <= 0:
        return 50.0
    diff_pct = abs(price_f - median_p) / median_p * 100.0
    return float(max(0.0, 100.0 - (diff_pct / tolerance_pct) * 100.0))


def use_case_similarity_score(keyword: str, title: str, subcategory: str = "") -> float:
    title_score = combined_similarity(keyword, title)
    subcat_score = combined_similarity(keyword, subcategory) if subcategory else 0.0
    return float(max(title_score, subcat_score * 0.85))


def category_proximity_score(
    category: str,
    subcategory: str,
    reference_category: str,
    reference_subcategory: str,
) -> float:
    cat_match = category.strip().lower() == reference_category.strip().lower() if category and reference_category else False
    sub_match = subcategory.strip().lower() == reference_subcategory.strip().lower() if subcategory and reference_subcategory else False
    if cat_match and not sub_match:
        return 85.0
    if cat_match and sub_match:
        return 40.0
    if subcategory and reference_subcategory:
        return 55.0
    return 30.0


def is_direct_competitor(
    title_a: str,
    subcat_a: str,
    title_b: str,
    subcat_b: str,
    similarity_threshold: float = 72.0,
) -> bool:
    """Same subcategory + very high title overlap => competitor, not complement/substitute."""
    if not subcat_a or not subcat_b:
        return False
    if subcat_a.strip().lower() != subcat_b.strip().lower():
        return False
    return keyword_overlap_score(title_a, title_b) >= similarity_threshold


def weighted_score(components: dict[str, float], weights: dict[str, float]) -> float:
    active = {k: v for k, v in components.items() if v is not None and not np.isnan(v)}
    if not active:
        return 0.0
    w_sum = sum(weights[k] for k in active)
    return round(sum(active[k] * (weights[k] / w_sum) for k in active), 2)
