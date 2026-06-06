#!/usr/bin/env python3
"""
Automated verification script for Consumer Adoption Simulator structure.
Checks code structure against QA requirements before manual browser testing.
"""

import os
import re
from pathlib import Path

def check_file_content(filepath, checks):
    """Run a list of check functions against a file."""
    if not os.path.exists(filepath):
        return [f"❌ File not found: {filepath}"]
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    results = []
    for check_name, check_fn in checks:
        result = check_fn(content)
        status = "✅" if result else "❌"
        results.append(f"{status} {check_name}")
    
    return results

def main():
    print("=" * 80)
    print("Consumer Adoption Simulator — Automated Code Structure Verification")
    print("=" * 80)
    print()
    
    base_path = Path(__file__).parent
    frontend_path = base_path / "market_intelligence_dashboard" / "src"
    
    all_passed = True
    
    # =========================================================================
    # Check 1: Phase5Sections.tsx exports exactly 10 sections
    # =========================================================================
    print("📋 Check 1: Phase5Sections.tsx Structure")
    print("-" * 80)
    
    phase5_file = frontend_path / "components" / "phase5" / "Phase5Sections.tsx"
    
    def check_section_count(content):
        """Count exported sections."""
        # Look for the export array
        export_match = re.search(r'export\s+const\s+phase5Sections\s*=\s*\[(.*?)\];', content, re.DOTALL)
        if not export_match:
            return False
        
        export_content = export_match.group(1)
        # Count JSX elements (sections)
        section_matches = re.findall(r'<\w+Section\b', export_content)
        return len(section_matches) == 10
    
    def check_no_removed_sections(content):
        """Check that removed sections are not exported."""
        removed = [
            'SimulationConfidenceSection',
            'MarketStressTestingSection',
            'SegmentStabilitySection',
            'ExecutiveDecisionCenterSection',
        ]
        for section_name in removed:
            if section_name in content:
                return False
        return True
    
    def check_final_summary_exists(content):
        """Check Final Executive Summary is present."""
        return 'FinalExecutiveSummarySection' in content or 'ExecutiveNarrativeSection' in content
    
    phase5_checks = [
        ("Exports exactly 10 sections", check_section_count),
        ("No removed sections in export", check_no_removed_sections),
        ("Final Executive Summary present", check_final_summary_exists),
    ]
    
    phase5_results = check_file_content(str(phase5_file), phase5_checks)
    for result in phase5_results:
        print(result)
        if "❌" in result:
            all_passed = False
    
    print()
    
    # =========================================================================
    # Check 2: ConsumerAdoptionSimulator.tsx structure
    # =========================================================================
    print("📋 Check 2: ConsumerAdoptionSimulator.tsx Structure")
    print("-" * 80)
    
    cas_file = frontend_path / "pages" / "ConsumerAdoptionSimulator.tsx"
    
    def check_no_evidence_drawer(content):
        """Check EvidenceDrawer is not imported or used."""
        return 'EvidenceDrawer' not in content
    
    def check_uses_insight_modal(content):
        """Check InsightModal is used."""
        return 'InsightModal' in content
    
    def check_no_subtitle(content):
        """Check no description prop on PageHeader."""
        # Look for PageHeader component
        pageheader_match = re.search(r'<PageHeader\s+[^>]*title=', content, re.DOTALL)
        if not pageheader_match:
            return True  # No PageHeader found, that's fine
        
        # Check if description prop exists
        desc_match = re.search(r'<PageHeader\s+[^>]*description=', content, re.DOTALL)
        return desc_match is None
    
    def check_modal_state(content):
        """Check modal state is used."""
        return 'const [modal, setModal]' in content or 'useState<ModalContent' in content
    
    cas_checks = [
        ("No EvidenceDrawer component", check_no_evidence_drawer),
        ("Uses InsightModal", check_uses_insight_modal),
        ("No subtitle (description prop)", check_no_subtitle),
        ("Modal state management present", check_modal_state),
    ]
    
    cas_results = check_file_content(str(cas_file), cas_checks)
    for result in cas_results:
        print(result)
        if "❌" in result:
            all_passed = False
    
    print()
    
    # =========================================================================
    # Check 3: modalContent.ts quality
    # =========================================================================
    print("📋 Check 3: modalContent.ts Quality")
    print("-" * 80)
    
    modal_file = frontend_path / "utils" / "modalContent.ts"
    
    def check_no_rows_processed(content):
        """Check no rows_processed in modal content."""
        return 'rows_processed' not in content
    
    def check_no_source_intelligence(content):
        """Check no 'Source Intelligence' text."""
        return 'Source Intelligence' not in content
    
    def check_no_calculation_scope(content):
        """Check no 'Calculation Scope' text."""
        return 'Calculation Scope' not in content
    
    def check_business_language(content):
        """Check modals use meaning/formula/interpretation structure."""
        return 'meaning:' in content and 'formula:' in content
    
    modal_checks = [
        ("No rows_processed references", check_no_rows_processed),
        ("No 'Source Intelligence' text", check_no_source_intelligence),
        ("No 'Calculation Scope' text", check_no_calculation_scope),
        ("Uses business language structure", check_business_language),
    ]
    
    modal_results = check_file_content(str(modal_file), modal_checks)
    for result in modal_results:
        print(result)
        if "❌" in result:
            all_passed = False
    
    print()
    
    # =========================================================================
    # Check 4: Backend market_dna.py fix
    # =========================================================================
    print("📋 Check 4: Backend market_dna.py Fix")
    print("-" * 80)
    
    market_dna_file = base_path / "app" / "services" / "consumer_adoption_simulator" / "market_dna.py"
    
    def check_no_dict_in_set(content):
        """Check no dict literal in key lists."""
        # Look for common patterns that would cause unhashable type error
        # e.g., set([{...}]) or key = {...}
        problematic_patterns = [
            r'set\(\[.*?\{.*?\}.*?\]\)',  # set([{...}])
            r'\.keys\(\).*?\{.*?\}',      # .keys() followed by dict literal
        ]
        for pattern in problematic_patterns:
            if re.search(pattern, content, re.DOTALL):
                return False
        return True
    
    def check_has_get_helper(content):
        """Check _get helper exists for safe access."""
        return 'def _get(' in content
    
    market_dna_checks = [
        ("No dict literal in set/keys operations", check_no_dict_in_set),
        ("Has _get helper for safe access", check_has_get_helper),
    ]
    
    market_dna_results = check_file_content(str(market_dna_file), market_dna_checks)
    for result in market_dna_results:
        print(result)
        if "❌" in result:
            all_passed = False
    
    print()
    
    # =========================================================================
    # Check 5: Section component files exist
    # =========================================================================
    print("📋 Check 5: Section Component Files")
    print("-" * 80)
    
    section_components = [
        "ExecutiveSummarySection.tsx",
        "MarketDNASection.tsx",
        "SegmentExplorerSection.tsx",
        "SegmentDistributionSection.tsx",
        "AdoptionMatrixSection.tsx",
        "ResistanceTestingSection.tsx",
        "RevenueLiftSection.tsx",
        "RepeatPurchaseSection.tsx",
        "FinalExecutiveSummarySection.tsx",
    ]
    
    sections_path = frontend_path / "components" / "phase5"
    for component in section_components:
        component_path = sections_path / component
        exists = component_path.exists()
        status = "✅" if exists else "❌"
        print(f"{status} {component}")
        if not exists:
            all_passed = False
    
    print()
    
    # =========================================================================
    # Summary
    # =========================================================================
    print("=" * 80)
    if all_passed:
        print("✅ ALL AUTOMATED CHECKS PASSED")
        print()
        print("Next Steps:")
        print("1. Ensure backend server is running: python -m uvicorn app.main:app --reload")
        print("2. Ensure frontend server is running: npm run dev")
        print("3. Load dataset at: http://localhost:5174")
        print("4. Navigate to: http://localhost:5174/consumer-adoption")
        print("5. Follow manual QA checklist: CONSUMER_ADOPTION_SIMULATOR_QA_CHECKLIST.md")
    else:
        print("❌ SOME AUTOMATED CHECKS FAILED")
        print()
        print("Please review the failures above before proceeding with manual browser QA.")
    print("=" * 80)
    
    return 0 if all_passed else 1

if __name__ == '__main__':
    exit(main())
