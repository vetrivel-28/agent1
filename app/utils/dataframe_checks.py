"""
Safe DataFrame validation helpers.
Prevents "ambiguous truth value" errors when checking DataFrames.
"""
from typing import Optional
import pandas as pd


def is_valid_dataframe(df: Optional[pd.DataFrame]) -> bool:
    """
    Check if a DataFrame is valid (not None and not empty).
    
    Args:
        df: DataFrame to check
        
    Returns:
        True if df is a non-empty DataFrame, False otherwise
    """
    return df is not None and not df.empty


def is_empty_dataframe(df: Optional[pd.DataFrame]) -> bool:
    """
    Check if a DataFrame is None or empty.
    
    Args:
        df: DataFrame to check
        
    Returns:
        True if df is None or empty, False otherwise
    """
    return df is None or df.empty


def require_dataframe(df: Optional[pd.DataFrame], name: str = "DataFrame") -> None:
    """
    Raise ValueError if DataFrame is not valid.
    
    Args:
        df: DataFrame to validate
        name: Name for error message
        
    Raises:
        ValueError: If df is None or empty
    """
    if is_empty_dataframe(df):
        raise ValueError(f"{name} is None or empty")


def require_any_dataframe(*dfs: Optional[pd.DataFrame], names: Optional[list] = None) -> None:
    """
    Raise ValueError if all DataFrames are invalid.
    
    Args:
        *dfs: DataFrames to check
        names: Names for error message
        
    Raises:
        ValueError: If all DataFrames are None or empty
    """
    if all(is_empty_dataframe(df) for df in dfs):
        if names:
            raise ValueError(f"All datasets are missing: {', '.join(names)}")
        raise ValueError("No valid datasets provided")
