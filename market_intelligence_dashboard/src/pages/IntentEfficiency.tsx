import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, TrendingUp, TrendingDown, Zap,
  Target, Lightbulb, Info, AlertTriangle,
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function efficiencyColor(score: number): string {
  if (score >= 75) return 'text-emerald-500';
  if (score >= 50) return 'text-cyan-500';
  if (score >= 25) return 'text-orange-500';
  return 'text-red-500';
}

function efficiencyBar(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-cyan-500';
  if (score >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}

function opportunityBadge(level: string): string {
  switch (level) {
    case 'Critical': return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'High':     return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'Moderate': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
}

function quadrantDotColor(q: string): string {
  switch (q) {
    case 'Demand Winner':    return '#a855f7';
    case 'Hidden Gem':       return '#10b981';
    case 'Friction Keyword': return '#ef4444';
    case 'Low Priority':     return '#64748b';
    default:                 return '#94a3b8';
  }
}

function formatShare(v: number | null | undefined): string {
  if (v == null) return '—';
  return v <= 1 ? `${(v * 100).toFixed(3)}%` : `${v.toFixed(3)}`;
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
        <p className={cn('text-2xl font-bold leading-tight', color)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 leading-snug">{sub}</p>}
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
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-w-[240px]">
      <p className="font-semibold text-xs leading-snug">{d.keyword || '—'}</p>
      <div className="border-t border-border/50 pt-1 space-y-0.5">
        <p className="text-muted-foreground">Search Volume: <span className="text-foreground font-medium">{d.search_volume?.toLocaleString() ?? '—'}</span></p>
        <p className="text-muted-foreground">Click Share: <span className="text-foreground font-medium">{formatShare(d.click_share)}</span></p>
        <p className="text-muted-foreground">Conv Share: <span className="text-foreground font-medium">{formatShare(d.conv_share)}</span></p>
        <p className="text-muted-foreground">Efficiency: <span className={cn('font-medium', efficiencyColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}/100</span></p>
        <span className="text-xs text-muted-foreground">{d.quadrant}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntentEfficiency() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(50),
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
          <h2 className="text-xl font-bold text-red-500 mb-2">Keyword Conversion Intelligence Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Missing ABA Click Share or Conversion Share in Magnet dataset.')}</p>
        </CardContent>
      </Card>
    );
  }

  const r = data.data?.results || {};
  const scatter: any[]        = r.scatter_data         || [];
  const winners: any[]        = r.demand_winners        || [];
  const friction: any[]       = r.friction_keywords     || [];
  const hiddenGems: any[]     = r.hidden_gems           || [];
  const insights: string[]    = r.insights              || [];
  const qs                    = r.quadrant_summary      || {};
  const ch                    = r.category_health       || {};
  const bestConverting        = r.best_converting_keyword  || {};
  const biggestFriction       = r.biggest_friction_keyword || {};
  const totalKeywords         = r.total_keywords_analysed  ?? 1;
  const dataQualityWarning    = ch.data_quality_warning    ?? false;

  // ── Table columns ──────────────────────────────────────────────────────────
  const keywordColumns: Column<any>[] = [
    {
      header: 'Keyword',
      accessorKey: 'keyword',
      cell: (row) => <span className="font-medium text-sm">{row.keyword || '—'}</span>,
    },
    {
      header: 'Search Volume',
      accessorKey: 'search_volume',
      cell: (row) => row.search_volume != null ? row.search_volume.toLocaleString() : '—',
    },
    {
      header: 'Click Share',
      accessorKey: 'click_share',
      cell: (row) => <span className="font-mono text-sm">{formatShare(row.click_share)}</span>,
    },
    {
      header: 'Conv Share',
      accessorKey: 'conv_share',
      cell: (row) => <span className="font-mono text-sm">{formatShare(row.conv_share)}</span>,
    },
    {
      header: 'Efficiency Score',
      accessorKey: 'efficiency_score',
      cell: (row) => {
        const s = row.efficiency_score ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', efficiencyBar(s))} style={{ width: `${s}%` }} />
            </div>
            <span className={cn('font-mono text-sm font-medium', efficiencyColor(s))}>{s.toFixed(1)}</span>
          </div>
        );
      },
    },
    {
      header: 'Opportunity',
      accessorKey: 'opportunity_level',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold border', opportunityBadge(row.opportunity_level ?? ''))}>
          {row.opportunity_level ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Keyword Conversion Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Identify which keywords successfully convert demand into sales and where revenue is leaking due to poor conversion efficiency.
        </p>
      </div>

      {/* Data quality warning */}
      {dataQualityWarning && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Data Quality Warning</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                More than 80% of Conversion Share values are identical in this dataset. Efficiency scores may not be meaningful.
                Ensure the Magnet export includes valid ABA Total Conv. Share data before interpreting results.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          title="High Intent Keywords"
          value={r.high_intent_count ?? 0}
          sub="Above-average conversion efficiency"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          tooltip="Keywords with conversion efficiency above the category median. These are your strongest demand-to-sales drivers."
        />
        <KpiCard
          title="Friction Keywords"
          value={r.friction_count ?? 0}
          sub="High clicks, low conversion"
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          tooltip="Keywords attracting significant clicks but failing to convert. Highest optimization priority."
        />
        <KpiCard
          title="Lost Revenue Opportunity"
          value={r.total_lost_revenue != null ? formatCurrency(r.total_lost_revenue) : '—'}
          sub="Estimated revenue trapped in friction keywords"
          icon={<Target className="w-4 h-4" />}
          color="text-amber-500"
          bg="bg-amber-500/10 border-amber-500/30"
          tooltip="Estimated revenue gap: expected revenue based on click share minus actual keyword sales. Indicates conversion optimization potential."
        />
        <KpiCard
          title="Best Converting Keyword"
          value={bestConverting.keyword ? bestConverting.keyword.slice(0, 22) + (bestConverting.keyword.length > 22 ? '…' : '') : '—'}
          sub={bestConverting.efficiency != null ? `${bestConverting.efficiency.toFixed(1)}/100 efficiency score` : 'No data'}
          icon={<Zap className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          tooltip="The keyword with the highest conversion efficiency score — strongest demand-to-sales performance."
        />
        <KpiCard
          title="Biggest Friction Keyword"
          value={biggestFriction.keyword ? biggestFriction.keyword.slice(0, 22) + (biggestFriction.keyword.length > 22 ? '…' : '') : '—'}
          sub={biggestFriction.gap != null ? `${biggestFriction.gap.toFixed(1)} pts gap (click vs conv)` : 'No friction detected'}
          icon={<AlertTriangle className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          tooltip="The keyword with the largest gap between click share and conversion share — the single biggest conversion leak."
        />
      </div>

      {/* Executive Insights */}
      {insights.length > 0 && (() => {
        // Build structured insight panels
        const causeCounts: Record<string, number> = {};
        friction.forEach((k: any) => {
          if (k.opportunity_level) causeCounts[k.opportunity_level] = (causeCounts[k.opportunity_level] || 0) + 1;
        });
        const topWinner = winners[0];

        const panels = [
          {
            category: 'KEY FINDING',
            text: insights[0] || `${r.high_intent_count ?? 0} keywords convert above category expectations.`,
            border: 'border-purple-500/30', badge: 'bg-purple-500/10 text-purple-400', dot: 'bg-purple-500',
          },
          ...(biggestFriction.keyword ? [{
            category: 'BIGGEST CONVERSION LEAK',
            text: `'${biggestFriction.keyword.slice(0, 50)}' attracts significant clicks but under-converts relative to demand.`,
            border: 'border-red-500/30', badge: 'bg-red-500/10 text-red-400', dot: 'bg-red-500',
          }] : []),
          ...(bestConverting.keyword ? [{
            category: 'BEST CONVERTING KEYWORD',
            text: `'${bestConverting.keyword.slice(0, 50)}' delivers the strongest demand-to-sales efficiency with ${(bestConverting.efficiency ?? 0).toFixed(1)}/100 score.`,
            border: 'border-emerald-500/30', badge: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500',
          }] : []),
          ...(topWinner ? [{
            category: 'HIGHEST DEMAND WINNER',
            text: `'${(topWinner.keyword || '—').slice(0, 50)}' combines strong search demand with high conversion efficiency — the top category performer.`,
            border: 'border-blue-500/30', badge: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-500',
          }] : []),
          ...(r.total_lost_revenue > 0 ? [{
            category: 'RECOVERABLE OPPORTUNITY',
            text: `Estimated ${formatCurrency(r.total_lost_revenue)} in revenue is trapped in friction keywords. Improving conversion on these keywords represents the highest ROI action.`,
            border: 'border-amber-500/30', badge: 'bg-amber-500/10 text-amber-400', dot: 'bg-amber-500',
          }] : []),
        ];

        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                <CardTitle className="text-base">Keyword Intelligence</CardTitle>
              </div>
              <CardDescription>Prioritized business findings from conversion analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                {panels.map((p, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={cn('rounded-xl border p-4 space-y-2', p.border)}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', p.dot)} />
                      <span className={cn('text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', p.badge)}>
                        {p.category}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{p.text}</p>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Keyword Opportunity Matrix + Quadrant Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Scatter — 2/3 width */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Keyword Opportunity Matrix</CardTitle>
            <CardDescription>
              X = Demand Strength (Search Volume Percentile) · Y = Conversion Efficiency. Hover for keyword details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute inset-0 pointer-events-none z-10" style={{ top: 8, left: 48, right: 16, bottom: 40 }}>
                <div className="absolute top-1 right-1 text-xs text-purple-400/60 font-medium">Demand Winners ↗</div>
                <div className="absolute top-1 left-1 text-xs text-emerald-400/60 font-medium">↖ Hidden Gems</div>
                <div className="absolute bottom-1 right-1 text-xs text-red-400/60 font-medium">Friction Keywords ↘</div>
                <div className="absolute bottom-1 left-1 text-xs text-slate-400/60 font-medium">↙ Low Priority</div>
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 40, left: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis type="number" dataKey="demand_percentile" domain={[0, 100]} name="Demand Strength"
                    label={{ value: 'Demand Strength →', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis type="number" dataKey="efficiency_score" domain={[0, 100]} name="Conversion Efficiency"
                    label={{ value: 'Conversion Efficiency', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
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
                { label: 'Demand Winners',    color: '#a855f7', count: qs.demand_winners    ?? 0 },
                { label: 'Hidden Gems',       color: '#10b981', count: qs.hidden_gems       ?? 0 },
                { label: 'Friction Keywords', color: '#ef4444', count: qs.friction_keywords ?? 0 },
                { label: 'Low Priority',      color: '#64748b', count: qs.low_priority      ?? 0 },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: l.color }} />
                  {l.label} ({l.count})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quadrant breakdown + Category Health — 1/3 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quadrant Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Demand Winners',    count: qs.demand_winners    ?? 0, color: 'text-purple-400',  bg: 'bg-purple-500/10',  desc: 'High demand + high conversion' },
                { label: 'Hidden Gems',       count: qs.hidden_gems       ?? 0, color: 'text-emerald-500', bg: 'bg-emerald-500/10', desc: 'Low demand + high conversion' },
                { label: 'Friction Keywords', count: qs.friction_keywords ?? 0, color: 'text-red-500',    bg: 'bg-red-500/10',     desc: 'High demand + poor conversion' },
                { label: 'Low Priority',      count: qs.low_priority      ?? 0, color: 'text-slate-400',  bg: 'bg-muted',          desc: 'Low demand + low conversion' },
              ].map((q) => {
                const pct = totalKeywords > 0 ? Math.round((q.count / totalKeywords) * 100) : 0;
                return (
                  <div key={q.label} className={cn('rounded-xl p-3 flex items-center justify-between', q.bg)}>
                    <div>
                      <p className={cn('text-sm font-semibold', q.color)}>{q.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{q.count} keywords ({pct}%)</p>
                      <p className="text-xs text-muted-foreground">{q.desc}</p>
                    </div>
                    <span className={cn('text-2xl font-bold', q.color)}>{q.count}</span>
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
                { label: 'Avg Conversion Efficiency', value: `${ch.average_conversion_efficiency ?? 0}/100`, sub: ch.efficiency_status ?? '—' },
                { label: 'Conversion Leak Rate',      value: ch.conversion_leak_rate ?? '—',                sub: ch.conversion_leak_status ?? '—' },
                { label: 'Demand Winner Ratio',       value: ch.demand_winner_ratio ?? '—',                 sub: 'Keywords with high demand + high conversion' },
                { label: 'Recoverable Revenue Pool',  value: ch.recoverable_revenue_pool != null ? formatCurrency(ch.recoverable_revenue_pool) : '—', sub: 'Estimated friction keyword revenue gap' },
              ].map((item) => (
                <div key={item.label} className="py-2 border-b border-border/40 last:border-0">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium">{item.label}</p>
                    <span className="text-sm font-bold font-mono ml-2 flex-shrink-0">{item.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.sub}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Table 1: Demand Winners */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <CardTitle className="text-base">Demand Winners</CardTitle>
          </div>
          <CardDescription>
            Keywords combining strong search demand with high conversion efficiency. These drive the most revenue per click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {winners.length === 0
            ? <p className="text-sm text-muted-foreground py-4 text-center">No demand winners detected in this dataset.</p>
            : <DataTable columns={keywordColumns} data={winners} pageSize={10} />
          }
        </CardContent>
      </Card>

      {/* Table 2: Conversion Leaks */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <CardTitle className="text-base">Conversion Leaks</CardTitle>
          </div>
          <CardDescription>
            Keywords attracting high click share but failing to convert. Fixing these represents the highest revenue recovery opportunity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {friction.length === 0
            ? <p className="text-sm text-muted-foreground py-4 text-center">No friction keywords detected.</p>
            : <DataTable columns={keywordColumns} data={friction} pageSize={10} />
          }
        </CardContent>
      </Card>

      {/* Table 3: Hidden Gems (conditional) */}
      {hiddenGems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <CardTitle className="text-base">Hidden Gems</CardTitle>
            </div>
            <CardDescription>
              Lower-volume keywords with strong conversion efficiency. Underutilised opportunities for targeted campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={keywordColumns} data={hiddenGems} pageSize={10} />
          </CardContent>
        </Card>
      )}

    </motion.div>
  );
}
