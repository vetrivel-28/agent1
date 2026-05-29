"""
Dataset Validator.
Validates uploaded CSV bytes before storing in the registry.
Returns structured error dicts on failure — never raises silently.
"""
from __future__ import annotations

import io
from typing import Dict, List, Optional, Tuple

import pandas as pd

from app.utils.logger import get_logger
from app.validators.schema_detector import humanize_upload_error, identify_dataset, validate_for_type

logger = get_logger("dataset_validator")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_csv_bytes(
    content: bytes,
    dataset_name: str,
    required_columns: Optional[List[str]] = None,
    expected_type: Optional[str] = None,
) -> Tuple[bool, pd.DataFrame, Dict]:
    """
    Parse raw CSV bytes into a DataFrame and validate it.

    Returns
    -------
    (is_valid, dataframe, error_dict)
    error_dict is empty {} when is_valid is True.
    """
    # --- empty file ---
    if not content or len(content) == 0:
        msg = f"Uploaded file '{dataset_name}' is empty."
        logger.warning(msg)
        return False, pd.DataFrame(), _err(dataset_name, msg, [])

    # --- parse CSV ---
    df, parse_error = _parse_csv(content, dataset_name)
    if parse_error:
        return False, pd.DataFrame(), parse_error

    # --- strip column whitespace ---
    df.columns = [str(c).strip() for c in df.columns]

    # --- empty after parse ---
    if df.empty:
        msg = f"Dataset '{dataset_name}' parsed but contains no rows."
        logger.warning(msg)
        return False, pd.DataFrame(), _err(dataset_name, msg, [])

    # --- duplicate columns ---
    dupes = df.columns[df.columns.duplicated()].tolist()
    if dupes:
        logger.warning(f"Duplicate columns in '{dataset_name}': {dupes} — keeping first occurrence.")
        df = df.loc[:, ~df.columns.duplicated()]

    # --- schema-driven validation (preferred) ---
    detected_type, confidence, details = identify_dataset(df, expected_type=expected_type or dataset_name)
    if detected_type is None or confidence < 0.5:
        msg = humanize_upload_error(expected_type or dataset_name, details)
        logger.warning("Schema validation failed for '%s': %s", dataset_name, msg)
        return False, pd.DataFrame(), _err(
            dataset_name,
            msg,
            details.get("missing_columns", []),
            details=details,
        )

    # --- legacy required columns (case-insensitive) ---
    if required_columns:
        norm_actual = {c.strip().lower() for c in df.columns}
        missing = [r for r in required_columns if r.strip().lower() not in norm_actual]
        if missing:
            msg = f"Required columns missing: {', '.join(missing)}"
            logger.warning(f"{msg}")
            return False, pd.DataFrame(), _err(dataset_name, msg, missing, details=details)

    ok, validate_msg, matched = validate_for_type(df, detected_type)
    if not ok:
        return False, pd.DataFrame(), _err(dataset_name, validate_msg, details.get("missing_columns", []), details=details)

    logger.info(
        f"Dataset '{dataset_name}' validated OK — "
        f"{len(df)} rows × {len(df.columns)} columns."
    )
    return True, df, {
        "detected_type": detected_type,
        "confidence": round(confidence, 3),
        "matched_columns": matched,
        "validation_message": validate_msg,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_csv(content: bytes, dataset_name: str) -> Tuple[pd.DataFrame, Optional[Dict]]:
    """Try UTF-8-sig then latin-1 encoding."""
    for enc in ("utf-8-sig", "latin-1"):
        try:
            df = pd.read_csv(io.BytesIO(content), encoding=enc, low_memory=False)
            return df, None
        except Exception as exc:
            last_exc = exc

    msg = f"Could not parse CSV '{dataset_name}': {last_exc}"
    logger.error(msg)
    return pd.DataFrame(), _err(dataset_name, msg, [])


def _err(
    dataset_name: str,
    message: str,
    missing_columns: List[str],
    details: Optional[Dict] = None,
) -> Dict:
    out = {
        "status": "error",
        "dataset": dataset_name,
        "message": message,
        "missing_columns": missing_columns,
    }
    if details:
        out["details"] = details
    return out
