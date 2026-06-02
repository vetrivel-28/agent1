import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatNumber } from '../utils/cn';
import { Link } from 'react-router-dom';
import {
  Zap, Database, ArrowRight, Target, AlertTriangle, Lightbulb, 
  Info, Key, Package, DollarSign, Users, TrendingUp, BarChart3
} from 'lucide-react';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

function SnapshotMetric({ label, value, icon: Icon }: any) {
  if (!value || value === 'N/A') return null;
  return (
    <motion.div variants={fadeUp} className="flex items-center gap-3 p-3">
      <div className="p-2 bg-primary/10 rounded-lg">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-bold text-foreground truncate">{value}</p>
      </div>
    </motion.div>
  );
}

function InsightCard({ insight }: any) {
  return (
    <motion.div variants={fadeUp} className="p-4 bg-card border border-border/40 rounded-xl hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-foreground/90 leading-relaxed font-medium">{insight}</p>
      </div>
    </motion.div>
  );
}

function OpportunityItem({ opportunity }: any) {
  if (!opportunity?.title || opportunity.title === 'N/A') return null;
  return (
    <motion.div variants={fadeUp} className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-500/30 text-[10px] uppercase font-bold px-2">
          {opportunity.type}
        </Badge>
        <span className="font-bold text-sm text-foreground truncate">{opportunity.title}</span>
      </div>
      <p className="text-sm text-emerald-700/80 font-medium">{opportunity.evidence}</p>
    </motion.div>
  );
}

function RiskItem({ risk }: any) {
  if (!risk) return null;
  return (
    <motion.div variants={fadeUp} className="flex gap-3 items-start p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl">
      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
      <p className="text-sm text-rose-700/90 leading-relaxed font-medium">{risk}</p>
    </motion.div>
  );
}

