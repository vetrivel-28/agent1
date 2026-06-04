import { useMemo, useState, useCallback, Component } from 'react';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
<<<<<<< HEAD
=======
import { Modal } from '../components/ui/Modal';
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
import { cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Info, Loader2, TrendingDown, TrendingUp, X,
<<<<<<< HEAD
  Zap, Target, Search, Database, ChevronDown, ChevronUp, Activity
=======
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
<<<<<<< HEAD
import { motion, AnimatePresence } from 'framer-motion';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { KPICard } from '../components/ui/KPICard';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';

// ─── Helpers ─────────────────────────────────────────────────────────────────
=======

// ─── Formatters ───────────────────────────────────────────────────────────────
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c

function formatRev1k(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (n === 0) return '$0.00';
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  if (Math.abs(n) >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0 && n < 0.01) return `$${n.toFixed(6)}`;
  return `$${Math.abs(n).toFixed(6)}`;
}

function fmtVol(v: number | null | undefined): string {
  if (v == null) return '—';
  return Number(v).toLocaleString();
}

function effColor(score: number): string {
  if (score >= 60) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

<<<<<<< HEAD
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
=======
function dotColor(q: string): string {
  switch (q) {
    case 'Demand Winners':    return '#a855f7';
    case 'Hidden Gems':       return '#10b981';
    case 'Friction Keywords': return '#ef4444';
    case 'Low Priority':      return '#64748b';
    case 'Monitor':           return '#f59e0b';
    default:                  return '#94a3b8';
  }
}

function oppBadge(level: string): string {
  switch (level) {
    case 'Critical': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'High':     return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'Moderate': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
}

const valOrMissing = (val: any, fmt?: (v: any) => any) => {
  if (val == null || val === '') {
    return <span className="text-[10px] uppercase font-bold text-muted-foreground/50 italic">N/A</span>;
  }
  return fmt ? fmt(val) : val;
};

// ─── Tooltip (hover) ─────────────────────────────────────────────────────────
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c

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
<<<<<<< HEAD
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
=======
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-64">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed">
          {text}
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
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

<<<<<<< HEAD
// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  title: string; value: any; sub?: string; icon: any;
  color?: string; bg?: string; onClick?: () => void;
}
function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', onClick }: KpiProps) {
  return (
    <Card className={cn('transition-all duration-200', onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-md')} onClick={onClick}>
=======
// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon, color = 'text-primary',
  bg = 'bg-primary/10 border-primary/20', tooltip, onClick,
}: {
  title: string; value: any; sub?: string; icon: any;
  color?: string; bg?: string; tooltip?: string; onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        'transition-all duration-200 hover-card-anim',
        onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-md',
      )}
      onClick={onClick}
    >
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
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

<<<<<<< HEAD
// ─── Scatter Tooltip ──────────────────────────────────────────────────────────
=======
// ─── Scatter tooltip ──────────────────────────────────────────────────────────
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-w-[240px]">
<<<<<<< HEAD
      <p className="font-semibold text-xs leading-snug">{d.keyword || '—'}</p>
      <div className="border-t border-border/50 pt-1 space-y-0.5">
        <p className="text-muted-foreground text-xs">Search Volume: <span className="text-foreground font-mono">{valOrMissing(d.search_volume, (v: any) => v.toLocaleString())}</span></p>
        <p className="text-muted-foreground text-xs">Rev / 1K: <span className="text-foreground font-mono">{valOrMissing(d.revenue_per_1000_searches, fmt$)}</span></p>
        <p className="text-muted-foreground text-xs">Efficiency: <span className={cn('font-mono', efficiencyColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}</span></p>
        <p className="text-muted-foreground text-xs">Demand %: <span className="font-mono">{(d.demand_percentile ?? 0).toFixed(1)}</span></p>
        <span className="text-xs font-bold block mt-1" style={{ color: quadrantDotColor(d.quadrant) }}>{d.quadrant}</span>
=======
      <p className="font-semibold text-xs leading-snug truncate">{d.keyword || '—'}</p>
      <div className="border-t border-border/50 pt-1 space-y-0.5 text-xs">
        <p className="text-muted-foreground">Search Volume: <span className="text-foreground font-medium">{fmtVol(d.search_volume)}</span></p>
        <p className="text-muted-foreground">Revenue / 1K: <span className="text-foreground font-medium">{formatRev1k(d.revenue_per_1000_searches)}</span></p>
        <p className="text-muted-foreground">Efficiency: <span className={cn('font-medium', effColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}</span></p>
        <span className="font-bold block" style={{ color: dotColor(d.quadrant) }}>{d.quadrant}</span>
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
      </div>
    </div>
  );
}

<<<<<<< HEAD
// ─── Main Page ────────────────────────────────────────────────────────────────

function IntentEfficiencyInner() {
  // All hooks unconditionally at top — no early returns before these
  const [activeFilter, setActiveFilter] = useState<'all' | 'demand' | 'friction' | 'hidden' | 'low'>('all');
  const [selectedKeyword, setSelectedKeyword] = useState<any | null>(null);
  const [activeModal, setActiveModal] = useState<{ title: string; body: React.ReactNode } | null>(null);
=======
// ─── Modal body: Keywords Analyzed ───────────────────────────────────────────

function KeywordsAnalyzedBody({
  total, valid, excluded, reason,
}: { total: number; valid: number; excluded: number; reason: string }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Raw Rows', value: fmtVol(total), cls: '' },
          { label: 'Valid Rows Included', value: fmtVol(valid), cls: 'text-emerald-500' },
          { label: 'Rows Excluded', value: fmtVol(excluded), cls: 'text-red-500' },
        ].map((m, i) => (
          <div key={i} className="p-4 border border-border rounded-xl text-center">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className={cn('text-xl font-black font-mono mt-1', m.cls)}>{m.value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Source Dataset</p>
          <p className="text-sm">Magnet Keyword Dataset</p>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Source Columns</p>
          <div className="flex flex-wrap gap-1.5">
            {['Keyword Phrase', 'Search Volume', 'Keyword Sales'].map((c, i) => (
              <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{c}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Valid Row Rule</p>
          <p className="text-xs font-mono bg-muted/20 rounded-lg p-3">
            Keyword Phrase is not blank AND Search Volume {'>'} 0 AND Keyword Sales is numeric
          </p>
        </div>
        {reason && (
          <div className="p-3 bg-muted/20 rounded-xl">
            <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
          </div>
        )}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">What does "Keywords Analyzed" mean?</p>
          <p className="text-sm leading-relaxed">
            This is the number of valid Magnet keyword rows after removing blank keywords and invalid search-volume rows.
            All revenue efficiency and demand metrics are calculated from these valid rows.
            Segment thresholds are computed as the 60th and 40th percentiles of the demand and efficiency distributions within this specific dataset.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Modal body: High Revenue Potential Keywords ──────────────────────────────

function HighRevenueBody({ count, items, totalN, thresholds }: { count: number; items: any[]; totalN: number; thresholds: any }) {
  const highDemand = thresholds?.high_demand_cutoff ?? 60;
  const highEff    = thresholds?.high_eff_cutoff    ?? 60;
  const method     = thresholds?.method ?? 'dataset-relative 60th percentile quantiles';

  const cols: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: r => <span className="font-medium text-sm">{r.keyword || '—'}</span> },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume)}</span> },
    { header: 'Keyword Sales', accessorKey: 'keyword_revenue', cell: r => <span className="font-mono text-sm">{formatRev1k(r.keyword_revenue ?? r.revenue)}</span> },
    { header: 'Revenue / 1K', accessorKey: 'revenue_per_1000_searches', cell: r => <span className="font-mono text-sm">{formatRev1k(r.revenue_per_1000_searches)}</span> },
    { header: 'Efficiency Index', accessorKey: 'efficiency_score', cell: r => <span className={cn('font-mono text-sm font-bold', effColor(r.efficiency_score ?? 0))}>{(r.efficiency_score ?? 0).toFixed(1)}</span> },
    { header: 'Demand Pct', accessorKey: 'demand_percentile', cell: r => <span className="font-mono text-sm">{(r.demand_percentile ?? 0).toFixed(1)}</span> },
    { header: 'Segment', accessorKey: 'quadrant', cell: r => <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: dotColor(r.quadrant ?? r.segment), backgroundColor: dotColor(r.quadrant ?? r.segment) + '22' }}>{r.segment ?? r.quadrant}</span> },
  ];

  const top = items.length > 0 ? items[0] : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
          <p className="text-xs text-muted-foreground">Count</p>
          <p className="text-2xl font-black font-mono text-purple-500 mt-1">{fmtVol(count)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalN > 0 ? ((count / totalN) * 100).toFixed(1) : 0}% of keywords analyzed</p>
        </div>
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Segment Rule (this dataset)</p>
          <p className="text-xs font-mono mt-2 leading-relaxed">
            Demand Percentile ≥ {highDemand.toFixed(1)}<br/>
            AND Efficiency Index ≥ {highEff.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Source</p>
          <p className="text-xs">Magnet Keyword Dataset · Columns: Keyword Phrase, Search Volume, Keyword Sales</p>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Formula</p>
          <p className="text-xs font-mono bg-muted/20 rounded p-2">
            Demand Percentile = percentile_rank(Search Volume) × 100<br/>
            Revenue / 1K = Keyword Sales / Search Volume × 1000<br/>
            Efficiency Index = winsorized_percentile_rank(Revenue / 1K) × 100<br/>
            Threshold method: {method}
          </p>
        </div>
      </div>
      {top && (
        <div className="p-3 bg-muted/20 rounded-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Example calculation</p>
          <p className="text-xs font-mono leading-relaxed">
            Keyword: {top.keyword}<br/>
            Search Volume: {fmtVol(top.search_volume)} → Demand Percentile = {(top.demand_percentile ?? 0).toFixed(1)}<br/>
            Keyword Sales: {formatRev1k(top.keyword_revenue ?? top.revenue)} → Revenue / 1K = {formatRev1k(top.revenue_per_1000_searches)} → Efficiency Index = {(top.efficiency_score ?? 0).toFixed(1)}<br/>
            Demand ≥ {highDemand.toFixed(1)} AND Efficiency ≥ {highEff.toFixed(1)} → Demand Winners ✓
          </p>
        </div>
      )}
      {items.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Keywords ({fmtVol(count)} total — showing {Math.min(items.length, 300)})
          </p>
          <DataTable columns={cols} data={items.slice(0, 300)} pageSize={15} searchable />
        </div>
      )}
    </div>
  );
}

// ─── Generic segment body (Hidden Gems, Low Priority, Monitor) ────────────────

function SegmentBody({ segmentName, color, bg, count, items, totalN, thresholds, definition, insight }: {
  segmentName: string; color: string; bg: string;
  count: number; items: any[]; totalN: number;
  thresholds: any; definition: string; insight: string;
}) {
  const cols: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: r => <span className="font-medium text-sm">{r.keyword || '—'}</span> },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume)}</span> },
    { header: 'Revenue / 1K', accessorKey: 'revenue_per_1000_searches', cell: r => <span className="font-mono text-sm">{formatRev1k(r.revenue_per_1000_searches)}</span> },
    { header: 'Efficiency Index', accessorKey: 'efficiency_score', cell: r => <span className={cn('font-mono text-sm font-bold', effColor(r.efficiency_score ?? 0))}>{(r.efficiency_score ?? 0).toFixed(1)}</span> },
    { header: 'Demand Pct', accessorKey: 'demand_percentile', cell: r => <span className="font-mono text-sm">{(r.demand_percentile ?? 0).toFixed(1)}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn('p-4 rounded-xl border', bg)}>
          <p className="text-xs text-muted-foreground">Count</p>
          <p className={cn('text-2xl font-black font-mono mt-1', color)}>{fmtVol(count)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalN > 0 ? ((count / totalN) * 100).toFixed(1) : 0}% of keywords analyzed</p>
        </div>
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Segment Rule (this dataset)</p>
          <p className="text-xs font-mono mt-2 leading-relaxed">{definition}</p>
        </div>
      </div>
      {count === 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-xs font-bold text-amber-600 mb-1">Empty Segment</p>
          <p className="text-xs text-muted-foreground">
            No keywords fall into this segment because the dataset has very narrow efficiency variance or insufficient demand distribution at the current dataset-relative thresholds.
          </p>
        </div>
      )}
      <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
        <p className="text-xs font-bold text-primary mb-1">{segmentName} Insight</p>
        <p className="text-sm">{insight}</p>
      </div>
      {items.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Keywords ({fmtVol(count)} total — showing {Math.min(items.length, 200)})
          </p>
          <DataTable columns={cols} data={items.slice(0, 200)} pageSize={15} searchable />
        </div>
      )}
    </div>
  );
}

