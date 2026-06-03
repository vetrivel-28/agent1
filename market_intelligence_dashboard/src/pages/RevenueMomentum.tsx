import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { EvidenceDrawer, type MetricEvidence } from '../components/ui/EvidenceDrawer';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { formatCurrency } from '../utils/cn';
import { AlertCircle, Activity, TrendingUp, DollarSign, Crown, Network, Star, ActivitySquare, Download } from 'lucide-react';
import { motion } from 'framer-motion';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { KPICard } from '../components/ui/KPICard';
import { DashboardSkeleton } from '../components/ui/Skeletons';

type LedgerRow = {
  row_number?: number;
  brand: string;
  momentum_score: number;
  primary_engine?: string;
  classification: string;
  parent_revenue: number;
  revenue_share: number;
  market_power_score?: number;
  revenue_percentile?: number;
  sales_percentile?: number;
  units_sold?: number;
  evidence?: MetricEvidence;
};

type InsightItem = {
  title: string;
  observation: string;
  why_it_matters: string;
  potential_opportunity: string;
  evidence: Record<string, string>;
};

type AiInsight = {
  insights: InsightItem[];
};

type SegmentBlock = {
  count: number;
  preview_brands?: string[];
  items: LedgerRow[];
  ai_insight?: AiInsight | string;
  evidence?: MetricEvidence;
};

type RevenueMomentumPayload = {
  total_market_revenue?: number;
  concentration?: {
    top_5_share?: number;
    top_10_share?: number;
    remaining_share?: number;
    hhi?: number;
  };
  metrics: {
    market_leaders: SegmentBlock;
    emerging_brands: SegmentBlock;
    premium_brands: SegmentBlock;
    niche_players: SegmentBlock;
  };
  momentum_ledger: LedgerRow[];
  classification_rules?: { rule_text?: string };
};

const GROUP_META: Record<string, { title: string; ruleLabel: string; cardClass: string }> = {
  market_leaders: {
    title: 'Dominant Leaders',
    ruleLabel: 'HIGH REVENUE  •  HIGH SALES',
    cardClass: 'border-success/30 bg-success/5 text-success',
  },
  emerging_brands: {
    title: 'Growth Challengers',
    ruleLabel: 'LOW REVENUE  •  HIGH SALES',
    cardClass: 'border-primary/30 bg-primary/5 text-primary',
  },
  premium_brands: {
    title: 'Revenue Heavyweights',
    ruleLabel: 'HIGH REVENUE  •  LOW SALES',
    cardClass: 'border-warning/30 bg-warning/5 text-warning',
  },
  niche_players: {
    title: 'Long Tail Players',
    ruleLabel: 'LOW REVENUE  •  LOW SALES',
    cardClass: 'border-border bg-muted/30 text-muted-foreground',
  },
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-success/80';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
}

function ScoreBar({ score, onClick }: { score: number; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 w-32 text-left">
      <span className={`font-mono text-xs font-bold w-8 text-right ${scoreColor(score)}`}>{score.toFixed(0)}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 60 ? 'bg-success' : score >= 40 ? 'bg-warning' : 'bg-danger'}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </button>
  );
}

