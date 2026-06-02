import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { getEngineErrorMessage } from '../utils/analysisStatus';
import { Drawer } from '../components/ui/Drawer';
import {
  AlertCircle, Loader2, DollarSign, Target, BarChart3, TrendingUp,
  Layers, Crown, Zap, AlertTriangle, Scale, Activity, Maximize, Target as TargetIcon, Info, Star, Package, Tag, Hash, Trophy
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ScatterChart, Scatter, Cell, ReferenceLine, ZAxis
} from 'recharts';
import { motion } from 'framer-motion';

// Types
type TopProduct = {
  title: string;
  asin: string;
  brand: string;
  revenue: number;
};

type PriceBand = {
  price_band: string;
  price_range: string;
  product_count: number;
  revenue: number;
  revenue_share_pct: number;
  review_share_pct: number;
  market_share_pct: number;
  avg_reviews: number;
  avg_rating: number;
  revenue_per_listing: number;
  opportunity_score: number;
  quadrant: string;
  is_valid_sample: boolean;
  is_white_space: boolean;
  top_product: TopProduct;
  top_brand: string;
};

type MarketStructure = {
  floor: number;
  ceiling: number;
  spread_str: string;
  spread_val: number;
  median: number;
  average: number;
  p25: number;
  p75: number;
};

type PremiumViability = {
  revenue_share_pct: number;
  product_share_pct: number;
  revenue_efficiency: number;
};

type RecommendedEntry = {
  price_band: string | null;
  price_range?: string;
  confidence_score: string;
  reasoning: string;
};

