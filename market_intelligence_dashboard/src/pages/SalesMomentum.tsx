import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, TrendingUp, Users, Crown, Zap,
  ArrowDownRight, BarChart3, Lightbulb,
  AlertTriangle, Target,
} from 'lucide-react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, { variant: 'default' | 'outline' | 'success' | 'warning' | 'danger'; className: string }> = {
    'Declining':    { variant: 'danger',  className: 'bg-red-500/10 text-red-500 border-red-500/30' },
    'Stable':       { variant: 'outline', className: 'text-muted-foreground border-border' },
    'Emerging':     { variant: 'warning', className: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
    'Accelerating': { variant: 'success', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
    'Dominating':   { variant: 'success', className: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
  };
  const style = config[tier] || { variant: 'outline', className: '' };
  return (
    <Badge variant={style.variant} className={cn('text-[11px] uppercase tracking-wider', style.className)}>
      {tier}
    </Badge>
  );
}

function BusinessBadge({ label }: { label: string }) {
  const config: Record<string, { variant: 'default' | 'outline' | 'success' | 'warning' | 'danger'; className: string }> = {
    'Market Leader':       { variant: 'success', className: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
    'Emerging Challenger': { variant: 'warning', className: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
    'Declining Player':    { variant: 'danger',  className: 'bg-red-500/10 text-red-500 border-red-500/30' },
    'Vulnerable Leader':   { variant: 'danger',  className: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
  };
  const style = config[label] || { variant: 'outline', className: '' };
  return (
    <Badge variant={style.variant} className={cn('text-[11px] uppercase tracking-wider', style.className)}>
      {label}
    </Badge>
  );
}

function ScoreBar({ score, colorClass = 'bg-primary' }: { score: number; colorClass?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', colorClass)} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums">{score.toFixed(1)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SalesMomentum() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-momentum'],
    queryFn: () => api.getSalesMomentum(50),
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
          <h2 className="text-xl font-bold text-red-500 mb-2">Sales Momentum Unavailable</h2>
          <p className="text-red-500/80">{getEngineErrorMessage(data, 'Requires BlackBox with Brand and Revenue columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.data?.results;
  const allBrands: any[] = results.all_brands_momentum || [];
  const leaders: any[] = results.market_leaders || [];
  const challengers: any[] = results.emerging_challengers || [];
  const declining: any[] = results.declining_players || [];
  const vulnerable: any[] = results.vulnerable_leaders || [];
  const gainers: any[] = results.share_gainers || [];
  const losers: any[] = results.share_losers || [];

  const concentration = results.market_concentration || {};
  const top5Share = concentration.top_5_share ?? 0;
  const top10Share = concentration.top_10_share ?? 0;
  const top3Share = concentration.top_3_share ?? 0;
  const marketStructure = concentration.market_structure ?? '—';
  const largestBrand = concentration.largest_brand ?? '—';
  const largestShare = concentration.largest_brand_share ?? 0;
  const totalBrands = concentration.total_brands ?? allBrands.length;
  const totalRevenue = results.total_market_revenue;

  const marketDirection: string = results.market_direction ?? 'Stable';
  const meanScore: number = results.mean_momentum_score ?? 0;
  const dominantWarning: boolean = results.dominant_brand_warning ?? false;
  const dominantBrands: string[] = results.dominant_brands ?? [];
  const executiveSummary: string = results.executive_summary ?? '';

  const directionColor =
    marketDirection === 'Accelerating' ? 'text-emerald-500'
    : marketDirection === 'Emerging' ? 'text-blue-400'
    : marketDirection === 'Stable' ? 'text-yellow-500'
    : 'text-red-500';

  const directionBg =
    marketDirection === 'Accelerating' ? 'bg-emerald-500/10 border-emerald-500/30'
    : marketDirection === 'Emerging' ? 'bg-blue-500/10 border-blue-500/30'
    : marketDirection === 'Stable' ? 'bg-yellow-500/10 border-yellow-500/30'
    : 'bg-red-500/10 border-red-500/30';

  // -----------------------------------------------------------------------
  // Table columns
  // -----------------------------------------------------------------------
  const brandColumns: Column<any>[] = [
    {
      header: '#',
      accessorKey: 'rank',
      cell: (r) => (
        <span className={cn('font-bold text-sm',
          r.rank === 1 ? 'text-purple-400' : r.rank <= 3 ? 'text-blue-400' : 'text-muted-foreground')}>
          {r.rank === 1 ? '👑 ' : ''}{r.rank}
        </span>
      ),
    },
    {
      header: 'Brand',
      accessorKey: 'brand',
      cell: (r) => (
        <div>
          <div className="font-semibold text-sm">{r.brand}</div>
          <div className="text-xs text-muted-foreground">{r.product_count ?? '—'} products</div>
        </div>
      ),
    },
    {
      header: 'Momentum Score',
      accessorKey: 'momentum_score',
      cell: (r) => <ScoreBar score={Number(r.momentum_score) || 0} />,
    },
    {
      header: 'Tier',
      accessorKey: 'momentum_tier',
      cell: (r) => <TierBadge tier={String(r.momentum_tier || 'Stable')} />,
    },
    {
      header: 'Business Label',
      accessorKey: 'business_label',
      cell: (r) => <BusinessBadge label={String(r.business_label || '—')} />,
    },
    {
      header: 'Market Share',
      accessorKey: 'market_share_pct',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(Number(r.market_share_pct) || 0, 100)}%` }} />
          </div>
          <span className="text-sm font-mono">{Number(r.market_share_pct || 0).toFixed(1)}%</span>
        </div>
      ),
    },
    {
      header: 'Revenue',
      accessorKey: 'revenue',
      cell: (r) => r.revenue != null ? formatNumber(r.revenue) : '—',
    },
  ];

  const movementColumns: Column<any>[] = [
    { header: 'Brand', accessorKey: 'brand', cell: (r) => <div className="font-semibold text-sm">{r.brand}</div> },
    { header: 'Momentum', accessorKey: 'momentum_score', cell: (r) => <ScoreBar score={Number(r.momentum_score) || 0} /> },
    { header: 'Share', accessorKey: 'market_share_pct', cell: (r) => `${Number(r.market_share_pct || 0).toFixed(1)}%` },
    { header: 'Efficiency', accessorKey: 'revenue_per_product', cell: (r) => r.revenue_per_product != null ? formatNumber(r.revenue_per_product) : '—' },
    { header: 'Label', accessorKey: 'business_label', cell: (r) => <BusinessBadge label={String(r.business_label || '—')} /> },
  ];

  // -----------------------------------------------------------------------
  // Quadrant card
  // -----------------------------------------------------------------------
  type QuadColor = 'purple' | 'blue' | 'orange' | 'red';
  const quadMap: Record<QuadColor, { border: string; bg: string; badge: string; row0: string; icon: string }> = {
    purple: { border: 'border-purple-500/30',  bg: 'bg-purple-500/5',  badge: 'bg-purple-500/15 text-purple-500',  row0: 'bg-purple-500/10', icon: 'text-purple-500' },
    blue:   { border: 'border-blue-500/30',    bg: 'bg-blue-500/5',    badge: 'bg-blue-500/15 text-blue-500',    row0: 'bg-blue-500/10', icon: 'text-blue-500' },
    orange: { border: 'border-orange-500/30',  bg: 'bg-orange-500/5',  badge: 'bg-orange-500/15 text-orange-500',  row0: 'bg-orange-500/10', icon: 'text-orange-500' },
    red:    { border: 'border-red-500/30',     bg: 'bg-red-500/5',     badge: 'bg-red-500/15 text-red-500',     row0: 'bg-red-500/10', icon: 'text-red-500' },
  };

  const QuadrantCard = ({
    title, subtitle, count, brands, color,
  }: {
    title: string; subtitle: string; count: number; brands: any[]; color: QuadColor;
  }) => {
    const s = quadMap[color];
    return (
      <div className={cn('rounded-xl border p-4', s.border, s.bg)}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <span className={cn('text-sm font-bold px-2.5 py-1 rounded-full', s.badge)}>{count}</span>
        </div>
        {brands.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">None identified</p>
        ) : (
          <ul className="space-y-1.5">
            {brands.slice(0, 5).map((b: any, i: number) => (
              <li key={b.brand} className={cn('flex items-center justify-between rounded-lg px-3 py-2', i === 0 ? s.row0 : 'bg-card/60')}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0">#{i + 1}</span>
                  <span className={cn('text-sm truncate', i === 0 ? 'font-semibold' : 'font-medium')}>{b.brand}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground">{Number(b.market_share_pct || 0).toFixed(1)}%</span>
                  <span className="text-xs font-semibold tabular-nums">{Number(b.momentum_score || 0).toFixed(1)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Control bar for concentration
  // -----------------------------------------------------------------------
  const othersShare = Math.max(0, 100 - top10Share);
  const segments = [
    { width: top3Share, color: 'bg-purple-500', label: `Top 3 (${top3Share.toFixed(1)}%)` },
    { width: top5Share - top3Share, color: 'bg-blue-500', label: `Top 4-5 (${(top5Share - top3Share).toFixed(1)}%)` },
    { width: top10Share - top5Share, color: 'bg-cyan-500', label: `Top 6-10 (${(top10Share - top5Share).toFixed(1)}%)` },
    { width: othersShare, color: 'bg-muted', label: `Others (${othersShare.toFixed(1)}%)` },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Sales Momentum Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Brand-level competitive momentum, market ownership, and share movement analysis.
        </p>
      </div>

      {/* Dominance Warning */}
      {dominantWarning && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-500">Monopoly Risk Detected</p>
              <p className="text-xs text-red-500/80">
                {dominantBrands.join(', ')} controls more than 50% of category revenue. Market share recalculated using brand_revenue / total_category_revenue.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {([
          { label: 'Market Direction', value: marketDirection, sub: `Avg score ${meanScore.toFixed(1)}`, color: directionColor, bg: directionBg, icon: <TrendingUp className="w-4 h-4" /> },
          { label: 'Total Brands', value: String(totalBrands), sub: totalRevenue ? `$${formatNumber(totalRevenue)} total revenue` : 'Revenue unavailable', color: 'text-foreground', bg: 'bg-muted border-border', icon: <Users className="w-4 h-4" /> },
          { label: 'Market Leaders', value: String(leaders.length), sub: leaders.length > 0 ? `${leaders[0].brand} leads` : 'None identified', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', icon: <Crown className="w-4 h-4" /> },
          { label: 'Emerging Challengers', value: String(challengers.length), sub: challengers.length > 0 ? `${challengers[0].brand} rising` : 'None identified', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: <Zap className="w-4 h-4" /> },
          { label: 'Top 5 Share', value: `${top5Share.toFixed(1)}%`, sub: marketStructure, color: top5Share >= 60 ? 'text-red-500' : top5Share >= 40 ? 'text-orange-500' : 'text-emerald-500', bg: top5Share >= 60 ? 'bg-red-500/10 border-red-500/30' : top5Share >= 40 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-emerald-500/10 border-emerald-500/30', icon: <BarChart3 className="w-4 h-4" /> },
          { label: 'Largest Brand', value: largestBrand, sub: `${largestShare.toFixed(1)}% share`, color: largestShare >= 30 ? 'text-red-500' : 'text-foreground', bg: largestShare >= 30 ? 'bg-red-500/10 border-red-500/30' : 'bg-muted border-border', icon: <Target className="w-4 h-4" /> },
        ] as const).map((kpi) => (
          <Card key={kpi.label} className="hover-card-anim">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">{kpi.label}</p>
                <div className={cn('p-1.5 rounded-lg border flex-shrink-0', kpi.bg)}>
                  <span className={kpi.color}>{kpi.icon}</span>
                </div>
              </div>
              <p className={cn('text-xl font-bold leading-tight truncate', kpi.color)} title={String(kpi.value)}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Market Concentration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Market Concentration</CardTitle>
          </div>
          <CardDescription>Revenue ownership distribution across the competitive hierarchy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stacked bar */}
          <div className="flex h-8 rounded-lg overflow-hidden w-full">
            {segments.map((s, i) => (
              <div
                key={i}
                className={cn('flex items-center justify-center text-xs font-bold text-white transition-all', s.color)}
                style={{ width: `${Math.max(0, s.width)}%` }}
                title={s.label}
              >
                {s.width > 8 ? `${s.width.toFixed(0)}%` : ''}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              { color: 'bg-purple-500', label: `Top 3 (${top3Share.toFixed(1)}%)` },
              { color: 'bg-blue-500', label: `Top 4-5 (${(top5Share - top3Share).toFixed(1)}%)` },
              { color: 'bg-cyan-500', label: `Top 6-10 (${(top10Share - top5Share).toFixed(1)}%)` },
              { color: 'bg-muted-foreground/30', label: `Others (${othersShare.toFixed(1)}%)` },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', l.color)} />
                {l.label}
              </span>
            ))}
          </div>
          {/* Concentration metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Top 3 Share', value: `${top3Share.toFixed(1)}%`, accent: top3Share >= 50 ? 'text-red-500' : 'text-blue-400' },
              { label: 'Top 5 Share', value: `${top5Share.toFixed(1)}%`, accent: top5Share >= 60 ? 'text-red-500' : 'text-cyan-400' },
              { label: 'Top 10 Share', value: `${top10Share.toFixed(1)}%`, accent: 'text-sky-400' },
              { label: 'Market Structure', value: marketStructure, accent: marketStructure === 'Fragmented' ? 'text-emerald-500' : marketStructure === 'Highly Dominated' ? 'text-red-500' : 'text-orange-500' },
            ].map((item) => (
              <div key={item.label} className="bg-muted/40 rounded-xl p-4 text-center">
                <p className={cn('text-2xl font-bold', item.accent)}>{item.value}</p>
                <p className="text-xs font-semibold mt-1 text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Business Label Quadrants */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Competitive Landscape</CardTitle>
          <CardDescription>Brands classified by market share and momentum dynamics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <QuadrantCard
              title="Market Leaders"
              subtitle="High share + high momentum — dominant competitive position"
              count={leaders.length}
              brands={leaders}
              color="purple"
            />
            <QuadrantCard
              title="Emerging Challengers"
              subtitle="Low share + high momentum — climbing fast"
              count={challengers.length}
              brands={challengers}
              color="blue"
            />
            <QuadrantCard
              title="Vulnerable Leaders"
              subtitle="High share + low momentum — disruption risk"
              count={vulnerable.length}
              brands={vulnerable}
              color="orange"
            />
            <QuadrantCard
              title="Declining Players"
              subtitle="Low share + low momentum — losing ground"
              count={declining.length}
              brands={declining}
              color="red"
            />
          </div>
        </CardContent>
      </Card>

      {/* Full Brand Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Brands — Momentum Ranking</CardTitle>
          <CardDescription>Complete brand list sorted by momentum score with tier and business classification</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={brandColumns} data={allBrands.map((b, i) => ({ ...b, rank: i + 1 }))} pageSize={15} />
        </CardContent>
      </Card>

      {/* Share Gainers + Losers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <CardTitle className="text-base">Share Gainers</CardTitle>
            </div>
            <CardDescription>Brands capturing quality share through revenue efficiency and momentum</CardDescription>
          </CardHeader>
          <CardContent>
            {gainers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No share gainers identified.</p>
            ) : (
              <DataTable columns={movementColumns} data={gainers} pageSize={5} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-red-500" />
              <CardTitle className="text-base">Share Losers</CardTitle>
            </div>
            <CardDescription>Brands losing ground through low efficiency and declining momentum</CardDescription>
          </CardHeader>
          <CardContent>
            {losers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No share losers identified.</p>
            ) : (
              <DataTable columns={movementColumns} data={losers} pageSize={5} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Executive Summary */}
      {executiveSummary && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Executive Summary</CardTitle>
            </div>
            <CardDescription>Market ownership, share movement, and disruption signals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[
                { label: 'Market Status', accent: directionColor, text: `${marketDirection} — avg momentum ${meanScore.toFixed(1)} across ${totalBrands} brands. ${marketStructure} market structure.` },
                { label: 'Ownership', accent: largestShare >= 30 ? 'text-red-500' : 'text-purple-400', text: largestShare >= 30 ? `${largestBrand} dominates with ${largestShare.toFixed(1)}% share.` : `No single brand dominates. Top 5 control ${top5Share.toFixed(1)}%.` },
                ...(gainers.length > 0 ? [{ label: 'Gaining Share', accent: 'text-emerald-500', text: `${gainers[0].brand} is gaining with ${Number(gainers[0].momentum_score).toFixed(1)} momentum and ${Number(gainers[0].market_share_pct).toFixed(1)}% share.` }] : []),
                ...(losers.length > 0 ? [{ label: 'Losing Share', accent: 'text-red-500', text: `${losers[0].brand} is losing ground with ${Number(losers[0].momentum_score).toFixed(1)} momentum.` }] : []),
                ...(vulnerable.length > 0 && challengers.length > 0 ? [{ label: 'Disruption Risk', accent: 'text-orange-500', text: `${vulnerable.length} vulnerable leader(s) face ${challengers.length} emerging challenger(s).` }] : []),
                ...(dominantWarning ? [{ label: 'Monopoly Alert', accent: 'text-red-500', text: `${dominantBrands.join(', ')} controls >50% of revenue. Entry barriers are extreme.` }] : []),
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-card/60 border border-border/50 px-4 py-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</p>
                  <p className={cn('text-sm leading-relaxed', item.accent)}>{item.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </motion.div>
  );
}
