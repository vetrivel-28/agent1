/**
 * ConsumerAdoptionSimulator.tsx
 *
 * Exactly 10 numbered sections:
 *   1. Executive Summary
 *   2. Market DNA Overview
 *   3. Psychographic Segment Explorer
 *   4. Segment Distribution Visualizations
 *   5. Adoption Simulation Matrix
 *   6. Resistance Testing Dashboard
 *   7. Revenue Lift Estimator
 *   8. Repeat Purchase Forecast
 *   9. Scenario Testing
 *  10. Final Executive Summary
 *
 * UI rules:
 *  - No right-side EvidenceDrawer on this page
 *  - All clicks open centered InsightModal
 *  - No subtitle under page title
 *  - No Simulation Confidence, Stress Testing, Segment Stability, ExecutiveDecisionCenter sections
 *  - No Dominant Channel KPI
 *  - No Channel column in matrix
 *  - No Channel Preference chart
 *  - No Population Distribution or Motivation Distribution charts
 *  - No Simulation Data Sources badges block
 *  - No expanded segment detail panel below grid (modal instead)
 *  - No Recommended Action column in Revenue Lift table
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { scopeQueryKeys } from '../hooks/useCategoryScope';
import { FIXED_SEGMENT_NAMES } from '../constants/fixedPsychographicSegments';
import type { SimResults, Segment } from './consumerAdoption/types';
import {
  fmtPct, fmtNum, fmtScore, fmtCurrency, resistanceBg,
  intentColor, heatCell, orderSegments, activeSegments, adoptionRate,
} from './consumerAdoption/utils';
import {
  buildSimulatedConsumersModal,
  buildAdoptionRateModal,
  buildRevenueCaptureModal,
  buildHighestSegmentModal,
  buildLowestSegmentModal,
  buildRevenueLiftModal,
  buildDemandEnvironmentModal,
  buildRevenueEnvironmentModal,
  buildCompetitionEnvironmentModal,
  buildConsumerEnvironmentModal,
  buildSegmentModal,
  buildMatrixRowModal,
  buildLiftRowModal,
} from './consumerAdoption/modalContent';
import { InsightModal } from './consumerAdoption/InsightModal';
import type { InsightModalData } from './consumerAdoption/InsightModal';
import {
  ScenarioTestingSection,
  ExecutiveNarrativeSection,
} from './consumerAdoption/Phase5Sections';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICard';
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { cn } from '../utils/cn';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ScatterChart, Scatter, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  Users, TrendingUp, TrendingDown, AlertCircle,
  Target, DollarSign, Zap, Activity, Shield,
  Search,
} from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEGMENT_COLORS = [
  '#8B5CF6','#10B981','#3B82F6','#F59E0B','#EF4444',
  '#06B6D4','#EC4899','#84CC16','#F97316','#6366F1',
  '#14B8A6','#A855F7','#22C55E','#0EA5E9','#FB923C',
  '#E879F9','#4ADE80','#38BDF8','#FCD34D','#F87171',
];

const TRAIT_LABELS: Record<string, string> = {
  quality_focused: 'Quality',
  convenience_focused: 'Convenience',
  price_focused: 'Price',
  trend_focused: 'Trend',
  risk_aversion: 'Risk Aversion',
  health_conscious: 'Health',
  sustainability_conscious: 'Eco',
  budget_sensitivity: 'Budget',
  premium_willingness: 'Premium',
  switching_cost: 'Switching Cost',
  brand_loyalty: 'Brand Loyalty',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({
  value, max = 100, colorClass = 'bg-primary',
}: {
  value: number; max?: number; colorClass?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-bold text-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.fill || p.stroke || '#8B5CF6' }}>
          {p.name}: <span className="font-mono font-bold">
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
};

function SegmentCard({
  seg, index, selected, onClick,
}: {
  seg: Segment; index: number; selected: boolean; onClick: () => void;
}) {
  const color = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
  const inactive = seg.population === 0;
  return (
    <motion.div
      whileHover={{ y: inactive ? 0 : -2 }}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl border p-4 transition-all',
        inactive && 'opacity-50',
        selected
          ? 'border-primary/60 bg-primary/5 shadow-md'
          : 'border-border/50 bg-card hover:border-primary/30 hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h4 className="text-sm font-bold text-foreground leading-tight truncate">{seg.cluster_name}</h4>
        </div>
        <span className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0',
          resistanceBg(seg.resistance?.resistance_level || 'Low'),
        )}>
          {seg.resistance?.resistance_level || '—'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
        <div>
          <span className="text-muted-foreground">Population</span>
          <p className="font-bold font-mono">{fmtNum(seg.population)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Share</span>
          <p className="font-bold font-mono">{fmtPct(seg.percentage)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Adoption</span>
          <p className={cn('font-bold font-mono', intentColor(adoptionRate(seg)))}>
            {fmtPct(adoptionRate(seg))}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Intent</span>
          <p className={cn('font-bold font-mono', intentColor(seg.purchase_intent))}>
            {fmtScore(seg.purchase_intent)}
          </p>
        </div>
      </div>
      <ProgressBar value={adoptionRate(seg)} colorClass="bg-primary" />
      {seg.motivations?.[0] && seg.motivations[0] !== '—' && (
        <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2">{seg.motivations[0]}</p>
      )}
      <p className="text-[10px] text-primary mt-1.5">Click for full profile →</p>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConsumerAdoptionSimulator() {
  const { data: statusData } = useQuery({ queryKey: ['status'], queryFn: api.getStatus });
  const { categoryScope, categoryKey } = scopeQueryKeys(statusData);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['consumer-adoption-simulator', categoryKey],
    queryFn: () => api.runConsumerAdoptionSimulator(1000, categoryScope),
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !!statusData,
  });

  const [modal, setModal] = useState<InsightModalData | null>(null);
  const [selectedSegmentName, setSelectedSegmentName] = useState<string | null>(null);
  const [clusterSearch, setClusterSearch] = useState('');
  const [clusterSort, setClusterSort] = useState<'intent' | 'conversion' | 'population' | 'resistance'>('intent');
  const [clusterFilter, setClusterFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [matrixSort, setMatrixSort] = useState<'intent' | 'conversion' | 'trust' | 'resistance'>('intent');

  const r = useMemo<SimResults | null>(() => {
    const d = data?.data?.results;
    if (!d || !d.population_summary) return null;
    return d as SimResults;
  }, [data]);

  const segments = useMemo(() => orderSegments(r?.psychographic_segments || []), [r]);
  const activeSegs = useMemo(() => activeSegments(segments), [segments]);
  const summary = useMemo(() => r?.population_summary, [r]);
  const dna = useMemo(() => r?.market_dna ?? null, [r]);

  const scenarioData = useMemo(() => r?.scenario_testing, [r]);

  const insights = useMemo(() => (r?.insights || {}) as Record<string, unknown>, [r]);
  const retentionInsight = useMemo(
    () => (insights?.retention_intelligence || {}) as Record<string, unknown>,
    [insights],
  );

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const expectedAdoptionRate = useMemo(() => summary?.avg_purchase_intent ?? null, [summary]);

  const predictedRevenueCapture = useMemo(() => {
    if (!summary || !dna) return null;
    const recov = dna.recoverable_revenue || 0;
    return recov > 0 ? recov * summary.avg_conversion_probability : null;
  }, [summary, dna]);

  const highestSeg = useMemo(
    () => activeSegs.reduce<Segment | null>((best, s) =>
      !best || adoptionRate(s) > adoptionRate(best) ? s : best, null),
    [activeSegs],
  );

  const lowestSeg = useMemo(
    () => activeSegs.reduce<Segment | null>((worst, s) =>
      !worst || adoptionRate(s) < adoptionRate(worst) ? s : worst, null),
    [activeSegs],
  );

  const revenueLift = useMemo(() => {
    if (!dna?.recoverable_revenue || !summary) return null;
    return dna.recoverable_revenue * summary.avg_conversion_probability * 1.4;
  }, [dna, summary]);

  // ── Chart data ────────────────────────────────────────────────────────────

  const traitRadarData = useMemo(() => {
    if (!segments.length) return [];
    const keys = Object.keys(TRAIT_LABELS);
    return keys.map((k) => {
      const avg = segments.reduce((sum, s) => sum + ((s.dominant_traits as any)?.[k] || 0), 0) / segments.length;
      return { subject: TRAIT_LABELS[k], value: parseFloat((avg * 100).toFixed(1)), fullMark: 100 };
    });
  }, [segments]);

  const dnaRadarData = useMemo(() => {
    if (!dna) return [];
    return [
      { subject: 'Demand', value: Math.min(dna.demand_score || 0, 100), fullMark: 100 },
      { subject: 'Velocity', value: Math.min(dna.demand_velocity || 0, 100), fullMark: 100 },
      { subject: 'Efficiency', value: Math.min(dna.conversion_efficiency || 0, 100), fullMark: 100 },
      { subject: 'Revenue', value: Math.min(dna.revenue_density || 0, 100), fullMark: 100 },
      { subject: 'Accessibility', value: Math.min(100 - (dna.competitive_saturation || 0), 100), fullMark: 100 },
    ];
  }, [dna]);

  const filteredSegments = useMemo(() => {
    let arr = [...segments];
    if (clusterSearch) arr = arr.filter((s) => s.cluster_name.toLowerCase().includes(clusterSearch.toLowerCase()));
    if (clusterFilter === 'high') arr = arr.filter((s) => s.purchase_intent >= 65);
    if (clusterFilter === 'medium') arr = arr.filter((s) => s.purchase_intent >= 40 && s.purchase_intent < 65);
    if (clusterFilter === 'low') arr = arr.filter((s) => s.purchase_intent < 40);
    return arr.sort((a, b) => {
      if (clusterSort === 'intent') return b.purchase_intent - a.purchase_intent;
      if (clusterSort === 'conversion') return b.conversion_probability - a.conversion_probability;
      if (clusterSort === 'population') return b.population - a.population;
      if (clusterSort === 'resistance') return (b.resistance?.resistance_index || 0) - (a.resistance?.resistance_index || 0);
      return 0;
    });
  }, [segments, clusterSearch, clusterSort, clusterFilter]);

  const matrixSegments = useMemo(() => [...segments].sort((a, b) => {
    if (matrixSort === 'intent') return b.purchase_intent - a.purchase_intent;
    if (matrixSort === 'conversion') return b.conversion_probability - a.conversion_probability;
    if (matrixSort === 'trust') return b.trust_score - a.trust_score;
    if (matrixSort === 'resistance') return (b.resistance?.resistance_index || 0) - (a.resistance?.resistance_index || 0);
    return 0;
  }), [segments, matrixSort]);

  const resistanceBarData = useMemo(
    () => activeSegs.slice(0, 10).map((s) => ({
      name: s.cluster_name.split(' ').slice(0, 2).join(' '),
      'Habit Lock-In': parseFloat((s.resistance?.habit_lock_in || 0).toFixed(1)),
      'Competitor Loyalty': parseFloat((s.resistance?.competitor_loyalty || 0).toFixed(1)),
      'Trust Barrier': parseFloat((s.resistance?.trust_barrier || 0).toFixed(1)),
      'Price Resistance': parseFloat((s.resistance?.price_resistance || 0).toFixed(1)),
    })),
    [activeSegs],
  );

  const liftRows = useMemo(
    () => activeSegs.map((seg) => {
      const potential = Math.min(100, seg.purchase_intent + (seg.resistance?.resistance_index || 0) * 0.4);
      const lift = potential - seg.purchase_intent;
      const revOpp = (dna?.recoverable_revenue || 0) * (seg.percentage / 100) * (lift / 100);
      return { seg, potential, lift, revOpp };
    }),
    [activeSegs, dna],
  );

  const liftData = useMemo(
    () => liftRows.slice(0, 10).map(({ seg, potential, lift }) => ({
      name: seg.cluster_name.split(' ').slice(0, 2).join(' '),
      current: parseFloat(seg.purchase_intent.toFixed(1)),
      potential: parseFloat(potential.toFixed(1)),
      gap: parseFloat(lift.toFixed(1)),
    })),
    [liftRows],
  );

  const retentionData = useMemo(() => {
    if (!summary) return [];
    const base = summary.avg_conversion_probability;
    const loyalty = Number(retentionInsight?.avg_brand_loyalty) || (
      activeSegs.reduce((sum, s) => sum + (s.dominant_traits?.brand_loyalty || 0.4), 0) /
      Math.max(activeSegs.length, 1)
    );
    const churnFactor = 1 - (Number(retentionInsight?.avg_churn_risk_pct) || 30) / 200;
    const decay = Math.max(0.5, Math.min(0.95, (0.7 + loyalty * 0.3) * churnFactor));
    return [1, 3, 6, 12].map((month) => ({
      month: `Month ${month}`,
      retention: parseFloat((base * Math.pow(decay, month / 12) * 100).toFixed(1)),
    }));
  }, [summary, activeSegs, retentionInsight]);

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !r) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Consumer Adoption Simulator Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">
            {data?.message ||
              'Run at least one analysis engine (Demand Strength, Inbound Efficiency, or Market Concentration) before running the Consumer Adoption Simulator.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">

      {/* Centered modal — no right-side drawer on this page */}
      <InsightModal data={modal} onClose={() => setModal(null)} />

      {/* Page header — title only, no descriptive subtitle */}
      <PageHeader
        badge="Consumer Intelligence"
        title="Consumer Adoption Simulator"
      />

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1: Executive Summary
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="1. Executive Summary">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPICard
            label="Simulated Consumers"
            value={fmtNum(summary?.total_consumers)}
            implication={`${activeSegs.length} segments active in this dataset`}
            icon={Users}
            onClick={() => setModal(buildSimulatedConsumersModal(summary))}
          />
          <KPICard
            label="Expected Adoption Rate"
            value={fmtPct(expectedAdoptionRate)}
            implication="Weighted average conversion across active segments"
            icon={TrendingUp}
            onClick={() => setModal(buildAdoptionRateModal(
              fmtPct(expectedAdoptionRate), activeSegs, summary,
            ))}
          />
          <KPICard
            label="Predicted Revenue Capture"
            value={predictedRevenueCapture != null ? fmtCurrency(predictedRevenueCapture) : 'Insufficient data'}
            implication={
              predictedRevenueCapture != null
                ? 'Recoverable revenue × avg conversion probability'
                : 'Run Revenue Momentum engine to calculate'
            }
            icon={DollarSign}
            onClick={() => setModal(buildRevenueCaptureModal(
              predictedRevenueCapture != null ? fmtCurrency(predictedRevenueCapture) : 'Insufficient data',
              dna, summary,
            ))}
          />
          <KPICard
            label="Highest Converting Segment"
            value={highestSeg?.cluster_name || '—'}
            implication={highestSeg ? `Adoption: ${fmtPct(adoptionRate(highestSeg))}` : undefined}
            icon={Zap}
            colorClass="green-500"
            onClick={() => setModal(buildHighestSegmentModal(highestSeg))}
          />
          <KPICard
            label="Lowest Converting Segment"
            value={lowestSeg?.cluster_name || '—'}
            implication={lowestSeg ? `Adoption: ${fmtPct(adoptionRate(lowestSeg))} — priority for optimisation` : undefined}
            icon={TrendingDown}
            colorClass="red-500"
            onClick={() => setModal(buildLowestSegmentModal(lowestSeg))}
          />
          <KPICard
            label="Revenue Lift Opportunity"
            value={revenueLift != null ? fmtCurrency(revenueLift) : 'Insufficient data'}
            implication={
              revenueLift != null
                ? 'Incremental revenue if primary barriers are reduced'
                : 'Requires revenue signals — run Revenue Momentum engine'
            }
            icon={Target}
            onClick={() => setModal(buildRevenueLiftModal(
              revenueLift != null ? fmtCurrency(revenueLift) : 'Insufficient data',
              activeSegs, dna,
            ))}
          />
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2: Market DNA Overview
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="2. Market DNA Overview">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar chart */}
          <ChartContainer
            title="Market Signal Radar"
            description="Five normalised market signals powering the simulation — hover for values"
            xAxisLabel=""
            yAxisLabel=""
            businessExplanation="A larger coverage area means stronger, more diverse market signals. Each axis measures a different dimension of market health: demand volume, velocity, revenue efficiency, competitive accessibility, and conversion."
          >
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={dnaRadarData} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                <Radar name="Market DNA" dataKey="value" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.25} strokeWidth={2} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Environment scorecards — each clickable */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Signal Breakdown
            </h3>
            {[
              {
                label: 'Demand Environment',
                value: dna?.demand_score,
                icon: Activity,
                color: '#8B5CF6',
                desc: dna?.demand_score != null && dna.demand_score > 0
                  ? `${dna.demand_score >= 70 ? 'Strong' : dna.demand_score >= 45 ? 'Moderate' : 'Weak'} consumer demand — from keyword volume, search velocity, and growth trend`
                  : 'Run Demand Strength engine to calculate',
                buildModal: () => buildDemandEnvironmentModal(dna?.demand_score, dna),
              },
              {
                label: 'Revenue Environment',
                value: dna?.revenue_density,
                icon: DollarSign,
                color: '#10B981',
                desc: dna?.revenue_density != null && dna.revenue_density > 0
                  ? `${dna.revenue_density >= 70 ? 'High' : dna.revenue_density >= 45 ? 'Moderate' : 'Low'} revenue density — based on market revenue flow and recoverable opportunity`
                  : 'Run Revenue Momentum or BSR Efficiency engine to calculate',
                buildModal: () => buildRevenueEnvironmentModal(dna?.revenue_density, dna),
              },
              {
                label: 'Competition Environment',
                value: dna?.competitive_saturation,
                icon: Shield,
                color: '#EF4444',
                desc: dna?.competitive_saturation != null
                  ? `${dna.competitive_saturation >= 70 ? 'Highly competitive' : dna.competitive_saturation >= 45 ? 'Moderate competition' : 'Low competition'} — from HHI and brand concentration data`
                  : 'Run Market Concentration engine to calculate',
                buildModal: () => buildCompetitionEnvironmentModal(dna?.competitive_saturation, dna),
              },
              {
                label: 'Consumer Environment',
                value: summary?.avg_trust_score,
                icon: Users,
                color: '#3B82F6',
                desc: summary?.avg_trust_score != null
                  ? `${summary.avg_trust_score >= 70 ? 'Strong consumer trust' : summary.avg_trust_score >= 45 ? 'Moderate trust' : 'Low trust'} — from adoption model trust scores and review sentiment`
                  : 'Insufficient consumer signal data',
                buildModal: () => buildConsumerEnvironmentModal(summary?.avg_trust_score, summary, dna),
              },
            ].map((item) => (
              <Card
                key={item.label}
                className="border-border/40 bg-card cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setModal(item.buildModal())}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md" style={{ backgroundColor: `${item.color}20` }}>
                        <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <span className="text-sm font-bold text-foreground">{item.label}</span>
                    </div>
                    <span className="text-lg font-black font-mono" style={{ color: item.color }}>
                      {item.value != null && item.value > 0 ? item.value.toFixed(1) : '—'}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mb-1.5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, item.value || 0)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  <p className="text-[10px] text-primary mt-1">Click for full analysis →</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3: Psychographic Segment Explorer
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="3. Psychographic Segment Explorer">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Search segments..."
              value={clusterSearch}
              onChange={(e) => setClusterSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Sort:</span>
            {(['intent', 'conversion', 'population', 'resistance'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setClusterSort(s)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border font-medium capitalize transition-colors',
                  clusterSort === s
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Filter:</span>
            {(['all', 'high', 'medium', 'low'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setClusterFilter(f)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border font-medium capitalize transition-colors',
                  clusterFilter === f
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredSegments.length} of {FIXED_SEGMENT_NAMES.length} segments
          </span>
        </div>

        {/* Segment grid — clicking opens modal, no inline expansion */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSegments.map((seg) => (
            <SegmentCard
              key={seg.cluster_name}
              seg={seg}
              index={segments.indexOf(seg)}
              selected={selectedSegmentName === seg.cluster_name}
              onClick={() => {
                setSelectedSegmentName(prev =>
                  prev === seg.cluster_name ? null : seg.cluster_name,
                );
                setModal(buildSegmentModal(seg));
              }}
            />
          ))}
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4: Segment Distribution Visualizations
          (Only 2 charts — Trait Distribution and Adoption vs Resistance)
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="4. Segment Distribution Visualizations">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Trait Distribution Radar */}
          <div>
            <ChartContainer
              title="Trait Distribution — Population Average"
              description="Average psychological trait scores across all 20 segments"
              xAxisLabel=""
              yAxisLabel=""
              businessExplanation="A spike in a trait means it dominates consumer behavior in this category. For example, a high 'Price' spike means most consumers are price-sensitive and will respond to value messaging."
            >
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={traitRadarData} margin={{ top: 20, right: 30, bottom: 10, left: 30 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Avg Trait" dataKey="value" stroke="#10B981" fill="#10B981" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </ChartContainer>
            {/* Insight below chart */}
            {traitRadarData.length > 0 && (() => {
              const top = [...traitRadarData].sort((a, b) => b.value - a.value).slice(0, 3);
              return (
                <div className="mt-3 p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">What this means: </span>
                  The strongest traits in this market are{' '}
                  <span className="text-primary font-bold">{top.map(t => t.subject).join(', ')}</span>.{' '}
                  These signals drive which segments have high adoption and should inform your messaging priorities.
                </div>
              );
            })()}
          </div>

          {/* Adoption vs Resistance Scatter */}
          <div>
            <ChartContainer
              title="Adoption vs Resistance — Segment Positioning"
              description="Where each segment sits on the ease-to-convert spectrum"
              xAxisLabel="Resistance Index"
              yAxisLabel="Purchase Intent"
              businessExplanation="Top-left = easiest to win (high intent, low resistance). Bottom-right = hardest. Concentrate early marketing on top-left segments for the best return on investment."
            >
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Resistance"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Resistance →', position: 'insideBottom', offset: -8, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Intent"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Intent →', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                  <Scatter
                    data={segments.map((s, i) => ({
                      x: s.resistance?.resistance_index || 0,
                      y: s.purchase_intent,
                      name: s.cluster_name,
                      fill: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                    }))}
                    isAnimationActive={false}
                  >
                    {segments.map((_, i) => (
                      <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} fillOpacity={0.85} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </ChartContainer>
            {/* Insight below chart */}
            {activeSegs.length > 0 && (() => {
              const easyWins = activeSegs.filter(s => s.purchase_intent >= 65 && (s.resistance?.resistance_index || 0) < 40);
              const hardCases = activeSegs.filter(s => s.purchase_intent < 40 && (s.resistance?.resistance_index || 0) >= 60);
              return (
                <div className="mt-3 p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">What this means: </span>
                  {easyWins.length > 0
                    ? <><span className="text-emerald-500 font-bold">{easyWins.map(s => s.cluster_name).join(', ')}</span> are your easiest wins — high intent, low resistance. </>
                    : 'No easy-win segments found in this dataset. '}
                  {hardCases.length > 0
                    ? <><span className="text-red-400 font-bold">{hardCases.map(s => s.cluster_name).join(', ')}</span> require the most work to convert.</>
                    : 'Resistance is manageable across all active segments.'}
                </div>
              );
            })()}
          </div>
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5: Adoption Simulation Matrix
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="5. Adoption Simulation Matrix">
        <Card className="border-border/40">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle>Segment × Metric Heatmap</CardTitle>
                <CardDescription>
                  Adoption metrics across all psychographic segments. Click a row for a full breakdown.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Sort by:</span>
                {(['intent', 'conversion', 'trust', 'resistance'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setMatrixSort(s)}
                    className={cn(
                      'text-xs px-2 py-1 rounded border capitalize transition-colors',
                      matrixSort === s
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground uppercase tracking-wider">Segment</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Pop.</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Intent</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Adoption</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Trust</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Resonance</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Switch Prob.</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Resistance</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixSegments.filter((s) => s.population > 0).map((seg) => (
                    <tr
                      key={seg.cluster_name}
                      className="border-b border-border/30 hover:bg-muted/10 transition-colors cursor-pointer"
                      onClick={() => setModal(buildMatrixRowModal(seg))}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: SEGMENT_COLORS[segments.indexOf(seg) % SEGMENT_COLORS.length] }}
                          />
                          <span>{seg.cluster_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">{seg.population}</td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(seg.purchase_intent))}>
                        {seg.purchase_intent.toFixed(0)}
                      </td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(adoptionRate(seg)))}>
                        {adoptionRate(seg).toFixed(1)}%
                      </td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(seg.trust_score))}>
                        {seg.trust_score.toFixed(0)}
                      </td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(seg.emotional_resonance))}>
                        {seg.emotional_resonance.toFixed(0)}
                      </td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold',
                        heatCell(100 - seg.switching_probability * 100))}>
                        {(seg.switching_probability * 100).toFixed(1)}%
                      </td>
                      <td className={cn(
                        'px-3 py-2.5 text-center font-mono font-bold',
                        (seg.resistance?.resistance_index || 0) >= 70 ? 'text-red-500' :
                        (seg.resistance?.resistance_index || 0) >= 50 ? 'text-orange-500' :
                        (seg.resistance?.resistance_index || 0) >= 30 ? 'text-amber-500' : 'text-emerald-500',
                      )}>
                        {(seg.resistance?.resistance_index || 0).toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 6: Resistance Testing Dashboard
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="6. Resistance Testing Dashboard">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <ChartContainer
              title="Resistance Barriers by Segment"
              description="Top 10 segments — stacked barrier breakdown"
              xAxisLabel="Segment"
              yAxisLabel="Score"
              businessExplanation="Taller bars = harder to convert. Each colored layer shows which specific barrier (habit, trust, price, competitor loyalty) is blocking each segment most."
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={resistanceBarData}
                  margin={{ top: 4, right: 8, bottom: 64, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={72}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                  <Bar dataKey="Habit Lock-In" stackId="a" fill="#EF4444" />
                  <Bar dataKey="Competitor Loyalty" stackId="a" fill="#F97316" />
                  <Bar dataKey="Trust Barrier" stackId="a" fill="#EAB308" />
                  <Bar dataKey="Price Resistance" stackId="a" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Barrier overview cards with business meaning */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Barrier Overview — What Each Score Means
            </h3>
            {[
              {
                label: 'Habit Lock-In',
                key: 'habit_lock_in' as const,
                color: '#EF4444',
                meaning: 'How stuck consumers are in existing purchase routines. High scores mean they need a compelling reason to break their habit — promotions, bundling, or category education.',
              },
              {
                label: 'Trust Barrier',
                key: 'trust_barrier' as const,
                color: '#EAB308',
                meaning: 'How skeptical consumers are before their first purchase. Reviews, A+ content, certifications, and brand credibility are the main tools to reduce this.',
              },
              {
                label: 'Price Resistance',
                key: 'price_resistance' as const,
                color: '#8B5CF6',
                meaning: 'How much pricing blocks purchase. High scores indicate price-sensitive segments — value framing, comparison anchors, and tiered pricing can help.',
              },
              {
                label: 'Competitor Loyalty',
                key: 'competitor_loyalty' as const,
                color: '#F97316',
                meaning: 'How attached consumers are to existing competitor brands. Requires strong differentiation, trial offers, or clear feature advantages to overcome.',
              },
              {
                label: 'Product Complexity',
                key: 'product_complexity' as const,
                color: '#3B82F6',
                meaning: 'How confusing or overwhelming the product category feels. Simplified listings, comparison tables, and how-it-works content reduce this barrier.',
              },
              {
                label: 'Education Required',
                key: 'education_requirement' as const,
                color: '#10B981',
                meaning: 'How much pre-purchase education consumers need. High scores suggest investing in FAQs, videos, detailed Q&A, and educational content before launch.',
              },
            ].map((b) => {
              const avg = segments.length
                ? segments.reduce((sum, s) => sum + (s.resistance?.[b.key] || 0), 0) / segments.length
                : 0;
              return (
                <Card key={b.label} className="border-border/30 bg-card">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-foreground">{b.label}</span>
                      <span className="font-mono font-bold" style={{ color: b.color }}>{avg.toFixed(1)}/100</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${avg}%`, backgroundColor: b.color, opacity: 0.8 }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{b.meaning}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 7: Revenue Lift Estimator
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="7. Revenue Lift Estimator">
        <ChartContainer
          title="Current vs Potential Adoption by Segment"
          description="The gap between bars is the revenue lift opportunity per segment"
          xAxisLabel="Segment"
          yAxisLabel="Purchase Intent"
          businessExplanation="The purple portion shows untapped adoption potential — the gap between where each segment is now and where it could be if its primary barrier was resolved. Segments with the largest purple bars have the highest ROI for targeted campaigns."
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={liftData} margin={{ top: 4, right: 8, bottom: 52, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                angle={-35}
                textAnchor="end"
                interval={0}
                height={64}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Bar dataKey="current" name="Current Adoption %" stackId="a" fill="#64748B" />
              <Bar dataKey="gap" name="Lift Opportunity %" stackId="a" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Insight text */}
        {liftRows.length > 0 && (() => {
          const topLift = [...liftRows].sort((a, b) => b.lift - a.lift).slice(0, 3);
          return (
            <div className="mt-4 p-4 bg-muted/20 border border-border/40 rounded-xl text-sm text-muted-foreground">
              <span className="font-bold text-foreground">Key insight: </span>
              The highest lift opportunities are in{' '}
              {topLift.map((l) => (
                <span key={l.seg.cluster_name} className="text-primary font-bold">{l.seg.cluster_name}</span>
              )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [] as React.ReactNode[])}.{' '}
              These segments have high resistance that is actively suppressing adoption — resolving their primary barriers would directly increase conversion and revenue.
            </div>
          );
        })()}

        {/* Lift table — click rows for modal */}
        <Card className="border-border/40 mt-5">
          <CardHeader>
            <CardTitle className="text-sm">Revenue Lift Analysis — Click Any Row for Details</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Segment</th>
                  <th className="text-center px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Current %</th>
                  <th className="text-center px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Potential %</th>
                  <th className="text-center px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Lift</th>
                  <th className="text-center px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Revenue Opportunity</th>
                  <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Primary Barrier</th>
                </tr>
              </thead>
              <tbody>
                {liftRows.map(({ seg, potential, lift, revOpp }, i) => (
                  <tr
                    key={seg.cluster_name}
                    className="border-b border-border/30 hover:bg-muted/10 cursor-pointer"
                    onClick={() => setModal(buildLiftRowModal(seg, potential, lift, revOpp))}
                  >
                    <td className="px-4 py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                        {seg.cluster_name}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">{seg.purchase_intent.toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-emerald-500 font-bold">{potential.toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-primary">+{lift.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-center font-mono">
                      {revOpp > 0 ? fmtCurrency(revOpp) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{seg.resistance?.primary_barrier || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 8: Repeat Purchase Forecast
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="8. Repeat Purchase Forecast">
        {/* Context and explanation */}
        <div className="p-4 bg-muted/20 border border-border/40 rounded-xl text-sm text-muted-foreground mb-5">
          <span className="font-bold text-foreground">What this forecast shows: </span>
          How likely consumers are to repurchase at Month 1, 3, 6, and 12 after their first purchase.
          The forecast uses brand loyalty scores, churn risk signals, and demand velocity from your dataset.
          Month 3 is the critical window — it separates genuinely loyal buyers from one-time purchasers.
          Products with high repeat purchase potential have more sustainable revenue per customer.
        </div>

        {typeof retentionInsight?.summary === 'string' && retentionInsight.summary.length > 0 && (
          <p className="text-sm text-muted-foreground mb-4">{retentionInsight.summary}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Retention Curve */}
          <div>
            <ChartContainer
              title="Retention Curve"
              description="Expected repeat purchase rate at each time horizon"
              xAxisLabel="Month"
              yAxisLabel="Retention %"
              businessExplanation="Steeper drop between M1 and M3 = more churn risk. A flatter curve means higher loyalty. Improving brand loyalty scores (via review quality, subscription offers, and follow-up marketing) shifts this curve upward."
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={retentionData} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <defs>
                    <linearGradient id="retentionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="retention"
                    name="Retention %"
                    stroke="#8B5CF6"
                    fill="url(#retentionGrad)"
                    strokeWidth={2}
                    dot={{ fill: '#8B5CF6', r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
            {retentionData.length >= 4 && (
              <div className="mt-3 p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Reading the curve: </span>
                Starting at {retentionData[0]?.retention?.toFixed(0)}% at Month 1, dropping to{' '}
                {retentionData[1]?.retention?.toFixed(0)}% at Month 3 and{' '}
                {retentionData[3]?.retention?.toFixed(0)}% at Month 12.{' '}
                {(retentionData[3]?.retention ?? 0) > 40
                  ? 'This indicates a reasonably loyal customer base — invest in subscribe-and-save and loyalty programs to push retention higher.'
                  : 'Retention drops significantly over time. Focus on post-purchase engagement, packaging inserts, and follow-up email campaigns to improve repeat purchase rates.'}
              </div>
            )}
          </div>

          {/* Cohort Heatmap */}
          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="text-sm">Retention Cohort Heatmap by Segment</CardTitle>
              <CardDescription>Estimated retention rate by psychographic segment at each horizon</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground">Segment</th>
                      {['M1', 'M3', 'M6', 'M12'].map((m) => (
                        <th key={m} className="text-center px-3 py-2.5 font-bold text-muted-foreground">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((seg) => {
                      if (seg.population === 0) return null;
                      const loyalty = seg.dominant_traits?.brand_loyalty || 0.4;
                      const base = seg.conversion_probability || 0.01;
                      const decay = 0.7 + loyalty * 0.3;
                      return (
                        <tr key={seg.cluster_name} className="border-b border-border/20">
                          <td className="px-3 py-2 font-medium truncate max-w-[140px]" title={seg.cluster_name}>
                            {seg.cluster_name}
                          </td>
                          {[1, 3, 6, 12].map((mo) => {
                            const ret = base * Math.pow(decay, mo / 12) * 100;
                            return (
                              <td key={mo} className={cn('px-3 py-2 text-center font-mono font-bold', heatCell(ret))}>
                                {ret.toFixed(0)}%
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 9: Scenario Testing
      ═══════════════════════════════════════════════════════════════════ */}
      {scenarioData && <ScenarioTestingSection data={scenarioData} />}

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 10: Final Executive Summary
      ═══════════════════════════════════════════════════════════════════ */}
      {r && <ExecutiveNarrativeSection r={r} />}

    </div>
  );
}
