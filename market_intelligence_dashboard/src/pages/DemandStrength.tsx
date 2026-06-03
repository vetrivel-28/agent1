import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { Modal } from '../components/ui/Modal';
import {
  AlertCircle, Loader2, Target, Rocket, Layers, TrendingDown,
  TrendingUp, Activity, AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { KPICard } from '../components/ui/KPICard';
import { EvidencePanel } from '../components/intelligence/EvidencePanel';
import { DashboardSkeleton } from '../components/ui/Skeletons';

// --- Types ---
type Evidence = {
  source_dataset: string;
  source_columns: string[];
  formula: string;
  source_values: any;
  calculation_steps: string[];
  final_value: any;
  interpretation: string;
};

type MetricWithEvidence = {
  value?: number;
  name?: string;
  score?: number;
  gap?: number;
  lift?: number;
  demand_share?: number;
  search_volume?: number;
  business_implication?: string;
  confidence?: string;
  why_ranked_1?: string[];
  evidence: Evidence;
};

type SegmentRow = {
  segment: string;
  demand_share: number;
  revenue_share: number;
  total_search_volume: number;
  demand_revenue_gap: number;
  competition_index: number;
  opportunity_score: number;
  recommendation: string;
  evidence: Evidence;
};

function EvidenceModal({ evidence, isOpen, onClose, title }: { evidence: Evidence | null; isOpen: boolean; onClose: () => void; title: string }) {
  if (!evidence) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Evidence: ${title}`} maxWidth="max-w-2xl">
      <div className="space-y-6 text-sm">
        <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
          <h4 className="font-bold text-primary mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Interpretation
          </h4>
          <p className="text-foreground/80">{evidence.interpretation}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-border/50 rounded-lg p-3 bg-card">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Source Dataset</span>
            <span className="font-mono font-medium">{evidence.source_dataset}</span>
          </div>
          <div className="border border-border/50 rounded-lg p-3 bg-card">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Source Columns</span>
            <span className="font-mono font-medium">{evidence.source_columns.join(', ')}</span>
          </div>
        </div>
        <div className="border border-border/50 rounded-lg p-3 bg-card">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">Mathematical Formula</span>
          <code className="bg-muted/30 px-2 py-1 rounded text-primary font-bold">{evidence.formula}</code>
        </div>
        <div className="border border-border/50 rounded-lg p-3 bg-card">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">Calculation Steps</span>
          <ul className="space-y-2 font-mono text-xs text-foreground/80 bg-muted/20 p-3 rounded-md">
            {evidence.calculation_steps.map((step, i) => (
              <li key={i} className="border-b border-border/30 pb-1 last:border-0 last:pb-0">{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function parseConfidence(confStr?: string) {
  if (confStr === 'High') return 95;
  if (confStr === 'Medium') return 75;
  if (confStr === 'Low') return 45;
  return 80;
}

export default function DemandStrength() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['demand-intelligence'],
    queryFn: () => api.getDemandStrength(50),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; evidence: Evidence | null }>({
    isOpen: false,
    title: '',
    evidence: null
  });

  const openEvidence = (title: string, evidence: Evidence | undefined) => {
    if (evidence) {
      setModalState({ isOpen: true, title, evidence });
    }
  };

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data || !isEngineOk(data)) {
    const timeoutMsg = error instanceof Error && error.message.includes('timeout')
      ? 'The analysis took too long. Try uploading a smaller keyword file.'
      : getEngineErrorMessage(data, 'Upload Magnet (keywords) and/or BlackBox (products) to proceed.');
      
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Demand Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-md">{timeoutMsg}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.data?.results || {};
  const concentration = results.concentration_score as MetricWithEvidence | undefined;
  const largestDemand = results.largest_demand_segment as MetricWithEvidence | undefined;
  const recommendedEntry = results.recommended_entry as MetricWithEvidence | undefined;
  const undervalued = results.most_undervalued_theme as MetricWithEvidence | undefined;
  const monetized = results.best_monetized_theme as MetricWithEvidence | undefined;
  
  const diagnostics = results.classification_diagnostics;
  const isDegraded = diagnostics?.is_degraded;
  
  const db: SegmentRow[] = results.demand_opportunity_database || [];

  const columns: ColumnDef<SegmentRow>[] = [
    { header: 'Theme', cell: (r) => <span className="font-semibold text-foreground/90">{r.segment}</span> },
    { header: 'Demand Share', cell: (r) => <Badge variant="outline">{Number(r.demand_share).toFixed(1)}%</Badge> },
    { header: 'Revenue Share', cell: (r) => <span className="font-medium">{Number(r.revenue_share).toFixed(1)}%</span> },
    { header: 'Competition', cell: (r) => r.segment === "Other" ? "-" : Number(r.competition_index).toFixed(1) },
    { header: 'Opportunity Score', cell: (r) => r.segment === "Other" ? "-" : <span className="font-bold text-primary">{Number(r.opportunity_score).toFixed(1)}</span> },
    { header: 'Recommendation', cell: (r) => {
        const rec = r.recommendation || 'N/A';
        const color = rec === 'Prime Entry' ? 'text-success' : rec === 'Strong Opportunity' ? 'text-success/80' : rec === 'Low Priority' ? 'text-muted-foreground' : 'text-warning';
        return <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{rec}</span>;
      }
    },
    { header: 'Evidence', cell: (r) => (
      <button onClick={() => openEvidence(`Segment: ${r.segment}`, r.evidence)} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors font-medium">
        View Proof
      </button>
    ), className: 'text-right' }
  ];

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      
      <EvidenceModal 
        isOpen={modalState.isOpen} 
        onClose={() => setModalState(s => ({ ...s, isOpen: false }))} 
        title={modalState.title} 
        evidence={modalState.evidence} 
      />

      <PageHeader 
        badge="Demand Intelligence"
        title="Market Demand Strength"
        description="Analyzes consumer search behavior to identify where true demand lies versus where revenue is actually being captured."
      />

      <ExecutiveNarrative content={results.executive_summary || `Demand analysis reveals ${largestDemand?.name || 'various themes'} as the largest driver of search volume, while ${recommendedEntry?.name || 'underserved segments'} offer the highest entry opportunity.`} />

      {isDegraded && (
        <Card className="border-warning bg-warning/5 border-l-4 shadow-sm mb-12">
          <CardContent className="p-6 flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-warning shrink-0 mt-1" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-warning tracking-tight">Demand Intelligence Quality Warning</h3>
              <p className="text-sm text-warning/90 font-medium">
                Theme extraction confidence is critically low ({diagnostics?.confidence_level || 'Critical'}).
              </p>
              <div className="bg-warning/10 p-3 rounded-md border border-warning/20 inline-block mt-2">
                <p className="text-sm text-warning font-semibold">
                  Reason: <span className="font-bold">{diagnostics?.other_share_pct || 'High'}%</span> of demand could not be assigned to a specific theme.
                </p>
              </div>
              <p className="text-sm text-warning/80 mt-2 font-semibold">
                Recommendations should be treated as directional rather than definitive.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <PageSection title="Strategic Demand Metrics" icon={Activity}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div onClick={() => openEvidence('Largest Demand Segment', largestDemand?.evidence)}>
            <KPICard 
              label="Largest Segment" 
              value={largestDemand?.name || 'N/A'} 
              implication={largestDemand?.business_implication || `Commands ${Number(largestDemand?.demand_share || 0).toFixed(1)}% of demand`}
              confidence={parseConfidence(largestDemand?.confidence)}
              icon={Target}
            />
          </div>
          <div onClick={() => openEvidence('Highest Efficiency', monetized?.evidence)}>
             <KPICard 
              label="Highest Efficiency" 
              value={monetized?.name || 'N/A'} 
              implication={monetized?.business_implication || `Efficiency Lift: ${Number(monetized?.lift || 0).toFixed(2)}x`}
              confidence={parseConfidence(monetized?.confidence)}
              icon={TrendingUp}
            />
          </div>
          <div onClick={() => openEvidence('Demand-Revenue Gap', undervalued?.evidence)}>
            <KPICard 
              label="Undervalued Theme" 
              value={undervalued?.name || 'N/A'} 
              implication={undervalued?.business_implication || `Gap: ${Number(undervalued?.gap || 0).toFixed(1)}%`}
              confidence={parseConfidence(undervalued?.confidence)}
              icon={TrendingDown}
            />
          </div>
          <div onClick={() => openEvidence('Best Entry Opportunity', recommendedEntry?.evidence)}>
            <KPICard 
              label="Best Entry" 
              value={recommendedEntry?.name || 'N/A'} 
              implication={recommendedEntry?.why_ranked_1?.join(' ') || recommendedEntry?.business_implication || `Opportunity Score: ${Number(recommendedEntry?.score || 0).toFixed(1)}/100`}
              confidence={parseConfidence(recommendedEntry?.confidence)}
              icon={Rocket}
            />
          </div>
        </div>
      </PageSection>

      <PageSection title="Opportunity Database" icon={Layers}>
        <DataTable 
          data={db} 
          columns={columns} 
          keyExtractor={(r) => r.segment}
        />
        {(diagnostics?.confidence_level === 'Low' || diagnostics?.confidence_level === 'Critical') && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger/20 rounded text-danger font-medium text-sm text-center">
            Low confidence ranking due to incomplete theme classification. Treat recommendations as directional rather than definitive.
          </div>
        )}
      </PageSection>

    </div>
  );
}
