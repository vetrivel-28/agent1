import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Target, Zap, TrendingUp,
  DollarSign, Lightbulb, Info, Layers, X, ChevronDown,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type EvidenceMeta = {
  formula?: Record<string, string>;
  source_dataset?: string;
  columns_used?: Record<string, string | null>;
  rows_included?: number;
  rows_excluded?: number;
  total_keywords?: number;
  extreme_threshold?: number;
  high_threshold?: number;
  score_weights?: Record<string, number>;
  competition_column_used?: string | null;
  title_density_reliable?: boolean;
  revenue_signal_source?: string;
  revenue_capped?: boolean;
  revenue_cap_threshold_pct?: number;
  top_extreme_keywords?: Array<Record<string, unknown>>;
};

type WsKeyword = {
  keyword?: string;
  search_volume?: number;
  keyword_sales?: number;
  title_density?: number | null;
  whitespace_score?: number;
  opportunity_score?: number;
  opportunity_label?: string;
  opportunity_driver?: string;
  click_share?: number | null;
  conversion_share?: number | null;
  conversion_efficiency_score?: number | null;
  source_dataset?: string;
  // legacy aliases
  efficiency_score?: number | null;
  source?: string;
};

type SegmentKeywordRaw = {
  keyword?: string;
  search_volume?: number;
  click_share?: number | null;
  conversion_share?: number | null;
  keyword_sales?: number;
  conversion_efficiency_score?: number | null;
  efficiency_score?: number | null;
  classification?: string;
  source_dataset?: string;
  source?: string;
  opportunity_score?: number | null;
  opportunity_driver?: string;
  title_density?: number | null;
};

type SegmentKeywordResponse = {
  success?: boolean;
  message?: string;
  keywords?: SegmentKeywordRaw[];
  keyword_count?: number;
  raw_row_count?: number;
  raw_rows_before_dedupe?: number;
  duplicate_removed_count?: number;
  duplicate_rows_removed?: number;
  opportunity_revenue?: number;
  competitive_intensity?: string;
  primary_driver?: string;
  recommended_priority?: string;
};

