import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatNumber, cn } from '../utils/cn';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Loader2,
  TrendingUp, ShieldAlert, Eye, Zap, Users, AlertTriangle, Info,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

// ---------------------------------------------------------------------------
// Tooltip wrapper
// ---------------------------------------------------------------------------
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-56">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

export default function SalesMomentum() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-momentum'],
    queryFn: () => api.getSalesMomentum(30),
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
          <p className="text-red-500/80">{getEngineErrorMessage(data, 'Requires BlackBox with sales trend data.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const growing  = results.fastest_growing_brands || [];
  const declining = results.declining_brands || [];

  // ── All brands ─────────────────────────────────────────────────────────────
  const allRaw: any[] = results.all_brands || [...growing, ...declining];
  const brandMap = new Map<string, any>();
  allRaw.forEach((b: any) => {
    const key = (b.brand || '').trim();
    if (!key) return;
    if (!brandMap.has(key)) brandMap.set(key, { ...b });
    else {
      const existing = brandMap.get(key);
      ['momentum_score','total_asin_sales','revenue_strength_score','sales_velocity_score','review_velocity_score','bsr_momentum_score'].forEach((k) => {
        if (existing[k] == null && b[k] != null) existing[k] = b[k];
      });
      brandMap.set(key, existing);
    }
  });
  const allBrands = Array.from(brandMap.values());

  const salesValues = allBrands.map((b) => Number(b.total_asin_sales) || 0).filter((v) => v > 0).sort((a, z) => a - z);
  const medianSales = salesValues.length ? salesValues[Math.floor(salesValues.length / 2)] : 0;
  const momentumHigh = 60;

  const totalMarketMomentum = allBrands.reduce((s, b) => s + (Number(b.momentum_score) || 0), 0) || 1;
  const totalMarketSales    = allBrands.reduce((s, b) => s + (Number(b.total_asin_sales) || 0), 0) || 1;

  const clampValue = (value: number, min = 0, max = 100) => {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  };
  const normalizeScore = (value: number) => clampValue(value, 0, 100);
  const normalizeShare = (value: number) => clampValue(value, 0, 1);

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderPositionBadge = (position: string) => {
    const config: Record<string, { variant: 'default'|'success'|'warning'|'danger'|'outline'; className: string }> = {
      'Accelerating Leader': { variant: 'success', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
      'Emerging Winner':     { variant: 'default',  className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
      'Stagnating Leader':   { variant: 'warning',  className: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
      'Weak Player':         { variant: 'danger',   className: 'bg-red-500/15 text-red-600 border-red-500/30' },
    };
    const badge = config[position] || { variant: 'outline' as const, className: 'bg-muted text-muted-foreground border-border' };
    return (
      <Badge variant={badge.variant} className={cn('uppercase tracking-wide text-[11px] px-2 py-0.5 border', badge.className)}>
        {position || 'Unknown'}
      </Badge>
    );
  };

  const renderTrend = (score: number) => {
    const rising = score >= momentumHigh;
    const Icon = rising ? ArrowUpRight : ArrowDownRight;
    return (
      <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', rising ? 'text-emerald-500' : 'text-red-500')}>
        {score.toFixed(1)} <Icon className="w-3 h-3" />
      </span>
    );
  };

  const rowHighlight = (row: any) => {
    if (row.rank === 1) return 'bg-amber-50/60 dark:bg-amber-900/10';
    if (row.rank === 2) return 'bg-slate-50/60 dark:bg-slate-800/20';
    if (row.rank === 3) return 'bg-orange-50/60 dark:bg-orange-900/10';
    return '';
  };

  // ── Enriched brand data ────────────────────────────────────────────────────
  const enriched = allBrands.map((b) => {
    const sales            = Number(b.total_asin_sales) || 0;
    const momentum         = normalizeScore(Number(b.momentum_score) || 0);
    const revenue_strength = normalizeScore(Number(b.revenue_strength_score) || 0);
    const sales_velocity   = normalizeScore(Number(b.sales_velocity_score) || 0);
    const review_velocity  = normalizeScore(Number(b.review_velocity_score) || 0);
    const bsr_momentum     = normalizeScore(Number(b.bsr_momentum_score) || 0);
    const market_share     = totalMarketSales ? normalizeShare(sales / totalMarketSales) : 0;
    const market_share_gap = (1 - market_share) * 100;

    const driverMap: Record<string, number> = {
      'Sales Velocity':   sales_velocity,
      'Review Growth':    review_velocity,
      'BSR Improvement':  bsr_momentum,
      'Revenue Strength': revenue_strength,
    };
    const primary_driver = Object.entries(driverMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sales Velocity';
    const weakest_driver = Object.entries(driverMap).sort((a, b) => a[1] - b[1])[0]?.[0] || null;

    const opportunity_raw   = 0.6 * momentum + 0.2 * revenue_strength + 0.2 * market_share_gap;
    const opportunity_score = Math.max(0, Math.min(100, opportunity_raw));
    let opportunity_label   = 'Low Opportunity';
    if (opportunity_score >= 80)      opportunity_label = 'Breakout Opportunity';
    else if (opportunity_score >= 65) opportunity_label = 'High Opportunity';
    else if (opportunity_score >= 45) opportunity_label = 'Moderate Opportunity';

    const risk_raw   = (0.6 * revenue_strength) + (0.4 * (100 - momentum));
    const risk_score = Math.max(0, Math.min(100, risk_raw));
    let risk_label   = 'Low';
    if (risk_score >= 80)      risk_label = 'Critical';
    else if (risk_score >= 60) risk_label = 'High';
    else if (risk_score >= 40) risk_label = 'Moderate';

    const highSales    = sales > 0 && sales >= medianSales && medianSales > 0;
    const highMomentum = momentum >= momentumHigh;
    let market_position = 'Weak Player';
    if (highSales && highMomentum)   market_position = 'Accelerating Leader';
    else if (!highSales && highMomentum) market_position = 'Emerging Winner';
    else if (highSales && !highMomentum) market_position = 'Stagnating Leader';

    const market_share_pct  = market_share * 100;
    const share_capture_raw = 0.6 * momentum + 0.4 * market_share_pct;
    const share_capture_score = Math.max(0, Math.min(100, share_capture_raw));
    let share_capture_label = 'Limited Impact';
    if (share_capture_score >= 80)      share_capture_label = 'Dominating';
    else if (share_capture_score >= 65) share_capture_label = 'Expanding';
    else if (share_capture_score >= 45) share_capture_label = 'Emerging';

    return {
      ...b, market_share, market_share_gap, primary_driver, weakest_driver,
      share_capture_score, share_capture_label, opportunity_score, opportunity_label,
      risk_score, risk_label, market_position, highSales, highMomentum,
    };
  });

  // ── Segments ───────────────────────────────────────────────────────────────
  const accelerating = enriched.filter((b) => b.highSales && b.highMomentum);
  const emerging     = enriched.filter((b) => !b.highSales && b.highMomentum);
  const stagnating   = enriched.filter((b) => b.highSales && !b.highMomentum && b.total_asin_sales > 0);
  const weak         = enriched.filter((b) => !b.highSales && !b.highMomentum);

  const mostVulnerableBrand  = stagnating.length > 0 ? stagnating.slice().sort((a, b) => b.risk_score - a.risk_score)[0] : null;
  const leadersRising        = accelerating.slice().sort((a, b) => (Number(b.momentum_score)||0) - (Number(a.momentum_score)||0));
  const leadersFalling       = stagnating.slice().sort((a, b)   => (Number(b.momentum_score)||0) - (Number(a.momentum_score)||0));
  const challengersRising    = emerging.slice().sort((a, b)     => (Number(b.momentum_score)||0) - (Number(a.momentum_score)||0));
  const challengersFalling   = weak.slice().sort((a, b)         => (Number(b.momentum_score)||0) - (Number(a.momentum_score)||0));

  const top10 = enriched.slice().sort((a, b) => (b.momentum_score||0) - (a.momentum_score||0)).slice(0, 10);
  const top10MomentumShare = (top10.reduce((s, b) => s + (Number(b.momentum_score)||0), 0) / totalMarketMomentum) * 100;
  const concentrationLabel = top10MomentumShare >= 60 ? 'Dominated' : top10MomentumShare >= 40 ? 'Concentrated' : top10MomentumShare >= 25 ? 'Balanced' : 'Distributed';

  const averageMarketMomentum = enriched.length ? enriched.reduce((s, b) => s + (Number(b.momentum_score)||0), 0) / enriched.length : 0;
  let market_direction = 'Stable';
  if (averageMarketMomentum >= 60)     market_direction = 'Expanding';
  else if (averageMarketMomentum < 40) market_direction = 'Slowing';
  if (averageMarketMomentum < 30)      market_direction = 'Contracting';

  const highestMomentumBrand = top10[0] || {};
  const bestEmerging         = emerging.slice().sort((a, b) => b.opportunity_score - a.opportunity_score)[0] || null;
  const topShareGainer       = enriched.slice().sort((a, b) => (b.share_capture_score||0) - (a.share_capture_score||0))[0] || null;
  const largestShareHolder   = enriched.slice().sort((a, b) => (Number(b.market_share)||0) - (Number(a.market_share)||0))[0] || null;

  const driverTotals = enriched.reduce((acc: Record<string, number>, b: any) => {
    acc['Sales Velocity']   = (acc['Sales Velocity']   || 0) + (Number(b.sales_velocity_score)  || 0);
    acc['Review Growth']    = (acc['Review Growth']    || 0) + (Number(b.review_velocity_score)  || 0);
    acc['BSR Improvement']  = (acc['BSR Improvement']  || 0) + (Number(b.bsr_momentum_score)     || 0);
    acc['Revenue Strength'] = (acc['Revenue Strength'] || 0) + (Number(b.revenue_strength_score) || 0);
    return acc;
  }, {});
  const marketMomentumDriver = Object.entries(driverTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sales Velocity';

  const top10WithRank = top10.map((b, i) => ({ ...b, rank: i + 1 }));

  const directionColor = market_direction === 'Expanding' ? 'text-emerald-500'
    : market_direction === 'Contracting' ? 'text-red-500'
    : market_direction === 'Slowing' ? 'text-orange-500'
    : 'text-blue-400';

  // ── Table columns ──────────────────────────────────────────────────────────
  const acceleratingColumns: Column<any>[] = [
    { header: '#', accessorKey: 'rank', cell: (r) => <span className="font-bold text-muted-foreground text-sm">{r.rank}</span> },
    { header: 'Brand', accessorKey: 'brand', cell: (r) => (
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ''}</span>
        <div>
          <div className="font-semibold text-sm">{r.brand}</div>
          <div className="text-xs text-muted-foreground">{r.share_capture_label}</div>
        </div>
      </div>
    )},
    { header: 'Momentum', accessorKey: 'momentum_score', cell: (r) => renderTrend(Number(r.momentum_score)||0) },
    { header: 'Share', accessorKey: 'market_share', cell: (r) => <span className="font-semibold">{((Number(r.market_share)||0)*100).toFixed(1)}%</span> },
    { header: 'Position', accessorKey: 'market_position', cell: (r) => renderPositionBadge(r.market_position||'—') },
    { header: 'Driver', accessorKey: 'primary_driver', cell: (r) => <span className="text-xs text-muted-foreground">{r.primary_driver}</span> },
    { header: 'Opportunity', accessorKey: 'opportunity_score', cell: (r) => (
      <div>
        <div className="text-sm font-semibold">{(Number(r.opportunity_score)||0).toFixed(1)}</div>
        <div className="text-xs text-muted-foreground">{r.opportunity_label}</div>
      </div>
    )},
  ];

  const emergingColumns: Column<any>[] = [
    { header: 'Brand', accessorKey: 'brand', cell: (r) => <div className="font-semibold text-sm">{r.brand}</div> },
    { header: 'Sales', accessorKey: 'total_asin_sales', cell: (r) => r.total_asin_sales != null ? formatNumber(r.total_asin_sales) : '—' },
    { header: 'Momentum', accessorKey: 'momentum_score', cell: (r) => renderTrend(Number(r.momentum_score)||0) },
    { header: 'Share', accessorKey: 'market_share', cell: (r) => `${((Number(r.market_share)||0)*100).toFixed(1)}%` },
    { header: 'Position', accessorKey: 'market_position', cell: (r) => renderPositionBadge(r.market_position||'—') },
    { header: 'Driver', accessorKey: 'primary_driver', cell: (r) => <span className="text-xs text-muted-foreground">{r.primary_driver}</span> },
    { header: 'Opportunity', accessorKey: 'opportunity_score', cell: (r) => (
      <div>
        <div className="text-sm font-semibold">{(Number(r.opportunity_score)||0).toFixed(1)}</div>
        <div className="text-xs text-muted-foreground">{r.opportunity_label}</div>
      </div>
    )},
  ];

  const stagnatingColumns: Column<any>[] = [
    { header: 'Brand', accessorKey: 'brand', cell: (r) => <div className="font-semibold text-sm">{r.brand}</div> },
    { header: 'Sales', accessorKey: 'total_asin_sales', cell: (r) => r.total_asin_sales != null ? formatNumber(r.total_asin_sales) : '—' },
    { header: 'Momentum', accessorKey: 'momentum_score', cell: (r) => renderTrend(Number(r.momentum_score)||0) },
    { header: 'Share', accessorKey: 'market_share', cell: (r) => `${((Number(r.market_share)||0)*100).toFixed(1)}%` },
    { header: 'Position', accessorKey: 'market_position', cell: (r) => renderPositionBadge(r.market_position||'—') },
    { header: 'Weakness', accessorKey: 'weakest_driver', cell: (r) => <span className="text-xs text-orange-500">{r.weakest_driver||'—'}</span> },
    { header: 'Risk', accessorKey: 'risk_score', cell: (r) => (
      <span className={cn('text-sm font-semibold', (Number(r.risk_score)||0) >= 60 ? 'text-red-500' : 'text-orange-500')}>
        {(Number(r.risk_score)||0).toFixed(0)}
        <span className="text-xs font-normal text-muted-foreground ml-1">({r.risk_label})</span>
      </span>
    )},
  ];

  // ── Heatmap quadrant ──────────────────────────────────────────────────────
  type ColorScheme = 'green' | 'orange' | 'blue' | 'red';
  const schemeMap: Record<ColorScheme, { border: string; bg: string; badge: string; row0: string }> = {
    green:  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5',  badge: 'bg-emerald-500/15 text-emerald-600', row0: 'bg-emerald-500/10' },
    orange: { border: 'border-orange-500/30',  bg: 'bg-orange-500/5',   badge: 'bg-orange-500/15 text-orange-600',  row0: 'bg-orange-500/10' },
    blue:   { border: 'border-blue-500/30',    bg: 'bg-blue-500/5',     badge: 'bg-blue-500/15 text-blue-600',      row0: 'bg-blue-500/10' },
    red:    { border: 'border-red-500/30',     bg: 'bg-red-500/5',      badge: 'bg-red-500/15 text-red-600',        row0: 'bg-red-500/10' },
  };

  const HeatmapQuadrant = ({ title, subtitle, count, brands, colorScheme }: {
    title: string; subtitle: string; count: number; brands: any[]; colorScheme: ColorScheme;
  }) => {
    const s = schemeMap[colorScheme];
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
          <p className="text-xs text-muted-foreground italic">None in this category</p>
        ) : (
          <ul className="space-y-1.5">
            {brands.slice(0, 5).map((b: any, i: number) => (
              <li key={b.brand} className={cn('flex items-center justify-between rounded-lg px-3 py-2', i === 0 ? s.row0 : 'bg-card/60')}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0">#{i+1}</span>
                  <span className={cn('text-sm truncate', i === 0 ? 'font-semibold' : 'font-medium')}>{b.brand}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground">{((Number(b.market_share)||0)*100).toFixed(1)}%</span>
                  <span className={cn('text-xs font-semibold tabular-nums', (Number(b.momentum_score)||0) >= momentumHigh ? 'text-emerald-500' : 'text-red-400')}>
                    {(Number(b.momentum_score)||0).toFixed(1)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // ── Compact segment card ───────────────────────────────────────────────────
  type SegColorScheme = 'green' | 'blue' | 'red';
  const segSchemeMap: Record<SegColorScheme, { border: string; bg: string; text: string; count: string }> = {
    green: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5',  text: 'text-emerald-600', count: 'text-emerald-500' },
    blue:  { border: 'border-blue-500/30',    bg: 'bg-blue-500/5',     text: 'text-blue-600',    count: 'text-blue-500' },
    red:   { border: 'border-red-500/30',     bg: 'bg-red-500/5',      text: 'text-red-600',     count: 'text-red-500' },
  };

  const SegmentCard = ({ label, count, topBrand, topMomentum, topShare, colorScheme, icon }: {
    label: string; count: number; topBrand: string; topMomentum: number;
    topShare: number; colorScheme: SegColorScheme; icon: React.ReactNode;
  }) => {
    const s = segSchemeMap[colorScheme];
    return (
      <div className={cn('rounded-xl border p-4', s.border, s.bg)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className={s.text}>{icon}</span>
            <p className={cn('text-xs font-semibold uppercase tracking-wider', s.text)}>{label}</p>
          </div>
          <span className={cn('text-2xl font-bold', s.count)}>{count}</span>
        </div>
        {count > 0 ? (
          <div className="mt-2 space-y-0.5">
            <p className="text-sm font-semibold truncate">{topBrand}</p>
            <p className="text-xs text-muted-foreground">{topMomentum.toFixed(1)} momentum · {topShare.toFixed(1)}% share</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground italic">None identified</p>
        )}
      </div>
    );
  };

  // ── Intelligence panel ─────────────────────────────────────────────────────
  const InsightCard = ({ title, description, icon, borderColor, items }: {
    title: string; description: string; icon: React.ReactNode; borderColor: string;
    items: { label: string; value: string; detail: string; accent?: string }[];
  }) => (
    <Card className={cn('border-l-4', borderColor)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</p>
            <p className={cn('text-sm font-bold', item.accent || 'text-foreground')}>{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Sales Velocity Intelligence</h1>
        <p className="text-muted-foreground mt-1">Who is accelerating, who is slowing down, and where future market share is being captured.</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {([
          { label: 'Market Direction',    value: market_direction,                  sub: `Avg momentum ${averageMarketMomentum.toFixed(1)}`,                                                                  color: directionColor,          icon: <TrendingUp className="w-4 h-4" />,    bg: 'bg-primary/10 border-primary/20',              tip: 'Overall category velocity based on average momentum score.' },
          { label: 'Fastest Growing',     value: highestMomentumBrand.brand || '—', sub: `${Number(highestMomentumBrand.momentum_score || averageMarketMomentum).toFixed(1)} momentum`,                       color: 'text-emerald-500',      icon: <ArrowUpRight className="w-4 h-4" />,  bg: 'bg-emerald-500/10 border-emerald-500/30',      tip: 'Brand with the highest momentum score in the category.' },
          { label: 'Largest Share Holder',value: largestShareHolder?.brand || '—',  sub: `${largestShareHolder ? ((Number(largestShareHolder.market_share)||0)*100).toFixed(1) : '0'}% share`,                color: 'text-purple-400',       icon: <Users className="w-4 h-4" />,         bg: 'bg-purple-500/10 border-purple-500/30',        tip: 'Brand controlling the largest proportion of category sales.' },
          { label: 'Top Challenger',      value: bestEmerging?.brand || '—',        sub: bestEmerging ? `${bestEmerging.opportunity_score.toFixed(1)} opportunity` : 'None identified',                       color: 'text-blue-400',         icon: <Zap className="w-4 h-4" />,           bg: 'bg-blue-500/10 border-blue-500/30',            tip: 'Highest-opportunity emerging brand with strong momentum but lower current share.' },
          { label: 'Vulnerable Leaders',  value: stagnating.length,                 sub: stagnating.length > 0 ? `${stagnating[0].brand} most at risk` : 'None identified',                                  color: stagnating.length > 0 ? 'text-orange-500' : 'text-muted-foreground', icon: <AlertTriangle className="w-4 h-4" />, bg: stagnating.length > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-muted border-border', tip: 'High-share brands with declining momentum.' },
          { label: 'Primary Driver',      value: marketMomentumDriver,              sub: 'Category-wide growth signal',                                                                                        color: 'text-cyan-500',         icon: <Eye className="w-4 h-4" />,           bg: 'bg-cyan-500/10 border-cyan-500/30',            tip: 'The momentum component contributing most to category-wide growth.' },
        ] as const).map((kpi) => (
          <Card key={kpi.label} className="hover-card-anim">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">{kpi.label}</p>
                  <Tip text={kpi.tip}><Info className="w-3 h-3 text-muted-foreground/40 cursor-help flex-shrink-0" /></Tip>
                </div>
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

      {/* Executive Summary */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Executive Summary</CardTitle>
          </div>
          <CardDescription>Business narrative — category status at a glance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[
              { label: 'Category Status',        accent: directionColor,                                                text: `${market_direction} — avg momentum ${averageMarketMomentum.toFixed(1)}, ${concentrationLabel.toLowerCase()} concentration across ${enriched.length} brands.` },
              { label: 'Fastest Momentum Brand', accent: 'text-emerald-500',                                           text: highestMomentumBrand.brand ? `${highestMomentumBrand.brand} leads with ${Number(highestMomentumBrand.momentum_score || averageMarketMomentum).toFixed(1)} momentum and ${highestMomentumBrand.market_share != null ? ((Number(highestMomentumBrand.market_share)*100).toFixed(1)+'% share') : 'share unavailable'}.` : 'No momentum leader identified.' },
              { label: 'Largest Share Holder',   accent: 'text-purple-400',                                            text: largestShareHolder ? `${largestShareHolder.brand} controls ${((Number(largestShareHolder.market_share)||0)*100).toFixed(1)}% of category sales — ${largestShareHolder.highMomentum ? 'actively accelerating' : 'momentum is slowing'}.` : 'No dominant share holder identified.' },
              { label: 'Strongest Challenger',   accent: 'text-blue-400',                                              text: bestEmerging ? `${bestEmerging.brand} is the highest-potential challenger with ${bestEmerging.opportunity_score.toFixed(1)} opportunity score and ${((Number(bestEmerging.market_share)||0)*100).toFixed(1)}% current share.` : 'No emerging challengers identified.' },
              { label: 'Vulnerable Leader Status',accent: mostVulnerableBrand ? 'text-orange-500' : 'text-muted-foreground', text: mostVulnerableBrand ? `${mostVulnerableBrand.brand} holds significant share but shows risk score ${mostVulnerableBrand.risk_score.toFixed(0)} with momentum at ${mostVulnerableBrand.momentum_score.toFixed(1)} — a target for challengers.` : 'No vulnerable leaders detected. Market leaders are holding momentum.' },
              { label: 'Primary Growth Driver',  accent: 'text-cyan-500',                                              text: `${marketMomentumDriver} is the dominant momentum signal. Brands excelling here are most likely to gain share.` },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-card/60 border border-border/50 px-4 py-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</p>
                <p className={cn('text-sm leading-relaxed', item.accent)}>{item.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Momentum Heatmap</CardTitle>
          <CardDescription>Leader / Challenger × Rising / Falling — count badges and top performers per quadrant</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HeatmapQuadrant title="Leader + Rising"      subtitle="Accelerating leaders — strongest competitive position" count={leadersRising.length}      brands={leadersRising}      colorScheme="green"  />
            <HeatmapQuadrant title="Leader + Falling"     subtitle="Vulnerable leaders losing momentum"                   count={leadersFalling.length}     brands={leadersFalling}     colorScheme="orange" />
            <HeatmapQuadrant title="Challenger + Rising"  subtitle="Emerging challengers gaining traction"               count={challengersRising.length}  brands={challengersRising}  colorScheme="blue"   />
            <HeatmapQuadrant title="Challenger + Falling" subtitle="Declining players with low share"                    count={challengersFalling.length} brands={challengersFalling} colorScheme="red"    />
          </div>
        </CardContent>
      </Card>

      {/* Segment cards (left) + Tables (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6 items-start">

        {/* LEFT: compact segment summary cards — sized to content only */}
        <div className="space-y-3">
          <SegmentCard label="Market Leaders"      count={accelerating.length} topBrand={accelerating[0]?.brand||'—'} topMomentum={Number(accelerating[0]?.momentum_score)||0} topShare={(Number(accelerating[0]?.market_share)||0)*100} colorScheme="green" icon={<TrendingUp className="w-4 h-4" />} />
          <SegmentCard label="Emerging Challengers" count={emerging.length}    topBrand={emerging[0]?.brand||'—'}     topMomentum={Number(emerging[0]?.momentum_score)||0}     topShare={(Number(emerging[0]?.market_share)||0)*100}     colorScheme="blue"  icon={<Zap className="w-4 h-4" />} />
          <SegmentCard label="Declining Players"   count={weak.length}         topBrand={weak[0]?.brand||'—'}         topMomentum={Number(weak[0]?.momentum_score)||0}         topShare={(Number(weak[0]?.market_share)||0)*100}         colorScheme="red"   icon={<ArrowDownRight className="w-4 h-4" />} />
        </div>

        {/* RIGHT: tables */}
        <div className="space-y-4">
          {top10WithRank.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Market Leaders — Top 10</CardTitle>
                <CardDescription>Brands capturing the highest sales velocity</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable columns={acceleratingColumns} data={top10WithRank} pageSize={10} rowClassName={rowHighlight} />
              </CardContent>
            </Card>
          )}
          {emerging.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Emerging Challengers</CardTitle>
                <CardDescription>High-momentum brands with share upside — sorted by opportunity</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable columns={emergingColumns} data={emerging.slice().sort((a, b) => b.opportunity_score - a.opportunity_score)} pageSize={5} />
              </CardContent>
            </Card>
          )}
          {stagnating.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Risks & Vulnerable Leaders</CardTitle>
                <CardDescription>High-share brands losing momentum — sorted by risk score</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable columns={stagnatingColumns} data={stagnating.slice().sort((a, b) => b.risk_score - a.risk_score)} pageSize={5} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Intelligence panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InsightCard
          title="Market Direction" description="Category acceleration trend"
          icon={<TrendingUp className="w-4 h-4 text-primary" />} borderColor="border-primary/50"
          items={[
            { label: 'Direction',     value: market_direction,       detail: `Average momentum ${averageMarketMomentum.toFixed(1)} across ${enriched.length} brands.`, accent: directionColor },
            { label: 'Concentration', value: concentrationLabel,     detail: `Top 10 brands hold ${top10MomentumShare.toFixed(1)}% of total momentum.` },
            { label: 'Primary Driver',value: marketMomentumDriver,   detail: 'Dominant growth signal across the category.', accent: 'text-cyan-500' },
          ]}
        />
        <InsightCard
          title="Strategic Insights" description="Executive signals and competitive risks"
          icon={<ShieldAlert className="w-4 h-4 text-blue-500" />} borderColor="border-blue-500/50"
          items={[
            ...(topShareGainer ? [{ label: 'Fastest Share Gainer',   value: topShareGainer.brand,       detail: `${topShareGainer.share_capture_score.toFixed(1)} capture score · ${((topShareGainer.market_share||0)*100).toFixed(1)}% share.`,   accent: 'text-emerald-500' }] : []),
            ...(mostVulnerableBrand ? [{ label: 'Most Vulnerable Leader', value: mostVulnerableBrand.brand, detail: `Risk ${mostVulnerableBrand.risk_score.toFixed(0)} · momentum ${mostVulnerableBrand.momentum_score.toFixed(1)}.`, accent: 'text-orange-500' }] : []),
            ...(bestEmerging ? [{ label: 'Top Challenger',           value: bestEmerging.brand,         detail: `Opportunity ${bestEmerging.opportunity_score.toFixed(1)} · ${((bestEmerging.market_share||0)*100).toFixed(1)}% share.`,           accent: 'text-blue-400' }] : []),
          ]}
        />
        <InsightCard
          title="Business Intelligence" description="Actionable market signals"
          icon={<Eye className="w-4 h-4 text-amber-500" />} borderColor="border-amber-500/50"
          items={[
            ...(largestShareHolder ? [{ label: 'Market Dominator',          value: largestShareHolder.brand,       detail: `Controls ${((largestShareHolder.market_share||0)*100).toFixed(1)}% of category share.`,                                  accent: 'text-purple-400' }] : []),
            ...(highestMomentumBrand.brand ? [{ label: 'Fastest Momentum Gainer', value: highestMomentumBrand.brand, detail: `Momentum ${Number(highestMomentumBrand.momentum_score || averageMarketMomentum).toFixed(1)}.`,                         accent: 'text-emerald-500' }] : []),
            { label: 'Competitive Watchlist', value: emerging.length > 0 ? emerging.slice(0,3).map((e) => e.brand).join(', ') : 'None identified', detail: emerging.length > 0 ? `${emerging.length} challenger${emerging.length > 1 ? 's' : ''} gaining momentum.` : 'No emerging challengers currently.', accent: 'text-blue-400' },
          ]}
        />
      </div>

    </motion.div>
  );
}
