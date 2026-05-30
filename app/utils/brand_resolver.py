"""
Brand resolution for BlackBox catalog data.

Uses only Brand and Seller columns — never product Title or other text fields.
Filters values that look like product titles rather than brand names.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple

import pandas as pd

from app.utils.column_mapper import find_column

_BRAND_ONLY_CANDIDATES = ["Brand", "brand"]
_SELLER_CANDIDATES = ["Seller", "seller"]

# Product-title patterns — never treat these as brands
_TITLE_MARKERS = (
    " tote bag", " tote ", " handbag", " backpack", " crossbody",
    " funny ", " gift", " gifts", " set of ", " pack of ",
    " mothers day", " teacher appreciation", " birthday gift",
    " for women", " for men", " with ", " - ", " | ",
    " inch ", " cm ", " oz ", " lb ",
)

_GENERIC_BRAND_BLOCKLIST = {
    "generic", "unknown", "n/a", "na", "none", "no brand", "unbranded",
}


def is_product_title_like(name: str) -> bool:
    """Return True if the string looks like a product title, not a brand."""
    if not name or not isinstance(name, str):
        return True
    s = name.strip()
    if not s or s.lower() in _GENERIC_BRAND_BLOCKLIST:
        return True
    if len(s) > 55:
        return True
    if s.count(" ") >= 7:
        return True
    lower = f" {s.lower()} "
    if any(marker in lower for marker in _TITLE_MARKERS):
        return True
    # Mostly lowercase long phrase with no brand-like short token
    if len(s) > 35 and s == s.lower() and s.count(" ") >= 4:
        return True
    return False


def normalize_brand_token(name: str) -> str:
    s = re.sub(r"\s+", " ", str(name).strip())
    return s


def resolve_brand_columns(blackbox_df: pd.DataFrame) -> Tuple[Optional[str], Optional[str]]:
    """Return (brand_col, seller_col) — never Title or Product Name."""
    brand_col = find_column(blackbox_df, _BRAND_ONLY_CANDIDATES)
    seller_col = find_column(blackbox_df, _SELLER_CANDIDATES)
    return brand_col, seller_col


def resolve_brand_value(
    brand_val: object,
    seller_val: object,
) -> str:
    """
    Pick a valid brand label from Brand then Seller fields only.
    Returns empty string if neither is a valid brand name.
    """
    for raw in (brand_val, seller_val):
        if raw is None or (isinstance(raw, float) and pd.isna(raw)):
            continue
        token = normalize_brand_token(str(raw))
        if token and not is_product_title_like(token):
            return token
    return ""


def attach_resolved_brand(
    df: pd.DataFrame,
    brand_col: Optional[str],
    seller_col: Optional[str],
) -> pd.Series:
    """Build a resolved brand column from Brand/Seller only."""
    if brand_col is None and seller_col is None:
        return pd.Series("", index=df.index, dtype=str)

    brand_series = df[brand_col] if brand_col else pd.Series("", index=df.index)
    seller_series = df[seller_col] if seller_col else pd.Series("", index=df.index)

    return pd.Series(
        [
            resolve_brand_value(b, s)
            for b, s in zip(brand_series, seller_series, strict=False)
        ],
        index=df.index,
        dtype=str,
    )
