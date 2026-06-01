import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, TrendingUp, TrendingDown,
  Zap, Crown, Target, BarChart3, Lightbulb, Info, DollarSign,
  Activity, ArrowUpRight, ArrowDownRight, Layers,
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function segmentBadge(seg: string): string {
  switch (seg) {
    case 'Revenue Outlier':  return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
    case 'Highly Efficient': return 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30';
    case 'Market Normal':    return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
    case 'Underperforming':  return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
    case 'Revenue Leakage':  return 'bg-red-500/15 text-red-600 border-red-500/30';
    default:                 return 'bg-muted text-muted-foreground border-border';
  }
}

function quadrantDotColor(q: string): string {
  switch (q) {
    case 'Elite Performers':  return '#a855f7';
    case 'Revenue Outliers':  return '#10b981';
    case 'Revenue Leakage':   return '#ef4444';
    case 'Underperformers':   return '#64748b';
    default:                  return '#94a3b8';
  }
}

function efficiencyColor(score: number): string {
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-cyan-600';
  if (score >= 25) return 'text-orange-600';
  return 'text-red-600';
}

function gapColor(gap: number): string {
  if (gap > 20)  return 'text-emerald-600';
  if (gap > 10)  return 'text-cyan-600';
  if (gap >= -10) return 'text-blue-500';
  if (gap >= -20) return 'text-orange-600';
  return 'text-red-600';
}

