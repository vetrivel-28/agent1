import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Target, Zap, TrendingUp,
  DollarSign, Lightbulb, Info, Layers,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';

type WhitespaceKeyword = {
  keyword?: string;
  search_volume?: number;
  keyword_sales?: number;
  title_density?: number | null;
  whitespace_score?: number;
  opportunity_label?: string;
  opportunity_driver?: string;
};

type EntrySegment = {
  rank: number;
  segment: string;
  keyword_count: number;
  opportunity_revenue: number;
  revenue_represented?: number;
  avg_opportunity_score: number;
  recommended_priority?: string;
  primary_driver?: string;
  competitive_intensity?: string;
  recommended_action?: string;
};

type TopEntrySegment = {
  segment: string;
  revenue_opportunity: number;
  keyword_count: number;
  primary_driver: string;
  competitive_intensity: string;
  recommended_action: string;
  avg_opportunity_score: number;
  recommended_priority: string;
  rank: number;
};

function opportunityBadge(label: string): string {
  switch (label) {
    case 'Extreme Opportunity': return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    case 'High Opportunity': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'Moderate Opportunity': return 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30';
    default: return 'bg-muted text-muted-foreground border border-border';
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case 'Enter First': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'Evaluate': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    default: return 'bg-muted/60 text-muted-foreground border border-border';
  }
}

function intensityColor(level: string): string {
  if (level === 'Low') return 'text-emerald-500';
  if (level === 'High') return 'text-red-500';
  return 'text-yellow-500';
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-purple-400';
  if (score >= 65) return 'text-emerald-500';
  if (score >= 50) return 'text-yellow-500';
  return 'text-muted-foreground';
}

function formatPct(count: number, total: number): string {
  if (total <= 0) return '0.0%';
  const pct = (count / total) * 100;
  return pct < 10 ? pct.toFixed(1) : pct.toFixed(0);
}

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

interface KpiProps {
  title: string;
  value: string | number;
  sub?: string;
  highlight?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
}

function KpiCard({ title, value, sub, highlight, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip }: KpiProps) {
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
        {highlight && <p className={cn('text-base font-semibold mt-1', color)}>{highlight}</p>}
        {sub && <p className="text-xs text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SegmentRevenueTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: EntrySegment }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
      <p className="font-semibold">{d.segment}</p>
      <p className="text-muted-foreground">Revenue: <span className="text-foreground font-medium">{formatNumber(Math.round(d.opportunity_revenue))}</span></p>
      <p className="text-muted-foreground">Keywords: {d.keyword_count} · Score: {d.avg_opportunity_score}/100</p>
    </div>
  );
}

