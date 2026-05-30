import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle,
  Loader2,
  TrendingUp,
  Shield,
  Target,
  Users,
  BarChart3,
  Lightbulb,
  Crown,
  Info,
  Zap,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

// ---------------------------------------------------------------------------
// Pure helpers — no logic changes, display only
// ---------------------------------------------------------------------------

function scoreColor(score: number, invert = false): string {
  const s = invert ? 100 - score : score;
  if (s <= 25) return 'text-emerald-500';
  if (s <= 50) return 'text-yellow-500';
  if (s <= 75) return 'text-orange-500';
  return 'text-red-500';
}

function scoreBg(score: number, invert = false): string {
  const s = invert ? 100 - score : score;
  if (s <= 25) return 'bg-emerald-500/10 border-emerald-500/30';
  if (s <= 50) return 'bg-yellow-500/10 border-yellow-500/30';
  if (s <= 75) return 'bg-orange-500/10 border-orange-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function riskColor(risk: string): string {
  switch (risk) {
    case 'Low Risk': return 'text-emerald-500';
    case 'Moderate Risk': return 'text-yellow-500';
    case 'High Risk': return 'text-orange-500';
    case 'Extreme Risk': return 'text-red-500';
    default: return 'text-muted-foreground';
  }
}

function riskBg(risk: string): string {
  switch (risk) {
    case 'Low Risk': return 'bg-emerald-500/10 border-emerald-500/30';
    case 'Moderate Risk': return 'bg-yellow-500/10 border-yellow-500/30';
    case 'High Risk': return 'bg-orange-500/10 border-orange-500/30';
    case 'Extreme Risk': return 'bg-red-500/10 border-red-500/30';
    default: return 'bg-muted border-border';
  }
}

function tierBadgeClass(tier: string): string {
  switch (tier) {
    case 'Market Leader':    return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    case 'Major Player':     return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    case 'Strong Challenger':return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30';
    case 'Emerging Player':  return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    default:                 return 'bg-muted text-muted-foreground border border-border';
  }
}

// Change 6 — gap severity helpers
function gapColor(gap: number): string {
  const abs = Math.abs(gap);
  if (abs <= 10) return 'text-yellow-500';
  if (abs <= 25) return 'text-orange-500';
  return 'text-red-500';
}

function gapLabel(gap: number): string {
  const abs = Math.abs(gap);
  if (abs <= 10) return 'Low Gap';
  if (abs <= 25) return 'Moderate Gap';
  return 'Large Gap';
}

