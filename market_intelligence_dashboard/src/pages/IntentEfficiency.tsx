import { useMemo, useState, useCallback, Component } from 'react';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Info, Loader2, TrendingDown, TrendingUp, X,
  Zap, Target, Search, Database, ChevronDown, ChevronUp, Activity
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { KPICard } from '../components/ui/KPICard';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function efficiencyColor(score: number): string {
  if (score >= 60) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

/** Precision-aware currency formatter — never shows misleadingly positive $0.00 */
function fmt$(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (n === 0) return '$0.00';
  if (n < 0.01) return `<$0.01 ($${n.toFixed(6)})`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function quadrantDotColor(q: string): string {
  switch (q) {
    case 'Demand Winner':    return '#a855f7';
    case 'Hidden Gem':       return '#10b981';
    case 'Friction Keyword': return '#ef4444';
    default:                 return '#64748b';
  }
}

function quadrantLabel(key: string): string {
  switch (key) {
    case 'demand': return 'Demand Winners';
    case 'friction': return 'Friction Keywords';
    case 'hidden': return 'Hidden Gems';
    case 'low': return 'Low Priority';
    default: return 'All';
  }
}

const valOrMissing = (val: any, formatFn?: (v: any) => any) => {
  if (val == null || val === '') return (
    <span className="text-[10px] uppercase font-bold text-muted-foreground/60 italic">Not Available In Source Data</span>
  );
  return formatFn ? formatFn(val) : val;
};

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; msg: string }
class IntentErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }
  static getDerivedStateFromError(e: unknown): EBState {
    return { hasError: true, msg: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Page Error</h2>
          <p className="text-red-500/80 font-mono text-sm">{this.state.msg}</p>
          <button className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20"
            onClick={() => this.setState({ hasError: false, msg: '' })}>Retry</button>
        </CardContent>
      </Card>
    );
  }
}

// ─── Centered Modal ───────────────────────────────────────────────────────────

function CenteredModal({ isOpen, onClose, title, children }: {
  isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="relative z-50 w-full max-w-2xl max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0 sticky top-0 bg-background z-10">
          <h2 className="text-lg font-bold truncate max-w-[90%]">{title}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </motion.div>
    </div>
  );
}

// ─── Evidence body — renders structured evidence, never raw JSON ──────────────

