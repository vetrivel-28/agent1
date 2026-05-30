import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { KPICard } from '../components/ui/KPICard';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { formatCurrency, formatNumber } from '../utils/cn';
import { Link } from 'react-router-dom';
import { 
  Activity, Zap, TrendingUp, DollarSign, Database, AlertTriangle, ArrowRight, Landmark,
  Target, Users, ShieldAlert, LinkIcon, PackagePlus, BarChart4, TrendingDown,
  MousePointerClick, LineChart, Package, CheckCircle2, Info
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function DashboardOverview() {
  const { data: reportResp, isLoading, isError, error } = useQuery({
    queryKey: ['market-report'],
    queryFn: () => api.getMarketReport(5),
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  const { data: statusResp } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  const hasBlackbox = statusResp?.datasets?.blackbox;

  if (!hasBlackbox && !isLoading && statusResp) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Database className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight">No Data Available</h2>
        <p className="text-muted-foreground">
          You need to upload datasets before the market intelligence engines can generate insights.
        </p>
        <Link to="/upload">
          <Button size="lg" className="group">
            Upload Datasets 
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-muted animate-pulse rounded-2xl" />
          <div className="h-96 bg-muted animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-danger/50 bg-danger/5 max-w-2xl mx-auto mt-20">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Engines Failed</h2>
          <p className="text-danger/80 mb-6">
            {(error as any)?.response?.data?.detail?.[0]?.msg || (error as any)?.message || "Failed to generate market report."}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>Retry Analysis</Button>
        </CardContent>
      </Card>
    );
  }

  const results = reportResp?.results || {};
  const engineOutputs = results.engine_outputs || {};
  
  const demandOut = engineOutputs.demand?.results || {};
  const priceOut = engineOutputs.price_elasticity?.results || {};
  const whitespaceOut = engineOutputs.whitespace?.results || {};
  const hhiOut = engineOutputs.hhi?.results || {};
  const revOut = engineOutputs.revenue_momentum?.results || {};
  const bsrOut = engineOutputs.bsr_efficiency?.results || {};
  const financeOut = engineOutputs.finance?.results || {};
  
  const marketOverview = results.market_overview || {};

  // Extract total search volume safely
  const totalSearchVolume = demandOut.demand_distribution 
    ? demandOut.demand_distribution.reduce((acc: number, cur: any) => acc + (Number(cur.total_search_volume) || 0), 0)
    : 0;

  // Recommendations mapping
  const recommendations = [
    demandOut.executive_insights?.action,
    whitespaceOut.market_insights?.strategic_recommendation,
    financeOut.economic_verdict,
    priceOut.insights?.entry_recommendation,
    hhiOut.strategic_implication,
  ].filter(Boolean);

  const navigationHub = [
    { name: 'Demand Intelligence', href: '/demand-strength', icon: Activity, desc: 'Analyze category demand concentration' },
    { name: 'Brand Momentum Intelligence', href: '/sales-momentum', icon: TrendingUp, desc: 'Track brand velocity and market shifts' },
    { name: 'Market Structure', href: '/market-structure', icon: BarChart4, desc: 'Assess monopoly vs fragmentation' },
    { name: 'Revenue Growth', href: '/revenue-momentum', icon: DollarSign, desc: 'Analyze revenue momentum across brands' },
    { name: 'BSR Efficiency', href: '/bsr-efficiency', icon: Crosshair, desc: 'Find products monetizing their rank efficiently' },
    { name: 'Inbound Efficiency Index', href: '/search-intent-efficiency', icon: MousePointerClick, desc: 'Measure search intent conversion rates' },
    { name: 'White Space Opportunities', href: '/whitespace-opportunities', icon: Target, desc: 'Discover high-demand, low-competition keywords' },
    { name: 'Product Intelligence', href: '/direct-competitors', icon: Package, desc: 'Map direct competitors and substitutes' },
    { name: 'Price Intelligence', href: '/price-elasticity', icon: TrendingDown, desc: 'Optimize pricing and positioning strategy' },
    { name: 'Market Entry Intelligence', href: '/finance-intelligence', icon: Landmark, desc: 'Evaluate market economics and entry viability' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Executive Command Center</h1>
          <p className="text-muted-foreground mt-1">High-level market telemetry and navigation hub.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs py-1 font-medium bg-background">
            Live Analysis
          </Badge>
          <Badge variant="success" className="text-xs py-1 font-medium">
            <CheckCircle2 className="w-3 h-3 mr-1 inline" />
            Engines Active
          </Badge>
        </div>
      </div>

      {/* SECTION 1: Executive Summary */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <LineChart className="w-5 h-5 text-primary" />
          Executive Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KPICard 
            title="Category Size" 
            value={totalSearchVolume > 0 ? formatNumber(totalSearchVolume) : 'N/A'} 
            icon={<Target className="w-4 h-4" />} 
            status="neutral" 
            subtitle="Total Search Volume" 
          />
          <KPICard 
            title="Total Revenue" 
            value={marketOverview.total_market_revenue ? formatCurrency(marketOverview.total_market_revenue) : 'N/A'} 
            icon={<DollarSign className="w-4 h-4" />} 
            status="success" 
            subtitle="Category Revenue" 
          />
          <KPICard 
            title="Active Products" 
            value={marketOverview.total_products_analysed ? formatNumber(marketOverview.total_products_analysed) : 'N/A'} 
            icon={<Package className="w-4 h-4" />} 
            status="neutral" 
            subtitle="Product Count" 
          />
          <KPICard 
            title="Active Brands" 
            value={marketOverview.total_brands_analysed ? formatNumber(marketOverview.total_brands_analysed) : 'N/A'} 
            icon={<Users className="w-4 h-4" />} 
            status="neutral" 
            subtitle="Brand Count" 
          />
          <KPICard 
            title="Active Sellers" 
            value={marketOverview.total_sellers_analysed ? formatNumber(marketOverview.total_sellers_analysed) : 'N/A'} 
            icon={<Users className="w-4 h-4" />} 
            status="neutral" 
            subtitle="Seller Count" 
          />
          <KPICard 
            title="Data Quality" 
            value={marketOverview.data_reliability_score ? `${marketOverview.data_reliability_score.toFixed(1)}%` : 'N/A'} 
            icon={<Database className="w-4 h-4" />} 
            status={marketOverview.data_reliability_score >= 80 ? 'success' : 'warning'} 
            subtitle="Dataset Completeness %" 
          />
        </div>
      </section>

      {/* SECTION 2: Market Health Snapshot */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Market Health Snapshot
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="bg-card glass border-border/50">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Demand Intelligence</p>
              <div>
                <p className="text-lg font-bold">{demandOut.top_demand_segment?.name || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Top Demand Segment</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card glass border-border/50">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Price Intelligence</p>
              <div>
                <p className="text-lg font-bold">{priceOut.insights?.revenue_driver?.band || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Dominant Price Tier</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card glass border-border/50">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">White Space</p>
              <div>
                <p className="text-lg font-bold truncate" title={whitespaceOut.market_insights?.top_seo_opportunity?.keyword || 'N/A'}>
                  {whitespaceOut.market_insights?.top_seo_opportunity?.keyword || 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground">Best Entry Segment</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card glass border-border/50">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Market Structure</p>
              <div>
                <p className="text-lg font-bold">{hhiOut.structure_type || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Market Type</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card glass border-border/50">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Revenue Growth</p>
              <div>
                <p className="text-lg font-bold text-success capitalize">{marketOverview.revenue_direction || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Growth Status</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card glass border-border/50">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">BSR Efficiency</p>
              <div>
                <p className="text-sm font-bold line-clamp-2 leading-tight">{results.bsr_efficiency_analysis?.deterministic_interpretation || 'N/A'}</p>
                <p className="text-xs text-muted-foreground mt-1">Efficiency Status</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECTION 3: Opportunity Radar */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Zap className="w-5 h-5 text-warning" />
          Opportunity Radar
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <RadarCard 
            title="Highest Opportunity Segment"
            name={whitespaceOut.market_insights?.top_seo_opportunity?.keyword}
            score={`${whitespaceOut.market_insights?.top_seo_opportunity?.whitespace_score?.toFixed(1) || 0}/100`}
            insight="Highest search volume with the weakest competitor title optimization."
          />
          <RadarCard 
            title="Most Undervalued Segment"
            name={demandOut.executive_insights?.most_undervalued_segment?.name}
            score={demandOut.executive_insights?.most_undervalued_segment?.demand_share ? `${demandOut.executive_insights.most_undervalued_segment.demand_share.toFixed(1)}% Demand` : undefined}
            insight={demandOut.executive_insights?.most_undervalued_segment?.insight}
          />
          <RadarCard 
            title="Best Monetized Segment"
            name={demandOut.executive_insights?.best_monetized_segment?.name}
            score={demandOut.executive_insights?.best_monetized_segment?.revenue_share ? `${demandOut.executive_insights.best_monetized_segment.revenue_share.toFixed(1)}% Revenue` : undefined}
            insight={demandOut.executive_insights?.best_monetized_segment?.insight}
          />
          <RadarCard 
            title="Premium Opportunity"
            name={financeOut.premium_viability?.opportunity || priceOut.insights?.premium_opportunity?.band}
            score="Premium Tier"
            insight={financeOut.premium_viability?.insight}
          />
          <RadarCard 
            title="Recommended Entry Segment"
            name={demandOut.recommended_entry_segment?.name}
            score={demandOut.recommended_entry_segment?.entry_score ? `${demandOut.recommended_entry_segment.entry_score.toFixed(0)}/100 Entry Score` : undefined}
            insight={demandOut.recommended_entry_segment?.reason}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SECTION 4: Executive Recommendations */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Info className="w-5 h-5 text-info" />
            Executive Recommendations
          </h2>
          <Card className="h-full bg-info/5 border-info/20">
            <CardContent className="p-6">
              {recommendations.length > 0 ? (
                <ul className="space-y-4">
                  {recommendations.slice(0, 5).map((rec, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <div className="w-6 h-6 rounded-full bg-info/20 text-info flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold">{i + 1}</span>
                      </div>
                      <span className="leading-relaxed text-foreground/90">{rec}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No executive recommendations available yet.</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* SECTION 6: Data Status */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Data Status
          </h2>
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Datasets Loaded</span>
                  <div className="flex gap-1">
                    {Object.entries(statusResp?.datasets || {}).filter(([_, loaded]) => loaded).map(([key]) => (
                      <Badge key={key} variant="outline" className="capitalize text-[10px] py-0">{key.replace('_', ' ')}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Coverage %</span>
                  <span className="text-sm font-medium">{marketOverview.data_reliability_score ? `${marketOverview.data_reliability_score.toFixed(1)}%` : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Products Analyzed</span>
                  <span className="text-sm font-medium">{marketOverview.total_products_analysed ? formatNumber(marketOverview.total_products_analysed) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Brands Tracked</span>
                  <span className="text-sm font-medium">{marketOverview.total_brands_analysed ? formatNumber(marketOverview.total_brands_analysed) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Refresh</span>
                  <span className="text-sm font-medium text-success flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Live
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* SECTION 5: Navigation Hub */}
      <section className="space-y-4 pt-4">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-primary" />
          Intelligence Modules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {navigationHub.map((item, i) => (
            <Link key={i} to={item.href} className="block group">
              <Card className="h-full transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:shadow-md cursor-pointer">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">{item.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

    </motion.div>
  );
}

function RadarCard({ title, name, score, insight }: { title: string, name?: string, score?: string, insight?: string }) {
  if (!name || name === 'N/A' || name === 'Unknown') return null;
  return (
    <Card className="bg-card glass border-border/50 hover:border-primary/30 transition-colors">
      <CardContent className="p-5 flex flex-col gap-2 h-full">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold truncate" title={name}>{name}</h3>
          {score && <Badge variant="secondary" className="shrink-0 text-[10px]">{score}</Badge>}
        </div>
        {insight && <p className="text-xs text-muted-foreground mt-auto pt-2 border-t border-border/50 leading-relaxed">{insight}</p>}
      </CardContent>
    </Card>
  );
}
