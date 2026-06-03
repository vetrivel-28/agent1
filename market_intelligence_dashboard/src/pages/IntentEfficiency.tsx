import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Modal } from '../components/ui/Modal';
import { cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Info, Loader2, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

// ─── Formatters ───────────────────────────────────────────────────────────────

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

function Tip({ text, children }: { text: string; children: any }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-64">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

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
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            {tooltip && (
              <Tip text={tooltip}>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </Tip>
            )}
          </div>
          <div className={cn('p-2 rounded-lg border', bg)}>
            <span className={color}>{icon}</span>
          </div>
        </div>
        <p className={cn('text-2xl font-black leading-tight', color)}>{value}</p>
        {sub && <p className="text-[11px] font-medium text-muted-foreground mt-1.5 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Scatter tooltip ──────────────────────────────────────────────────────────

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-w-[240px]">
      <p className="font-semibold text-xs leading-snug truncate">{d.keyword || '—'}</p>
      <div className="border-t border-border/50 pt-1 space-y-0.5 text-xs">
        <p className="text-muted-foreground">Search Volume: <span className="text-foreground font-medium">{fmtVol(d.search_volume)}</span></p>
        <p className="text-muted-foreground">Revenue / 1K: <span className="text-foreground font-medium">{formatRev1k(d.revenue_per_1000_searches)}</span></p>
        <p className="text-muted-foreground">Efficiency: <span className={cn('font-medium', effColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}</span></p>
        <span className="font-bold block" style={{ color: dotColor(d.quadrant) }}>{d.quadrant}</span>
      </div>
    </div>
  );
}

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(300),
  });

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

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Keyword Conversion Intelligence Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Requires Magnet dataset with Keyword Phrase, Search Volume, Keyword Sales.')}</p>
        </CardContent>
      </Card>
    );
  }

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

  return (
    <div className="space-y-6">

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyword Rows</CardTitle>
          <CardDescription>
            {activeFilter !== 'all'
              ? `Filtered: ${activeFilterLabel[activeFilter as keyof typeof activeFilterLabel] ?? activeFilter} — ${fmtVol(filteredRows.length)} keywords shown`
              : scatterSampled
                ? `Showing ${fmtVol(rawRows.length)} sampled keywords from ${fmtVol(validRows)} analyzed keywords`
                : `All ${fmtVol(rawRows.length)} analyzed keywords`
            } · Click any row for full calculation evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={kwCols}
            data={filteredRows}
            pageSize={15}
            searchable
            onRowClick={row => setModalState({ kind: 'keyword', kw: row })}
          />
        </CardContent>
      </Card>

      {/* ── Friction Clusters table ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
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

    </div>
  );
}