function priorityBadge(p: string): string {
  switch (p) {
    case 'Critical': return 'bg-red-500/15 text-red-600 border-red-500/30';
    case 'High':     return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
    case 'Medium':   return 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
}

function causeBadge(c: string): string {
  switch (c) {
    case 'Weak Conversion':       return 'bg-red-500/10 text-red-600';
    case 'Pricing Issue':         return 'bg-orange-500/10 text-orange-600';
    case 'Traffic Deficit':       return 'bg-yellow-500/10 text-yellow-700';
    case 'Listing Quality Issue': return 'bg-purple-500/10 text-purple-600';
    default:                      return 'bg-blue-500/10 text-blue-600';
  }
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-64">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-xl leading-relaxed">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card — Compact & Premium
// ---------------------------------------------------------------------------

interface KpiProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
}

function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip }: KpiProps) {
  return (
    <div className="group relative p-4 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">{title}</p>
          {tooltip && (
            <Tip text={tooltip}>
              <Info className="w-3 h-3 text-muted-foreground/40 cursor-help" />
            </Tip>
          )}
        </div>
        <div className={cn('p-1.5 rounded-lg border', bg)}>
          <span className={color}>{icon}</span>
        </div>
      </div>
      <p className={cn('text-2xl font-black tracking-tight leading-none', color)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug line-clamp-2">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scatter Tooltip
// ---------------------------------------------------------------------------

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl p-4 shadow-xl text-sm space-y-2 max-w-[240px]">
      <p className="font-bold text-xs leading-snug text-foreground border-b border-border/50 pb-2">{d.title || d.asin || '—'}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Revenue</p>
          <p className="text-xs font-semibold text-emerald-600">{formatCurrency(d.revenue)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">BSR</p>
          <p className="text-xs font-semibold">{d.bsr?.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Rev Pct</p>
          <p className="text-xs font-mono">{d.revenue_percentile?.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">BSR Pct</p>
          <p className="text-xs font-mono">{d.bsr_percentile?.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Gap</p>
          <p className={cn('text-xs font-bold font-mono', gapColor(d.revenue_rank_gap ?? 0))}>
            {(d.revenue_rank_gap ?? 0) > 0 ? '+' : ''}{d.revenue_rank_gap?.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Efficiency</p>
          <p className="text-xs font-mono">{d.efficiency_score?.toFixed(1)}/100</p>
        </div>
      </div>
      <div className="pt-2 border-t border-border/50">
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider', segmentBadge(d.segment))}>{d.segment}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Efficiency Ring (mini donut)
// ---------------------------------------------------------------------------

function EfficiencyRing({ score }: { score: number }) {
  const size = 56;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#06b6d4' : score >= 25 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <span className="absolute text-xs font-black font-mono" style={{ color }}>{score.toFixed(0)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BsrEfficiency() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bsr-efficiency'],
    queryFn: () => api.getBsrEfficiency(50),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Analyzing Product Efficiency...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/30 bg-danger/5 mt-10 max-w-2xl mx-auto">
        <CardContent className="p-10 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">BSR Efficiency Unavailable</h2>
          <p className="text-danger/70 max-w-lg text-sm">{getEngineErrorMessage(data, 'Required BSR and Revenue columns not found in product dataset.')}</p>
        </CardContent>
      </Card>
    );
  }

  const r = data.data?.results || {};
  const scatter: any[]  = r.scatter_data || [];
  const outliers: any[] = r.revenue_outliers || [];
  const leakage: any[]  = r.revenue_leakage || [];
  const elite: any[]    = r.elite_performers || [];
  const qs              = r.quadrant_summary || {};
  const mh              = r.market_health || {};
  const topOutlier      = r.largest_revenue_outlier || {};
  const topLeakage      = r.largest_revenue_leakage || {};
  const benchmark       = r.elite_benchmark || {};

  const top5Recovery = leakage
    .slice()
    .sort((a: any, b: any) => (b.revenue_recovery ?? 0) - (a.revenue_recovery ?? 0))
    .slice(0, 5)
    .reduce((sum: number, p: any) => sum + (p.revenue_recovery ?? 0), 0);
  const totalRecoverable = r.total_recoverable_revenue ?? 0;
  const recoveryConcentrationPct = totalRecoverable > 0
    ? Math.round((top5Recovery / totalRecoverable) * 100) : 0;
  const totalProducts = r.total_products_analysed ?? 1;
  const avgEfficiency = r.average_category_efficiency ?? 0;

  // ── Table Columns ──────────────────────────────────────────────────────

  const baseColumns: Column<any>[] = [
    {
      header: 'Product',
      accessorKey: 'title',
      cell: (row) => (
        <div className="max-w-[220px]">
          <p className="font-medium text-sm truncate" title={row.title}>{row.title || row.asin || '—'}</p>
          {row.asin && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{row.asin}</p>}
        </div>
      ),
    },
    {
      header: 'Revenue',
      accessorKey: 'revenue',
      cell: (row) => <span className="font-mono text-sm font-medium">{row.revenue != null ? formatCurrency(row.revenue) : '—'}</span>,
    },
    {
      header: 'BSR',
      accessorKey: 'bsr',
      cell: (row) => <span className="font-mono text-sm">{row.bsr != null ? row.bsr.toLocaleString() : '—'}</span>,
    },
    {
      header: 'Rev Pct',
      accessorKey: 'revenue_percentile',
      cell: (row) => <span className="font-mono text-sm">{row.revenue_percentile != null ? row.revenue_percentile.toFixed(1) : '—'}</span>,
    },
    {
      header: 'BSR Pct',
      accessorKey: 'bsr_percentile',
      cell: (row) => <span className="font-mono text-sm">{row.bsr_percentile != null ? row.bsr_percentile.toFixed(1) : '—'}</span>,
    },
    {
      header: 'Gap',
      accessorKey: 'revenue_rank_gap',
      cell: (row) => {
        const gap = row.revenue_rank_gap ?? 0;
        return (
          <span className={cn('font-mono font-bold text-sm', gapColor(gap))}>
            {gap > 0 ? '+' : ''}{gap.toFixed(1)}
          </span>
        );
      },
    },
    {
      header: 'Efficiency',
      accessorKey: 'efficiency_score',
      cell: (row) => {
        const s = row.efficiency_score ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', s >= 75 ? 'bg-emerald-500' : s >= 50 ? 'bg-cyan-500' : s >= 25 ? 'bg-orange-500' : 'bg-red-500')}
                style={{ width: `${s}%` }} />
            </div>
            <span className={cn('font-mono text-xs font-bold', efficiencyColor(s))}>{s.toFixed(1)}</span>
          </div>
        );
      },
    },
    {
      header: 'Segment',
      accessorKey: 'segment',
      cell: (row) => (
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider', segmentBadge(row.segment))}>
          {row.segment}
        </span>
      ),
    },
  ];

  const eliteColumns: Column<any>[] = [
    baseColumns[0], baseColumns[1], baseColumns[2], baseColumns[6],
    {
      header: 'Primary Advantage',
      accessorKey: 'primary_advantage',
      cell: (row) => {
        let adv = row.primary_advantage;
        if (!adv) {
          if (row.price && row.price > (row.category_avg_price || 0)) adv = 'Premium Pricing';
          else if (row.conversion_rate && row.conversion_rate > 10) adv = 'Strong Conversion';
          else if (row.rating && row.rating >= 4.5) adv = 'Product Differentiation';
          else if (row.review_count && row.review_count > 500) adv = 'Review Leadership';
          else adv = 'Brand Strength';
        }
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 uppercase tracking-wider">
            {adv}
          </span>
        );
      },
    },
  ];

  const leakageColumns: Column<any>[] = [
    baseColumns[0],
    baseColumns[1],
    {
      header: 'Expected Rev',
      accessorKey: 'expected_revenue',
      cell: (row) => row.expected_revenue != null
        ? <span className="font-mono text-sm text-muted-foreground">{formatCurrency(row.expected_revenue)}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      header: 'Recovery',
      accessorKey: 'revenue_recovery',
      cell: (row) => {
        const rec = row.revenue_recovery ?? 0;
        return rec > 0
          ? <span className="font-mono text-sm font-bold text-amber-600">+{formatCurrency(rec)}</span>
          : <span className="text-muted-foreground">—</span>;
      },
    },
    baseColumns[2],
    baseColumns[5],
    {
      header: 'Priority',
      accessorKey: 'opportunity_priority',
      cell: (row) => (
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider', priorityBadge(row.opportunity_priority ?? ''))}>
          {row.opportunity_priority ?? '—'}
        </span>
      ),
    },
    {
      header: 'Likely Cause',
      accessorKey: 'likely_cause',
      cell: (row) => (
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', causeBadge(row.likely_cause ?? ''))}>
          {row.likely_cause ?? '—'}
        </span>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-12">

      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-border/40 pb-6">
        <div>
          <Badge className="bg-primary/10 text-primary border-primary/20 mb-3 font-mono text-[10px] tracking-widest uppercase rounded-sm px-2.5 py-1">
            Performance Analytics
          </Badge>
          <h1 className="text-4xl font-black tracking-tight text-foreground">BSR Efficiency</h1>
          <p className="text-muted-foreground mt-2 text-base max-w-2xl">
            Market-relative product performance intelligence — which products outperform their rank, and where revenue is being lost.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <EfficiencyRing score={avgEfficiency} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Category Avg</p>
            <p className={cn('text-lg font-black font-mono', efficiencyColor(avgEfficiency))}>{avgEfficiency.toFixed(1)}/100</p>
          </div>
        </div>
      </div>

      {/* ═══ KPI GRID ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Revenue Outliers"
          value={r.revenue_outlier_count ?? 0}
          sub="Products earning above rank expectations (Gap > +20)"
          icon={<ArrowUpRight className="w-4 h-4" />}
          color="text-emerald-600"
          bg="bg-emerald-500/10 border-emerald-500/30"
          tooltip="Products earning significantly more revenue than similarly ranked competitors."
        />
        <KpiCard
          title="Revenue Leakage"
          value={r.revenue_leakage_count ?? 0}
          sub="Products underperforming their rank (Gap < −20)"
          icon={<ArrowDownRight className="w-4 h-4" />}
          color="text-red-600"
          bg="bg-red-500/10 border-red-500/30"
          tooltip="Products with strong rank but weak monetisation. Highest optimization priority."
        />
        <KpiCard
          title="Elite Performers"
          value={r.elite_performer_count ?? 0}
          sub="Top quartile in both rank and revenue"
          icon={<Crown className="w-4 h-4" />}
          color="text-purple-600"
          bg="bg-purple-500/10 border-purple-500/30"
          tooltip="Products in the top 25% of both revenue and BSR percentile."
        />
        <KpiCard
          title="Recovery Opportunity"
          value={totalRecoverable > 0 ? formatCurrency(totalRecoverable) : '—'}
          sub={`Top 5 account for ${recoveryConcentrationPct}% of total`}
          icon={<DollarSign className="w-4 h-4" />}
          color="text-amber-600"
          bg="bg-amber-500/10 border-amber-500/30"
          tooltip="Estimated revenue upside if leakage products matched expected revenue for their BSR percentile."
        />
      </div>

      {/* ═══ INSIGHTS PANEL ═══ */}
      {(() => {
        const keyFinding = r.revenue_leakage_count > 0
          ? `${r.revenue_leakage_count} products monetise below category expectations — optimization opportunity exists.`
          : r.revenue_outlier_count > 0
            ? `${r.revenue_outlier_count} products outperform their rank — study their strategies.`
            : `Category efficiency is ${avgEfficiency}/100.`;

        const biggestOpp = leakage.length > 0
          ? leakage.slice().sort((a: any, b: any) => (b.revenue_recovery ?? 0) - (a.revenue_recovery ?? 0))[0]
          : null;

        const bestInClass = elite.length > 0
          ? elite.slice().sort((a: any, b: any) => (b.efficiency_score ?? 0) - (a.efficiency_score ?? 0))[0]
          : null;

        const causeCounts: Record<string, number> = {};
        leakage.forEach((p: any) => {
          if (p.likely_cause) causeCounts[p.likely_cause] = (causeCounts[p.likely_cause] || 0) + 1;
        });
        const topCause = Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0];
        const topCausePct = topCause && leakage.length > 0
          ? Math.round((topCause[1] / leakage.length) * 100) : 0;

        const panels = [
          { category: 'Key Finding', text: keyFinding, value: null, color: 'text-primary', bg: 'bg-primary/5 border-primary/20', icon: <Lightbulb className="w-4 h-4" /> },
          ...(biggestOpp ? [{ category: 'Biggest Opportunity', text: (biggestOpp.title || biggestOpp.asin || 'Unknown').slice(0, 60), value: `+${formatCurrency(biggestOpp.revenue_recovery ?? 0)} recovery potential`, color: 'text-amber-600', bg: 'bg-amber-500/5 border-amber-500/20', icon: <Target className="w-4 h-4" /> }] : []),
          ...(bestInClass ? [{ category: 'Best-in-Class', text: (bestInClass.title || bestInClass.asin || 'Unknown').slice(0, 60), value: `${(bestInClass.efficiency_score ?? 0).toFixed(1)}/100 efficiency`, color: 'text-purple-600', bg: 'bg-purple-500/5 border-purple-500/20', icon: <Crown className="w-4 h-4" /> }] : []),
          ...(topCause ? [{ category: 'Root Cause', text: topCause[0], value: `Affects ${topCausePct}% of leakage products`, color: 'text-red-600', bg: 'bg-red-500/5 border-red-500/20', icon: <AlertCircle className="w-4 h-4" /> }] : []),
        ];

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {panels.map((p, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn('rounded-xl border p-5 space-y-3', p.bg)}>
                <div className="flex items-center gap-2">
                  <span className={p.color}>{p.icon}</span>
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest', p.color)}>{p.category}</span>
                </div>
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2" title={p.text}>{p.text}</p>
                {p.value && <p className="text-xs text-muted-foreground">{p.value}</p>}
              </motion.div>
            ))}
          </div>
        );
      })()}

      {/* ═══ TOP RECOVERY OPPORTUNITIES ═══ */}
      {leakage.length > 0 && (() => {
        const top3 = leakage
          .slice()
          .sort((a: any, b: any) => (b.revenue_recovery ?? 0) - (a.revenue_recovery ?? 0))
          .slice(0, 3);
        return (
          <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
            <CardHeader className="pb-3 relative z-10">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-600" />
                <CardTitle className="text-base font-bold">Top Recovery Opportunities</CardTitle>
              </div>
              <CardDescription>Highest ROI optimization targets — fix these first</CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {top3.map((p: any, i: number) => (
                  <div key={i} className="rounded-xl bg-card border border-border/50 p-5 space-y-3 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <span className="w-7 h-7 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center text-xs font-black">
                        #{i + 1}
                      </span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider', priorityBadge(p.opportunity_priority ?? ''))}>
                        {p.opportunity_priority ?? '—'}
                      </span>
                    </div>
                    <p className="text-sm font-bold leading-snug line-clamp-2 text-foreground" title={p.title || p.asin}>
                      {(p.title || p.asin || 'Unknown product').slice(0, 60)}
                    </p>
                    <div className="space-y-1.5 pt-2 border-t border-border/40">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Recovery</span>
                        <span className="text-sm font-black font-mono text-amber-600">+{formatCurrency(p.revenue_recovery ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Cause</span>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', causeBadge(p.likely_cause ?? ''))}>
                          {p.likely_cause ?? '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ═══ SCATTER MATRIX + QUADRANT BREAKDOWN ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Revenue vs Rank Matrix</CardTitle>
            <CardDescription>
              X = BSR Percentile (right = better rank). Y = Revenue Percentile (up = more revenue). Quadrants reveal strategic positioning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute inset-0 pointer-events-none z-10" style={{ top: 8, left: 48, right: 16, bottom: 40 }}>
                <div className="absolute top-2 right-2 text-[10px] text-purple-500/70 font-bold uppercase tracking-wider">Elite ↗</div>
                <div className="absolute top-2 left-2 text-[10px] text-emerald-500/70 font-bold uppercase tracking-wider">↖ Outliers</div>
                <div className="absolute bottom-2 right-2 text-[10px] text-red-500/70 font-bold uppercase tracking-wider">Leakage ↘</div>
                <div className="absolute bottom-2 left-2 text-[10px] text-slate-400/70 font-bold uppercase tracking-wider">↙ Under</div>
              </div>
              <ResponsiveContainer width="100%" height={380}>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 40, left: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" dataKey="bsr_percentile" domain={[0, 100]} name="BSR Percentile"
                    label={{ value: 'BSR Percentile →', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis type="number" dataKey="revenue_percentile" domain={[0, 100]} name="Revenue Percentile"
                    label={{ value: 'Revenue Pct', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <ReferenceLine x={50} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
                  <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
                  <ReTooltip content={<ScatterTip />} />
                  <Scatter data={scatter} isAnimationActive={false}>
                    {scatter.map((pt, i) => (
                      <Cell key={i} fill={quadrantDotColor(pt.quadrant)} fillOpacity={0.75} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-5 mt-3 pt-3 border-t border-border/30 justify-center">
              {[
                { label: 'Elite Performers', color: '#a855f7' },
                { label: 'Revenue Outliers', color: '#10b981' },
                { label: 'Revenue Leakage', color: '#ef4444' },
                { label: 'Underperformers', color: '#64748b' },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quadrant + Health Sidebar */}
        <div className="space-y-5">
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> Quadrant Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                { label: 'Elite Performers', count: qs.elite_performers ?? 0, color: 'text-purple-600', bg: 'bg-purple-500/10', bar: 'bg-purple-500' },
                { label: 'Revenue Outliers', count: qs.revenue_outliers ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500' },
                { label: 'Revenue Leakage', count: qs.revenue_leakage ?? 0, color: 'text-red-600', bg: 'bg-red-500/10', bar: 'bg-red-500' },
                { label: 'Underperformers', count: qs.underperformers ?? 0, color: 'text-slate-500', bg: 'bg-muted/50', bar: 'bg-slate-400' },
              ].map((q) => {
                const pct = totalProducts > 0 ? Math.round((q.count / totalProducts) * 100) : 0;
                return (
                  <div key={q.label} className={cn('rounded-lg p-3', q.bg)}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className={cn('text-xs font-bold', q.color)}>{q.label}</span>
                      <span className="text-xs font-mono text-muted-foreground">{q.count} ({pct}%)</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', q.bar)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Category Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Efficiency Status', value: mh.category_efficiency_status ?? '—' },
                { label: 'Monetization Quality', value: mh.monetization_quality ?? '—' },
                { label: 'Opportunity Density', value: mh.opportunity_density ?? '—' },
                { label: 'Recoverable Pool', value: mh.recoverable_revenue_pool != null ? formatCurrency(mh.recoverable_revenue_pool) : '—' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-bold text-foreground">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {benchmark.benchmark_efficiency > 0 && (
            <Card className="border-purple-500/20 bg-purple-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-purple-600 flex items-center gap-2">
                  <Crown className="w-3.5 h-3.5" /> Elite Benchmark
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: 'Median Revenue', value: formatCurrency(benchmark.benchmark_revenue ?? 0) },
                  { label: 'Median BSR', value: Math.round(benchmark.benchmark_bsr ?? 0).toLocaleString() },
                  { label: 'Median Efficiency', value: `${(benchmark.benchmark_efficiency ?? 0).toFixed(1)}/100` },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-purple-500/10 last:border-0">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-xs font-bold font-mono text-purple-600">{item.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ═══ DATA TABLES ═══ */}
      <Card className="border-border/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <CardTitle className="text-base font-bold">Revenue Outliers</CardTitle>
          </div>
          <CardDescription>
            Products generating significantly more revenue than their rank predicts. Gap &gt; +20 percentile points.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outliers.length === 0
            ? <p className="text-sm text-muted-foreground py-6 text-center">No revenue outliers detected in this dataset.</p>
            : <DataTable columns={baseColumns} data={outliers} pageSize={10} />
          }
        </CardContent>
      </Card>

      <Card className="border-border/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-600" />
            <CardTitle className="text-base font-bold">Revenue Leakage Opportunities</CardTitle>
          </div>
          <CardDescription>
            Products ranking well but failing to monetise. Sorted by optimization priority with expected revenue, recovery potential, and root cause.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leakage.length === 0
            ? <p className="text-sm text-muted-foreground py-6 text-center">No revenue leakage products detected.</p>
            : <DataTable columns={leakageColumns} data={leakage} pageSize={10} />
          }
        </CardContent>
      </Card>

      <Card className="border-border/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-purple-600" />
            <CardTitle className="text-base font-bold">Elite Performers</CardTitle>
          </div>
          <CardDescription>
            Products in the top quartile of both revenue and rank. Category benchmarks — these define best-in-class.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {elite.length === 0
            ? <p className="text-sm text-muted-foreground py-6 text-center">No elite performers detected (requires top-25% on both metrics).</p>
            : <DataTable columns={eliteColumns} data={elite} pageSize={10} />
          }
        </CardContent>
      </Card>

    </motion.div>
  );
}