export default function WhitespaceOpportunities() {
  const { data: whitespaceData, isLoading, isError } = useQuery({
    queryKey: ['whitespace-opportunities'],
    queryFn: () => api.getWhitespaceOpportunities(20),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !isEngineOk(whitespaceData)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Whitespace Analysis Unavailable</h2>
          <p className="text-red-500/80">{getEngineErrorMessage(whitespaceData, 'Requires Magnet with Search Volume.')}</p>
        </CardContent>
      </Card>
    );
  }

  const r = whitespaceData.data?.results || {};
  const wsKeywords: WhitespaceKeyword[] = r.top_whitespace_keywords || [];
  const distribution = r.opportunity_distribution || {};
  const insights: { category: string; text: string }[] = r.insights || [];
  const revenueSignal = r.revenue_opportunity_pool ?? 0;
  const totalKeywords = r.total_keywords_analyzed ?? 0;
  const extremeCount = distribution.extreme_opportunity ?? 0;
  const highCount = distribution.high_opportunity ?? 0;
  const entrySegments: EntrySegment[] = (r.entry_segments || []).map((s: EntrySegment) => ({
    ...s,
    opportunity_revenue: s.opportunity_revenue ?? s.revenue_represented ?? 0,
  }));
  const topEntrySegments: TopEntrySegment[] = r.top_entry_segments?.length
    ? r.top_entry_segments
    : entrySegments.map((s) => ({
        segment: s.segment,
        revenue_opportunity: s.opportunity_revenue,
        keyword_count: s.keyword_count,
        primary_driver: s.primary_driver ?? '—',
        competitive_intensity: s.competitive_intensity ?? '—',
        recommended_action: s.recommended_action ?? 'Evaluate',
        avg_opportunity_score: s.avg_opportunity_score,
        recommended_priority: s.recommended_priority ?? 'Evaluate',
        rank: s.rank,
      }));
  const bestEntryCluster: string | null = r.best_entry_cluster ?? null;
  const titleDensityReliable = Boolean(r.title_density_reliable);
  const revenuePctCategory = Number(r.revenue_pct_of_category_sales ?? 0);
  const revenueCapped = Boolean(r.revenue_signal_capped);

  const revenueKpiHighlight = revenueSignal > 0
    ? `Represents ${revenuePctCategory}% of measurable category keyword sales`
    : undefined;

  const topEntryColumns: Column<TopEntrySegment>[] = [
    { header: 'Segment', accessorKey: 'segment', cell: (row) => <span className="font-semibold text-sm">{row.segment}</span> },
    {
      header: 'Revenue Opportunity',
      accessorKey: 'revenue_opportunity',
      cell: (row) => <span className="font-mono text-sm">{formatNumber(Math.round(row.revenue_opportunity))}</span>,
    },
    {
      header: 'Keyword Count',
      accessorKey: 'keyword_count',
      cell: (row) => <span className="font-mono text-sm">{row.keyword_count.toLocaleString()}</span>,
    },
    {
      header: 'Primary Driver',
      accessorKey: 'primary_driver',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.primary_driver}</span>,
    },
    {
      header: 'Competitive Intensity',
      accessorKey: 'competitive_intensity',
      cell: (row) => (
        <span className={cn('text-sm font-medium', intensityColor(row.competitive_intensity))}>
          {row.competitive_intensity}
        </span>
      ),
    },
    {
      header: 'Recommended Action',
      accessorKey: 'recommended_action',
      cell: (row) => <span className="text-sm text-foreground/90 leading-snug">{row.recommended_action}</span>,
    },
  ];

  const segmentTableColumns: Column<EntrySegment>[] = [
    { header: 'Rank', accessorKey: 'rank', cell: (row) => <span className="font-mono font-bold text-sm">{row.rank}</span> },
    { header: 'Segment', accessorKey: 'segment', cell: (row) => <span className="font-semibold text-sm">{row.segment}</span> },
    {
      header: 'Opportunity Revenue',
      accessorKey: 'opportunity_revenue',
      cell: (row) => <span className="font-mono text-sm">{formatNumber(Math.round(row.opportunity_revenue))}</span>,
    },
    {
      header: 'Opportunity Keywords',
      accessorKey: 'keyword_count',
      cell: (row) => <span className="font-mono text-sm">{row.keyword_count.toLocaleString()}</span>,
    },
    {
      header: 'Avg Opportunity Score',
      accessorKey: 'avg_opportunity_score',
      cell: (row) => (
        <span className={cn('font-mono text-sm font-medium', scoreColor(row.avg_opportunity_score))}>
          {row.avg_opportunity_score.toFixed(1)}
        </span>
      ),
    },
    {
      header: 'Recommended Priority',
      accessorKey: 'recommended_priority',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priorityBadge(row.recommended_priority ?? ''))}>
          {row.recommended_priority ?? '—'}
        </span>
      ),
    },
  ];

  const keywordColumns: Column<WhitespaceKeyword>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: (row) => <span className="font-medium text-sm">{row.keyword || '—'}</span> },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: (row) => <span className="font-mono text-sm">{formatNumber(row.search_volume ?? 0)}</span> },
    { header: 'Keyword Sales', accessorKey: 'keyword_sales', cell: (row) => <span className="font-mono text-sm">{formatNumber(row.keyword_sales ?? 0)}</span> },
    {
      header: 'Title Density',
      accessorKey: 'title_density',
      cell: (row) => (
        <span className="font-mono text-sm text-muted-foreground">
          {titleDensityReliable && row.title_density != null
            ? formatNumber(row.title_density)
            : 'N/A'}
        </span>
      ),
    },
    {
      header: 'Opportunity Tier',
      accessorKey: 'opportunity_label',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', opportunityBadge(row.opportunity_label ?? ''))}>
          {row.opportunity_label ?? '—'}
        </span>
      ),
    },
    {
      header: 'Opportunity Driver',
      accessorKey: 'opportunity_driver',
      cell: (row) => <span className="text-xs text-muted-foreground font-medium">{row.opportunity_driver ?? '—'}</span>,
    },
  ];

  const insightStyles: Record<string, { border: string; badge: string; dot: string }> = {
    'Key Finding': { border: 'border-l-4 border-l-purple-500 border-purple-500/30', badge: 'bg-purple-500/10 text-purple-400', dot: 'bg-purple-500' },
    'Leading Segment': { border: 'border-l-4 border-l-emerald-500 border-emerald-500/30', badge: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500' },
    'Market Gap': { border: 'border-l-4 border-l-blue-500 border-blue-500/30', badge: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-500' },
    'Recommended Entry': { border: 'border-l-4 border-l-amber-500 border-amber-500/30', badge: 'bg-amber-500/10 text-amber-400', dot: 'bg-amber-500' },
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Whitespace Opportunities</h1>
        <p className="text-muted-foreground mt-1">
          Segment-first entry analysis — where to enter, why opportunity exists, and relative size vs the category.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          title="Overall Whitespace Score"
          value={`${Number(r.overall_whitespace_score ?? 0).toFixed(1)} / 100`}
          sub="Category-wide opportunity level"
          icon={<Target className="w-4 h-4" />}
          color={(r.overall_whitespace_score ?? 0) >= 65 ? 'text-emerald-500' : (r.overall_whitespace_score ?? 0) >= 50 ? 'text-yellow-500' : 'text-muted-foreground'}
          bg={(r.overall_whitespace_score ?? 0) >= 65 ? 'bg-emerald-500/10 border-emerald-500/30' : (r.overall_whitespace_score ?? 0) >= 50 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-muted border-border'}
          tooltip="Mean opportunity score after percentile ranking across all keywords."
        />
        <KpiCard
          title="Extreme Opportunities"
          value={extremeCount.toLocaleString()}
          highlight={`(${formatPct(extremeCount, totalKeywords)}% of keyword universe)`}
          icon={<Zap className="w-4 h-4" />}
          color="text-purple-400"
          bg="bg-purple-500/10 border-purple-500/30"
          tooltip="Top 20% of keywords by composite opportunity score."
        />
        <KpiCard
          title="High Opportunities"
          value={highCount.toLocaleString()}
          highlight={`(${formatPct(highCount, totalKeywords)}% of keyword universe)`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          tooltip="Strong opportunity band (65–79 percentile rank)."
        />
        <KpiCard
          title="Opportunity Revenue Signal"
          value={revenueSignal > 0 ? formatNumber(Math.round(revenueSignal)) : '—'}
          highlight={revenueKpiHighlight}
          sub={
            revenueCapped
              ? 'Conservative addressable estimate (capped for realism)'
              : 'Addressable revenue from extreme + partial high-tier keyword sales'
          }
          icon={<DollarSign className="w-4 h-4" />}
          color="text-amber-500"
          bg="bg-amber-500/10 border-amber-500/30"
          tooltip={String(r.revenue_signal_method ?? 'Tier-weighted sales signal, not total capturable category revenue.')}
        />
        <KpiCard
          title="Best Entry Cluster"
          value={bestEntryCluster ?? '—'}
          sub={bestEntryCluster ? 'Highest opportunity revenue segment' : 'Awaiting segment analysis'}
          icon={<Layers className="w-4 h-4" />}
          color={bestEntryCluster ? 'text-cyan-400' : 'text-muted-foreground'}
          bg={bestEntryCluster ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-muted border-border'}
          tooltip="Segment with the largest addressable opportunity revenue."
        />
      </div>

      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <CardTitle className="text-base">Segment Intelligence</CardTitle>
            </div>
            <CardDescription>Segment-level findings and recommended entry sequence</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {insights.map((ins, i) => {
                const s = insightStyles[ins.category] ?? { border: 'border-border', badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' };
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                    className={cn('rounded-xl border p-4 space-y-2', s.border)}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', s.dot)} />
                      <span className={cn('text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', s.badge)}>
                        {ins.category}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{ins.text}</p>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {entrySegments.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue Opportunity by Segment</CardTitle>
              <CardDescription>Addressable revenue by product theme — sorted by revenue opportunity descending</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entrySegments.slice(0, 12)} margin={{ top: 12, right: 16, left: 0, bottom: 56 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="segment" stroke="hsl(var(--muted-foreground))" fontSize={10} angle={-32} textAnchor="end" height={80} interval={0} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatNumber(v)} axisLine={false} tickLine={false} />
                  <Tooltip content={<SegmentRevenueTip />} />
                  <Bar dataKey="opportunity_revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Segment Opportunity Table</CardTitle>
              <CardDescription>Full segment comparison with percentile-scaled attractiveness scores (0–100)</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={segmentTableColumns} data={entrySegments} pageSize={12} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Entry Segments Analysis</CardTitle>
              <CardDescription>Actionable segment view — primary driver, competition, and recommended next step</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={topEntryColumns} data={topEntrySegments} pageSize={10} />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Representative Opportunity Keywords</CardTitle>
          <CardDescription>
            Supporting keyword evidence for segment decisions — not the primary scoring view
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={keywordColumns} data={wsKeywords} pageSize={10} />
        </CardContent>
      </Card>

    </motion.div>
  );
}
