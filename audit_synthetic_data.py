"""
Synthetic Data Cleanup Audit

Scans the codebase for hardcoded values, mock data, sample data, and other synthetic logic.
All identified items must be removed and replaced with data-driven logic.

POLICY:
- NO hardcoded values that aren't configuration
- NO mock data
- NO sample data in production code
- NO demo responses
- NO placeholder insights
- NO fabricated scores
- ALL metrics must be computed from uploaded datasets
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Tuple

# Patterns to search for synthetic data
SYNTHETIC_PATTERNS = {
    "mock_data": r"(?i)mock.*data|mockData|mock_.*=",
    "sample_data": r"(?i)sample.*data|sampleData|sample_.*=",
    "demo_data": r"(?i)demo.*data|demoData|demo_.*=",
    "fake_data": r"(?i)fake.*data|fakeData|fake_.*=",
    "dummy_data": r"(?i)dummy.*data|dummyData|dummy_.*=",
    "placeholder": r"(?i)placeholder.*=|placeholder_",
    "hardcoded_array": r"=\s*\[.*\].*#.*(?:colors|data|values|items|options)",
    "fallback_values": r"(?i)fallback.*=|default.*hardcoded",
    "sample_response": r"(?i)sample.*response|demo.*response",
}

PATHS_TO_SCAN = [
    "app/",
    "market_intelligence_dashboard/src/",
    "tests/",
]

FILES_TO_IGNORE = {
    "__pycache__",
    "node_modules",
    ".git",
    "dist",
    "build",
}


def find_synthetic_data() -> Dict[str, List[Tuple[str, int, str]]]:
    """
    Scan codebase for synthetic data patterns.
    
    Returns:
        Dict mapping pattern name to list of (filepath, line_number, line_content)
    """
    
    findings: Dict[str, List[Tuple[str, int, str]]] = {
        pattern: [] for pattern in SYNTHETIC_PATTERNS
    }
    
    for base_path in PATHS_TO_SCAN:
        if not os.path.exists(base_path):
            continue
        
        for filepath in Path(base_path).rglob("*"):
            # Skip ignored paths
            if any(ignored in str(filepath) for ignored in FILES_TO_IGNORE):
                continue
            
            # Only scan code files
            if filepath.suffix not in {".py", ".tsx", ".ts", ".js"}:
                continue
            
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    for line_num, line in enumerate(f, 1):
                        for pattern_name, pattern in SYNTHETIC_PATTERNS.items():
                            if re.search(pattern, line):
                                findings[pattern_name].append((
                                    str(filepath),
                                    line_num,
                                    line.strip()
                                ))
            except Exception as e:
                print(f"Error reading {filepath}: {e}")
    
    return findings


def print_findings(findings: Dict[str, List[Tuple[str, int, str]]]) -> None:
    """Pretty print findings."""
    
    total_issues = sum(len(v) for v in findings.values())
    print(f"\n{'='*80}")
    print(f"SYNTHETIC DATA AUDIT REPORT")
    print(f"{'='*80}\n")
    print(f"Total Issues Found: {total_issues}\n")
    
    for pattern, issues in findings.items():
        if not issues:
            continue
        
        print(f"\n{pattern.upper()}")
        print(f"{'-'*80}")
        print(f"Issues: {len(issues)}\n")
        
        for filepath, line_num, line_content in issues[:5]:  # Show first 5
            print(f"  {filepath}:{line_num}")
            print(f"    {line_content[:100]}")
        
        if len(issues) > 5:
            print(f"  ... and {len(issues) - 5} more")


def generate_cleanup_checklist() -> str:
    """Generate a cleanup checklist."""
    
    checklist = """
SYNTHETIC DATA CLEANUP CHECKLIST
================================

BACKEND (Python)
[ ] Remove create_dummy_data.py (sample dataset generator)
[ ] Remove mock data from test_engines.py
[ ] Remove mock data from all test files
[ ] Remove hardcoded arrays from demand_engine.py
    - _SEASONAL_TERMS (if used for fake data generation)
    - _TRANSLATION_MAP (if not used for actual data cleaning)
    - _PHRASE_NORMALIZATIONS
[ ] Remove default/fallback values that are not data-driven
[ ] Verify all fallback logic uses actual dataset values, not hardcoded
[ ] Add evidence tracking to all engine outputs
[ ] Update all engines to track source rows

FRONTEND (React/TypeScript)
[ ] Remove mock data from MarketReport.tsx
[ ] Remove mock data fallbacks from all components
[ ] Remove demo responses from services
[ ] Add Evidence button component to all metric displays
[ ] Add Evidence drawer/panel component
[ ] Add click handlers to view evidence

API RESPONSES
[ ] Add evidence field to all EngineResponse objects
[ ] Add audit_summary field to all responses
[ ] Implement /api/v1/audit endpoint
[ ] Implement /api/v1/evidence/:metric_id endpoint

DATA VALIDATION
[ ] Verify all KPI calculations use uploaded data
[ ] Verify all segment classifications are data-driven
[ ] Verify all trend scores are computed, not hardcoded
[ ] Verify all market share calculations are from data
[ ] Add data quality metrics

TESTING
[ ] Create test dataset with known values
[ ] Verify all metrics produce traceable results
[ ] Verify audit trail is complete
[ ] Test evidence drill-down for each metric type
"""
    
    return checklist


if __name__ == "__main__":
    findings = find_synthetic_data()
    print_findings(findings)
    print("\n" + generate_cleanup_checklist())
