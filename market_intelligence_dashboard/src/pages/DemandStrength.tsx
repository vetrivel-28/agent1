import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { KPICard } from '../components/ui/KPICard';
import { Badge } from '../components/ui/Badge';
import { formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle,
  Loader2,
  PieChart,
  Target,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Swords,
  Shield,
  AlertTriangle,
  Rocket,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--warning))',
  'hsl(var(--success))',
  'hsl(var(--info))',
  'hsl(var(--danger))',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

type SegmentRow = {
  segment: string;
  demand_share: number;
  keyword_count: number;
  revenue_share: number;
  total_search_volume: number;
  demand_revenue_gap?: number;
  entry_difficulty?: string;
  competition_index?: number;
};

type SegmentInsight = {
  name?: string;
  demand_share?: number;
  revenue_share?: number;
  keyword_count?: number;
  gap?: number;
  insight?: string;
  entry_difficulty?: string;
  revenue_efficiency_ratio?: number;
};

type RecommendedEntry = {
  name?: string;
  demand_share?: number;
  revenue_share?: number;
  gap?: number;
  competition?: string;
  reason?: string;
  entry_score?: number;
};

function concentrationMeta(score: number) {
  if (score < 30) {
    return { label: 'Fragmented Demand', className: 'text-blue-500', status: 'neutral' as const };
  }
  if (score < 60) {
    return { label: 'Balanced Demand', className: 'text-amber-500', status: 'warning' as const };
  }
  return { label: 'Concentrated Demand', className: 'text-purple-500', status: 'neutral' as const };
}

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function entryDifficultyVariant(level: string): 'success' | 'warning' | 'danger' | 'outline' {
  const l = level.toLowerCase();
  if (l === 'easy') return 'success';
  if (l === 'moderate') return 'warning';
  if (l === 'hard' || l === 'high') return 'danger';
  return 'outline';
}

function computeEntryDifficulty(row: SegmentRow): string {
  if (row.entry_difficulty) return row.entry_difficulty;
  const ci = safeNum(row.competition_index);
  const kw = safeNum(row.keyword_count);
  const share = safeNum(row.demand_share);
  if (row.segment.toLowerCase() === 'other') return 'High';
  if (ci >= 15 || (share > 0 && kw / share >= 12)) return 'Hard';
  if (ci >= 6 || (share > 0 && kw / share >= 5)) return 'Moderate';
  return 'Easy';
}

async function fetchDemand() {
  return api.getDemandStrength(50);
}

