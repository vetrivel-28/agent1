import os
import sys

# Add current directory to path so we can import app
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.validators.schema_detector import identify_dataset
import pandas as pd

def test_missing_required_column():
    # Magnet schema usually requires 'Keyword Phrase', 'Search Volume'
    df = pd.DataFrame({
        "Keyword": ["earbuds", "headphones"],
        # Missing search volume
    })
    detected_type, conf, details = identify_dataset(df, expected_type="magnet")
    print(f"Missing Required - Detected Type: {detected_type}, Conf: {conf}, Details: {details}")
    assert conf < 0.5, "Should fail confidence if required columns are missing"
    assert "Search Volume" in details.get("missing_columns", []), "Should identify missing required columns"

def test_wrong_dataset_type():
    # Submit BlackBox-like data but claim it's Magnet
    df = pd.DataFrame({
        "ASIN": ["B01N5IMLQH", "B08R7QGXZJ"],
        "Title": ["Wireless Earbuds", "Bluetooth Headphones"],
        "Brand": ["Apple", "Sony"],
        "Price": [129.99, 89.99],
        "Category": ["Electronics", "Electronics"],
    })
    detected_type, conf, details = identify_dataset(df, expected_type="magnet")
    print(f"Wrong Dataset Type - Detected Type: {detected_type}, Conf: {conf}, Details: {details}")
    assert conf < 0.5, "Should fail when expected type doesn't match"
    assert details["detected_type"] == "blackbox", "Should correctly detect actual type"

if __name__ == "__main__":
    test_missing_required_column()
    test_wrong_dataset_type()
    print("All schema fallback tests passed!")
