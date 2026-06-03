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
    case 'Demand Winner':    return '#a855f7';
    case 'Hidden Gem':       return '#10b981';
    case 'Friction Keyword': return '#ef4444';
    case 'Low Priority':     return '#64748b';
    default:                 return '#94a3b8';
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
            This is the count of keyword rows from the Magnet dataset that passed all validation checks.
            Each valid row represents one Keyword Phrase with a positive Search Volume and a parseable Keyword Sales value.
            All revenue efficiency and demand metrics are calculated only from these valid rows.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Modal body: High Revenue Potential Keywords ──────────────────────────────

function HighRevenueBody({ count, items, totalN }: { count: number; items: any[]; totalN: number }) {
  const cols: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: r => <span className="font-medium text-sm">{r.keyword || '—'}</span> },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume)}</span> },
    { header: 'Keyword Sales', accessorKey: 'keyword_revenue', cell: r => <span className="font-mono text-sm">{formatRev1k(r.keyword_revenue ?? r.revenue)}</span> },
    { header: 'Revenue / 1K', accessorKey: 'revenue_per_1000_searches', cell: r => <span className="font-mono text-sm">{formatRev1k(r.revenue_per_1000_searches)}</span> },
    { header: 'Efficiency Index', accessorKey: 'efficiency_score', cell: r => <span className={cn('font-mono text-sm font-bold', effColor(r.efficiency_score ?? 0))}>{(r.efficiency_score ?? 0).toFixed(1)}</span> },
    { header: 'Demand Pct', accessorKey: 'demand_percentile', cell: r => <span className="font-mono text-sm">{(r.demand_percentile ?? 0).toFixed(1)}</span> },
    { header: 'Segment', accessorKey: 'quadrant', cell: r => <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: dotColor(r.quadrant), backgroundColor: dotColor(r.quadrant) + '22' }}>{r.segment ?? r.quadrant}</span> },
  ];

  const top = items.length > 0 ? items[0] : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <p className="text-xs text-muted-foreground">Count</p>
          <p className="text-2xl font-black font-mono text-emerald-500 mt-1">{fmtVol(count)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalN > 0 ? ((count / totalN) * 100).toFixed(1) : 0}% of keywords analyzed</p>
        </div>
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Segment Rule</p>
          <p className="text-xs font-mono mt-2 leading-relaxed">Demand Percentile ≥ 60<br/>AND Revenue Efficiency Index ≥ 60</p>
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
            Revenue Efficiency Index = percentile_rank(Revenue / 1K) × 100
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
            Both ≥ 60 → Demand Winner ✓
          </p>
        </div>
      )}
      {items.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Keywords ({fmtVol(count)} total — showing {Math.min(items.length, 200)})
          </p>
          <DataTable columns={cols} data={items.slice(0, 200)} pageSize={10} searchable />
        </div>
      )}
    </div>
  );
}

// ─── Modal body: Friction Keywords ───────────────────────────────────────────

