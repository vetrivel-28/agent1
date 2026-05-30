import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, DollarSign, TrendingUp, Crown,
  Skull, Layers, Lightbulb, Info, Target, BarChart3, Tag,
  ArrowRight, ShieldAlert, Zap
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { motion } from 'framer-motion';

// Types remain the same
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
  if (tier === 'Budget') return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
  if (tier === 'Premium') return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
  return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
}

function recommendationBadge(rec: string) {
  switch (rec) {
    case 'Strong Concentration':
      return { variant: 'default' as const, className: 'bg-success/10 text-success hover:bg-success/20 border-success/20' };
    case 'Moderate Concentration':
      return { variant: 'secondary' as const, className: 'bg-warning/10 text-warning hover:bg-warning/20 border-warning/20' };
    case 'Low Priority':
      return { variant: 'outline' as const, className: 'text-muted-foreground' };
    case 'Avoid':
      return { variant: 'destructive' as const, className: 'bg-danger/10 text-danger hover:bg-danger/20 border-danger/20' };
    default:
      return { variant: 'outline' as const, className: 'text-muted-foreground' };
  }
}

function structureBadge(cls: string): string {
  if (cls.includes('Budget')) return 'text-orange-600 bg-orange-500/10 border-orange-500/20';
  if (cls.includes('Premium')) return 'text-purple-600 bg-purple-500/10 border-purple-500/20';
  if (cls.includes('Mid-Tier')) return 'text-blue-600 bg-blue-500/10 border-blue-500/20';
  return 'text-muted-foreground bg-muted border-border';
}

function viabilityColor(rating: string): { color: string; bg: string } {
  if (rating === 'Strong') return { color: 'text-success', bg: 'bg-success/10 border-success/20' };
  if (rating === 'Moderate') return { color: 'text-warning', bg: 'bg-warning/10 border-warning/20' };
  return { color: 'text-muted-foreground', bg: 'bg-muted border-border' };
}

function tierChartColor(tier: string): string {
  if (tier === 'Budget') return 'hsl(var(--warning))';
  if (tier === 'Premium') return 'hsl(var(--primary))';
  return 'hsl(var(--info))';
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
    <Card className="hover-card-anim border-t-4 border-t-primary/20 bg-card/50 glass">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
            {tooltip && (
              <Tip text={tooltip}>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </Tip>
            )}
          </div>
          <div className={cn('p-1.5 rounded-md border', bg)}>
            <span className={color}>{icon}</span>
          </div>
        </div>
        <p className={cn('text-2xl font-black leading-tight tracking-tight font-serif', color)}>{value}</p>
        {highlight && <p className={cn('text-sm font-semibold mt-1 font-mono uppercase tracking-wider', color)}>{highlight}</p>}
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
    <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-4 shadow-xl text-sm space-y-2 font-mono">
      <p className="font-bold text-foreground uppercase tracking-widest text-xs border-b border-border/50 pb-2">{d.chart_label || d.tier}</p>
      <div>
        <p className="text-muted-foreground text-[10px] uppercase">Band</p>
        <p className="font-semibold">{d.price_band}</p>
      </div>
      <div className="flex justify-between gap-6">
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Revenue</p>
          <p className="font-medium text-success">{formatCurrency(d.revenue)}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-[10px] uppercase">Share</p>
          <p className="font-medium">{d.revenue_share_pct.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}

function MatrixTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PriceBand }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-4 shadow-xl text-sm space-y-2 font-mono">
      <p className="font-bold text-foreground uppercase tracking-widest text-xs border-b border-border/50 pb-2">{d.tier}</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Band</p>
          <p className="font-semibold">{d.price_band}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-[10px] uppercase">Avg Price</p>
          <p className="font-semibold text-primary">{formatCurrency(d.avg_price)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Revenue</p>
          <p className="font-medium text-success">{formatCurrency(d.revenue)}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-[10px] uppercase">Share</p>
          <p className="font-medium">{d.revenue_share_pct.toFixed(1)}%</p>
        </div>
        <div className="col-span-2 pt-2 border-t border-border/50 flex justify-between">
          <p className="text-muted-foreground text-[10px] uppercase">ASIN Density</p>
          <p className="font-medium">{formatNumber(Math.round(d.revenue_density))} / unit</p>
        </div>
      </div>
    </div>
  );
}

