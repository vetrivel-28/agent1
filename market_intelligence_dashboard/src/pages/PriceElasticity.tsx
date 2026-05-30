import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, DollarSign, TrendingUp, Crown,
  Skull, Layers, Lightbulb, Info, Target, BarChart3, Tag,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { motion } from 'framer-motion';

type PriceBand = {
  price_band: string;
  tier: string;
  chart_label: string;
  asin_count: number;
  revenue: number;
  revenue_share_pct: number;
  avg_price: number;
  revenue_density: number;
  attractiveness_score: number;
  recommendation: string;
  competition_level?: string;
};

type DisplayFlags = {
  show_seller_count?: boolean;
  show_competition?: boolean;
};

type TierSummary = {
  tier: string;
  price_range: string;
  price_range_open?: string;
};

type TierRevenue = {
  tier: string;
  revenue: number;
  revenue_share_pct: number;
  chart_label: string;
};

type CategoryOverview = {
  min_price: number;
  median_price: number;
  max_price: number;
  category_price_range: string;
};

type Insight = { category: string; text: string };

type MarketPositioning = {
  classification: string;
  budget_revenue_pct: number;
  mid_tier_revenue_pct: number;
  premium_revenue_pct: number;
  dominant_range: string;
  dominant_tier: string;
  category_price_range: string;
  median_price?: number;
  min_price?: number;
  max_price?: number;
};

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
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

function tierBadge(tier: string): string {
  if (tier === 'Budget') return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
  if (tier === 'Premium') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
}

function recommendationBadge(rec: string): string {
  switch (rec) {
    case 'Strong Concentration':
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'Moderate Concentration':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'Low Priority':
      return 'bg-muted text-muted-foreground border border-border';
    case 'Avoid':
      return 'bg-red-500/15 text-red-400 border border-red-500/30';
    default:
      return 'bg-muted text-muted-foreground border border-border';
  }
}

function structureBadge(cls: string): string {
  if (cls.includes('Budget')) return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
  if (cls.includes('Premium')) return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
  if (cls.includes('Mid-Tier')) return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
  return 'text-muted-foreground bg-muted border-border';
}

function viabilityColor(rating: string): { color: string; bg: string } {
  if (rating === 'Strong') return { color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (rating === 'Moderate') return { color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { color: 'text-muted-foreground', bg: 'bg-muted border-border' };
}

function tierChartColor(tier: string): string {
  if (tier === 'Budget') return '#f59e0b';
  if (tier === 'Premium') return '#a855f7';
  return '#38bdf8';
}

interface KpiProps {
  title: string;
  value: string;
  highlight?: string;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
}

function KpiCard({ title, value, highlight, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip }: KpiProps) {
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
        <p className={cn('text-xl font-bold leading-tight', color)}>{value}</p>
        {highlight && <p className={cn('text-lg font-semibold mt-1', color)}>{highlight}</p>}
        {sub && <p className="text-xs text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function TierRevenueTooltip({
  active,
  payload,
  tierSummary,
}: {
  active?: boolean;
  payload?: Array<{ payload: PriceBand & { tierRange?: string } }>;
  tierSummary: TierSummary[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const tierMeta = tierSummary.find((t) => t.tier === d.tier);
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
      <p className="font-semibold">{d.chart_label || d.tier}</p>
      <p className="text-muted-foreground text-xs">{d.price_band}</p>
      {tierMeta && <p className="text-xs text-muted-foreground">Tier range: {tierMeta.price_range}</p>}
      <p>Revenue: <span className="font-medium">{formatCurrency(d.revenue)}</span></p>
      <p>Share: <span className="font-medium">{d.revenue_share_pct}%</span></p>
    </div>
  );
}

function MatrixTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PriceBand }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
      <p className="font-semibold">{d.tier} · {d.price_band}</p>
      <p>Avg price: {formatCurrency(d.avg_price)}</p>
      <p>Revenue: {formatCurrency(d.revenue)} ({d.revenue_share_pct}% share)</p>
      <p>{d.asin_count} ASINs · density {formatNumber(Math.round(d.revenue_density))}/ASIN</p>
    </div>
  );
}

