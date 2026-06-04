import { useMemo, useState, useCallback, Component } from 'react';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Info, TrendingDown, TrendingUp, X, Database
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { EvidenceModal, type EvidenceData } from '../components/ui/EvidenceModal';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Central segment normalization — ensures consistent segment labels across backend variants */
function normalizeSegment(value: string | null | undefined): string {
  if (!value) return 'Low Priority';
  
  const cleaned = value.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  
  if (cleaned === 'demand winner' || cleaned === 'demand winners') return 'Demand Winner';
  if (cleaned === 'hidden gem' || cleaned === 'hidden gems') return 'Hidden Gem';
  if (cleaned === 'friction keyword' || cleaned === 'friction keywords') return 'Friction Keyword';
  if (cleaned === 'low priority') return 'Low Priority';
  
  // Return original value if no match (fallback)
  return value.trim();
}

/** Segment colors — centralized color mapping */
const SEGMENT_COLORS: Record<string, string> = {
  'Demand Winner': '#8B5CF6',
  'Hidden Gem': '#10B981',
  'Friction Keyword': '#EF4444',
  'Low Priority': '#64748B',
};

/** Meaningful keyword validation — generic filter for all datasets */
function isMeaningfulKeyword(kw: string | null | undefined): boolean {
  if (!kw || typeof kw !== 'string') return false;
  
  const cleaned = kw.trim().toLowerCase();
  if (cleaned.length === 0) return false;
  
  // Must contain at least one alphabetic character
  if (!/[a-z]/i.test(cleaned)) return false;
  
  // Reject if only numbers/symbols/punctuation
  if (/^[\d\s\-_.,;:!?'"()[\]{}\/\\]+$/.test(cleaned)) return false;
  
  // Reject common stopword-only patterns (very short single stopwords)
  const stopwordsOnly = /^(a|an|the|for|and|or|but|of|to|in|on|at|by|from|with|as|is|was|are|be)$/i;
  if (stopwordsOnly.test(cleaned)) return false;
  
  // Reject broken fragments (single letters, or very short with no vowels)
  if (cleaned.length === 1) return false;
  if (cleaned.length === 2 && !/[aeiou]/i.test(cleaned)) return false;
  
  // Accept everything else — includes valid short keywords like "table", "tote", "bin"
  return true;
}

function efficiencyColor(score: number): string {
  if (score >= 60) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

/** Precision-aware currency formatter — never shows misleadingly positive $0.00 */
function fmt$(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (n === 0) return '$0.00';
  if (n < 0.01) return `<$0.01 ($${n.toFixed(6)})`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function quadrantDotColor(q: string | null | undefined): string {
  const normalized = normalizeSegment(q);
  return SEGMENT_COLORS[normalized] ?? '#64748b';
}

function quadrantLabel(key: string): string {
  switch (key) {
    case 'demand': return 'Demand Winner';
    case 'friction': return 'Friction Keyword';
    case 'hidden': return 'Hidden Gem';
    case 'low': return 'Low Priority';
    default: return 'All';
  }
}

const valOrMissing = (val: any, formatFn?: (v: any) => any) => {
  if (val == null || val === '') return (
    <span className="text-[10px] uppercase font-bold text-muted-foreground/60 italic">Not Available In Source Data</span>
  );
  return formatFn ? formatFn(val) : val;
};

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; msg: string }
class IntentErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, msg: '' };
  }
  static getDerivedStateFromError(e: unknown): EBState {
    return { hasError: true, msg: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Page Error</h2>
          <p className="text-red-500/80 font-mono text-sm">{this.state.msg}</p>
          <button className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20"
            onClick={() => this.setState({ hasError: false, msg: '' })}>Retry</button>
        </CardContent>
      </Card>
    );
  }
}

// ─── Evidence Conversion Helpers ──────────────────────────────────────────────

