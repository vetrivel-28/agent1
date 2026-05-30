import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, TrendingUp, TrendingDown, Activity, 
  Rocket, ShieldAlert, Zap, BarChart2, Target, AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function RevenueMomentum() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['revenue-momentum'],
    queryFn: () => api.getRevenueMomentum(50),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3 theme-revenue">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Calculating Momentum Matrix...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10 theme-revenue">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2 font-mono">GROWTH VELOCITY UNAVAILABLE</h2>
          <p className="text-danger/80 max-w-lg">
            {getEngineErrorMessage(data, 'Requires BlackBox with revenue, sales, review, and rank data.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results || {};

  const memoized = useMemo(() => {
    const normalizeBrand = (raw: string) => {
      if (!raw) return '';
      let s = String(raw).trim().replace(/\s+/g, ' ');
      s = s.split(' ').filter((v, i, arr) => !(i > 0 && v.toLowerCase() === arr[i - 1].toLowerCase())).join(' ');
      return s.toLowerCase().split(' ').map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
    };

    const rawBrands = results.all_brands_momentum || [];
    const brandMap = new Map<string, any>();
    rawBrands.forEach((b: any) => {
      const name = normalizeBrand(b.brand || '');
      if (!name) return;
      const existing = brandMap.get(name);
      if (!existing) {
        brandMap.set(name, { ...b, brand: name });
        return;
      }
      const choose = (a: any, c: any) => ( (c ?? 0) > (a ?? 0) ? c : a );
      const merged = { ...existing };
      merged.momentum_score = Math.max(existing.momentum_score ?? 0, b.momentum_score ?? 0);
      merged.sales_velocity_score = choose(existing.sales_velocity_score, b.sales_velocity_score);
      merged.review_velocity_score = choose(existing.review_velocity_score, b.review_velocity_score);
      merged.bsr_momentum_score = choose(existing.bsr_momentum_score, b.bsr_momentum_score);
      merged.revenue_strength_score = choose(existing.revenue_strength_score, b.revenue_strength_score);
      merged.total_revenue = Math.max(existing.total_revenue ?? 0, b.total_revenue ?? 0);
      merged.momentum_category = merged.momentum_category || b.momentum_category || existing.momentum_category;
      brandMap.set(name, merged);
    });

    const uniqueBrands = Array.from(brandMap.values());

    uniqueBrands.forEach((b: any) => {
      const sales = Number(b.sales_velocity_score ?? 0);
      const review = Number(b.review_velocity_score ?? 0);
      const bsr = Number(b.bsr_momentum_score ?? 0);
      const rev = Number(b.revenue_strength_score ?? 0);
      const drivers = [
        { key: 'Sales Velocity', val: sales },
        { key: 'Review Velocity', val: review },
        { key: 'BSR Momentum', val: bsr },
        { key: 'Revenue Strength', val: rev },
      ];
      drivers.sort((x, y) => y.val - x.val);
      b.primary_driver = drivers[0].key;
      b.weakest_driver = drivers[drivers.length - 1].key;
      
      const momentum = Number(b.momentum_score ?? 0);
      if (rev >= 60 && momentum >= 60) b.market_position = 'Market Leader';
      else if (rev < 60 && momentum >= 60) b.market_position = 'Emerging Challenger';
      else if (rev >= 60 && momentum < 60) b.market_position = 'Mature Incumbent';
      else b.market_position = 'Weak Player';
    });

    const marketLeaders = uniqueBrands.filter((b: any) => b.market_position === 'Market Leader');
    const emerging = uniqueBrands.filter((b: any) => b.market_position === 'Emerging Challenger');
    const incumbents = uniqueBrands.filter((b: any) => b.market_position === 'Mature Incumbent');
    const weak = uniqueBrands.filter((b: any) => b.market_position === 'Weak Player');

    const computedOpportunities = uniqueBrands
      .filter((b: any) => (b.momentum_score ?? 0) > 75 && (b.revenue_strength_score ?? 0) < 40)
      .sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))
      .slice(0, 5);

    const comps = ['sales_velocity_score', 'review_velocity_score', 'bsr_momentum_score', 'revenue_strength_score'];
    const compAverages: Record<string, number> = {};
    comps.forEach((k) => {
      compAverages[k] = uniqueBrands.length ? uniqueBrands.reduce((s: any, b: any) => s + (Number(b[k] ?? 0)), 0) / uniqueBrands.length : 0;
    });
    const compLabel = (k: string) => {
      if (k === 'sales_velocity_score') return 'Sales Velocity';
      if (k === 'review_velocity_score') return 'Review Velocity';
      if (k === 'bsr_momentum_score') return 'BSR Momentum';
      return 'Revenue Strength';
    };
    const marketDriverKey = Object.keys(compAverages).sort((a, b) => compAverages[b] - compAverages[a])[0];
    const marketMomentumDriver = compLabel(marketDriverKey || 'sales_velocity_score');

    const averageMarketMomentum = results.market_mean_score ?? (uniqueBrands.length ? uniqueBrands.reduce((s: any, b: any) => s + (b.momentum_score ?? 0), 0) / uniqueBrands.length : 0);
    const highestMomentumBrand = uniqueBrands.sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))[0] || {};

    const topTenBrands = uniqueBrands
      .slice()
      .sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))
      .map((brand: any, index: number) => ({
        rank: index + 1,
        brand: brand.brand,
        momentum_score: Number(brand.momentum_score ?? 0),
        momentum_category: brand.momentum_category || '—',
        primary_driver: brand.primary_driver || 'Revenue Strength',
        market_position: brand.market_position || 'Weak Player',
        revenue_strength_score: Number(brand.revenue_strength_score ?? 0),
      }));

    return {
      uniqueBrands, marketLeaders, emerging, incumbents, weak,
      computedOpportunities, compAverages, marketMomentumDriver,
      averageMarketMomentum, highestMomentumBrand, topTenBrands
    };
  }, [results]);

  const {
    marketLeaders, emerging, incumbents, weak,
    computedOpportunities, marketMomentumDriver,
    averageMarketMomentum, highestMomentumBrand, topTenBrands
  } = memoized;

  const getMomentumColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-success/80';
    if (score >= 40) return 'text-warning';
    return 'text-danger';
  };

  const ScoreBar = ({ score }: { score: number }) => (
    <div className="flex items-center gap-2 w-32">
      <span className={cn("font-mono text-xs font-bold w-8 text-right", getMomentumColor(score))}>
        {score.toFixed(0)}
      </span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", 
          score >= 60 ? 'bg-success' : score >= 40 ? 'bg-warning' : 'bg-danger'
        )} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
    </div>
  );

  const topBrandColumns: ColumnDef<any>[] = [
    { header: '#', cell: (r) => <span className="font-mono text-muted-foreground">{r.rank}</span> },
    { header: 'Ticker / Brand', cell: (r) => <span className="font-bold text-foreground uppercase tracking-wide">{r.brand}</span> },
    { header: 'Momentum', cell: (r) => <ScoreBar score={r.momentum_score} /> },
    { header: 'Rev Strength', cell: (r) => <ScoreBar score={r.revenue_strength_score} /> },
    {
      header: 'Primary Engine',
      cell: (r) => {
        const drv = r.primary_driver;
        const icon = drv === 'Sales Velocity' ? <Activity className="w-3 h-3 text-primary" /> 
                   : drv === 'Review Velocity' ? <Target className="w-3 h-3 text-warning" />
                   : drv === 'BSR Momentum' ? <TrendingUp className="w-3 h-3 text-success" />
                   : <BarChart2 className="w-3 h-3 text-blue-500" />;
        return (
          <div className="flex items-center gap-1.5 border border-border/50 bg-muted/20 px-2 py-0.5 rounded text-xs font-medium w-max">
            {icon} {drv}
          </div>
        );
      },
    },
    {
      header: 'Classification',
      cell: (r) => {
        const pos = r.market_position;
        const variant = pos === 'Market Leader' ? 'default' : pos === 'Emerging Challenger' ? 'secondary' : pos === 'Mature Incumbent' ? 'outline' : 'destructive';
        return <Badge variant={variant} className="uppercase text-[10px] tracking-wider font-mono">{pos}</Badge>;
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-revenue">
      
      {/* Header — Terminal Style */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 mb-3 border border-primary/20 font-mono tracking-widest uppercase">
            ● Live Momentum Feed
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Revenue Momentum</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Track growth velocity, emerging threats, and shifting market dominance.
          </p>
        </div>
        <div className="text-right flex items-end gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 font-mono">Market Avg Index</p>
            <p className={cn("text-3xl font-black font-mono flex items-center justify-end gap-2", averageMarketMomentum >= 50 ? 'text-success' : 'text-danger')}>
              {averageMarketMomentum >= 50 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              {averageMarketMomentum.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      {/* Tier 1: Terminal Matrix (4 Major Blocks) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TerminalBlock 
          title="Growth Leader" 
          value={highestMomentumBrand.brand || 'N/A'} 
          metric={highestMomentumBrand.momentum_score?.toFixed(1) || '0.0'}
          sub="Highest velocity score"
          icon={<Rocket className="w-5 h-5 text-success" />}
          trend="up"
        />
        <TerminalBlock 
          title="Market Engine" 
          value={marketMomentumDriver} 
          metric=""
          sub="Primary driver across category"
          icon={<Zap className="w-5 h-5 text-warning" />}
          trend="neutral"
        />
        <TerminalBlock 
          title="Challengers" 
          value={emerging.length.toString()} 
          metric="Brands"
          sub="High momentum, low revenue"
          icon={<Target className="w-5 h-5 text-primary" />}
          trend="up"
        />
        <TerminalBlock 
          title="At Risk" 
          value={incumbents.length.toString()} 
          metric="Incumbents"
          sub="High revenue, weak momentum"
          icon={<ShieldAlert className="w-5 h-5 text-danger" />}
          trend="down"
        />
      </div>

      {/* Tier 2: Momentum Matrix Quadrants */}
      <section className="pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-tight">Market Momentum Matrix</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QuadrantCard 
            title="Market Leaders" 
            count={marketLeaders.length}
            desc="High Revenue • High Momentum"
            brands={marketLeaders.slice(0, 3)}
            colorClass="bg-success/5 border-success/20 text-success"
          />
          <QuadrantCard 
            title="Emerging Challengers" 
            count={emerging.length}
            desc="Low Revenue • High Momentum"
            brands={emerging.slice(0, 3)}
            colorClass="bg-primary/5 border-primary/20 text-primary"
            highlight
          />
          <QuadrantCard 
            title="Mature Incumbents" 
            count={incumbents.length}
            desc="High Revenue • Low Momentum"
            brands={incumbents.slice(0, 3)}
            colorClass="bg-warning/5 border-warning/20 text-warning"
          />
          <QuadrantCard 
            title="Weak Players" 
            count={weak.length}
            desc="Low Revenue • Low Momentum"
            brands={weak.slice(0, 3)}
            colorClass="bg-muted/30 border-border text-muted-foreground"
          />
        </div>
      </section>

      {/* Tier 3: Breakout Alerts */}
      {computedOpportunities.length > 0 && (
        <Card className="border-primary/30 bg-primary/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10"><Zap className="w-24 h-24 text-primary" /></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary font-mono">Breakout Alerts</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {computedOpportunities.map((b: any, i: number) => (
                <div key={i} className="bg-background/80 backdrop-blur border border-border/50 rounded-lg p-4">
                  <p className="font-bold text-foreground uppercase truncate mb-1" title={b.brand}>{b.brand}</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-mono">Momentum</p>
                      <p className="font-mono font-bold text-success">{b.momentum_score?.toFixed(1)}</p>
                    </div>
                    <TrendingUp className="w-4 h-4 text-success opacity-50" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier 4: Terminal Data Table */}
      <section className="pt-4">
        <Card className="border-border/50 bg-card/50 glass">
          <CardHeader>
            <CardTitle className="font-mono uppercase tracking-widest text-sm text-muted-foreground">Momentum Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={topBrandColumns} data={topTenBrands} pageSize={15} />
          </CardContent>
        </Card>
      </section>

    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function TerminalBlock({ title, value, metric, sub, icon, trend }: { title: string, value: string, metric: string, sub: string, icon: React.ReactNode, trend: 'up' | 'down' | 'neutral' }) {
  const trendColor = trend === 'up' ? 'border-t-success' : trend === 'down' ? 'border-t-danger' : 'border-t-primary';
  
  return (
    <Card className={cn("border-t-4 bg-card/40 glass-card rounded-xl", trendColor)}>
      <CardContent className="p-5 flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">{title}</p>
          <div className="p-1.5 bg-background rounded-md border border-border/50">{icon}</div>
        </div>
        <div className="mt-auto">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-2xl font-black uppercase tracking-tight truncate" title={value}>{value}</h3>
            {metric && <span className="text-sm font-mono text-muted-foreground font-semibold">{metric}</span>}
          </div>
          <p className="text-xs text-muted-foreground leading-tight">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QuadrantCard({ title, count, desc, brands, colorClass, highlight = false }: { title: string, count: number, desc: string, brands: any[], colorClass: string, highlight?: boolean }) {
  return (
    <div className={cn("border rounded-xl p-5 flex flex-col h-full transition-all", colorClass, highlight ? 'ring-1 ring-primary/30 shadow-lg shadow-primary/5 scale-[1.02]' : '')}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-lg">{title}</h3>
          <p className="text-xs opacity-80 uppercase tracking-wider font-mono mt-0.5">{desc}</p>
        </div>
        <div className="text-3xl font-black font-mono">{count}</div>
      </div>
      <div className="mt-auto pt-4 border-t border-current/10">
        <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2 font-mono">Top Brands</p>
        <div className="flex flex-wrap gap-2">
          {brands.length > 0 ? brands.map((b, i) => (
            <span key={i} className="text-xs font-semibold bg-background/50 backdrop-blur px-2 py-1 rounded-md border border-current/20 truncate max-w-[120px]">
              {b.brand}
            </span>
          )) : (
            <span className="text-xs opacity-50 italic">None</span>
          )}
        </div>
      </div>
    </div>
  );
}