function FrictionKeywordsBody({ count, items, clusters, totalN }: {
  count: number; items: any[]; clusters: any[]; totalN: number;
}) {
  const cols: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: r => <span className="font-medium text-sm">{r.keyword || '—'}</span> },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: r => <span className="font-mono text-sm">{fmtVol(r.search_volume)}</span> },
    { header: 'Keyword Sales', accessorKey: 'keyword_revenue', cell: r => <span className="font-mono text-sm">{formatRev1k(r.keyword_revenue ?? r.revenue)}</span> },
    { header: 'Revenue / 1K', accessorKey: 'revenue_per_1000_searches', cell: r => <span className="font-mono text-sm">{formatRev1k(r.revenue_per_1000_searches)}</span> },
    { header: 'Efficiency Index', accessorKey: 'efficiency_score', cell: r => <span className={cn('font-mono text-sm font-bold', effColor(r.efficiency_score ?? 0))}>{(r.efficiency_score ?? 0).toFixed(1)}</span> },
    { header: 'Demand Pct', accessorKey: 'demand_percentile', cell: r => <span className="font-mono text-sm">{(r.demand_percentile ?? 0).toFixed(1)}</span> },
  ];

  const top = items.length > 0 ? items[0] : null;
  const displayData = items.length > 0 ? items : (clusters ?? []);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-muted-foreground">Count</p>
          <p className="text-2xl font-black font-mono text-red-500 mt-1">{fmtVol(count)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalN > 0 ? ((count / totalN) * 100).toFixed(1) : 0}% of keywords analyzed</p>
        </div>
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground">Segment Rule</p>
          <p className="text-xs font-mono mt-2 leading-relaxed">Demand Percentile ≥ 60<br/>AND Revenue Efficiency Index &lt; 40</p>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Source</p>
          <p className="text-xs">Magnet Keyword Dataset · Columns: Keyword Phrase, Search Volume, Keyword Sales</p>
        </div>
        <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 leading-relaxed">
          Friction keywords have high search demand but low revenue efficiency compared to the 75th-percentile benchmark.
          They attract significant search traffic but convert poorly into Keyword Sales relative to peers.
        </p>
      </div>
      {top && (
        <div className="p-3 bg-muted/20 rounded-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Example</p>
          <p className="text-xs font-mono leading-relaxed">
            Keyword: {top.keyword}<br/>
            Demand Percentile = {(top.demand_percentile ?? 0).toFixed(1)} (≥ 60 ✓)<br/>
            Revenue Efficiency Index = {(top.efficiency_score ?? 0).toFixed(1)} (&lt; 40 ✓)<br/>
            → Friction Keyword
          </p>
        </div>
      )}
      {displayData.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Friction Keywords ({fmtVol(count)} total — showing {Math.min(displayData.length, 200)})
          </p>
          <DataTable columns={cols} data={displayData.slice(0, 200)} pageSize={10} searchable />
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
  | { kind: 'high-revenue'; count: number; items: any[]; totalN: number }
  | { kind: 'friction-kw'; count: number; items: any[]; clusters: any[]; totalN: number }
  | { kind: 'cluster'; cluster: any }
  | { kind: 'keyword'; kw: any }
  | null;

export default function IntentEfficiency() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'demand' | 'friction' | 'hidden' | 'low'>('all');
  const [modalState, setModalState] = useState<ModalState>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(300),
  });

  // ── Data extraction ───────────────────────────────────────────────────────
  const r = data?.data?.results ?? {};
  const validation = data?.data?.validation ?? {};

  // Summary cards — check both top-level and nested keyword_conversion paths
  const kc = r.keyword_conversion ?? {};
  const summaryCards = r.summary_cards ?? kc.summary_cards ?? {};

  // Row counts for Keywords Analyzed popup
  const totalRaw: number = validation.rows_before_cleaning ?? r.total_keywords_analysed ?? 0;
  const validRows: number = r.total_keywords_analysed ?? 0;
  const excludedRows: number = validation.rows_skipped ?? (totalRaw - validRows);
  const excludedReason = 'Rows are excluded if Keyword Phrase is blank, Search Volume is missing or non-positive, or Keyword Sales is missing or non-numeric.';

  // Keyword rows for matrix + Keyword Rows table (individual, never clustered)
  const allKeywordRows: any[] = r.keyword_rows ?? kc.keyword_rows ?? r.all_keywords ?? [];

  // Friction clusters for the friction table
  const frictionClusters: any[] = r.friction_rows ?? kc.friction_rows ?? [];

  // Matrix scatter data
  const matrix = r.matrix ?? kc.matrix ?? {};
  const scatterRaw: any[] = matrix.points ?? r.scatter_data ?? [];
  const segCounts = matrix.segment_counts ?? r.quadrant_summary ?? {};

  // Summary card content
  const highRevCount: number = summaryCards.high_revenue_potential?.count ?? r.high_intent_count ?? 0;
  const highRevItems: any[] = summaryCards.high_revenue_potential?.items ?? r.demand_winners ?? [];
  const frictionCount: number = summaryCards.friction_keywords?.count ?? r.friction_count ?? 0;
  const frictionItems: any[] = summaryCards.friction_keywords?.items ?? [];
  const frictionClusterItems: any[] = summaryCards.friction_keywords?.clusters ?? frictionClusters;

  // ── Scatter data (capped at 300, matrix uses individual rows) ─────────────
  const scatter = useMemo(() => {
    const sorted = [...scatterRaw].sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0));
    return sorted.slice(0, 300);
  }, [scatterRaw]);

  const displayScatter = useMemo(() => {
    if (activeFilter === 'all') return scatter;
    const segMap: Record<string, string> = {
      demand: 'Demand Winner', friction: 'Friction Keyword',
      hidden: 'Hidden Gem', low: 'Low Priority',
    };
    const seg = segMap[activeFilter];
    return scatter.filter(pt => pt.quadrant === seg);
  }, [scatter, activeFilter]);

  // ── Filtered keyword rows (for the Keyword Rows table) ───────────────────
  const filteredRows = useMemo(() => {
    if (activeFilter === 'all') return allKeywordRows;
    const segMap: Record<string, string> = {
      demand: 'Demand Winner', friction: 'Friction Keyword',
      hidden: 'Hidden Gem', low: 'Low Priority',
    };
    const seg = segMap[activeFilter];
    return allKeywordRows.filter(r => (r.segment ?? r.quadrant) === seg);
  }, [allKeywordRows, activeFilter]);

  // ── Friction clusters sorted by estimated gap desc ────────────────────────
  const frictionSorted = useMemo(() =>
    [...frictionClusters].sort((a, b) =>
      (b.estimated_revenue_leakage ?? b.estimated_revenue_gap ?? b.recoverable_revenue ?? 0) -
      (a.estimated_revenue_leakage ?? a.estimated_revenue_gap ?? a.recoverable_revenue ?? 0)
    ),
    [frictionClusters]
  );

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
      case 'high-revenue': return `High Revenue Potential Keywords — ${fmtVol(modalState.count)}`;
      case 'friction-kw': return `Friction Keywords — ${fmtVol(modalState.count)}`;
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
    demand: 'Demand Winner', friction: 'Friction Keyword',
    hidden: 'Hidden Gem', low: 'Low Priority',
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
          />
        )}
        {modalState?.kind === 'friction-kw' && (
          <FrictionKeywordsBody
            count={modalState.count}
            items={modalState.items}
            clusters={modalState.clusters}
            totalN={modalState.totalN}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard
          title="High Revenue Potential Keywords"
          value={fmtVol(highRevCount)}
          sub="Demand ≥ 60 AND Efficiency ≥ 60 · Click to view keywords"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          onClick={() => setModalState({
            kind: 'high-revenue',
            count: highRevCount,
            items: highRevItems,
            totalN: validRows,
          })}
        />
        <KpiCard
          title="Friction Keywords"
          value={fmtVol(frictionCount)}
          sub="Demand ≥ 60 AND Efficiency < 40 · Click to view keywords"
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          onClick={() => setModalState({
            kind: 'friction-kw',
            count: frictionCount,
            items: frictionItems,
            clusters: frictionClusterItems,
            totalN: validRows,
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
                label={{ value: 'Revenue Efficiency Index', angle: -90, position: 'insideLeft', offset: -28, style: { textAnchor: 'middle' }, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
              />
              <ReferenceLine x={60} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
              <ReferenceLine y={60} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
              <ReferenceLine x={40} stroke="hsl(var(--border))" strokeDasharray="2 6" strokeWidth={1} opacity={0.4} />
              <ReferenceLine y={40} stroke="hsl(var(--border))" strokeDasharray="2 6" strokeWidth={1} opacity={0.4} />
              <ReTooltip content={<ScatterTip />} />
              <Scatter
                data={displayScatter}
                isAnimationActive={false}
                onClick={(e: any) => { if (e?.payload) setModalState({ kind: 'keyword', kw: e.payload }); }}
              >
                {displayScatter.map((pt, i) => (
                  <Cell key={i} fill={dotColor(pt.quadrant)} fillOpacity={0.8} className="cursor-pointer" />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Segment legend / filter buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/50">
            {([
              { key: 'demand',  label: 'Demand Winners',   count: segCounts.demand_winners   ?? 0 },
              { key: 'hidden',  label: 'Hidden Gems',      count: segCounts.hidden_gems      ?? 0 },
              { key: 'friction',label: 'Friction Keywords',count: segCounts.friction_keywords ?? 0 },
              { key: 'low',     label: 'Low Priority',     count: segCounts.low_priority     ?? 0 },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(activeFilter === key ? 'all' : key)}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border text-left transition-colors',
                  activeFilter === key ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor(activeFilterLabel[key] ?? label) }} />
                <div>
                  <p className="text-xs font-semibold leading-tight">{label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{fmtVol(count)}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Keyword Rows table (individual keywords, never clustered) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyword Rows</CardTitle>
          <CardDescription>
            {activeFilter !== 'all'
              ? `Filtered: ${activeFilterLabel[activeFilter]} — ${fmtVol(filteredRows.length)} keywords`
              : `All ${fmtVol(allKeywordRows.length)} analyzed keywords`
            } · Click any row for full calculation evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={kwCols}
            data={filteredRows}
            pageSize={10}
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
            Friction keywords (Demand ≥ 60 AND Efficiency &lt; 40) grouped into clusters by phrase similarity.
            Broken fragments are merged into their parent cluster.
            Sorted by estimated revenue gap descending.
            {frictionSorted.length > 0 && ` ${fmtVol(frictionSorted.length)} cluster${frictionSorted.length === 1 ? '' : 's'} · ${fmtVol(frictionCount)} individual keywords.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {frictionSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No friction keywords found in this dataset.</p>
          ) : (
            <DataTable
              columns={frictionCols}
              data={frictionSorted}
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
