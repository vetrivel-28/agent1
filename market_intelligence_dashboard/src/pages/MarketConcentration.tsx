import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Crown, Users, BarChart3, Lightbulb, Info,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierBadgeClass(tier: string): string {
  switch (tier) {
    case 'Market Leader':     return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    case 'Major Player':      return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    case 'Strong Challenger': return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30';
    case 'Emerging Player':   return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    default:                  return 'bg-muted text-muted-foreground border border-border';
  }
}

function hhiColor(hhi: number): string {
  if (hhi < 1500) return 'text-emerald-500';
  if (hhi <= 2500) return 'text-yellow-500';
  if (hhi <= 4000) return 'text-orange-500';
  return 'text-red-500';
}

function hhiBg(hhi: number): string {
  if (hhi < 1500) return 'bg-emerald-500/10 border-emerald-500/30';
  if (hhi <= 2500) return 'bg-yellow-500/10 border-yellow-500/30';
  if (hhi <= 4000) return 'bg-orange-500/10 border-orange-500/30';
  return 'bg-red-500/10 border-red-500/30';
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
// Stacked control bar
// ---------------------------------------------------------------------------

function ControlBar({ top1, top3, top5, top10 }: { top1: number; top3: number; top5: number; top10: number }) {
  const others = Math.max(0, 100 - top10);
  const segments = [
    { width: top1,            color: 'bg-purple-500', label: `#1 (${top1.toFixed(1)}%)` },
    { width: top3 - top1,     color: 'bg-blue-500',   label: `#2–3 (${(top3 - top1).toFixed(1)}%)` },
    { width: top5 - top3,     color: 'bg-cyan-500',   label: `#4–5 (${(top5 - top3).toFixed(1)}%)` },
    { width: top10 - top5,    color: 'bg-sky-400',    label: `#6–10 (${(top10 - top5).toFixed(1)}%)` },
    { width: others,          color: 'bg-muted',      label: `Others (${others.toFixed(1)}%)` },
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-8 rounded-lg overflow-hidden w-full">
        {segments.map((s, i) => (
          <div key={i} className={cn('flex items-center justify-center text-xs font-bold text-white transition-all', s.color)}
            style={{ width: `${Math.max(0, s.width)}%` }} title={s.label}>
            {s.width > 9 ? `${s.width.toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { color: 'bg-purple-500', label: `#1 Brand (${top1.toFixed(1)}%)` },
          { color: 'bg-blue-500',   label: `Top 3 (${top3.toFixed(1)}%)` },
          { color: 'bg-cyan-500',   label: `Top 5 (${top5.toFixed(1)}%)` },
          { color: 'bg-sky-400',    label: `Top 10 (${top10.toFixed(1)}%)` },
          { color: 'bg-muted-foreground/30', label: `Others (${others.toFixed(1)}%)` },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', l.color)} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart tooltip
// ---------------------------------------------------------------------------

function BarTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
      <p className="font-semibold">{d.fullBrand ?? d.brand}</p>
      <p className="text-muted-foreground">Revenue: <span className="text-foreground font-medium">{formatCurrency(d.revenue)}</span></p>
      <p className="text-muted-foreground">Share: <span className="text-foreground font-medium">{d.market_share_pct?.toFixed(2)}%</span></p>
      <p className="text-muted-foreground">Tier: <span className="text-foreground font-medium">{d.tier}</span></p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MarketConcentration() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-concentration'],
    queryFn: () => api.getMarketConcentration(50),
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
          <h2 className="text-xl font-bold text-red-500 mb-2">Market Structure Unavailable</h2>
          <p className="text-red-500/80">{getEngineErrorMessage(data, 'Requires BlackBox with Brand and Revenue columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const r = data.results;
  const topBrands: any[] = r.top_brands_by_market_share || [];
  const insights: { category: string; text: string }[] = r.strategic_insights || [];

  const totalBrands: number = r.fragmentation_analysis?.total_brands ?? 0;
  const hhi: number = r.hhi_score ?? 0;

  // Control metrics — derived from sorted brand list
  const top1Share  = r.largest_brand_share ?? 0;
  const top3Share  = r.top_3_share ?? 0;
  const top5Share  = r.top_5_share ?? 0;
  const top10Share = topBrands.slice(0, 10).reduce((s: number, b: any) => s + (b.market_share_pct ?? 0), 0);

  // Bar chart — top 10 + Others
  const top10Brands = topBrands.slice(0, 10);
  const othersRevenue = topBrands.slice(10).reduce((s: number, b: any) => s + (b.revenue ?? 0), 0);
  const othersShare   = topBrands.slice(10).reduce((s: number, b: any) => s + (b.market_share_pct ?? 0), 0);
  const barData = [
    ...top10Brands.map((b: any) => ({
      ...b,
      brand:    b.brand?.length > 20 ? b.brand.slice(0, 18) + '…' : b.brand,
      fullBrand: b.brand,
    })),
    ...(othersShare > 0 ? [{
      rank: 99, brand: 'Others', fullBrand: 'Others (aggregated)',
      revenue: othersRevenue,
      market_share_pct: parseFloat(othersShare.toFixed(2)),
      tier: 'Long Tail',
    }] : []),
  ];

  const barColor = (rank: number) => {
    if (rank === 1)  return '#a855f7';
    if (rank <= 3)   return '#3b82f6';
    if (rank <= 5)   return '#06b6d4';
    if (rank <= 10)  return '#38bdf8';
    return '#475569';
  };

  // Tier distribution
  const tierCounts: Record<string, number> = {};
  topBrands.forEach((b: any) => {
    tierCounts[b.tier] = (tierCounts[b.tier] || 0) + 1;
  });

  // Table columns
  const columns: Column<any>[] = [
    {
      header: '#',
      accessorKey: 'rank',
      cell: (row) => (
        <span className={cn('font-bold text-sm',
          row.rank === 1 ? 'text-purple-400' : row.rank <= 3 ? 'text-blue-400' : 'text-muted-foreground')}>
          {row.rank === 1 ? '👑' : ''} {row.rank}
        </span>
      ),
    },
    {
      header: 'Brand',
      accessorKey: 'brand',
      cell: (row) => <span className="font-semibold">{row.brand}</span>,
    },
    {
      header: 'Revenue',
      accessorKey: 'revenue',
      cell: (row) => row.revenue != null ? formatCurrency(row.revenue) : '—',
    },
    {
      header: 'Market Share',
      accessorKey: 'market_share_pct',
      cell: (row) => {
        const pct = row.market_share_pct ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="font-mono text-sm">{pct.toFixed(2)}%</span>
          </div>
        );
      },
    },
    {
      header: 'Tier',
      accessorKey: 'tier',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', tierBadgeClass(row.tier))}>
          {row.tier}
        </span>
      ),
    },
    {
      header: 'Competitive Position',
      accessorKey: 'competitive_position',
      cell: (row) => <span className="text-sm text-muted-foreground">{row.competitive_position}</span>,
    },
    {
      header: 'Gap to Leader',
      accessorKey: 'gap_to_leader',
      cell: (row) => {
        if (row.rank === 1) return <span className="text-xs text-purple-400 font-semibold">— Leader</span>;
        const gap = row.gap_to_leader ?? 0;
        return <span className="font-mono text-sm text-red-400">{gap.toFixed(1)}%</span>;
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Market Structure</h1>
        <p className="text-muted-foreground mt-1">
          Revenue ownership, brand concentration, and market control — who dominates this category.
        </p>
      </div>

      {/* KPI Row — concentration + control metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">

        {/* HHI + structure */}
        <Card className="hover-card-anim">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">HHI Score</p>
                <Tip text="Herfindahl-Hirschman Index. 0 = fully fragmented, 10,000 = monopoly. Below 1,500 = fragmented · 1,500–2,500 = moderately concentrated · 2,500–4,000 = concentrated · above 4,000 = highly dominated.">
                  <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                </Tip>
              </div>
              <div className={cn('p-2 rounded-lg border', hhiBg(hhi))}>
                <BarChart3 className={cn('w-4 h-4', hhiColor(hhi))} />
              </div>
            </div>
            <p className={cn('text-3xl font-bold font-mono', hhiColor(hhi))}>{hhi.toLocaleString()}</p>
            <p className="text-sm font-medium mt-0.5">{r.market_structure ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{r.market_shape ?? '—'}</p>
          </CardContent>
        </Card>

        {/* Market Leader */}
        <Card className="hover-card-anim">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Leader</p>
              <div className="p-2 rounded-lg border bg-purple-500/10 border-purple-500/30">
                <Crown className="w-4 h-4 text-purple-400" />
              </div>
            </div>
            <p className="text-xl font-bold leading-tight truncate" title={r.market_leader_name ?? r.largest_brand_name}>{r.market_leader_name ?? r.largest_brand_name ?? '—'}</p>
            <p className="text-2xl font-bold text-purple-400">{top1Share.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">{topBrands[0]?.competitive_position ?? 'Category Dominant'}</p>
          </CardContent>
        </Card>

        {/* Top 3 */}
        <Card className="hover-card-anim">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top 3 Control</p>
              <div className="p-2 rounded-lg border bg-blue-500/10 border-blue-500/30">
                <Crown className="w-4 h-4 text-blue-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-blue-400">{top3Share.toFixed(1)}%</p>
            <p className="text-sm font-medium">of category revenue</p>
            <p className="text-xs text-muted-foreground">Combined top 3 brands</p>
          </CardContent>
        </Card>

        {/* Top 5 */}
        <Card className="hover-card-anim">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top 5 Control</p>
              <div className="p-2 rounded-lg border bg-cyan-500/10 border-cyan-500/30">
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-cyan-400">{top5Share.toFixed(1)}%</p>
            <p className="text-sm font-medium">of category revenue</p>
            <p className="text-xs text-muted-foreground">Combined top 5 brands</p>
          </CardContent>
        </Card>

        {/* Top 10 */}
        <Card className="hover-card-anim">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top 10 Control</p>
              <div className="p-2 rounded-lg border bg-sky-500/10 border-sky-500/30">
                <Users className="w-4 h-4 text-sky-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-sky-400">{top10Share.toFixed(1)}%</p>
            <p className="text-sm font-medium">of category revenue</p>
            <p className="text-xs text-muted-foreground">Combined top 10 brands</p>
          </CardContent>
        </Card>

        {/* Total brands */}
        <Card className="hover-card-anim">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Brands</p>
              <div className="p-2 rounded-lg border bg-muted border-border">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-bold">{totalBrands.toLocaleString()}</p>
            <p className="text-sm font-medium">in this category</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(r.fragmentation_analysis?.total_market_revenue ?? 0)} total revenue</p>
          </CardContent>
        </Card>

        {/* Concentration score */}
        <Card className="hover-card-anim">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Concentration</p>
                <Tip text="(HHI / 10,000) × 100. Measures intensity of market concentration on a 0–100 scale.">
                  <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                </Tip>
              </div>
              <div className={cn('p-2 rounded-lg border', hhiBg(hhi))}>
                <BarChart3 className={cn('w-4 h-4', hhiColor(hhi))} />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-3xl font-bold', hhiColor(hhi))}>{r.concentration_score ?? 0}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{r.concentration_classification ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Control Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Revenue Control Breakdown</CardTitle>
          <CardDescription>How category revenue is distributed across the competitive hierarchy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ControlBar top1={top1Share} top3={top3Share} top5={top5Share} top10={top10Share} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Top Brand',  value: `${top1Share.toFixed(1)}%`,  name: r.market_leader_name ?? r.largest_brand_name ?? '—', color: 'text-purple-400' },
              { label: 'Top 3',      value: `${top3Share.toFixed(1)}%`,  name: 'Combined share',  color: 'text-blue-400' },
              { label: 'Top 5',      value: `${top5Share.toFixed(1)}%`,  name: 'Combined share',  color: 'text-cyan-400' },
              { label: 'Top 10',     value: `${top10Share.toFixed(1)}%`, name: 'Combined share',  color: 'text-sky-400' },
            ].map((item) => (
              <div key={item.label} className="bg-muted/40 rounded-xl p-4 text-center">
                <p className={cn('text-3xl font-bold', item.color)}>{item.value}</p>
                <p className="text-xs font-semibold mt-1">{item.label}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{item.name}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Market Share Distribution Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Market Share Distribution — Top 10 Brands</CardTitle>
          <CardDescription>Revenue share by brand, sorted descending. Colour intensity reflects competitive tier.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
              <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="brand" width={150}
                tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<BarTip />} cursor={{ fill: 'hsl(var(--muted)/0.4)' }} />
              <Bar dataKey="market_share_pct" radius={[0, 4, 4, 0]} maxBarSize={26}>
                {barData.map((entry: any) => (
                  <Cell key={`${entry.rank}-${entry.brand}`} fill={barColor(entry.rank)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 text-xs justify-center">
            {[
              { label: '#1 Brand',  color: '#a855f7' },
              { label: 'Top 3',     color: '#3b82f6' },
              { label: 'Top 5',     color: '#06b6d4' },
              { label: 'Top 10',    color: '#38bdf8' },
              { label: 'Others',    color: '#475569' },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tier Distribution + HHI Context side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Tier breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Brand Tier Distribution</CardTitle>
            <CardDescription>How brands are classified by revenue share</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { tier: 'Market Leader',     threshold: '>20% share',   color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
              { tier: 'Major Player',      threshold: '10–20% share', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
              { tier: 'Strong Challenger', threshold: '5–10% share',  color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20' },
              { tier: 'Emerging Player',   threshold: '1–5% share',   color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20' },
              { tier: 'Long Tail',         threshold: '<1% share',    color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
            ].map((t) => {
              const count = tierCounts[t.tier] ?? 0;
              const pct = totalBrands > 0 ? Math.round((count / totalBrands) * 100) : 0;
              return (
                <div key={t.tier} className={cn('rounded-xl border p-3 flex items-center justify-between', t.bg, t.border)}>
                  <div>
                    <p className={cn('text-sm font-semibold', t.color)}>{t.tier}</p>
                    <p className="text-xs text-muted-foreground">{t.threshold}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-xl font-bold', t.color)}>{count}</p>
                    <p className="text-xs text-muted-foreground">{pct}% of brands</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* HHI context + structure */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Concentration Analysis</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary */}
            <div className="space-y-3">
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Market Structure</p>
                <p className="text-2xl font-bold">{r.market_structure ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">HHI-based classification</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Market Shape</p>
                <p className="text-2xl font-bold">{r.market_shape ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Competitive structure type</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Raw HHI Index</p>
                <p className={cn('text-2xl font-bold font-mono', hhiColor(hhi))}>{hhi.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hhi < 1500 ? 'Below 1,500 — fragmented market'
                    : hhi <= 2500 ? '1,500–2,500 — moderately concentrated'
                    : hhi <= 4000 ? '2,500–4,000 — concentrated market'
                    : 'Above 4,000 — highly dominated'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strategic Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <CardTitle className="text-base">Market Structure Intelligence</CardTitle>
            </div>
            <CardDescription>Concentration findings derived from revenue ownership analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {insights
                .filter((ins) => ['Key Finding', 'Market Structure'].includes(ins.category))
                .concat(insights.filter((ins) => !['Key Finding', 'Market Structure'].includes(ins.category)))
                .map((insight, i) => {
                  const styles: Record<string, { border: string; badge: string; dot: string }> = {
                    'Key Finding':      { border: 'border-purple-500/30', badge: 'bg-purple-500/10 text-purple-400',  dot: 'bg-purple-500' },
                    'Market Structure': { border: 'border-blue-500/30',   badge: 'bg-blue-500/10 text-blue-400',     dot: 'bg-blue-500' },
                    'Entry Conditions': { border: 'border-orange-500/30', badge: 'bg-orange-500/10 text-orange-400', dot: 'bg-orange-500' },
                    'Opportunity':      { border: 'border-emerald-500/30',badge: 'bg-emerald-500/10 text-emerald-400',dot: 'bg-emerald-500' },
                    'Risk':             { border: 'border-red-500/30',    badge: 'bg-red-500/10 text-red-400',       dot: 'bg-red-500' },
                  };
                  const s = styles[insight.category] ?? { border: 'border-border', badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' };
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={cn('rounded-xl border p-4 space-y-2', s.border)}>
                      <div className="flex items-center gap-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', s.dot)} />
                        <span className={cn('text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', s.badge)}>
                          {insight.category}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed">{insight.text}</p>
                    </motion.div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Brand Ranking Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Market Share — Full Ranking</CardTitle>
          <CardDescription>All brands ranked by revenue share with tier classification and gap to market leader</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={topBrands} pageSize={15} />
        </CardContent>
      </Card>

    </motion.div>
  );
}