function backendEvidenceToData(be: any, displayValue: any, title: string): EvidenceData | null {
  if (!be) return null;
  
  const topRecords = (be.items || []).slice(0, 10).map((item: any) => ({
    keyword: item.keyword || '—',
    search_volume: item.search_volume || 0,
    revenue_per_1000_searches: item.revenue_per_1000_searches || 0,
    efficiency_score: item.efficiency_score || 0,
  }));

  return {
    title: title,
    displayed_value: displayValue,
    source_datasets: [be.source_dataset || 'Magnet Keyword Dataset'],
    source_columns: be.source_columns || ['Keyword Phrase', 'Search Volume', 'Keyword Sales'],
    source_row_count: be.rows_included || be.rows_matched || 0,
    formula: be.formula || null,
    calculation_steps: be.calculation_steps || [],
    top_records: topRecords.length > 0 ? topRecords : undefined,
    aggregation_method: be.aggregation_method || undefined,
    thresholds: be.thresholds ? {
      high: String(be.thresholds.high_demand_cutoff || be.thresholds.high || '≥ 60'),
      medium: String(be.thresholds.medium || 'Between 40 and 60'),
      low: String(be.thresholds.low_demand_cutoff || be.thresholds.low || '< 40'),
    } : undefined,
    classification_reason: be.interpretation || be.excluded_reason || undefined,
    confidence_note: undefined,
    data_quality_notes: be.rows_excluded ? [`${be.rows_excluded} rows excluded: ${be.excluded_reason || 'validation failed'}`] : undefined,
    llm_used: false,
  };
}

function keywordRowEvidence(k: any, benchmark: number): EvidenceData | null {
  const sv = Number(k.search_volume ?? 0);
  const ks = Number(k.keyword_revenue ?? k.revenue ?? 0);
  const rps = sv > 0 ? (ks / sv) * 1000 : 0;
  const eff = Number(k.efficiency_score ?? k.revenue_efficiency_index ?? 0);
  const dem = Number(k.demand_percentile ?? 0);
  const rec = Number(k.estimated_revenue_leakage ?? k.recoverable_revenue ?? 0);
  const gap = Number(k.efficiency_gap_per_1000_searches ?? k.gap ?? 0);
  const segment = k.segment ?? k.quadrant ?? 'Low Priority';
  const rpsActual = Number(k.revenue_per_1000_searches ?? rps);

  const segmentRules: Record<string, string> = {
    'Demand Winner':    'Demand Percentile ≥ 60 AND Revenue Efficiency Index ≥ 60',
    'Friction Keyword': 'Demand Percentile ≥ 60 AND Revenue Efficiency Index < 40',
    'Hidden Gem':       'Demand Percentile < 60 AND Revenue Efficiency Index ≥ 60',
    'Low Priority':     'Demand Percentile < 60 AND Revenue Efficiency Index < 40',
  };

  const calcSteps = [
    `Revenue / 1K Searches = Keyword Sales / Search Volume × 1000 = ${fmt$(ks)} / ${sv.toLocaleString()} × 1000 = ${fmt$(rpsActual)}`,
    `Revenue Efficiency Index = percentile_rank(Revenue / 1K Searches) × 100 = ${eff.toFixed(2)}`,
    `Demand Percentile = percentile_rank(Search Volume) × 100 = ${dem.toFixed(2)}`,
  ];

  if (segment === 'Friction Keyword') {
    calcSteps.push(`Benchmark Revenue / 1K = 75th percentile = ${fmt$(benchmark)}`);
    calcSteps.push(`Efficiency Gap = max(0, ${fmt$(benchmark)} − ${fmt$(rpsActual)}) = ${fmt$(gap)}`);
    calcSteps.push(`Estimated Friction Revenue Gap = Gap × Search Volume / 1000 = ${fmt$(gap)} × ${sv.toLocaleString()} / 1000 = ${fmt$(rec)}`);
  }

  return {
    title: `Keyword: ${k.keyword}`,
    displayed_value: segment,
    source_datasets: ['Magnet Keyword Dataset'],
    source_columns: ['Keyword Phrase', 'Search Volume', 'Keyword Sales'],
    source_row_count: 1,
    formula: 'Revenue Efficiency Index = percentile_rank(Keyword Sales / Search Volume × 1000) × 100; Demand Percentile = percentile_rank(Search Volume) × 100',
    calculation_steps: calcSteps,
    top_records: [{
      keyword: k.keyword,
      search_volume: sv,
      keyword_sales: ks,
      revenue_per_1000_searches: rpsActual,
      efficiency_score: eff,
      demand_percentile: dem,
    }],
    aggregation_method: 'Percentile ranking across all keywords',
    thresholds: {
      high: 'Demand ≥ 60 AND Efficiency ≥ 60 (Demand Winner)',
      medium: 'Demand ≥ 60 AND Efficiency < 40 (Friction) OR Demand < 60 AND Efficiency ≥ 60 (Hidden Gem)',
      low: 'Demand < 60 AND Efficiency < 40 (Low Priority)',
    },
    classification_reason: `${k.keyword} is classified as "${segment}" because: ${segmentRules[segment] || 'segment logic applied'}. ${segment === 'Friction Keyword' ? `Estimated friction revenue gap: ${fmt$(rec)}` : ''}`,
    confidence_note: `Keyword ${isMeaningfulKeyword(k.keyword) ? 'passed' : 'did not pass'} meaningful keyword validation.`,
    data_quality_notes: !isMeaningfulKeyword(k.keyword) ? ['Warning: This keyword may be a fragment or non-meaningful token.'] : undefined,
    llm_used: false,
  };
}