function UnavailableCard({ message, missing }: { message: string; missing?: string[] }) {
  return (
    <Card className="border-muted bg-muted/20 mt-10">
      <CardContent className="p-8 flex flex-col items-center text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Pricing Data Unavailable</h2>
        <p className="text-muted-foreground max-w-lg">{message}</p>
        {missing && missing.length > 0 && (
          <p className="text-muted-foreground/70 text-sm mt-2">Required: {missing.join(', ')}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PriceElasticity() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['price-intelligence'],
    queryFn: () => api.getPriceElasticity(6),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return <UnavailableCard message="Could not reach the pricing analysis service." />;
  }

  if (data.status === 'unavailable') {
    const missing = (data.validation as { missing_columns?: string[] })?.missing_columns;
    return (
      <UnavailableCard
        message={getEngineErrorMessage(data, 'Pricing analysis cannot be computed with the current dataset.')}
        missing={missing}
      />
    );
  }

  if (data.status !== 'success') {
    return <UnavailableCard message={getEngineErrorMessage(data)} />;
  }

  const results = data.results || {};
  const kpis = results.kpis as Record<string, string | number | null | undefined> || {};
  const bands: PriceBand[] = results.price_buckets || [];
  const insights: Insight[] = results.insights || [];
  const positioning: MarketPositioning = results.market_positioning || {
    classification: '—',
    budget_revenue_pct: 0,
    mid_tier_revenue_pct: 0,
    premium_revenue_pct: 0,
    dominant_range: '—',
    dominant_tier: '—',
    category_price_range: '—',
  };
  const categoryOverview: CategoryOverview = results.category_pricing_overview || {};
  const tierSummary: TierSummary[] = results.price_tier_summary || [];
  const revenueByTier: TierRevenue[] = results.revenue_by_tier || [];
  const deadZones: PriceBand[] = results.dead_price_zones || [];
  const totalRevenue = results.total_category_revenue as number | undefined;
  const displayFlags: DisplayFlags = results.display_flags || {
    show_seller_count: false,
    show_competition: false,
  };

  if (bands.length === 0) {
    return <UnavailableCard message="No price bands could be calculated from the uploaded catalog." />;
  }

  const chartBands = [...bands]
    .sort((a, b) => a.avg_price - b.avg_price)
    .map((b) => ({ ...b, tierRange: tierSummary.find((t) => t.tier === b.tier)?.price_range }));

  const matrixData = bands.map((b) => ({
    ...b,
    x: b.avg_price,
    y: b.revenue,
    z: Math.max(b.asin_count, 1),
  }));

  const competitionLevels = new Set(
    bands.map((b) => b.competition_level).filter(Boolean),
  );
  const showCompetition =
    displayFlags.show_competition === true && competitionLevels.size > 1;

  const tableColumns: Column<PriceBand>[] = [
    {
      header: 'Tier',
      accessorKey: 'tier',
      cell: (r) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium border', tierBadge(r.tier))}>
          {r.tier}
        </span>
      ),
    },
    { header: 'Price Band', accessorKey: 'price_band' },
    { header: 'Revenue', accessorKey: 'revenue', cell: (r) => formatCurrency(r.revenue) },
    { header: 'Revenue Share', accessorKey: 'revenue_share_pct', cell: (r) => `${r.revenue_share_pct.toFixed(1)}%` },
    ...(showCompetition
      ? [{
          header: 'Competition',
          accessorKey: 'competition_level' as keyof PriceBand,
          cell: (r: PriceBand) => (
            <span className={cn(
              'text-xs font-medium',
              r.competition_level === 'Low' && 'text-emerald-500',
              r.competition_level === 'Moderate' && 'text-yellow-500',
              r.competition_level === 'High' && 'text-red-500',
            )}>
              {r.competition_level}
            </span>
          ),
        }]
      : []),
    { header: 'Attractiveness', accessorKey: 'attractiveness_score', cell: (r) => `${r.attractiveness_score.toFixed(0)}/100` },
    {
      header: 'Recommendation',
      accessorKey: 'recommendation',
      cell: (r) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', recommendationBadge(r.recommendation))}>
          {r.recommendation}
        </span>
      ),
    },
  ];

  const premiumViability = String(kpis.premium_viability || '—');
  const viabilityStyle = viabilityColor(premiumViability);

  const insightIcons: Record<string, React.ReactNode> = {
    'Key Finding': <BarChart3 className="w-5 h-5 text-primary" />,
    'Premium Revenue': <Crown className="w-5 h-5 text-purple-400" />,
    'Market Structure': <Layers className="w-5 h-5 text-sky-400" />,
    'Market Gap': <Target className="w-5 h-5 text-amber-500" />,
    'Revenue Concentration': <TrendingUp className="w-5 h-5 text-emerald-500" />,
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Price Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Pricing strategy report — where the market makes money, which tiers dominate, and where to enter.
        </p>
        {totalRevenue != null && totalRevenue > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Category revenue analyzed: {formatCurrency(totalRevenue)} across {bands.length} price bands
          </p>
        )}
      </div>

      {/* Category pricing overview */}
      {categoryOverview.min_price != null && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Category Price Range
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Min Price</p>
                <p className="text-2xl font-bold">{formatCurrency(categoryOverview.min_price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Median Price</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(categoryOverview.median_price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max Price</p>
                <p className="text-2xl font-bold">{formatCurrency(categoryOverview.max_price)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Full range: <span className="text-foreground font-medium">{categoryOverview.category_price_range}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Price tier classification */}
      {tierSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="w-4 h-4" /> Price Tier Classification
            </CardTitle>
            <CardDescription>Every product and price band is classified into Budget, Mid-Tier, or Premium</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tierSummary.map((t) => {
                const tierRev = revenueByTier.find((r) => r.tier === t.tier);
                return (
                  <div key={t.tier} className={cn('rounded-lg border p-4', tierBadge(t.tier))}>
                    <p className="text-sm font-semibold">{t.tier}</p>
                    <p className="text-lg font-bold mt-1">{t.price_range}</p>
                    {tierRev && (
                      <p className="text-xs mt-2 opacity-90">{tierRev.revenue_share_pct.toFixed(0)}% of category revenue</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Best Selling Price Band"
          value={(kpis.best_selling_tier as string) || '—'}
          highlight={(kpis.best_selling_price_band as string) || undefined}
          sub="Highest revenue concentration"
          icon={<TrendingUp className="w-5 h-5" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/20"
        />
        <KpiCard
          title="Highest Revenue Band"
          value={(kpis.highest_revenue_tier as string) || '—'}
          highlight={(kpis.highest_revenue_band as string) || undefined}
          sub="Top absolute revenue"
          icon={<DollarSign className="w-5 h-5" />}
          color="text-primary"
          bg="bg-primary/10 border-primary/20"
        />
        <KpiCard
          title="Premium Viability"
          value={premiumViability}
          highlight={
            kpis.premium_revenue_pct != null
              ? `${Number(kpis.premium_revenue_pct).toFixed(0)}% premium-tier revenue`
              : undefined
          }
          sub="Meaningful premium revenue share"
          icon={<Crown className="w-5 h-5" />}
          color={viabilityStyle.color}
          bg={viabilityStyle.bg}
          tooltip="Strong ≥35%, Moderate ≥15%, Weak &lt;15% of revenue from Premium tier."
        />
        <KpiCard
          title="Dead Price Zones"
          value={String(kpis.dead_price_zone_count ?? deadZones.length)}
          sub="Low share + low revenue density"
          icon={<Skull className="w-5 h-5" />}
          color={(Number(kpis.dead_price_zone_count) || 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}
          bg={(Number(kpis.dead_price_zone_count) || 0) > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-muted border-border'}
        />
        <KpiCard
          title="Market Pricing Structure"
          value={String(kpis.market_pricing_structure || positioning.classification)}
          highlight={String(positioning.dominant_tier || kpis.dominant_tier || '')}
          sub={`Top band in tier: ${positioning.dominant_range}`}
          icon={<Layers className="w-5 h-5" />}
          color="text-amber-500"
          bg="bg-amber-500/10 border-amber-500/20"
        />
      </div>

      {/* Executive insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((ins) => (
            <Card key={ins.category} className="hover-card-anim">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted/50 border border-border flex-shrink-0">
                    {insightIcons[ins.category] ?? <Lightbulb className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {ins.category}
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/90">{ins.text}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Price Band</CardTitle>
            <CardDescription>Tier view — hover for exact price band and revenue share</CardDescription>
          </CardHeader>
          <CardContent className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartBands} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="chart_label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(v) => String(v)}
                />
                <YAxis
                  yAxisId="left"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(v) => `$${formatNumber(v)}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="hsl(var(--success))"
                  fontSize={12}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<TierRevenueTooltip tierSummary={tierSummary} />} />
                <Bar yAxisId="left" dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="revenue_share_pct" fill="hsl(var(--success))" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price Position Matrix</CardTitle>
            <CardDescription>Price vs revenue — bubble size = ASIN count, color = tier</CardDescription>
          </CardHeader>
          <CardContent className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="x" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `$${v}`} />
                <YAxis type="number" dataKey="y" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `$${formatNumber(v)}`} />
                <ZAxis type="number" dataKey="z" range={[80, 600]} />
                <Tooltip content={<MatrixTooltip />} />
                <Scatter data={matrixData}>
                  {matrixData.map((entry, i) => (
                    <Cell key={i} fill={tierChartColor(entry.tier)} fillOpacity={0.75} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Budget</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> Mid-Tier</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Premium</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market pricing structure */}
      <Card>
        <CardHeader>
          <CardTitle>Market Pricing Structure</CardTitle>
          <CardDescription>How revenue distributes across price tiers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 rounded-lg bg-muted/20 border border-border">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Dominant Tier</p>
              <p className="text-xl font-bold mt-1">{positioning.dominant_tier || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Dominant Price Range</p>
              <p className="text-xl font-bold mt-1">{positioning.dominant_range}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Category Price Range</p>
              <p className="text-xl font-bold mt-1">{positioning.category_price_range || categoryOverview.category_price_range}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Median Price</p>
              <p className="text-xl font-bold mt-1 text-primary">
                {positioning.median_price != null ? formatCurrency(positioning.median_price) : '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-6">
            <span className={cn('px-4 py-2 rounded-lg border text-sm font-semibold', structureBadge(positioning.classification))}>
              {positioning.classification}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Budget Revenue', pct: positioning.budget_revenue_pct, tier: 'Budget' },
              { label: 'Mid-Tier Revenue', pct: positioning.mid_tier_revenue_pct, tier: 'Mid-Tier' },
              { label: 'Premium Revenue', pct: positioning.premium_revenue_pct, tier: 'Premium' },
            ].map((item) => {
              const range = tierSummary.find((t) => t.tier === item.tier)?.price_range;
              return (
                <div key={item.label} className="rounded-lg border border-border p-4 bg-muted/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className="text-3xl font-bold mt-1">{item.pct.toFixed(0)}%</p>
                  {range && <p className="text-xs text-muted-foreground mt-1">{range}</p>}
                  <div className="w-full bg-muted rounded-full h-2 mt-3">
                    <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price Opportunity Table</CardTitle>
          <CardDescription>Tier and band-level recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={tableColumns} data={bands} pageSize={10} />
        </CardContent>
      </Card>

      {deadZones.length > 0 && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2">
              <Skull className="w-5 h-5" /> Dead Price Zones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {deadZones.map((dz, i) => (
                <li key={i} className="text-sm">
                  <span className={cn('text-xs px-1.5 py-0.5 rounded border mr-2', tierBadge(dz.tier))}>{dz.tier}</span>
                  <span className="font-medium">{dz.price_band}</span>
                  {' — '}
                  {dz.revenue_share_pct.toFixed(1)}% share, low revenue density
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