function exportToCSV(filename: string, rows: LedgerRow[]) {
  const headers = ['Brand Name', 'Revenue', 'Units Sold', 'Market Share %', 'Classification'];
  const csvContent = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.brand}"`,
      r.parent_revenue || 0,
      r.units_sold || 0,
      r.revenue_share || 0,
      `"${r.classification}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function KPIDrillDownModal({
  isOpen, onClose, title, explanation, items
}: { isOpen: boolean; onClose: () => void; title: string; explanation: string; items: LedgerRow[] }) {
  const brandCount = items.length;
  const totalRev = items.reduce((s, r) => s + (r.parent_revenue || 0), 0);
  const totalUnits = items.reduce((s, r) => s + (r.units_sold || 0), 0);
  const totalShare = items.reduce((s, r) => s + (r.revenue_share || 0), 0);

  const columns: Column<LedgerRow>[] = [
    { header: 'Brand Name', accessorKey: 'brand', cell: (r) => <span className="font-bold">{r.brand}</span> },
    { header: 'Revenue', accessorKey: 'parent_revenue', cell: (r) => formatCurrency(r.parent_revenue || 0) },
    { header: 'Units Sold', accessorKey: 'units_sold', cell: (r) => (r.units_sold || 0).toLocaleString() },
    { header: 'Market Share %', accessorKey: 'revenue_share', cell: (r) => <span className="font-mono">{Number(r.revenue_share || 0).toFixed(1)}%</span> },
    { header: 'Classification', accessorKey: 'classification', cell: (r) => <Badge variant="outline">{r.classification}</Badge> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-4xl">
      <div className="space-y-6">
        <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 text-sm">
          <p className="text-foreground leading-relaxed">
            <span className="font-bold block mb-1 uppercase tracking-widest text-[10px] text-primary">Classification Criteria</span>
            {explanation}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Brands Count</p>
            <p className="text-xl font-mono font-bold text-foreground">{brandCount.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Combined Revenue</p>
            <p className="text-xl font-mono font-bold text-success">{formatCurrency(totalRev)}</p>
          </div>
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Combined Units Sold</p>
            <p className="text-xl font-mono font-bold text-primary">{totalUnits.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Combined Market Share</p>
            <p className="text-xl font-mono font-bold text-foreground">{totalShare.toFixed(1)}%</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => exportToCSV(`${title.replace(/ /g, '_')}_Brands.csv`, items)}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="border border-border/50 rounded-lg bg-card">
          <DataTable 
            columns={columns} 
            data={items} 
            pageSize={8} 
            searchable={true} 
            rowKey={(r) => r.brand}
          />
        </div>
      </div>
    </Modal>
  );
}

export default function RevenueMomentum() {
  const [selectedGroupKey, setSelectedGroupKey] = useState<keyof RevenueMomentumPayload['metrics'] | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<MetricEvidence | null>(null);
  const [drillDownConfig, setDrillDownConfig] = useState<{ title: string; explanation: string; items: LedgerRow[] } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['revenue-momentum'],
    queryFn: () => api.getRevenueMomentum(500),
  });

  const rm: RevenueMomentumPayload = data?.data?.results?.revenue_momentum || {
    total_market_revenue: 0,
    concentration: { top_5_share: 0, top_10_share: 0, remaining_share: 0, hhi: 0 },
    metrics: {
      market_leaders: { count: 0, items: [] },
      emerging_brands: { count: 0, items: [] },
      premium_brands: { count: 0, items: [] },
      niche_players: { count: 0, items: [] },
    },
    momentum_ledger: [],
  };

  const groupCards = useMemo(
    () =>
      (Object.keys(rm.metrics) as Array<keyof RevenueMomentumPayload['metrics']>).map((k) => ({
        key: k,
        meta: GROUP_META[k],
        block: rm.metrics[k],
      })),
    [rm.metrics]
  );



  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Revenue Momentum Unavailable</h2>
          <p className="text-danger/80">{getEngineErrorMessage(data, 'Requires BlackBox with Parent Level Revenue and Brand columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const selectedGroup = selectedGroupKey ? rm.metrics[selectedGroupKey] : null;
  const selectedGroupMeta = selectedGroupKey ? GROUP_META[selectedGroupKey] : null;

  const drillColumns: Column<LedgerRow>[] = [
    { header: 'Brand', accessorKey: 'brand', cell: (r) => <span className="font-semibold">{r.brand}</span> },
    { header: 'Parent Level Revenue', accessorKey: 'parent_revenue', cell: (r) => `$${Number(r.parent_revenue || 0).toLocaleString()}` },
    { header: 'Market Share %', accessorKey: 'revenue_share', cell: (r) => `${Number(r.revenue_share || 0).toFixed(2)}%` },
    { header: 'Market Power', accessorKey: 'market_power_score', cell: (r) => <span className="font-mono text-muted-foreground">{Number(r.market_power_score || 0).toFixed(2)}</span> },
    { header: 'Revenue Percentile', accessorKey: 'revenue_percentile', cell: (r) => <span className="font-mono text-muted-foreground">{Number((r as any).revenue_percentile || 0).toFixed(1)}</span> },
    { header: 'Sales Percentile', accessorKey: 'sales_percentile', cell: (r) => <span className="font-mono text-muted-foreground">{Number((r as any).sales_percentile || 0).toFixed(1)}</span> },
    { header: 'Momentum Score', accessorKey: 'momentum_score', cell: (r) => <ScoreBar score={Number(r.momentum_score || 0)} onClick={() => setSelectedEvidence(r.evidence || null)} /> },
    { header: 'Growth Driver', accessorKey: 'primary_engine', cell: (r) => <Badge variant="outline">{r.primary_engine || 'N/A'}</Badge> },
    { header: 'Classification', accessorKey: 'classification', cell: (r) => <Badge variant="outline">{r.classification}</Badge> },
    { header: 'View Calculation / Evidence', accessorKey: 'evidence', cell: (r) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedEvidence(r.evidence || null); }}>View</Button> },
  ];

  const ledgerColumns: Column<LedgerRow>[] = [
    { header: '#', accessorKey: 'row_number', cell: (r) => <span className="font-mono text-muted-foreground">{r.row_number ?? '-'}</span> },
    { header: 'Ticker / Brand', accessorKey: 'brand', cell: (r) => <span className="font-bold text-foreground uppercase tracking-wide">{r.brand}</span> },
    { header: 'Market Share %', accessorKey: 'revenue_share', cell: (r) => <span className="font-mono">{Number(r.revenue_share || 0).toFixed(2)}%</span> },
    { header: 'Momentum', accessorKey: 'momentum_score', cell: (r) => <ScoreBar score={Number(r.momentum_score || 0)} onClick={(e) => { e?.stopPropagation(); setSelectedEvidence(r.evidence || null); }} /> },
    { header: 'Market Power', accessorKey: 'market_power_score', cell: (r) => <span className="font-mono">{Number(r.market_power_score || 0).toFixed(2)}</span> },
    { header: 'Growth Driver', accessorKey: 'primary_engine', cell: (r) => <Badge variant="outline">{r.primary_engine || 'N/A'}</Badge> },
    { header: 'Classification', accessorKey: 'classification', cell: (r) => <Badge variant="outline">{r.classification}</Badge> },
    { header: 'Calculation / Evidence', accessorKey: 'evidence', cell: (r) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedEvidence(r.evidence || null); }}>View</Button> },
  ];

  const narrative = `The momentum algorithm tracked ${rm.momentum_ledger.length} brands in the market. There are ${rm.metrics.market_leaders.count} Dominant Leaders driving the category, while ${rm.metrics.emerging_brands.count} Growth Challengers show high sales velocity despite lower total revenue. Top 5 brands control ${Number(rm.concentration?.top_5_share || 0).toFixed(1)}% of category revenue.`;

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      
      <PageHeader 
        badge="Live Momentum Feed"
        title="Revenue Momentum"
        description="Track growth velocity, emerging threats, and shifting market dominance."
      />

      <ExecutiveNarrative content={narrative} />

      <PageSection title="1. Category Momentum Posture" icon={Activity}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          <KPICard 
            label="Total Brands Tracked"
            value={rm.momentum_ledger.length}
            icon={ActivitySquare}
            onClick={() => setDrillDownConfig({
              title: "Total Brands Tracked",
              explanation: "All active brands currently tracked and analyzed within the momentum ledger.",
              items: rm.momentum_ledger
            })}
          />
          <KPICard 
            label="Dominant Leaders"
            value={rm.metrics.market_leaders.count}
            implication="High Revenue, High Sales"
            icon={Crown}
            onClick={() => setDrillDownConfig({
              title: "Dominant Leaders",
              explanation: "High Revenue + High Sales. These brands dominate both demand and revenue generation and typically control the largest share of the market.",
              items: rm.metrics.market_leaders.items || []
            })}
          />
          <KPICard 
            label="Growth Challengers"
            value={rm.metrics.emerging_brands.count}
            implication="Low Revenue, High Sales"
            icon={TrendingUp}
            onClick={() => setDrillDownConfig({
              title: "Growth Challengers",
              explanation: "Low Revenue + High Sales. Strong demand but weaker revenue capture. Potential future leaders.",
              items: rm.metrics.emerging_brands.items || []
            })}
          />
          <KPICard 
            label="Revenue Heavyweights"
            value={rm.metrics.premium_brands.count}
            implication="High Revenue, Low Sales"
            icon={DollarSign}
            onClick={() => setDrillDownConfig({
              title: "Revenue Heavyweights",
              explanation: "High Revenue + Low Sales. Premium brands generating strong revenue despite lower unit sales.",
              items: rm.metrics.premium_brands.items || []
            })}
          />
          <KPICard 
            label="Long Tail Players"
            value={rm.metrics.niche_players.count}
            implication="Low Revenue, Low Sales"
            icon={Network}
            onClick={() => setDrillDownConfig({
              title: "Long Tail Players",
              explanation: "Low Revenue + Low Sales. Smaller niche participants with limited market impact.",
              items: rm.metrics.niche_players.items || []
            })}
          />
        </div>
      </PageSection>

      <PageSection title="2. Market Momentum Matrix" icon={Star}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupCards.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`border rounded-xl p-6 flex flex-col h-full transition-all text-left bg-card hover:border-primary/50 shadow-sm`}
              onClick={() => setSelectedGroupKey(g.key)}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-bold text-lg text-foreground">{g.meta.title}</h3>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mt-1">{g.meta.ruleLabel}</p>
                </div>
                <div className={`text-4xl font-black font-mono ${g.meta.cardClass.split(' ')[2]}`}>{g.block.count}</div>
              </div>
              <div className="mt-auto pt-4 border-t border-border/40 w-full">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-mono">Top Brands in Quadrant</p>
                <div className="flex flex-wrap gap-2">
                  {(g.block.preview_brands || []).slice(0, 3).map((b) => (
                    <span key={b} className="text-xs font-semibold bg-muted/30 px-2 py-1 rounded border border-border/50 truncate max-w-[120px]">
                      {b}
                    </span>
                  ))}
                  {(g.block.preview_brands || []).length === 0 && <span className="text-xs opacity-50 italic">None</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PageSection>

      <PageSection title="3. Full Momentum Ledger" icon={ActivitySquare}>
        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="pt-6">
            <DataTable
              columns={ledgerColumns}
              data={rm.momentum_ledger.slice().sort((a, b) => Number(b.revenue_share || 0) - Number(a.revenue_share || 0) || Number(b.momentum_score || 0) - Number(a.momentum_score || 0))}
              pageSize={15}
              rowKey={(row, i) => `${row.brand}-${row.row_number ?? i}`}
              onRowClick={(row) => setSelectedEvidence(row.evidence || null)}
            />
          </CardContent>
        </Card>
      </PageSection>

      <Drawer
        isOpen={Boolean(selectedGroupKey && selectedGroupMeta && selectedGroup)}
        onClose={() => setSelectedGroupKey(null)}
        title={selectedGroupMeta ? `${selectedGroupMeta.title} (${selectedGroup?.count || 0})` : 'Momentum Group'}
      >
        {selectedGroup && selectedGroupMeta && (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/20 p-5 space-y-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border/50 pb-2 mb-2">{selectedGroupMeta.ruleLabel}</p>
              
              {!selectedGroup.ai_insight ? (
                <div className="text-sm italic text-muted-foreground">AI Insight Unavailable</div>
              ) : typeof selectedGroup.ai_insight === 'string' ? (
                <div className="text-sm whitespace-pre-line leading-relaxed">{selectedGroup.ai_insight}</div>
              ) : (
                <div className="space-y-4 text-sm">
                  {selectedGroup.ai_insight.insights?.map((insight: any, idx: number) => (
                    <div key={idx} className="bg-card border border-border/60 rounded-lg overflow-hidden shadow-sm">
                      <div className="bg-muted/40 px-4 py-3 border-b border-border/50">
                        <h4 className="font-semibold text-foreground tracking-wide text-xs">{insight.title}</h4>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="bg-primary/5 border border-primary/20 rounded p-3 text-sm font-mono flex flex-col gap-1">
                          {Object.entries(insight.evidence || {}).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-center text-primary">
                              <span className="opacity-70">{key}:</span>
                              <span className="font-semibold">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1 block">Observation</span>
                          <p className="text-foreground leading-relaxed">{insight.observation}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1 block">Why It Matters</span>
                          <p className="text-foreground leading-relaxed">{insight.why_it_matters}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1 block">Potential Opportunity</span>
                          <p className="text-foreground leading-relaxed">{insight.potential_opportunity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {(!selectedGroup.ai_insight.insights || selectedGroup.ai_insight.insights.length === 0) && (
                    <div className="text-muted-foreground text-center py-6 italic border rounded-lg bg-muted/20">
                      The available data does not provide enough evidence to generate insights.
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex gap-2 pt-2 mt-4 border-t border-border/50">
                <Button size="sm" variant="outline" onClick={() => setSelectedEvidence(selectedGroup.evidence || null)}>
                  View Audit Trail
                </Button>
              </div>
            </div>

            <DataTable
              columns={drillColumns}
              data={selectedGroup.items.slice().sort((a, b) => Number(b.revenue_share || 0) - Number(a.revenue_share || 0) || Number(b.momentum_score || 0) - Number(a.momentum_score || 0))}
              pageSize={20}
              rowKey={(row, i) => `${row.brand}-${row.row_number ?? i}`}
              onRowClick={(row) => setSelectedEvidence(row.evidence || null)}
            />
          </div>
        )}
      </Drawer>

      <KPIDrillDownModal 
        isOpen={Boolean(drillDownConfig)} 
        onClose={() => setDrillDownConfig(null)} 
        title={drillDownConfig?.title || ''} 
        explanation={drillDownConfig?.explanation || ''} 
        items={drillDownConfig?.items || []} 
      />
      <EvidenceDrawer evidence={selectedEvidence} onClose={() => setSelectedEvidence(null)} />
    </div>
  );
}
