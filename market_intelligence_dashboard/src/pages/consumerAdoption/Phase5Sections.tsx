/**
 * Phase5Sections.tsx
 *
 * Section 9 — Scenario Testing (pricing + smart sentiment; NO competitive scenarios)
 * Section 10 — Final Executive Summary
 *
 * Changes from prior version:
 *  - Competitive scenarios REMOVED (New Entrant / Increased Competition / Brand Consolidation)
 *  - Pricing scenarios now include dataset-driven segment filter tabs
 *  - Sentiment scenario shows chosen lever combination with reasoning
 *  - Layout improved for readability
 */

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell,
} from 'recharts';
import {
  TrendingUp, AlertCircle, FileText, ListChecks, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { PageSection } from '../../components/layout/PageSection';
import { ChartContainer } from '../../components/ui/ChartContainer';
import { cn } from '../../utils/cn';
import { InsightModal } from './InsightModal';
import type { InsightModalData } from './InsightModal';
import {
  buildPricingScenarioModal,
  buildSentimentScenarioModal,
} from './modalContent';
import type { ScenarioTesting, SimResults, PricingScenario, SentimentScenario, SegmentFilter } from './types';

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; fill?: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-bold text-foreground">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || '#8B5CF6' }}>
          {p.name}: <span className="font-mono font-bold">
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
};

// ─── Scenario Testing (Section 9) ────────────────────────────────────────────

