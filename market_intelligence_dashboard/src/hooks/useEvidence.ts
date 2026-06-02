/**
 * useEvidence Hook
 * 
 * Custom hook to manage evidence state in component.
 * Handles showing/hiding evidence drawer and selecting which metric to show.
 * 
 * Usage:
 *   const { selectedEvidence, showEvidence, closeEvidence } = useEvidence();
 *   
 *   return (
 *     <>
 *       <MetricCard>
 *         <EvidenceButton 
 *           metric={evidence}
 *           onView={showEvidence}
 *         />
 *       </MetricCard>
 *       
 *       <EvidenceDrawer 
 *         evidence={selectedEvidence}
 *         onClose={closeEvidence}
 *       />
 *     </>
 *   );
 */

import { useState, useCallback } from 'react';

export interface MetricEvidence {
  metric_name: string;
  metric_value: any;
  source_dataset: string;
  rows_matched: number;
  source_rows?: Array<any>;
  aggregation_formula?: any;
  source_columns?: Array<any>;
  filters_applied?: string[];
  time_computed?: string;
  confidence_score?: number;
}

export function useEvidence() {
  const [selectedEvidence, setSelectedEvidence] = useState<MetricEvidence | null>(null);
  
  const showEvidence = useCallback((evidence: MetricEvidence) => {
    setSelectedEvidence(evidence);
  }, []);
  
  const closeEvidence = useCallback(() => {
    setSelectedEvidence(null);
  }, []);
  
  return {
    selectedEvidence,
    showEvidence,
    closeEvidence,
    isOpen: selectedEvidence !== null,
  };
}

export default useEvidence;