// ─── Modal body: Friction Keywords ───────────────────────────────────────────

function FrictionKeywordsBody({ count, items, clusters, totalN, thresholds }: {
  count: number; items: any[]; clusters: any[]; totalN: number; thresholds: any;
}) {
  const highDemand = thresholds?.high_demand_cutoff ?? 60;
  const lowEff     = thresholds?.low_eff_cutoff     ?? 40;
  const method     = thresholds?.method ?? 'dataset-relative quantile thresholds';
  const bench      = thresholds?.benchmark_rps_1k_p75 ?? null;

  const cols: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: r => <span className="font-medium text-sm">{r.keyword || '—'}</span> },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume)}</span> },
    { header: 'Revenue / 1K', accessorKey: 'revenue_per_1000_searches', cell: r => <span className="font-mono text-sm">{formatRev1k(r.revenue_per_1000_searches)}</span> },
    { header: 'Efficiency Index', accessorKey: 'efficiency_score', cell: r => <span className={cn('font-mono text-sm font-bold', effColor(r.efficiency_score ?? 0))}>{(r.efficiency_score ?? 0).toFixed(1)}</span> },
    { header: 'Demand Pct', accessorKey: 'demand_percentile', cell: r => <span className="font-mono text-sm">{(r.demand_percentile ?? 0).toFixed(1)}</span> },
    { header: 'Est. Leakage', accessorKey: 'estimated_revenue_leakage', cell: r => <span className="font-mono text-sm text-red-500">{formatRev1k(r.estimated_revenue_leakage ?? r.recoverable_revenue)}</span> },
  ];

  const top = items.length > 0 ? items[0] : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-muted-foreground">Count</p>
          <p className="text-2xl font-black font-mono text-red-500 mt-1">{fmtVol(count)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalN > 0 ? ((count / totalN) * 100).toFixed(1) : 0}% of keywords analyzed</p>
        </div>
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Segment Rule (this dataset)</p>
          <p className="text-xs font-mono mt-2 leading-relaxed">
            Demand Percentile ≥ {highDemand.toFixed(1)}<br/>
            AND Efficiency Index ≤ {lowEff.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Source</p>
          <p className="text-xs">Magnet Keyword Dataset · Columns: Keyword Phrase, Search Volume, Keyword Sales</p>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Formula</p>
          <p className="text-xs font-mono bg-muted/20 rounded p-2">
            Demand Percentile = percentile_rank(Search Volume) × 100<br/>
            Efficiency Index = winsorized_percentile_rank(Revenue / 1K) × 100<br/>
            Threshold method: {method}<br/>
            {bench != null && `Benchmark Revenue/1K (p75) = ${formatRev1k(bench)}`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          Friction keywords attract high search demand but convert poorly into revenue relative to dataset peers.
          They represent missed revenue opportunities.
        </p>
      </div>
      {count === 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-xs font-bold text-amber-600 mb-1">Empty Segment</p>
          <p className="text-xs text-muted-foreground">
            No keywords fall into this segment because the dataset has very narrow efficiency variance. All keywords score similarly on the efficiency dimension, making it impossible to identify a clear low-efficiency/high-demand group at the current thresholds (demand ≥ {highDemand.toFixed(1)}, efficiency ≤ {lowEff.toFixed(1)}).
          </p>
        </div>
      )}
      {top && (
        <div className="p-3 bg-muted/20 rounded-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Example</p>
          <p className="text-xs font-mono leading-relaxed">
            Keyword: {top.keyword}<br/>
            Demand Percentile = {(top.demand_percentile ?? 0).toFixed(1)} (≥ {highDemand.toFixed(1)} ✓)<br/>
            Revenue Efficiency Index = {(top.efficiency_score ?? 0).toFixed(1)} (≤ {lowEff.toFixed(1)} ✓)<br/>
            → Friction Keywords
          </p>
        </div>
      )}
      {items.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Friction Keywords ({fmtVol(count)} total — showing {Math.min(items.length, 300)})
          </p>
          <DataTable columns={cols} data={items.slice(0, 300)} pageSize={15} searchable />
        </div>
      )}
    </div>
  );
}