// ─── KPI Card Component ───────────────────────────────────────────────────────

interface KpiProps {
  label: string; 
  value: any; 
  implication?: string; 
  confidence?: number;
  icon: any;
  onClick?: () => void;
}

function KPICardLocal({ label, value, implication, confidence, icon: Icon, onClick }: KpiProps) {
  return (
    <Card className={cn('transition-all duration-200', onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-md')} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="p-2 rounded-lg border bg-primary/10 border-primary/20">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
        <p className="text-2xl font-black leading-tight text-primary">{value}</p>
        {implication && <p className="text-[11px] font-medium text-muted-foreground mt-1.5 leading-snug">{implication}</p>}
        {confidence && <p className="text-[10px] text-muted-foreground/60 mt-1">Confidence: {confidence}%</p>}
      </CardContent>
    </Card>
  );
}

// ─── Scatter Tooltip ──────────────────────────────────────────────────────────

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const segment = d.segment ?? d.quadrant ?? 'Low Priority';
  const color = quadrantDotColor(segment);
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-2 max-w-[260px]">
      <div>
        <p className="font-bold text-sm leading-snug break-words">{d.keyword || '—'}</p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1" style={{ backgroundColor: `${color}15`, color: color }}>
          {segment}
        </span>
      </div>
      <div className="border-t border-border/50 pt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <p className="text-muted-foreground text-xs col-span-2">Search Volume: <span className="text-foreground font-mono">{valOrMissing(d.search_volume, (v: any) => v.toLocaleString())}</span></p>
        <p className="text-muted-foreground text-xs col-span-2">Keyword Sales: <span className="text-foreground font-mono">{valOrMissing(d.keyword_revenue ?? d.revenue, fmt$)}</span></p>
        <p className="text-muted-foreground text-xs col-span-2">Rev / 1K: <span className="text-foreground font-mono">{valOrMissing(d.revenue_per_1000_searches, fmt$)}</span></p>
        <div className="col-span-2 border-t border-border/30 my-0.5"></div>
        <p className="text-muted-foreground text-xs">Demand: <span className="text-foreground font-mono font-medium">{(d.demand_percentile ?? 0).toFixed(1)}</span></p>
        <p className="text-muted-foreground text-xs">Efficiency: <span className={cn('font-mono font-medium', efficiencyColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}</span></p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function IntentEfficiencyInner() {
  // All hooks unconditionally at top — no early returns before these
  const [activeFilter, setActiveFilter] = useState<'all' | 'demand' | 'friction' | 'hidden' | 'low'>('all');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceData | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(300),
    retry: false,
    refetchOnWindowFocus: false,
  });



  // Safe data extraction — all guarded inside useMemo
  const r = useMemo(() => (data?.data?.results ?? {}) as Record<string, any>, [data]);

  const summaryCards = useMemo(() => {
    const kc = r.keyword_conversion ?? {};
    return r.summary_cards ?? kc.summary_cards ?? {} as Record<string, any>;
  }, [r]);

  const rows = useMemo<any[]>(() => {
    const rawRows = r.keyword_rows ?? r.all_keywords ?? [];
    // Filter out meaningless keywords and normalize segments
    return rawRows
      .filter((row: any) => isMeaningfulKeyword(row.keyword))
      .map((row: any) => ({
        ...row,
        segment: normalizeSegment(row.segment ?? row.quadrant ?? row.classification),
        demand_percentile: Number(row.demand_percentile ?? row.demandPercentile ?? row.demand_pct ?? 0),
        efficiency_score: Number(row.efficiency_score ?? row.revenue_efficiency_index ?? row.revenueEfficiencyIndex ?? row.efficiencyScore ?? 0),
      }));
  }, [r]);

  const friction = useMemo<any[]>(() => {
    const kc = r.keyword_conversion ?? {};
    const rawFriction = r.friction_rows ?? kc.friction_rows ?? r.friction_keywords ?? summaryCards.friction_keywords?.items ?? [];
    // Filter out meaningless keywords
    return rawFriction.filter((row: any) => isMeaningfulKeyword(row.keyword));
  }, [r, summaryCards]);

  const matrix = useMemo(() => {
    const kc = r.keyword_conversion ?? {};
    return r.matrix ?? kc.matrix ?? {} as Record<string, any>;
  }, [r]);

  const scatterRaw = useMemo<any[]>(() => {
    const rawScatter = matrix.points ?? r.scatter_data ?? [];
    // Filter out meaningless keywords, normalize segments, ensure numeric fields
    return rawScatter
      .filter((pt: any) => isMeaningfulKeyword(pt.keyword))
      .map((pt: any) => ({
        ...pt,
        segment: normalizeSegment(pt.segment ?? pt.quadrant ?? pt.classification),
        demand_percentile: Number(pt.demand_percentile ?? pt.demandPercentile ?? pt.demand_pct ?? 0),
        efficiency_score: Number(pt.efficiency_score ?? pt.revenue_efficiency_index ?? pt.revenueEfficiencyIndex ?? pt.efficiencyScore ?? 0),
      }))
      .filter((pt: any) => isFinite(pt.demand_percentile) && isFinite(pt.efficiency_score));
  }, [matrix, r]);

  const qs = useMemo(() => matrix.segment_counts ?? r.quadrant_summary ?? {} as Record<string, any>, [matrix, r]);

  const totalKeywords = useMemo(() => r.total_keywords_analysed ?? rows.length ?? 0, [r, rows]);

  const benchmarkRps1k = useMemo(() => {
    const bm = r.benchmarks ?? r.keyword_conversion?.benchmarks ?? {};
    return Number(bm.top_quartile?.value ?? 0);
  }, [r]);

  const scatter = useMemo<any[]>(() => {
    const sorted = [...scatterRaw].sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0));
    return sorted.slice(0, 300);
  }, [scatterRaw]);

  const displayScatter = useMemo(() => {
    if (activeFilter === 'all') return scatter;
    
    const targetSegment = 
      activeFilter === 'demand' ? 'Demand Winner' :
      activeFilter === 'friction' ? 'Friction Keyword' :
      activeFilter === 'hidden' ? 'Hidden Gem' :
      activeFilter === 'low' ? 'Low Priority' : null;
    
    if (!targetSegment) return scatter;
    
    return scatter.filter(pt => pt.segment === targetSegment);
  }, [scatter, activeFilter]);

  const filteredKeywordRows = useMemo(() => {
    if (activeFilter === 'all') return rows;
    
    const targetSegment = 
      activeFilter === 'demand' ? 'Demand Winner' :
      activeFilter === 'friction' ? 'Friction Keyword' :
      activeFilter === 'hidden' ? 'Hidden Gem' :
      activeFilter === 'low' ? 'Low Priority' : null;
    
    if (!targetSegment) return rows;
    
    return rows.filter(r => r.segment === targetSegment);
  }, [rows, activeFilter]);

  const frictionRowsSorted = useMemo(() => {
    return [...friction].sort((a, b) =>
      (b.estimated_revenue_leakage ?? b.recoverable_revenue ?? 0) -
      (a.estimated_revenue_leakage ?? a.recoverable_revenue ?? 0)
    );
  }, [friction]);

  // Column definitions — stable memoized objects, Evidence column removed
  const keywordColumns = useMemo<Column<any>[]>(() => [
    { header: 'Keyword', accessorKey: 'keyword',
      cell: row => <button className="text-left hover:text-primary transition-colors font-medium" onClick={(e) => { e.stopPropagation(); setSelectedEvidence(keywordRowEvidence(row, benchmarkRps1k)); }}>{row.keyword ?? '—'}</button> },
    { header: 'Search Volume', accessorKey: 'search_volume',
      cell: row => valOrMissing(row.search_volume, (v: any) => Number(v).toLocaleString()) },
    { header: 'Keyword Sales Revenue', accessorKey: 'keyword_revenue',
      cell: row => valOrMissing(row.keyword_revenue ?? row.revenue, fmt$) },
    { header: 'Revenue / 1K Searches', accessorKey: 'revenue_per_1000_searches',
      cell: row => valOrMissing(row.revenue_per_1000_searches, fmt$) },
    { header: 'Revenue Efficiency Index', accessorKey: 'efficiency_score',
      cell: row => <span className={cn('font-mono', efficiencyColor(row.efficiency_score ?? 0))}>{(row.efficiency_score ?? 0).toFixed(2)}</span> },
    { header: 'Demand Percentile', accessorKey: 'demand_percentile',
      cell: row => <span className="font-mono">{(row.demand_percentile ?? 0).toFixed(2)}</span> },
    { header: 'Segment', accessorKey: 'quadrant',
      cell: row => <span style={{ color: quadrantDotColor(row.quadrant ?? '') }} className="text-xs font-bold">{row.quadrant ?? '—'}</span> },
  ], [benchmarkRps1k]);

  const frictionColumns = useMemo<Column<any>[]>(() => [
    { header: 'Keyword', accessorKey: 'keyword',
      cell: row => <button className="text-left hover:text-primary transition-colors font-medium" onClick={(e) => { e.stopPropagation(); setSelectedEvidence(keywordRowEvidence(row, benchmarkRps1k)); }}>{row.keyword ?? '—'}</button> },
    { header: 'Search Volume', accessorKey: 'search_volume',
      cell: row => valOrMissing(row.search_volume, (v: any) => Number(v).toLocaleString()) },
    { header: 'Keyword Sales Revenue', accessorKey: 'keyword_revenue',
      cell: row => valOrMissing(row.keyword_revenue ?? row.revenue, fmt$) },
    { header: 'Revenue / 1K Searches', accessorKey: 'revenue_per_1000_searches',
      cell: row => valOrMissing(row.revenue_per_1000_searches, fmt$) },
    { header: 'Benchmark Rev / 1K', accessorKey: 'benchmark_revenue_per_1000_searches',
      cell: row => valOrMissing(row.benchmark_revenue_per_1000_searches, fmt$) },
    { header: 'Friction Revenue Gap', accessorKey: 'recoverable_revenue',
      cell: row => <span className="font-mono text-red-500">{valOrMissing(row.estimated_revenue_leakage ?? row.recoverable_revenue ?? row.lost_revenue_estimate, fmt$)}</span> },
    { header: 'Opportunity Level', accessorKey: 'opportunity_level' },
  ], [benchmarkRps1k]);

  // ── ALL hooks declared. Conditional returns safe from here. ───────────────

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Keyword Conversion Intelligence Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Upload a Magnet keyword dataset with Keyword Phrase, Search Volume, and Keyword Sales columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Safe to use extracted data ─────────────────────────────────────────────

  const highRevPotCount = summaryCards.high_revenue_potential?.count ?? r.high_intent_count ?? 0;
  const frictionCount   = summaryCards.friction_keywords?.count ?? r.friction_count ?? 0;
  const frictionRevGap  = summaryCards.recoverable_revenue?.value ?? r.total_lost_revenue ?? 0;
  const highRevEvidence = summaryCards.high_revenue_potential?.evidence ?? {};
  const frictionEvidence = summaryCards.friction_keywords?.evidence ?? {};
  const gapEvidence      = summaryCards.recoverable_revenue?.evidence ?? {};

  // Counts for matrix legend — ALWAYS calculate from full dataset, never from filtered data
  const dw = useMemo(() => rows.filter(r => r.segment === 'Demand Winner').length, [rows]);
  const hg = useMemo(() => rows.filter(r => r.segment === 'Hidden Gem').length, [rows]);
  const fk = useMemo(() => rows.filter(r => r.segment === 'Friction Keyword').length, [rows]);
  const lp = useMemo(() => rows.filter(r => r.segment === 'Low Priority').length, [rows]);

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">

      <PageHeader 
        badge="Efficiency Intelligence"
        title="Keyword Conversion Intelligence"
        description="Identify which keywords convert demand into sales, and pinpoint where revenue is leaking due to low conversion efficiency."
        kpiSummary={
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 border-t border-border/40 pt-4">
            <button
              className="flex items-center gap-2 p-2 bg-muted/20 border border-border/50 rounded-lg hover:border-primary/40 transition-colors"
              onClick={() => {
                const ev: EvidenceData = {
                  title: 'Keywords Analyzed',
                  displayed_value: totalKeywords.toLocaleString(),
                  source_datasets: ['Magnet Keyword Dataset'],
                  source_columns: ['Keyword Phrase', 'Search Volume', 'Keyword Sales'],
                  source_row_count: totalKeywords,
                  formula: 'Valid Keywords = rows where Keyword Phrase ≠ blank AND Search Volume > 0 AND Keyword Sales is numeric',
                  calculation_steps: [
                    'Filter rows where Keyword Phrase exists and is non-empty',
                    'Filter rows where Search Volume > 0 (positive numeric)',
                    'Filter rows where Keyword Sales is numeric and ≥ 0',
                    'Apply meaningful keyword validation (contains alphabetic characters, not only numbers/symbols)',
                    'Count remaining valid rows',
                  ],
                  top_records: undefined,
                  aggregation_method: 'Row count after validation filters',
                  thresholds: undefined,
                  classification_reason: undefined,
                  confidence_note: 'Keywords are filtered for meaningfulness (must contain alphabetic characters, not be stopword-only, and not be broken fragments).',
                  data_quality_notes: ['Blank or missing Keyword Phrase excluded', 'Missing or zero/negative Search Volume excluded', 'Non-numeric or missing Keyword Sales excluded', 'Meaningless keyword fragments filtered out'],
                  llm_used: false,
                };
                setSelectedEvidence(ev);
              }}
            >
              <Database className="w-4 h-4 text-primary" />
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-1">Keywords Analyzed</p>
                <p className="text-sm font-bold font-mono leading-none">{totalKeywords.toLocaleString()}</p>
              </div>
            </button>
            {activeFilter !== 'all' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1.5 rounded-md uppercase tracking-wider border border-primary/20">
                  Filter: {quadrantLabel(activeFilter)}
                </span>
                <button onClick={() => setActiveFilter('all')} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              </div>
            )}
          </div>
        }
      />

      <PageSection title="1. Conversion Efficiency Metrics">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPICardLocal
            label="High Revenue Potential"
            value={highRevPotCount}
            implication="Keywords ranking in top percentiles for both volume and conversion."
            confidence={96}
            icon={TrendingUp}
            onClick={() => {
              const ev = backendEvidenceToData(highRevEvidence, highRevPotCount, 'High Revenue Potential Keywords');
              if (ev) setSelectedEvidence(ev);
            }}
          />
          <KPICardLocal
            label="Friction Keywords"
            value={frictionCount}
            implication="High volume but fail to convert. Optimization priority."
            confidence={89}
            icon={TrendingDown}
            onClick={() => {
              const ev = backendEvidenceToData(frictionEvidence, frictionCount, 'Friction Keywords');
              if (ev) setSelectedEvidence(ev);
            }}
          />
          <KPICardLocal
            label="Friction Rev Gap"
            value={fmt$(frictionRevGap)}
            implication="Monthly revenue lost to poor conversion on high-traffic keywords."
            confidence={82}
            icon={Info}
            onClick={() => {
              const ev = backendEvidenceToData(gapEvidence, fmt$(frictionRevGap), 'Estimated Friction Revenue Gap');
              if (ev) {
                ev.classification_reason = 'This measures how much friction keywords collectively underperform the 75th-percentile benchmark.';
                setSelectedEvidence(ev);
              }
            }}
          />
        </div>
      </PageSection>

      <PageSection title="2. Opportunity Matrix">
        <ChartContainer 
          title="Conversion Quadrants"
          xAxisLabel="Demand Percentile (Search Volume)"
          yAxisLabel="Revenue Efficiency Index"
          businessExplanation="Top Right: Your best performers. Bottom Right: High volume, low conversion (Friction). Top Left: Low volume, high conversion (Hidden Gems)."
        >
          {displayScatter.length === 0 && rows.length > 0 && (
            <div className="flex items-center justify-center h-[400px] bg-muted/5 rounded-lg border border-border/30">
              <div className="text-center p-6 max-w-md">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-sm font-semibold text-foreground mb-2">
                  {activeFilter === 'all' 
                    ? 'No scatter plot data available' 
                    : `No ${quadrantLabel(activeFilter)} keywords with valid chart data`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeFilter === 'all'
                    ? 'Keywords are missing demand_percentile or efficiency_score values required for the chart.'
                    : 'This segment has keywords but they lack valid x/y coordinate data for plotting.'}
                </p>
              </div>
            </div>
          )}
          {displayScatter.length > 0 && (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 8, right: 24, bottom: 40, left: 52 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis type="number" dataKey="demand_percentile" domain={[0, 100]} name="Demand Percentile"
                label={{ value: 'Demand Percentile (Search Volume)', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey="efficiency_score" domain={[0, 100]} name="Revenue Efficiency Index"
                label={{ value: 'Revenue Efficiency Index', angle: -90, position: 'insideLeft', offset: -24, style: { textAnchor: 'middle' }, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <ReferenceLine x={60} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Demand ≥60', position: 'top', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
              <ReferenceLine y={60} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Eff ≥60', position: 'right', fontSize: 9, fill: '#10b981' }} />
              <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Eff <40', position: 'right', fontSize: 9, fill: '#ef4444' }} />
              <ReTooltip content={<ScatterTip />} />
              <Scatter
                data={displayScatter}
                isAnimationActive={false}
                onClick={(e) => { if (e?.payload) setSelectedEvidence(keywordRowEvidence(e.payload, benchmarkRps1k)); }}
              >
                {displayScatter.map((pt, i) => (
                  <Cell key={i} fill={quadrantDotColor(pt.segment)} fillOpacity={0.8} className="cursor-pointer" />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          )}

          {/* Legend / segment filter */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/50">
            {[
              { key: 'demand',  label: 'Demand Winner', count: dw, color: SEGMENT_COLORS['Demand Winner'], rule: 'Demand ≥ 60  AND  Efficiency ≥ 60' },
              { key: 'hidden',  label: 'Hidden Gem', count: hg, color: SEGMENT_COLORS['Hidden Gem'], rule: 'Demand < 60  AND  Efficiency ≥ 60' },
              { key: 'friction',label: 'Friction Keyword', count: fk, color: SEGMENT_COLORS['Friction Keyword'], rule: 'Demand ≥ 60  AND  Efficiency < 40' },
              { key: 'low',     label: 'Low Priority', count: lp, color: SEGMENT_COLORS['Low Priority'], rule: 'Demand < 60  AND  Efficiency < 40' },
            ].map(seg => (
              <button
                key={seg.key}
                className={cn(
                  'text-left p-2.5 rounded-xl border transition-colors',
                  activeFilter === seg.key
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/50 hover:border-primary/30 hover:shadow-md'
                )}
                onClick={() => {
                  // Toggle filter only — do not auto-show evidence
                  const newFilter = activeFilter === seg.key ? 'all' : seg.key as any;
                  setActiveFilter(newFilter);
                }}
                onDoubleClick={() => {
                  // Double-click to show evidence for this segment
                  const targetSegment = 
                    seg.key === 'demand' ? 'Demand Winner' :
                    seg.key === 'hidden' ? 'Hidden Gem' :
                    seg.key === 'friction' ? 'Friction Keyword' :
                    seg.key === 'low' ? 'Low Priority' : '';
                  
                  const segmentRows = rows.filter(r => r.segment === targetSegment);
                  
                  const totalVolume = segmentRows.reduce((sum, r) => sum + (r.search_volume ?? 0), 0);
                  const totalRevenue = segmentRows.reduce((sum, r) => sum + (r.keyword_revenue ?? r.revenue ?? 0), 0);
                  const avgEfficiency = segmentRows.length > 0 
                    ? segmentRows.reduce((sum, r) => sum + (r.efficiency_score ?? 0), 0) / segmentRows.length 
                    : 0;
                  
                  const scatterPointCount = scatter.filter(pt => pt.segment === targetSegment).length;
                  const missingXY = segmentRows.length - scatterPointCount;
                  
                  const topKeywords = segmentRows
                    .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
                    .slice(0, 20)
                    .map(k => ({
                      keyword: k.keyword,
                      search_volume: k.search_volume ?? 0,
                      revenue: k.keyword_revenue ?? k.revenue ?? 0,
                      revenue_per_1000: k.revenue_per_1000_searches ?? 0,
                      efficiency: k.efficiency_score ?? 0,
                    }));
                  
                  const ev: EvidenceData = {
                    title: `${seg.label} — Segment Analysis`,
                    displayed_value: seg.count.toLocaleString(),
                    source_datasets: ['Magnet Keyword Dataset'],
                    source_columns: ['Keyword Phrase', 'Search Volume', 'Keyword Sales'],
                    source_row_count: seg.count,
                    formula: seg.rule,
                    calculation_steps: [
                      `1. Filter keywords where: ${seg.rule}`,
                      `2. Normalized segment label: "${targetSegment}"`,
                      `3. Total keywords matching: ${seg.count.toLocaleString()}`,
                      `4. Scatter plot points: ${scatterPointCount.toLocaleString()}`,
                      missingXY > 0 ? `5. Rows excluded from scatter (missing x/y values): ${missingXY}` : '',
                      `6. Combined search volume: ${totalVolume.toLocaleString()}`,
                      `7. Combined keyword revenue: ${fmt$(totalRevenue)}`,
                      `8. Average efficiency index: ${avgEfficiency.toFixed(2)}`,
                      `9. Top 20 keywords by search volume shown below`,
                    ].filter(Boolean),
                    top_records: topKeywords,
                    aggregation_method: `Segment classification based on demand percentile and revenue efficiency index thresholds`,
                    thresholds: {
                      high: seg.key === 'demand' ? 'Demand ≥ 60 AND Efficiency ≥ 60' : seg.rule,
                      medium: 'See segment rule',
                      low: seg.key === 'low' ? 'Demand < 60 AND Efficiency < 40' : 'Other segments',
                    },
                    classification_reason: `${seg.count} keywords classified as "${seg.label}" based on rule: ${seg.rule}`,
                    confidence_note: `All keywords passed meaningful keyword validation. Thresholds: Demand Percentile 60, Efficiency Index 60 (high) and 40 (low).`,
                    data_quality_notes: missingXY > 0 ? [`${missingXY} keyword rows excluded from scatter plot due to missing or invalid demand_percentile or efficiency_score values.`] : undefined,
                    llm_used: false,
                  };
                  
                  setSelectedEvidence(ev);
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-xs font-bold">{seg.label}</span>
                </div>
                <p className="text-lg font-black font-mono" style={{ color: seg.color }}>{seg.count.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{seg.rule}</p>
              </button>
            ))}
          </div>
        </ChartContainer>
      </PageSection>

      {/* ── Keyword Rows Table ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Keyword Conversion Records</CardTitle>
          <CardDescription>
            {activeFilter === 'all'
              ? `All analyzed keywords with demand percentile, revenue efficiency, and segment classification.`
              : `Filtered view: ${quadrantLabel(activeFilter)} · ${filteredKeywordRows.length.toLocaleString()} keywords · click a row for full evidence`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={keywordColumns}
            data={filteredKeywordRows}
            pageSize={10}
            onRowClick={row => setSelectedEvidence(keywordRowEvidence(row, benchmarkRps1k))}
          />
        </CardContent>
      </Card>

      {/* ── Friction / Conversion Leaks ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            Friction Keyword Evidence
          </CardTitle>
          <CardDescription>
            Only high-demand, low-efficiency keywords contributing to the friction revenue gap.
            {frictionRowsSorted.length > 0
              ? ` Showing ${frictionRowsSorted.length.toLocaleString()} friction keyword${frictionRowsSorted.length === 1 ? '' : 's'} · sorted by largest friction revenue gap`
              : ' No friction keywords found.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={frictionColumns}
            data={frictionRowsSorted}
            pageSize={10}
            onRowClick={row => setSelectedEvidence(keywordRowEvidence(row, benchmarkRps1k))}
          />
        </CardContent>
      </Card>

      <EvidenceModal isOpen={!!selectedEvidence} onClose={() => setSelectedEvidence(null)} evidence={selectedEvidence} />
    </div>
  );
}

// ─── Public export wrapped in ErrorBoundary ───────────────────────────────────

export default function IntentEfficiency() {
  return (
    <IntentErrorBoundary>
      <IntentEfficiencyInner />
    </IntentErrorBoundary>
  );
}
