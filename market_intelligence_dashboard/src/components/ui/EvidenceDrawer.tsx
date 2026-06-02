/**
 * EvidenceDrawer Component
 * 
 * Slide-out panel showing complete evidence for a metric.
 * Displays source rows, calculation formula, and aggregation details.
 */

import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    non_null_count: number;
  }>;
  filters_applied?: string[];
  time_computed?: string;
  confidence_score?: number;
}

interface EvidenceDrawerProps {
  evidence: MetricEvidence | null;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 hover:bg-gray-200 rounded"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-600" />
      ) : (
        <Copy className="w-4 h-4 text-gray-600" />
      )}
    </button>
  );
}

function SourceRowsSection({ rows }: { rows?: Array<any> }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!rows || rows.length === 0) {
    return null;
  }
  
  const displayRows = expanded ? rows : rows.slice(0, 5);
  
  return (
    <div className="border-t pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded"
      >
        <h3 className="font-semibold text-sm">
          Source Rows ({rows.length} total)
        </h3>
        {expanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
      
      <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
        {displayRows.map((row, idx) => (
          <div key={idx} className="bg-gray-50 p-2 rounded text-xs border border-gray-200">
            <div className="font-mono font-bold text-gray-700">
              Row #{row.row_index}
            </div>
            <div className="mt-1 text-gray-600">
              {Object.entries(row.values || {}).map(([key, value]) => (
                <div key={key} className="truncate">
                  <span className="font-medium">{key}:</span>{' '}
                  <span className="text-gray-700">{String(value).slice(0, 50)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {rows.length > 5 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          Show all {rows.length} rows
        </button>
      )}
    </div>
  );
}

function CalculationSection({ formula }: { formula?: any }) {
  if (!formula) {
    return null;
  }
  
  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold text-sm mb-3">Calculation Formula</h3>
      
      <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
        <div>
          <label className="text-xs font-medium text-gray-600">Method:</label>
          <div className="text-sm font-mono text-gray-900">
            {formula.method || 'unknown'}
          </div>
        </div>
        
        <div>
          <label className="text-xs font-medium text-gray-600">Formula:</label>
          <div className="text-sm font-mono text-gray-900 break-words bg-white p-2 rounded border border-blue-100">
            {formula.formula_text}
          </div>
          <CopyButton text={formula.formula_text} />
        </div>
        
        <div>
          <label className="text-xs font-medium text-gray-600">Result:</label>
          <div className="text-lg font-bold text-blue-900">
            {formula.final_value}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnsSection({ columns }: { columns?: Array<any> }) {
  if (!columns || columns.length === 0) {
    return null;
  }
  
  return (
    <div className="border-t pt-4">
      <h3 className="font-semibold text-sm mb-3">Source Columns</h3>
      
      <div className="space-y-2">
        {columns.map((col, idx) => (
          <div key={idx} className="bg-gray-50 p-2 rounded text-xs border border-gray-200">
            <div className="font-medium text-gray-900">{col.column_name}</div>
            <div className="text-gray-600 text-xs mt-1">
              <div>Dataset: {col.dataset}</div>
              <div>Rows used: {col.rows_used}</div>
              {col.non_null_count !== undefined && (
                <div>Non-null: {col.non_null_count}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvidenceDrawer({ evidence, onClose }: EvidenceDrawerProps) {
  if (!evidence) {
    return null;
  }
  
  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-40"
      />
      
      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-50 overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-gray-900">
              {evidence.metric_name}
            </h2>
            <p className="text-xs text-gray-500">Evidence & Audit Trail</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          
          {/* Metric Value */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded p-4">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Metric Value
            </label>
            <div className="text-2xl font-bold text-gray-900 mt-2 break-words">
              {typeof evidence.metric_value === 'number'
                ? evidence.metric_value.toLocaleString()
                : evidence.metric_value}
            </div>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <label className="text-xs font-medium text-gray-600">Dataset</label>
              <div className="font-mono text-sm text-gray-900">
                {evidence.source_dataset}
              </div>
            </div>
            
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <label className="text-xs font-medium text-gray-600">Rows Matched</label>
              <div className="font-bold text-sm text-gray-900">
                {evidence.rows_matched}
              </div>
            </div>
          </div>
          
          {/* Confidence */}
          {evidence.confidence_score !== undefined && (
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <label className="text-xs font-medium text-gray-600">Confidence</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${evidence.confidence_score * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-900">
                  {Math.round(evidence.confidence_score * 100)}%
                </span>
              </div>
            </div>
          )}
          
          {/* Filters */}
          {evidence.filters_applied && evidence.filters_applied.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded">
              <label className="text-xs font-medium text-amber-900 uppercase">
                Filters Applied
              </label>
              <ul className="mt-2 space-y-1">
                {evidence.filters_applied.map((filter, idx) => (
                  <li key={idx} className="text-sm text-amber-800 flex items-center">
                    <span className="mr-2">•</span>
                    {filter}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Calculation Formula */}
          <CalculationSection formula={evidence.aggregation_formula} />
          
          {/* Source Columns */}
          <ColumnsSection columns={evidence.source_columns} />
          
          {/* Source Rows */}
          <SourceRowsSection rows={evidence.source_rows} />
          
          {/* Timestamp */}
          {evidence.time_computed && (
            <div className="text-xs text-gray-500 border-t pt-3">
              Computed: {new Date(evidence.time_computed).toLocaleString()}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default EvidenceDrawer;
