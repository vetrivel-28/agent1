import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Crown, Network, Layers, Shield
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { motion } from 'framer-motion';

type BrandRanking = {
  rank: number;
  brand: string;
  parent_revenue: number;
  revenue_share: number;
  product_count: number;
  avg_revenue_per_product: number;
  segment: string;
};

type CompetitiveSegment = {
  segment: string;
  brand_count: number;
  combined_revenue: number;
  combined_share: number;
  top_brands: string[];
};

function segmentBadgeClass(segment: string): string {
  switch (segment) {
    case 'Market Leaders': return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    case 'Strong Competitors': return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    case 'Niche Players': return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30';
    case 'Long Tail': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    default:                  return 'bg-muted text-muted-foreground border border-border';
  }
}

function hhiColor(hhi: number): string {
  if (hhi < 1500) return 'text-emerald-500';
  if (hhi <= 2500) return 'text-amber-500';
  if (hhi <= 4000) return 'text-orange-500';
  return 'text-danger';
}

function ControlBar({ top1, top3, top5, top10 }: { top1: number; top3: number; top5: number; top10: number }) {
  const others = Math.max(0, 100 - top10);
  const segments = [
    { width: top1,            color: 'bg-primary', label: `#1 (${top1.toFixed(1)}%)` },
    { width: top3 - top1,     color: 'bg-primary/80',   label: `#2–3 (${(top3 - top1).toFixed(1)}%)` },
    { width: top5 - top3,     color: 'bg-primary/60',   label: `#4–5 (${(top5 - top3).toFixed(1)}%)` },
    { width: top10 - top5,    color: 'bg-primary/40',    label: `#6–10 (${(top10 - top5).toFixed(1)}%)` },
    { width: others,          color: 'bg-muted',      label: `Others (${others.toFixed(1)}%)` },
  ];
  return (
    <div className="space-y-4 w-full">
      <div className="flex h-12 rounded-xl overflow-hidden w-full shadow-inner border border-black/10 dark:border-white/10">
        {segments.map((s, i) => (
          <div key={i} className={cn('flex items-center justify-center text-xs font-bold text-white transition-all', s.color)}
            style={{ width: `${Math.max(0, s.width)}%` }} title={s.label}>
            {s.width > 9 ? `${s.width.toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-3 text-sm font-medium">
        {[
          { color: 'bg-primary', label: `#1 Brand (${top1.toFixed(1)}%)` },
          { color: 'bg-primary/80',   label: `Top 3 (${top3.toFixed(1)}%)` },
          { color: 'bg-primary/60',   label: `Top 5 (${top5.toFixed(1)}%)` },
          { color: 'bg-primary/40',    label: `Top 10 (${top10.toFixed(1)}%)` },
          { color: 'bg-muted-foreground/30', label: `Others (${others.toFixed(1)}%)` },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-2">
            <span className={cn('w-3 h-3 rounded-full inline-block', l.color)} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-xl text-sm space-y-1.5 min-w-[200px]">
      <p className="font-bold text-base border-b border-border/50 pb-2 mb-2">{d.fullBrand ?? d.brand}</p>
      <div className="flex justify-between"><span className="text-muted-foreground">Parent Revenue:</span> <span className="font-medium">{formatCurrency(d.parent_revenue)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Share:</span> <span className="font-medium text-primary">{d.revenue_share?.toFixed(2)}%</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Segment:</span> <span className="font-medium">{d.segment}</span></div>
    </div>
  );
}

export default function MarketConcentration() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-concentration'],
    queryFn: () => api.getMarketConcentration(50),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center theme-structure flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Analyzing market dominance...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10 theme-structure">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Market Structure Unavailable</h2>
          <p className="text-danger/80">{getEngineErrorMessage(data, 'Requires BlackBox with Brand and Revenue columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const structure = data.data?.results?.market_structure || {};
  const topBrands: BrandRanking[] = structure.brand_rankings || [];
  const landscape: CompetitiveSegment[] = structure.competitive_landscape || [];
  const hhi: number = data.data?.results?.hhi_score ?? 0;
  const totalRevenue: number = structure.total_market_revenue ?? 0;
  const totalBrands: number = structure.active_brand_count ?? 0;
  const top1Share = Number(structure.top_1_share ?? 0);
  const top3Share = Number(structure.top_3_share ?? 0);
  const top5Share = Number(structure.top_5_share ?? 0);
  const concentrationType: string = structure.concentration_type ?? 'N/A';
  const productCountSource: string = structure.product_count_source ?? 'N/A';
  const totalProducts: number = structure.total_products ?? 0;
  const top10Share = topBrands.slice(0, 10).reduce((s: number, b) => s + (b.revenue_share ?? 0), 0);
  const leader = topBrands[0] || null;

  const top10Brands = topBrands.slice(0, 10);
  const othersRevenue = topBrands.slice(10).reduce((s: number, b) => s + (b.parent_revenue ?? 0), 0);
  const othersShare = topBrands.slice(10).reduce((s: number, b) => s + (b.revenue_share ?? 0), 0);
  const barData = [
    ...top10Brands.map((b) => ({
      ...b,
      brand:    b.brand?.length > 20 ? b.brand.slice(0, 18) + '…' : b.brand,
      fullBrand: b.brand,
    })),
    ...(othersShare > 0 ? [{
      rank: 99, brand: 'Others', fullBrand: 'Others (aggregated)',
      parent_revenue: othersRevenue,
      revenue_share: parseFloat(othersShare.toFixed(2)),
      segment: 'Long Tail',
    }] : []),
  ];

  const columns: ColumnDef<BrandRanking>[] = [
    {
      header: 'Rank',
      cell: (row) => (
        <span className={cn('font-bold text-sm', row.rank === 1 ? 'text-primary' : row.rank <= 3 ? 'text-primary/80' : 'text-muted-foreground')}>
          {row.rank === 1 ? <Crown className="w-4 h-4 inline mr-1 -mt-1" /> : ''}{row.rank}
        </span>
      ),
    },
    { header: 'Brand', cell: (row) => <span className="font-bold text-foreground/90">{row.brand}</span> },
    { header: 'Parent Revenue', cell: (row) => row.parent_revenue != null ? <span className="font-medium text-foreground/80">{formatCurrency(row.parent_revenue)}</span> : '—' },
    {
      header: 'Revenue Share',
      cell: (row) => {
        const pct = row.revenue_share ?? 0;
        return (
          <div className="flex items-center gap-3 w-48">
            <span className="font-mono text-sm font-semibold w-12">{pct.toFixed(1)}%</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Products',
      cell: (row) => <span className="text-sm">{row.product_count.toLocaleString()}</span>,
    },
    { header: 'Avg Revenue/Product', cell: (row) => <span className="text-sm">{formatCurrency(row.avg_revenue_per_product || 0)}</span> },
    { header: 'Segment', cell: (row) => <Badge variant="outline" className={segmentBadgeClass(row.segment)}>{row.segment}</Badge> },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-structure">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30 mb-3 border-none">Ownership & Dominance</Badge>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Market Structure</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Revenue-based market structure from Parent Level Revenue by brand.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">Active Brands</p>
          <p className="text-3xl font-black text-foreground">{totalBrands.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Products: {totalProducts.toLocaleString()} ({productCountSource})</p>
        </div>
      </div>

      {/* Tier 1: Leadership Spotlight & Concentration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leadership Card */}
        <Card className="lg:col-span-2 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border-primary/30 relative overflow-hidden glass-card">
          <div className="absolute top-0 right-0 p-8 opacity-20"><Crown className="w-40 h-40 text-primary" /></div>
          <CardContent className="p-8 relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-primary" />
                <p className="text-sm font-bold uppercase tracking-widest text-primary">Market Leader Spotlight</p>
              </div>
              <h2 className="text-5xl font-black mb-2">{leader?.brand || 'N/A'}</h2>
              <p className="text-xl text-foreground/80 font-medium mb-6">
                Commands <strong className="text-primary">{top1Share.toFixed(1)}%</strong> of total Parent Revenue.
              </p>
              <div className="flex gap-6 mt-8 border-t border-primary/20 pt-6">
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium mb-1">Brand Revenue</p>
                  <p className="text-2xl font-bold text-foreground/90">{formatCurrency(leader?.parent_revenue || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium mb-1">Total Market Revenue</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* HHI Concentration Dial */}
        <Card className="bg-card glass-card border-border/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full">
            <Network className={cn('w-12 h-12 mb-4', hhiColor(hhi))} />
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Concentration Index</h3>
            <p className={cn('text-5xl font-black mb-2 font-mono', hhiColor(hhi))}>{hhi.toLocaleString()}</p>
            <Badge variant="outline" className={cn('mt-2 text-sm py-1 px-3', hhiColor(hhi))}>{concentrationType}</Badge>
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-[250px]">
              {hhi < 1500 ? 'Highly fragmented market, easy for new entrants.'
                : hhi <= 2500 ? 'Moderately concentrated. Some established players exist.'
                : hhi <= 4000 ? 'Concentrated market. High barrier to entry.'
                : 'Monopolistic structure. Extreme risk for new entrants.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tier 2: Revenue Control Breakdown */}
      <section className="pt-4">
        <h2 className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Competitive Hierarchy
        </h2>
        <Card className="p-8 bg-card/50 glass border-border/50">
          <ControlBar top1={top1Share} top3={top3Share} top5={top5Share} top10={top10Share} />
        </Card>
      </section>

      {/* Tier 3: Distribution Chart */}
      <section className="pt-4">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Revenue Distribution by Brand</CardTitle>
            <CardDescription>Revenue share mapping of top brands and long tail using Parent Level Revenue.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="brand" width={140} tick={{ fill: 'hsl(var(--foreground))', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <Tooltip content={<BarTip />} cursor={{ fill: 'hsl(var(--muted)/0.3)' }} />
                <Bar dataKey="revenue_share" radius={[0, 6, 6, 0]} maxBarSize={32}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.rank === 1 ? 'hsl(var(--primary))' : entry.rank <= 3 ? 'hsl(var(--primary)/0.8)' : entry.rank <= 5 ? 'hsl(var(--primary)/0.6)' : entry.rank <= 10 ? 'hsl(var(--primary)/0.4)' : 'hsl(var(--muted))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      {/* Tier 4: Competitive Landscape by Revenue */}
      <section className="pt-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitive Landscape by Revenue</CardTitle>
            <CardDescription>Segmented using brand revenue share distribution, not momentum score.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {landscape.map((seg) => (
              <div key={seg.segment} className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={segmentBadgeClass(seg.segment)}>{seg.segment}</Badge>
                  <span className="text-xs text-muted-foreground">{seg.brand_count} brands</span>
                </div>
                <p className="text-sm font-semibold">{formatCurrency(seg.combined_revenue)}</p>
                <p className="text-xs text-muted-foreground">{seg.combined_share.toFixed(1)}% combined share</p>
                <p className="text-xs text-foreground/80">Top: {seg.top_brands.slice(0, 3).join(', ') || 'N/A'}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="pt-4">
          <DataTable 
            title="Brand Revenue Ranking"
            description="Sorted by Parent Level Revenue with share and per-product efficiency."
            columns={columns} 
            data={topBrands} 
            keyExtractor={(r) => r.brand}
          />
        </div>
      </section>

    </motion.div>
  );
}
