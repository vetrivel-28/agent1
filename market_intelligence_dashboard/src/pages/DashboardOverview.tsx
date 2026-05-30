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
  Target, Users, BarChart4, TrendingDown, Package, FileText, ChevronRight, AlertOctagon, Lightbulb
} from 'lucide-react';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

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
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (isError || (reportResp && !isEngineOk(reportResp))) {
    return (
      <Card className="border-danger/50 bg-danger/5 max-w-2xl mx-auto mt-20">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis could not be generated</h2>
          <p className="text-danger/80 mb-6">
            {getEngineErrorMessage(reportResp, "Failed to generate market report.")}
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
  const financeOut = engineOutputs.finance?.results || {};
  const directCompOut = engineOutputs.direct_competitors?.results || {};
  const bundleOut = engineOutputs.bundle?.results || {};
  
  const marketOverview = results.market_overview || {};
  const finalVerdict = results.final_market_verdict || {};

  // Extract variables for sections safely
  const marketStructure = hhiOut.market_structure || 'Unknown';
  const topBrand = revOut.momentum_leaders?.[0]?.brand || revOut.top_revenue_growth_brands?.[0]?.brand || 'N/A';
  const bestEntryOpportunity = whitespaceOut.market_insights?.top_seo_opportunity?.keyword || 'N/A';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Executive Command Center</h1>
          <p className="text-muted-foreground mt-1 text-sm">Real-time market telemetry and strategic insights.</p>
        </div>
      </div>

      {/* SECTION A — Executive Snapshot */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
          <Target className="w-4 h-4" /> Section A — Executive Snapshot
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KPICard title="Total Category Revenue" value={formatCurrency(marketOverview.total_market_revenue || 0)} icon={<DollarSign className="w-4 h-4" />} status="neutral" />
          <KPICard title="Total Brands" value={formatNumber(marketOverview.total_brands_analysed || 0)} icon={<Users className="w-4 h-4" />} status="neutral" />
          <KPICard title="Total Products" value={formatNumber(marketOverview.total_products_analysed || 0)} icon={<Package className="w-4 h-4" />} status="neutral" />
          <KPICard title="Market Structure" value={marketStructure} icon={<BarChart4 className="w-4 h-4" />} status="neutral" />
          <KPICard title="Top Brand" value={topBrand} icon={<TrendingUp className="w-4 h-4" />} status="success" />
          <KPICard title="Best Entry Opportunity" value={bestEntryOpportunity} icon={<Zap className="w-4 h-4" />} status="warning" />
        </div>
      </section>

      {/* SECTION B — Intelligence Summary Grid */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
          <Activity className="w-4 h-4" /> Section B — Intelligence Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <SummaryCard 
            title="Demand Intelligence"
            kpi={demandOut.top_demand_segment?.name || 'N/A'}
            kpiLabel="Top Demand Segment"
            insight={`Demand Concentration Score: ${hhiOut.hhi_score?.toFixed(0) || 'N/A'}`}
            link="/demand-strength"
            colorClass="text-blue-500 bg-blue-500/10"
          />
          <SummaryCard 
            title="Market Structure"
            kpi={hhiOut.market_leader_name || topBrand || 'N/A'}
            kpiLabel="Market Leader"
            insight={`Concentration Level: ${hhiOut.market_structure || 'N/A'}`}
            link="/market-structure"
            colorClass="text-purple-500 bg-purple-500/10"
          />
          <SummaryCard 
            title="Revenue Momentum"
            kpi={topBrand}
            kpiLabel="Fastest Growing Brand"
            insight={`Momentum Score: ${revOut.momentum_leaders?.[0]?.revenue_momentum_score?.toFixed(1) || 'N/A'}/100`}
            link="/revenue-momentum"
            colorClass="text-emerald-500 bg-emerald-500/10"
          />
          <SummaryCard 
            title="Price Intelligence"
            kpi={priceOut.insights?.revenue_driver?.band || 'N/A'}
            kpiLabel="Best Price Band"
            insight={`Premium Opportunity: ${priceOut.insights?.premium_opportunity?.band || 'N/A'}`}
            link="/price-elasticity"
            colorClass="text-amber-500 bg-amber-500/10"
          />
          <SummaryCard 
            title="Product Intelligence"
            kpi={directCompOut.clusters?.[0]?.cluster_name || 'N/A'}
            kpiLabel="Top Direct Competitor Cluster"
            insight={`Top Bundle Opportunity: ${bundleOut.high_potential_bundles?.[0]?.primary_product?.brand || 'N/A'} + Complement`}
            link="/direct-competitors"
            colorClass="text-indigo-500 bg-indigo-500/10"
          />
          <SummaryCard 
            title="Market Entry Intelligence"
            kpi={financeOut.entry_cost?.classification || 'N/A'}
            kpiLabel="Recommended Entry Zone"
            insight={finalVerdict.launch_recommendation || 'Evaluate carefully before entry.'}
            link="/finance-intelligence"
            colorClass="text-teal-500 bg-teal-500/10"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SECTION C — Executive Alerts */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
            <AlertOctagon className="w-4 h-4" /> Section C — Executive Alerts
          </h2>
          <Card className="h-full bg-card glass-card">
            <CardContent className="p-6 space-y-6">
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-danger/10 text-danger rounded-lg shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-danger mb-1">Biggest Risk</h4>
                  <p className="text-sm text-foreground/90">{results.risk_signals?.signals?.[0] || results.risk_signals?.[0] || 'No major risks detected in the current data snapshot.'}</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-warning/10 text-warning rounded-lg shrink-0"><Lightbulb className="w-5 h-5" /></div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-warning mb-1">Biggest Opportunity</h4>
                  <p className="text-sm text-foreground/90">{results.opportunity_signals?.[0] || 'No major opportunities surfaced yet.'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">Most Competitive Segment</h4>
                  <p className="text-sm font-bold">{hhiOut.market_structure || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">Fastest Growing Brand</h4>
                  <p className="text-sm font-bold">{topBrand}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* SECTION D — Business Summary */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
            <FileText className="w-4 h-4" /> Section D — Business Summary
          </h2>
          <Card className="h-full bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">What is happening in this market?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
                <p className="font-medium text-primary">
                  {finalVerdict.verdict || 'The market intelligence engines are still analyzing the data.'}
                </p>
                <p>
                  {results.market_economics_narrative || results.executive_summary?.market_economics || 'Upload comprehensive datasets to unlock the full executive narrative.'}
                </p>
                {finalVerdict.launch_recommendation && (
                  <div className="mt-4 p-4 bg-background rounded-lg border border-border/50">
                    <span className="font-semibold block mb-1">Executive Recommendation:</span>
                    {finalVerdict.launch_recommendation}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </motion.div>
  );
}

function SummaryCard({ title, kpi, kpiLabel, insight, link, colorClass }: { title: string, kpi: string, kpiLabel: string, insight: string, link: string, colorClass: string }) {
  return (
    <Link to={link} className="block group h-full">
      <Card className="h-full transition-all duration-300 hover:shadow-md hover:-translate-y-1 glass-card border-border/50 group-hover:border-primary/30 relative overflow-hidden">
        <div className={`absolute top-0 right-0 w-24 h-24 blur-3xl opacity-20 rounded-full -mr-10 -mt-10 ${colorClass.split(' ')[1]}`} />
        <CardContent className="p-6 flex flex-col h-full z-10 relative">
          <div className="flex justify-between items-start mb-6">
            <h3 className="font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{title}</h3>
            <div className={`p-1.5 rounded-md ${colorClass}`}>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mb-4 flex-1">
            <p className="text-2xl font-bold tracking-tight mb-1 truncate" title={kpi}>{kpi}</p>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpiLabel}</p>
          </div>
          <div className="pt-4 border-t border-border/50 mt-auto">
            <p className="text-xs text-foreground/80 leading-snug">{insight}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
