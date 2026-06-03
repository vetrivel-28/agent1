import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Drawer } from '../components/ui/Drawer';
import { cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Info, Loader2, TrendingDown, TrendingUp, X, Zap, Target } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function efficiencyColor(score: number): string {
  if (score >= 60) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function formatCurrencyPrecise(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const fractionDigits = Math.abs(n) < 1 ? 2 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

function quadrantDotColor(q: string): string {
  switch (q) {
    case 'Demand Winner':    return '#a855f7';
    case 'Hidden Gem':       return '#10b981';
    case 'Friction Keyword': return '#ef4444';
    case 'Low Priority':     return '#64748b';
    default:                 return '#94a3b8';
  }
}

const valOrMissing = (val: any, formatFn?: (v: any) => any) => {
  if (val == null || val === '') return <span className="text-[10px] uppercase font-bold text-muted-foreground/60 italic">Not Available In Source Data</span>;
  return formatFn ? formatFn(val) : val;
};

// ---------------------------------------------------------------------------
// Tooltip wrapper
// ---------------------------------------------------------------------------

function Tip({ text, children }: { text: string; children: any }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-64">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed whitespace-pre-wrap">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

interface KpiProps {
  title: string;
  value: any;
  sub?: string;
  icon: any;
  color?: string;
  bg?: string;
  tooltip?: string;
  onClick?: () => void;
}

function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip, onClick }: KpiProps) {
  return (
    <Card 
      className={cn(
        'transition-all duration-200 relative overflow-hidden', 
        onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-md',
        'hover-card-anim'
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            {tooltip && (
              <Tip text={tooltip}>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </Tip>
            )}
          </div>
          <div className={cn('p-2 rounded-lg border', bg)}>
            <span className={color}>{icon}</span>
          </div>
        </div>
        <p className={cn('text-2xl font-black leading-tight', color)}>{value}</p>
        {sub && <p className="text-[11px] font-medium text-muted-foreground mt-1.5 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Scatter tooltip
// ---------------------------------------------------------------------------

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-w-[240px]">
      <p className="font-semibold text-xs leading-snug">{d.keyword || '—'}</p>
      <div className="border-t border-border/50 pt-1 space-y-0.5">
        <p className="text-muted-foreground">Search Volume: <span className="text-foreground font-medium">{valOrMissing(d.search_volume, (v) => v.toLocaleString())}</span></p>
        <p className="text-muted-foreground">Keyword Sales Revenue: <span className="text-foreground font-medium">{valOrMissing(d.revenue, formatCurrencyPrecise)}</span></p>
        <p className="text-muted-foreground">Revenue / 1K Searches: <span className="text-foreground font-medium">{valOrMissing(d.revenue_per_1000_searches, formatCurrencyPrecise)}</span></p>
        <p className="text-muted-foreground">Revenue Efficiency Index: <span className={cn('font-medium', efficiencyColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}</span></p>
        <span className="text-xs text-muted-foreground font-bold mt-1 block">{d.quadrant}</span>
      </div>
    </div>
  );
}

export default function IntentEfficiency() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'demand' | 'friction' | 'hidden' | 'low'>('all');
  const [selectedKeyword, setSelectedKeyword] = useState<any | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<any | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(300),
  });

  const r = data?.data?.results ?? {};
  const keywordConversion = r.keyword_conversion ?? {};
  const summaryCards = r.summary_cards ?? keywordConversion.summary_cards ?? {};
  const benchmarks = r.benchmarks ?? keywordConversion.benchmarks ?? {};
  const rows: any[] = r.keyword_rows ?? keywordConversion.keyword_rows ?? r.all_keywords ?? [];
  const friction: any[] = r.friction_rows ?? keywordConversion.friction_rows ?? r.friction_keywords ?? summaryCards.friction_keywords?.items ?? [];
  const matrix = r.matrix ?? keywordConversion.matrix ?? {};
  const scatterRaw: any[] = matrix.points ?? r.scatter_data ?? [];
  const qs = matrix.segment_counts ?? r.quadrant_summary ?? {};
  const topRevenueEfficiency = r.top_revenue_efficiency_keyword ?? summaryCards.top_revenue_efficiency_keyword ?? {};
  const biggestFriction = r.biggest_friction_keyword ?? summaryCards.biggest_friction_keyword ?? {};
  const totalKeywords = r.total_keywords_analysed ?? rows.length ?? 0;

  const scatter: any[] = useMemo(() => {
    const sorted = [...scatterRaw].sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0));
    return sorted.slice(0, 300);
  }, [scatterRaw]);
  const displayScatter = useMemo(() => {
    return scatter.filter((pt) => {
      if (activeFilter === 'demand') return pt.quadrant === 'Demand Winner';
      if (activeFilter === 'friction') return pt.quadrant === 'Friction Keyword';
      if (activeFilter === 'hidden') return pt.quadrant === 'Hidden Gem';
      if (activeFilter === 'low') return pt.quadrant === 'Low Priority';
      return true;
    });
  }, [scatter, activeFilter]);

  const filteredKeywordRows = useMemo(() => {
    if (activeFilter === 'demand') return rows.filter((row) => row.segment === 'Demand Winner' || row.quadrant === 'Demand Winner');
    if (activeFilter === 'friction') return rows.filter((row) => row.segment === 'Friction Keyword' || row.quadrant === 'Friction Keyword');
    if (activeFilter === 'hidden') return rows.filter((row) => row.segment === 'Hidden Gem' || row.quadrant === 'Hidden Gem');
    if (activeFilter === 'low') return rows.filter((row) => row.segment === 'Low Priority' || row.quadrant === 'Low Priority');
    return rows;
  }, [rows, activeFilter]);

  const frictionRowsSorted = useMemo(() => {
    return [...friction].sort((a, b) => (b.estimated_revenue_leakage ?? b.recoverable_revenue ?? 0) - (a.estimated_revenue_leakage ?? a.recoverable_revenue ?? 0));
  }, [friction]);

  const keywordColumns: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword' },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: (row) => valOrMissing(row.search_volume, (v) => Number(v).toLocaleString()) },
    { header: 'Keyword Sales Revenue', accessorKey: 'keyword_revenue', cell: (row) => valOrMissing(row.keyword_revenue ?? row.revenue, formatCurrencyPrecise) },
    { header: 'Revenue / 1K Searches', accessorKey: 'revenue_per_1000_searches', cell: (row) => valOrMissing(row.revenue_per_1000_searches, formatCurrencyPrecise) },
    { header: 'Revenue Efficiency Index', accessorKey: 'efficiency_score', cell: (row) => <span className={cn('font-mono', efficiencyColor(row.efficiency_score ?? 0))}>{(row.efficiency_score ?? 0).toFixed(2)}</span> },
    { header: 'Demand Percentile', accessorKey: 'demand_percentile', cell: (row) => <span className="font-mono">{(row.demand_percentile ?? 0).toFixed(2)}</span> },
    { header: 'Segment', accessorKey: 'quadrant' },
  ];

  const frictionColumns: Column<any>[] = [
    { header: 'Keyword', accessorKey: 'keyword' },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: (row) => valOrMissing(row.search_volume, (v) => Number(v).toLocaleString()) },
    { header: 'Keyword Sales Revenue', accessorKey: 'keyword_revenue', cell: (row) => valOrMissing(row.keyword_revenue ?? row.revenue, formatCurrencyPrecise) },
    { header: 'Revenue / 1K Searches', accessorKey: 'revenue_per_1000_searches', cell: (row) => valOrMissing(row.revenue_per_1000_searches, formatCurrencyPrecise) },
    { header: 'Benchmark Revenue / 1K Searches', accessorKey: 'benchmark_revenue_per_1000_searches', cell: (row) => valOrMissing(row.benchmark_revenue_per_1000_searches, formatCurrencyPrecise) },
    { header: 'Estimated Revenue Leakage', accessorKey: 'recoverable_revenue', cell: (row) => <span className="font-mono text-red-500">{valOrMissing(row.estimated_revenue_leakage ?? row.recoverable_revenue ?? row.lost_revenue_estimate, formatCurrencyPrecise)}</span> },
    { header: 'Root Cause', accessorKey: 'root_cause' },
    { header: 'Opportunity Level', accessorKey: 'opportunity_level' },
    { header: 'View Explanation', accessorKey: 'view_explanation', cell: () => <span className="text-primary text-xs">Open</span>, sortable: false },
  ];

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-500 mb-2">Keyword Conversion Intelligence Unavailable</h2>
          <p className="text-red-500/80 max-w-lg">{getEngineErrorMessage(data, 'Missing data in Magnet dataset.')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header & Data Verification Panel */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-black tracking-tight text-gradient-primary">Keyword Conversion Intelligence</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-3xl">
            Identify which keywords successfully convert demand into sales, and pinpoint exact market revenue leaking due to poor conversion efficiency.
          </p>
          
          {activeFilter !== 'all' && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm font-semibold text-muted-foreground">Active Filter:</span>
              <span className="text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary px-3 py-1 rounded-full">
                {activeFilter}
              </span>
              <button onClick={() => setActiveFilter('all')} className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <X className="w-3 h-3" /> Clear Filter
              </button>
            </div>
          )}
        </div>
        
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm min-w-[260px]">
          <p className="text-xs text-muted-foreground uppercase">Keywords Analyzed</p>
          <p className="text-2xl font-mono font-bold">{totalKeywords}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          title="High Revenue Potential Keywords"
          value={summaryCards.high_revenue_potential?.count ?? r.high_intent_count ?? 0}
          sub="Demand percentile >= 60 and efficiency percentile >= 60"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          onClick={() => {
            setActiveFilter('demand');
            setSelectedEvidence(summaryCards.high_revenue_potential?.evidence || null);
          }}
        />
        <KpiCard
          title="Friction Keywords"
          value={summaryCards.friction_keywords?.count ?? r.friction_count ?? 0}
          sub="Demand percentile >= 60 and efficiency percentile < 40"
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          onClick={() => {
            setActiveFilter('friction');
            setSelectedEvidence(summaryCards.friction_keywords?.evidence || null);
          }}
        />
        <KpiCard
          title="Recoverable Revenue"
          value={valOrMissing(summaryCards.recoverable_revenue?.value ?? r.total_lost_revenue, formatCurrencyPrecise)}
          sub="From friction keywords only"
          icon={<Target className="w-4 h-4" />}
          color="text-amber-500"
          bg="bg-amber-500/10 border-amber-500/30"
          onClick={() => {
            setActiveFilter('friction');
            setSelectedEvidence(summaryCards.recoverable_revenue?.evidence || null);
          }}
        />
        <KpiCard
          title="Top Revenue Efficiency Keyword"
          value={
            topRevenueEfficiency.keyword 
            ? <button onClick={() => setSelectedKeyword(topRevenueEfficiency)} className="hover:underline underline-offset-4 decoration-emerald-500/50">{topRevenueEfficiency.keyword.slice(0, 18) + (topRevenueEfficiency.keyword.length > 18 ? '…' : '')}</button>
            : valOrMissing(null)
          }
          sub={topRevenueEfficiency.efficiency != null ? `Index ${topRevenueEfficiency.efficiency.toFixed(2)}` : 'Click for formula'}
          icon={<Zap className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          onClick={() => {
            if (topRevenueEfficiency.keyword) setSelectedKeyword(topRevenueEfficiency);
            setSelectedEvidence(summaryCards.top_revenue_efficiency_keyword?.evidence || null);
          }}
        />
        <KpiCard
          title="Biggest Friction Keyword"
          value={
            biggestFriction.keyword 
            ? <button onClick={() => setSelectedKeyword(biggestFriction)} className="hover:underline underline-offset-4 decoration-red-500/50">{biggestFriction.keyword.slice(0, 18) + (biggestFriction.keyword.length > 18 ? '…' : '')}</button>
            : valOrMissing(null)
          }
          sub={biggestFriction.recoverable_revenue != null ? formatCurrencyPrecise(biggestFriction.recoverable_revenue) : 'Click for formula'}
          icon={<Target className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          onClick={() => {
            setActiveFilter('friction');
            if (biggestFriction.keyword) setSelectedKeyword(biggestFriction);
            setSelectedEvidence(summaryCards.biggest_friction_keyword?.evidence || null);
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 border-b border-border/50">
            <CardTitle className="text-base flex justify-between items-center">
              Keyword Opportunity Matrix
              <Tip text="Maps keywords across demand strength and conversion efficiency to identify strategic priorities.">
                <Info className="w-4 h-4 text-muted-foreground/60 cursor-help" />
              </Tip>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="relative">
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 40, left: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis type="number" dataKey="demand_percentile" domain={[0, 100]} name="Demand Strength"
                    label={{ value: 'Demand Intensity (Search Volume Percentile)', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis type="number" dataKey="efficiency_score" domain={[0, 100]} name="Revenue Per Search Percentile"
                    label={{ value: 'Revenue Efficiency Percentile', angle: -90, position: 'insideLeft', offset: -24, style: { textAnchor: 'middle' }, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <ReferenceLine x={50} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
                  <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
                  <ReTooltip content={<ScatterTip />} />
                  <Scatter data={displayScatter} isAnimationActive={false} onClick={(e) => { if (e && e.payload) setSelectedKeyword(e.payload); }}>
                    {displayScatter.map((pt, i) => (
                      <Cell key={i} fill={quadrantDotColor(pt.quadrant)} fillOpacity={0.8} className="cursor-pointer hover:stroke-foreground stroke-[2px]" />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-border/50 pt-4">
              <button className="text-left" onClick={() => setActiveFilter(activeFilter === 'demand' ? 'all' : 'demand')}><span className="text-xs font-bold">Demand Winners ({activeFilter === 'demand' ? filteredKeywordRows.length : qs.demand_winners ?? qs.Demand_Winner ?? 0})</span></button>
              <button className="text-left" onClick={() => setActiveFilter(activeFilter === 'hidden' ? 'all' : 'hidden')}><span className="text-xs font-bold">Hidden Gems ({activeFilter === 'hidden' ? filteredKeywordRows.length : qs.hidden_gems ?? qs.Hidden_Gem ?? 0})</span></button>
              <button className="text-left" onClick={() => setActiveFilter(activeFilter === 'friction' ? 'all' : 'friction')}><span className="text-xs font-bold">Friction ({activeFilter === 'friction' ? filteredKeywordRows.length : qs.friction_keywords ?? qs.Friction_Keyword ?? 0})</span></button>
              <button className="text-left" onClick={() => setActiveFilter(activeFilter === 'low' ? 'all' : 'low')}><span className="text-xs font-bold">Low Priority ({activeFilter === 'low' ? filteredKeywordRows.length : qs.low_priority ?? qs.Low_Priority ?? 0})</span></button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 border-b border-border/50">
              <CardTitle className="text-base">Category Benchmarks</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <button className="w-full text-left p-3 rounded border" onClick={() => setSelectedEvidence(benchmarks.evidence)}>
                <p className="text-xs text-muted-foreground">Current Efficiency</p>
                <p className="font-mono">{valOrMissing(benchmarks.current_efficiency?.value, formatCurrencyPrecise)}</p>
              </button>
              <button className="w-full text-left p-3 rounded border" onClick={() => setSelectedEvidence(benchmarks.evidence)}>
                <p className="text-xs text-muted-foreground">Top Quartile</p>
                <p className="font-mono">{valOrMissing(benchmarks.top_quartile?.value, formatCurrencyPrecise)}</p>
              </button>
              <button className="w-full text-left p-3 rounded border" onClick={() => setSelectedEvidence(benchmarks.evidence)}>
                <p className="text-xs text-muted-foreground">Category Average</p>
                <p className="font-mono">{valOrMissing(benchmarks.category_average?.value, (v) => Number(v).toFixed(2))}</p>
              </button>
              <button className="w-full text-left p-3 rounded border" onClick={() => setSelectedEvidence(benchmarks.evidence)}>
                <p className="text-xs text-muted-foreground">Keyword Leakage Rate</p>
                <p className="font-mono">{valOrMissing(benchmarks.keyword_leakage_rate?.value, (v) => `${Number(v).toFixed(2)}%`)}</p>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyword Rows</CardTitle>
          <CardDescription>Click a row for full explainability details.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={keywordColumns} data={filteredKeywordRows} pageSize={10} onRowClick={(row) => setSelectedKeyword(row)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" />Conversion Leaks / Friction</CardTitle>
          <CardDescription>Deterministic leakage from benchmark gap; each row is explainable.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={frictionColumns} data={frictionRowsSorted} pageSize={10} onRowClick={(row) => setSelectedKeyword(row)} />
        </CardContent>
      </Card>

      <Drawer
        isOpen={!!selectedKeyword}
        onClose={() => setSelectedKeyword(null)}
        title="Keyword Intelligence Drilldown"
      >
        {selectedKeyword && (() => {
          const k = selectedKeyword;
          return (
            <div className="space-y-6">
              <div className="pb-4 border-b border-border/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Selected Keyword</p>
                <h2 className="text-2xl font-black text-foreground">{k.keyword}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-sm border flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: quadrantDotColor(k.quadrant) }} />
                    {k.demand_percentile >= 60 ? 'High Demand' : 'Low Demand'}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-sm bg-muted text-muted-foreground border border-border/50">
                    {k.segment || k.quadrant}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-sm border border-border/60">
                    {k.opportunity_level || 'Opportunity Unknown'}
                  </span>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2">Rule-based Explanation</p>
                <p className="text-sm">{k.rule_based_explanation || 'Classification is derived from demand and revenue efficiency percentile rules.'}</p>
                <p className="text-xs text-muted-foreground mt-2">{k.llm_explanation || 'LLM unavailable. Showing rule-based explanation.'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-border/50 p-4 rounded-xl shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Search Volume</p>
                  <p className="text-xl font-mono font-black">{valOrMissing(k.search_volume, v => v.toLocaleString())}</p>
                </div>
                <div className="bg-card border border-border/50 p-4 rounded-xl shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Keyword Revenue</p>
                  <p className="text-xl font-mono font-black text-emerald-600">{valOrMissing(k.keyword_revenue ?? k.revenue, formatCurrencyPrecise)}</p>
                </div>
                <div className="bg-card border border-border/50 p-4 rounded-xl shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Revenue / 1K Searches</p>
                  <p className="text-xl font-mono font-black">{valOrMissing(k.revenue_per_1000_searches, formatCurrencyPrecise)}</p>
                </div>
                {(k.estimated_revenue_leakage ?? k.recoverable_revenue ?? k.lost_revenue_estimate) > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl shadow-sm col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-1">Recoverable Revenue</p>
                    <p className="text-xl font-mono font-black text-red-600">{formatCurrencyPrecise(k.estimated_revenue_leakage ?? k.recoverable_revenue ?? k.lost_revenue_estimate)}</p>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border/50 p-4 rounded-xl shadow-sm space-y-4">
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/50">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Revenue Efficiency Index</p>
                    <p className="font-mono text-sm font-semibold">{(k.efficiency_score ?? 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Demand Percentile</p>
                    <p className="font-mono text-sm font-semibold">{(k.demand_percentile ?? 0).toFixed(2)}</p>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    Formula: Revenue / 1K Searches = Keyword Sales / Search Volume * 1000
                  </div>
                  {k.quadrant === 'Friction Keyword' && (
                    <>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Benchmark Revenue / 1K</p>
                        <p className="font-mono text-sm font-semibold">{valOrMissing(k.benchmark_revenue_per_1000_searches, formatCurrencyPrecise)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Efficiency Gap</p>
                        <p className="font-mono text-sm font-semibold">{valOrMissing(k.efficiency_gap_per_1000_searches, formatCurrencyPrecise)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Root Cause</p>
                        <p className="text-sm">{k.root_cause || '—'}</p>
                      </div>
                    </>
                  )}
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Source Columns</p>
                    <p className="text-sm">Keyword Phrase, Search Volume, Keyword Sales{(k.classification || '').length > 0 ? ', Classification' : ''}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Drawer>
      <Drawer isOpen={!!selectedEvidence} onClose={() => setSelectedEvidence(null)} title={selectedEvidence?.metric_name || 'Metric Explanation'}>
        {selectedEvidence && (
          <div className="space-y-3 text-sm">
            <p><strong>Source Dataset:</strong> {selectedEvidence.source_dataset}</p>
            <p><strong>Source Columns:</strong> {(selectedEvidence.source_columns || []).join(', ')}</p>
            <p><strong>Formula:</strong> {selectedEvidence.formula}</p>
            <p><strong>Thresholds:</strong> {JSON.stringify(selectedEvidence.thresholds)}</p>
            <p><strong>Rows Included:</strong> {selectedEvidence.rows_included ?? selectedEvidence.rows_matched ?? '—'}</p>
            <p><strong>Rows Excluded:</strong> {selectedEvidence.rows_excluded ?? '—'}</p>
            <p><strong>Excluded Reason:</strong> {selectedEvidence.excluded_reason}</p>
            <p><strong>Example Calculation:</strong> {JSON.stringify(selectedEvidence.example_calculation)}</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