// ─── Modal body: Cluster detail ───────────────────────────────────────────────

function ClusterDetailBody({ cluster }: { cluster: any }) {
  const label = cluster.cluster_label || cluster.keyword || '—';
  const kwCount = cluster.keyword_count || 1;
  const sv = cluster.search_volume ?? cluster.total_search_volume ?? 0;
  const rev = cluster.keyword_revenue ?? cluster.revenue ?? cluster.total_keyword_sales ?? 0;
  const wRps = cluster.revenue_per_1000_searches ?? cluster.weighted_revenue_per_1k ?? 0;
  const bench = cluster.benchmark_revenue_per_1000_searches ?? cluster.benchmark_revenue_per_1k ?? 0;
  const gap = cluster.efficiency_gap ?? 0;
  const estGap = cluster.estimated_revenue_leakage ?? cluster.estimated_revenue_gap ?? cluster.recoverable_revenue ?? 0;
  const opp = cluster.opportunity_level || '—';
  const steps: string[] = cluster.calculation_steps ?? [];
  const rec: string = cluster.recommendation ?? '';

  // Member keywords — prefer `keywords` array (clean), fall back to `member_keywords`
  const rawMembers: any[] = cluster.keywords ?? cluster.member_keywords ?? [];
  const members = rawMembers.map((m: any) => ({
    keyword: m.keyword || m.keyword_phrase || '—',
    search_volume: m.search_volume ?? 0,
    keyword_sales: m.keyword_sales ?? m.keyword_revenue ?? m.revenue ?? 0,
    revenue_per_1k_searches: m.revenue_per_1k_searches ?? m.revenue_per_1000_searches ?? 0,
    revenue_efficiency_index: m.revenue_efficiency_index ?? m.efficiency_score ?? 0,
    demand_percentile: m.demand_percentile ?? 0,
    segment: m.segment ?? m.quadrant ?? 'Friction Keyword',
  }));

  const memberCols: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: r => <span className="font-medium text-sm">{r.keyword}</span> },
    { header: 'Search Vol', accessorKey: 'search_volume', cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume)}</span> },
    { header: 'KW Sales', accessorKey: 'keyword_sales', cell: r => <span className="font-mono text-sm">{formatRev1k(r.keyword_sales)}</span> },
    { header: 'Rev / 1K', accessorKey: 'revenue_per_1k_searches', cell: r => <span className="font-mono text-sm">{formatRev1k(r.revenue_per_1k_searches)}</span> },
    { header: 'Eff. Index', accessorKey: 'revenue_efficiency_index', cell: r => <span className={cn('font-mono text-sm font-bold', effColor(r.revenue_efficiency_index))}>{(r.revenue_efficiency_index ?? 0).toFixed(1)}</span> },
    { header: 'Demand Pct', accessorKey: 'demand_percentile', cell: r => <span className="font-mono text-sm">{(r.demand_percentile ?? 0).toFixed(1)}</span> },
    { header: 'Segment', accessorKey: 'segment', cell: r => <span className="text-xs text-muted-foreground">{r.segment}</span> },
  ];

  return (
    <div className="space-y-5">
      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Keywords in Cluster', value: fmtVol(kwCount), cls: '' },
          { label: 'Total Search Volume', value: fmtVol(sv), cls: '' },
          { label: 'Total Keyword Sales', value: formatRev1k(rev), cls: 'text-emerald-600' },
          { label: 'Opportunity Level', value: opp, cls: opp === 'Critical' ? 'text-red-600' : opp === 'High' ? 'text-amber-600' : '' },
          { label: 'Weighted Rev / 1K', value: formatRev1k(wRps), cls: '' },
          { label: 'Benchmark Rev / 1K (p75)', value: formatRev1k(bench), cls: '' },
          { label: 'Efficiency Gap', value: formatRev1k(gap), cls: 'text-red-500' },
          { label: 'Est. Revenue Gap', value: formatRev1k(estGap), cls: 'text-red-600 font-black' },
        ].map((m, i) => (
          <div key={i} className="p-3 border border-border rounded-xl">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className={cn('text-base font-bold font-mono mt-1', m.cls)}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Calculation steps */}
      {steps.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Calculation Steps</p>
          <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-1.5">
            {steps.map((s, i) => <p key={i} className="text-xs font-mono">{s}</p>)}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {rec && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">Recommendation</p>
          <p className="text-sm leading-relaxed">{rec}</p>
        </div>
      )}

      {/* Member keywords */}
      {members.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Member Keywords ({members.length})
          </p>
          <DataTable columns={memberCols} data={members} pageSize={15} searchable />
        </div>
      )}
    </div>
  );
}