function UnavailableCard({ message, missing }: { message: string; missing?: string[] }) {
  return (
    <Card className="border-danger/20 bg-danger/5 mt-10 theme-elasticity">
      <CardContent className="p-8 flex flex-col items-center text-center">
        <AlertCircle className="w-12 h-12 text-danger mb-4" />
        <h2 className="text-xl font-bold mb-2 font-serif">Pricing Data Unavailable</h2>
        <p className="text-danger/80 max-w-lg">{message}</p>
        {missing && missing.length > 0 && (
          <p className="text-danger/60 text-sm mt-4 font-mono uppercase text-[10px] tracking-widest">Required Attributes: {missing.join(', ')}</p>
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
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3 theme-elasticity">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Synthesizing Price Economics...</p>
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

  const memoized = useMemo(() => {
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

    return {
      results, kpis, bands, insights, positioning, categoryOverview,
      tierSummary, revenueByTier, deadZones, totalRevenue, displayFlags,
      chartBands, matrixData, showCompetition
    };
  }, [data]);

  const {
    kpis, bands, insights, positioning, categoryOverview,
    tierSummary, deadZones, totalRevenue,
    chartBands, matrixData, showCompetition
  } = memoized;

  if (bands.length === 0) {
    return <UnavailableCard message="No price bands could be calculated from the uploaded catalog." />;
  }

  const tableColumns: ColumnDef<PriceBand>[] = [
    {
      header: 'Tier',
      cell: (r) => (
        <span className={cn('text-[10px] px-2 py-1 uppercase tracking-wider font-bold rounded border', tierBadge(r.tier))}>
          {r.tier}
        </span>
      ),
    },
    { header: 'Price Band', cell: (r) => <span className="font-mono">{r.price_band}</span> },
    { header: 'Revenue', cell: (r) => <span className="font-medium">{formatCurrency(r.revenue)}</span> },
    { 
      header: 'Share', 
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm w-12">{r.revenue_share_pct.toFixed(1)}%</span>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${r.revenue_share_pct}%` }} />
          </div>
        </div>
      ) 
    },
    ...(showCompetition
      ? [{
          header: 'Competition',
          cell: (r: PriceBand) => (
            <span className={cn(
              'text-xs font-bold uppercase tracking-wider',
              r.competition_level === 'Low' && 'text-success',
              r.competition_level === 'Moderate' && 'text-warning',
              r.competition_level === 'High' && 'text-danger',
            )}>
              {r.competition_level}
            </span>
          ),
        }]
      : []),
    { header: 'Attractiveness', cell: (r) => <span className="font-mono text-muted-foreground">{r.attractiveness_score.toFixed(0)}/100</span> },
    {
      header: 'Recommendation',
      cell: (r) => {
        const badgeProps = recommendationBadge(r.recommendation);
        return (
          <Badge variant={badgeProps.variant} className={cn("uppercase text-[10px] tracking-widest", badgeProps.className)}>
            {r.recommendation}
          </Badge>
        );
      },
    },
  ];

  const premiumViability = String(kpis.premium_viability || '—');
  const viabilityStyle = viabilityColor(premiumViability);

  const insightIcons: Record<string, React.ReactNode> = {
    'Key Finding': <BarChart3 className="w-5 h-5 text-primary" />,
    'Premium Revenue': <Crown className="w-5 h-5 text-purple-500" />,
    'Market Structure': <Layers className="w-5 h-5 text-blue-500" />,
    'Market Gap': <Target className="w-5 h-5 text-orange-500" />,
    'Revenue Concentration': <TrendingUp className="w-5 h-5 text-success" />,
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-elasticity">
      
      {/* Header — Consulting Briefing Style */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 mb-3 border border-primary/20 font-mono tracking-widest uppercase rounded-none">
            STRATEGIC PRICING BRIEF
          </Badge>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-serif">Price Economics & Elasticity</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Consulting-grade analysis of where the market aggregates revenue, pricing tier dominance, and strategic whitespace.
          </p>
        </div>
        {totalRevenue != null && totalRevenue > 0 && (
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Addressable Market</p>
            <p className="text-3xl font-black font-mono text-primary flex items-center justify-end gap-2">
              {formatCurrency(totalRevenue)}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Across {bands.length} Price Corridors</p>
          </div>
        )}
      </div>

      {/* Category Pricing Overview */}
      {categoryOverview.min_price != null && (
        <Card className="border-none bg-muted/30 shadow-none rounded-xl overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="p-6 md:w-1/3 bg-primary/5 border-r border-border/50 flex flex-col justify-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Category Spread</p>
              <p className="text-xl font-bold font-mono text-foreground">{categoryOverview.category_price_range}</p>
            </div>
            <div className="grid grid-cols-3 p-6 gap-6 md:w-2/3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Floor Price</p>
                <p className="text-2xl font-black font-serif text-muted-foreground">{formatCurrency(categoryOverview.min_price)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">Median Vector</p>
                <p className="text-3xl font-black font-serif text-primary">{formatCurrency(categoryOverview.median_price)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Ceiling Price</p>
                <p className="text-2xl font-black font-serif text-muted-foreground">{formatCurrency(categoryOverview.max_price)}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Executive Insights (Highlights) */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {insights.map((ins, i) => (
            <Card key={i} className="bg-card/40 border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex gap-4">
                <div className="p-3 bg-background rounded-xl border shadow-sm h-min">
                  {insightIcons[ins.category] ?? <Lightbulb className="w-5 h-5 text-primary" />}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                    {ins.category}
                  </p>
                  <p className="text-base leading-relaxed text-foreground/90 font-medium">{ins.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Optimal Tier"
          value={(kpis.best_selling_tier as string) || '—'}
          highlight={(kpis.best_selling_price_band as string) || undefined}
          sub="Peak revenue concentration"
          icon={<Target className="w-5 h-5" />}
          color="text-success"
          bg="bg-success/10 border-success/20"
        />
        <KpiCard
          title="Apex Revenue Band"
          value={(kpis.highest_revenue_tier as string) || '—'}
          highlight={(kpis.highest_revenue_band as string) || undefined}
          sub="Maximum absolute capital"
          icon={<DollarSign className="w-5 h-5" />}
          color="text-primary"
          bg="bg-primary/10 border-primary/20"
        />
        <KpiCard
          title="Premium Quotient"
          value={premiumViability}
          highlight={
            kpis.premium_revenue_pct != null
              ? `${Number(kpis.premium_revenue_pct).toFixed(0)}% Premium Rev`
              : undefined
          }
          sub="Up-market viability"
          icon={<Crown className="w-5 h-5" />}
          color={viabilityStyle.color}
          bg={viabilityStyle.bg}
          tooltip="Strong ≥35%, Moderate ≥15%, Weak &lt;15% of revenue from Premium tier."
        />
        <KpiCard
          title="Inefficient Zones"
          value={String(kpis.dead_price_zone_count ?? deadZones.length)}
          sub="Low yield corridors"
          icon={<Skull className="w-5 h-5" />}
          color={(Number(kpis.dead_price_zone_count) || 0) > 0 ? 'text-danger' : 'text-muted-foreground'}
          bg={(Number(kpis.dead_price_zone_count) || 0) > 0 ? 'bg-danger/10 border-danger/20' : 'bg-muted border-border'}
        />
        <KpiCard
          title="Market Taxonomy"
          value={String(kpis.market_pricing_structure || positioning.classification)}
          highlight={String(positioning.dominant_tier || kpis.dominant_tier || '')}
          sub={`Anchor: ${positioning.dominant_range}`}
          icon={<Layers className="w-5 h-5" />}
          color="text-warning"
          bg="bg-warning/10 border-warning/20"
        />
      </div>

      {/* Visual Data Models */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden border-border/50">
          <CardHeader className="bg-muted/10 border-b border-border/50">
            <CardTitle className="font-serif">Revenue Distribution Mapping</CardTitle>
            <CardDescription>Capital concentration across established pricing corridors</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartBands} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="chart_label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={(v) => String(v)}
                  tickMargin={10}
                />
                <YAxis
                  yAxisId="left"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={(v) => `$${formatNumber(v)}`}
                  tickMargin={10}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="hsl(var(--success))"
                  fontSize={10}
                  tickFormatter={(v) => `${v}%`}
                  tickMargin={10}
                />
                <Tooltip content={<TierRevenueTooltip tierSummary={tierSummary} />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }} />
                <Bar yAxisId="left" dataKey="revenue" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="revenue_share_pct" fill="hsl(var(--success))" fillOpacity={0.4} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/50">
          <CardHeader className="bg-muted/10 border-b border-border/50">
            <CardTitle className="font-serif">Economic Positioning Matrix</CardTitle>
            <CardDescription>Price vs Revenue yield. Size indicates ASIN density.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px] p-6 flex flex-col">
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" dataKey="x" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `$${v}`} tickMargin={10} />
                  <YAxis type="number" dataKey="y" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `$${formatNumber(v)}`} tickMargin={10} />
                  <ZAxis type="number" dataKey="z" range={[100, 800]} />
                  <Tooltip content={<MatrixTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={matrixData}>
                    {matrixData.map((entry, i) => (
                      <Cell key={i} fill={tierChartColor(entry.tier)} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-border/50">
              <span className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest"><span className="w-3 h-3 rounded-sm bg-[hsl(var(--warning))]" /> Budget</span>
              <span className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest"><span className="w-3 h-3 rounded-sm bg-[hsl(var(--info))]" /> Mid-Tier</span>
              <span className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest"><span className="w-3 h-3 rounded-sm bg-[hsl(var(--primary))]" /> Premium</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Structure Breakdown */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b border-border/50">
          <CardTitle className="font-serif text-2xl flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Architecture of Revenue
          </CardTitle>
          <CardDescription>Structural breakdown of capital distribution across categorical tiers</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/50">
            {[
              { label: 'Budget Allocation', pct: positioning.budget_revenue_pct, tier: 'Budget', color: 'bg-warning', text: 'text-warning' },
              { label: 'Mid-Tier Allocation', pct: positioning.mid_tier_revenue_pct, tier: 'Mid-Tier', color: 'bg-info', text: 'text-info' },
              { label: 'Premium Allocation', pct: positioning.premium_revenue_pct, tier: 'Premium', color: 'bg-primary', text: 'text-primary' },
            ].map((item) => {
              const range = tierSummary.find((t) => t.tier === item.tier)?.price_range;
              return (
                <div key={item.label} className="p-8 hover:bg-muted/5 transition-colors">
                  <div className="flex justify-between items-start mb-6">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{item.label}</p>
                    <Badge variant="outline" className={cn("rounded-sm font-mono bg-background", item.text)}>{item.tier}</Badge>
                  </div>
                  <p className="text-5xl font-black font-serif mb-2">{(item.pct || 0).toFixed(0)}<span className="text-3xl text-muted-foreground font-sans">%</span></p>
                  {range && <p className="text-sm font-mono text-muted-foreground mb-6">{range}</p>}
                  <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-1000 ease-out", item.color)} style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-muted/20 p-6 border-t border-border/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Structural Classification</span>
              <span className={cn('px-3 py-1 rounded-sm border text-xs font-bold uppercase tracking-wider', structureBadge(positioning.classification))}>
                {positioning.classification}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Dominant Center</span>
              <span className="font-mono text-sm font-bold bg-background border px-3 py-1 rounded-sm">{positioning.dominant_range}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Corridors Table */}
      <Card className="border-border/50 bg-card/50 glass">
        <CardHeader>
          <CardTitle className="font-serif">Strategic Entry Corridors</CardTitle>
          <CardDescription>Band-level analysis of revenue, competition, and entry viability.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={tableColumns} data={bands} pageSize={10} />
        </CardContent>
      </Card>

      {/* Dead Zones Alert */}
      {deadZones.length > 0 && (
        <Card className="border-danger/30 bg-danger/5 relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-5 p-4 pointer-events-none"><Skull className="w-32 h-32 text-danger" /></div>
          <CardHeader>
            <CardTitle className="text-danger flex items-center gap-2 font-serif text-xl">
              <ShieldAlert className="w-5 h-5" /> Inefficient Capital Corridors (Dead Zones)
            </CardTitle>
            <CardDescription className="text-danger/70">Price bands with negligible revenue share relative to ASIN density. Avoid product positioning in these ranges.</CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {deadZones.map((dz, i) => (
                <div key={i} className="bg-background/80 backdrop-blur border border-danger/20 rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className={cn('text-[10px] font-bold uppercase tracking-widest', tierBadge(dz.tier).split(' ')[1])}>{dz.tier}</span>
                    <span className="text-[10px] text-danger font-mono uppercase">Avoid</span>
                  </div>
                  <p className="font-mono text-lg font-bold mb-3">{dz.price_band}</p>
                  <div className="flex justify-between items-end border-t border-danger/10 pt-2">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Share</p>
                      <p className="font-medium text-danger">{dz.revenue_share_pct.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Revenue</p>
                      <p className="font-medium text-muted-foreground">{formatCurrency(dz.revenue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