export default function DashboardOverview() {
  const { data: reportResp, isLoading, isError, error } = useQuery({
    queryKey: ['market-report'],
    queryFn: () => api.getMarketReport(10),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: statusResp } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  const hasBlackbox = statusResp?.data?.datasets?.blackbox;

  if (!hasBlackbox && !isLoading && statusResp) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[70vh] text-center max-w-lg mx-auto space-y-8">
        <div className="relative">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <Database className="w-12 h-12 text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-warning/20 rounded-full flex items-center justify-center">
            <Zap className="w-4 h-4 text-warning" />
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-black tracking-tight">No Data Available</h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Upload your market datasets to extract strategic evidence.
          </p>
        </div>
        <Link to="/upload">
          <Button size="lg" className="group px-8 py-3 text-base font-semibold">
            Upload Datasets
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in">
        <div className="h-12 w-72 bg-muted animate-pulse rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted/60 animate-pulse rounded-xl" />)}
        </div>
        <div className="h-40 bg-muted/40 animate-pulse rounded-xl" />
      </div>
    );
  }

  let errorMsg = getEngineErrorMessage(reportResp, 'Failed to generate market report.');
  let errorTitle = "Analysis Unavailable";
  
  if (isError && error instanceof Error) {
    if (error.message.includes('404')) {
      errorTitle = "Endpoint Not Found";
      errorMsg = "The requested API endpoint does not exist (404).";
    } else if (error.message.includes('500')) {
      errorTitle = "Server Error";
      errorMsg = "The backend server encountered an internal error (500).";
    } else if (error.message.includes('Network Error')) {
      errorTitle = "Network Failure";
      errorMsg = "Failed to connect to the backend server. Please check your network connection.";
    } else {
      errorTitle = "API Error";
      errorMsg = error.message;
    }
  }

  if (isError || (reportResp && !isEngineOk(reportResp))) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center min-h-[60vh]">
        <Card className="border-danger/30 bg-danger/5 max-w-lg">
          <CardContent className="p-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mb-5">
              <AlertTriangle className="w-8 h-8 text-danger" />
            </div>
            <h2 className="text-xl font-bold text-danger mb-2">{errorTitle}</h2>
            <p className="text-danger/70 mb-6 text-sm leading-relaxed whitespace-pre-wrap">
              {errorMsg}
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}
              className="border-danger/30 text-danger hover:bg-danger/10">
              Retry Analysis
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const results = reportResp?.data?.results || {};
  const snapshot = results.market_snapshot || {};
  const insights = results.key_insights || [];
  const opportunities = results.opportunity_summary || [];
  const risks = results.market_risks || [];
  const priceCluster = results.primary_price_cluster || {};
  const audit = results.data_audit || {};

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-12 pb-16 max-w-[1400px] mx-auto">
      
      {/* HEADER */}
      <motion.div variants={fadeUp} className="flex flex-col gap-3 border-b border-border/40 pb-6">
        <Badge className="bg-primary/10 text-primary border-primary/20 w-fit font-mono text-[10px] tracking-widest uppercase rounded-sm px-2.5 py-1">
          Executive Briefing
        </Badge>
        <h1 className="text-4xl font-black tracking-tight text-foreground">
          Market Intelligence Overview
        </h1>
        <p className="text-muted-foreground text-base max-w-2xl">
          Four questions answered with dataset evidence. No placeholders. No arbitrary labels.
        </p>
      </motion.div>

      {/* ====================================================================
          1. MARKET SNAPSHOT (How big is the market?)
          ==================================================================== */}
      <motion.section variants={fadeUp} className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Question 1: Market Size & Scope
          </h2>
        </div>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-8">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              <SnapshotMetric label="Total Revenue" value={snapshot.total_revenue} icon={DollarSign} />
              <SnapshotMetric label="Total Products" value={snapshot.total_products} icon={Package} />
              <SnapshotMetric label="Total Brands" value={snapshot.total_brands} icon={Users} />
              <SnapshotMetric label="Demand Keywords" value={snapshot.total_keywords} icon={Key} />
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* ====================================================================
          2. MARKET CONCENTRATION (How concentrated?)
          ==================================================================== */}
      <motion.section variants={fadeUp} className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Question 2: Market Concentration
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="p-6 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Top 3 Brand Share</p>
              <p className="text-3xl font-black text-foreground">{snapshot.top_3_share}</p>
              <p className="text-xs text-foreground/70 leading-relaxed">
                {snapshot.top_3_share && parseFloat(snapshot.top_3_share) > 60 ? 'Highly concentrated market—dominated by few players.' : 'Moderate concentration—room for competition.'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="p-6 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market Leader</p>
              <p className="text-2xl font-black text-foreground truncate">{snapshot.market_leader || 'N/A'}</p>
              <p className="text-xs text-foreground/70">
                {snapshot.market_leader_share && `Controls ${snapshot.market_leader_share} of market`}
                {snapshot.market_leader_revenue && snapshot.market_leader_revenue !== 'N/A' && ` • Revenue ${snapshot.market_leader_revenue}`}
              </p>
            </CardContent>
          </Card>

          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="p-6 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">HHI Score</p>
              <p className="text-3xl font-black text-foreground">{snapshot.hhi_score}</p>
              <p className="text-xs text-foreground/70">
                {snapshot.hhi_score && parseFloat(snapshot.hhi_score) > 2500 ? 'High market concentration.' : 'Competitive landscape.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.section>

      {/* ====================================================================
          3. KEY INSIGHTS (Data-driven findings)
          ==================================================================== */}
      <motion.section variants={fadeUp} className="space-y-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Questions 1–2: Key Insights
          </h2>
        </div>
        <div className="space-y-3">
          {insights && insights.length > 0 ? (
            insights.map((insight: string, idx: number) => (
              <InsightCard key={idx} insight={insight} />
            ))
          ) : (
            <Card className="border-border/30 bg-muted/30">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No insights available yet.
              </CardContent>
            </Card>
          )}
        </div>
      </motion.section>

      {/* ====================================================================
          4. TOP DEMAND OPPORTUNITY (Where is demand?)
          ==================================================================== */}
      <motion.section variants={fadeUp} className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Question 3: Demand Hotspot
          </h2>
        </div>
        <div className="space-y-3">
          {opportunities && opportunities.length > 0 ? (
            opportunities.map((opp: any, idx: number) => (
              <OpportunityItem key={idx} opportunity={opp} />
            ))
          ) : (
            <Card className="border-border/30 bg-muted/30">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No demand opportunities identified.
              </CardContent>
            </Card>
          )}
        </div>
      </motion.section>

      {/* ====================================================================
          5. BEST PRICE BAND
          ==================================================================== */}
      <motion.section variants={fadeUp} className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-purple-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Question 4: Primary Price Cluster
          </h2>
        </div>
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-8">
            {priceCluster.dominant_range && priceCluster.dominant_range !== 'N/A' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dominant Price Range</p>
                  <p className="text-4xl font-black text-foreground">{priceCluster.dominant_range}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Revenue Share</p>
                  <p className="text-4xl font-black text-foreground">{priceCluster.revenue_share}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Product Count</p>
                  <p className="text-4xl font-black text-foreground">{priceCluster.product_count}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Pricing data not available in datasets.</p>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* ====================================================================
          6. MARKET RISKS
          ==================================================================== */}
      <motion.section variants={fadeUp} className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Market Risks
          </h2>
        </div>
        <div className="space-y-3">
          {risks && risks.length > 0 ? (
            risks.map((risk: string, idx: number) => (
              <RiskItem key={idx} risk={risk} />
            ))
          ) : (
            <Card className="border-border/30 bg-muted/30">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No material risks identified.
              </CardContent>
            </Card>
          )}
        </div>
      </motion.section>

      {/* DATA AUDIT FOOTER */}
      <motion.section variants={fadeUp} className="pt-8 mt-8 border-t border-border/40">
        <div className="flex flex-wrap gap-x-8 gap-y-4 items-center justify-center text-sm text-muted-foreground font-mono">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" /> Data Audit:
          </div>
          <div>{formatNumber(audit.products_analyzed || 0)} Products</div>
          <div>•</div>
          <div>{formatNumber(audit.brands_analyzed || 0)} Brands</div>
          <div>•</div>
          <div>{formatNumber(audit.keywords_analyzed || 0)} Keywords</div>
        </div>
      </motion.section>

    </motion.div>
  );
}