type PositioningData = {
  title: string;
  asin: string;
  brand: string;
  bsr: number;
  price: number;
  revenue: number;
  reviews: number;
  rating: number;
  price_band: string;
  market_share_pct: number;
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

interface KpiProps {
  title: string;
  value: string | React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
}

function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip }: KpiProps) {
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
          <div className={cn('p-1.5 rounded-md border flex-shrink-0', bg)}>
            <span className={color}>{icon}</span>
          </div>
        </div>
        <div className={cn('text-2xl font-black leading-tight tracking-tight font-mono', color)}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function UnavailableCard({ message, missing }: { message: string; missing?: string[] }) {
  return (
    <Card className="border-red-500/20 bg-red-500/5 mt-10">
      <CardContent className="p-8 flex flex-col items-center text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2 font-serif">Pricing Economics Unavailable</h2>
        <p className="text-red-500/80 max-w-lg">{message}</p>
        {missing && missing.length > 0 && (
          <p className="text-red-500/60 text-sm mt-4 font-mono uppercase text-[10px] tracking-widest">Required Attributes: {missing.join(', ')}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PriceElasticity() {
  const [selectedProduct, setSelectedProduct] = useState<PositioningData | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['price-intelligence'],
    queryFn: () => api.getPriceElasticity(6),
  });

  const memoized = useMemo(() => {
    if (!data?.data?.results) return null;
    const res = data.data.results;
    
    const struct: MarketStructure = res.market_structure || {};
    const bands: PriceBand[] = res.price_bands || [];
    const topOpportunities: PriceBand[] = res.top_opportunity_bands || [];
    const powerBands: PriceBand[] = res.highest_revenue_per_listing_bands || [];
    const entry: RecommendedEntry = res.recommended_entry || {};
    const premium: PremiumViability = res.premium_viability || { revenue_share_pct: 0, product_share_pct: 0, revenue_efficiency: 0 };
    const sweetSpot: PriceBand | null = res.market_sweet_spot || null;
    const whiteSpace: PriceBand[] = res.white_space_opportunities || [];
    const positioningData: PositioningData[] = res.positioning_map_data || [];
    
    // Sort bands for bar charts based on price value
    const sortedBands = [...bands].sort((a, b) => {
        const aNum = parseFloat(a.price_band.replace(/[^0-9.-]/g, '').split('-')[0]) || 0;
        const bNum = parseFloat(b.price_band.replace(/[^0-9.-]/g, '').split('-')[0]) || 0;
        return aNum - bNum;
    });

    const highestRevenueBand = [...bands].sort((a, b) => b.revenue - a.revenue)[0];

    return {
      struct, bands, sortedBands, topOpportunities, powerBands,
      entry, premium, sweetSpot, whiteSpace, positioningData, highestRevenueBand
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Synthesizing Price Intelligence...</p>
      </div>
    );
  }

  if (isError || !memoized) {
    return <UnavailableCard message={getEngineErrorMessage(data, 'Could not calculate price economics.')} />;
  }

  const {
    struct, bands, sortedBands, topOpportunities, powerBands,
    entry, premium, sweetSpot, whiteSpace, positioningData, highestRevenueBand
  } = memoized;

  if (bands.length === 0) {
    return <UnavailableCard message="No price bands could be calculated from the uploaded catalog." />;
  }

  // --- TABLES ---
  const bandAnalysisColumns: Column<PriceBand>[] = [
    { 
      header: 'Price Range', 
      accessorKey: 'price_band', 
      cell: (r) => <span className="font-mono font-bold block whitespace-nowrap">{r.price_band}</span>
    },
    { 
      header: 'Sample Size', 
      accessorKey: 'product_count', 
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-sm">{formatNumber(r.product_count)}</span>
          {!r.is_valid_sample && <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-red-500 border-red-500/20 w-fit">Insufficient</Badge>}
        </div>
      )
    },
    { header: 'Revenue', accessorKey: 'revenue', cell: (r) => <span className="font-mono font-medium text-emerald-600">{formatCurrency(r.revenue)}</span> },
    { 
      header: 'Revenue Share', 
      accessorKey: 'revenue_share_pct',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm w-12 font-bold">{r.revenue_share_pct.toFixed(1)}%</span>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${r.revenue_share_pct}%` }} />
          </div>
        </div>
      )
    },
    { 
      header: 'Top Product', 
      accessorKey: 'top_product', 
      cell: (r) => (
        <div className="max-w-[200px]">
          <span className="font-bold text-xs block truncate text-foreground" title={r.top_product.title}>{r.top_product.title}</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] font-mono text-muted-foreground">{r.top_product.asin}</span>
            <span className="text-[10px] font-mono text-emerald-600">{formatCurrency(r.top_product.revenue)}</span>
          </div>
        </div>
      )
    },
    { header: 'Avg Rating', accessorKey: 'avg_rating', cell: (r) => <span className="font-mono">{r.avg_rating > 0 ? r.avg_rating.toFixed(2) : 'N/A'}</span> },
  ];

  const topOpportunitiesColumns: Column<PriceBand>[] = [
    { 
      header: 'Price Range', 
      accessorKey: 'price_band', 
      cell: (r) => <span className="font-mono font-bold block">{r.price_band}</span>
    },
    { header: 'Revenue Share', accessorKey: 'revenue_share_pct', cell: (r) => <span className="font-mono text-emerald-600 font-bold">{r.revenue_share_pct.toFixed(1)}%</span> },
    { 
      header: 'Top Product', 
      accessorKey: 'top_product', 
      cell: (r) => (
        <div className="max-w-[150px]">
          <span className="font-bold text-xs block truncate text-foreground">{r.top_product.title}</span>
        </div>
      )
    },
    { header: 'Median Rev / Listing', accessorKey: 'revenue_per_listing', cell: (r) => <span className="font-mono">{formatCurrency(r.revenue_per_listing)}</span> },
    { 
      header: 'Opportunity Score', 
      accessorKey: 'opportunity_score',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm w-12 font-black text-primary">{r.opportunity_score.toFixed(0)}</span>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${r.opportunity_score}%` }} />
          </div>
        </div>
      )
    },
  ];

  return (
    <>
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 mb-3 border border-primary/20 font-mono tracking-widest uppercase rounded-none">
            PRICE INTELLIGENCE
          </Badge>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-serif">Price Economics & Strategy</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Structural analysis of revenue concentration, competition density, and strategic pricing power based on dynamic price ranges.
          </p>
        </div>
      </div>

      {/* SECTION 1: MARKET PRICE STRUCTURE */}
      <div>
        <h2 className="text-lg font-bold font-serif mb-4 flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" /> Market Price Structure
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard title="Median Price" value={formatCurrency(struct.median)} icon={<DollarSign className="w-4 h-4" />} />
          <KpiCard title="Average Price" value={formatCurrency(struct.average)} icon={<Activity className="w-4 h-4" />} color="text-emerald-500" bg="bg-emerald-500/10 border-emerald-500/20" />
          <KpiCard title="25th Percentile" value={formatCurrency(struct.p25)} icon={<TrendingUp className="w-4 h-4" />} color="text-amber-500" bg="bg-amber-500/10 border-amber-500/20" />
          <KpiCard title="75th Percentile" value={formatCurrency(struct.p75)} icon={<TrendingUp className="w-4 h-4" />} color="text-amber-500" bg="bg-amber-500/10 border-amber-500/20" />
          <KpiCard title="Price Floor" value={formatCurrency(struct.floor)} icon={<Maximize className="w-4 h-4" />} color="text-muted-foreground" bg="bg-muted border-border" />
          <KpiCard title="Price Ceiling" value={formatCurrency(struct.ceiling)} icon={<Maximize className="w-4 h-4" />} color="text-muted-foreground" bg="bg-muted border-border" />
          <KpiCard title="Price Spread" value={formatCurrency(struct.spread_val)} sub={struct.spread_str} icon={<Layers className="w-4 h-4" />} color="text-blue-500" bg="bg-blue-500/10 border-blue-500/20" />
        </div>
      </div>

      {/* SECTION: PRODUCT POSITIONING MAP */}
      <Card className="border-border/50 overflow-hidden shadow-sm">
        <CardHeader className="bg-muted/10 border-b border-border/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-serif">Product Positioning Map</CardTitle>
            <CardDescription>Primary pricing chart: Top 200 items plotted by Price vs. Revenue. Bubble size indicates total reviews. Click a bubble for details.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="h-[500px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  type="number" 
                  dataKey="price" 
                  name="Price" 
                  tickFormatter={v => formatCurrency(v)} 
                  label={{ value: 'Price ($)', position: 'insideBottom', offset: -25, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="revenue" 
                  name="Revenue" 
                  tickFormatter={v => `$${formatNumber(v)}`} 
                  label={{ value: 'Revenue', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <ZAxis type="number" dataKey="reviews" range={[20, 400]} name="Reviews" />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as PositioningData;
                    return (
                      <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl text-sm font-mono space-y-1 z-50 min-w-[250px]">
                        <p className="font-bold border-b border-border/50 pb-2 mb-2 truncate text-foreground">{d.title}</p>
                        <p className="text-muted-foreground flex justify-between gap-4">ASIN: <span className="text-foreground">{d.asin}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Brand: <span className="text-foreground truncate max-w-[100px] text-right">{d.brand}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Price: <span className="text-foreground font-bold">{formatCurrency(d.price)}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Revenue: <span className="text-emerald-500 font-bold">{formatCurrency(d.revenue)}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Reviews: <span className="text-blue-500 font-bold">{formatNumber(d.reviews)}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">BSR: <span className="text-foreground font-bold">{formatNumber(d.bsr)}</span></p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={struct.median} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeOpacity={0.5} label={{ position: 'top', value: 'Median Price', fill: 'hsl(var(--primary))', fontSize: 10 }} />
                
                <Scatter 
                  data={positioningData} 
                  onClick={(e: any) => {
                    if (e && e.payload) setSelectedProduct(e.payload as PositioningData);
                  }}
                  className="cursor-pointer"
                >
                  {positioningData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={'hsl(var(--primary))'} fillOpacity={0.6} stroke="hsl(var(--background))" strokeWidth={1} className="hover:fill-primary hover:opacity-100 transition-all duration-200" />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* STRATEGIC INSIGHTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Market Sweet Spot (Expanded) */}
        <Card className="border-border/50 shadow-sm bg-primary/5 border-primary/20">
          <CardHeader className="border-b border-primary/10 pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <TargetIcon className="w-4 h-4 text-primary" /> Market Sweet Spot
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col justify-between h-full space-y-4">
            {sweetSpot ? (
                <>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Price Range</p>
                        <p className="text-2xl font-black font-mono text-primary leading-tight">{sweetSpot.price_band}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Products</p>
                        <p className="text-2xl font-black font-mono text-foreground leading-tight">{formatNumber(sweetSpot.product_count)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Revenue Share</p>
                        <p className="text-2xl font-black font-mono text-emerald-600 leading-tight">{sweetSpot.revenue_share_pct.toFixed(1)}%</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Top Brand</p>
                        <p className="text-xl font-bold font-sans text-foreground leading-tight truncate">{sweetSpot.top_brand}</p>
                    </div>
                </div>

                <div className="bg-card border border-border p-3 rounded-lg shadow-sm">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" /> Top Product</p>
                    <p className="font-bold text-sm text-foreground line-clamp-2 leading-snug">{sweetSpot.top_product.title}</p>
                    <div className="flex justify-between items-center mt-2">
                        <Badge variant="outline" className="text-[9px] font-mono">{sweetSpot.top_product.asin}</Badge>
                        <span className="font-mono text-emerald-600 font-bold text-sm">{formatCurrency(sweetSpot.top_product.revenue)}</span>
                    </div>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                  Highest revenue concentration with statistically meaningful sample size.
                </p>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center text-center py-6 opacity-70">
                    <AlertCircle className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-bold">No Sweet Spot Identified</p>
                </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
            {/* Section 7: Premium Viability Analysis */}
            <Card className="border-border/50 shadow-sm flex-1">
            <CardHeader className="bg-muted/10 border-b border-border/50 pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Crown className="w-4 h-4 text-purple-500" /> Premium Viability
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Premium Revenue Share</p>
                        <p className="text-4xl font-black font-mono text-purple-600 leading-none">{premium.revenue_share_pct.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] uppercase text-muted-foreground mb-1 font-bold">Product Share</p>
                        <p className="text-lg font-black font-mono text-foreground leading-none">{premium.product_share_pct.toFixed(1)}%</p>
                    </div>
                </div>
                <div className="bg-muted/30 p-2 rounded flex justify-between items-center border border-border/50">
                    <span className="text-xs text-muted-foreground">Revenue Efficiency:</span>
                    <span className={cn("font-mono font-bold text-sm", premium.revenue_efficiency > 1 ? 'text-emerald-500' : 'text-amber-500')}>{premium.revenue_efficiency.toFixed(2)}x</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed text-center">
                Evaluating products priced &gt; {formatCurrency(struct.median)}.
                </p>
            </CardContent>
            </Card>

            {/* Section 8: Entry Price Recommendation */}
            <Card className="border-border/50 shadow-sm flex-1">
            <CardHeader className="border-b border-border/50 pb-3 bg-muted/10">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <TargetIcon className="w-4 h-4 text-muted-foreground" /> Entry Price Recommendation
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                {entry.price_band ? (
                <>
                    <div className="flex justify-between items-start mb-2">
                    <div>
                        <p className="text-3xl font-black font-mono text-foreground">{entry.price_band}</p>
                    </div>
                    <Badge variant="outline" className="uppercase text-[10px] tracking-widest bg-background border-border text-muted-foreground">
                        {entry.confidence_score} Conf
                    </Badge>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                    {entry.reasoning}
                    </p>
                </>
                ) : (
                <div className="flex flex-col items-center justify-center text-center py-2 opacity-70">
                    <AlertCircle className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-bold">{entry.confidence_score}</p>
                    <p className="text-xs text-muted-foreground mt-1">{entry.reasoning}</p>
                </div>
                )}
            </CardContent>
            </Card>
        </div>
      </div>

      {/* SECTIONS 3 & 4: CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Section 3: Revenue by Price Range */}
        <Card className="border-border/50">
          <CardHeader className="bg-muted/10 border-b border-border/50">
            <CardTitle className="font-serif text-lg">Revenue by Price Range</CardTitle>
            <CardDescription>Where revenue is concentrated</CardDescription>
          </CardHeader>
          <CardContent className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={sortedBands} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={v => `$${formatNumber(v)}`} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis dataKey="price_band" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={80} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Revenue']}
                />
                <Bar dataKey="revenue" fill="hsl(var(--emerald-500))" radius={[0, 4, 4, 0]}>
                  {sortedBands.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.price_band === highestRevenueBand?.price_band ? 'hsl(var(--primary))' : 'hsl(var(--emerald-500))'} opacity={entry.price_band === highestRevenueBand?.price_band ? 1 : 0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Revenue Leader: <span className="text-primary">{highestRevenueBand?.price_band}</span> captures {highestRevenueBand?.revenue_share_pct.toFixed(1)}% of category revenue.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Competition Density */}
        <Card className="border-border/50">
          <CardHeader className="bg-muted/10 border-b border-border/50 flex flex-row justify-between items-center">
            <div>
                <CardTitle className="font-serif text-lg">Competition Density</CardTitle>
                <CardDescription>Number of products in each price range</CardDescription>
            </div>
            {whiteSpace.length > 0 && (
                <Badge variant="outline" className="border-blue-500/30 text-blue-500 bg-blue-500/5 uppercase text-[10px] tracking-widest">
                    {whiteSpace.length} White Space Zone(s)
                </Badge>
            )}
          </CardHeader>
          <CardContent className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedBands} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="price_band" stroke="hsl(var(--muted-foreground))" fontSize={10} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  formatter={(value: any) => [formatNumber(Number(value)), 'Products']}
                />
                <Bar dataKey="product_count" fill="hsl(var(--blue-500))" radius={[4, 4, 0, 0]} opacity={0.8}>
                  {sortedBands.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.is_white_space ? 'hsl(var(--primary))' : 'hsl(var(--blue-500))'} opacity={entry.is_white_space ? 1 : 0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>

      {/* SECTION 9: TOP PRICING OPPORTUNITIES */}
      <Card className="border-border/50 overflow-hidden shadow-sm">
        <CardHeader className="bg-primary/5 border-b border-border/50">
          <CardTitle className="font-serif">Top Pricing Opportunities</CardTitle>
          <CardDescription>Ranked by composite opportunity score (Revenue Density, Median Revenue Per Listing, Competition Gap)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable columns={topOpportunitiesColumns} data={topOpportunities} pageSize={5} />
        </CardContent>
      </Card>

      {/* SECTION 2: PRICE RANGE ANALYSIS */}
      <Card className="border-border/50 overflow-hidden shadow-sm">
        <CardHeader className="bg-muted/10 border-b border-border/50">
          <CardTitle className="font-serif">Price Range Analysis</CardTitle>
          <CardDescription>Comprehensive metrics across all dynamic price ranges</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable columns={bandAnalysisColumns} data={bands} pageSize={15} />
        </CardContent>
      </Card>

    </motion.div>

    {/* PRODUCT DETAIL DRAWER */}
    <Drawer 
      isOpen={!!selectedProduct} 
      onClose={() => setSelectedProduct(null)} 
      title="Product Positioning Details"
    >
      {selectedProduct && (
        <div className="space-y-6">
          
          <div className="bg-muted/30 p-4 rounded-xl border border-border">
            <h3 className="text-xl font-bold leading-tight text-foreground mb-2">{selectedProduct.title}</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline" className="font-mono bg-background border-border"><Tag className="w-3 h-3 mr-1" /> {selectedProduct.brand}</Badge>
              <Badge variant="outline" className="font-mono bg-background border-border"><Package className="w-3 h-3 mr-1" /> {selectedProduct.asin}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-500" /> Price
              </span>
              <span className="text-3xl font-black font-mono text-emerald-600">{formatCurrency(selectedProduct.price)}</span>
              <span className="text-xs text-muted-foreground mt-2">Band: {selectedProduct.price_band}</span>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1">
                <Activity className="w-3 h-3 text-primary" /> Revenue
              </span>
              <span className="text-3xl font-black font-mono text-primary">{formatCurrency(selectedProduct.revenue)}</span>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-500" /> Reviews & Rating
              </span>
              <span className="text-2xl font-black font-mono text-foreground">{formatNumber(selectedProduct.reviews)}</span>
              <span className="text-xs text-muted-foreground mt-1">Rating: {selectedProduct.rating > 0 ? selectedProduct.rating.toFixed(1) : 'N/A'}</span>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3 text-blue-500" /> BSR & Market Share
              </span>
              <span className="text-2xl font-black font-mono text-foreground">{formatNumber(selectedProduct.bsr)}</span>
              <span className="text-xs text-muted-foreground mt-1">Market Share: {selectedProduct.market_share_pct.toFixed(2)}%</span>
            </div>
          </div>
          
        </div>
      )}
    </Drawer>
    </>
  );
}
