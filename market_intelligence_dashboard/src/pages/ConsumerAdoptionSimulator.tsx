import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useQuery as useStatusQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICard';
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ScatterChart, Scatter, LineChart, Line, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  Users, TrendingUp, TrendingDown, AlertCircle, Brain,
  Target, DollarSign, Zap, Activity, BarChart2, Shield,
  Search, ArrowUpDown, ChevronDown, ChevronUp, Info,
  Rocket, MapPin, Layers, Clock, CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Type definitions ────────────────────────────────────────────────────────

interface DominantTraits {
  quality_focused: number;
  convenience_focused: number;
  price_focused: number;
  trend_focused: number;
  risk_aversion: number;
  health_conscious: number;
  sustainability_conscious: number;
  budget_sensitivity: number;
  premium_willingness: number;
  switching_cost: number;
  brand_loyalty: number;
}

interface ChannelScores {
  Amazon: number;
  D2C: number;
  Retail: number;
  'Social Commerce': number;
}

interface ResistanceData {
  habit_lock_in: number;
  competitor_loyalty: number;
  trust_barrier: number;
  price_resistance: number;
  product_complexity: number;
  education_requirement: number;
  resistance_index: number;
  resistance_level: string;
  primary_barrier: string;
  recommended_approach: string;
}

interface Segment {
  cluster_id: number;
  cluster_name: string;
  population: number;
  percentage: number;
  purchase_intent: number;
  conversion_probability: number;
  trust_score: number;
  emotional_resonance: number;
  switching_probability: number;
  channel_preference: string;
  channel_scores: ChannelScores;
  resistance: ResistanceData;
  motivations?: string[];
  objections?: string[];
  dominant_traits?: DominantTraits;
  primary_theme?: string;
}

interface PopulationSummary {
  total_consumers: number;
  num_psychographic_segments: number;
  avg_purchase_intent: number;
  avg_conversion_probability: number;
  avg_trust_score: number;
  avg_emotional_resonance: number;
  avg_resistance_index: number;
  dominant_channel: string;
  channel_distribution: Record<string, number>;
}

interface MarketDNA {
  demand_score: number | null;
  demand_velocity: number | null;
  total_search_volume: number | null;
  hhi_score: number | null;
  competitive_saturation: number | null;
  conversion_efficiency: number | null;
  recoverable_revenue: number | null;
  revenue_density: number | null;
  market_price_floor: number | null;
  market_price_ceiling: number | null;
  completeness_score: number;
}

interface SimResults {
  population_summary: PopulationSummary;
  market_dna: MarketDNA;
  psychographic_segments: Segment[];
  high_intent_segments: Segment[];
  critical_resistance_segments: any[];
  data_completeness: Record<string, boolean>;
  completeness_score: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(digits)}%`;
}
function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString();
}
function fmtScore(v: number | null | undefined, max = 100): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}/${max}`;
}

function resistanceColor(level: string): string {
  if (level === 'Critical') return 'text-red-500';
  if (level === 'High') return 'text-orange-500';
  if (level === 'Medium') return 'text-amber-500';
  return 'text-emerald-500';
}

function resistanceBg(level: string): string {
  if (level === 'Critical') return 'bg-red-500/10 border-red-500/20';
  if (level === 'High') return 'bg-orange-500/10 border-orange-500/20';
  if (level === 'Medium') return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-emerald-500/10 border-emerald-500/20';
}

