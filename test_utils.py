"""
Test Utilities - Data-Driven Testing

Utilities to help tests work with real CSV data instead of mocks.
All tests must use actual data files.
"""

import os
import pandas as pd
from pathlib import Path
from typing import Optional, Tuple

# Default test data directory
TEST_DATA_DIR = Path(__file__).parent / "datasets"


def load_test_datasets(
    magnet_file: Optional[str] = None,
    blackbox_file: Optional[str] = None,
    keyword_classification_file: Optional[str] = None,
) -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    """
    Load test datasets from CSV files.
    
    Args:
        magnet_file: Path to Magnet CSV (relative to TEST_DATA_DIR)
        blackbox_file: Path to BlackBox CSV (relative to TEST_DATA_DIR)
        keyword_classification_file: Path to Keyword Classification CSV
    
    Returns:
        (magnet_df, blackbox_df, keyword_classification_df)
    
    Example:
        magnet, blackbox, keywords = load_test_datasets(
            magnet_file="Magnet_Bamboo Towel.csv",
            blackbox_file="BlackBox_Products_Bamboo Towel.csv"
        )
    """
    
    magnet_df = None
    blackbox_df = None
    keyword_df = None
    
    if magnet_file:
        magnet_path = TEST_DATA_DIR / magnet_file
        if magnet_path.exists():
            magnet_df = pd.read_csv(magnet_path)
        else:
            print(f"Warning: Magnet file not found: {magnet_path}")
    
    if blackbox_file:
        blackbox_path = TEST_DATA_DIR / blackbox_file
        if blackbox_path.exists():
            blackbox_df = pd.read_csv(blackbox_path)
        else:
            print(f"Warning: BlackBox file not found: {blackbox_path}")
    
    if keyword_classification_file:
        keyword_path = TEST_DATA_DIR / keyword_classification_file
        if keyword_path.exists():
            keyword_df = pd.read_csv(keyword_path)
        else:
            print(f"Warning: Keyword classification file not found: {keyword_path}")
    
    return magnet_df, blackbox_df, keyword_df


def list_available_test_datasets() -> Tuple[list, list]:
    """List all available test CSV files."""
    
    if not TEST_DATA_DIR.exists():
        return [], []
    
    magnet_files = list(TEST_DATA_DIR.glob("*Magnet*.csv"))
    blackbox_files = list(TEST_DATA_DIR.glob("*BlackBox*.csv"))
    
    return (
        [f.name for f in magnet_files],
        [f.name for f in blackbox_files],
    )


def verify_data_integrity(
    df: pd.DataFrame,
    dataset_name: str = "Unknown"
) -> dict:
    """
    Verify data integrity of a loaded dataset.
    
    Returns:
        Dict with integrity stats
    """
    
    stats = {
        "dataset": dataset_name,
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "columns": list(df.columns),
        "missing_values": df.isnull().sum().to_dict(),
        "duplicate_rows": len(df) - len(df.drop_duplicates()),
    }
    
    print(f"\nData Integrity Report: {dataset_name}")
    print(f"  Total rows: {stats['total_rows']}")
    print(f"  Total columns: {stats['total_columns']}")
    print(f"  Duplicate rows: {stats['duplicate_rows']}")
    print(f"  Columns with missing values: {sum(1 for v in stats['missing_values'].values() if v > 0)}")
    
    return stats


def assert_engine_has_evidence(response: dict) -> bool:
    """
    Assert that an engine response includes evidence.
    Raises AssertionError if evidence is missing.
    
    Usage:
        result = api.demand_strength()
        assert_engine_has_evidence(result['data'])
    """
    
    assert response.get('evidence_enabled') == True, \
        "Response must have evidence_enabled=True"
    
    assert 'audit_summary' in response, \
        "Response must include audit_summary"
    
    assert 'evidence' in response, \
        "Response must include evidence object"
    
    audit = response.get('audit_summary', {})
    assert audit.get('rows_processed') > 0, \
        "Must have processed at least 1 row"
    
    print(f"✓ Evidence verified: {audit.get('rows_processed')} rows processed")
    
    return True


def assert_metric_is_traceable(evidence: dict, metric_name: str) -> bool:
    """
    Assert that a specific metric has complete evidence.
    
    Usage:
        evidence = result['evidence']
        assert_metric_is_traceable(evidence, 'top_keyword_volume')
    """
    
    metrics = evidence.get('metrics', {})
    
    assert metric_name in metrics, \
        f"Metric '{metric_name}' not found in evidence"
    
    metric_evidence = metrics[metric_name]
    
    assert 'source_rows' in metric_evidence, \
        f"Metric '{metric_name}' missing source_rows"
    
    assert 'aggregation_formula' in metric_evidence, \
        f"Metric '{metric_name}' missing aggregation_formula"
    
    assert len(metric_evidence['source_rows']) > 0, \
        f"Metric '{metric_name}' has no source rows"
    
    print(f"✓ Metric '{metric_name}' is traceable ({len(metric_evidence['source_rows'])} source rows)")
    
    return True


# Example test function template
def example_engine_test_template():
    """Template for a proper data-driven engine test."""
    
    # 1. Load real test data
    magnet, blackbox, keywords = load_test_datasets(
        magnet_file="Magnet_Bamboo Towel.csv",
        blackbox_file="BlackBox_Products_Bamboo Towel.csv"
    )
    
    if magnet is None or blackbox is None:
        print("Test data not available. Skipping test.")
        return
    
    # 2. Verify data integrity
    verify_data_integrity(magnet, "Magnet")
    verify_data_integrity(blackbox, "BlackBox")
    
    # 3. Upload via API (would be done in actual test)
    # response = api.upload_datasets(magnet_file, blackbox_file)
    # assert response['status'] == 'success'
    
    # 4. Run engine
    # result = api.demand_strength(top_n=10)
    
    # 5. Verify evidence is present
    # assert_engine_has_evidence(result['data'])
    
    # 6. Verify specific metrics are traceable
    # assert_metric_is_traceable(result['data']['evidence'], 'top_keyword_volume')
    
    print("\n✓ All data integrity checks passed")


if __name__ == "__main__":
    # List available test data
    magnet_files, blackbox_files = list_available_test_datasets()
    print("Available Magnet datasets:", magnet_files)
    print("Available BlackBox datasets:", blackbox_files)