export default function DemandStrength() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['demand-intelligence'],
    queryFn: fetchDemand,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Analyzing demand themes…</p>
      </div>
    );
  }

  if (isError || !data || !isEngineOk(data)) {
    const timeoutMsg =
      error instanceof Error && error.message.includes('timeout')
        ? 'The analysis took too long. Try uploading a smaller keyword file or refresh in a moment.'
        : getEngineErrorMessage(
            data,
            'Upload Magnet (keywords) and/or BlackBox (products) with Search Volume columns.',
          );
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Demand Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-md">{timeoutMsg}</p>
          {error instanceof Error && !error.message.includes('timeout') && (
            <p className="text-xs text-muted-foreground mt-2">{error.message}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const results = data.results || {};
  const distribution: SegmentRow[] = Array.isArray(results.demand_distribution)
    ? results.demand_distribution.map((row: SegmentRow) => ({
        segment: String(row.segment || 'Other'),
        demand_share: safeNum(row.demand_share),
        keyword_count: safeNum(row.keyword_count),
        revenue_share: safeNum(row.revenue_share),
        total_search_volume: safeNum(row.total_search_volume),
        demand_revenue_gap: safeNum(row.demand_revenue_gap),
        entry_difficulty: row.entry_difficulty,
        competition_index: safeNum(row.competition_index),
      }))
    : [];

  const insights = results.executive_insights as {
    what?: string;
    why?: string;
    action?: string;
    risk?: string;
    most_undervalued_segment?: SegmentInsight;
    best_monetized_segment?: SegmentInsight;
    most_competitive_segment?: SegmentInsight;
    least_competitive_segment?: SegmentInsight;
  } | undefined;

  const topSegment = results.top_demand_segment as SegmentInsight | undefined;
  const revenueLeader = (results.revenue_efficiency_leader ?? results.top_revenue_segment) as
    | SegmentInsight
    | undefined;
  const mostCompetitive = (results.most_competitive_segment ?? insights?.most_competitive_segment) as
    | SegmentInsight
    | undefined;
  const leastCompetitive = (results.least_competitive_segment ?? insights?.least_competitive_segment) as
    | SegmentInsight
    | undefined;

  const concentration = safeNum(results.demand_concentration_score);
  const concentrationLabel =
    String(results.demand_concentration_label || '') || concentrationMeta(concentration).label;
  const concentrationStyle = concentrationMeta(concentration);
  const recommendedEntry = results.recommended_entry_segment as RecommendedEntry | undefined;

  const topNamedSegment =
    topSegment?.name && topSegment.name.toLowerCase() !== 'other'
      ? topSegment.name
      : distribution.find((d) => d.segment.toLowerCase() !== 'other')?.segment ?? '—';
  const topNamedShare =
    topSegment?.name && topSegment.name.toLowerCase() !== 'other'
      ? safeNum(topSegment.demand_share)
      : safeNum(distribution.find((d) => d.segment.toLowerCase() !== 'other')?.demand_share);

  const clusterColumns: Column<SegmentRow>[] = [
    {
      header: 'Segment',
      accessorKey: 'segment',
      cell: (r) => <span className="font-medium">{r.segment || '—'}</span>,
    },
    {
      header: 'Demand Share',
      accessorKey: 'demand_share',
      cell: (r) => `${safeNum(r.demand_share).toFixed(1)}%`,
    },
    {
      header: 'Revenue Share',
      accessorKey: 'revenue_share',
      cell: (r) => `${safeNum(r.revenue_share).toFixed(1)}%`,
    },
    {
      header: 'Search Volume',
      accessorKey: 'total_search_volume',
      cell: (r) => formatNumber(safeNum(r.total_search_volume)),
    },
    {
      header: 'Gap',
      accessorKey: 'demand_revenue_gap',
      cell: (r) => {
        const gap = safeNum(r.demand_revenue_gap);
        const color = gap > 0 ? 'text-success' : gap < 0 ? 'text-danger' : 'text-muted-foreground';
        const label = gap > 0 ? 'Monetizes better' : gap < 0 ? 'Undervalued' : 'Balanced';
        return (
          <div className="flex flex-col">
            <span className={color}>
              {gap > 0 ? '+' : ''}
              {gap.toFixed(1)}%
            </span>
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        );
      },
    },
    {
      header: 'Entry Difficulty',
      accessorKey: 'entry_difficulty',
      cell: (r) => {
        const level = computeEntryDifficulty(r);
        return (
          <Badge variant={entryDifficultyVariant(level)} className="text-[11px] uppercase tracking-wide">
            {level}
          </Badge>
        );
      },
    },
  ];

  const chartData = distribution
    .filter((d) => d.segment.toLowerCase() !== 'other' && safeNum(d.demand_share) > 0)
    .map((d) => ({ name: d.segment, demand_share: d.demand_share }));

  const hasSegments = distribution.length > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Demand Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Where category demand is concentrated, how segments monetize, and where entry is easier or harder.
        </p>
      </div>

      {!hasSegments ? (
        <Card className="border-muted">
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No demand segments could be calculated from the uploaded keyword data.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Executive KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
            <KPICard
              title="Demand Concentration Score"
              value={concentration.toFixed(1)}
              subtitle={concentrationLabel}
              subtitleClassName={concentrationStyle.className}
              icon={<PieChart className="w-5 h-5" />}
              status={concentrationStyle.status}
            />
            <KPICard
              title="Top Demand Segment"
              value={topNamedSegment}
              icon={<Target className="w-5 h-5" />}
              status="neutral"
              trend={topNamedShare}
              trendLabel="of category demand"
              trendIsPercent
            />
            <KPICard
              title="Revenue Efficiency Leader"
              value={revenueLeader?.name ?? '—'}
              icon={<DollarSign className="w-5 h-5" />}
              status="success"
              trend={safeNum(revenueLeader?.revenue_share)}
              trendLabel="revenue share"
              trendIsPercent
            />
            {recommendedEntry?.name ? (
              <RecommendedEntryCard entry={recommendedEntry} />
            ) : (
              <KPICard
                title="Recommended Entry Segment"
                value="—"
                icon={<Rocket className="w-5 h-5" />}
                status="neutral"
                trendLabel="No qualifying segment"
              />
            )}
            <KPICard
              title="Most Competitive Segment"
              value={mostCompetitive?.name ?? '—'}
              icon={<Swords className="w-5 h-5" />}
              status="warning"
              trend={safeNum(mostCompetitive?.keyword_count)}
              trendLabel="keywords tracked"
              trendIsPercent={false}
            />
            <KPICard
              title="Least Competitive Segment"
              value={leastCompetitive?.name ?? '—'}
              icon={<Shield className="w-5 h-5" />}
              status="success"
              trend={safeNum(leastCompetitive?.keyword_count)}
              trendLabel="keywords tracked"
              trendIsPercent={false}
            />
          </div>

          {/* Demand distribution chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Demand Distribution by Segment</CardTitle>
                <CardDescription>Share of total search volume across business demand segments.</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, 'Demand Share']} />
                    <Bar dataKey="demand_share" radius={[6, 6, 0, 0]}>
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Opportunity cluster table */}
          <Card>
            <CardHeader>
              <CardTitle>Demand Opportunity Clusters</CardTitle>
              <CardDescription>
                Segment-level demand, revenue, gap, and relative entry difficulty.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={clusterColumns} data={distribution} pageSize={12} />
            </CardContent>
          </Card>

          {/* Executive insights */}
          {insights && (insights.what || insights.why || insights.action || insights.risk) && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" />
                  Executive Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {insights.what && (
                  <InsightBlock label="What" text={insights.what} />
                )}
                {insights.why && (
                  <InsightBlock label="Why" text={insights.why} />
                )}
                {insights.action && (
                  <InsightBlock label="Action" text={insights.action} />
                )}
                {insights.risk && (
                  <div className={cn(insights.what || insights.why || insights.action ? '' : 'md:col-span-2')}>
                    <InsightBlock
                      label="Risk"
                      text={insights.risk}
                      icon={<AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />}
                      className="border-warning/20 bg-warning/5 rounded-lg p-4"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Undervalued / monetized */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights?.most_undervalued_segment?.name ? (
              <SegmentHighlightCard
                title="Most Undervalued Segment"
                segment={insights.most_undervalued_segment}
                variant="danger"
                icon={<TrendingDown className="w-5 h-5" />}
              />
            ) : (
              <Card className="border-muted bg-muted/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                    <TrendingDown className="w-5 h-5" />
                    Most Undervalued Segment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    No significant undervalued segments identified.
                  </p>
                </CardContent>
              </Card>
            )}
            {insights?.best_monetized_segment?.name && (
              <SegmentHighlightCard
                title="Best Monetized Segment"
                segment={insights.best_monetized_segment}
                variant="success"
                icon={<TrendingUp className="w-5 h-5" />}
              />
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

function RecommendedEntryCard({ entry }: { entry: RecommendedEntry }) {
  const score = safeNum(entry.entry_score);
  return (
    <Card className="hover-card-anim relative overflow-hidden border-primary/20 bg-primary/5">
      <CardContent className="p-6">
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-3 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Recommended Entry Segment</p>
            <h3 className="text-2xl font-bold tracking-tight truncate">{entry.name}</h3>
            <div className="text-sm font-medium text-foreground">
              Entry Score: {score.toFixed(0)}/100
            </div>
            {entry.reason && (
              <div className="text-xs leading-relaxed text-primary/90 pt-1">
                <div className="font-semibold">Reason:</div>
                <div className="mt-0.5">{entry.reason}</div>
              </div>
            )}
          </div>
          <div className="p-3 rounded-xl border text-primary bg-primary/10 border-primary/20 shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightBlock({
  label,
  text,
  icon,
  className,
}: {
  label: string;
  text: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
      <div className="flex gap-2">
        {icon}
        <p className="text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function SegmentHighlightCard({
  title,
  segment,
  variant,
  icon,
}: {
  title: string;
  segment: SegmentInsight;
  variant: 'danger' | 'success';
  icon: React.ReactNode;
}) {
  const border = variant === 'danger' ? 'border-danger/20 bg-danger/5' : 'border-success/20 bg-success/5';
  const titleColor = variant === 'danger' ? 'text-danger' : 'text-success';
  const textColor = variant === 'danger' ? 'text-danger/80' : 'text-success/80';

  return (
    <Card className={border}>
      <CardHeader>
        <CardTitle className={cn('flex items-center gap-2', titleColor)}>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xl font-bold">{segment.name}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Demand Share</p>
            <p className="font-semibold">{safeNum(segment.demand_share).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Revenue Share</p>
            <p className="font-semibold">{safeNum(segment.revenue_share).toFixed(1)}%</p>
          </div>
          {segment.gap !== undefined && (
            <div>
              <p className="text-muted-foreground">Gap</p>
              <p className="font-semibold">
                {safeNum(segment.gap) > 0 ? '+' : ''}
                {safeNum(segment.gap).toFixed(1)}%
              </p>
            </div>
          )}
        </div>
        {segment.insight && <p className={cn('text-sm leading-relaxed', textColor)}>{segment.insight}</p>}
      </CardContent>
    </Card>
  );
}
