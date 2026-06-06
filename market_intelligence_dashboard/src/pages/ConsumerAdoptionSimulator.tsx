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
  Tooltip, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  Users, TrendingUp, TrendingDown, AlertCircle,
  Target, DollarSign, Zap, Activity, Shield,
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
    const avgConv = activeSegs.reduce((s, seg) => s + seg.conversion_probability, 0) / Math.max(activeSegs.length, 1);
    const avgResistance = activeSegs.reduce((s, seg) => s + (seg.resistance?.resistance_index ?? 0), 0) / Math.max(activeSegs.length, 1);
    const upliftFactor = 1.0 + Math.min(avgResistance / 100.0, 0.8); // resistance-derived, not hardcoded
    const current = dna.recoverable_revenue * avgConv;
    return current * upliftFactor - current; // lift = potential - current
  }, [dna, summary, activeSegs]);

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
    // Show all 20 segments ordered by index (no search/filter/sort controls)
    return segments;
  }, [segments]);

  // Strategic top-7 matrix segments: scored by adoption potential × population × revenue fit
  const matrixSegments = useMemo(() => {
    const recov = dna?.recoverable_revenue || 0;
    const sorted = [...segments].map((seg) => {
      const adoptionScore = seg.conversion_probability * 100;
      const popScore = seg.percentage;
      const revScore = recov > 0 ? (seg.percentage / 100) * adoptionScore : 0;
      const resistancePenalty = (seg.resistance?.resistance_index || 0) / 200;
      const strategicScore = adoptionScore * 0.4 + popScore * 0.3 + revScore * 0.2 - resistancePenalty * 0.1;
      return { seg, strategicScore };
    }).sort((a, b) => {
      if (matrixSort === 'intent') return b.seg.purchase_intent - a.seg.purchase_intent;
      if (matrixSort === 'conversion') return b.seg.conversion_probability - a.seg.conversion_probability;
      if (matrixSort === 'trust') return b.seg.trust_score - a.seg.trust_score;
      if (matrixSort === 'resistance') return (b.seg.resistance?.resistance_index || 0) - (a.seg.resistance?.resistance_index || 0);
      return b.strategicScore - a.strategicScore;
    });
    // Show top 7 strategic segments only
    return sorted.slice(0, 7).map(({ seg }) => seg);
  }, [segments, matrixSort, dna]);

  // Average barrier scores across all active segments
  const barrierAverages = useMemo(() => {
    if (!activeSegs.length) return [];
    const keys = [
      { key: 'habit_lock_in',          label: 'Habit Lock-In',       color: '#EF4444' },
      { key: 'trust_barrier',          label: 'Trust Barrier',       color: '#EAB308' },
      { key: 'price_resistance',       label: 'Price Resistance',    color: '#8B5CF6' },
      { key: 'competitor_loyalty',     label: 'Competitor Loyalty',  color: '#F97316' },
      { key: 'product_complexity',     label: 'Product Complexity',  color: '#3B82F6' },
      { key: 'education_requirement',  label: 'Education Required',  color: '#10B981' },
    ] as const;
    return keys.map(({ key, label, color }) => ({
      name: label,
      color,
      avg: parseFloat((activeSegs.reduce((s, seg) => s + (seg.resistance?.[key] || 0), 0) / activeSegs.length).toFixed(1)),
    })).sort((a, b) => b.avg - a.avg);
  }, [activeSegs]);

  const liftRows = useMemo(() => {
    const avgResistance = activeSegs.reduce((s, seg) => s + (seg.resistance?.resistance_index || 0), 0) / Math.max(activeSegs.length, 1);
    const upliftFactor = 1.0 + Math.min(avgResistance / 100.0, 0.8);
    return activeSegs
      .map((seg) => {
        const potential = Math.min(100, seg.purchase_intent + (seg.resistance?.resistance_index || 0) * 0.4);
        const lift = potential - seg.purchase_intent;
        const segRevShare = dna?.recoverable_revenue ? dna.recoverable_revenue * (seg.percentage / 100) : 0;
        // Weight by both conversion probability and lift magnitude for meaningful variance
        const revOpp = segRevShare * seg.conversion_probability * (upliftFactor - 1.0) * (lift / 50);
        // Compute dominant barrier per-segment from actual resistance data (not hardcoded)
        const r = seg.resistance;
        const dominantBarrier = r ? (() => {
          const barriers: [string, number][] = [
            ['Habit Lock-In', r.habit_lock_in || 0],
            ['Trust Barrier', r.trust_barrier || 0],
            ['Price Resistance', r.price_resistance || 0],
            ['Competitor Loyalty', r.competitor_loyalty || 0],
            ['Product Complexity', r.product_complexity || 0],
            ['Education Required', r.education_requirement || 0],
          ];
          return barriers.sort((a, b) => b[1] - a[1])[0][0];
        })() : (seg.resistance?.primary_barrier || '—');
        return { seg, potential, lift, revOpp, dominantBarrier };
      })
      .sort((a, b) => b.revOpp - a.revOpp)
      .slice(0, 5); // TOP 5 ONLY
  }, [activeSegs, dna]);

  const liftData = useMemo(
    () => liftRows.map(({ seg, potential, lift }) => ({
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

    // Determine product type from price tier for product-aware decay
    const priceMid = dna ? ((dna.market_price_floor || 5) + (dna.market_price_ceiling || 50)) / 2 : 25;
    const isConsumable = priceMid < 20; // budget/commodity = likely consumable
    const isPremium    = priceMid > 60; // premium = slower repeat cycle
    const isDurable    = priceMid > 100; // high-priced = durable good

    const loyalty = Number(retentionInsight?.avg_brand_loyalty) || (
      activeSegs.reduce((sum, s) => sum + (s.dominant_traits?.brand_loyalty || 0.4), 0) /
      Math.max(activeSegs.length, 1)
    );
    const churnPct = Number(retentionInsight?.avg_churn_risk_pct) || 30;
    const churnFactor = 1 - churnPct / 200;

    // Product-type adjusts the decay rate:
    // consumables → slower decay (high repeat), durables → faster decay (low repeat)
    const baseDecay = Math.max(0.5, Math.min(0.95, (0.7 + loyalty * 0.3) * churnFactor));
    const decayMod  = isConsumable ? 1.05 : isDurable ? 0.75 : isPremium ? 0.88 : 1.0;
    const decay     = Math.max(0.4, Math.min(0.98, baseDecay * decayMod));

    return [1, 3, 6, 12].map((month) => ({
      month: `Month ${month}`,
      retention: parseFloat((base * Math.pow(decay, month / 12) * 100).toFixed(1)),
    }));
  }, [summary, activeSegs, retentionInsight, dna]);

  // Product type label for repeat purchase section context
  const productTypeLabel = useMemo(() => {
    const priceMid = dna ? ((dna.market_price_floor || 5) + (dna.market_price_ceiling || 50)) / 2 : 25;
    if (priceMid < 20) return { type: 'consumable', note: 'Budget/consumable product — repeat purchase likely via convenience and habit formation.' };
    if (priceMid > 100) return { type: 'durable', note: 'High-priced durable product — lower short-term repeat purchase. Growth comes from new acquisition and cross-sell.' };
    if (priceMid > 60) return { type: 'premium', note: 'Premium product — moderate repeat purchase. Trust and satisfaction drive loyalty over a longer cycle.' };
    return { type: 'mass-market', note: 'Mass-market product — repeat purchase depends on satisfaction, convenience, and competitive alternatives.' };
  }, [dna]);

  // Per-segment retention at each horizon (product-type aware, varies by segment)
  const segmentRetentionData = useMemo(() => {
    const priceMid = dna ? ((dna.market_price_floor || 5) + (dna.market_price_ceiling || 50)) / 2 : 25;
    const isDurable    = priceMid > 100;
    const isPremium    = priceMid > 60;
    const isConsumable = priceMid < 20;

    return segments.map((seg) => {
      const loyalty = seg.dominant_traits?.brand_loyalty || 0.4;
      const riskAversion = seg.dominant_traits?.risk_aversion || 0.3;
      const convenience = seg.dominant_traits?.convenience_focused || 0.5;
      const base = seg.conversion_probability || 0.01;

      // Segment-specific decay: more loyal + convenience-focused = slower decay
      const segDecayBase = Math.max(0.45, Math.min(0.97,
        0.65 + loyalty * 0.22 + convenience * 0.08 - riskAversion * 0.05
      ));
      const decayMod = isConsumable ? 1.05 : isDurable ? 0.72 : isPremium ? 0.87 : 1.0;
      const decay = Math.max(0.38, Math.min(0.97, segDecayBase * decayMod));

      return {
        name: seg.cluster_name,
        population: seg.population,
        m1:  parseFloat((base * Math.pow(decay, 1 / 12) * 100).toFixed(0)),
        m3:  parseFloat((base * Math.pow(decay, 3 / 12) * 100).toFixed(0)),
        m6:  parseFloat((base * Math.pow(decay, 6 / 12) * 100).toFixed(0)),
        m12: parseFloat((base * Math.pow(decay, 12 / 12) * 100).toFixed(0)),
      };
    });
  }, [segments, dna]);

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
            implication={`All 20 segments evaluated — ${activeSegs.length} have significant population`}
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
            businessExplanation="Each axis (0–100): Demand = keyword volume + growth rate; Velocity = demand acceleration; Efficiency = conversion rate from search to revenue; Revenue = revenue density/momentum score; Accessibility = 100 minus competitive saturation. A larger coverage area means stronger market conditions for adoption."
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
          {/* Radar insight */}
          {dnaRadarData.length > 0 && (() => {
            const strong = dnaRadarData.filter(d => d.value >= 60);
            const weak   = dnaRadarData.filter(d => d.value < 30);
            const avgCoverage = dnaRadarData.reduce((s, d) => s + d.value, 0) / dnaRadarData.length;
            return (
              <div className="mt-3 p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Signal summary: </span>
                {strong.length > 0
                  ? <><span className="text-emerald-400 font-bold">{strong.map(d => d.subject).join(', ')}</span> are strong signals (≥60/100) supporting adoption. </>
                  : 'No signals above 60/100 — limited data from engines. '}
                {weak.length > 0
                  ? <><span className="text-red-400 font-bold">{weak.map(d => d.subject).join(', ')}</span> are weak (&lt;30/100) — run the relevant engines to improve these scores. </>
                  : ''}
                Overall signal coverage: {avgCoverage.toFixed(0)}/100
                {avgCoverage < 40 ? ' — run more engines for a complete picture.' : '.'}
              </div>
            );
          })()}

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
        <p className="text-xs text-muted-foreground mb-4">
          All 20 consumer segments are shown for every dataset. Segments with low relevance
          for this product have smaller population but are still evaluated — showing
          exactly how this product performs across every buyer type. Click any segment for a detailed profile.
        </p>
        {/* All 20 segments — no search/sort/filter */}
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
            {/* Stronger trait insight */}
            {traitRadarData.length > 0 && (() => {
              const sorted = [...traitRadarData].sort((a, b) => b.value - a.value);
              const top3 = sorted.slice(0, 3);
              const bottom2 = sorted.slice(-2);
              // Segments most responsible for top traits
              const topTraitKeys = top3.map(t =>
                Object.keys(TRAIT_LABELS).find(k => TRAIT_LABELS[k] === t.subject) ?? ''
              );
              const topSegsByTrait = activeSegs
                .filter(s => topTraitKeys.some(k => ((s.dominant_traits as any)?.[k] ?? 0) > 0.55))
                .sort((a, b) => {
                  const aScore = topTraitKeys.reduce((sum, k) => sum + ((a.dominant_traits as any)?.[k] ?? 0), 0);
                  const bScore = topTraitKeys.reduce((sum, k) => sum + ((b.dominant_traits as any)?.[k] ?? 0), 0);
                  return bScore - aScore;
                })
                .slice(0, 3);

              // Messaging implication
              const topNames = top3.map(t => t.subject);
              const hasQuality = topNames.includes('Quality');
              const hasBudget = topNames.includes('Budget') || topNames.includes('Price');
              const hasPremium = topNames.includes('Premium');
              const hasConvenience = topNames.includes('Convenience');
              const hasTrend = topNames.includes('Trend');

              let messagingAdvice = '';
              if (hasQuality && hasBudget) messagingAdvice = 'This market values quality but is price-conscious. Messaging should emphasize durable value — the product delivers quality without excess cost.';
              else if (hasPremium && hasQuality) messagingAdvice = 'Premium and quality traits dominate. Lead with craftsmanship, materials, and brand authority. Price justification messaging performs well here.';
              else if (hasConvenience && hasBudget) messagingAdvice = 'Convenience and budget-sensitivity are the dominant traits. Lead with ease-of-purchase, fast delivery, and value-for-money messaging.';
              else if (hasTrend) messagingAdvice = 'Trend-following is a dominant trait. Use social proof, bestseller positioning, and trending/popular badges to capture these buyers quickly.';
              else messagingAdvice = `Messaging should focus on the top trait signals: ${topNames.slice(0, 2).join(' and ')}, as these drive the highest-converting segments.`;

              return (
                <div className="mt-3 p-4 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground space-y-2">
                  <p>
                    <span className="font-bold text-foreground">Top 3 traits: </span>
                    {top3.map(t => (
                      <span key={t.subject} className="inline-flex items-center gap-1 mr-2">
                        <span className="text-primary font-bold">{t.subject}</span>
                        <span className="font-mono text-muted-foreground">({t.value.toFixed(0)}/100)</span>
                      </span>
                    ))}
                  </p>
                  <p>
                    <span className="font-bold text-foreground">Weakest traits: </span>
                    {bottom2.map(t => (
                      <span key={t.subject} className="inline-flex items-center gap-1 mr-2">
                        <span className="text-red-400 font-bold">{t.subject}</span>
                        <span className="font-mono text-muted-foreground">({t.value.toFixed(0)}/100)</span>
                      </span>
                    ))}
                    {' '}<span className="text-muted-foreground">— segments driven by these traits are harder to convert in this market.</span>
                  </p>
                  {topSegsByTrait.length > 0 && (
                    <p>
                      <span className="font-bold text-foreground">Segments driving top traits: </span>
                      <span className="text-primary">{topSegsByTrait.map(s => s.cluster_name).join(', ')}</span>
                    </p>
                  )}
                  <p>
                    <span className="font-bold text-foreground">Messaging implication: </span>
                    {messagingAdvice}
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Segment Opportunity Quadrant — Ranking Table */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-1">Segment Opportunity Quadrant</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Each segment ranked by opportunity score (intent × population share ÷ resistance). 
              Quadrant shows strategic priority — act on Priority first, Fix Barriers second.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-3 py-2 font-bold text-muted-foreground">Segment</th>
                    <th className="text-center px-2 py-2 font-bold text-muted-foreground">Adoption</th>
                    <th className="text-center px-2 py-2 font-bold text-muted-foreground">Resistance</th>
                    <th className="text-center px-2 py-2 font-bold text-muted-foreground">Opp. Score</th>
                    <th className="text-center px-2 py-2 font-bold text-muted-foreground">Quadrant</th>
                  </tr>
                </thead>
                <tbody>
                  {[...activeSegs]
                    .map((s) => {
                      const adoption = adoptionRate(s);
                      const resistance = s.resistance?.resistance_index || 0;
                      const oppScore = parseFloat(((adoption * (s.percentage || 0.1)) / Math.max(resistance, 1)).toFixed(2));
                      const quadrant =
                        adoption >= 45 && resistance < 45 ? 'Priority' :
                        adoption >= 45 && resistance >= 45 ? 'Fix Barriers' :
                        adoption < 45 && resistance < 45  ? 'Nurture' : 'Low Priority';
                      return { s, adoption, resistance, oppScore, quadrant };
                    })
                    .sort((a, b) => b.oppScore - a.oppScore)
                    .slice(0, 12)
                    .map(({ s, adoption, resistance, oppScore, quadrant }) => (
                      <tr
                        key={s.cluster_name}
                        className="border-b border-border/20 hover:bg-muted/10 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedSegmentName(s.cluster_name);
                          setModal(buildSegmentModal(s));
                        }}
                      >
                        <td className="px-3 py-2 font-medium truncate max-w-[130px]">{s.cluster_name}</td>
                        <td className={cn('px-2 py-2 text-center font-mono font-bold', heatCell(adoption))}>
                          {adoption.toFixed(1)}%
                        </td>
                        <td className={cn('px-2 py-2 text-center font-mono font-bold',
                          resistance >= 70 ? 'bg-red-500/10 text-red-400' :
                          resistance >= 50 ? 'bg-orange-500/10 text-orange-400' :
                          resistance >= 30 ? 'bg-amber-500/10 text-amber-400' :
                          'bg-emerald-500/10 text-emerald-400')}>
                          {resistance.toFixed(0)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-primary font-bold">{oppScore}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                            quadrant === 'Priority'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            quadrant === 'Fix Barriers' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            quadrant === 'Nurture'      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                          'bg-muted text-muted-foreground border-border/40',
                          )}>
                            {quadrant}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {/* Insight */}
            {activeSegs.length > 0 && (() => {
              const ranked = [...activeSegs].map((s) => {
                const adoption = adoptionRate(s);
                const resistance = s.resistance?.resistance_index || 0;
                const quadrant =
                  adoption >= 45 && resistance < 45 ? 'Priority' :
                  adoption >= 45 && resistance >= 45 ? 'Fix Barriers' :
                  adoption < 45 && resistance < 45  ? 'Nurture' : 'Low Priority';
                return { s, adoption, resistance, quadrant };
              });
              const priority = ranked.filter(r => r.quadrant === 'Priority');
              const fixBarriers = ranked.filter(r => r.quadrant === 'Fix Barriers');
              return (
                <div className="mt-3 p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Action: </span>
                  {priority.length > 0
                    ? <><span className="text-emerald-400 font-bold">{priority.map(r => r.s.cluster_name).slice(0, 2).join(', ')}</span> are your Priority segments — high adoption, low resistance. Allocate primary ad budget here.</>
                    : 'No easy-win priority segments found — focus on barrier reduction across the board.'}
                  {fixBarriers.length > 0 && <>{' '}<span className="text-amber-400 font-bold">{fixBarriers.map(r => r.s.cluster_name).slice(0, 2).join(', ')}</span> have high intent but face barriers — fix their primary blocker for a quick lift.</>}
                  {' '}Opp. Score = (Adoption % × Population Share) ÷ Resistance Index.
                </div>
              );
            })()}
          </div>
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5: Adoption Simulation Matrix — Top 7 Strategic Segments
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="5. Adoption Simulation Matrix">
        <p className="text-xs text-muted-foreground mb-4">
          Showing the 7 most strategically important segments for this product — ranked by
          adoption potential, population size, and revenue fit. Click any row for a detailed
          profile and business recommendations.
        </p>
        <Card className="border-border/40">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle>Segment × Metric Heatmap</CardTitle>
                <CardDescription>
                  Top 7 strategic segments by adoption potential
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
                  {matrixSegments.map((seg) => (
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
                      {/* Switching prob: HIGH switching = BAD (red), LOW = good (green) — inverted */}
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold',
                        seg.switching_probability > 0.6 ? 'bg-red-500/10 text-red-400' :
                        seg.switching_probability > 0.4 ? 'bg-amber-500/15 text-amber-400' :
                        seg.switching_probability > 0.2 ? 'bg-emerald-500/15 text-emerald-400' :
                        'bg-emerald-500/20 text-emerald-400')}>
                        {(seg.switching_probability * 100).toFixed(1)}%
                      </td>
                      {/* Resistance: HIGH = bad (red), LOW = good (green) */}
                      <td className={cn(
                        'px-3 py-2.5 text-center font-mono font-bold',
                        (seg.resistance?.resistance_index || 0) >= 70 ? 'bg-red-500/10 text-red-500' :
                        (seg.resistance?.resistance_index || 0) >= 50 ? 'bg-orange-500/10 text-orange-500' :
                        (seg.resistance?.resistance_index || 0) >= 30 ? 'bg-amber-500/10 text-amber-500' :
                        'bg-emerald-500/10 text-emerald-500',
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
          {/* Horizontal barrier bar chart — easier to read than cramped stacked */}
          <div>
            <ChartContainer
              title="Average Resistance by Barrier Type"
              description="How strong each barrier is across all active segments — ranked highest to lowest"
              xAxisLabel="Average Score (0–100)"
              yAxisLabel=""
              businessExplanation="Higher bars = stronger blockers to purchase. Red/orange = most critical. The tallest bar is the primary barrier slowing adoption for this product in this market."
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={barrierAverages}
                  layout="vertical"
                  margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avg" name="Avg Score" radius={[0, 4, 4, 0]}>
                    {barrierAverages.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            {barrierAverages.length > 0 && (
              <div className="mt-3 p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Top barrier: </span>
                <span className="text-red-400 font-bold">{barrierAverages[0]?.name}</span>
                {' '}({barrierAverages[0]?.avg}/100) is the dominant resistance force for this product.
                Resolving it should be the first priority in marketing and product positioning.
              </div>
            )}
          </div>

          {/* Barrier cards with business meaning */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              What Each Barrier Means for This Product
            </h3>
            {[
              {
                label: 'Habit Lock-In',
                key: 'habit_lock_in' as const,
                color: '#EF4444',
                meaning: 'Consumers are locked in existing purchase routines. High scores mean they need a compelling, low-risk reason to switch — your product must differentiate clearly from what they already use.',
                actionHigh: 'Add a side-by-side comparison chart against the top 2 alternatives currently in the market. Highlight specific advantages in features, price/oz, or shelf life.',
                actionMed: 'Create a "Why switch?" section in the product listing. Use trial size or starter pack to lower perceived risk of changing.',
                actionLow: 'Reinforce convenience and habit fit in copy — remind buyers this replaces what they already do, just better.',
              },
              {
                label: 'Trust Barrier',
                key: 'trust_barrier' as const,
                color: '#EAB308',
                meaning: 'Consumers are skeptical before their first purchase. In this category, trust is built through social proof, brand history, certifications, and detailed product transparency.',
                actionHigh: 'Add 3–5 review snippets directly addressing top purchase objections above the fold. Include seller tenure, total review count, and any certifications in bullet points.',
                actionMed: 'Surface your return policy and any guarantees prominently near the purchase button. Add a Q&A section addressing the 3 most common buyer concerns.',
                actionLow: 'Maintain review quality and respond to 1-2 star reviews publicly — visible responses improve trust signals for fence-sitters.',
              },
              {
                label: 'Price Resistance',
                key: 'price_resistance' as const,
                color: '#8B5CF6',
                meaning: 'Price is a blocker for a meaningful share of consumers. This does not mean you must lower price — it means the value proposition needs to be more visible relative to the cost.',
                actionHigh: 'Create a bundle offer (product + accessory) priced at 85% of individual total. Add a cost-per-use or cost-per-day metric in bullet points to reframe the price.',
                actionMed: 'Use Subscribe & Save if applicable. Add a "Compared to alternatives: X more uses per unit" claim in the listing.',
                actionLow: 'Emphasize quantity, longevity, or quality proof in copy. Show premium ingredient or material credentials to justify the current price.',
              },
              {
                label: 'Competitor Loyalty',
                key: 'competitor_loyalty' as const,
                color: '#F97316',
                meaning: 'Consumers have strong existing relationships with competitor brands. Breaking loyalty requires a clear, memorable advantage — not just "as good as" the alternative.',
                actionHigh: 'Lead with a single differentiating claim that a competitor cannot easily copy (exclusive ingredient, unique form factor, certified claim). Run a conquest campaign targeting competitor brand search terms.',
                actionMed: 'Target the gap in competitor reviews — find the most common complaint about the top brand and make that your positioning hook.',
                actionLow: 'Maintain competitive pricing and review quality so switchers who try your product stay. Price-parity is the minimum bar for loyalty-switching categories.',
              },
              {
                label: 'Product Complexity',
                key: 'product_complexity' as const,
                color: '#3B82F6',
                meaning: 'The product category or use-case feels confusing to buyers. Too many options, unclear specifications, or jargon in listings drive abandonment before purchase.',
                actionHigh: 'Add a simplified "What it does in one sentence" line at the top of bullet points. Create a selection guide: "If you need X, choose this. If you need Y, choose that."',
                actionMed: 'Replace specification-heavy copy with outcome-based language. "Covers 500 sq ft in 2 coats" beats "high viscosity formula with 40% solids."',
                actionLow: 'Add infographics or a comparison table to the A+ content section. Visual comparisons reduce perceived complexity without changing the copy.',
              },
              {
                label: 'Education Required',
                key: 'education_requirement' as const,
                color: '#10B981',
                meaning: 'Buyers need to understand what the product does and why they need it before purchasing. High education requirements indicate a knowledge gap that must be bridged before intent can convert.',
                actionHigh: 'Create a 60-second how-to video as the first product image. Add a "Frequently Bought Together" educational FAQ in the listing. Target long-tail informational keywords in PPC.',
                actionMed: 'Add a "How to use in 3 steps" graphic to images. Explicitly answer "Who is this for?" and "What problem does it solve?" in bullet points.',
                actionLow: 'Include one testimonial that describes the before/after use-case scenario. Real-world context bridges the education gap naturally.',
              },
            ].map((b) => {
              const avg = activeSegs.length
                ? activeSegs.reduce((sum, s) => sum + (s.resistance?.[b.key] || 0), 0) / activeSegs.length
                : 0;
              const level = avg >= 65 ? 'High' : avg >= 40 ? 'Moderate' : 'Low';
              // Find top 3 segments most affected by this barrier
              const topAffected = [...activeSegs]
                .sort((a, b2) => (b2.resistance?.[b.key] || 0) - (a.resistance?.[b.key] || 0))
                .slice(0, 3)
                .map(s => s.cluster_name);

              // Signals from DNA that caused this barrier score
              const sourceSig = {
                habit_lock_in: 'brand_loyalty + switching_cost + HHI score',
                trust_barrier: 'risk_aversion + conversion_efficiency + friction keywords',
                price_resistance: 'price_focused + budget_sensitivity + price spread',
                competitor_loyalty: 'brand_loyalty + brand_dominance_top1',
                product_complexity: 'risk_aversion + HHI fragmentation + convenience_focused',
                education_requirement: 'conversion_efficiency + risk_aversion + base floor',
              }[b.key] ?? 'multiple dataset signals';

              const actionText = level === 'High' ? b.actionHigh : level === 'Moderate' ? b.actionMed : b.actionLow;

              // Adoption and revenue impact estimate
              const adoptionImpact = avg >= 65 ? 'High impact on adoption — removing this barrier unlocks significant conversion uplift.' :
                avg >= 40 ? 'Moderate impact — reducing this barrier will meaningfully improve conversion for affected segments.' :
                'Low impact — this barrier is manageable and unlikely to block a majority of buyers.';

              return (
                <Card key={b.label} className="border-border/30 bg-card">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-foreground">{b.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded',
                          level === 'High' ? 'bg-red-500/10 text-red-400' :
                          level === 'Moderate' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-emerald-500/10 text-emerald-400',
                        )}>{level}</span>
                        <span className="font-mono font-bold" style={{ color: b.color }}>{avg.toFixed(1)}/100</span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${avg}%`, backgroundColor: b.color, opacity: 0.8 }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mb-1.5">{b.meaning}</p>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      <span className="font-bold text-foreground">Source signals: </span>{sourceSig}
                    </p>
                    {topAffected.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mb-1">
                        <span className="font-bold text-foreground">Most affected: </span>
                        {topAffected.join(' · ')}
                      </p>
                    )}
                    <p className="text-[10px] text-amber-400/90 mb-1.5">{adoptionImpact}</p>
                    <p className="text-[10px] text-primary leading-relaxed">
                      <span className="font-bold">Specific action: </span>{actionText}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </PageSection>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 7: Revenue Lift Estimator (Top 5 only)
      ═══════════════════════════════════════════════════════════════════ */}
      <PageSection title="7. Revenue Lift Estimator">
        <ChartContainer
          title="Top 5 Revenue Lift Opportunities"
          description="Current adoption vs. potential adoption for highest-opportunity segments"
          xAxisLabel="Segment"
          yAxisLabel="Purchase Intent"
          businessExplanation="The purple bar shows the untapped adoption gap for each of the top 5 segments by revenue opportunity. These are the segments where barrier reduction has the highest revenue return."
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

        {/* Enhanced insight text */}
        {liftRows.length > 0 && (() => {
          const topSeg = liftRows[0];
          const sortedByRev = [...liftRows].sort((a, b) => b.revOpp - a.revOpp);
          const hardestSeg = [...liftRows].sort((a, b) =>
            (b.seg.resistance?.resistance_index || 0) - (a.seg.resistance?.resistance_index || 0)
          )[0];
          const fastestWin = [...liftRows].sort((a, b) =>
            (a.seg.resistance?.resistance_index || 0) - (b.seg.resistance?.resistance_index || 0)
          )[0];
          // Check if Price Resistance really dominates across all 5 or just some
          const priceResCount = liftRows.filter(r => r.dominantBarrier === 'Price Resistance').length;
          const barrierDiversityNote = priceResCount === liftRows.length
            ? 'Price resistance is the dominant blocker across all top segments — this market is highly price-sensitive.'
            : priceResCount === 0
            ? 'Price resistance is not the primary blocker — each segment has a unique barrier. Targeted lever strategies are more effective than blanket discounting.'
            : `${priceResCount} of ${liftRows.length} segments are primarily blocked by price; the rest have other barriers.`;

          return (
            <div className="mt-4 p-4 bg-muted/20 border border-border/40 rounded-xl text-sm text-muted-foreground space-y-2">
              <p>
                <span className="font-bold text-foreground">Highest upside: </span>
                <span className="text-primary font-bold">{topSeg.seg.cluster_name}</span>
                {' '}has the largest revenue lift potential
                {topSeg.revOpp > 0 ? ` (~${fmtCurrency(topSeg.revOpp)})` : ''}.
                {' '}Main blocker: <span className="text-amber-400 font-bold">{topSeg.dominantBarrier}</span>.
                {' '}This segment represents{' '}
                <span className="font-bold text-foreground">{topSeg.seg.percentage?.toFixed(1)}%</span> of the simulated market — making it the highest-priority target for barrier reduction.
              </p>
              {fastestWin.seg.cluster_name !== topSeg.seg.cluster_name && (
                <p>
                  <span className="font-bold text-foreground">Fastest win: </span>
                  <span className="text-emerald-400 font-bold">{fastestWin.seg.cluster_name}</span>
                  {' '}has the lowest resistance ({fastestWin.seg.resistance?.resistance_index?.toFixed(0) ?? '—'}/100) — easiest to convert with minimal intervention.
                  {' '}Barrier: <span className="text-amber-400 font-bold">{fastestWin.dominantBarrier}</span>.
                </p>
              )}
              {hardestSeg.seg.cluster_name !== topSeg.seg.cluster_name && (
                <p>
                  <span className="font-bold text-foreground">Hardest to unlock: </span>
                  <span className="text-red-400 font-bold">{hardestSeg.seg.cluster_name}</span>
                  {' '}({hardestSeg.seg.resistance?.resistance_index?.toFixed(0) ?? '—'}/100 resistance) — deprioritize until primary segments are captured.
                </p>
              )}
              <p className="text-xs">{barrierDiversityNote}</p>
              <p className="text-xs">
                <span className="font-bold text-foreground">First action: </span>
                Resolve {topSeg.dominantBarrier} for {topSeg.seg.cluster_name} — this single move unlocks the largest revenue opportunity in the simulation.
              </p>
            </div>
          );
        })()}

        {/* Lift table — top 5 only, click rows for modal */}
        <Card className="border-border/40 mt-5">
          <CardHeader>
            <CardTitle className="text-sm">Top 5 Revenue Lift Opportunities — Click Any Row for Details</CardTitle>
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
                {liftRows.map(({ seg, potential, lift, revOpp, dominantBarrier }, i) => (
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
                    <td className="px-3 py-2.5 text-muted-foreground">{dominantBarrier}</td>
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
          {' '}<span className="font-medium text-foreground">{productTypeLabel.note}</span>
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
              <div className="mt-3 p-4 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground space-y-2">
                {/* Product type and category */}
                <p>
                  <span className="font-bold text-foreground">Product type detected: </span>
                  <span className="text-primary font-bold capitalize">{productTypeLabel.type}</span>
                  {' '}(based on price midpoint ${((dna?.market_price_floor ?? 5) + (dna?.market_price_ceiling ?? 50)) / 2 | 0}).
                </p>
                {/* Curve reading */}
                <p>
                  <span className="font-bold text-foreground">Retention curve: </span>
                  Starts at {retentionData[0]?.retention?.toFixed(0)}% (Month 1), drops to{' '}
                  {retentionData[1]?.retention?.toFixed(0)}% (Month 3) and{' '}
                  {retentionData[3]?.retention?.toFixed(0)}% (Month 12).
                  {(() => {
                    const m1 = retentionData[0]?.retention ?? 0;
                    const m3 = retentionData[1]?.retention ?? 0;
                    const m12 = retentionData[3]?.retention ?? 0;
                    const earlyDrop = m1 > 0 ? (m1 - m3) / m1 : 0;
                    if (earlyDrop > 0.4) return ' High M1→M3 churn — the 30-day window is critical. Most buyers who will churn do so before Month 3.';
                    if (earlyDrop < 0.15) return ' Flat curve through M3 — strong early retention. The product is forming purchase habits quickly.';
                    return ' Moderate early drop — typical for this product type. M3 engagement campaigns reduce churn significantly.';
                  })()}
                </p>
                {/* Product-type specific guidance */}
                <p>
                  {productTypeLabel.type === 'consumable'
                    ? 'Consumable product — repeat purchase is naturally high if the product satisfies. Focus on Subscribe & Save enrollment during the M1 window and replenishment reminder emails at M2.'
                    : productTypeLabel.type === 'durable'
                    ? 'Durable or high-priced product — repeat purchase of the same item is limited by nature. M6+ retention should come from accessories, replacements, gifting, or cross-sell. Referral programs work well here.'
                    : productTypeLabel.type === 'premium'
                    ? 'Premium product — repeat purchase builds over a longer cycle driven by satisfaction and brand trust. Post-purchase experience (packaging, support, follow-up) directly drives M6 and M12 retention.'
                    : 'Mass-market product — repeat purchase depends on convenience, satisfaction, and whether competitors offer a better alternative. Price and availability are the main retention levers at M6+.'}
                </p>
                {/* Segment retention differences */}
                {(() => {
                  const sorted = [...segmentRetentionData].filter(s => s.population > 0).sort((a, b) => b.m12 - a.m12);
                  const topRetainers = sorted.slice(0, 2);
                  const poorRetainers = sorted.reverse().slice(0, 2);
                  if (topRetainers.length === 0) return null;
                  return (
                    <p>
                      <span className="font-bold text-foreground">Segment differences: </span>
                      <span className="text-emerald-400">{topRetainers.map(s => s.name.split(' ').slice(0, 2).join(' ')).join(', ')}</span>
                      {' '}have the strongest M12 retention ({topRetainers.map(s => `${s.m12}%`).join(', ')}) due to higher brand loyalty and lower switching probability.{' '}
                      <span className="text-red-400">{poorRetainers.map(s => s.name.split(' ').slice(0, 2).join(' ')).join(', ')}</span>
                      {' '}are most likely to churn ({poorRetainers.map(s => `${s.m12}%`).join(', ')}) — re-engagement at M1 is essential for these groups.
                    </p>
                  );
                })()}
                {/* Action */}
                <p>
                  <span className="font-bold text-foreground">Key action: </span>
                  {retentionData[3]?.retention > 35
                    ? 'Loyalty is reasonably strong. Invest in post-purchase email flows and loyalty rewards to push M12 retention above current levels.'
                    : 'Retention drops significantly. Prioritize a post-purchase follow-up sequence — insert card in packaging, 30-day check-in email, and an M2 repurchase coupon.'}
                </p>
              </div>
            )}
          </div>

          {/* Cohort Heatmap — all 20 segments, product-type-aware */}
          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="text-sm">Retention Cohort Heatmap — All 20 Segments</CardTitle>
              <CardDescription>
                Product-type-aware repeat purchase rate by psychographic segment at each horizon.
                Values vary by segment loyalty, risk aversion, and product price tier.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground">Segment</th>
                      <th className="text-center px-2 py-2.5 font-bold text-muted-foreground">Pop.</th>
                      {['M1', 'M3', 'M6', 'M12'].map((m) => (
                        <th key={m} className="text-center px-3 py-2.5 font-bold text-muted-foreground">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segmentRetentionData.map((row) => (
                      <tr key={row.name} className={cn('border-b border-border/20', row.population === 0 && 'opacity-50')}>
                        <td className="px-3 py-2 font-medium truncate max-w-[140px]" title={row.name}>
                          {row.name}
                          {row.population === 0 && <span className="text-[9px] text-muted-foreground ml-1">(min pop)</span>}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-muted-foreground">{row.population}</td>
                        {[row.m1, row.m3, row.m6, row.m12].map((val, i) => (
                          <td key={i} className={cn('px-3 py-2 text-center font-mono font-bold', heatCell(val))}>
                            {val}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-border/40 text-[10px] text-muted-foreground bg-muted/10 space-y-1.5">
                <p>
                  <span className="font-bold text-foreground">How this works: </span>
                  Values = segment conversion probability × product-type decay^(month/12) × 100.
                  Decay is adjusted by brand loyalty, risk aversion, and price tier
                  ({productTypeLabel.type} product — decay modifier applied).
                </p>
                {(() => {
                  const sorted = [...segmentRetentionData].filter(s => s.population > 0).sort((a, b) => b.m12 - a.m12);
                  const top2 = sorted.slice(0, 2);
                  const bottom2 = sorted.reverse().slice(0, 2);
                  return (
                    <>
                      {top2.length > 0 && (
                        <p>
                          <span className="font-bold text-foreground">Strongest M12 retention: </span>
                          <span className="text-emerald-400">{top2.map(s => `${s.name.split(' ').slice(0, 2).join(' ')} (${s.m12}%)`).join(', ')}</span>
                          {' '}— driven by higher brand loyalty and lower switching probability in these segments.
                        </p>
                      )}
                      {bottom2.length > 0 && (
                        <p>
                          <span className="font-bold text-foreground">Fastest decline: </span>
                          <span className="text-red-400">{bottom2.map(s => `${s.name.split(' ').slice(0, 2).join(' ')} (${s.m12}%)`).join(', ')}</span>
                          {' '}— low brand loyalty and high switching probability accelerate churn. Re-engagement campaigns at M1 are critical.
                        </p>
                      )}
                    </>
                  );
                })()}
                <p>
                  <span className="font-bold text-foreground">Business action: </span>
                  {productTypeLabel.type === 'consumable'
                    ? 'Target top-retaining segments with Subscribe & Save offers at M1. For fast-churning segments, send a repurchase reminder at 3–4 weeks.'
                    : productTypeLabel.type === 'durable'
                    ? 'For high-churn segments, activate cross-sell and accessory paths at M3. For top-retaining segments, invest in referral programs.'
                    : 'Invest in post-purchase email flows for top-retaining segments. Offer loyalty discounts to mid-retention segments at M3.'}
                </p>
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