export function ScenarioTestingSection({ data }: { data: ScenarioTesting }) {
  const [pricingTab, setPricingTab]           = useState(0);
  const [activeFilter, setActiveFilter]       = useState<string | null>(null);
  const [sentimentOpen, setSentimentOpen]     = useState(false);
  const [modal, setModal]                     = useState<InsightModalData | null>(null);

  const pricing        = data.pricing_scenarios || [];
  const segmentFilters = data.segment_filters || [];
  const selected       = pricing[pricingTab];
  const sentiment      = data.sentiment_scenario;

  const openPricingModal  = (p: PricingScenario) => setModal(buildPricingScenarioModal(p));
  const openSentimentModal = (sc: SentimentScenario) => setModal(buildSentimentScenarioModal(sc));

  const scenarioInsight = (p: PricingScenario): string => {
    if (p.pct_change > 0) {
      return p.revenue_change_pct >= 0
        ? `Raising price by ${p.pct_change}% increases revenue (+${p.revenue_change_pct.toFixed(1)}%). The premium price signals quality and the market tolerates this level despite a slight adoption drop.`
        : `Raising price by ${p.pct_change}% reduces net revenue (${p.revenue_change_pct.toFixed(1)}%). The adoption drop from price-sensitive segments outweighs the unit price gain — consider a smaller increase or premium positioning.`;
    }
    return p.revenue_change_pct >= 0
      ? `Dropping price by ${Math.abs(p.pct_change)}% grows net revenue (+${p.revenue_change_pct.toFixed(1)}%). Volume gain from price-sensitive segments more than offsets the unit margin reduction.`
      : `Dropping price by ${Math.abs(p.pct_change)}% cuts net revenue (${p.revenue_change_pct.toFixed(1)}%). Volume uplift does not offset the margin reduction at this price tier.`;
  };

  return (
    <>
      <InsightModal data={modal} onClose={() => setModal(null)} />

      <PageSection title="9. Scenario Testing">

        {/* ── Pricing Scenarios ── */}
        <Card className="border-border/40 mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Pricing Scenarios</CardTitle>
            <CardDescription>
              Dataset-anchored impact of price changes on adoption, conversion, and revenue.
              Click any scenario tab or segment filter to explore.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Price scenario tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {pricing.map((p, i) => (
                <button
                  key={p.scenario}
                  onClick={() => setPricingTab(i)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-md border font-medium transition-colors',
                    pricingTab === i
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p.scenario}
                </button>
              ))}
            </div>

            {/* Segment filter tabs (dataset-driven) */}
            {segmentFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Show impact on:
                </span>
                <button
                  onClick={() => setActiveFilter(null)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md border font-medium transition-colors',
                    activeFilter === null
                      ? 'bg-muted text-foreground border-border'
                      : 'border-border/50 text-muted-foreground hover:text-foreground',
                  )}
                >
                  All segments
                </button>
                {segmentFilters.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(activeFilter === f.id ? null : f.id)}
                    title={f.description}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-md border font-medium transition-colors',
                      activeFilter === f.id
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'border-border/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <>
                {/* Metric cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'Base Adoption', value: selected.base_intent?.toFixed(1), highlight: null },
                    { label: 'New Adoption', value: selected.new_intent?.toFixed(1), highlight: null },
                    {
                      label: 'Adoption Change',
                      value: `${selected.adoption_delta >= 0 ? '+' : ''}${selected.adoption_delta?.toFixed(1)}`,
                      highlight: selected.adoption_delta,
                    },
                    {
                      label: 'Revenue Change',
                      value: `${selected.revenue_change_pct >= 0 ? '+' : ''}${selected.revenue_change_pct?.toFixed(1)}%`,
                      highlight: selected.revenue_change_pct,
                    },
                  ].map((m) => (
                    <div key={m.label} className="p-3 bg-muted/30 rounded-lg border border-border/40 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                      <p className={cn(
                        'text-lg font-black font-mono mt-1',
                        m.highlight != null
                          ? m.highlight >= 0 ? 'text-emerald-500' : 'text-red-500'
                          : 'text-primary',
                      )}>
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Insight */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm text-foreground/80 mb-4">
                  {scenarioInsight(selected)}
                </div>

                <button
                  onClick={() => openPricingModal(selected)}
                  className="text-xs text-primary hover:underline"
                >
                  View full calculation for {selected.scenario} →
                </button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Revenue Impact Chart ── */}
        {pricing.length > 0 && (
          <>
            <ChartContainer
              title="Pricing Impact — Revenue Change by Scenario"
              description="How each price change shifts modeled revenue relative to the current dataset baseline"
              xAxisLabel="Scenario"
              yAxisLabel="Revenue Δ %"
              businessExplanation="Green bars = net-positive revenue impact. Red bars = price change costs more than it earns through adoption loss. Use this to find the optimal price point for this product and market."
            >
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={pricing.map((p) => ({ name: p.scenario, value: p.revenue_change_pct, pct: p.pct_change }))}
                  margin={{ top: 4, right: 8, bottom: 52, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    angle={-30}
                    textAnchor="end"
                    height={64}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Revenue Δ %" radius={[3, 3, 0, 0]}>
                    {pricing.map((p, i) => (
                      <Cell key={i} fill={p.revenue_change_pct >= 0 ? '#10B981' : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            {/* Revenue chart insight */}
            {(() => {
              const best = pricing.reduce((a, b) => b.revenue_change_pct > a.revenue_change_pct ? b : a, pricing[0]);
              const worst = pricing.reduce((a, b) => b.revenue_change_pct < a.revenue_change_pct ? b : a, pricing[0]);
              const positiveCount = pricing.filter(p => p.revenue_change_pct >= 0).length;
              return (
                <div className="mt-3 p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">Pricing insight: </span>
                  Best scenario is <span className="text-emerald-400 font-bold">{best.scenario}</span>
                  {best.revenue_change_pct !== 0 && ` (+${best.revenue_change_pct.toFixed(1)}% revenue)`}.
                  {' '}Worst is <span className="text-red-400 font-bold">{worst.scenario}</span>
                  {worst.revenue_change_pct < 0 && ` (${worst.revenue_change_pct.toFixed(1)}% revenue)`}.
                  {' '}{positiveCount >= 4
                    ? 'This market tolerates price changes well — most scenarios maintain positive revenue.'
                    : positiveCount >= 2
                    ? 'Revenue is sensitive to price direction. Small adjustments work better than large ones.'
                    : 'This market is price-sensitive — any increase risks significant revenue loss.'}
                </div>
              );
            })()}
          </>
        )}

        {/* ── Smart Sentiment Improvement Scenario ── */}
        {sentiment && (
          <div className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Best Possible Improvement Scenario
            </h3>
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-emerald-500" />
                      <p className="text-sm font-bold text-foreground">{sentiment.scenario}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{sentiment.description}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs shrink-0">
                    <div className="p-2 bg-card border border-border/40 rounded text-center min-w-[80px]">
                      <span className="text-muted-foreground block text-[10px]">Adoption lift</span>
                      <p className="font-bold font-mono text-emerald-500">+{sentiment.adoption_lift?.toFixed(1)}</p>
                    </div>
                    <div className="p-2 bg-card border border-border/40 rounded text-center min-w-[80px]">
                      <span className="text-muted-foreground block text-[10px]">Conversion lift</span>
                      <p className="font-bold font-mono text-emerald-500">+{sentiment.conv_lift_pct?.toFixed(1)}%</p>
                    </div>
                    <div className="p-2 bg-card border border-border/40 rounded text-center min-w-[80px]">
                      <span className="text-muted-foreground block text-[10px]">Retention lift</span>
                      <p className="font-bold font-mono text-emerald-500">+{sentiment.retention_lift_pct?.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                {/* Chosen improvement levers */}
                {(sentiment.chosen_levers?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Chosen improvement combination (dataset-driven)
                    </p>
                    <div className="space-y-2">
                      {sentiment.chosen_levers!.map((lever, i) => (
                        <div key={lever} className="flex items-start gap-2.5 p-2.5 bg-card border border-emerald-500/15 rounded-lg">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[10px] font-black text-emerald-500">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground">
                              {lever.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </p>
                            {sentiment.lever_reasons?.[i] && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{sentiment.lever_reasons[i]}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Why these levers were selected */}
                {(sentiment.selection_reasoning?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <button
                      onClick={() => setSentimentOpen(!sentimentOpen)}
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-2"
                    >
                      {sentimentOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Why these levers were selected
                    </button>
                    {sentimentOpen && (
                      <div className="space-y-1.5">
                        {sentiment.selection_reasoning!.map((reason, i) => (
                          <p key={i} className="text-xs text-muted-foreground bg-muted/20 rounded p-2">
                            <span className="font-bold text-foreground">
                              {sentiment.chosen_levers?.[i]?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? `Lever ${i + 1}`}:{' '}
                            </span>
                            {reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Most impacted segments */}
                {(sentiment.most_impacted_segments?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Most impacted segments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sentiment.most_impacted_segments!.slice(0, 5).map((s) => (
                        <span
                          key={s.segment}
                          className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono"
                        >
                          {s.segment.split(' ').slice(0, 2).join(' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => openSentimentModal(sentiment)}
                  className="text-xs text-emerald-500 hover:underline"
                >
                  View full analysis →
                </button>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground mt-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
              This scenario is automatically tailored to your dataset. The combination above addresses the specific
              weaknesses identified from your uploaded data — not a generic review improvement template.
              Each lever is ranked by its expected impact on adoption for this product and market.
            </p>
          </div>
        )}
      </PageSection>
    </>
  );
}

// ─── Executive Narrative (Section 10) ────────────────────────────────────────

export function ExecutiveNarrativeSection({ r }: { r: SimResults }) {
  const execNarrative = r.executive_narrative;
  const actionPlan = r.action_plan || [];
  const keyOpps = r.key_opportunities || [];
  const keyRisks = r.key_risks || [];
  const msgInsight = (r.insights as Record<string, unknown>)?.messaging_intelligence as Record<string, unknown> | undefined;
  const segmentMessages = (msgInsight?.segment_messages as Array<Record<string, unknown>>) || [];
  const riskData = r.market_risk;
  const summary = r.population_summary;
  const dna = r.market_dna;

  const hasContent = !!(execNarrative || keyOpps.length || keyRisks.length || actionPlan.length || segmentMessages.length);

  return (
    <PageSection title="10. Final Executive Summary">

      {/* ── Executive Narrative text ── */}
      {execNarrative && (
        <Card className="border-primary/20 bg-primary/5 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-primary text-base">
              <FileText className="w-5 h-5" />
              Market Opportunity Narrative
            </CardTitle>
            <CardDescription>Evidence-backed summary from simulation outputs — dataset-driven, not templated</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-line text-sm text-foreground/90 leading-relaxed bg-card border border-border/40 rounded-xl p-5 mb-5">
              {execNarrative.narrative}
            </div>
            {Object.keys(execNarrative.headline_metrics || {}).length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {Object.entries(execNarrative.headline_metrics || {})
                  .filter(([, v]) => v != null)
                  .slice(0, 10)
                  .map(([k, v]) => (
                    <div key={k} className="bg-card border border-border/40 rounded-lg p-3 text-center">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        {k.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-black font-mono text-primary">
                        {typeof v === 'number' ? (v > 10 ? v.toFixed(1) : v.toFixed(2)) : String(v)}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Adoption outlook fallback ── */}
      {!execNarrative && summary && (
        <Card className="border-primary/20 bg-primary/5 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary">Adoption Outlook</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/90 leading-relaxed">
              The simulation modeled {summary.total_consumers.toLocaleString()} consumers and found an average
              purchase intent of {summary.avg_purchase_intent.toFixed(1)}/100 across active psychographic segments,
              with an average conversion probability of {(summary.avg_conversion_probability * 100).toFixed(1)}%.{' '}
              {dna?.recoverable_revenue
                ? `The dataset signals a recoverable revenue opportunity of approximately ${
                    dna.recoverable_revenue >= 1_000_000
                      ? `$${(dna.recoverable_revenue / 1_000_000).toFixed(2)}M`
                      : `$${(dna.recoverable_revenue / 1_000).toFixed(1)}K`
                  }.`
                : 'Revenue signals were not available — run Revenue Momentum or BSR Efficiency engines to estimate opportunity size.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Opportunities and Risks ── */}
      {(keyOpps.length > 0 || keyRisks.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {keyOpps.length > 0 && (
            <Card className="border-emerald-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-emerald-500 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Key Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {keyOpps.map((opp, i) => (
                  <div key={i} className="p-3 bg-card border border-emerald-500/15 rounded-xl">
                    <p className="text-sm font-bold">{opp.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{opp.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {keyRisks.length > 0 && (
            <Card className="border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-red-500 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Key Risks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {keyRisks.map((risk, i) => (
                  <div key={i} className="p-3 bg-card border border-red-500/15 rounded-xl">
                    <p className="text-sm font-bold">{risk.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{risk.detail}</p>
                    {risk.severity && (
                      <span className={cn(
                        'inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1.5',
                        risk.severity === 'High' ? 'bg-red-500/10 text-red-500' :
                        risk.severity === 'Medium' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-muted text-muted-foreground',
                      )}>
                        {risk.severity} severity
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Market Entry Risk ── */}
      {riskData && riskData.market_entry_risk_index > 0 && (
        <Card className="border-border/40 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Market Entry Risk Interpretation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div className="text-center shrink-0">
                <p className={cn(
                  'text-3xl font-black font-mono',
                  riskData.risk_label === 'Low' ? 'text-emerald-500' :
                  riskData.risk_label === 'Moderate' ? 'text-amber-500' : 'text-red-500',
                )}>
                  {riskData.market_entry_risk_index.toFixed(0)}
                </p>
                <p className="text-[10px] text-muted-foreground">Risk Index</p>
                <p className={cn(
                  'text-xs font-bold mt-0.5',
                  riskData.risk_label === 'Low' ? 'text-emerald-500' :
                  riskData.risk_label === 'Moderate' ? 'text-amber-500' : 'text-red-500',
                )}>{riskData.risk_label}</p>
              </div>
              <div className="flex-1 text-sm text-foreground/80">
                {riskData.risk_label === 'Low' && 'Market entry conditions are favorable. Competition is manageable, consumer trust is buildable, and demand supports a launch. Act now while conditions are advantageous.'}
                {riskData.risk_label === 'Moderate' && 'Market entry is viable but requires careful positioning. Some barriers exist — likely competition or trust-related. A well-differentiated product with a strong review strategy can overcome these.'}
                {riskData.risk_label === 'High' && 'High entry risk. Dominant competitors, weak demand, or high resistance make this challenging. Consider a niche focus, phased launch, or category-adjacent entry to reduce risk.'}
                {riskData.risk_label === 'Critical' && 'Critical entry risk. Fundamental challenges exist with demand, competition, or consumer willingness. A significant market gap or unique product advantage would be required to succeed.'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Segment Recommendations ── */}
      {segmentMessages.length > 0 && (
        <Card className="border-border/40 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Segment Recommendations</CardTitle>
            <CardDescription>Messaging and strategy guidance for priority segments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {segmentMessages.slice(0, 8).map((msg, i) => (
                <div key={i} className="p-3 border border-border/40 rounded-xl text-xs">
                  <p className="font-bold text-foreground">{String(msg.segment)}</p>
                  <p className="text-muted-foreground mt-1">{String(msg.primary_angle || '')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Action Plan ── */}
      {actionPlan.length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              Recommended Actions
            </CardTitle>
            <CardDescription>Prioritised actions derived from simulation outputs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionPlan.map((item, i) => (
              <div key={i} className="flex items-start gap-4 p-3 bg-muted/20 border border-border/30 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-black text-primary">{item.priority}</span>
                </div>
                <p className="text-sm flex-1 text-foreground/90">{item.action}</p>
                <span className="text-[9px] font-bold px-2 py-0.5 bg-muted rounded border border-border shrink-0">
                  {item.category.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!hasContent && (
        <Card className="border-border/40">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Executive narrative is generated after running the Consumer Adoption Simulator with sufficient dataset signals.
            Ensure Demand Strength, Market Concentration, and Revenue Momentum engines have been run first.
          </CardContent>
        </Card>
      )}
    </PageSection>
  );
}
