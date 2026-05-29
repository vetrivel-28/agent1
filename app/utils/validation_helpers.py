"""Shared validation metadata for engine responses."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def build_validation(
    *,
    rows_before_cleaning: int,
    rows_after_cleaning: int,
    columns_used: Optional[List[str]] = None,
    valid_rows_by_metric: Optional[Dict[str, int]] = None,
    skipped_rows_by_metric: Optional[Dict[str, int]] = None,
    warnings: Optional[List[str]] = None,
    **extra: Any,
) -> Dict[str, Any]:
    """Build a standard validation block for engine responses."""
    rows_skipped = max(rows_before_cleaning - rows_after_cleaning, 0)
    block: Dict[str, Any] = {
        "rows_before_cleaning": int(rows_before_cleaning),
        "rows_after_cleaning": int(rows_after_cleaning),
        "rows_skipped": int(rows_skipped),
        "columns_used": list(dict.fromkeys(columns_used or [])),
        "valid_rows_by_metric": valid_rows_by_metric or {},
        "skipped_rows_by_metric": skipped_rows_by_metric or {},
        "warnings": warnings or [],
    }
    block.update(extra)
    return block
