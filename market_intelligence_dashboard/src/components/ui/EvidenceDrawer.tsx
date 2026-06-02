import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface MetricEvidence {
  metric_name: string;
  source_dataset: string;
  source_rows?: Array<{
    row_index: number;
    values: Record<string, any>;
  }>;
  calculation_steps?: string[];
  classification_rule?: string;
  time_computed?: string;
}

interface EvidenceDrawerProps {
  evidence: MetricEvidence | null;
  onClose: () => void;
}

function SourceRowsSection({ evidence }: { evidence: MetricEvidence }) {
  const [expanded, setExpanded] = useState(false);
  const rows = evidence.source_rows;
  
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-gray-500">No source rows available.</div>;
  }
  
  const displayRows = expanded ? rows : rows.slice(0, 10);
  
  return (
    <div className="pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded"
      >
        <h3 className="font-semibold text-sm">
          Source Rows ({rows.length} Total)
        </h3>
        {expanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
      
      <div className="mt-2 space-y-3 max-h-[70vh] overflow-y-auto pb-6">
        {displayRows.map((row, idx) => {
          const v = row.values || {};
          return (
            <div key={idx} className="bg-gray-50 p-3 rounded text-xs border border-gray-200">
              <div className="grid grid-cols-2 gap-2 text-gray-600">
                <div><span className="font-medium text-gray-900">Dataset:</span> {evidence.source_dataset || 'blackbox'}</div>
                <div><span className="font-medium text-gray-900">Row Number:</span> {row.row_index}</div>
                <div><span className="font-medium text-gray-900">Brand:</span> {v.brand || v.Brand || 'N/A'}</div>
                <div><span className="font-medium text-gray-900">ASIN:</span> {v.asin || v.ASIN || 'N/A'}</div>
                <div><span className="font-medium text-gray-900">Revenue:</span> {v.parent_level_revenue || v.parent_revenue || v.revenue || v['Parent Level Revenue'] || 'N/A'}</div>
                <div><span className="font-medium text-gray-900">Sales:</span> {v.parent_level_sales || v.parent_sales || v.sales || v['Parent Level Sales'] || 'N/A'}</div>
                <div><span className="font-medium text-gray-900">BSR:</span> {v.bsr || v.BSR || 'N/A'}</div>
                
                <div className="col-span-2 mt-1 border-t pt-2">
                  <span className="font-medium text-gray-900 block mb-1">Fields used in calculation:</span>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(v).map(([key, val]) => (
                       <span key={key} className="bg-white border px-1.5 py-0.5 rounded text-[10px] text-gray-500 truncate max-w-[150px]">
                         {key}: {String(val).slice(0, 30)}
                       </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {rows.length > 10 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-blue-600 hover:underline px-2"
        >
          Show all {rows.length} rows
        </button>
      )}
    </div>
  );
}

export function EvidenceDrawer({ evidence, onClose }: EvidenceDrawerProps) {
  if (!evidence) {
    return null;
  }
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-40"
      />
      
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 w-[450px] bg-white shadow-2xl z-50 overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-lg text-gray-900">
              {evidence.metric_name || 'Calculation Audit'}
            </h2>
            <p className="text-xs text-gray-500">Evidence Audit Trail</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4">
          <SourceRowsSection evidence={evidence} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default EvidenceDrawer;
