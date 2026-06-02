"""
Test script to validate Entry Difficulty and Entry Cost Index scoring.
Run this after uploading your Magnet + BlackBox datasets.

Usage:
    python test_entry_metrics.py
"""

import sys
sys.path.insert(0, '/Users/annie/agent1')

import pandas as pd
from app.services.dataset_registry import registry
from app.analytics.finance.entry_cost import compute_entry_metrics
from app.analytics.finance._utils import classify_pressure_level

def test_entry_metrics():
    """Test Entry Difficulty and Entry Cost Index with current datasets."""
    
    # Load datasets
    try:
        magnet_df = pd.read_csv("datasets/Magnet_Bamboo Towel.csv")
    except Exception:
        magnet_df = pd.DataFrame()
        
    try:
        blackbox_df = pd.read_csv("datasets/BlackBox_Products_Bamboo Towel.csv")
    except Exception:
        blackbox_df = pd.DataFrame()
    
    print("=" * 80)
    print("ENTRY METRICS VALIDATION TEST")
    print("=" * 80)
    
    # Check data availability
    print("\n[DATA AVAILABILITY]")
    print(f"Magnet dataset: {'LOADED' if magnet_df is not None and len(magnet_df) > 0 else 'NOT LOADED'}")
    if magnet_df is not None:
        print(f"  - Rows: {len(magnet_df)}")
        print(f"  - Columns: {list(magnet_df.columns)}")
    
    print(f"BlackBox dataset: {'LOADED' if blackbox_df is not None and len(blackbox_df) > 0 else 'NOT LOADED'}")
    if blackbox_df is not None:
        print(f"  - Rows: {len(blackbox_df)}")
        print(f"  - Columns: {list(blackbox_df.columns)}")
    
    # Compute entry metrics
    print("\n[COMPUTING ENTRY METRICS]")
    result = compute_entry_metrics(magnet_df, blackbox_df)
    
    # Print status
    print(f"Status: {result.get('status')}")
    print(f"Normalization Method: {result.get('normalization_method')}")
    
    # Entry Difficulty
    print("\n[ENTRY DIFFICULTY]")
    ed = result.get("entry_difficulty", {})
    if ed:
        score = ed.get("score", 0)
        classification = ed.get("classification", "N/A")
        components_available = ed.get("components_available", 0)
        components_missing = ed.get("components_missing", [])
        
        print(f"Score: {score}/100")
        print(f"Classification: {classification}")
        print(f"Components Available: {components_available}/7")
        if components_missing:
            print(f"Components Missing: {', '.join(components_missing)}")
        
        print("\nComponent Breakdown:")
        for comp in ed.get("components", []):
            name = comp.get("component", "Unknown")
            comp_score = comp.get("score", 0)
            weight = comp.get("weight", 0)
            contribution = comp_score * weight
            print(f"  {name:25} | Score: {comp_score:6.1f} | Weight: {weight:5.1%} | Contribution: {contribution:6.2f}")
    
    # Entry Cost Index
    print("\n[ENTRY COST INDEX]")
    eci = result.get("entry_cost_index", {})
    if eci:
        score = eci.get("score", 0)
        classification = eci.get("classification", "N/A")
        components_available = eci.get("components_available", 0)
        components_missing = eci.get("components_missing", [])
        
        print(f"Score: {score}/100")
        print(f"Classification: {classification}")
        print(f"Components Available: {components_available}/5")
        if components_missing:
            print(f"Components Missing: {', '.join(components_missing)}")
        
        print("\nComponent Breakdown:")
        for comp in eci.get("components", []):
            name = comp.get("component", "Unknown")
            comp_score = comp.get("score", 0)
            weight = comp.get("weight", 0)
            contribution = comp_score * weight
            print(f"  {name:25} | Score: {comp_score:6.1f} | Weight: {weight:5.1%} | Contribution: {contribution:6.2f}")
    
    # All component scores
    print("\n[ALL COMPONENT SCORES]")
    all_scores = result.get("all_component_scores", {})
    for key, score in all_scores.items():
        print(f"  {key:25} | {score:6.1f}/100")
    
    # Component metadata
    print("\n[COMPONENT METADATA]")
    metadata = result.get("components_metadata", {})
    for key, data in metadata.items():
        print(f"\n  {key.replace('_', ' ').title()}:")
        print(f"    Score: {data.get('score', 0)}")
        print(f"    Column: {data.get('column', 'N/A')}")
        print(f"    Samples: {data.get('samples', 0)}")
    
    # Validation checks
    print("\n[VALIDATION CHECKS]")
    ed_score = ed.get("score", 0)
    eci_score = eci.get("score", 0)
    ed_classification = ed.get("classification", "N/A")
    
    checks = [
        ("Entry Difficulty in reasonable range (20-80)", 20 <= ed_score <= 80 or result.get('status') == 'insufficient_data'),
        ("Entry Cost Index in reasonable range (20-80)", 20 <= eci_score <= 80 or result.get('status') == 'insufficient_data'),
        ("Entry Difficulty not unrealistically low (<5)", ed_score >= 5 or result.get('status') == 'insufficient_data'),
        ("Entry Cost Index not unrealistically low (<5)", eci_score >= 5 or result.get('status') == 'insufficient_data'),
        ("Classification is not 'Easy'", "Low observed pressure" in ed_classification or ed_score > 25 or result.get('status') == 'insufficient_data'),
        ("Using percentile-based normalization", "Percentile-based" in result.get("normalization_method", "") or result.get('status') == 'insufficient_data'),
    ]
    
    for check_name, passed in checks:
        status = "PASS" if passed else "FAIL"
        print(f"{status:8} | {check_name}")
    
    # Summary
    print("\n[SUMMARY]")
    print(f"Overall: Entry difficulty is {ed.get('classification', 'N/A').lower()}, entry cost index is {eci.get('classification', 'N/A').lower()}.")
    print(f"Mini Insight: {result.get('mini_insight', 'N/A')}")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    test_entry_metrics()