type EntrySegment = {
  rank: number;
  segment: string;
  keyword_count: number;
  opportunity_revenue: number;
  revenue_represented?: number;
  avg_opportunity_score: number;
  recommended_priority?: string;
  primary_driver?: string;
  competitive_intensity?: string;
  recommended_action?: string;
  keywords?: SegmentKeywordRaw[];
  raw_rows_before_dedupe?: number;
  duplicate_rows_removed?: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function opportunityBadge(label: string): string {
  switch (label) {
    case 'Extreme Opportunity': return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    case 'High Opportunity': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'Moderate Opportunity': return 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30';
    default: return 'bg-muted text-muted-foreground border border-border';
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case 'Enter First': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'Evaluate': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    default: return 'bg-muted/60 text-muted-foreground border border-border';
  }
}

function intensityColor(level: string): string {
  if (level === 'Low') return 'text-emerald-500';
  if (level === 'High') return 'text-red-500';
  return 'text-yellow-500';
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-purple-400';
  if (score >= 65) return 'text-emerald-500';
  if (score >= 50) return 'text-yellow-500';
  return 'text-muted-foreground';
}

function formatPct(count: number, total: number): string {
  if (total <= 0) return '0.0%';
  const pct = (count / total) * 100;
  return `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
}

function effScore(kw: SegmentKeywordRaw): number | null {
  return kw.conversion_efficiency_score ?? kw.efficiency_score ?? null;
}

function srcDataset(kw: SegmentKeywordRaw): string {
  return kw.source_dataset ?? kw.source ?? 'Magnet';
}

// ─── Evidence Drawer ─────────────────────────────────────────────────────────

type DrawerMode =
  | { kind: 'kpi'; title: string; body: React.ReactNode }
  | { kind: 'segment'; segment: EntrySegment }
  | { kind: 'keyword'; keyword: WsKeyword | SegmentKeywordRaw; titleDensityReliable: boolean }
  | null;

function EvidenceDrawer({ mode, onClose }: { mode: DrawerMode; onClose: () => void }) {
  if (!mode) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-lg font-bold">
            {mode.kind === 'kpi' && mode.title}
            {mode.kind === 'segment' && `Segment: ${mode.segment.segment}`}
            {mode.kind === 'keyword' && `Keyword: ${(mode.keyword as WsKeyword).keyword ?? '—'}`}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {mode.kind === 'kpi' && mode.body}
          {mode.kind === 'segment' && <SegmentDrawerBody seg={mode.segment} />}
          {mode.kind === 'keyword' && <KeywordDrawerBody kw={mode.keyword} titleDensityReliable={mode.titleDensityReliable} />}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Segment Drawer Body ──────────────────────────────────────────────────────

function SegmentDrawerBody({ seg }: { seg: EntrySegment }) {
  const kws = seg.keywords ?? [];
  const hasClickShare = kws.some(k => k.click_share != null);
  const hasConvShare = kws.some(k => k.conversion_share != null);
  const hasEffScore = kws.some(k => (k.conversion_efficiency_score ?? k.efficiency_score) != null);
  const hasTitleDensity = kws.some(k => k.title_density != null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Rank', value: `#${seg.rank}` },
          { label: 'Keywords', value: seg.keyword_count.toLocaleString() },
          { label: 'Revenue Signal', value: formatNumber(Math.round(seg.opportunity_revenue)) },
          { label: 'Avg Score', value: seg.avg_opportunity_score != null ? `${seg.avg_opportunity_score.toFixed(1)}/100` : '—' },
        ].map((m, i) => (
          <div key={i} className="p-3 rounded-xl border border-border bg-muted/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-lg font-bold mt-1">{m.value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5 text-sm">
        {seg.recommended_priority && <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span className={cn('font-semibold', priorityBadge(seg.recommended_priority).replace('border', '').replace('border-emerald-500/30','').replace('border-amber-500/30',''))}>{seg.recommended_priority}</span></div>}
        {seg.primary_driver && <div className="flex justify-between"><span className="text-muted-foreground">Primary Driver</span><span>{seg.primary_driver}</span></div>}
        {seg.competitive_intensity && <div className="flex justify-between"><span className="text-muted-foreground">Competitive Intensity</span><span className={intensityColor(seg.competitive_intensity)}>{seg.competitive_intensity}</span></div>}
        {seg.recommended_action && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Action</span><span className="text-right">{seg.recommended_action}</span></div>}
        {(seg.raw_rows_before_dedupe ?? 0) > 0 && (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Raw rows (before dedupe)</span><span>{(seg.raw_rows_before_dedupe ?? 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unique keywords (after dedupe)</span><span>{seg.keyword_count.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Duplicates removed</span><span>{(seg.duplicate_rows_removed ?? 0).toLocaleString()}</span></div>
          </>
        )}
      </div>
      <div className="p-3 bg-muted/20 rounded-xl">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Revenue Signal Formula</p>
        <p className="text-xs font-mono text-foreground/80">
          Segment Revenue = SUM(Keyword Sales of opportunity keywords in this segment).
          Keyword Sales from Magnet dataset. Only keywords scored ≥65 (High or Extreme Opportunity) included.
        </p>
      </div>
      {kws.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Top Keywords ({kws.length.toLocaleString()} total)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Keyword</th>
                  <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Search Vol</th>
                  <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">KW Sales</th>
                  <th className="text-right py-2 text-xs text-muted-foreground font-medium">Score</th>
                  {hasClickShare && <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Click%</th>}
                  {hasConvShare && <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Conv%</th>}
                </tr>
              </thead>
              <tbody>
                {kws.slice(0, 20).map((kw, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-1.5 pr-4 font-medium max-w-[200px] truncate">{kw.keyword ?? '—'}</td>
                    <td className="py-1.5 pr-4 text-right font-mono">{formatNumber(kw.search_volume ?? 0)}</td>
                    <td className="py-1.5 pr-4 text-right font-mono">{formatNumber(kw.keyword_sales ?? 0)}</td>
                    <td className="py-1.5 text-right font-mono">
                      <span className={scoreColor(kw.opportunity_score ?? 0)}>{kw.opportunity_score?.toFixed(1) ?? '—'}</span>
                    </td>
                    {hasClickShare && <td className="py-1.5 pr-4 text-right font-mono text-muted-foreground">{kw.click_share != null ? `${kw.click_share.toFixed(1)}%` : '—'}</td>}
                    {hasConvShare && <td className="py-1.5 pr-4 text-right font-mono text-muted-foreground">{kw.conversion_share != null ? `${kw.conversion_share.toFixed(1)}%` : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {kws.length > 20 && <p className="text-xs text-muted-foreground mt-2">Showing first 20 of {kws.length.toLocaleString()} keywords.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Keyword Drawer Body ──────────────────────────────────────────────────────

function KeywordDrawerBody({ kw, titleDensityReliable }: { kw: WsKeyword | SegmentKeywordRaw; titleDensityReliable: boolean }) {
  const eff = effScore(kw as SegmentKeywordRaw);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Search Volume', value: formatNumber((kw as WsKeyword).search_volume ?? 0) },
          { label: 'Keyword Sales', value: formatNumber((kw as WsKeyword).keyword_sales ?? 0) },
          { label: 'Opportunity Score', value: (kw as WsKeyword).opportunity_score != null ? `${Number((kw as WsKeyword).opportunity_score).toFixed(1)}/100` : '—' },
          { label: 'Opportunity Tier', value: (kw as WsKeyword).opportunity_label ?? (kw as SegmentKeywordRaw).classification ?? '—' },
        ].map((m, i) => (
          <div key={i} className="p-3 rounded-xl border border-border bg-muted/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-base font-bold mt-1">{m.value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5 text-sm">
        {(kw as WsKeyword).opportunity_driver && <div className="flex justify-between"><span className="text-muted-foreground">Opportunity Driver</span><span>{(kw as WsKeyword).opportunity_driver}</span></div>}
        {(kw as WsKeyword).click_share != null && <div className="flex justify-between"><span className="text-muted-foreground">ABA Click Share</span><span>{Number((kw as WsKeyword).click_share).toFixed(2)}%</span></div>}
        {(kw as WsKeyword).conversion_share != null && <div className="flex justify-between"><span className="text-muted-foreground">ABA Conversion Share</span><span>{Number((kw as WsKeyword).conversion_share).toFixed(2)}%</span></div>}
        {eff != null && <div className="flex justify-between"><span className="text-muted-foreground">Conversion Efficiency</span><span>{eff.toFixed(1)}/100</span></div>}
        {titleDensityReliable && (kw as WsKeyword).title_density != null && (
          <div className="flex justify-between"><span className="text-muted-foreground">Title Density</span><span>{(kw as WsKeyword).title_density}</span></div>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Source Dataset</span><span>{srcDataset(kw as SegmentKeywordRaw)}</span></div>
      </div>
      <div className="p-3 bg-muted/20 rounded-xl">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Score Calculation</p>
        <p className="text-xs font-mono text-foreground/80">
          Opportunity Score = percentile-rank(Search Volume × 40% + Keyword Sales × 35% + Inverse Competition × 25%).
          Score represents where this keyword ranks within the full keyword universe.
          Extreme ≥80, High 65–79, Moderate 50–64, Low &lt;50.
        </p>
      </div>
    </div>
  );
}

// ─── KPI Evidence bodies ──────────────────────────────────────────────────────

function OverallScoreEvidence({ score, evidence, n }: { score: number; evidence: EvidenceMeta; n: number }) {
  const cols = evidence.columns_used ?? {};
  const weights = evidence.score_weights ?? {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
        <span className="text-4xl font-black font-mono">{score.toFixed(1)}</span>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Overall Whitespace Score / 100</p>
          <p className="text-xs text-muted-foreground mt-0.5">Mean opportunity score across all {n.toLocaleString()} valid keywords</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Formula</p>
        <p className="text-xs font-mono bg-muted/20 rounded-lg p-3 leading-relaxed">
          {evidence.formula?.opportunity_score ?? 'Opportunity Score = percentile-rank(Search Volume×40% + Keyword Sales×35% + Inverse Competition×25%)'}
        </p>
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Components &amp; Weights</p>
        <div className="space-y-1.5">
          {[
            { label: 'Search Volume', weight: weights.search_volume_pct ?? 0.40, col: cols.search_volume },
            { label: 'Keyword Sales', weight: weights.keyword_sales_pct ?? 0.35, col: cols.keyword_sales },
            { label: 'Inverse Competition', weight: weights.inv_competition_pct ?? 0.25, col: cols.competition },
          ].map((c, i) => (
            <div key={i} className="flex justify-between items-center text-sm p-2 border border-border rounded-lg">
              <span>{c.label}</span>
              <div className="flex items-center gap-2">
                {c.col ? <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{c.col}</span> : <span className="text-xs text-muted-foreground">unavailable</span>}
                <span className="font-mono font-bold">{(c.weight * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-3 border border-border rounded-xl"><p className="text-xs text-muted-foreground">Rows Included</p><p className="font-bold mt-1">{(evidence.rows_included ?? 0).toLocaleString()}</p></div>
        <div className="p-3 border border-border rounded-xl"><p className="text-xs text-muted-foreground">Rows Excluded</p><p className="font-bold mt-1">{(evidence.rows_excluded ?? 0).toLocaleString()}</p></div>
      </div>
      <p className="text-xs text-muted-foreground">Source dataset: {evidence.source_dataset ?? 'Magnet'}</p>
    </div>
  );
}

function TierEvidence({ tier, count, total, threshold, evidence }: {
  tier: 'extreme' | 'high'; count: number; total: number; threshold: number; evidence: EvidenceMeta;
}) {
  const isExtreme = tier === 'extreme';
  const topKws = evidence.top_extreme_keywords ?? [];
  return (
    <div className="space-y-4">
      <div className={cn('p-4 rounded-xl', isExtreme ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-emerald-500/10 border border-emerald-500/20')}>
        <p className={cn('text-3xl font-black font-mono', isExtreme ? 'text-purple-400' : 'text-emerald-500')}>{count.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatPct(count, total)} of {total.toLocaleString()} total keywords</p>
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Definition</p>
        <p className="text-xs font-mono bg-muted/20 rounded-lg p-3 leading-relaxed">
          {isExtreme ? evidence.formula?.extreme_opportunity : evidence.formula?.high_opportunity}
        </p>
      </div>
      <div className="text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Threshold</span><span className="font-mono font-bold">Opportunity Score ≥ {threshold}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Formula</span><span className="font-mono text-xs">percentile-rank(SV×40% + KS×35% + InvComp×25%)</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Competition Signal</span><span>{evidence.competition_column_used ?? 'Competing Products or Title Density'}</span></div>
      </div>
      {topKws.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Top Example Keywords</p>
          {topKws.slice(0, 5).map((k, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-border/50 text-sm">
              <span className="font-medium truncate max-w-[220px]">{String(k.keyword ?? '—')}</span>
              <span className={cn('font-mono font-bold', scoreColor(Number(k.opportunity_score ?? 0)))}>{Number(k.opportunity_score ?? 0).toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RevenueSignalEvidence({ value, evidence, pctCategory, capped }: {
  value: number; evidence: EvidenceMeta; pctCategory: number; capped: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <p className="text-3xl font-black font-mono text-amber-500">{formatNumber(Math.round(value))}</p>
        <p className="text-xs text-muted-foreground mt-1">Keyword Sales units — represents {pctCategory.toFixed(1)}% of measurable category keyword sales</p>
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Formula</p>
        <p className="text-xs font-mono bg-muted/20 rounded-lg p-3 leading-relaxed">
          {evidence.formula?.revenue_signal}
        </p>
      </div>
      <div className="text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{evidence.revenue_signal_source ?? 'Keyword Sales'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Source Dataset</span><span>Magnet</span></div>
        {evidence.columns_used?.keyword_sales && <div className="flex justify-between"><span className="text-muted-foreground">Column Used</span><span className="font-mono text-xs">{evidence.columns_used.keyword_sales}</span></div>}
        <div className="flex justify-between"><span className="text-muted-foreground">Cap Applied?</span><span>{capped ? `Yes — capped at ${evidence.revenue_cap_threshold_pct ?? 60}% of category sales` : 'No — within threshold'}</span></div>
      </div>
      <p className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
        This is a keyword-level sales signal, not a product revenue forecast. It reflects the search-demand-weighted sales units associated with opportunity keywords.
      </p>
    </div>
  );
}

function BestClusterEvidence({ cluster, segments }: { cluster: string; segments: EntrySegment[] }) {
  const seg = segments.find(s => s.segment === cluster) ?? segments[0];
  if (!seg) return <p className="text-sm text-muted-foreground">No segment data available.</p>;

  const isBroad = ['generic', 'other', 'general search terms', 'general'].includes(cluster.toLowerCase());
  const actionable = segments.filter(s => !['generic', 'other', 'general search terms', 'general'].includes(s.segment.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
        <p className="text-2xl font-bold text-cyan-400">{cluster}</p>
        {isBroad && <p className="text-xs text-yellow-500 mt-1">⚠ This is a broad catch-all segment. Consider the actionable segments below instead.</p>}
      </div>
      <div className="text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-muted-foreground">Revenue Signal</span><span className="font-mono">{formatNumber(Math.round(seg.opportunity_revenue))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Opportunity Keywords</span><span className="font-mono">{seg.keyword_count.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Avg Opportunity Score</span><span className={cn('font-mono', scoreColor(seg.avg_opportunity_score ?? 0))}>{seg.avg_opportunity_score?.toFixed(1) ?? '—'}/100</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><span>{seg.recommended_priority}</span></div>
        {seg.competitive_intensity && <div className="flex justify-between"><span className="text-muted-foreground">Competitive Intensity</span><span className={intensityColor(seg.competitive_intensity)}>{seg.competitive_intensity}</span></div>}
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Ranking Formula</p>
        <p className="text-xs font-mono bg-muted/20 rounded-lg p-3">
          Best Entry Cluster Score = Revenue × 40% + Keyword Count × 25% + Avg Score × 25% + Accessibility × 10%.
          Broad catch-all segments are deprioritised in favour of actionable named segments.
        </p>
      </div>
      {actionable.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Actionable Segments to Consider</p>
          {actionable.slice(0, 5).map((s, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-border/50 text-sm">
              <span className="font-medium">{s.segment}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{s.keyword_count.toLocaleString()} kws</span>
                <span className={cn('font-mono font-bold', scoreColor(s.avg_opportunity_score ?? 0))}>{s.avg_opportunity_score?.toFixed(1) ?? '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
