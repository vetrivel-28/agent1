/**
 * Phase5Sections.tsx
 *
 * Contains only the sections kept after the Phase 5 cleanup:
 *  - ScenarioTestingSection  (section 9)
 *  - ExecutiveNarrativeSection (section 10 — final)
 *
 * Removed sections (per cleanup requirements):
 *  - SimulationConfidenceSection
 *  - StressTestingSection
 *  - SegmentStabilitySection
 *  - MarketEntryRiskSection
 *  - ExecutiveDecisionCenter
 */

import { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell,
} from 'recharts';
import {
  TrendingUp, AlertCircle, FileText, ListChecks,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { PageSection } from '../../components/layout/PageSection';
import { ChartContainer } from '../../components/ui/ChartContainer';
import { cn } from '../../utils/cn';
import { InsightModal } from './InsightModal';
import type { InsightModalData } from './InsightModal';
import {
  buildPricingScenarioModal,
  buildCompetitiveScenarioModal,
  buildSentimentScenarioModal,
} from './modalContent';
import type { ScenarioTesting, SimResults, PricingScenario, CompetitiveScenario, SentimentScenario } from './types';

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

// ─── Scenario Testing ─────────────────────────────────────────────────────────

export function ScenarioTestingSection({ data }: { data: ScenarioTesting }) {
  const [pricingTab, setPricingTab] = useState(0);
  const [modal, setModal] = useState<InsightModalData | null>(null);

  const pricing = data.pricing_scenarios || [];
  const selected = pricing[pricingTab];

  const openPricingModal = (p: PricingScenario) => setModal(buildPricingScenarioModal(p));
  const openCompetitiveModal = (sc: CompetitiveScenario) => setModal(buildCompetitiveScenarioModal(sc));
  const openSentimentModal = (sc: SentimentScenario) => setModal(buildSentimentScenarioModal(sc));

  const scenarioInsight = (p: PricingScenario): string => {
    if (p.pct_change > 0) {
      return p.revenue_change_pct >= 0
        ? `Raising price by ${p.pct_change}% increases revenue (+${p.revenue_change_pct.toFixed(1)}%), suggesting the market tolerates this price level despite slight adoption drop.`
        : `Raising price by ${p.pct_change}% reduces revenue (${p.revenue_change_pct.toFixed(1)}%). The adoption drop outweighs the price gain — consider a smaller increase.`;
    }
    return p.revenue_change_pct >= 0
      ? `Dropping price by ${Math.abs(p.pct_change)}% grows revenue (+${p.revenue_change_pct.toFixed(1)}%) by capturing more price-sensitive segments. Volume wins.`
      : `Dropping price by ${Math.abs(p.pct_change)}% cuts revenue (${p.revenue_change_pct.toFixed(1)}%). The volume gain is insufficient to offset margin reduction.`;
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
              Click a scenario for a detailed business explanation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Tab selector */}
            <div className="flex flex-wrap gap-2 mb-5">
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

            {selected && (
              <>
                {/* Metric cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'Base Adoption', value: selected.base_intent?.toFixed(1) },
                    { label: 'New Adoption', value: selected.new_intent?.toFixed(1) },
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

                {/* Scenario insight */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm text-foreground/80 mb-4">
                  {scenarioInsight(selected)}
                </div>

                {/* Sensitive segments */}
                {(selected.segment_sensitivity?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Most price-sensitive segments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selected.segment_sensitivity!.slice(0, 6).map((s) => (
                        <span
                          key={s.segment}
                          className={cn(
                            'text-xs px-2.5 py-1 rounded-full border font-mono',
                            s.intent_change < -5
                              ? 'bg-red-500/10 text-red-400 border-red-500/20'
                              : s.intent_change < 0
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                          )}
                        >
                          {s.segment.split(' ').slice(0, 2).join(' ')}:{' '}
                          {s.intent_change >= 0 ? '+' : ''}{s.intent_change.toFixed(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detail button */}
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
          <ChartContainer
            title="Pricing Impact — Revenue Change by Scenario"
            description="How each price change shifts modeled revenue relative to the current dataset baseline"
            xAxisLabel="Scenario"
            yAxisLabel="Revenue Δ %"
            businessExplanation="Green bars mean net-positive revenue impact; red bars mean the price change costs more than it earns through adoption loss."
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
        )}

        {/* ── Competitive Scenarios ── */}
        {(data.competitive_scenarios?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Competitive Scenarios
              </h3>
              <div className="space-y-3">
                {data.competitive_scenarios.map((sc) => (
                  <button
                    key={sc.scenario}
                    className="w-full text-left p-4 border border-border/40 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-colors"
                    onClick={() => openCompetitiveModal(sc)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <p className="text-sm font-bold">{sc.scenario}</p>
                      <div className="flex gap-3 text-xs font-mono shrink-0">
                        <span className={cn(sc.adoption_impact >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                          Adoption {sc.adoption_impact >= 0 ? '+' : ''}{sc.adoption_impact?.toFixed(1)}
                        </span>
                        <span className={cn(sc.revenue_effect_pct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                          Revenue {sc.revenue_effect_pct >= 0 ? '+' : ''}{sc.revenue_effect_pct?.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{sc.description}</p>
                    <p className="text-[10px] text-primary mt-2">Click for full analysis →</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Sentiment Scenario ── */}
            {data.sentiment_scenario && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Sentiment Improvement Scenario
                </h3>
                <button
                  className="w-full text-left p-4 border border-emerald-500/30 rounded-xl bg-emerald-500/5 hover:border-emerald-500/50 transition-colors"
                  onClick={() => openSentimentModal(data.sentiment_scenario!)}
                >
                  <p className="text-sm font-bold">{data.sentiment_scenario.scenario}</p>
                  <p className="text-xs text-muted-foreground mt-2">{data.sentiment_scenario.description}</p>
                  <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
                    <div className="p-2 bg-card border border-border/40 rounded text-center">
                      <span className="text-muted-foreground block">Adoption lift</span>
                      <p className="font-bold font-mono text-emerald-500">+{data.sentiment_scenario.adoption_lift?.toFixed(1)}</p>
                    </div>
                    <div className="p-2 bg-card border border-border/40 rounded text-center">
                      <span className="text-muted-foreground block">Conversion lift</span>
                      <p className="font-bold font-mono text-emerald-500">+{data.sentiment_scenario.conv_lift_pct?.toFixed(1)}%</p>
                    </div>
                    <div className="p-2 bg-card border border-border/40 rounded text-center">
                      <span className="text-muted-foreground block">Retention lift</span>
                      <p className="font-bold font-mono text-emerald-500">+{data.sentiment_scenario.retention_lift_pct?.toFixed(1)}%</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-500 mt-3">Click for full analysis →</p>
                </button>
                <p className="text-xs text-muted-foreground mt-3 p-3 bg-muted/20 border border-border/40 rounded-lg">
                  Improving product review sentiment directly reduces trust barriers across risk-averse, first-time buyer, and feature-researcher segments — the three groups most influenced by social proof.
                </p>
              </div>
            )}
          </div>
        )}
      </PageSection>
    </>
  );
}

// ─── Executive Narrative (Section 10 — Final) ────────────────────────────────

export function ExecutiveNarrativeSection({ r }: { r: SimResults }) {
  const execNarrative = r.executive_narrative;
  const actionPlan = r.action_plan || [];
  const keyOpps = r.key_opportunities || [];
  const keyRisks = r.key_risks || [];
  const msgInsight = (r.insights as Record<string, unknown>)?.messaging_intelligence as Record<string, unknown> | undefined;
  const segmentMessages = (msgInsight?.segment_messages as Array<Record<string, unknown>>) || [];
  const riskData = r.market_risk;

  // Gather headline metrics for display
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

      {/* ── Adoption outlook (if no narrative) ── */}
      {!execNarrative && summary && (
        <Card className="border-primary/20 bg-primary/5 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary">Adoption Outlook</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/90 leading-relaxed">
              The simulation modeled {summary.total_consumers.toLocaleString()} consumers and found an average purchase intent of{' '}
              {summary.avg_purchase_intent.toFixed(1)}/100 across active psychographic segments, with an average conversion probability of{' '}
              {(summary.avg_conversion_probability * 100).toFixed(1)}%.{' '}
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

      {/* ── Market Entry Risk (merged here, not its own section) ── */}
      {riskData && riskData.market_entry_risk_index > 0 && (
        <Card className="border-border/40 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Market Entry Risk Interpretation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div className="text-center shrink-0">
                <p className={cn(
                  'text-3xl font-black font-mono',
                  riskData.risk_label === 'Low' ? 'text-emerald-500' :
                  riskData.risk_label === 'Moderate' ? 'text-amber-500' :
                  'text-red-500',
                )}>
                  {riskData.market_entry_risk_index.toFixed(0)}
                </p>
                <p className="text-[10px] text-muted-foreground">Risk Index</p>
                <p className={cn(
                  'text-xs font-bold mt-0.5',
                  riskData.risk_label === 'Low' ? 'text-emerald-500' :
                  riskData.risk_label === 'Moderate' ? 'text-amber-500' :
                  'text-red-500',
                )}>{riskData.risk_label}</p>
              </div>
              <div className="flex-1 text-sm text-foreground/80">
                {riskData.risk_label === 'Low' && (
                  'Market entry conditions are favorable. Competition is manageable, consumer trust is buildable, and the demand environment supports a new product launch. Act now while conditions are advantageous.'
                )}
                {riskData.risk_label === 'Moderate' && (
                  'Market entry is viable but requires careful positioning. Some barriers exist — likely competition or trust-related. A well-differentiated product with a strong review strategy can overcome these.'
                )}
                {riskData.risk_label === 'High' && (
                  'High entry risk. Dominant competitors, weak demand, or high resistance make this a challenging market. Consider a niche focus, phased launch, or category adjacent entry to reduce risk.'
                )}
                {riskData.risk_label === 'Critical' && (
                  'Critical entry risk. Fundamental challenges exist with demand, competition, or consumer willingness. A significant market gap or unique product advantage would be required to enter successfully.'
                )}
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

      {/* Fallback if nothing to show */}
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
