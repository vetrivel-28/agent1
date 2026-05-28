"""
Robust numeric column cleaner.
Handles string formatting, special characters, and preserves max data.
"""
from typing import Tuple, Optional, List
import pandas as pd
import numpy as np
from app.utils.logger import get_logger

logger = get_logger("numeric_cleaner")


def clean_numeric_series(
    series: pd.Series,
    series_name: str = "Series",
    remove_negative: bool = False,
    allow_zero: bool = True,
) -> Tuple[pd.Series, dict]:
    """
    Clean and convert a series to numeric with detailed logging.
    
    Args:
        series: Series to clean
        series_name: Name for logging
        remove_negative: If True, convert negatives to NaN
        allow_zero: If True, keep zero values; if False, zero becomes NaN
        
    Returns:
        (cleaned_series, stats_dict) where stats contains:
        - original_count: Original non-null values
        - cleaned_count: Numeric values after cleaning
        - nan_introduced: Count of NaN values
        - zero_count: Count of zero values (if tracked)
        - negative_count: Count of negative values (if tracked)
    """
    if series is None or series.empty:
        return pd.Series([np.nan] * len(series), index=series.index), {
            "original_count": 0,
            "cleaned_count": 0,
            "nan_introduced": 0,
        }
    
    stats = {
        "series_name": series_name,
        "original_count": int(series.count()),
        "original_type": str(series.dtype),
    }
    
    # Step 1: Convert to string and clean special characters
    cleaned = series.astype(str).copy()
    
    # Remove common non-numeric prefixes/suffixes
    cleaned = cleaned.str.strip()  # Whitespace
    cleaned = cleaned.str.replace(",", "", regex=False)  # Commas (1,000)
    cleaned = cleaned.str.replace("$", "", regex=False)  # Dollar signs
    cleaned = cleaned.str.replace("%", "", regex=False)  # Percent signs
    cleaned = cleaned.str.replace("#", "", regex=False)  # Hash
    cleaned = cleaned.str.replace("+", "", regex=False)  # Plus
    cleaned = cleaned.str.replace("K", "000", regex=False)  # 1.5K → 1.5000
    cleaned = cleaned.str.replace("M", "000000", regex=False)  # 1.5M → 1.5000000
    
    # Replace placeholder strings with NaN
    placeholders = ["N/A", "n/a", "NA", "na", "-", "--", "none", "None", "NONE", "null", "NULL", ""]
    for placeholder in placeholders:
        cleaned = cleaned.replace(placeholder, np.nan, regex=False)
    
    # Step 2: Convert to numeric
    numeric = pd.to_numeric(cleaned, errors="coerce")
    
    # Step 3: Handle negative values if requested
    if remove_negative:
        negative_count = (numeric < 0).sum()
        numeric = numeric.mask(numeric < 0, np.nan)
        stats["negative_removed"] = int(negative_count)
    else:
        stats["negative_count"] = int((numeric < 0).sum())
    
    # Step 4: Handle zero values if requested
    if not allow_zero:
        zero_count = (numeric == 0).sum()
        numeric = numeric.mask(numeric == 0, np.nan)
        stats["zero_removed"] = int(zero_count)
    else:
        stats["zero_count"] = int((numeric == 0).sum())
    
    # Step 5: Calculate statistics
    stats["cleaned_count"] = int(numeric.count())
    stats["nan_introduced"] = int(numeric.isna().sum())
    stats["final_type"] = "float64"
    
    logger.info(
        f"Cleaned '{series_name}': "
        f"original={stats['original_count']}, "
        f"cleaned={stats['cleaned_count']}, "
        f"nan={stats['nan_introduced']}"
    )
    
    return numeric, stats


def clean_numeric_dataframe(
    df: pd.DataFrame,
    columns: List[str],
    skip_missing: bool = True,
) -> Tuple[pd.DataFrame, dict]:
    """
    Clean multiple numeric columns in a DataFrame.
    
    Args:
        df: DataFrame to clean
        columns: List of column names to clean
        skip_missing: If True, skip columns that don't exist
        
    Returns:
        (cleaned_df, all_stats) where all_stats contains per-column info
    """
    if df is None or df.empty:
        return df, {"rows_before": 0, "rows_after": 0, "columns_cleaned": []}
    
    original_rows = len(df)
    cleaned_df = df.copy()
    all_stats = {
        "rows_before": original_rows,
        "columns_cleaned": [],
        "per_column": {},
    }
    
    for col in columns:
        if col not in cleaned_df.columns:
            if skip_missing:
                logger.warning(f"Column '{col}' not found in DataFrame")
                continue
            else:
                raise ValueError(f"Required column '{col}' not found")
        
        cleaned_series, col_stats = clean_numeric_series(cleaned_df[col], col)
        cleaned_df[col] = cleaned_series
        all_stats["columns_cleaned"].append(col)
        all_stats["per_column"][col] = col_stats
    
    all_stats["rows_after"] = len(cleaned_df)
    all_stats["rows_removed"] = original_rows - len(cleaned_df)
    
    return cleaned_df, all_stats


def safe_filter_rows(
    df: pd.DataFrame,
    required_columns: List[str],
    filter_name: str = "Filter",
) -> Tuple[pd.DataFrame, dict]:
    """
    Safely filter rows where required columns have valid numeric values.
    Logs which rows are dropped and why.
    
    Args:
        df: DataFrame to filter
        required_columns: Columns that must have non-NaN values
        filter_name: Name for logging
        
    Returns:
        (filtered_df, filter_stats)
    """
    if df is None or df.empty:
        return df, {"rows_before": 0, "rows_after": 0}
    
    original_rows = len(df)
    
    # Find rows with NaN in any required column
    has_all_required = df[required_columns].notna().all(axis=1)
    filtered_df = df[has_all_required].copy()
    
    rows_dropped = original_rows - len(filtered_df)
    
    filter_stats = {
        "filter_name": filter_name,
        "rows_before": original_rows,
        "rows_after": len(filtered_df),
        "rows_dropped": rows_dropped,
        "required_columns": required_columns,
    }
    
    if rows_dropped > 0:
        logger.info(
            f"{filter_name}: Dropped {rows_dropped} rows with missing required values. "
            f"Remaining: {len(filtered_df)}"
        )
    
    return filtered_df, filter_stats


def validate_numeric_column(
    series: pd.Series,
    column_name: str,
    min_valid_count: int = 1,
) -> Tuple[bool, str]:
    """
    Validate that a numeric column has sufficient valid data.
    
    Args:
        series: Series to validate
        column_name: Name for error messages
        min_valid_count: Minimum number of valid (non-NaN) values required
        
    Returns:
        (is_valid, message)
    """
    if series is None:
        return False, f"Column '{column_name}' is None"
    
    valid_count = series.count()
    
    if valid_count < min_valid_count:
        return (
            False,
            f"Column '{column_name}' has insufficient valid values: {valid_count}/{len(series)}"
        )
    
    return True, f"Column '{column_name}' valid: {valid_count}/{len(series)}"
