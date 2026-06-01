import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { Link } from 'react-router-dom';
import {
  Activity, Zap, TrendingUp, TrendingDown, DollarSign, Database,
  AlertTriangle, ArrowRight, Target, Users, BarChart4, Package,
  FileText, ChevronRight, AlertOctagon, Lightbulb, Shield,
  Gauge, Crown, Rocket, Info, ArrowUpRight, Layers
} from 'lucide-react';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 80, stroke = 6 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <span className="absolute text-lg font-black font-mono" style={{ color }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function MetricPill({ label, value, color = 'text-foreground' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={cn('text-xl font-black font-mono tracking-tight', color)}>{value}</span>
    </div>
  );
}

function PillarBar({ label, score, icon }: { label: string; score: number | null; icon: React.ReactNode }) {
  const pct = score ?? 0;
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct >= 70 ? 'text-emerald-500' : pct >= 45 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="flex items-center gap-3">
      <div className="p-1.5 rounded-md bg-muted/50 text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-foreground/80 truncate">{label}</span>
          <span className={cn('text-xs font-bold font-mono', score != null ? textColor : 'text-muted-foreground')}>
            {score != null ? `${pct.toFixed(0)}/100` : '—'}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-1000 ease-out', barColor)}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, kpi, kpiLabel, insight, link, icon, accentColor }: {
  title: string; kpi: string; kpiLabel: string; insight: string; link: string;
  icon: React.ReactNode; accentColor: string;
}) {
  return (
    <Link to={link} className="block group h-full">
      <Card className="h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/40 group-hover:border-primary/40 relative overflow-hidden">
        <div className={cn('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none',
          'bg-gradient-to-br from-transparent via-transparent to-primary/5')} />
        <CardContent className="p-6 flex flex-col h-full relative z-10">
          <div className="flex justify-between items-start mb-5">
            <div className="flex items-center gap-2.5">
              <div className={cn('p-2 rounded-lg border', accentColor)}>{icon}</div>
              <h3 className="font-semibold text-sm text-muted-foreground group-hover:text-foreground transition-colors">{title}</h3>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </div>
          <div className="mb-4 flex-1">
            <p className="text-2xl font-black tracking-tight mb-1.5 truncate text-foreground" title={kpi}>{kpi}</p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{kpiLabel}</p>
          </div>
          <div className="pt-3 border-t border-border/40 mt-auto">
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{insight}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const isUp = direction === 'Accelerating' || direction === 'Growing' || direction === 'growing';
  const isDown = direction === 'Decelerating' || direction === 'Declining' || direction === 'declining';
  const color = isUp ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
    : isDown ? 'text-red-500 bg-red-500/10 border-red-500/20'
    : 'text-amber-600 bg-amber-500/10 border-amber-500/20';
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Activity;

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold uppercase tracking-wider', color)}>
      <Icon className="w-3 h-3" /> {direction || 'Stable'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function DashboardOverview() {
  const { data: reportResp, isLoading, isError } = useQuery({
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

  // --- Empty State ---
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
            Upload your market datasets to activate the intelligence engines and generate strategic insights.
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

  // --- Loading State ---
  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in">
        <div className="h-12 w-72 bg-muted animate-pulse rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-muted/60 animate-pulse rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 bg-muted/40 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // --- Error State ---
  if (isError || (reportResp && !isEngineOk(reportResp))) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center min-h-[60vh]">
        <Card className="border-danger/30 bg-danger/5 max-w-lg">
          <CardContent className="p-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mb-5">
              <AlertTriangle className="w-8 h-8 text-danger" />
            </div>
            <h2 className="text-xl font-bold text-danger mb-2">Analysis Unavailable</h2>
            <p className="text-danger/70 mb-6 text-sm leading-relaxed">
              {getEngineErrorMessage(reportResp, 'Failed to generate market report.')}
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

  // --- Data Extraction ---
  const results = reportResp?.data?.results || {};
  const engineOutputs = results.engine_outputs || {};

  const demandOut = engineOutputs.demand?.results || results.demand_analysis || {};
  const priceOut = engineOutputs.price_elasticity?.results || results.price_elasticity || {};
  const whitespaceOut = engineOutputs.whitespace?.results || results.whitespace || {};
  const hhiOut = engineOutputs.hhi?.results || results.hhi || {};
  const revOut = engineOutputs.revenue_momentum?.results || results.revenue_analysis || {};
  const financeOut = engineOutputs.finance?.results || results.finance_intelligence || {};
  const directCompOut = engineOutputs.direct_competitors?.results || results.direct_competitors || {};
  const bundleOut = engineOutputs.bundle?.results || results.bundle_opportunities || {};

  const marketOverview = results.market_overview || {};
  const finalVerdict = results.final_market_verdict || {};
  const pillarScores = results.pillar_scores || finalVerdict.pillar_scores || {};
  const compositeScore = results.composite_market_health_score || finalVerdict.final_market_score || 0;
  const marketHealth = results.market_health || {};

  const marketStructure = hhiOut.market_structure || 'Unknown';
  const topBrand = revOut.top_revenue_brands?.[0]?.brand || hhiOut.market_leader_name || 'N/A';
  const bestEntry = whitespaceOut.market_insights?.top_seo_opportunity?.keyword
    || whitespaceOut.top_whitespace_keywords?.[0]?.keyword || 'N/A';
  const marketDirection = marketOverview.market_direction || marketHealth.market_direction || 'stable';
  const reliabilityScore = marketOverview.data_reliability_score || marketHealth.data_reliability_score || 0;

  // --- Render ---
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-10 pb-12">

      {/* ═══════════════════════════════════════════════════════════════════
          HEADER — Executive Briefing Bar
      ═══════════════════════════════════════════════════════════════════ */}
      <motion.div variants={fadeUp} className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-6 border-b border-border/40">
        <div>
          <Badge className="bg-primary/10 text-primary border-primary/20 mb-3 font-mono text-[10px] tracking-widest uppercase rounded-sm px-2.5 py-1">
            Executive Command Center
          </Badge>
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            Market Intelligence
          </h1>
          <p className="text-muted-foreground mt-2 text-base max-w-xl">
            Real-time strategic telemetry across demand, competition, pricing, and financial viability.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <ScoreRing score={compositeScore} size={72} stroke={5} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1.5">Health</p>
          </div>
          <div className="h-12 w-px bg-border/50" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Direction</span>
              <DirectionBadge direction={marketDirection} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reliability</span>
              <span className="text-xs font-bold font-mono text-foreground">{reliabilityScore.toFixed?.(0) ?? reliabilityScore}%</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION A — Key Metrics Strip
      ═══════════════════════════════════════════════════════════════════ */}
      <motion.section variants={fadeUp} className="space-y-4">
        <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-2">
          <Target className="w-3.5 h-3.5" /> Market Snapshot
        </h2>
        <Card className="overflow-hidden border-border/40">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-border/30">
            <MetricPill label="Category Revenue" value={formatCurrency(marketOverview.total_market_revenue || 0)} color="text-emerald-600" />
            <MetricPill label="Brands" value={formatNumber(marketOverview.total_brands_analysed || 0)} />
            <MetricPill label="Products" value={formatNumber(marketOverview.total_products_analysed || 0)} />
            <MetricPill label="Structure" value={marketStructure} color="text-primary" />
            <MetricPill label="Leader" value={topBrand} color="text-foreground" />
            <MetricPill label="Entry Keyword" value={bestEntry} color="text-amber-600" />
          </div>
        </Card>
      </motion.section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION B — Pillar Scores + Verdict
      ═══════════════════════════════════════════════════════════════════ */}
      <motion.section variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pillar Breakdown */}
        <Card className="lg:col-span-1 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Gauge className="w-4 h-4" /> Intelligence Pillars
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PillarBar label="Demand Strength" score={pillarScores.demand ?? null} icon={<Target className="w-3.5 h-3.5" />} />
            <PillarBar label="Growth Momentum" score={pillarScores.momentum ?? null} icon={<TrendingUp className="w-3.5 h-3.5" />} />
            <PillarBar label="Competition" score={pillarScores.competition ?? null} icon={<Users className="w-3.5 h-3.5" />} />
            <PillarBar label="Opportunity" score={pillarScores.opportunity ?? null} icon={<Zap className="w-3.5 h-3.5" />} />
            <PillarBar label="Finance Health" score={pillarScores.finance ?? null} icon={<DollarSign className="w-3.5 h-3.5" />} />
          </CardContent>
        </Card>

        {/* Executive Verdict */}
        <Card className="lg:col-span-2 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <CardHeader className="pb-3 relative z-10">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <FileText className="w-4 h-4" /> Executive Verdict
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 space-y-4">
            <p className="text-lg font-bold text-foreground leading-snug">
              {finalVerdict.verdict || 'The market intelligence engines are analyzing the data.'}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {results.market_economics_narrative || results.executive_summary?.market_economics || 'Upload comprehensive datasets to unlock the full executive narrative.'}
            </p>
            {finalVerdict.launch_recommendation && (
              <div className="mt-4 p-4 bg-background/80 backdrop-blur rounded-xl border border-border/50 flex items-start gap-3">
                <Rocket className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary block mb-1">Launch Recommendation</span>
                  <span className="text-sm font-medium text-foreground">{finalVerdict.launch_recommendation}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION C — Intelligence Summary Cards
      ═══════════════════════════════════════════════════════════════════ */}
      <motion.section variants={fadeUp} className="space-y-4">
        <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> Intelligence Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <SummaryCard
            title="Demand Intelligence"
            kpi={demandOut.top_demand_keywords?.[0]?.keyword || 'N/A'}
            kpiLabel="Top Demand Keyword"
            insight={`HHI Concentration: ${hhiOut.hhi_score?.toFixed?.(0) ?? hhiOut.hhi_score ?? 'N/A'} · ${demandOut.deterministic_interpretation || ''}`}
            link="/demand-strength"
            icon={<Target className="w-4 h-4" />}
            accentColor="text-blue-500 bg-blue-500/10 border-blue-500/20"
          />
          <SummaryCard
            title="Market Structure"
            kpi={hhiOut.market_leader_name || topBrand || 'N/A'}
            kpiLabel="Market Leader"
            insight={`Structure: ${marketStructure} · Top 3 Share: ${hhiOut.top_3_share ? hhiOut.top_3_share.toFixed(1) + '%' : 'N/A'}`}
            link="/market-structure"
            icon={<Layers className="w-4 h-4" />}
            accentColor="text-purple-500 bg-purple-500/10 border-purple-500/20"
          />
          <SummaryCard
            title="Revenue Momentum"
            kpi={topBrand}
            kpiLabel="Fastest Growing Brand"
            insight={`Revenue Score: ${revOut.revenue_momentum_score?.toFixed?.(1) ?? revOut.top_revenue_brands?.[0]?.revenue_momentum_score?.toFixed?.(1) ?? 'N/A'}/100`}
            link="/revenue-momentum"
            icon={<TrendingUp className="w-4 h-4" />}
            accentColor="text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
          />
          <SummaryCard
            title="Price Intelligence"
            kpi={priceOut.kpis?.best_selling_price_band || priceOut.kpis?.best_selling_tier || 'N/A'}
            kpiLabel="Best Price Band"
            insight={`Premium Viability: ${priceOut.kpis?.premium_viability || 'N/A'} · Structure: ${priceOut.kpis?.market_pricing_structure || 'N/A'}`}
            link="/price-elasticity"
            icon={<DollarSign className="w-4 h-4" />}
            accentColor="text-amber-500 bg-amber-500/10 border-amber-500/20"
          />
          <SummaryCard
            title="Product Intelligence"
            kpi={directCompOut.market_clusters?.[0]?.subcategory || directCompOut.market_clusters?.[0]?.category || 'N/A'}
            kpiLabel="Top Competitive Cluster"
            insight={`${directCompOut.total_clusters || 0} clusters · ${directCompOut.total_products_analyzed || 0} products analyzed`}
            link="/product-intelligence"
            icon={<Package className="w-4 h-4" />}
            accentColor="text-indigo-500 bg-indigo-500/10 border-indigo-500/20"
          />
          <SummaryCard
            title="Market Entry"
            kpi={financeOut.entry_cost?.classification || 'N/A'}
            kpiLabel="Entry Difficulty"
            insight={finalVerdict.launch_recommendation || 'Evaluate carefully before entry.'}
            link="/finance-intelligence"
            icon={<Shield className="w-4 h-4" />}
            accentColor="text-teal-500 bg-teal-500/10 border-teal-500/20"
          />
        </div>
      </motion.section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION D — Alerts & Signals
      ═══════════════════════════════════════════════════════════════════ */}
      <motion.section variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk & Opportunity Signals */}
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <AlertOctagon className="w-4 h-4" /> Strategic Signals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-4 items-start p-4 rounded-xl bg-danger/5 border border-danger/10">
              <div className="p-2 bg-danger/10 text-danger rounded-lg shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-danger mb-1.5">Primary Risk</h4>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {results.risk_signals?.signals?.[0] || results.risk_findings?.[0] || 'No major risks detected in the current data snapshot.'}
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg shrink-0">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1.5">Top Opportunity</h4>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {results.opportunity_signals?.signals?.[0] || results.opportunity_findings?.[0] || 'No major opportunities surfaced yet.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BarChart4 className="w-4 h-4" /> Market Vitals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Market Leader</p>
                <p className="text-base font-bold text-foreground truncate" title={topBrand}>{topBrand}</p>
                {hhiOut.market_leader_share != null && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{hhiOut.market_leader_share.toFixed(1)}% share</p>
                )}
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Market Direction</p>
                <DirectionBadge direction={marketDirection} />
                <p className="text-xs text-muted-foreground mt-2">{marketOverview.market_direction_explanation?.split('.')[0] || ''}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Entry Difficulty</p>
                <p className="text-base font-bold text-foreground">{hhiOut.entry_difficulty_classification || financeOut.entry_cost?.classification || 'N/A'}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Score: {hhiOut.entry_difficulty_score ?? 'N/A'}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Data Reliability</p>
                <p className="text-base font-bold text-foreground font-mono">{reliabilityScore.toFixed?.(0) ?? reliabilityScore}%</p>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', reliabilityScore >= 70 ? 'bg-emerald-500' : reliabilityScore >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${Math.min(100, reliabilityScore)}%` }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>

    </motion.div>
  );
}