// ─── Modal body: individual keyword ──────────────────────────────────────────

function KeywordDetailBody({ kw }: { kw: any }) {
  const sv = kw.search_volume ?? 0;
  const kwSales = kw.keyword_revenue ?? kw.revenue ?? 0;
  const rps = kw.revenue_per_1000_searches ?? 0;
  const eff = kw.efficiency_score ?? kw.revenue_efficiency_index ?? 0;
  const dem = kw.demand_percentile ?? 0;
  const seg = kw.segment ?? kw.quadrant ?? '—';
  const recov = kw.estimated_revenue_leakage ?? kw.recoverable_revenue ?? kw.lost_revenue_estimate ?? 0;
  const bench = kw.benchmark_revenue_per_1000_searches ?? 0;
  const gap = kw.efficiency_gap_per_1000_searches ?? kw.gap ?? 0;
  const rec = kw.rule_based_explanation ?? '';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold px-2.5 py-1 rounded-full border"
          style={{ color: dotColor(kw.quadrant), borderColor: dotColor(kw.quadrant) + '44', backgroundColor: dotColor(kw.quadrant) + '18' }}>
          {seg}
        </span>
        {kw.opportunity_level && (
          <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border', oppBadge(kw.opportunity_level))}>
            {kw.opportunity_level}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Search Volume', value: fmtVol(sv), cls: '' },
          { label: 'Keyword Sales', value: formatRev1k(kwSales), cls: '' },
          { label: 'Revenue / 1K Searches', value: formatRev1k(rps), cls: '' },
          { label: 'Revenue Efficiency Index', value: eff.toFixed(1), cls: effColor(eff) },
          { label: 'Demand Percentile', value: dem.toFixed(1), cls: '' },
          { label: 'Segment', value: seg, cls: '' },
        ].map((m, i) => (
          <div key={i} className="p-3 border border-border rounded-xl">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className={cn('text-base font-bold font-mono mt-1', m.cls)}>{m.value}</p>
          </div>
        ))}
        {recov > 0 && (
          <div className="col-span-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
            <p className="text-xs text-red-600">Estimated Revenue Leakage</p>
            <p className="text-xl font-black font-mono text-red-500 mt-1">{formatRev1k(recov)}</p>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Source</p>
        <p className="text-xs">Magnet Keyword Dataset · Columns: Keyword Phrase, Search Volume, Keyword Sales</p>
      </div>

      <div className="p-3 bg-muted/20 rounded-lg">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Calculation</p>
        <p className="text-xs font-mono leading-relaxed">
          Revenue / 1K = {formatRev1k(kwSales)} / {fmtVol(sv)} × 1000 = {formatRev1k(rps)}<br/>
          Efficiency Index = percentile_rank({formatRev1k(rps)}) × 100 = {eff.toFixed(1)}<br/>
          Demand Percentile = percentile_rank({fmtVol(sv)}) × 100 = {dem.toFixed(1)}
          {seg === 'Friction Keyword' && bench > 0 && (
            <><br/>Gap = max(0, {formatRev1k(bench)} − {formatRev1k(rps)}) = {formatRev1k(gap)}<br/>
            Revenue Leakage = {formatRev1k(gap)} × {fmtVol(sv)} / 1000 = {formatRev1k(recov)}</>
          )}
        </p>
      </div>

      {rec && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">Classification Explanation</p>
          <p className="text-sm leading-relaxed">{rec}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'keywords-analyzed'; total: number; valid: number; excluded: number; reason: string }
  | { kind: 'high-revenue'; count: number; items: any[]; totalN: number; thresholds: any }
  | { kind: 'hidden-gems'; count: number; items: any[]; totalN: number; thresholds: any }
  | { kind: 'friction-kw'; count: number; items: any[]; clusters: any[]; totalN: number; thresholds: any }
  | { kind: 'low-priority'; count: number; items: any[]; totalN: number; thresholds: any }
  | { kind: 'monitor'; count: number; items: any[]; totalN: number; thresholds: any }
  | { kind: 'cluster'; cluster: any }
  | { kind: 'keyword'; kw: any }
  | null;

export default function IntentEfficiency() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'demand' | 'friction' | 'hidden' | 'low' | 'monitor'>('all');
  const [modalState, setModalState] = useState<ModalState>(null);
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(300),
    retry: false,
    refetchOnWindowFocus: false,
  });

<<<<<<< HEAD
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
=======
  // ── Data extraction ───────────────────────────────────────────────────────
  const r = data?.data?.results ?? {};
  const validation = data?.data?.validation ?? {};

  // Row counts for Keywords Analyzed popup
  const totalRaw: number = validation.rows_before_cleaning ?? r.total_keywords_analysed ?? 0;
  const validRows: number = r.total_keywords_analysed ?? 0;
  const excludedRows: number = validation.rows_skipped ?? (totalRaw - validRows);
  const excludedReason = 'Rows are excluded if Keyword Phrase is blank, Search Volume is missing or non-positive, or Keyword Sales is missing or non-numeric.';

  // Dataset-relative thresholds from backend
  const segThresholds = r.segment_thresholds ?? {};
  const highDemandCutoff: number = segThresholds.high_demand_cutoff ?? 60;
  const lowDemandCutoff:  number = segThresholds.low_demand_cutoff  ?? 40;
  const highEffCutoff:    number = segThresholds.high_eff_cutoff    ?? 60;
  const lowEffCutoff:     number = segThresholds.low_eff_cutoff     ?? 40;
  const scatterSampled: boolean  = segThresholds.scatter_sampled    ?? false;
  const scatterSampleSize: number = segThresholds.scatter_sample_size ?? 300;

  const kc = r.keyword_conversion ?? {};
  // Use all_keywords (capped 300) for scatter/table; use segment-specific arrays for segment details
  const rawRows: any[] = r.keyword_rows ?? r.all_keywords ?? [];
  const scatterRows: any[] = r.scatter_data ?? rawRows;

  // Segment counts from full-dataset calculation (backend)
  const qs = r.quadrant_summary ?? r.matrix?.segment_counts ?? {};
  const segCounts = {
    demand_winners:    qs.demand_winners    ?? 0,
    hidden_gems:       qs.hidden_gems       ?? 0,
    friction_keywords: qs.friction_keywords ?? 0,
    low_priority:      qs.low_priority      ?? 0,
    monitor:           qs.monitor           ?? 0,
  };

  // Pre-segmented items from backend (full dataset, not sampled)
  const demandWinnersItems: any[] = r.summary_cards?.high_revenue_potential?.items
    ?? r.high_intent_keywords_full
    ?? r.demand_winners
    ?? rawRows.filter((k: any) => k.segment === 'Demand Winners' || k.quadrant === 'Demand Winners');

  const hiddenGemsItems: any[] = r.hidden_gems
    ?? rawRows.filter((k: any) => k.segment === 'Hidden Gems' || k.quadrant === 'Hidden Gems');

  const frictionItems: any[] = r.summary_cards?.friction_keywords?.items
    ?? r.friction_keywords_full
    ?? r.friction_keywords
    ?? rawRows.filter((k: any) => k.segment === 'Friction Keywords' || k.quadrant === 'Friction Keywords');

  const lowPriorityItems: any[] = rawRows.filter(
    (k: any) => k.segment === 'Low Priority' || k.quadrant === 'Low Priority'
  );

  const monitorItems: any[] = rawRows.filter(
    (k: any) => k.segment === 'Monitor' || k.quadrant === 'Monitor'
  );

  // Friction clusters from backend (already properly clustered)
  const frictionClusters: any[] = r.summary_cards?.friction_keywords?.clusters
    ?? r.friction_rows
    ?? [];

  const highRevCount   = segCounts.demand_winners;
  const frictionCount  = segCounts.friction_keywords;

  // ── Scatter data (already sampled by backend) ─────────────
  const scatter = useMemo(() => scatterRows.slice(0, 300), [scatterRows]);

  const displayScatter = useMemo(() => {
    if (activeFilter === 'all') return scatter;
    const segMap: Record<string, string> = {
      demand: 'Demand Winners', friction: 'Friction Keywords',
      hidden: 'Hidden Gems', low: 'Low Priority', monitor: 'Monitor',
    };
    const seg = segMap[activeFilter];
    return scatter.filter((pt: any) => pt.segment === seg || pt.quadrant === seg);
  }, [scatter, activeFilter]);

  // ── Filtered keyword rows ───────────────────────────────────
  const filteredRows = useMemo(() => {
    if (activeFilter === 'all') return rawRows;
    const segMap: Record<string, string> = {
      demand: 'Demand Winners', friction: 'Friction Keywords',
      hidden: 'Hidden Gems', low: 'Low Priority', monitor: 'Monitor',
    };
    const seg = segMap[activeFilter];
    return rawRows.filter((rr: any) => rr.segment === seg || rr.quadrant === seg);
  }, [rawRows, activeFilter]);

  // ── Column defs ───────────────────────────────────────────────────────────
  const kwCols: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: r => <span className="font-medium text-sm">{r.keyword || '—'}</span> },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume)}</span> },
    { header: 'Keyword Sales', accessorKey: 'keyword_revenue', cell: r => <span className="font-mono text-sm">{formatRev1k(r.keyword_revenue ?? r.revenue)}</span> },
    { header: 'Revenue / 1K', accessorKey: 'revenue_per_1000_searches', cell: r => <span className="font-mono text-sm">{formatRev1k(r.revenue_per_1000_searches)}</span> },
    { header: 'Efficiency Index', accessorKey: 'efficiency_score', cell: r => <span className={cn('font-mono text-sm font-bold', effColor(r.efficiency_score ?? 0))}>{(r.efficiency_score ?? r.revenue_efficiency_index ?? 0).toFixed(1)}</span> },
    { header: 'Demand Pct', accessorKey: 'demand_percentile', cell: r => <span className="font-mono text-sm">{(r.demand_percentile ?? 0).toFixed(1)}</span> },
    { header: 'Segment', accessorKey: 'quadrant', cell: r => (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ color: dotColor(r.quadrant), backgroundColor: dotColor(r.quadrant) + '22' }}>
        {r.segment ?? r.quadrant}
      </span>
    )},
  ];

  // Friction table — simplified: NO weighted/benchmark/gap columns
  const frictionCols: Column<any>[] = [
    {
      header: 'Keyword Cluster', accessorKey: 'cluster_label',
      cell: r => <span className="font-semibold text-sm">{r.cluster_label || r.keyword || '—'}</span>,
    },
    {
      header: 'Keywords', accessorKey: 'keyword_count',
      cell: r => <span className="font-mono text-sm">{(r.keyword_count || 1).toLocaleString()}</span>,
    },
    {
      header: 'Total Search Volume', accessorKey: 'search_volume',
      cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume ?? r.total_search_volume)}</span>,
    },
    {
      header: 'Total KW Sales', accessorKey: 'keyword_revenue',
      cell: r => <span className="font-mono text-sm">{formatRev1k(r.keyword_revenue ?? r.revenue ?? r.total_keyword_sales)}</span>,
    },
    {
      header: 'Est. Revenue Gap', accessorKey: 'estimated_revenue_leakage',
      cell: r => <span className="font-mono text-sm text-red-500 font-bold">{formatRev1k(r.estimated_revenue_leakage ?? r.estimated_revenue_gap ?? r.recoverable_revenue)}</span>,
    },
    {
      header: 'Opportunity', accessorKey: 'opportunity_level',
      cell: r => <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold border', oppBadge(r.opportunity_level ?? ''))}>{r.opportunity_level || '—'}</span>,
    },
    {
      header: 'Details', accessorKey: '_details',
      cell: () => <span className="text-primary text-xs font-semibold cursor-pointer hover:underline">Open ↗</span>,
      sortable: false,
    },
  ];

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Keyword Conversion Intelligence Unavailable</h2>
<<<<<<< HEAD
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Upload a Magnet keyword dataset with Keyword Phrase, Search Volume, and Keyword Sales columns.')}</p>
=======
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Requires Magnet dataset with Keyword Phrase, Search Volume, Keyword Sales.')}</p>
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
        </CardContent>
      </Card>
    );
  }

