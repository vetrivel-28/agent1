import re
file_path = "src/pages/PriceElasticity.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

evidence_type = """type Evidence = {
  source_dataset: string;
  source_columns: string[];
  formula: string;
  source_values: string;
  rows_included: number;
  rows_excluded: number;
  calculation_steps: string[];
  final_value: string | number;
  interpretation: string;
"""
new_evidence_type = """type Evidence = {
  source_dataset: string;
  source_columns: string[];
  formula: string;
  source_values: string;
  rows_included: number;
  rows_excluded: number;
  calculation_steps: string[];
  final_value: string | number;
  interpretation: string;
  active_filters?: Record<string, any>;
  filtered_row_count?: number;
  total_row_count?: number;
  calculation_scope?: 'Global' | 'Filtered';
"""
content = content.replace(evidence_type, new_evidence_type)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
