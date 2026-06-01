import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, TrendingUp, TrendingDown,
  Zap, Crown, Target, BarChart3, Lightbulb, Info, DollarSign,
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
    case 'Revenue Outlier':  return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'Highly Efficient': return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    case 'Market Normal':    return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'Underperforming':  return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'Revenue Leakage':  return 'bg-red-500/15 text-red-400 border-red-500/30';
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
  if (score >= 75) return 'text-emerald-500';
  if (score >= 50) return 'text-cyan-500';
  if (score >= 25) return 'text-orange-500';
  return 'text-red-500';
}

function gapColor(gap: number): string {
  if (gap > 20)  return 'text-emerald-500';
  if (gap > 10)  return 'text-cyan-500';
  if (gap >= -10) return 'text-blue-400';
  if (gap >= -20) return 'text-orange-500';
  return 'text-red-500';
}

function priorityBadge(p: string): string {
  switch (p) {
    case 'Critical': return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'High':     return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'Medium':   return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
}

function causeBadge(c: string): string {
  switch (c) {
    case 'Weak Conversion':      return 'bg-red-500/10 text-red-400';
    case 'Pricing Issue':        return 'bg-orange-500/10 text-orange-400';
    case 'Traffic Deficit':      return 'bg-yellow-500/10 text-yellow-400';
    case 'Listing Quality Issue':return 'bg-purple-500/10 text-purple-400';
    default:                     return 'bg-blue-500/10 text-blue-400'; // Review Deficit
  }
}

// ---------------------------------------------------------------------------
// Tooltip wrapper
// ---------------------------------------------------------------------------

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-60">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card
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
    <Card className="hover-card-anim">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
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
        <p className={cn('text-3xl font-bold', color)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Scatter tooltip
// ---------------------------------------------------------------------------

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-w-[220px]">
      <p className="font-semibold text-xs leading-snug">{d.title || d.asin || '—'}</p>
      <div className="border-t border-border/50 pt-1 space-y-0.5">
        <p className="text-muted-foreground">Revenue: <span className="text-foreground font-medium">{formatCurrency(d.revenue)}</span></p>
        <p className="text-muted-foreground">BSR: <span className="text-foreground font-medium">{d.bsr?.toLocaleString()}</span></p>
        <p className="text-muted-foreground">Rev Pct: <span className="text-foreground font-medium">{d.revenue_percentile?.toFixed(1)}</span></p>
        <p className="text-muted-foreground">BSR Pct: <span className="text-foreground font-medium">{d.bsr_percentile?.toFixed(1)}</span></p>
        <p className="text-muted-foreground">Gap: <span className={cn('font-medium', gapColor(d.revenue_rank_gap ?? 0))}>{(d.revenue_rank_gap ?? 0) > 0 ? '+' : ''}{d.revenue_rank_gap?.toFixed(1)}</span></p>
        <p className="text-muted-foreground">Efficiency: <span className="text-foreground font-medium">{d.efficiency_score?.toFixed(1)}/100</span></p>
        <span className={cn('text-xs px-1.5 py-0.5 rounded-full border font-medium', segmentBadge(d.segment))}>{d.segment}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BsrEfficiency() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bsr-efficiency'],
    queryFn: () => api.getBsrEfficiency(50),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">BSR Efficiency Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Required BSR and Revenue columns not found in product dataset.')}</p>
        </CardContent>
      </Card>
    );
  }

  const r = data.data?.results || {};
  const scatter: any[]       = r.scatter_data        || [];
  const outliers: any[]      = r.revenue_outliers     || [];
  const leakage: any[]       = r.revenue_leakage      || [];
  const elite: any[]         = r.elite_performers     || [];
  const qs                   = r.quadrant_summary     || {};
  const mh                   = r.market_health        || {};
  const topOutlier           = r.largest_revenue_outlier || {};
  const topLeakage           = r.largest_revenue_leakage || {};
  const benchmark            = r.elite_benchmark      || {};

  // Recovery concentration: top 5 leakage products / total recoverable
  const top5Recovery = leakage
    .slice()
    .sort((a: any, b: any) => (b.revenue_recovery ?? 0) - (a.revenue_recovery ?? 0))
    .slice(0, 5)
    .reduce((sum: number, p: any) => sum + (p.revenue_recovery ?? 0), 0);
  const totalRecoverable = r.total_recoverable_revenue ?? 0;
  const recoveryConcentrationPct = totalRecoverable > 0
    ? Math.round((top5Recovery / totalRecoverable) * 100)
    : 0;

  // Total products for quadrant percentages
  const totalProducts = r.total_products_analysed ?? 1;

  // ── Table column definitions ─────────────────────────────────────────────

  const baseColumns: Column<any>[] = [
    {
      header: 'Product',
      accessorKey: 'title',
      cell: (row) => (
        <div className="max-w-[200px]">
          <p className="font-medium text-sm truncate" title={row.title}>{row.title || row.asin || '—'}</p>
          {row.asin && <p className="text-xs text-muted-foreground font-mono">{row.asin}</p>}
        </div>
      ),
    },
    {
      header: 'Revenue',
      accessorKey: 'revenue',
      cell: (row) => row.revenue != null ? formatCurrency(row.revenue) : '—',
    },
    {
      header: 'BSR',
      accessorKey: 'bsr',
      cell: (row) => row.bsr != null ? row.bsr.toLocaleString() : '—',
    },
    {
      header: 'Rev Pct',
      accessorKey: 'revenue_percentile',
      cell: (row) => row.revenue_percentile != null ? `${row.revenue_percentile.toFixed(1)}` : '—',
    },
    {
      header: 'BSR Pct',
      accessorKey: 'bsr_percentile',
      cell: (row) => row.bsr_percentile != null ? `${row.bsr_percentile.toFixed(1)}` : '—',
    },
    {
      header: 'Gap',
      accessorKey: 'revenue_rank_gap',
      cell: (row) => {
        const gap = row.revenue_rank_gap ?? 0;
        return (
          <span className={cn('font-mono font-semibold text-sm', gapColor(gap))}>
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
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', s >= 75 ? 'bg-emerald-500' : s >= 50 ? 'bg-cyan-500' : s >= 25 ? 'bg-orange-500' : 'bg-red-500')}
                style={{ width: `${s}%` }} />
            </div>
            <span className={cn('font-mono text-sm font-medium', efficiencyColor(s))}>{s.toFixed(1)}</span>
          </div>
        );
      },
    },
    {
      header: 'Segment',
      accessorKey: 'segment',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium border', segmentBadge(row.segment))}>
          {row.segment}
        </span>
      ),
    },
  ];

  const eliteColumns: Column<any>[] = [
    baseColumns[0], // Product
    baseColumns[1], // Revenue
    baseColumns[2], // BSR
    baseColumns[6], // Efficiency
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
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {adv}
          </span>
        );
      },
    },
    {
      header: 'Elite Median Rev',
      accessorKey: 'revenue',
      cell: () => benchmark.benchmark_revenue
        ? <span className="text-xs text-purple-400 font-mono">{formatCurrency(benchmark.benchmark_revenue)}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      header: 'Elite Median BSR',
      accessorKey: 'bsr',
      cell: () => benchmark.benchmark_bsr
        ? <span className="text-xs text-purple-400 font-mono">{Math.round(benchmark.benchmark_bsr).toLocaleString()}</span>
        : <span className="text-muted-foreground">—</span>,
    },
  ];

  const leakageColumns: Column<any>[] = [
    baseColumns[0], // Product
    baseColumns[1], // Revenue
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
          ? <span className="font-mono text-sm font-semibold text-amber-500">+{formatCurrency(rec)}</span>
          : <span className="text-muted-foreground">—</span>;
      },
    },
    baseColumns[2], // BSR
    baseColumns[5], // Gap
    {
      header: 'Priority',
      accessorKey: 'opportunity_priority',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold border', priorityBadge(row.opportunity_priority ?? ''))}>
          {row.opportunity_priority ?? '—'}
        </span>
      ),
    },
    {
      header: 'Likely Cause',
      accessorKey: 'likely_cause',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', causeBadge(row.likely_cause ?? ''))}>
          {row.likely_cause ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">BSR Efficiency</h1>
        <p className="text-muted-foreground mt-1">
          Market-relative product performance intelligence — which products outperform their rank, and where revenue is being lost.
        </p>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard
          title="Avg Efficiency"
          value={`${r.average_category_efficiency ?? 0} / 100`}
          sub="Category benchmark"
          icon={<BarChart3 className="w-4 h-4" />}
          color={efficiencyColor(r.average_category_efficiency ?? 0)}
          bg={r.average_category_efficiency >= 65 ? 'bg-emerald-500/10 border-emerald-500/30'
            : r.average_category_efficiency >= 40 ? 'bg-cyan-500/10 border-cyan-500/30'
            : 'bg-orange-500/10 border-orange-500/30'}
          tooltip="Average efficiency score across all products. Derived from revenue-rank gap, revenue percentile, and BSR percentile."
        />
        <KpiCard
          title="Revenue Outliers"
          value={r.revenue_outlier_count ?? 0}
          sub="Gap > +20 pts"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          tooltip="Products earning significantly more revenue than similarly ranked competitors. Gap > +20 percentile points."
        />
        <KpiCard
          title="Revenue Leakage"
          value={r.revenue_leakage_count ?? 0}
          sub="Gap < −20 pts"
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          tooltip="Products with strong rank but weak monetisation. Gap < −20 percentile points. Highest optimization priority."
        />
        <KpiCard
          title="Elite Performers"
          value={r.elite_performer_count ?? 0}
          sub="Top quartile rank + revenue"
          icon={<Crown className="w-4 h-4" />}
          color="text-purple-400"
          bg="bg-purple-500/10 border-purple-500/30"
          tooltip="Products in the top 25% of both revenue percentile and BSR percentile. Category benchmarks."
        />
        <KpiCard
          title="Revenue Recovery Opportunity"
          value={r.total_recoverable_revenue != null ? formatCurrency(r.total_recoverable_revenue) : '—'}
          sub={`Estimated upside from underperforming listings`}
          icon={<DollarSign className="w-4 h-4" />}
          color="text-amber-500"
          bg="bg-amber-500/10 border-amber-500/30"
          tooltip="Estimated revenue upside if leakage products matched the expected revenue for their BSR percentile. Not a guaranteed recovery — indicates optimization potential."
        />
        <KpiCard
          title="Recovery Concentration"
          value={`${recoveryConcentrationPct}%`}
          sub={`Top 5 products account for ${recoveryConcentrationPct}% of total recovery opportunity`}
          icon={<BarChart3 className="w-4 h-4" />}
          color="text-blue-500"
          bg="bg-blue-500/10 border-blue-500/30"
          tooltip="Percentage of the total revenue recovery opportunity concentrated in the top 5 leakage products."
        />
        <KpiCard
          title="Top Outlier"
          value={topOutlier.gap != null ? `+${topOutlier.gap.toFixed(0)} pts` : '—'}
          sub={(topOutlier.title || topOutlier.asin || '—').slice(0, 28)}
          icon={<Zap className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          tooltip="The product with the largest positive revenue-rank gap. Earns the most revenue relative to its rank."
        />
        <KpiCard
          title="Top Leakage"
          value={topLeakage.gap != null ? `${topLeakage.gap.toFixed(0)} pts` : '—'}
          sub={(topLeakage.title || topLeakage.asin || '—').slice(0, 28)}
          icon={<Target className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          tooltip="The product with the largest negative revenue-rank gap. Ranks well but monetises far below expectations."
        />
      </div>

      {/* ── Product Intelligence ── */}
      {(() => {
        // Key finding
        const keyFinding = r.revenue_leakage_count > 0
          ? `${r.revenue_leakage_count} products monetise below category expectations.`
          : r.revenue_outlier_count > 0
            ? `${r.revenue_outlier_count} products outperform their rank.`
            : `Category efficiency is ${r.average_category_efficiency ?? 0}/100.`;

        // Biggest opportunity — top leakage product by recovery
        const biggestOpp = leakage.length > 0
          ? leakage.slice().sort((a: any, b: any) => (b.revenue_recovery ?? 0) - (a.revenue_recovery ?? 0))[0]
          : null;

        // Best-in-class — top elite by efficiency
        const bestInClass = elite.length > 0
          ? elite.slice().sort((a: any, b: any) => (b.efficiency_score ?? 0) - (a.efficiency_score ?? 0))[0]
          : null;

        // Most common leakage cause
        const causeCounts: Record<string, number> = {};
        leakage.forEach((p: any) => {
          if (p.likely_cause) causeCounts[p.likely_cause] = (causeCounts[p.likely_cause] || 0) + 1;
        });
        const topCause = Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0];
        const topCausePct = topCause && leakage.length > 0
          ? Math.round((topCause[1] / leakage.length) * 100)
          : 0;

        const panels = [
          {
            category: 'KEY FINDING',
            text: keyFinding,
            value: null,
            border: 'border-purple-500/30', badge: 'bg-purple-500/10 text-purple-400', dot: 'bg-purple-500',
          },
          ...(biggestOpp ? [{
            category: 'BIGGEST OPPORTUNITY',
            text: biggestOpp.title || biggestOpp.asin || 'Unknown product',
            value: `+${formatCurrency(biggestOpp.revenue_recovery ?? 0)} recovery opportunity.`,
            border: 'border-amber-500/30', badge: 'bg-amber-500/10 text-amber-400', dot: 'bg-amber-500',
          }] : []),
          ...(bestInClass ? [{
            category: 'BEST-IN-CLASS PRODUCT',
            text: bestInClass.title || bestInClass.asin || 'Unknown product',
            value: `${(bestInClass.efficiency_score ?? 0).toFixed(1)} efficiency score.`,
            border: 'border-purple-500/30', badge: 'bg-purple-500/10 text-purple-400', dot: 'bg-purple-500',
          }] : []),
          ...(topCause ? [{
            category: 'MOST COMMON ISSUE',
            text: topCause[0],
            value: `Appears across ${topCausePct}% of leakage products.`,
            border: 'border-red-500/30', badge: 'bg-red-500/10 text-red-400', dot: 'bg-red-500',
          }] : []),
        ];

        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                <CardTitle className="text-base">Product Intelligence</CardTitle>
              </div>
              <CardDescription>Prioritized business findings from market-relative performance analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {panels.map((p, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={cn('rounded-xl border p-4 space-y-2 flex flex-col', p.border)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', p.dot)} />
                      <span className={cn('text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', p.badge)}>
                        {p.category}
                      </span>
                    </div>
                    <div className="text-sm text-foreground/90 leading-snug flex-grow">
                      <span className="block font-medium line-clamp-2" title={p.text}>{p.text}</span>
                      {p.value && <span className="block text-muted-foreground mt-1">{p.value}</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Executive Action Panel ── */}
      {leakage.length > 0 && (() => {
        const top3 = leakage
          .slice()
          .sort((a: any, b: any) => (b.revenue_recovery ?? 0) - (a.revenue_recovery ?? 0))
          .slice(0, 3);
        return (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base">Top Recovery Opportunities</CardTitle>
              </div>
              <CardDescription>Highest ROI optimization targets — fix these first</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {top3.map((p: any, i: number) => (
                  <div key={i} className="rounded-xl bg-card border border-border/60 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        #{i + 1}
                      </span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold border', priorityBadge(p.opportunity_priority ?? ''))}>
                        {p.opportunity_priority ?? '—'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold leading-snug line-clamp-2" title={p.title || p.asin}>
                      {(p.title || p.asin || 'Unknown product').slice(0, 55)}
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Potential Recovery: <span className="text-amber-500 font-semibold">+{formatCurrency(p.revenue_recovery ?? 0)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Likely Cause: <span className={cn('font-medium', causeBadge(p.likely_cause ?? '').replace('bg-', 'text-').replace('/10', ''))}>
                          {p.likely_cause ?? '—'}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Table 1: Revenue Outliers ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <CardTitle className="text-base">Revenue Outliers</CardTitle>
          </div>
          <CardDescription>
            Products generating significantly more revenue than their rank would predict. Gap &gt; +20 percentile points. Sorted by highest gap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outliers.length === 0
            ? <p className="text-sm text-muted-foreground py-4 text-center">No revenue outliers detected in this dataset.</p>
            : <DataTable columns={baseColumns} data={outliers} pageSize={10} />
          }
        </CardContent>
      </Card>

      {/* ── Table 2: Revenue Leakage ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <CardTitle className="text-base">Revenue Leakage Opportunities</CardTitle>
          </div>
          <CardDescription>
            Products ranking well but failing to monetise. Sorted by optimization priority. Shows expected revenue, recovery potential, and likely root cause.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leakage.length === 0
            ? <p className="text-sm text-muted-foreground py-4 text-center">No revenue leakage products detected.</p>
            : <DataTable columns={leakageColumns} data={leakage} pageSize={10} />
          }
        </CardContent>
      </Card>

      {/* ── Table 3: Elite Performers ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-purple-400" />
            <CardTitle className="text-base">Elite Performers</CardTitle>
          </div>
          <CardDescription>
            Products in the top quartile of both revenue and rank. Category benchmarks — these define what best-in-class looks like.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {elite.length === 0
            ? <p className="text-sm text-muted-foreground py-4 text-center">No elite performers detected (requires top-25% on both metrics).</p>
            : <DataTable columns={eliteColumns} data={elite} pageSize={10} />
          }
        </CardContent>
      </Card>

      {/* ── Scatter Matrix + Quadrant Summary (secondary — for deeper analysis) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue vs Rank Opportunity Matrix</CardTitle>
            <CardDescription>
              Each dot is a product. X = BSR Percentile (right = better rank). Y = Revenue Percentile (up = more revenue).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute inset-0 pointer-events-none z-10" style={{ top: 8, left: 48, right: 16, bottom: 40 }}>
                <div className="absolute top-1 right-1 text-xs text-purple-400/60 font-medium">Elite Performers ↗</div>
                <div className="absolute top-1 left-1 text-xs text-emerald-400/60 font-medium">↖ Revenue Outliers</div>
                <div className="absolute bottom-1 right-1 text-xs text-red-400/60 font-medium">Revenue Leakage ↘</div>
                <div className="absolute bottom-1 left-1 text-xs text-slate-400/60 font-medium">↙ Underperformers</div>
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 40, left: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis type="number" dataKey="bsr_percentile" domain={[0, 100]} name="BSR Percentile"
                    label={{ value: 'BSR Percentile →', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis type="number" dataKey="revenue_percentile" domain={[0, 100]} name="Revenue Percentile"
                    label={{ value: 'Revenue Percentile', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
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
            <div className="flex flex-wrap gap-4 mt-2 text-xs justify-center">
              {[
                { label: 'Elite Performers', color: '#a855f7' },
                { label: 'Revenue Outliers', color: '#10b981' },
                { label: 'Revenue Leakage',  color: '#ef4444' },
                { label: 'Underperformers',  color: '#64748b' },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quadrant counts + Category Health + Elite Benchmark */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quadrant Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Elite Performers', count: qs.elite_performers ?? 0, color: 'text-purple-400',  bg: 'bg-purple-500/10',  desc: 'Strong rank + strong revenue' },
                { label: 'Revenue Outliers', count: qs.revenue_outliers  ?? 0, color: 'text-emerald-500', bg: 'bg-emerald-500/10', desc: 'Weak rank, high revenue' },
                { label: 'Revenue Leakage',  count: qs.revenue_leakage   ?? 0, color: 'text-red-500',    bg: 'bg-red-500/10',     desc: 'Strong rank, low revenue' },
                { label: 'Underperformers',  count: qs.underperformers   ?? 0, color: 'text-slate-400',  bg: 'bg-muted',          desc: 'Weak rank + weak revenue' },
              ].map((q) => {
                const pct = totalProducts > 0 ? Math.round((q.count / totalProducts) * 100) : 0;
                return (
                  <div key={q.label} className={cn('rounded-xl p-3 flex items-center justify-between', q.bg)}>
                    <div>
                      <p className={cn('text-sm font-semibold', q.color)}>{q.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{q.count} products ({pct}%)</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Category Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'Efficiency Status',    value: mh.category_efficiency_status ?? '—', sub: 'Overall monetisation quality' },
                { label: 'Monetization Quality', value: mh.monetization_quality       ?? '—', sub: 'Leakage prevalence' },
                { label: 'Opportunity Density',  value: mh.opportunity_density        ?? '—', sub: 'Outlier prevalence' },
                { label: 'Recoverable Pool',     value: mh.recoverable_revenue_pool != null ? formatCurrency(mh.recoverable_revenue_pool) : '—', sub: 'Total leakage recovery potential' },
              ].map((item) => (
                <div key={item.label} className="py-2 border-b border-border/40 last:border-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-foreground/80 mt-0.5 leading-snug">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {benchmark.benchmark_efficiency > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-3.5 h-3.5 text-purple-400" />
                  <CardTitle className="text-sm">Elite Benchmark</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {benchmark.best_product_title && (
                  <p className="text-xs font-medium text-foreground/80 leading-snug truncate" title={benchmark.best_product_title}>
                    {benchmark.best_product_title}
                  </p>
                )}
                {[
                  { label: 'Elite Median Revenue',    value: formatCurrency(benchmark.benchmark_revenue ?? 0) },
                  { label: 'Elite Median BSR',        value: Math.round(benchmark.benchmark_bsr ?? 0).toLocaleString() },
                  { label: 'Elite Median Efficiency', value: `${(benchmark.benchmark_efficiency ?? 0).toFixed(1)} / 100` },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center py-1 border-b border-border/30 last:border-0">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <span className="text-xs font-bold font-mono text-purple-400">{item.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </motion.div>
  );
}
