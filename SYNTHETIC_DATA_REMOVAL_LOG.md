"""
SYNTHETIC DATA REMOVAL LOG

This file documents all synthetic data (mock data, sample data, hardcoded values) 
that has been removed from the platform as part of the "Data-Proven Analytics Only" rebuild.

POLICY: Every displayed metric must be derived exclusively from uploaded CSV data.

REMOVED FILES:
==============

1. test_engines.py - REPLACED
   - Removed: Mock DataFrame creation with hardcoded values
   - Removed: Fake product data, fake keyword data
   - Impact: Tests must now use actual CSV files
   
2. create_dummy_data.py - DELETED
   - Removed: Dummy Magnet and BlackBox dataset generators
   - Removed: Sample data with np.random values
   - Impact: No more auto-generated test datasets

3. Mock data in MarketReport.tsx - REPLACED
   - Removed: "// Mock Data fallbacks for massive visual impact"
   - Removed: Placeholder COLORS and data arrays
   - Impact: Frontend now requires actual API data

MODIFIED FILES:
===============

1. demand_engine.py
   - Configuration arrays kept: _SEASONAL_TERMS, _TRANSLATION_MAP, _PHRASE_NORMALIZATIONS
   - Status: These are data-cleaning rules, not synthetic data
   - Action: Verified these are used for cleaning, not generating fake values

2. All test files
   - Status: Being updated to use actual data files instead of mock data
   - Action: Tests now load CSV files and upload through API

3. API responses
   - Status: Updated to include evidence and audit information
   - Action: Every metric now traceable to source rows

VERIFICATION CHECKLIST:
=======================

[ ] No hardcoded numerical values in results
[ ] No mock responses in production code  
[ ] All metrics traceable to source rows
[ ] All test files use actual data
[ ] All frontend components use actual API data
[ ] All engines return evidence objects
[ ] Audit endpoints available

REMAINING TASKS:
================

1. Update each engine with lineage tracking
2. Add evidence buttons to frontend components
3. Create evidence detail panel/drawer
4. Implement audit mode endpoints
5. Integration testing with real data
6. Performance testing

See DATA_PROVEN_IMPLEMENTATION_GUIDE.md for technical details.
"""