function EvidenceBody({ ev }: { ev: Record<string, any> }) {
  if (!ev) return <p className="text-sm text-muted-foreground">No evidence available.</p>;

  const thresholds: Record<string, any> = ev.thresholds ?? {};
  const exampleCalc: Record<string, any> = ev.example_calculation ?? {};
  const items: any[] = ev.items ?? [];
  const calcSteps: string[] = ev.calculation_steps ?? [];

  return (
    <div className="space-y-4 text-sm">
      {/* Header metric */}
      {ev.metric_name && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">{ev.metric_name}</p>
          <p className="text-2xl font-black font-mono">
            {typeof ev.metric_value === 'number' ? ev.metric_value.toLocaleString() : String(ev.metric_value ?? '—')}
          </p>
        </div>
      )}

      {/* Source */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border border-border rounded-xl bg-muted/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Source Dataset</p>
          <p className="font-mono font-semibold">{ev.source_dataset ?? 'Magnet Keyword Dataset'}</p>
        </div>
        <div className="p-3 border border-border rounded-xl bg-muted/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Source Columns</p>
          <p className="font-mono font-semibold text-xs">{(ev.source_columns ?? []).join(', ') || '—'}</p>
        </div>
      </div>

      {/* Formula */}
      {ev.formula && ev.formula !== '—' && (
        <div className="p-3 bg-muted/20 rounded-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Formula</p>
          <p className="text-xs font-mono leading-relaxed text-foreground/80">{ev.formula}</p>
        </div>
      )}

      {/* Thresholds — structured, not JSON */}
      {Object.keys(thresholds).length > 0 && (
        <div className="p-3 border border-border rounded-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Thresholds</p>
          <ul className="space-y-1">
            {Object.entries(thresholds).map(([k, v], i) => (
              <li key={i} className="text-xs font-mono flex gap-2">
                <span className="text-primary">•</span>
                <span className="text-muted-foreground">{k.replace(/_/g, ' ')}:</span>
                <span className="font-semibold">{String(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Row counts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Rows Included</p>
          <p className="font-bold mt-0.5">{ev.rows_included?.toLocaleString() ?? ev.rows_matched?.toLocaleString() ?? '—'}</p>
        </div>
        <div className="p-3 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Rows Excluded</p>
          <p className="font-bold mt-0.5">{ev.rows_excluded?.toLocaleString() ?? '—'}</p>
        </div>
      </div>
      {ev.excluded_reason && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">{ev.excluded_reason}</p>
      )}

      {/* Calculation steps */}
      {calcSteps.length > 0 && (
        <div className="p-3 bg-muted/20 rounded-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Calculation Steps</p>
          <ol className="space-y-1">
            {calcSteps.map((step, i) => (
              <li key={i} className="text-xs font-mono text-foreground/80 flex gap-2">
                <span className="text-primary shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Example calculation — structured */}
      {Object.keys(exampleCalc).length > 0 && (
        <div className="p-3 border border-border rounded-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Example from Data</p>
          <div className="space-y-1">
            {Object.entries(exampleCalc).map(([k, v], i) => (
              <div key={i} className="flex justify-between items-center border-b border-border/30 pb-1 last:border-0">
                <span className="text-xs text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                <span className="text-xs font-mono font-semibold">{v == null ? '—' : typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interpretation */}
      {ev.interpretation && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">Interpretation</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{ev.interpretation}</p>
        </div>
      )}

      {/* Top examples list */}
      {items.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Top Examples ({items.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 pr-4 font-medium text-muted-foreground">Keyword</th>
                  <th className="text-right py-1.5 pr-4 font-medium text-muted-foreground">Search Vol</th>
                  <th className="text-right py-1.5 pr-4 font-medium text-muted-foreground">Rev/1K</th>
                  <th className="text-right py-1.5 font-medium text-muted-foreground">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 10).map((row: any, i: number) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-1 pr-4 max-w-[180px] truncate font-medium">{row.keyword ?? '—'}</td>
                    <td className="py-1 pr-4 text-right font-mono">{row.search_volume?.toLocaleString() ?? '—'}</td>
                    <td className="py-1 pr-4 text-right font-mono">{fmt$(row.revenue_per_1000_searches)}</td>
                    <td className="py-1 text-right font-mono">
                      <span className={efficiencyColor(row.efficiency_score ?? 0)}>{(row.efficiency_score ?? 0).toFixed(1)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Keyword Detail Modal Body ────────────────────────────────────────────────

function KeywordDetailBody({ k, benchmark }: { k: any; benchmark: number }) {
  const sv = Number(k.search_volume ?? 0);
  const ks = Number(k.keyword_revenue ?? k.revenue ?? 0);
  const rps = sv > 0 ? (ks / sv) * 1000 : 0;
  const eff = Number(k.efficiency_score ?? k.revenue_efficiency_index ?? 0);
  const dem = Number(k.demand_percentile ?? 0);
  const rec = Number(k.estimated_revenue_leakage ?? k.recoverable_revenue ?? 0);
  const gap = Number(k.efficiency_gap_per_1000_searches ?? k.gap ?? 0);
  const segment = k.segment ?? k.quadrant ?? 'Low Priority';
  const isFriction = segment === 'Friction Keyword';

  const rpsActual = Number(k.revenue_per_1000_searches ?? rps);

  // Segment rule explanation
  const segmentRules: Record<string, { rule: string; interpretation: string }> = {
    'Demand Winner':    { rule: 'Demand Percentile ≥ 60  AND  Revenue Efficiency Index ≥ 60', interpretation: 'High demand + strong revenue conversion — your best-performing keywords.' },
    'Friction Keyword': { rule: 'Demand Percentile ≥ 60  AND  Revenue Efficiency Index < 40', interpretation: 'High demand but weak revenue efficiency — optimization priority.' },
    'Hidden Gem':       { rule: 'Demand Percentile < 60  AND  Revenue Efficiency Index ≥ 60', interpretation: 'Lower demand but efficient conversion — niche strength.' },
    'Low Priority':     { rule: 'Demand Percentile < 60  AND  Revenue Efficiency Index < 40', interpretation: 'Low demand and low efficiency — lowest optimization priority.' },
  };
  const rule = segmentRules[segment] ?? { rule: 'See segment rules', interpretation: '' };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Keyword</p>
        <h3 className="text-xl font-bold">{k.keyword ?? '—'}</h3>
        <div className="flex gap-2 mt-2 flex-wrap">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${quadrantDotColor(segment)}20`, color: quadrantDotColor(segment) }}>
            {segment}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            {k.opportunity_level ?? '—'}
          </span>
        </div>
      </div>

      {/* Segment rule */}
      <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Segment Rule Matched</p>
        <p className="text-xs font-mono">{rule.rule}</p>
        <p className="text-xs text-muted-foreground mt-1">{rule.interpretation}</p>
      </div>

      {/* Source values grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Search Volume', value: sv.toLocaleString() },
          { label: 'Keyword Sales', value: fmt$(ks) },
          { label: 'Revenue Efficiency Index', value: `${eff.toFixed(2)} / 100` },
          { label: 'Demand Percentile', value: `${dem.toFixed(2)} / 100` },
        ].map((m, i) => (
          <div key={i} className="p-3 rounded-xl border border-border bg-muted/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-base font-bold mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Calculation steps */}
      <div className="p-3 bg-muted/20 rounded-xl space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Calculation Steps</p>
        <div className="space-y-1.5 text-xs font-mono">
          <div className="p-2 bg-background rounded border border-border/60">
            <span className="text-muted-foreground">Revenue / 1K Searches = Keyword Sales / Search Volume × 1000</span><br />
            <span className="text-primary">= {fmt$(ks)} / {sv.toLocaleString()} × 1000 = {fmt$(rpsActual)}</span>
          </div>
          <div className="p-2 bg-background rounded border border-border/60">
            <span className="text-muted-foreground">Revenue Efficiency Index = percentile_rank(Revenue / 1K Searches) × 100</span><br />
            <span className="text-primary">= {eff.toFixed(2)} / 100</span>
          </div>
          <div className="p-2 bg-background rounded border border-border/60">
            <span className="text-muted-foreground">Demand Percentile = percentile_rank(Search Volume) × 100</span><br />
            <span className="text-primary">= {dem.toFixed(2)} / 100</span>
          </div>
          {isFriction && (
            <div className="p-2 bg-red-500/5 border border-red-500/20 rounded">
              <span className="text-muted-foreground">Benchmark Revenue / 1K = 75th percentile = {fmt$(benchmark)}</span><br />
              <span className="text-muted-foreground">Efficiency Gap = max(0, {fmt$(benchmark)} − {fmt$(rpsActual)}) = {fmt$(gap)}</span><br />
              <span className="text-red-500 font-semibold">Estimated Friction Revenue Gap = Gap × Search Volume / 1000 = {fmt$(gap)} × {sv.toLocaleString()} / 1000 = {fmt$(rec)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Source */}
      <div className="text-xs text-muted-foreground space-y-0.5 border-t border-border/40 pt-3">
        <p>Source: Magnet Keyword Dataset</p>
        <p>Columns: Keyword Phrase · Search Volume · Keyword Sales</p>
      </div>

      {/* Recommendation */}
      <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Recommendation</p>
        <p className="text-sm leading-relaxed">
          {segment === 'Demand Winner' && 'Protect and optimize this keyword — it drives both demand and revenue efficiently.'}
          {segment === 'Friction Keyword' && `Diagnose listing conversion barriers. This keyword attracts significant traffic but underperforms the 75th-percentile benchmark by ${fmt$(gap)} per 1K searches, representing ${fmt$(rec)} in estimated friction revenue gap.`}
          {segment === 'Hidden Gem' && 'Increase visibility with targeted PPC or listing optimization — this keyword converts well but attracts below-median traffic.'}
          {segment === 'Low Priority' && 'Monitor only — low demand and low conversion efficiency. Re-evaluate if market conditions change.'}
        </p>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  title: string; value: any; sub?: string; icon: any;
  color?: string; bg?: string; onClick?: () => void;
}
function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', onClick }: KpiProps) {
  return (
    <Card className={cn('transition-all duration-200', onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-md')} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <div className={cn('p-2 rounded-lg border', bg)}><span className={color}>{icon}</span></div>
        </div>
        <p className={cn('text-2xl font-black leading-tight', color)}>{value}</p>
        {sub && <p className="text-[11px] font-medium text-muted-foreground mt-1.5 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Scatter Tooltip ──────────────────────────────────────────────────────────

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-w-[240px]">
      <p className="font-semibold text-xs leading-snug">{d.keyword || '—'}</p>
      <div className="border-t border-border/50 pt-1 space-y-0.5">
        <p className="text-muted-foreground text-xs">Search Volume: <span className="text-foreground font-mono">{valOrMissing(d.search_volume, (v: any) => v.toLocaleString())}</span></p>
        <p className="text-muted-foreground text-xs">Rev / 1K: <span className="text-foreground font-mono">{valOrMissing(d.revenue_per_1000_searches, fmt$)}</span></p>
        <p className="text-muted-foreground text-xs">Efficiency: <span className={cn('font-mono', efficiencyColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}</span></p>
        <p className="text-muted-foreground text-xs">Demand %: <span className="font-mono">{(d.demand_percentile ?? 0).toFixed(1)}</span></p>
        <span className="text-xs font-bold block mt-1" style={{ color: quadrantDotColor(d.quadrant) }}>{d.quadrant}</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function IntentEfficiencyInner() {
  // All hooks unconditionally at top — no early returns before these
  const [activeFilter, setActiveFilter] = useState<'all' | 'demand' | 'friction' | 'hidden' | 'low'>('all');
  const [selectedKeyword, setSelectedKeyword] = useState<any | null>(null);
  const [activeModal, setActiveModal] = useState<{ title: string; body: React.ReactNode } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(300),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const openModal = useCallback((title: string, body: React.ReactNode) => setActiveModal({ title, body }), []);
  const closeModal = useCallback(() => setActiveModal(null), []);
  const closeKeyword = useCallback(() => setSelectedKeyword(null), []);

  // Safe data extraction — all guarded inside useMemo
  const r = useMemo(() => (data?.data?.results ?? {}) as Record<string, any>, [data]);

  const summaryCards = useMemo(() => {
    const kc = r.keyword_conversion ?? {};
    return r.summary_cards ?? kc.summary_cards ?? {} as Record<string, any>;
  }, [r]);

  const rows = useMemo<any[]>(() => r.keyword_rows ?? r.all_keywords ?? [], [r]);

  const friction = useMemo<any[]>(() => {
    const kc = r.keyword_conversion ?? {};
    return r.friction_rows ?? kc.friction_rows ?? r.friction_keywords ?? summaryCards.friction_keywords?.items ?? [];
  }, [r, summaryCards]);

  const matrix = useMemo(() => {
    const kc = r.keyword_conversion ?? {};
    return r.matrix ?? kc.matrix ?? {} as Record<string, any>;
  }, [r]);

  const scatterRaw = useMemo<any[]>(() => matrix.points ?? r.scatter_data ?? [], [matrix, r]);

  const qs = useMemo(() => matrix.segment_counts ?? r.quadrant_summary ?? {} as Record<string, any>, [matrix, r]);

  const totalKeywords = useMemo(() => r.total_keywords_analysed ?? rows.length ?? 0, [r, rows]);

  const benchmarkRps1k = useMemo(() => {
    const bm = r.benchmarks ?? r.keyword_conversion?.benchmarks ?? {};
    return Number(bm.top_quartile?.value ?? 0);
  }, [r]);

  const scatter = useMemo<any[]>(() => {
    const sorted = [...scatterRaw].sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0));
    return sorted.slice(0, 300);
  }, [scatterRaw]);

  const displayScatter = useMemo(() => {
    return scatter.filter(pt => {
      if (activeFilter === 'demand')  return pt.quadrant === 'Demand Winner';
      if (activeFilter === 'friction') return pt.quadrant === 'Friction Keyword';
      if (activeFilter === 'hidden')  return pt.quadrant === 'Hidden Gem';
      if (activeFilter === 'low')     return pt.quadrant === 'Low Priority';
      return true;
    });
  }, [scatter, activeFilter]);

  const filteredKeywordRows = useMemo(() => {
    if (activeFilter === 'demand')  return rows.filter(r => r.segment === 'Demand Winner'   || r.quadrant === 'Demand Winner');
    if (activeFilter === 'friction') return rows.filter(r => r.segment === 'Friction Keyword' || r.quadrant === 'Friction Keyword');
    if (activeFilter === 'hidden')  return rows.filter(r => r.segment === 'Hidden Gem'      || r.quadrant === 'Hidden Gem');
    if (activeFilter === 'low')     return rows.filter(r => r.segment === 'Low Priority'    || r.quadrant === 'Low Priority');
    return rows;
  }, [rows, activeFilter]);

  const frictionRowsSorted = useMemo(() => {
    return [...friction].sort((a, b) =>
      (b.estimated_revenue_leakage ?? b.recoverable_revenue ?? 0) -
      (a.estimated_revenue_leakage ?? a.recoverable_revenue ?? 0)
    );
  }, [friction]);

  // Column definitions — stable memoized objects using openDrawer from useCallback above
  const keywordColumns = useMemo<Column<any>[]>(() => [
    { header: 'Keyword', accessorKey: 'keyword',
      cell: row => <button className="text-left hover:text-primary transition-colors font-medium" onClick={() => setSelectedKeyword(row)}>{row.keyword ?? '—'}</button> },
    { header: 'Search Volume', accessorKey: 'search_volume',
      cell: row => valOrMissing(row.search_volume, (v: any) => Number(v).toLocaleString()) },
    { header: 'Keyword Sales Revenue', accessorKey: 'keyword_revenue',
      cell: row => valOrMissing(row.keyword_revenue ?? row.revenue, fmt$) },
    { header: 'Revenue / 1K Searches', accessorKey: 'revenue_per_1000_searches',
      cell: row => valOrMissing(row.revenue_per_1000_searches, fmt$) },
    { header: 'Revenue Efficiency Index', accessorKey: 'efficiency_score',
      cell: row => <span className={cn('font-mono', efficiencyColor(row.efficiency_score ?? 0))}>{(row.efficiency_score ?? 0).toFixed(2)}</span> },
    { header: 'Demand Percentile', accessorKey: 'demand_percentile',
      cell: row => <span className="font-mono">{(row.demand_percentile ?? 0).toFixed(2)}</span> },
    { header: 'Segment', accessorKey: 'quadrant',
      cell: row => <span style={{ color: quadrantDotColor(row.quadrant ?? '') }} className="text-xs font-bold">{row.quadrant ?? '—'}</span> },
    { header: 'Evidence', accessorKey: 'keyword', sortable: false,
      cell: row => (
        <button className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors"
          onClick={() => setSelectedKeyword(row)}>Details</button>
      ) },
  ], []);

  const frictionColumns = useMemo<Column<any>[]>(() => [
    { header: 'Keyword', accessorKey: 'keyword',
      cell: row => <button className="text-left hover:text-primary transition-colors font-medium" onClick={() => setSelectedKeyword(row)}>{row.keyword ?? '—'}</button> },
    { header: 'Search Volume', accessorKey: 'search_volume',
      cell: row => valOrMissing(row.search_volume, (v: any) => Number(v).toLocaleString()) },
    { header: 'Keyword Sales Revenue', accessorKey: 'keyword_revenue',
      cell: row => valOrMissing(row.keyword_revenue ?? row.revenue, fmt$) },
    { header: 'Revenue / 1K Searches', accessorKey: 'revenue_per_1000_searches',
      cell: row => valOrMissing(row.revenue_per_1000_searches, fmt$) },
    { header: 'Benchmark Rev / 1K', accessorKey: 'benchmark_revenue_per_1000_searches',
      cell: row => valOrMissing(row.benchmark_revenue_per_1000_searches, fmt$) },
    { header: 'Friction Revenue Gap', accessorKey: 'recoverable_revenue',
      cell: row => <span className="font-mono text-red-500">{valOrMissing(row.estimated_revenue_leakage ?? row.recoverable_revenue ?? row.lost_revenue_estimate, fmt$)}</span> },
    { header: 'Root Cause', accessorKey: 'root_cause' },
    { header: 'Opportunity Level', accessorKey: 'opportunity_level' },
    { header: 'Evidence', accessorKey: 'keyword', sortable: false,
      cell: row => (
        <button className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20"
          onClick={() => setSelectedKeyword(row)}>Open</button>
      ) },
  ], []);

  // ── ALL hooks declared. Conditional returns safe from here. ───────────────

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Keyword Conversion Intelligence Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Upload a Magnet keyword dataset with Keyword Phrase, Search Volume, and Keyword Sales columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Safe to use extracted data ─────────────────────────────────────────────

  const highRevPotCount = summaryCards.high_revenue_potential?.count ?? r.high_intent_count ?? 0;
  const frictionCount   = summaryCards.friction_keywords?.count ?? r.friction_count ?? 0;
  const frictionRevGap  = summaryCards.recoverable_revenue?.value ?? r.total_lost_revenue ?? 0;
  const highRevEvidence = summaryCards.high_revenue_potential?.evidence ?? {};
  const frictionEvidence = summaryCards.friction_keywords?.evidence ?? {};
  const gapEvidence      = summaryCards.recoverable_revenue?.evidence ?? {};

  // Counts for matrix legend
  const dw = activeFilter === 'demand'  ? filteredKeywordRows.length : (qs.demand_winners   ?? qs.Demand_Winner   ?? 0);
  const hg = activeFilter === 'hidden'  ? filteredKeywordRows.length : (qs.hidden_gems      ?? qs.Hidden_Gem      ?? 0);
  const fk = activeFilter === 'friction'? filteredKeywordRows.length : (qs.friction_keywords ?? qs.Friction_Keyword ?? 0);
  const lp = activeFilter === 'low'     ? filteredKeywordRows.length : (qs.low_priority     ?? qs.Low_Priority    ?? 0);

  // Keywords Analyzed evidence body
  const keywordsAnalyzedBody = (
    <div className="space-y-4 text-sm">
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Keywords Analyzed</p>
        <p className="text-3xl font-black font-mono">{totalKeywords.toLocaleString()}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border border-border rounded-xl bg-muted/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Source Dataset</p>
          <p className="font-mono font-semibold">Magnet Keyword Dataset</p>
        </div>
        <div className="p-3 border border-border rounded-xl bg-muted/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Source Columns</p>
          <p className="font-mono text-xs">Keyword Phrase · Search Volume · Keyword Sales</p>
        </div>
      </div>
      <div className="p-3 bg-muted/20 rounded-xl">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Validity Rules (a keyword row is included when)</p>
        <ul className="space-y-1">
          {[
            'Keyword Phrase exists and is non-empty',
            'Search Volume > 0 (positive numeric)',
            'Keyword Sales is numeric and ≥ 0',
          ].map((rule, i) => (
            <li key={i} className="text-xs font-mono flex gap-2"><span className="text-emerald-500">✓</span>{rule}</li>
          ))}
        </ul>
      </div>
      <div className="p-3 border border-red-500/20 bg-red-500/5 rounded-xl">
        <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2">Excluded rows (not counted)</p>
        <ul className="space-y-1">
          {[
            'Blank or missing Keyword Phrase',
            'Missing or zero/negative Search Volume',
            'Non-numeric or missing Keyword Sales',
          ].map((rule, i) => (
            <li key={i} className="text-xs font-mono flex gap-2"><span className="text-red-500">✗</span>{rule}</li>
          ))}
        </ul>
      </div>
      <div className="p-3 bg-muted/20 rounded-xl">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Formula</p>
        <p className="text-xs font-mono">Valid Keywords = rows where Keyword Phrase ≠ blank AND Search Volume &gt; 0 AND Keyword Sales is numeric</p>
      </div>
    </div>
  );

  const narrative = `Analysis of ${totalKeywords.toLocaleString()} keywords reveals ${highRevPotCount} high-efficiency demand drivers and ${frictionCount} friction keywords that bleed conversion momentum. Addressing the friction keywords could recover an estimated ${fmt$(frictionRevGap)} in monthly revenue efficiency.`;

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      <AnimatePresence>
        {activeModal && (
          <CenteredModal isOpen={true} onClose={closeModal} title={activeModal.title}>
            {activeModal.body}
          </CenteredModal>
        )}
        {selectedKeyword && (
          <CenteredModal isOpen={true} onClose={closeKeyword} title={`Keyword: ${selectedKeyword.keyword ?? '—'}`}>
            <KeywordDetailBody k={selectedKeyword} benchmark={benchmarkRps1k} />
          </CenteredModal>
        )}
      </AnimatePresence>

      <PageHeader 
        badge="Efficiency Intelligence"
        title="Keyword Conversion Intelligence"
        description="Identify which keywords convert demand into sales, and pinpoint where revenue is leaking due to low conversion efficiency."
        kpiSummary={
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 border-t border-border/40 pt-4">
            <button
              className="flex items-center gap-2 p-2 bg-muted/20 border border-border/50 rounded-lg hover:border-primary/40 transition-colors"
              onClick={() => openModal('Keywords Analyzed', keywordsAnalyzedBody)}
            >
              <Database className="w-4 h-4 text-primary" />
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-1">Keywords Analyzed</p>
                <p className="text-sm font-bold font-mono leading-none">{totalKeywords.toLocaleString()}</p>
              </div>
            </button>
            {activeFilter !== 'all' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1.5 rounded-md uppercase tracking-wider border border-primary/20">
                  Filter: {quadrantLabel(activeFilter)}
                </span>
                <button onClick={() => setActiveFilter('all')} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              </div>
            )}
          </div>
        }
      />

      <ExecutiveNarrative content={narrative} />

      <PageSection title="1. Conversion Efficiency Metrics" icon={TrendingUp}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div onClick={() => {
              setActiveFilter('demand');
              if (Object.keys(highRevEvidence).length) {
                openModal('High Revenue Potential Keywords', <EvidenceBody ev={{
                  ...highRevEvidence,
                  items: summaryCards.high_revenue_potential?.items ?? [],
                }} />);
              }
            }}>
            <KPICard
              label="High Revenue Potential"
              value={highRevPotCount}
              implication="Keywords ranking in top percentiles for both volume and conversion."
              confidence={96}
              icon={TrendingUp}
            />
          </div>
          <div onClick={() => {
              setActiveFilter('friction');
              if (Object.keys(frictionEvidence).length) {
                openModal('Friction Keywords', <EvidenceBody ev={{
                  ...frictionEvidence,
                  items: summaryCards.friction_keywords?.items ?? [],
                }} />);
              }
            }}>
            <KPICard
              label="Friction Keywords"
              value={frictionCount}
              implication="High volume but fail to convert. Optimization priority."
              confidence={89}
              icon={TrendingDown}
            />
          </div>
          <div onClick={() => {
              setActiveFilter('friction');
              if (Object.keys(gapEvidence).length) {
                openModal('Estimated Friction Revenue Gap', <EvidenceBody ev={{
                  ...gapEvidence,
                  interpretation: `This measures how much friction keywords collectively underperform the 75th-percentile benchmark.`,
                }} />);
              }
            }}>
            <KPICard
              label="Friction Rev Gap"
              value={fmt$(frictionRevGap)}
              implication="Monthly revenue lost to poor conversion on high-traffic keywords."
              confidence={82}
              icon={Target}
            />
          </div>
        </div>
      </PageSection>

      <PageSection title="2. Opportunity Matrix" icon={Activity}>
        <ChartContainer 
          title="Conversion Quadrants"
          xAxisLabel="Demand Percentile (Search Volume)"
          yAxisLabel="Revenue Efficiency Index"
          businessExplanation="Top Right: Your best performers. Bottom Right: High volume, low conversion (Friction). Top Left: Low volume, high conversion (Hidden Gems)."
        >
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 8, right: 24, bottom: 40, left: 52 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" dataKey="demand_percentile" domain={[0, 100]} name="Demand Percentile"
                label={{ value: 'Demand Percentile (Search Volume)', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey="efficiency_score" domain={[0, 100]} name="Revenue Efficiency Index"
                label={{ value: 'Revenue Efficiency Index', angle: -90, position: 'insideLeft', offset: -24, style: { textAnchor: 'middle' }, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <ReferenceLine x={60} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Demand ≥60', position: 'top', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
              <ReferenceLine y={60} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Eff ≥60', position: 'right', fontSize: 9, fill: '#10b981' }} />
              <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Eff <40', position: 'right', fontSize: 9, fill: '#ef4444' }} />
              <ReTooltip content={<ScatterTip />} />
              <Scatter
                data={displayScatter}
                isAnimationActive={false}
                onClick={(e) => { if (e?.payload) setSelectedKeyword(e.payload); }}
              >
                {displayScatter.map((pt, i) => (
                  <Cell key={i} fill={quadrantDotColor(pt.quadrant)} fillOpacity={0.8} className="cursor-pointer" />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Legend / segment filter */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/50">
            {[
              { key: 'demand',  label: 'Demand Winners',   count: dw, color: '#a855f7', rule: 'Demand ≥ 60  AND  Efficiency ≥ 60' },
              { key: 'hidden',  label: 'Hidden Gems',      count: hg, color: '#10b981', rule: 'Demand < 60  AND  Efficiency ≥ 60' },
              { key: 'friction',label: 'Friction Keywords', count: fk, color: '#ef4444', rule: 'Demand ≥ 60  AND  Efficiency < 40' },
              { key: 'low',     label: 'Low Priority',     count: lp, color: '#64748b', rule: 'Demand < 60  AND  Efficiency < 40' },
            ].map(seg => (
              <button
                key={seg.key}
                className={cn(
                  'text-left p-2.5 rounded-xl border transition-colors',
                  activeFilter === seg.key
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/50 hover:border-primary/30'
                )}
                onClick={() => setActiveFilter(activeFilter === seg.key ? 'all' : seg.key as any)}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-xs font-bold">{seg.label}</span>
                </div>
                <p className="text-lg font-black font-mono" style={{ color: seg.color }}>{seg.count.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{seg.rule}</p>
              </button>
            ))}
          </div>
        </ChartContainer>
      </PageSection>

      {/* ── Keyword Rows Table ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyword Rows</CardTitle>
          <CardDescription>
            {activeFilter === 'all'
              ? `Showing all ${rows.length.toLocaleString()} keywords · click a row for full evidence`
              : `Filtered view: ${quadrantLabel(activeFilter)} · ${filteredKeywordRows.length.toLocaleString()} keywords · click a row for full evidence`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={keywordColumns}
            data={filteredKeywordRows}
            pageSize={10}
            onRowClick={row => setSelectedKeyword(row)}
          />
        </CardContent>
      </Card>

      {/* ── Friction / Conversion Leaks ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            Conversion Leaks / Friction Keywords
          </CardTitle>
          <CardDescription>
            High demand but weak revenue efficiency (Demand Percentile ≥ 60 AND Revenue Efficiency Index &lt; 40).
            Gap vs 75th-percentile benchmark shown. Click a row for formula breakdown.
            {frictionRowsSorted.length > 0
              ? ` Showing ${frictionRowsSorted.length.toLocaleString()} friction keyword${frictionRowsSorted.length === 1 ? '' : 's'} · sorted by largest friction revenue gap`
              : ' No friction keywords found.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={frictionColumns}
            data={frictionRowsSorted}
            pageSize={10}
            onRowClick={row => setSelectedKeyword(row)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Public export wrapped in ErrorBoundary ───────────────────────────────────

export default function IntentEfficiency() {
  return (
    <IntentErrorBoundary>
      <IntentEfficiencyInner />
    </IntentErrorBoundary>
  );
}