<<<<<<< HEAD
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
=======
  // ── Modal title helper ───────────────────────────────────────────────────
  function modalTitle(): string {
    if (!modalState) return '';
    switch (modalState.kind) {
      case 'keywords-analyzed': return 'Keywords Analyzed';
      case 'high-revenue': return `Demand Winners — ${fmtVol(modalState.count)}`;
      case 'hidden-gems': return `Hidden Gems — ${fmtVol(modalState.count)}`;
      case 'friction-kw': return `Friction Keywords — ${fmtVol(modalState.count)}`;
      case 'low-priority': return `Low Priority Keywords — ${fmtVol(modalState.count)}`;
      case 'monitor': return `Monitor Keywords — ${fmtVol(modalState.count)}`;
      case 'cluster': {
        const lbl = modalState.cluster.cluster_label || modalState.cluster.keyword || '—';
        const cnt = modalState.cluster.keyword_count || 1;
        return `${lbl} cluster — ${cnt} keyword${cnt === 1 ? '' : 's'}`;
      }
      case 'keyword': return `Keyword: ${modalState.kw.keyword || '—'}`;
      default: return '';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const activeFilterLabel: Record<string, string> = {
    demand: 'Demand Winners', friction: 'Friction Keywords',
    hidden: 'Hidden Gems', low: 'Low Priority', monitor: 'Monitor',
  };
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c

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

<<<<<<< HEAD
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
=======
      {/* Centered modal — one instance, driven by modalState */}
      <Modal
        isOpen={!!modalState}
        onClose={() => setModalState(null)}
        title={modalTitle()}
        maxWidth={
          modalState?.kind === 'high-revenue' || modalState?.kind === 'friction-kw' || modalState?.kind === 'cluster'
            ? 'max-w-5xl' : 'max-w-2xl'
        }
      >
        {modalState?.kind === 'keywords-analyzed' && (
          <KeywordsAnalyzedBody
            total={modalState.total}
            valid={modalState.valid}
            excluded={modalState.excluded}
            reason={modalState.reason}
          />
        )}
        {modalState?.kind === 'high-revenue' && (
          <HighRevenueBody
            count={modalState.count}
            items={modalState.items}
            totalN={modalState.totalN}
            thresholds={modalState.thresholds}
          />
        )}
        {modalState?.kind === 'hidden-gems' && (
          <SegmentBody
            segmentName="Hidden Gems"
            color="text-emerald-500"
            bg="bg-emerald-500/10 border-emerald-500/20"
            count={modalState.count}
            items={modalState.items}
            totalN={modalState.totalN}
            thresholds={modalState.thresholds}
            definition={`Demand Percentile < ${modalState.thresholds?.high_demand_cutoff?.toFixed(1) ?? '60'} AND Efficiency Index ≥ ${modalState.thresholds?.high_eff_cutoff?.toFixed(1) ?? '60'}`}
            insight="Low demand volume but high revenue efficiency — these keywords over-convert relative to their traffic. Consider testing them more aggressively."
          />
        )}
        {modalState?.kind === 'friction-kw' && (
          <FrictionKeywordsBody
            count={modalState.count}
            items={modalState.items}
            clusters={modalState.clusters}
            totalN={modalState.totalN}
            thresholds={modalState.thresholds}
          />
        )}
        {modalState?.kind === 'low-priority' && (
          <SegmentBody
            segmentName="Low Priority"
            color="text-slate-500"
            bg="bg-slate-500/10 border-slate-500/20"
            count={modalState.count}
            items={modalState.items}
            totalN={modalState.totalN}
            thresholds={modalState.thresholds}
            definition={`Demand Percentile ≤ ${modalState.thresholds?.low_demand_cutoff?.toFixed(1) ?? '40'} AND Efficiency Index ≤ ${modalState.thresholds?.low_eff_cutoff?.toFixed(1) ?? '40'}`}
            insight="Low search demand and low revenue efficiency. These keywords are unlikely to drive meaningful results without significant improvements."
          />
        )}
        {modalState?.kind === 'monitor' && (
          <SegmentBody
            segmentName="Monitor"
            color="text-amber-500"
            bg="bg-amber-500/10 border-amber-500/20"
            count={modalState.count}
            items={modalState.items}
            totalN={modalState.totalN}
            thresholds={modalState.thresholds}
            definition="Keywords that do not clearly fit the four major segments — mid-range demand and efficiency scores."
            insight="These keywords are in a transitional zone. Monitor for movement toward Demand Winners or Friction Keywords with additional data."
          />
        )}
        {modalState?.kind === 'cluster' && (
          <ClusterDetailBody cluster={modalState.cluster} />
        )}
        {modalState?.kind === 'keyword' && (
          <KeywordDetailBody kw={modalState.kw} />
        )}
      </Modal>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-black tracking-tight text-gradient-primary">Keyword Conversion Intelligence</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-3xl">
            Identify which keywords convert demand into sales. All calculations use Magnet keyword data only.
          </p>
          {activeFilter !== 'all' && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary px-3 py-1 rounded-full">
                Filtered: {activeFilterLabel[activeFilter]}
              </span>
              <button
                onClick={() => setActiveFilter('all')}
                className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> Clear Filter
              </button>
            </div>
          )}
        </div>

        {/* Keywords Analyzed — clickable */}
        <button
          type="button"
          className="bg-card border border-border/50 rounded-xl p-4 shadow-sm min-w-[240px] text-left hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
          onClick={() => setModalState({
            kind: 'keywords-analyzed',
            total: totalRaw,
            valid: validRows,
            excluded: excludedRows,
            reason: excludedReason,
          })}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            Keywords Analyzed
            <Info className="w-3 h-3 text-muted-foreground/50" />
          </p>
          <p className="text-2xl font-mono font-bold mt-1">{fmtVol(validRows)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Click for source details</p>
        </button>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          title="Demand Winners"
          value={fmtVol(highRevCount)}
          sub={`Demand ≥ ${highDemandCutoff.toFixed(1)} AND Efficiency ≥ ${highEffCutoff.toFixed(1)} · Click to view`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-purple-500"
          bg="bg-purple-500/10 border-purple-500/30"
          onClick={() => setModalState({
            kind: 'high-revenue',
            count: highRevCount,
            items: demandWinnersItems,
            totalN: validRows,
            thresholds: segThresholds,
          })}
        />
        <KpiCard
          title="Hidden Gems"
          value={fmtVol(segCounts.hidden_gems)}
          sub={`Demand < ${highDemandCutoff.toFixed(1)} AND Efficiency ≥ ${highEffCutoff.toFixed(1)} · Click to view`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          onClick={() => setModalState({
            kind: 'hidden-gems',
            count: segCounts.hidden_gems,
            items: hiddenGemsItems,
            totalN: validRows,
            thresholds: segThresholds,
          })}
        />
        <KpiCard
          title="Friction Keywords"
          value={fmtVol(frictionCount)}
          sub={frictionCount === 0
            ? 'No friction keywords — data may have narrow efficiency variance'
            : `Demand ≥ ${highDemandCutoff.toFixed(1)} AND Efficiency ≤ ${lowEffCutoff.toFixed(1)} · Click to view`}
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          onClick={() => setModalState({
            kind: 'friction-kw',
            count: frictionCount,
            items: frictionItems,
            clusters: frictionClusters,
            totalN: validRows,
            thresholds: segThresholds,
          })}
        />
        <KpiCard
          title="Low Priority"
          value={fmtVol(segCounts.low_priority)}
          sub={segCounts.low_priority === 0
            ? 'No low-priority keywords — data may have narrow variance'
            : `Demand ≤ ${lowDemandCutoff.toFixed(1)} AND Efficiency ≤ ${lowEffCutoff.toFixed(1)} · Click to view`}
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-slate-500"
          bg="bg-slate-500/10 border-slate-500/30"
          onClick={() => setModalState({
            kind: 'low-priority',
            count: segCounts.low_priority,
            items: lowPriorityItems,
            totalN: validRows,
            thresholds: segThresholds,
          })}
        />
      </div>

      {/* ── Matrix ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 border-b border-border/50">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Keyword Opportunity Matrix</span>
            {activeFilter !== 'all' && (
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Filtered: {activeFilterLabel[activeFilter]}
              </span>
            )}
            <Tip text="X = Demand Percentile (Search Volume rank). Y = Revenue Efficiency Index (Revenue/1K rank). Uses individual keyword rows, not clusters.">
              <Info className="w-4 h-4 text-muted-foreground/60 cursor-help" />
            </Tip>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 48, left: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                type="number" dataKey="demand_percentile" domain={[0, 100]} name="Demand Percentile"
                label={{ value: 'Demand Percentile (Search Volume rank)', position: 'insideBottom', offset: -32, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
              />
              <YAxis
                type="number" dataKey="efficiency_score" domain={[0, 100]} name="Revenue Efficiency Index"
                label={{ value: 'Revenue Efficiency Index (winsorized)', angle: -90, position: 'insideLeft', offset: -28, style: { textAnchor: 'middle' }, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
              />
              <ReferenceLine x={highDemandCutoff} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
              <ReferenceLine y={highEffCutoff} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
              <ReferenceLine x={lowDemandCutoff} stroke="hsl(var(--border))" strokeDasharray="2 6" strokeWidth={1} opacity={0.4} />
              <ReferenceLine y={lowEffCutoff} stroke="hsl(var(--border))" strokeDasharray="2 6" strokeWidth={1} opacity={0.4} />
              <ReTooltip content={<ScatterTip />} />
              <Scatter
                data={displayScatter}
                isAnimationActive={false}
                onClick={(e: any) => { if (e?.payload) setModalState({ kind: 'keyword', kw: e.payload }); }}
              >
                {displayScatter.map((pt: any, i: number) => (
                  <Cell key={i} fill={dotColor(pt.quadrant ?? pt.segment)} fillOpacity={0.8} className="cursor-pointer" />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Segment legend / filter buttons */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-border/50">
            {([
              { key: 'demand',  label: 'Demand Winners',    count: segCounts.demand_winners   ?? 0, color: '#a855f7' },
              { key: 'hidden',  label: 'Hidden Gems',       count: segCounts.hidden_gems      ?? 0, color: '#10b981' },
              { key: 'friction',label: 'Friction Keywords', count: segCounts.friction_keywords ?? 0, color: '#ef4444' },
              { key: 'low',     label: 'Low Priority',      count: segCounts.low_priority     ?? 0, color: '#64748b' },
              { key: 'monitor', label: 'Monitor',           count: segCounts.monitor          ?? 0, color: '#f59e0b' },
            ] as const).map(({ key, label, count, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(activeFilter === key ? 'all' : key)}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border text-left transition-colors',
                  activeFilter === key ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <div>
                  <p className="text-xs font-semibold leading-tight">{label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{fmtVol(count)}</p>
                </div>
              </button>
            ))}
          </div>
          {scatterSampled && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Chart shows {fmtVol(scatterSampleSize)} sampled keywords from {fmtVol(validRows)} analyzed. Segment counts above reflect the full dataset.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1 text-center font-mono">
            Thresholds (dataset-relative): high demand ≥ {highDemandCutoff.toFixed(1)} · low demand ≤ {lowDemandCutoff.toFixed(1)} · high efficiency ≥ {highEffCutoff.toFixed(1)} · low efficiency ≤ {lowEffCutoff.toFixed(1)}
          </p>
        </CardContent>
      </Card>

      {/* ── Keyword Rows table (individual keywords, never clustered) ─── */}
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyword Rows</CardTitle>
          <CardDescription>
<<<<<<< HEAD
            {activeFilter === 'all'
              ? `Showing all ${rows.length.toLocaleString()} keywords · click a row for full evidence`
              : `Filtered view: ${quadrantLabel(activeFilter)} · ${filteredKeywordRows.length.toLocaleString()} keywords · click a row for full evidence`}
=======
            {activeFilter !== 'all'
              ? `Filtered: ${activeFilterLabel[activeFilter as keyof typeof activeFilterLabel] ?? activeFilter} — ${fmtVol(filteredRows.length)} keywords shown`
              : scatterSampled
                ? `Showing ${fmtVol(rawRows.length)} sampled keywords from ${fmtVol(validRows)} analyzed keywords`
                : `All ${fmtVol(rawRows.length)} analyzed keywords`
            } · Click any row for full calculation evidence.
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
<<<<<<< HEAD
            columns={keywordColumns}
            data={filteredKeywordRows}
            pageSize={10}
            onRowClick={row => setSelectedKeyword(row)}
=======
            columns={kwCols}
            data={filteredRows}
            pageSize={15}
            searchable
            onRowClick={row => setModalState({ kind: 'keyword', kw: row })}
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
          />
        </CardContent>
      </Card>

<<<<<<< HEAD
      {/* ── Friction / Conversion Leaks ──────────────────────────────────────── */}
=======
      {/* ── Friction Clusters table ──────────────────────────────────── */}
>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
<<<<<<< HEAD
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
=======
            Conversion Leaks / Friction Clusters
          </CardTitle>
          <CardDescription>
            Friction keywords grouped by phrase similarity using Levenshtein distance clustering.
            Singular/plural variants are merged. Sorted by estimated revenue gap descending.
            {frictionClusters.length > 0 && ` ${fmtVol(frictionClusters.length)} cluster${frictionClusters.length === 1 ? '' : 's'} · ${fmtVol(frictionCount)} individual keywords.`}
            {frictionCount === 0 && ` No friction keywords found — segment is empty because the dataset has narrow efficiency variance (thresholds: demand ≥ ${highDemandCutoff.toFixed(1)}, efficiency ≤ ${lowEffCutoff.toFixed(1)}).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {frictionClusters.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {frictionCount === 0
                ? `No friction keywords found in this dataset. The dataset efficiency values are too uniform to produce a Friction Keywords segment at the current thresholds (demand ≥ ${highDemandCutoff.toFixed(1)}, efficiency ≤ ${lowEffCutoff.toFixed(1)}).`
                : 'No clusters formed from friction keywords.'}
            </p>
          ) : (
            <DataTable
              columns={frictionCols}
              data={frictionClusters}
              pageSize={10}
              searchable
              onRowClick={row => setModalState({ kind: 'cluster', cluster: row })}
            />
          )}
        </CardContent>
      </Card>

>>>>>>> a3ddebeaf655eb5cdcce4a5f3d83c5c854210e3c
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