function intentColor(score: number): string {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function heatCell(val: number, max = 100): string {
  const pct = val / max;
  if (pct >= 0.75) return 'bg-emerald-500/20 text-emerald-400';
  if (pct >= 0.5)  return 'bg-amber-500/15 text-amber-400';
  if (pct >= 0.25) return 'bg-orange-500/15 text-orange-400';
  return 'bg-red-500/10 text-red-400';
}

function ProgressBar({ value, max = 100, colorClass = 'bg-primary' }: { value: number; max?: number; colorClass?: string }) {
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
          {p.name}: <span className="font-mono font-bold">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreGauge({ label, value, max = 100, color = '#8B5CF6' }: { label: string; value: number; max?: number; color?: string }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${(pct / 100) * 163.4} 163.4`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-black font-mono" style={{ color }}>{value.toFixed(0)}</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center leading-tight max-w-[60px]">{label}</p>
    </div>
  );
}

function SegmentCard({ seg, index, onClick, selected }: { seg: Segment; index: number; onClick: () => void; selected: boolean }) {
  const color = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
  return (
    <motion.div whileHover={{ y: -2 }} onClick={onClick}
      className={cn('cursor-pointer rounded-xl border p-4 transition-all', selected ? 'border-primary/60 bg-primary/5 shadow-md' : 'border-border/50 bg-card hover:border-primary/30 hover:shadow-sm')}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <h4 className="text-sm font-bold text-foreground leading-tight">{seg.cluster_name}</h4>
        </div>
        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', resistanceBg(seg.resistance?.resistance_level || 'Low'))}>
          {seg.resistance?.resistance_level || '—'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
        <div><span className="text-muted-foreground">Population</span><p className="font-bold font-mono">{fmtNum(seg.population)}</p></div>
        <div><span className="text-muted-foreground">Share</span><p className="font-bold font-mono">{fmtPct(seg.percentage)}</p></div>
        <div><span className="text-muted-foreground">Intent</span>
          <p className={cn('font-bold font-mono', intentColor(seg.purchase_intent))}>{fmtScore(seg.purchase_intent)}</p>
        </div>
        <div><span className="text-muted-foreground">Conversion</span><p className="font-bold font-mono">{fmtPct(seg.conversion_probability * 100)}</p></div>
      </div>
      <ProgressBar value={seg.purchase_intent} colorClass="bg-primary" />
      <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
        Primary: <span className="font-medium text-foreground">{seg.channel_preference}</span>
      </p>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConsumerAdoptionSimulator() {
  const { data: statusData } = useStatusQuery({ queryKey: ['status'], queryFn: api.getStatus });
  const categoryScope = statusData?.data?.category_scope || {};
  const categoryKey = statusData?.data?.category_scope?.selected_categories?.join('|') || 'all';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['consumer-adoption-simulator', categoryKey],
    queryFn: () => api.runConsumerAdoptionSimulator(1000, categoryScope),
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !!statusData,
  });

  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [clusterSearch, setClusterSearch] = useState('');
  const [clusterSort, setClusterSort] = useState<'intent' | 'conversion' | 'population' | 'resistance'>('intent');
  const [clusterFilter, setClusterFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [matrixSort, setMatrixSort] = useState<'intent' | 'conversion' | 'trust' | 'resistance'>('intent');

  const r = useMemo<SimResults | null>(() => {
    const d = data?.data?.results;
    if (!d || !d.population_summary) return null;
    return d as SimResults;
  }, [data]);

  const segments = useMemo(() => r?.psychographic_segments || [], [r]);
  const summary = useMemo(() => r?.population_summary, [r]);
  const dna = useMemo(() => r?.market_dna as MarketDNA | null, [r]);

  // Derived KPIs
  const expectedAdoptionRate = useMemo(() => {
    if (!summary) return null;
    return summary.avg_purchase_intent;
  }, [summary]);

  const predictedRevenueCapture = useMemo(() => {
    if (!summary || !dna) return null;
    const recov = dna.recoverable_revenue || 0;
    return recov * (summary.avg_conversion_probability);
  }, [summary, dna]);

  const highestSeg = useMemo(() => segments.reduce<Segment | null>((best, s) =>
    !best || s.purchase_intent > best.purchase_intent ? s : best, null), [segments]);

  const lowestSeg = useMemo(() => segments.reduce<Segment | null>((worst, s) =>
    !worst || s.purchase_intent < worst.purchase_intent ? s : worst, null), [segments]);

  const revenueLift = useMemo(() => {
    if (!dna?.recoverable_revenue || !summary) return null;
    return dna.recoverable_revenue * summary.avg_conversion_probability * 1.4;
  }, [dna, summary]);

  // Filtered clusters
  const filteredSegments = useMemo(() => {
    let arr = [...segments];
    if (clusterSearch) arr = arr.filter(s => s.cluster_name.toLowerCase().includes(clusterSearch.toLowerCase()));
    if (clusterFilter === 'high') arr = arr.filter(s => s.purchase_intent >= 65);
    if (clusterFilter === 'medium') arr = arr.filter(s => s.purchase_intent >= 40 && s.purchase_intent < 65);
    if (clusterFilter === 'low') arr = arr.filter(s => s.purchase_intent < 40);
    return arr.sort((a, b) => {
      if (clusterSort === 'intent') return b.purchase_intent - a.purchase_intent;
      if (clusterSort === 'conversion') return b.conversion_probability - a.conversion_probability;
      if (clusterSort === 'population') return b.population - a.population;
      if (clusterSort === 'resistance') return (b.resistance?.resistance_index || 0) - (a.resistance?.resistance_index || 0);
      return 0;
    });
  }, [segments, clusterSearch, clusterSort, clusterFilter]);

  // Radar chart data for MarketDNA
  const dnaRadarData = useMemo(() => {
    if (!dna) return [];
    return [
      { subject: 'Demand', value: Math.min(dna.demand_score || 0, 100), fullMark: 100 },
      { subject: 'Velocity', value: Math.min(dna.demand_velocity || 0, 100), fullMark: 100 },
      { subject: 'Efficiency', value: Math.min(dna.conversion_efficiency || 0, 100), fullMark: 100 },
      { subject: 'Revenue', value: Math.min((dna.revenue_density || 0), 100), fullMark: 100 },
      { subject: 'Accessibility', value: Math.min(100 - (dna.competitive_saturation || 0), 100), fullMark: 100 },
    ];
  }, [dna]);

  // Trait distribution radar (average across all segments)
  const traitRadarData = useMemo(() => {
    if (!segments.length) return [];
    const keys = Object.keys(TRAIT_LABELS);
    return keys.map(k => {
      const avg = segments.reduce((sum, s) => sum + ((s.dominant_traits as any)?.[k] || 0), 0) / segments.length;
      return { subject: TRAIT_LABELS[k], value: parseFloat((avg * 100).toFixed(1)), fullMark: 100 };
    });
  }, [segments]);

  // Matrix sorted
  const matrixSegments = useMemo(() => [...segments].sort((a, b) => {
    if (matrixSort === 'intent') return b.purchase_intent - a.purchase_intent;
    if (matrixSort === 'conversion') return b.conversion_probability - a.conversion_probability;
    if (matrixSort === 'trust') return b.trust_score - a.trust_score;
    if (matrixSort === 'resistance') return (b.resistance?.resistance_index || 0) - (a.resistance?.resistance_index || 0);
    return 0;
  }), [segments, matrixSort]);

  // Resistance chart data
  const resistanceBarData = useMemo(() => segments.slice(0, 10).map(s => ({
    name: s.cluster_name.split(' ').slice(0, 2).join(' '),
    'Habit Lock-In': parseFloat((s.resistance?.habit_lock_in || 0).toFixed(1)),
    'Competitor Loyalty': parseFloat((s.resistance?.competitor_loyalty || 0).toFixed(1)),
    'Trust Barrier': parseFloat((s.resistance?.trust_barrier || 0).toFixed(1)),
    'Price Resistance': parseFloat((s.resistance?.price_resistance || 0).toFixed(1)),
  })), [segments]);

  // Revenue lift simulation data
  const liftData = useMemo(() => segments.slice(0, 8).map(s => ({
    name: s.cluster_name.split(' ').slice(0, 2).join(' '),
    current: parseFloat(s.purchase_intent.toFixed(1)),
    potential: parseFloat(Math.min(100, s.purchase_intent + (s.resistance?.resistance_index || 20) * 0.4).toFixed(1)),
    gap: parseFloat((Math.min(100, s.purchase_intent + (s.resistance?.resistance_index || 20) * 0.4) - s.purchase_intent).toFixed(1)),
  })), [segments]);

  // Repeat purchase forecast (synthetic retention curve from adoption data)
  const retentionData = useMemo(() => {
    if (!summary) return [];
    const base = summary.avg_conversion_probability;
    const loyalty = segments.reduce((sum, s) => sum + ((s.dominant_traits as any)?.brand_loyalty || 0.4), 0) / Math.max(segments.length, 1);
    return [1, 3, 6, 12].map(month => ({
      month: `M${month}`,
      retention: parseFloat((base * Math.pow(0.7 + loyalty * 0.3, month / 12) * 100).toFixed(1)),
      cumulative: parseFloat((base * (1 - Math.pow(0.7 + loyalty * 0.3, month / 12)) / (1 - (0.7 + loyalty * 0.3)) * 100 / 12).toFixed(1)),
    }));
  }, [summary, segments]);

  // Channel distribution
  const channelData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.channel_distribution || {}).map(([name, value]) => ({ name, value }));
  }, [summary]);

  // Launch scenarios
  const launchScenarios = useMemo(() => {
    if (!summary || !dna) return [];
    const base = summary.avg_conversion_probability;
    const intent = summary.avg_purchase_intent;
    return [
      {
        name: 'Launch First',
        icon: Rocket,
        color: '#8B5CF6',
        adoption: parseFloat((intent * 1.15).toFixed(1)),
        revenue: parseFloat((base * 1.2 * 100).toFixed(1)),
        risk: 72,
        confidence: 78,
        recommended: true,
        description: 'Enter first to capture pioneer advantage before competition intensifies.',
      },
      {
        name: 'Regional Pilot',
        icon: MapPin,
        color: '#3B82F6',
        adoption: parseFloat((intent * 0.85).toFixed(1)),
        revenue: parseFloat((base * 0.9 * 100).toFixed(1)),
        risk: 35,
        confidence: 88,
        recommended: false,
        description: 'Test in one region to validate product-market fit before full rollout.',
      },
      {
        name: 'Build Category',
        icon: Layers,
        color: '#10B981',
        adoption: parseFloat((intent * 1.05).toFixed(1)),
        revenue: parseFloat((base * 1.05 * 100).toFixed(1)),
        risk: 45,
        confidence: 82,
        recommended: false,
        description: 'Invest in education and category-level awareness to grow the entire pie.',
      },
      {
        name: 'Delay Entry',
        icon: Clock,
        color: '#F59E0B',
        adoption: parseFloat((intent * 0.70).toFixed(1)),
        revenue: parseFloat((base * 0.65 * 100).toFixed(1)),
        risk: 20,
        confidence: 65,
        recommended: false,
        description: 'Wait for market maturity, risking competitive lock-out but lower initial investment.',
      },
    ];
  }, [summary, dna]);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !r) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Consumer Adoption Simulator Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">
            {data?.message || 'Run at least one analysis engine (Demand Strength, Inbound Efficiency, or Market Concentration) before running the Consumer Adoption Simulator.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="pb-16 max-w-[1400px] mx-auto">

      <PageHeader
        badge="Consumer Intelligence"
        title="Consumer Adoption Simulator"
        description={`Simulated ${fmtNum(summary?.total_consumers)} consumers across ${summary?.num_psychographic_segments} psychographic segments. Driven entirely by your uploaded market dataset.`}
      />

      {/* ── 1. Executive Summary KPIs ─────────────────────────────────────── */}
      <PageSection title="1. Executive Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Simulated Consumers"
            value={fmtNum(summary?.total_consumers)}
            implication={`${summary?.num_psychographic_segments} psychographic segments identified`}
            icon={Users}
            confidence={Math.round(r.completeness_score)}
          />
          <KPICard
            label="Expected Adoption Rate"
            value={fmtPct(expectedAdoptionRate)}
            implication="Average purchase intent across all segments"
            icon={TrendingUp}
            confidence={82}
          />
          <KPICard
            label="Avg Conversion Probability"
            value={fmtPct((summary?.avg_conversion_probability || 0) * 100)}
            implication="Expected conversion across all psychographic segments"
            icon={Target}
            confidence={79}
          />
          <KPICard
            label="Simulation Confidence"
            value={fmtPct(r.completeness_score)}
            implication={`${Object.values(r.data_completeness || {}).filter(Boolean).length} of ${Object.keys(r.data_completeness || {}).length} data signals available`}
            icon={Brain}
            confidence={Math.round(r.completeness_score)}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <KPICard
            label="Highest Converting Segment"
            value={highestSeg?.cluster_name || '—'}
            implication={highestSeg ? `Intent: ${fmtScore(highestSeg.purchase_intent)} · Conv: ${fmtPct(highestSeg.conversion_probability * 100)}` : undefined}
            icon={Zap}
            colorClass="green-500"
            confidence={88}
          />
          <KPICard
            label="Lowest Converting Segment"
            value={lowestSeg?.cluster_name || '—'}
            implication={lowestSeg ? `Intent: ${fmtScore(lowestSeg.purchase_intent)} — highest optimization priority` : undefined}
            icon={TrendingDown}
            colorClass="red-500"
            confidence={85}
          />
          <KPICard
            label="Dominant Channel"
            value={summary?.dominant_channel || '—'}
            implication="Primary purchase channel across the simulated population"
            icon={Activity}
            confidence={76}
          />
        </div>
      </PageSection>

      {/* ── 2. Market DNA Overview ────────────────────────────────────────── */}
      <PageSection title="2. Market DNA Overview">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar */}
          <ChartContainer
            title="Market Signal Radar"
            description="Dataset-derived market signals powering the simulation"
            xAxisLabel=""
            yAxisLabel=""
            businessExplanation="Each axis represents a normalised market signal from your uploaded datasets. Larger coverage = stronger simulation confidence."
          >
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={dnaRadarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Market DNA" dataKey="value" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} strokeWidth={2} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Scorecards */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Signal Breakdown</h3>
            {[
              { label: 'Demand Environment', value: dna?.demand_score, icon: Activity, color: '#8B5CF6', desc: 'Overall demand strength from Magnet keywords' },
              { label: 'Revenue Environment', value: dna?.revenue_density, icon: DollarSign, color: '#10B981', desc: 'Revenue density from market momentum engine' },
              { label: 'Competition Environment', value: dna?.competitive_saturation, icon: Shield, color: '#EF4444', desc: 'Competitive pressure from HHI analysis' },
              { label: 'Consumer Efficiency', value: dna?.conversion_efficiency, icon: Target, color: '#3B82F6', desc: 'Keyword-to-revenue conversion index' },
            ].map(item => (
              <Card key={item.label} className="border-border/40 bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md" style={{ backgroundColor: `${item.color}20` }}>
                        <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <span className="text-sm font-bold text-foreground">{item.label}</span>
                    </div>
                    <span className="text-lg font-black font-mono" style={{ color: item.color }}>
                      {item.value != null ? item.value.toFixed(1) : '—'}
                    </span>
                  </div>
                  <ProgressBar value={item.value || 0} colorClass="" />
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, item.value || 0)}%`, backgroundColor: item.color }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* DNA Data Quality */}
        <Card className="border-border/40 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              Simulation Data Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(r.data_completeness || {}).map(([key, present]) => (
                <span key={key} className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full border font-mono',
                  present ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border')}>
                  {present ? '✓' : '○'} {key.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </PageSection>

      {/* ── 3. Psychographic Cluster Explorer ────────────────────────────── */}
      <PageSection title="3. Psychographic Cluster Explorer">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Search segments..."
              value={clusterSearch}
              onChange={e => setClusterSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Sort:</span>
            {(['intent', 'conversion', 'population', 'resistance'] as const).map(s => (
              <button key={s} onClick={() => setClusterSort(s)}
                className={cn('text-xs px-2.5 py-1 rounded-md border font-medium capitalize transition-colors',
                  clusterSort === s ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:text-foreground')}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Filter:</span>
            {(['all', 'high', 'medium', 'low'] as const).map(f => (
              <button key={f} onClick={() => setClusterFilter(f)}
                className={cn('text-xs px-2.5 py-1 rounded-md border font-medium capitalize transition-colors',
                  clusterFilter === f ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:text-foreground')}>
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-auto">{filteredSegments.length} segments</span>
        </div>

        {/* Cluster grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSegments.map((seg, i) => (
            <SegmentCard key={seg.cluster_id} seg={seg} index={segments.indexOf(seg)}
              selected={selectedSegment?.cluster_id === seg.cluster_id}
              onClick={() => setSelectedSegment(prev => prev?.cluster_id === seg.cluster_id ? null : seg)} />
          ))}
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedSegment && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Card className="border-primary/30 bg-primary/5 mt-4">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[segments.indexOf(selectedSegment) % SEGMENT_COLORS.length] }} />
                        {selectedSegment.cluster_name}
                      </CardTitle>
                      <CardDescription>
                        {fmtNum(selectedSegment.population)} consumers · {fmtPct(selectedSegment.percentage)} of population
                      </CardDescription>
                    </div>
                    <button onClick={() => setSelectedSegment(null)} className="text-muted-foreground hover:text-foreground">
                      <ChevronUp className="w-5 h-5" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Metrics */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Adoption Metrics</h4>
                      {[
                        { label: 'Purchase Intent', value: selectedSegment.purchase_intent, max: 100 },
                        { label: 'Trust Score', value: selectedSegment.trust_score, max: 100 },
                        { label: 'Emotional Resonance', value: selectedSegment.emotional_resonance, max: 100 },
                      ].map(m => (
                        <div key={m.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{m.label}</span>
                            <span className="font-bold font-mono">{m.value.toFixed(1)}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(m.value / m.max) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-border/40">
                        <p className="text-xs text-muted-foreground mb-1">Conversion Probability</p>
                        <p className="text-xl font-black font-mono text-primary">
                          {fmtPct(selectedSegment.conversion_probability * 100)}
                        </p>
                      </div>
                    </div>
                    {/* Motivations & Objections */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-2">Motivations</h4>
                        <ul className="space-y-1.5">
                          {(selectedSegment.motivations || []).map((m, i) => (
                            <li key={i} className="text-xs text-foreground/80 flex gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-red-500 mb-2">Objections</h4>
                        <ul className="space-y-1.5">
                          {(selectedSegment.objections || []).map((o, i) => (
                            <li key={i} className="text-xs text-foreground/80 flex gap-2">
                              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                              {o}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {/* Resistance */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Resistance Index: <span className={cn('ml-1', resistanceColor(selectedSegment.resistance?.resistance_level || 'Low'))}>
                          {fmtScore(selectedSegment.resistance?.resistance_index)}
                        </span>
                      </h4>
                      {selectedSegment.resistance && [
                        { label: 'Habit Lock-In', val: selectedSegment.resistance.habit_lock_in },
                        { label: 'Competitor Loyalty', val: selectedSegment.resistance.competitor_loyalty },
                        { label: 'Trust Barrier', val: selectedSegment.resistance.trust_barrier },
                        { label: 'Price Resistance', val: selectedSegment.resistance.price_resistance },
                        { label: 'Complexity', val: selectedSegment.resistance.product_complexity },
                      ].map(b => (
                        <div key={b.label} className="mb-2">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{b.label}</span>
                            <span className="font-mono font-bold">{b.val.toFixed(0)}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1">
                            <div className="h-full rounded-full bg-red-400/70" style={{ width: `${b.val}%` }} />
                          </div>
                        </div>
                      ))}
                      <div className="mt-3 p-2.5 bg-muted/30 rounded-lg border border-border/40">
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          {selectedSegment.resistance?.recommended_approach}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </PageSection>

      {/* ── 4. Cluster Distribution Visualizations ───────────────────────── */}
      <PageSection title="4. Cluster Distribution Visualizations">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Population bar */}
          <ChartContainer title="Population Distribution" description="Consumer count per psychographic segment" xAxisLabel="Segment" yAxisLabel="Consumers"
            businessExplanation="Larger segments represent more consumers sharing a trait profile — these deserve prioritized marketing investment.">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={segments.slice(0, 12).map((s, i) => ({ name: s.cluster_name.split(' ').slice(0, 2).join(' '), value: s.population, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }))}
                margin={{ top: 4, right: 8, bottom: 40, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Consumers" radius={[3, 3, 0, 0]}>
                  {segments.slice(0, 12).map((_, i) => <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Average trait radar */}
          <ChartContainer title="Trait Distribution (Population Average)" description="Average psychological trait scores across all segments" xAxisLabel="" yAxisLabel=""
            businessExplanation="The shape reveals what the simulated population values most. A spike in 'Value' means price sensitivity is dominant market-wide.">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={traitRadarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Avg Trait" dataKey="value" stroke="#10B981" fill="#10B981" fillOpacity={0.15} strokeWidth={2} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Channel distribution */}
          <ChartContainer title="Channel Preference Distribution" description="Which channels each segment prefers for purchasing" xAxisLabel="Channel" yAxisLabel="Consumers"
            businessExplanation="Concentrate launch investment in the dominant channel to minimise friction between intent and actual purchase.">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelData} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Consumers" radius={[3, 3, 0, 0]} fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Purchase intent scatter */}
          <ChartContainer title="Adoption vs Resistance" description="Segment positioning by purchase intent vs resistance index" xAxisLabel="Resistance Index" yAxisLabel="Purchase Intent"
            businessExplanation="Top-left segments are easiest wins: high intent, low resistance. Bottom-right are hardest. Focus resources on top-left first.">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis type="number" dataKey="x" name="Resistance" domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="y" name="Intent" domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
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
                  {segments.map((_, i) => <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} fillOpacity={0.8} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </PageSection>

      {/* ── 5. Adoption Simulation Matrix ────────────────────────────────── */}
      <PageSection title="5. Adoption Simulation Matrix">
        <Card className="border-border/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Segment × Metric Heatmap</CardTitle>
                <CardDescription>Adoption metrics across all psychographic segments</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort by:</span>
                {(['intent', 'conversion', 'trust', 'resistance'] as const).map(s => (
                  <button key={s} onClick={() => setMatrixSort(s)}
                    className={cn('text-xs px-2 py-1 rounded border capitalize transition-colors',
                      matrixSort === s ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground')}>
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
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Conversion</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Trust</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Resonance</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Switch Prob.</th>
                    <th className="text-center px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Resistance</th>
                    <th className="text-left px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixSegments.map((seg, i) => (
                    <tr key={seg.cluster_id}
                      className={cn('border-b border-border/30 hover:bg-muted/10 transition-colors cursor-pointer',
                        selectedSegment?.cluster_id === seg.cluster_id && 'bg-primary/5')}
                      onClick={() => setSelectedSegment(prev => prev?.cluster_id === seg.cluster_id ? null : seg)}>
                      <td className="px-4 py-2.5 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SEGMENT_COLORS[segments.indexOf(seg) % SEGMENT_COLORS.length] }} />
                          <span>{seg.cluster_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">{seg.population}</td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold rounded-sm mx-1', heatCell(seg.purchase_intent))}>{seg.purchase_intent.toFixed(0)}</td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(seg.conversion_probability * 100))}>{(seg.conversion_probability * 100).toFixed(1)}%</td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(seg.trust_score))}>{seg.trust_score.toFixed(0)}</td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(seg.emotional_resonance))}>{seg.emotional_resonance.toFixed(0)}</td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold', heatCell(100 - seg.switching_probability * 100))}>{(seg.switching_probability * 100).toFixed(1)}%</td>
                      <td className={cn('px-3 py-2.5 text-center font-mono font-bold',
                        seg.resistance?.resistance_index >= 70 ? 'text-red-500' :
                        seg.resistance?.resistance_index >= 50 ? 'text-orange-500' :
                        seg.resistance?.resistance_index >= 30 ? 'text-amber-500' : 'text-emerald-500')}>
                        {(seg.resistance?.resistance_index || 0).toFixed(0)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{seg.channel_preference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </PageSection>

      {/* ── 6. Resistance Testing Dashboard ─────────────────────────────── */}
      <PageSection title="6. Resistance Testing Dashboard">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartContainer title="Resistance Barriers by Segment" description="Top 10 segments — stacked barrier breakdown" xAxisLabel="Segment" yAxisLabel="Score"
            businessExplanation="Taller bars = harder to convert. Identify which specific barrier (habit, price, trust) is blocking each segment.">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={resistanceBarData} margin={{ top: 4, right: 8, bottom: 48, left: 8 }} stackOffset="none">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} angle={-35} textAnchor="end" interval={0} />
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

          {/* Resistance scorecards */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Barrier Overview</h3>
            {segments.length > 0 && [
              { label: 'Habit Lock-In', key: 'habit_lock_in' as const, color: '#EF4444', desc: 'Consumers locked to existing habits' },
              { label: 'Trust Barrier', key: 'trust_barrier' as const, color: '#EAB308', desc: 'Skepticism before first purchase' },
              { label: 'Price Resistance', key: 'price_resistance' as const, color: '#8B5CF6', desc: 'Price sensitivity blocking conversion' },
              { label: 'Competitor Loyalty', key: 'competitor_loyalty' as const, color: '#F97316', desc: 'Attachment to existing brands' },
              { label: 'Product Complexity', key: 'product_complexity' as const, color: '#3B82F6', desc: 'Overwhelm from too many options' },
              { label: 'Education Required', key: 'education_requirement' as const, color: '#10B981', desc: 'Need for pre-purchase education' },
            ].map(b => {
              const avg = segments.reduce((sum, s) => sum + (s.resistance?.[b.key] || 0), 0) / segments.length;
              return (
                <Card key={b.label} className="border-border/30 bg-card">
                  <CardContent className="p-3 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold text-foreground">{b.label}</span>
                        <span className="font-mono font-bold" style={{ color: b.color }}>{avg.toFixed(1)}/100</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${avg}%`, backgroundColor: b.color, opacity: 0.8 }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{b.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </PageSection>

      {/* ── 7. Revenue Lift Simulator ─────────────────────────────────────── */}
      <PageSection title="7. Revenue Lift Simulator">
        <ChartContainer title="Current vs Potential Adoption" description="Revenue lift opportunity per segment if primary barrier is resolved" xAxisLabel="Segment" yAxisLabel="Purchase Intent"
          businessExplanation="The gap between current and potential adoption represents the recoverable revenue opportunity. Segments with the largest gap offer the highest ROI for targeted campaigns.">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={liftData} margin={{ top: 4, right: 8, bottom: 48, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} angle={-35} textAnchor="end" interval={0} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Bar dataKey="current" name="Current Adoption" fill="#64748B" radius={[0, 0, 0, 0]} />
              <Bar dataKey="gap" name="Lift Opportunity" fill="#8B5CF6" stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Lift table */}
        <Card className="border-border/40">
          <CardHeader><CardTitle className="text-sm">Revenue Lift Analysis by Segment</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Segment</th>
                  <th className="text-center px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Current</th>
                  <th className="text-center px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Potential</th>
                  <th className="text-center px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Lift</th>
                  <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Primary Barrier</th>
                  <th className="text-left px-3 py-2.5 font-bold text-muted-foreground uppercase tracking-wider">Recommended Action</th>
                </tr>
              </thead>
              <tbody>
                {segments.slice(0, 8).map((seg, i) => (
                  <tr key={seg.cluster_id} className="border-b border-border/30 hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                      {seg.cluster_name}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">{seg.purchase_intent.toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-emerald-500 font-bold">
                      {Math.min(100, seg.purchase_intent + (seg.resistance?.resistance_index || 0) * 0.4).toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-primary">
                      +{((seg.resistance?.resistance_index || 0) * 0.4).toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{seg.resistance?.primary_barrier || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-xs truncate" title={seg.resistance?.recommended_approach}>
                      {(seg.resistance?.recommended_approach || '').slice(0, 60)}{(seg.resistance?.recommended_approach?.length || 0) > 60 ? '...' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageSection>

      {/* ── 8. Repeat Purchase Forecast ──────────────────────────────────── */}
      <PageSection title="8. Repeat Purchase Forecast">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartContainer title="Retention Curve" description="Projected cohort retention at M1, M3, M6, M12" xAxisLabel="Month" yAxisLabel="Retention %"
            businessExplanation="Retention declines over time based on brand loyalty and category engagement signals from the simulation. M3 is the critical churn window.">
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
                <Area type="monotone" dataKey="retention" name="Retention %" stroke="#8B5CF6" fill="url(#retentionGrad)" strokeWidth={2} dot={{ fill: '#8B5CF6', r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Retention cohort heatmap */}
          <Card className="border-border/40 bg-card">
            <CardHeader><CardTitle className="text-sm">Retention Cohort Heatmap</CardTitle>
              <CardDescription>Retention rate by segment at each forecast horizon</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-3 py-2.5 font-bold text-muted-foreground">Segment</th>
                      {['M1', 'M3', 'M6', 'M12'].map(m => (
                        <th key={m} className="text-center px-3 py-2.5 font-bold text-muted-foreground">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segments.slice(0, 10).map((seg, i) => {
                      const loyalty = (seg.dominant_traits as any)?.brand_loyalty || 0.4;
                      const base = seg.conversion_probability;
                      const decay = 0.7 + loyalty * 0.3;
                      return (
                        <tr key={seg.cluster_id} className="border-b border-border/20">
                          <td className="px-3 py-2 font-medium truncate max-w-[120px]">{seg.cluster_name}</td>
                          {[1, 3, 6, 12].map(m => {
                            const ret = base * Math.pow(decay, m / 12) * 100;
                            return (
                              <td key={m} className={cn('px-3 py-2 text-center font-mono font-bold', heatCell(ret))}>
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

      {/* ── 9. Strategic Launch Simulator ───────────────────────────────── */}
      <PageSection title="9. Strategic Launch Simulator">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {launchScenarios.map((scenario) => (
            <motion.div key={scenario.name} whileHover={{ y: -3 }}>
              <Card className={cn('relative border transition-all h-full', scenario.recommended ? 'border-primary/60 bg-primary/5 shadow-lg' : 'border-border/50 bg-card')}>
                {scenario.recommended && (
                  <div className="absolute -top-2.5 left-4">
                    <Badge className="bg-primary text-primary-foreground text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-widest">
                      Recommended
                    </Badge>
                  </div>
                )}
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4 mt-1">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${scenario.color}20` }}>
                      <scenario.icon className="w-5 h-5" style={{ color: scenario.color }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">{scenario.name}</h3>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{scenario.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { label: 'Adoption', value: `${scenario.adoption.toFixed(1)}%`, raw: scenario.adoption },
                      { label: 'Revenue Capture', value: `${scenario.revenue.toFixed(1)}%`, raw: scenario.revenue },
                      { label: 'Risk', value: `${scenario.risk}/100`, raw: scenario.risk },
                      { label: 'Confidence', value: `${scenario.confidence}%`, raw: scenario.confidence },
                    ].map(m => (
                      <div key={m.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{m.label}</span>
                          <span className="font-bold font-mono" style={{ color: scenario.color }}>{m.value}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.raw)}%`, backgroundColor: scenario.color, opacity: m.label === 'Risk' ? 0.5 : 0.9 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Scenario comparison chart */}
        <ChartContainer title="Scenario Comparison" description="Side-by-side adoption, revenue, and confidence across all four scenarios" xAxisLabel="Scenario" yAxisLabel="Score"
          businessExplanation="Compare scenarios holistically — a high-adoption scenario with low confidence may be riskier than a moderate but well-supported approach.">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={launchScenarios.map(s => ({ name: s.name, Adoption: s.adoption, Revenue: s.revenue, Confidence: s.confidence, Risk: s.risk }))}
              margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Bar dataKey="Adoption" fill="#8B5CF6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Revenue" fill="#10B981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Confidence" fill="#3B82F6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Risk" fill="#EF4444" opacity={0.6} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </PageSection>

    </div>
  );
}
