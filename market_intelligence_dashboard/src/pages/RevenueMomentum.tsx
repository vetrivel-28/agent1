import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { EvidenceDrawer, type MetricEvidence } from '../components/ui/EvidenceDrawer';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Loader2, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

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

export default function RevenueMomentum() {
  const [selectedGroupKey, setSelectedGroupKey] = useState<keyof RevenueMomentumPayload['metrics'] | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<MetricEvidence | null>(null);

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



  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium animate-pulse tracking-wide">Generating Competitive Intelligence...</p>
      </div>
    );
  }

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

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-revenue">
      <div className="flex flex-col gap-3 border-b border-border/50 pb-6">
        <Badge className="bg-primary/10 text-primary border-primary/20 w-fit font-mono text-[10px] tracking-widest uppercase rounded-sm px-2.5 py-1">
          Live Momentum Feed
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Revenue Momentum</h1>
        <p className="text-muted-foreground text-base max-w-2xl">Track growth velocity, emerging threats, and shifting market dominance.</p>
      </div>

      <section className="pt-1">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground uppercase">Total Brands</p><p className="text-xl font-bold">{rm.momentum_ledger.length}</p></div>
          <div className="rounded-md border border-success/20 bg-success/5 p-3"><p className="text-xs text-muted-foreground uppercase">Dominant Leaders</p><p className="text-xl font-bold">{rm.metrics.market_leaders.count}</p></div>
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3"><p className="text-xs text-muted-foreground uppercase">Growth Challengers</p><p className="text-xl font-bold">{rm.metrics.emerging_brands.count}</p></div>
          <div className="rounded-md border border-warning/20 bg-warning/5 p-3"><p className="text-xs text-muted-foreground uppercase">Revenue Heavyweights</p><p className="text-xl font-bold">{rm.metrics.premium_brands.count}</p></div>
          <div className="rounded-md border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground uppercase">Long Tail Players</p><p className="text-xl font-bold">{rm.metrics.niche_players.count}</p></div>
          <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground uppercase">Top 5 Share</p><p className="text-xl font-bold">{Number(rm.concentration?.top_5_share || 0).toFixed(1)}%</p></div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Top 5 brands control {Number(rm.concentration?.top_5_share || 0).toFixed(1)}% of category revenue.
        </p>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-tight">Market Momentum Matrix</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupCards.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`border rounded-xl p-5 flex flex-col h-full transition-all text-left ${g.meta.cardClass}`}
              onClick={() => setSelectedGroupKey(g.key)}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">{g.meta.title}</h3>
                  <p className="text-xs opacity-80 uppercase tracking-wider font-mono mt-0.5">{g.meta.ruleLabel}</p>
                </div>
                <div className="text-3xl font-black font-mono">{g.block.count}</div>
              </div>
              <div className="mt-auto pt-4 border-t border-current/10">
                <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2 font-mono">Top Brands</p>
                <div className="flex flex-wrap gap-2">
                  {(g.block.preview_brands || []).slice(0, 3).map((b) => (
                    <span key={b} className="text-xs font-semibold bg-background/50 backdrop-blur px-2 py-1 rounded-md border border-current/20 truncate max-w-[120px]">
                      {b}
                    </span>
                  ))}
                  {(g.block.preview_brands || []).length === 0 && <span className="text-xs opacity-50 italic">None</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="pt-1">
        <Card className="border-border/50 bg-card/50 glass">
          <CardContent className="pt-6">
            <div className="mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground font-mono">Momentum Ledger</h3>
            </div>
            <DataTable
              columns={ledgerColumns}
              data={rm.momentum_ledger.slice().sort((a, b) => Number(b.revenue_share || 0) - Number(a.revenue_share || 0) || Number(b.momentum_score || 0) - Number(a.momentum_score || 0))}
              pageSize={15}
              rowKey={(row, i) => `${row.brand}-${row.row_number ?? i}`}
              onRowClick={(row) => setSelectedEvidence(row.evidence || null)}
            />
          </CardContent>
        </Card>
      </section>

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

      <EvidenceDrawer evidence={selectedEvidence} onClose={() => setSelectedEvidence(null)} />
    </motion.div>
  );
}