// Change 4 — competitive pressure derived from existing metrics (frontend-only)
function competitivePressure(hhi: number, top3Share: number, brandCount: number): { label: string; color: string; bg: string } {
  // Simple weighted score: 50% HHI normalised + 30% top3 + 20% brand density
  const hhiNorm = Math.min(hhi / 10000, 1) * 100;
  const brandDensity = Math.min(brandCount / 200, 1) * 100;
  const score = 0.5 * hhiNorm + 0.3 * top3Share + 0.2 * brandDensity;
  if (score <= 25) return { label: 'Low Pressure',      color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30' };
  if (score <= 50) return { label: 'Moderate Pressure', color: 'text-yellow-500',  bg: 'bg-yellow-500/10 border-yellow-500/30' };
  if (score <= 75) return { label: 'High Pressure',     color: 'text-orange-500',  bg: 'bg-orange-500/10 border-orange-500/30' };
  return              { label: 'Extreme Pressure',   color: 'text-red-500',     bg: 'bg-red-500/10 border-red-500/30' };
}

// ---------------------------------------------------------------------------
// Tooltip wrapper
// ---------------------------------------------------------------------------

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-60">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI ScoreCard
// ---------------------------------------------------------------------------

interface ScoreCardProps {
  title: string;
  tooltip?: string;
  score?: number;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  invert?: boolean;
  isRisk?: boolean;
  riskValue?: string;
  isLeader?: boolean;
  leaderShare?: number;
  leaderPosition?: string;
  isPressure?: boolean;
  pressureLabel?: string;
  pressureColor?: string;
  pressureBg?: string;
}

function ScoreCard({
  title, tooltip, score, label, sublabel, icon,
  invert = false, isRisk = false, riskValue,
  isLeader = false, leaderShare, leaderPosition,
  isPressure = false, pressureLabel, pressureColor, pressureBg,
}: ScoreCardProps) {
  const colorClass = isRisk && riskValue
    ? riskColor(riskValue)
    : isPressure && pressureColor
      ? pressureColor
      : scoreColor(score ?? 0, invert);
  const bgClass = isRisk && riskValue
    ? riskBg(riskValue)
    : isPressure && pressureBg
      ? pressureBg
      : scoreBg(score ?? 0, invert);

  return (
    <Card className="hover-card-anim">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {tooltip && (
              <Tip text={tooltip}>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </Tip>
            )}
          </div>
          <div className={cn('p-2 rounded-lg border', bgClass)}>
            <span className={colorClass}>{icon}</span>
          </div>
        </div>
        <div className="space-y-0.5">
          {isLeader ? (
            <>
              <p className="text-xl font-bold leading-tight truncate" title={label}>{label}</p>
              {leaderShare !== undefined && (
                <p className={cn('text-2xl font-bold', colorClass)}>{leaderShare.toFixed(1)}%</p>
              )}
              {leaderPosition && <p className="text-xs font-medium text-muted-foreground">{leaderPosition}</p>}
            </>
          ) : isPressure ? (
            <>
              <p className={cn('text-2xl font-bold', colorClass)}>{pressureLabel}</p>
              {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
            </>
          ) : score !== undefined ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className={cn('text-3xl font-bold', colorClass)}>{score}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <p className="text-sm font-medium">{label}</p>
              {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
            </>
          ) : (
            <>
              <span className={cn('text-2xl font-bold', colorClass)}>{riskValue}</span>
              <p className="text-sm font-medium">{label}</p>
              {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stacked concentration bar
// ---------------------------------------------------------------------------

function ConcentrationBar({ top1, top3, top5 }: { top1: number; top3: number; top5: number }) {
  const others = Math.max(0, 100 - top5);
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Control Distribution</p>
      <div className="flex h-10 rounded-lg overflow-hidden w-full">
        <div className="bg-purple-500 flex items-center justify-center text-sm font-bold text-white transition-all"
          style={{ width: `${top1}%` }} title={`#1 Brand: ${top1.toFixed(1)}%`}>
          {top1 > 8 ? `${top1.toFixed(1)}%` : ''}
        </div>
        <div className="bg-blue-500 flex items-center justify-center text-sm font-bold text-white transition-all"
          style={{ width: `${Math.max(0, top3 - top1)}%` }} title={`#2–3: ${(top3 - top1).toFixed(1)}%`}>
          {(top3 - top1) > 8 ? `${(top3 - top1).toFixed(1)}%` : ''}
        </div>
        <div className="bg-cyan-500 flex items-center justify-center text-sm font-bold text-white transition-all"
          style={{ width: `${Math.max(0, top5 - top3)}%` }} title={`#4–5: ${(top5 - top3).toFixed(1)}%`}>
          {(top5 - top3) > 8 ? `${(top5 - top3).toFixed(1)}%` : ''}
        </div>
        <div className="bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground transition-all"
          style={{ width: `${others}%` }} title={`Others: ${others.toFixed(1)}%`}>
          {others > 8 ? `${others.toFixed(1)}%` : ''}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block" />Top Brand ({top1.toFixed(1)}%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />Top 3 ({top3.toFixed(1)}%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block" />Top 5 ({top5.toFixed(1)}%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30 inline-block" />Others ({others.toFixed(1)}%)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart tooltip
// ---------------------------------------------------------------------------

function CustomBarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
      <p className="font-semibold">{d.fullBrand ?? d.brand}</p>
      <p className="text-muted-foreground">Revenue: <span className="text-foreground font-medium">{formatCurrency(d.revenue)}</span></p>
      <p className="text-muted-foreground">Market Share: <span className="text-foreground font-medium">{d.market_share_pct?.toFixed(2)}%</span></p>
      <p className="text-muted-foreground">Tier: <span className="text-foreground font-medium">{d.tier}</span></p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MarketConcentration() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-concentration'],
    queryFn: () => api.getMarketConcentration(50),
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
          <h2 className="text-xl font-bold text-red-500 mb-2">Market Structure Unavailable</h2>
          <p className="text-red-500/80">{getEngineErrorMessage(data, 'Requires BlackBox with Brand and Revenue columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const r = data.results;
  const topBrands: any[] = r.top_brands_by_market_share || [];
  const insights: { category: string; text: string }[] = r.strategic_insights || [];

  // Change 4 — competitive pressure (frontend-only, uses existing fields)
  const totalBrands: number = r.fragmentation_analysis?.total_brands ?? 0;
  const pressure = competitivePressure(r.hhi_score ?? 0, r.top_3_share ?? 0, totalBrands);

  // Change 2 — bar chart: top 5 + Others aggregated
  const top5Brands = topBrands.slice(0, 5);
  const othersRevenue = topBrands.slice(5).reduce((sum: number, b: any) => sum + (b.revenue ?? 0), 0);
  const othersShare = topBrands.slice(5).reduce((sum: number, b: any) => sum + (b.market_share_pct ?? 0), 0);
  const barData = [
    ...top5Brands.map((b: any) => ({
      ...b,
      brand: b.brand?.length > 18 ? b.brand.slice(0, 16) + '…' : b.brand,
      fullBrand: b.brand,
    })),
    ...(othersShare > 0 ? [{
      rank: 99,
      brand: 'Others',
      fullBrand: 'Others (aggregated)',
      revenue: othersRevenue,
      market_share_pct: parseFloat(othersShare.toFixed(2)),
      tier: 'Long Tail',
    }] : []),
  ];

  const barColor = (rank: number) => {
    if (rank === 1)  return '#a855f7';
    if (rank <= 3)   return '#3b82f6';
    if (rank <= 5)   return '#06b6d4';
    return '#475569'; // Others
  };

  // Change 7 — long tail share (brands outside top 5)
  const longTailShare = Math.max(0, 100 - (r.top_5_share ?? 0));

  // Table columns — Change 6: gap severity colours + tooltip
  const columns: Column<any>[] = [
    {
      header: '#',
      accessorKey: 'rank',
      cell: (row) => (
        <span className={cn('font-bold text-sm',
          row.rank === 1 ? 'text-purple-400' : row.rank <= 3 ? 'text-blue-400' : 'text-muted-foreground')}>
          {row.rank === 1 ? '👑' : ''} {row.rank}
        </span>
      ),
    },
    {
      header: 'Brand',
      accessorKey: 'brand',
      cell: (row) => <span className="font-semibold">{row.brand}</span>,
    },
    {
      header: 'Revenue',
      accessorKey: 'revenue',
      cell: (row) => row.revenue != null ? formatCurrency(row.revenue) : '—',
    },
    {
      header: 'Market Share',
      accessorKey: 'market_share_pct',
      cell: (row) => {
        const pct = row.market_share_pct ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="font-mono text-sm">{pct.toFixed(2)}%</span>
          </div>
        );
      },
    },
    {
      header: 'Gap to Leader',
      accessorKey: 'gap_to_leader',
      cell: (row) => {
        if (row.rank === 1) return <span className="text-xs text-purple-400 font-semibold">— Leader</span>;
        const gap = row.gap_to_leader ?? 0;
        const color = gapColor(gap);
        const severity = gapLabel(gap);
        return (
          <Tip text={`Distance from market leader. ${severity}: ${Math.abs(gap).toFixed(1)}pp behind.`}>
            <div className="flex items-center gap-1.5 cursor-help">
              <span className={cn('font-mono text-sm font-medium', color)}>{gap.toFixed(1)}%</span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full border font-medium',
                Math.abs(gap) <= 10 ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                Math.abs(gap) <= 25 ? 'bg-orange-500/10 text-orange-500 border-orange-500/30' :
                'bg-red-500/10 text-red-500 border-red-500/30'
              )}>{severity}</span>
            </div>
          </Tip>
        );
      },
    },
    {
      header: 'Tier',
      accessorKey: 'tier',
      cell: (row) => (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', tierBadgeClass(row.tier))}>
          {row.tier}
        </span>
      ),
    },
    {
      header: 'Competitive Position',
      accessorKey: 'competitive_position',
      cell: (row) => <span className="text-sm text-muted-foreground">{row.competitive_position}</span>,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Market Concentration</h1>
        <p className="text-muted-foreground mt-1">
          Strategic market intelligence — concentration, control, entry difficulty, and opportunity.
        </p>
      </div>

      {/* ── KPI Cards — 8 across (Change 4: Competitive Pressure added, Change 5: Leader enhanced) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">

        {/* Change 5 — Market Leader with position label */}
        <ScoreCard
          title="Market Leader"
          tooltip="The brand with the highest revenue share in this market."
          label={r.market_leader_name ?? r.largest_brand_name ?? '—'}
          sublabel="Largest market participant"
          icon={<Crown className="w-4 h-4" />}
          isLeader
          leaderShare={r.market_leader_share ?? r.largest_brand_share}
          leaderPosition={topBrands[0]?.competitive_position ?? 'Category Dominant'}
        />

        <ScoreCard
          title="Market Concentration"
          tooltip="Measures overall market concentration based on HHI. Higher = more concentrated. Formula: (HHI / 10,000) × 100."
          score={r.concentration_score}
          label={r.market_structure}
          sublabel={`HHI ${r.hhi_score?.toLocaleString()}`}
          icon={<BarChart3 className="w-4 h-4" />}
        />

        <ScoreCard
          title="Top 3 Control"
          score={Math.round(r.top_3_share ?? 0)}
          label={`${(r.top_3_share ?? 0).toFixed(1)}% of revenue`}
          sublabel="Combined top 3 brands"
          icon={<Crown className="w-4 h-4" />}
        />

        <ScoreCard
          title="Top 5 Control"
          score={Math.round(r.top_5_share ?? 0)}
          label={`${(r.top_5_share ?? 0).toFixed(1)}% of revenue`}
          sublabel="Combined top 5 brands"
          icon={<Users className="w-4 h-4" />}
        />

        {/* Change 4 — Competitive Pressure */}
        <ScoreCard
          title="Competitive Pressure"
          tooltip={`Derived from HHI (50%), Top-3 share (30%), and brand count (20%). Reflects how intensely brands compete for market share.`}
          label={pressure.label}
          sublabel={`${totalBrands} active brands`}
          icon={<Zap className="w-4 h-4" />}
          isPressure
          pressureLabel={pressure.label}
          pressureColor={pressure.color}
          pressureBg={pressure.bg}
        />

        <ScoreCard
          title="Entry Difficulty"
          tooltip="40% HHI concentration · 30% Top-5 share · 20% revenue density · 10% brand density. Higher = harder to enter."
          score={r.entry_difficulty_score}
          label={r.entry_difficulty_classification}
          sublabel="Barrier to entry"
          icon={<Shield className="w-4 h-4" />}
        />

        <ScoreCard
          title="Market Accessibility"
          tooltip="How open the market is to new entrants. Formula: 100 − Entry Difficulty. Higher = easier to access."
          score={r.market_accessibility_score ?? r.opportunity_score}
          label={r.market_accessibility_classification ?? r.opportunity_classification}
          sublabel="Market openness"
          icon={<Target className="w-4 h-4" />}
          invert
        />

        <ScoreCard
          title="Dominant Player Risk"
          tooltip="Measures dependency on the largest competitor. Based on the market leader's revenue share relative to the market."
          label={r.dominant_player_risk}
          sublabel={`${r.largest_brand_name} controls ${(r.largest_brand_share ?? 0).toFixed(1)}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          isRisk
          riskValue={r.dominant_player_risk}
        />
      </div>

      {/* ── Change 1: Strategic Intelligence moved up — before analytics ── */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <CardTitle className="text-base">Strategic Intelligence</CardTitle>
            </div>
            <CardDescription>Market conclusions — read this before the charts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {insights.map((insight, i) => {
                const categoryStyles: Record<string, { border: string; badge: string; dot: string }> = {
                  'Key Finding':      { border: 'border-purple-500/30', badge: 'bg-purple-500/10 text-purple-400',  dot: 'bg-purple-500' },
                  'Market Structure': { border: 'border-blue-500/30',   badge: 'bg-blue-500/10 text-blue-400',     dot: 'bg-blue-500' },
                  'Entry Conditions': { border: 'border-orange-500/30', badge: 'bg-orange-500/10 text-orange-400', dot: 'bg-orange-500' },
                  'Opportunity':      { border: 'border-emerald-500/30',badge: 'bg-emerald-500/10 text-emerald-400',dot: 'bg-emerald-500' },
                  'Risk':             { border: 'border-red-500/30',    badge: 'bg-red-500/10 text-red-400',       dot: 'bg-red-500' },
                };
                const style = categoryStyles[insight.category] ?? { border: 'border-border', badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' };
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={cn('rounded-xl border p-4 space-y-2', style.border)}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)} />
                      <span className={cn('text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', style.badge)}>
                        {insight.category}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{insight.text}</p>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Change 8: Market Structure panel — primary/secondary hierarchy ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Market Structure</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary metrics — large, prominent */}
            <div className="space-y-3">
              <div className="rounded-xl bg-muted/40 p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Market Structure</p>
                <p className="text-xl font-bold">{r.market_structure ?? '—'}</p>
                <p className="text-xs text-muted-foreground">HHI-based classification</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Market Shape</p>
                  <Tip text="Leader Dominated: top brand >40% · Oligopoly: top 3 >70% · Fragmented: HHI <1500 · Open Market: long tail >40% · Competitive Market: otherwise">
                    <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                  </Tip>
                </div>
                <p className="text-xl font-bold">{r.market_shape ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Competitive structure type</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">HHI Score</p>
                <p className="text-xl font-bold font-mono">{r.hhi_score?.toLocaleString() ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Raw index (0 – 10,000)</p>
              </div>
            </div>
            {/* Secondary metrics — smaller */}
            <div className="border-t border-border/50 pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Supporting Data</p>
              {[
                { label: 'Brand Count',        value: totalBrands.toLocaleString(),                                          sub: 'Active in market' },
                { label: 'Market Revenue',     value: formatCurrency(r.fragmentation_analysis?.total_market_revenue ?? 0),   sub: 'Aggregate revenue' },
                { label: 'Concentration Score',value: `${r.concentration_score} / 100`,                                      sub: 'Intensity of concentration' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.sub}</p>
                  </div>
                  <span className="text-sm font-bold font-mono text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Market Control Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Market Control Breakdown</CardTitle>
            <CardDescription>How revenue is distributed across the competitive hierarchy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ConcentrationBar
              top1={r.largest_brand_share ?? 0}
              top3={r.top_3_share ?? 0}
              top5={r.top_5_share ?? 0}
            />
            {/* Change 7 — Long Tail Share as dedicated tile alongside the others */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Top Brand Control', value: `${(r.largest_brand_share ?? 0).toFixed(1)}%`, name: r.largest_brand_name, color: 'text-purple-400' },
                { label: 'Top 3 Control',     value: `${(r.top_3_share ?? 0).toFixed(1)}%`,         name: 'Combined share',     color: 'text-blue-400' },
                { label: 'Top 5 Control',     value: `${(r.top_5_share ?? 0).toFixed(1)}%`,         name: 'Combined share',     color: 'text-cyan-400' },
                { label: 'Long Tail Share',   value: `${longTailShare.toFixed(1)}%`,                 name: 'Outside dominant brands', color: 'text-muted-foreground',
                  tooltip: 'Revenue controlled by brands outside the top 5. Higher = more fragmented tail.' },
              ].map((item: any) => (
                <div key={item.label} className="bg-muted/40 rounded-xl p-4 text-center">
                  <p className={cn('text-3xl font-bold', item.color)}>{item.value}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <p className="text-xs font-semibold">{item.label}</p>
                    {item.tooltip && (
                      <Tip text={item.tooltip}>
                        <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                      </Tip>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{item.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Change 2: Bar chart — Top 5 + Others ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market Share Distribution — Top 5 Brands + Others</CardTitle>
          <CardDescription>Dominant brands isolated for clarity. Others aggregates all remaining brands.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
              <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="brand" width={140}
                tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.4)' }} />
              <Bar dataKey="market_share_pct" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {barData.map((entry: any) => (
                  <Cell key={`${entry.rank}-${entry.brand}`} fill={barColor(entry.rank)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Change 3: Merged Entry Difficulty + Market Accessibility card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-500" />
            <CardTitle className="text-base">Entry Conditions</CardTitle>
          </div>
          <CardDescription>Entry Difficulty and Market Accessibility are two views of the same barrier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Entry Difficulty — primary */}
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Entry Difficulty</p>
                  <div className="flex items-baseline gap-1">
                    <span className={cn('text-4xl font-bold', scoreColor(r.entry_difficulty_score ?? 0))}>
                      {r.entry_difficulty_score}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                  </div>
                  <p className="text-sm font-semibold mt-0.5">{r.entry_difficulty_classification}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-0.5">
                  <p>40% HHI concentration</p>
                  <p>30% Top-5 share</p>
                  <p>20% Revenue density</p>
                  <p>10% Brand density</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div className={cn('h-2.5 rounded-full transition-all',
                  (r.entry_difficulty_score ?? 0) > 75 ? 'bg-red-500' :
                  (r.entry_difficulty_score ?? 0) > 50 ? 'bg-orange-500' :
                  (r.entry_difficulty_score ?? 0) > 25 ? 'bg-yellow-500' : 'bg-emerald-500')}
                  style={{ width: `${r.entry_difficulty_score ?? 0}%` }} />
              </div>
              <div className="grid grid-cols-4 text-xs text-center text-muted-foreground">
                <span>Easy</span><span>Moderate</span><span>Difficult</span><span>Defended</span>
              </div>
            </div>

            {/* Market Accessibility — secondary, inverse view */}
            <div className="space-y-3 border-l border-border/50 pl-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Market Accessibility</p>
                  <div className="flex items-baseline gap-1">
                    <span className={cn('text-4xl font-bold', scoreColor(r.market_accessibility_score ?? r.opportunity_score ?? 0, true))}>
                      {r.market_accessibility_score ?? r.opportunity_score}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                  </div>
                  <p className="text-sm font-semibold mt-0.5">{r.market_accessibility_classification ?? r.opportunity_classification}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-0.5">
                  <p>Formula:</p>
                  <p>100 − Entry Difficulty</p>
                  <p className="mt-1">Higher = easier entry</p>
                  <p>Lower = more defended</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div className={cn('h-2.5 rounded-full transition-all',
                  (r.market_accessibility_score ?? r.opportunity_score ?? 0) >= 75 ? 'bg-emerald-500' :
                  (r.market_accessibility_score ?? r.opportunity_score ?? 0) >= 50 ? 'bg-cyan-500' :
                  (r.market_accessibility_score ?? r.opportunity_score ?? 0) >= 25 ? 'bg-yellow-500' : 'bg-red-500')}
                  style={{ width: `${r.market_accessibility_score ?? r.opportunity_score ?? 0}%` }} />
              </div>
              <div className="grid grid-cols-4 text-xs text-center text-muted-foreground">
                <span>Defended</span><span>Difficult</span><span>Moderate</span><span>Accessible</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Brand Table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Market Share — Full Ranking</CardTitle>
          <CardDescription>All brands ranked by revenue share. Gap to Leader shows distance from the market leader in percentage points.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={topBrands} pageSize={15} />
        </CardContent>
      </Card>

    </motion.div>
  );
}
