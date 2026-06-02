/**
 * EvidenceButton Component
 * 
 * Small button that appears next to metrics to show evidence.
 * Clicking opens the evidence drawer with full details.
 */

import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';

export interface MetricEvidence {
  metric_name: string;
  metric_value: any;
  source_dataset: string;
  rows_matched: number;
  source_rows?: Array<{
    row_index: number;
    values: Record<string, any>;
  }>;
  aggregation_formula?: {
    method: string;
    formula_text: string;
    final_value: number;
  };
  source_columns?: Array<{
    column_name: string;
    dataset: string;
    rows_used: number;
  }>;
}

interface EvidenceButtonProps {
  metric: MetricEvidence | null;
  onView: (evidence: MetricEvidence) => void;
  compact?: boolean;
}

export function EvidenceButton({ 
  metric, 
  onView, 
  compact = false 
}: EvidenceButtonProps) {
  
  if (!metric) {
    return null;
  }
  
  return (
    <button
      onClick={() => onView(metric)}
      className={`
        inline-flex items-center gap-1 
        px-2 py-1 
        text-xs font-medium
        text-blue-600 hover:text-blue-700
        bg-blue-50 hover:bg-blue-100
        rounded border border-blue-200
        transition-colors
        cursor-pointer
      `}
      title={`View evidence: ${metric.rows_matched} source rows`}
    >
      <FileText className="w-3 h-3" />
      {compact ? (
        'Evidence'
      ) : (
        <>
          Evidence
          <span className="text-xs text-blue-500">({metric.rows_matched})</span>
        </>
      )}
      <ExternalLink className="w-3 h-3" />
    </button>
  );
}

export default EvidenceButton;
