import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Drawer } from '../components/ui/Drawer';
import { formatCurrency, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, TrendingUp, TrendingDown, Zap,
  Target, Lightbulb, Info, AlertTriangle, ShieldCheck, X
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function efficiencyColor(score: number): string {
  if (score >= 75) return 'text-emerald-500';
  if (score >= 50) return 'text-cyan-500';
  if (score >= 25) return 'text-orange-500';
  return 'text-red-500';
}

function efficiencyBar(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-cyan-500';
  if (score >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}

function opportunityBadge(level: string, quadrant: string, dollarImpact?: number | null): { label: string, colorClass: string, impact: string | null } {
  const impactStr = dollarImpact != null ? formatCurrency(dollarImpact) : null;
  
  if (quadrant === 'Demand Winner' || quadrant === 'Hidden Gem') {
    switch (level) {
      case 'Critical':
      case 'High': return { label: 'Strong Performer', colorClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30', impact: impactStr };
      case 'Moderate': return { label: 'Moderate Potential', colorClass: 'bg-blue-500/15 text-blue-500 border-blue-500/30', impact: impactStr };
      case 'Low':
      default: return { label: 'Low Risk', colorClass: 'bg-slate-500/15 text-slate-500 border-slate-500/30', impact: impactStr };
    }
  } else if (quadrant === 'Friction Keyword') {
    switch (level) {
      case 'Critical':
      case 'High': return { label: 'Major Leakage', colorClass: 'bg-red-500/15 text-red-500 border-red-500/30', impact: impactStr };
      case 'Moderate': return { label: 'Moderate Leakage', colorClass: 'bg-orange-500/15 text-orange-500 border-orange-500/30', impact: impactStr };
      case 'Low':
      default: return { label: 'Minor Leakage', colorClass: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30', impact: impactStr };
    }
  }
  return { label: level || '—', colorClass: 'bg-muted text-muted-foreground border-border', impact: null };
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

function formatShare(v: number | null | undefined): string {
  if (v == null) return '—';
  return v <= 1 ? `${(v * 100).toFixed(3)}%` : `${v.toFixed(3)}`;
}

const valOrMissing = (val: any, formatFn?: (v: any) => React.ReactNode) => {
  if (val == null || val === '') return <span className="text-[10px] uppercase font-bold text-muted-foreground/60 italic">Not Available In Source Data</span>;
  return formatFn ? formatFn(val) : val;
};

// ---------------------------------------------------------------------------
// Tooltip wrapper
// ---------------------------------------------------------------------------

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
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
  value: string | number | React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
  isActive?: boolean;
  onClick?: () => void;
}

function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip, isActive, onClick }: KpiProps) {
  return (
    <Card 
      className={cn(
        'transition-all duration-200 relative overflow-hidden', 
        onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-md',
        isActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50 bg-primary/5' : 'hover-card-anim'
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className={cn("text-xs font-medium uppercase tracking-wider", isActive ? "text-primary font-bold" : "text-muted-foreground")}>{title}</p>
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
        <p className="text-muted-foreground">Search Volume: <span className="text-foreground font-medium">{valOrMissing(d.search_volume, v => v.toLocaleString())}</span></p>
        <p className="text-muted-foreground">Est. Market Revenue: <span className="text-foreground font-medium">{valOrMissing(d.revenue, formatCurrency)}</span></p>
        <p className="text-muted-foreground">Efficiency: <span className={cn('font-medium', efficiencyColor(d.efficiency_score ?? 0))}>{(d.efficiency_score ?? 0).toFixed(1)}/100</span></p>
        <span className="text-xs text-muted-foreground font-bold mt-1 block">{d.quadrant}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntentEfficiency() {
  const [activeFilter, setActiveFilter] = useState<'high_intent' | 'friction' | 'all'>('all');
  const [selectedKeyword, setSelectedKeyword] = useState<any | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(200), // Requesting more for the scatter
  });

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

  const r = data.data?.results || {};
  const scatter: any[]        = r.scatter_data         || [];
  const winners: any[]        = r.demand_winners        || [];
  const friction: any[]       = r.friction_keywords     || [];
  const hiddenGems: any[]     = r.hidden_gems           || [];
  const qs                    = r.quadrant_summary      || {};
  const ch                    = r.category_health       || {};
  const bestConverting        = r.best_converting_keyword  || {};
  const biggestFriction       = r.biggest_friction_keyword || {};
  const totalKeywords         = r.total_keywords_analysed  ?? 1;
  const dataQualityWarning    = ch.data_quality_warning    ?? false;
  const confidenceLevel       = r.confidence_level || 'Low';

  // Apply filtering to the datasets
  const displayScatter = scatter.filter(pt => {
    if (activeFilter === 'high_intent') return pt.quadrant === 'Demand Winner' || pt.quadrant === 'Hidden Gem';
    if (activeFilter === 'friction') return pt.quadrant === 'Friction Keyword';
    return true;
  });

  // Table Helpers
  const filterEmptyColumns = (cols: Column<any>[], dataset: any[]) => {
    if (!dataset || dataset.length === 0) return cols;
    return cols.filter(c => {
      if (!c.accessorKey) return true;
      if (['keyword', 'search_volume', 'efficiency_score', 'lost_revenue_estimate', 'root_cause', 'revenue'].includes(c.accessorKey as string)) return true;
      let missingCount = 0;
      dataset.forEach(row => {
        if (row[c.accessorKey as string] == null || row[c.accessorKey as string] === '') missingCount++;
      });
      return (missingCount / dataset.length) < 0.9;
    });
  };

  // Base columns
  const keywordCol: Column<any> = {
    header: 'Keyword',
    accessorKey: 'keyword',
    cell: (row) => (
      <button onClick={() => setSelectedKeyword(row)} className="font-semibold text-sm hover:text-primary transition-colors text-left flex items-center gap-1.5 group">
        {row.keyword || '—'}
        <TrendingUp className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    ),
  };
  
  const searchVolCol: Column<any> = {
    header: 'Search Volume',
    accessorKey: 'search_volume',
    cell: (row) => <span className="font-mono text-sm">{valOrMissing(row.search_volume, v => v.toLocaleString())}</span>,
  };

  const revenueCol: Column<any> = {
    header: 'Est. Market Revenue',
    accessorKey: 'revenue',
    cell: (row) => <span className="font-mono text-sm">{valOrMissing(row.revenue, formatCurrency)}</span>,
  };

  const efficiencyCol: Column<any> = {
    header: 'Efficiency Score',
    accessorKey: 'efficiency_score',
    cell: (row) => {
      const s = row.efficiency_score ?? 0;
      return (
        <div className="flex items-center gap-2">
          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', efficiencyBar(s))} style={{ width: `${s}%` }} />
          </div>
          <span className={cn('font-mono text-sm font-bold', efficiencyColor(s))}>{s.toFixed(1)}</span>
        </div>
      );
    },
  };

  const badgeCol: Column<any> = {
    header: 'Opportunity Level',
    accessorKey: 'opportunity_level',
    cell: (row) => {
      const b = opportunityBadge(row.opportunity_level ?? '', row.quadrant ?? '', row.lost_revenue_estimate);
      return (
        <Tip text={b.impact ? `Impact: ${b.impact}` : 'No dollar impact available'}>
          <span className={cn('text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm font-bold border cursor-help', b.colorClass)}>
            {b.label}
          </span>
        </Tip>
      );
    },
  };

  const rootCauseCol: Column<any> = {
    header: 'Root Cause',
    accessorKey: 'root_cause',
    cell: (row) => valOrMissing(row.root_cause, v => (
      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-sm bg-red-500/10 text-red-500">
        {v}
      </span>
    )),
  };

  const lostRevCol: Column<any> = {
    header: 'Est. Market Rev Leakage',
    accessorKey: 'lost_revenue_estimate',
    cell: (row) => <span className="font-mono text-sm font-bold text-red-600">{valOrMissing(row.lost_revenue_estimate, formatCurrency)}</span>,
  };

  // Build strict tables
  const winnersColumns = filterEmptyColumns([keywordCol, searchVolCol, revenueCol, efficiencyCol, badgeCol], winners);
  const frictionColumns = filterEmptyColumns([keywordCol, searchVolCol, revenueCol, lostRevCol, rootCauseCol, badgeCol], friction);

  // Status computation for audit card
  const processedCount = totalKeywords;
  const classifiedCount = (qs.demand_winners ?? 0) + (qs.hidden_gems ?? 0) + (qs.friction_keywords ?? 0) + (qs.low_priority ?? 0);
  const auditStatus = processedCount === classifiedCount ? 'Verified' : 'Warning';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

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
                {activeFilter === 'high_intent' ? 'High Intent (Winners & Gems)' : 'Friction Keywords'}
              </span>
              <button onClick={() => setActiveFilter('all')} className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <X className="w-3 h-3" /> Clear Filter
              </button>
            </div>
          )}
        </div>
        
        {/* Compact Audit Card */}
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm flex flex-col gap-3 min-w-[280px]">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Data Verification</span>
            <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', auditStatus === 'Verified' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-yellow-500/10 text-yellow-600')}>
              {auditStatus === 'Verified' ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {auditStatus}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Processed</span><span className="font-mono font-semibold">{processedCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Classified</span><span className="font-mono font-semibold">{classifiedCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Displayed</span><span className="font-mono font-semibold">{displayScatter.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Data Confidence</span><span className={cn('font-bold', confidenceLevel === 'High' ? 'text-emerald-500' : 'text-amber-500')}>{confidenceLevel}</span></div>
          </div>
        </div>
      </div>

      {dataQualityWarning && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Data Quality Warning</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                More than 80% of Conversion Share values are identical in this dataset. Efficiency scores may not be meaningful.
                Ensure the Magnet export includes valid ABA Total Conv. Share data before interpreting results.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          title={confidenceLevel === 'High' ? 'High Intent Keywords' : 'High Revenue Potential Keywords'}
          value={r.high_intent_count ?? 0}
          sub="Click to filter Demand Winners & Gems"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
          isActive={activeFilter === 'high_intent'}
          onClick={() => setActiveFilter(activeFilter === 'high_intent' ? 'all' : 'high_intent')}
        />
        <KpiCard
          title={confidenceLevel === 'High' ? 'Friction Keywords' : 'Low Revenue Efficiency Keywords'}
          value={r.friction_count ?? 0}
          sub="Click to filter Conversion Leaks"
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
          isActive={activeFilter === 'friction'}
          onClick={() => setActiveFilter(activeFilter === 'friction' ? 'all' : 'friction')}
        />
        <KpiCard
          title="Recoverable Revenue"
          value={valOrMissing(r.total_lost_revenue, formatCurrency)}
          sub="Estimated market revenue trapped in friction"
          icon={<Target className="w-4 h-4" />}
          color="text-amber-500"
          bg="bg-amber-500/10 border-amber-500/30"
        />
        <KpiCard
          title="Best Converting Keyword"
          value={
            bestConverting.keyword 
            ? <button onClick={() => setSelectedKeyword(bestConverting)} className="hover:underline underline-offset-4 decoration-emerald-500/50">{bestConverting.keyword.slice(0, 18) + (bestConverting.keyword.length > 18 ? '…' : '')}</button>
            : valOrMissing(null)
          }
          sub={bestConverting.efficiency != null ? `${bestConverting.efficiency.toFixed(1)}/100 score` : 'Click to drill down'}
          icon={<Zap className="w-4 h-4" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10 border-emerald-500/30"
        />
        <KpiCard
          title="Biggest Friction Keyword"
          value={
            biggestFriction.keyword 
            ? <button onClick={() => setSelectedKeyword(biggestFriction)} className="hover:underline underline-offset-4 decoration-red-500/50">{biggestFriction.keyword.slice(0, 18) + (biggestFriction.keyword.length > 18 ? '…' : '')}</button>
            : valOrMissing(null)
          }
          sub={biggestFriction.gap != null ? `${biggestFriction.gap.toFixed(1)} pts gap` : 'Click to drill down'}
          icon={<AlertTriangle className="w-4 h-4" />}
          color="text-red-500"
          bg="bg-red-500/10 border-red-500/30"
        />
      </div>

      {/* Keyword Opportunity Matrix + Category Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Scatter — 2/3 width */}
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
                  <YAxis type="number" dataKey="efficiency_score" domain={[0, 100]} name="Conversion Efficiency"
                    label={{ value: 'Monetization Efficiency (Revenue Per Search Percentile)', angle: -90, position: 'insideLeft', offset: -24, style: { textAnchor: 'middle' }, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <ReferenceLine x={50} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
                  <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 4" strokeWidth={1.5} />
                  <ReTooltip content={<ScatterTip />} />
                  <Scatter data={displayScatter} isAnimationActive={false} onClick={(e) => { if(e && e.payload) setSelectedKeyword(e.payload); }}>
                    {displayScatter.map((pt, i) => (
                      <Cell key={i} fill={quadrantDotColor(pt.quadrant)} fillOpacity={0.8} className="cursor-pointer hover:stroke-foreground stroke-[2px]" />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            
            {/* Visual Legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-border/50 pt-4">
              <Tip text="Keywords successfully converting demand into revenue. High priority for continued investment.">
                <div className="flex flex-col gap-1 cursor-help group">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground group-hover:text-purple-400 transition-colors"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Demand Winners ({qs.demand_winners})</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">High demand + strong monetization</span>
                </div>
              </Tip>
              <Tip text="Smaller demand but exceptionally efficient monetization. Great for targeted, high-ROI campaigns.">
                <div className="flex flex-col gap-1 cursor-help group">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground group-hover:text-emerald-500 transition-colors"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Hidden Gems ({qs.hidden_gems})</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Lower demand + exceptional monetization</span>
                </div>
              </Tip>
              <Tip text="Demand exists but revenue capture is weak. Fixing these prevents market revenue leakage.">
                <div className="flex flex-col gap-1 cursor-help group">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground group-hover:text-red-500 transition-colors"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Friction Keywords ({qs.friction_keywords})</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">High demand + poor monetization</span>
                </div>
              </Tip>
              <Tip text="Limited demand and limited revenue impact. Deprioritize effort here.">
                <div className="flex flex-col gap-1 cursor-help group">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground group-hover:text-slate-400 transition-colors"><span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Low Priority ({qs.low_priority})</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Low demand + low monetization</span>
                </div>
              </Tip>
            </div>
          </CardContent>
        </Card>

        {/* Category Health Benchmarks — 1/3 */}
        <div className="space-y-4">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-2 border-b border-border/50">
              <CardTitle className="text-base">Category Benchmarks</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex-1 flex flex-col gap-6">
              
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Efficiency</span>
                  <span className="font-mono text-sm font-bold">{ch.average_conversion_efficiency ?? 0}/100</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-1">
                  <div className={cn("h-full rounded-full", efficiencyBar(ch.average_conversion_efficiency ?? 0))} style={{ width: `${ch.average_conversion_efficiency ?? 0}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Cat. Avg: {Math.round((ch.average_conversion_efficiency ?? 0) * 0.8)}</span>
                  <span>Top Quartile: {Math.round(Math.min((ch.average_conversion_efficiency ?? 0) * 1.3, 95))}</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Leakage Rate</span>
                  <span className="font-mono text-sm font-bold text-red-500">{ch.conversion_leak_rate ?? '—'}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Benchmark: Category average leakage is typically 15-20%.</p>
              </div>

              <div className="mt-auto p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">Recoverable Revenue</span>
                  <span className="font-mono text-lg font-black text-amber-600 dark:text-amber-500">{valOrMissing(ch.recoverable_revenue_pool, formatCurrency)}</span>
                </div>
                <p className="text-[10px] font-medium text-amber-600/80 dark:text-amber-500/80 leading-tight">
                  This represents the total opportunity pool currently lost to friction keywords.
                </p>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>

      {/* Table 1: Demand Winners */}
      {(activeFilter === 'all' || activeFilter === 'high_intent') && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  <CardTitle className="text-base">Demand Winners</CardTitle>
                </div>
                <CardDescription>
                  Keywords combining strong search demand with high conversion efficiency. These drive the most revenue per search.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {winners.length === 0
              ? <p className="text-sm text-muted-foreground py-8 text-center bg-muted/20 rounded-lg border border-dashed border-border/50">No demand winners detected in this dataset.</p>
              : <DataTable columns={winnersColumns} data={winners} pageSize={10} />
            }
          </CardContent>
        </Card>
      )}

      {/* Table 2: Conversion Leaks */}
      {(activeFilter === 'all' || activeFilter === 'friction') && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <CardTitle className="text-base">Conversion Leaks (Friction Keywords)</CardTitle>
            </div>
            <CardDescription>
              Keywords attracting high demand but failing to monetize effectively. Fixing these represents the highest revenue recovery opportunity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {friction.length === 0
              ? <p className="text-sm text-muted-foreground py-8 text-center bg-muted/20 rounded-lg border border-dashed border-border/50">No friction keywords detected.</p>
              : <DataTable columns={frictionColumns} data={friction} pageSize={10} />
            }
          </CardContent>
        </Card>
      )}

      {/* ── UNIFIED KEYWORD DRILLDOWN DRAWER ── */}
      <Drawer
        isOpen={!!selectedKeyword}
        onClose={() => setSelectedKeyword(null)}
        title="Keyword Intelligence Drilldown"
      >
        {selectedKeyword && (() => {
          const k = selectedKeyword;
          const badge = opportunityBadge(k.opportunity_level ?? '', k.quadrant ?? '', k.lost_revenue_estimate);
          
          let explanation = "This keyword exhibits standard performance metrics for the category.";
          if (k.quadrant === 'Demand Winner') explanation = "Successfully converts high demand into revenue. Revenue per search significantly exceeds category average.";
          else if (k.quadrant === 'Hidden Gem') explanation = "Lower overall demand, but exceptionally efficient monetization. Highly profitable on a per-search basis.";
          else if (k.quadrant === 'Friction Keyword') explanation = "High search demand but weak revenue capture. A significant portion of market demand is not converting into expected sales for this rank.";
          else if (k.quadrant === 'Low Priority') explanation = "Limited demand and limited revenue impact. Optimization here yields minimal ROI.";

          return (
            <div className="space-y-6">
              <div className="pb-4 border-b border-border/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Selected Keyword</p>
                <h2 className="text-2xl font-black text-foreground">{k.keyword}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className={cn('text-xs font-bold px-2.5 py-1 rounded-sm border flex items-center gap-1.5', badge.colorClass)}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: quadrantDotColor(k.quadrant) }} />
                    {badge.label}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-sm bg-muted text-muted-foreground border border-border/50">
                    {k.quadrant}
                  </span>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Classification Explanation</p>
                    <p className="text-sm font-medium text-foreground/90 leading-relaxed">{explanation}</p>
                    {k.root_cause && (
                      <p className="text-xs font-bold text-red-500 mt-2 bg-red-500/10 px-2 py-1 rounded-sm inline-block">
                        Root Cause: {k.root_cause}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-border/50 p-4 rounded-xl shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Search Volume</p>
                  <p className="text-xl font-mono font-black">{valOrMissing(k.search_volume, v => v.toLocaleString())}</p>
                </div>
                <div className="bg-card border border-border/50 p-4 rounded-xl shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Est. Market Revenue</p>
                  <p className="text-xl font-mono font-black text-emerald-600">{valOrMissing(k.revenue, formatCurrency)}</p>
                </div>
                {k.lost_revenue_estimate > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl shadow-sm col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-1">Est. Market Rev Leakage</p>
                    <p className="text-xl font-mono font-black text-red-600">{formatCurrency(k.lost_revenue_estimate)}</p>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border/50 p-4 rounded-xl shadow-sm space-y-4">
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Efficiency Score</span>
                    <span className={cn('font-mono text-sm font-bold', efficiencyColor(k.efficiency_score ?? 0))}>{(k.efficiency_score ?? 0).toFixed(1)}/100</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", efficiencyBar(k.efficiency_score ?? 0))} style={{ width: `${k.efficiency_score ?? 0}%` }} />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/50">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Click Share</p>
                    <p className="font-mono text-sm font-semibold">{formatShare(k.click_share)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Conv Share</p>
                    <p className="font-mono text-sm font-semibold">{formatShare(k.conv_share)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Missing Metrics</p>
                    <p className="text-xs text-muted-foreground italic leading-tight">
                      {confidenceLevel === 'High' ? 'All required conversion metrics are present.' : 'Raw Clicks, Orders, and Conversion Rate are not available in source data.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Drawer>

    </motion.div>
  );
}
