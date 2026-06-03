import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { Modal } from '../components/ui/Modal';
import {
  AlertCircle, Loader2, Target, Rocket, Layers, TrendingDown,
  TrendingUp, Activity, AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';

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
  score_breakdown?: any;
  recommendation: string;
  evidence: Evidence;
};

// --- Evidence Modal Component ---
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
            <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Source Dataset</span>
            <span className="font-mono font-medium">{evidence.source_dataset}</span>
          </div>
          <div className="border border-border/50 rounded-lg p-3 bg-card">
            <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Source Columns</span>
            <span className="font-mono font-medium">{evidence.source_columns.join(', ')}</span>
          </div>
        </div>

        <div className="border border-border/50 rounded-lg p-3 bg-card">
          <span className="text-xs font-bold uppercase text-muted-foreground block mb-2">Mathematical Formula</span>
          <code className="bg-muted/30 px-2 py-1 rounded text-primary font-bold">{evidence.formula}</code>
        </div>

        <div className="border border-border/50 rounded-lg p-3 bg-card">
          <span className="text-xs font-bold uppercase text-muted-foreground block mb-2">Calculation Steps</span>
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

// --- Helper Components ---
function StrategicCard({ title, metricName, metricValue, implication, confidence, whyRanked1, icon: Icon, evidence, onEvidenceClick }: any) {
  const confColor = confidence === 'High' ? 'bg-success/20 text-success' : confidence === 'Medium' ? 'bg-warning/20 text-warning' : confidence === 'Low' ? 'bg-danger/20 text-danger' : 'bg-danger/40 text-danger font-bold';
  return (
    <Card 
      className="bg-card glass-card hover:-translate-y-1 transition-transform border-border/50 cursor-pointer"
      onClick={() => onEvidenceClick(title, evidence)}
    >
      <CardContent className="p-6 flex flex-col h-full relative">
        <div className="flex justify-between items-start mb-4">
          <div className="p-2 bg-primary/10 text-primary rounded-lg"><Icon className="w-6 h-6" /></div>
          {confidence && <Badge variant="outline" className={`text-[10px] uppercase border-none ${confColor}`}>{confidence} Conf</Badge>}
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
        <h3 className="text-xl font-bold mb-1">{metricName}</h3>
        {metricValue && <p className="text-sm font-semibold text-primary mb-3">{metricValue}</p>}
        {whyRanked1 && whyRanked1.length > 0 && (
           <div className="mb-3 space-y-1 bg-muted/5 p-2 rounded border border-border/30">
             <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Why Ranked #1</p>
             <ul className="text-[11px] space-y-1 font-mono text-foreground/80">
               {whyRanked1.map((w: string, i: number) => <li key={i}>{w}</li>)}
             </ul>
           </div>
        )}
        <div className="mt-auto border-t border-border/50 pt-3 bg-muted/10 p-3 rounded-md">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Business Implication</p>
          <p className="text-sm text-foreground/90 leading-relaxed font-medium">
            {implication}
          </p>
        </div>
      </CardContent>
    </Card>
  );
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

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3 theme-demand">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Analyzing strategic opportunities…</p>
      </div>
    );
  }

  if (isError || !data || !isEngineOk(data)) {
    const timeoutMsg = error instanceof Error && error.message.includes('timeout')
      ? 'The analysis took too long. Try uploading a smaller keyword file.'
      : getEngineErrorMessage(data, 'Upload Magnet (keywords) and/or BlackBox (products) to proceed.');
      
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10 theme-demand">
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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-demand">
      
      <EvidenceModal 
        isOpen={modalState.isOpen} 
        onClose={() => setModalState(s => ({ ...s, isOpen: false }))} 
        title={modalState.title} 
        evidence={modalState.evidence} 
      />

      {isDegraded && (
        <Card className="border-warning bg-warning/5 border-l-4 shadow-sm mb-6">
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

      {results.executive_summary && (
        <Card className="border-border/50 bg-card mb-6 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold tracking-tight">Executive Market Summary</h3>
            </div>
            <p className="text-foreground/80 leading-relaxed font-medium">
              {results.executive_summary}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30 mb-3 border-none">Evidence-Backed Strategic Opportunity</Badge>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Demand Intelligence</h1>
        </div>
        <div 
          className="text-right cursor-pointer hover:bg-primary/5 p-3 rounded-xl transition-colors border border-transparent hover:border-primary/20"
          onClick={() => openEvidence('Concentration Score (HHI)', concentration?.evidence)}
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">Concentration Score</p>
          <div className="flex items-center justify-end gap-2">
            <p className="text-3xl font-black text-primary">{Number(concentration?.value || 0).toFixed(1)}</p>
            <Activity className="w-5 h-5 text-primary opacity-50" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StrategicCard 
          title="Largest Demand Segment" 
          metricName={largestDemand?.name || 'N/A'} 
          metricValue={largestDemand ? `Commands ${Number(largestDemand.demand_share || 0).toFixed(1)}% of demand` : undefined}
          implication={largestDemand?.business_implication || 'No actionable implications available.'}
          confidence={largestDemand?.confidence}
          icon={Target}
          evidence={largestDemand?.evidence}
          onEvidenceClick={openEvidence}
        />
        <StrategicCard 
          title="Highest Revenue Efficiency" 
          metricName={monetized?.name || 'N/A'} 
          metricValue={monetized ? `Efficiency Lift: ${Number(monetized.lift || 0).toFixed(2)}x` : undefined}
          implication={monetized?.business_implication || 'No actionable implications available.'}
          confidence={monetized?.confidence}
          icon={TrendingUp}
          evidence={monetized?.evidence}
          onEvidenceClick={openEvidence}
        />
        <StrategicCard 
          title="Largest Demand-Revenue Gap" 
          metricName={undervalued?.name || 'N/A'} 
          metricValue={undervalued ? `Gap: ${Number(undervalued.gap || 0).toFixed(1)}%` : undefined}
          implication={undervalued?.business_implication || 'No actionable implications available.'}
          confidence={undervalued?.confidence}
          icon={TrendingDown}
          evidence={undervalued?.evidence}
          onEvidenceClick={openEvidence}
        />
        <StrategicCard 
          title="Best Entry Opportunity" 
          metricName={recommendedEntry?.name || 'N/A'} 
          metricValue={recommendedEntry ? `Opportunity Score: ${Number(recommendedEntry.score || 0).toFixed(1)}/100` : undefined}
          implication={recommendedEntry?.business_implication || 'No actionable implications available.'}
          confidence={recommendedEntry?.confidence}
          whyRanked1={recommendedEntry?.why_ranked_1}
          icon={Rocket}
          evidence={recommendedEntry?.evidence}
          onEvidenceClick={openEvidence}
        />
      </div>

      <section className="pt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">Opportunity Matrix</h2>
          </div>
          <Badge variant="outline" className="text-xs bg-card">Sorted by Opportunity Score</Badge>
        </div>
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
      </section>

    </motion.div>
  );
}
