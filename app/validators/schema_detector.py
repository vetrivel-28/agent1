"""
Schema-driven dataset identification from column fingerprints.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from app.schemas.dataset_schemas import ALL_SCHEMAS, SCHEMA_BY_TYPE, DatasetSchema
from app.utils.logger import get_logger

logger = get_logger("schema_detector")


def identify_dataset(
    df: pd.DataFrame,
    expected_type: Optional[str] = None,
) -> Tuple[Optional[str], float, Dict[str, Any]]:
    """
    Identify dataset type from columns.

    Returns (dataset_type, confidence, details).
    """
    if df is None or df.empty:
        return None, 0.0, {"reason": "empty dataset", "missing_columns": []}

    scores: List[Tuple[str, float, List[str], List[str]]] = []
    for schema in ALL_SCHEMAS:
        conf, matched, missing = schema.score_match(df)
        if conf > 0:
            scores.append((schema.dataset_type, conf, matched, missing))

    scores.sort(key=lambda x: x[1], reverse=True)
    if not scores:
        return None, 0.0, {
            "reason": "no schema matched",
            "missing_columns": ["ASIN or Keyword", "Search Volume or Price", "Title"],
            "columns_found": list(df.columns)[:20],
        }

    best_type, best_conf, matched, missing = scores[0]

    if expected_type and expected_type in SCHEMA_BY_TYPE:
        expected_schema = SCHEMA_BY_TYPE[expected_type]
        exp_conf, exp_matched, exp_missing = expected_schema.score_match(df)
        if exp_conf < 0.5:
            return None, exp_conf, {
                "reason": f"columns do not match expected {expected_schema.display_name}",
                "expected_type": expected_type,
                "detected_type": best_type,
                "detected_confidence": best_conf,
                "missing_columns": exp_missing,
                "matched_columns": exp_matched,
                "columns_found": list(df.columns)[:25],
            }
        return expected_type, exp_conf, {
            "matched_columns": exp_matched,
            "missing_optional": exp_missing,
            "validated": True,
        }

    if len(scores) > 1 and scores[1][1] > best_conf * 0.85:
        logger.warning(
            "Ambiguous dataset identification: %s (%.2f) vs %s (%.2f)",
            scores[0][0],
            scores[0][1],
            scores[1][0],
            scores[1][1],
        )

    return best_type, best_conf, {
        "matched_columns": matched,
        "missing_columns": missing,
        "alternatives": [{"type": t, "confidence": c} for t, c, _, _ in scores[1:3]],
    }


def validate_for_type(df: pd.DataFrame, dataset_type: str) -> Tuple[bool, str, List[str]]:
    """Validate DataFrame against schema for dataset_type."""
    schema = SCHEMA_BY_TYPE.get(dataset_type)
    if not schema:
        return False, f"Unknown dataset type: {dataset_type}", []

    conf, matched, missing = schema.score_match(df)
    if conf < 0.5:
        if missing:
            msg = f"Missing required fields: {', '.join(missing[:5])}"
        else:
            msg = "Insufficient columns for this dataset type"
        return False, msg, missing
    return True, f"Validated as {schema.display_name}", matched


def humanize_upload_error(
    dataset_type: Optional[str],
    details: Dict[str, Any],
) -> str:
    """Build user-facing upload error message."""
    reason = details.get("reason", "")
    missing = details.get("missing_columns") or details.get("missing_optional") or []

    if missing:
        cols = ", ".join(missing[:6])
        return f"Missing required columns: {cols}"

    if reason == "empty dataset":
        return "Uploaded file is empty or contains no data rows."

    if details.get("expected_type") and details.get("detected_type"):
        return (
            f"Column schema mismatch: file looks like '{details['detected_type']}' "
            f"but was uploaded as '{details['expected_type']}'. "
            f"Required fields for this slot were not found."
        )

    if reason == "no schema matched":
        found = details.get("columns_found", [])
        if found:
            return (
                "Could not identify dataset type from columns. "
                f"Found columns include: {', '.join(str(c) for c in found[:8])}..."
            )
        return "Could not identify dataset type from column headers."

    return reason or "Dataset validation failed."
