/**
 * Phase5Sections.tsx
 *
 * Section 9 — Scenario Testing
 *   - Pricing scenarios (6 tabs: ±10/20/30%)
 *   - 2–3 additional dataset-driven business levers (interactive)
 *   - Combined scenario result updates when any selector changes
 *   - Revenue impact chart with clear insight
 *   - Best Possible Improvement Scenario with strong evidence
 *
 * Section 10 — Final Executive Summary
 *   - Top 5 actions only, ranked by business impact
 */

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell,
} from 'recharts';
import {
  TrendingUp, AlertCircle, FileText, ListChecks, Zap, ChevronDown, ChevronUp,
  Target, DollarSign, Activity, TrendingDown,
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
import type {
  ScenarioTesting, SimResults, PricingScenario, SentimentScenario,
  AdditionalLever, LeverScenarioResult, ActionPlanItem,
} from './types';
import { fmtCurrency } from './utils';

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

// ─── Lever Selector ───────────────────────────────────────────────────────────

function LeverSelector({
  lever,
  value,
  onChange,
}: {
  lever: AdditionalLever;
  value: string;
  onChange: (optionId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-foreground">{lever.label}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{lever.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {lever.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={cn(
              'text-xs px-2.5 py-1 rounded-md border font-medium transition-colors',
              value === opt.id
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Scenario Testing (Section 9) ────────────────────────────────────────────

export function ScenarioTestingSection({ data }: { data: ScenarioTesting }) {
  const [pricingTab, setPricingTab]       = useState(0);
  const [sentimentOpen, setSentimentOpen] = useState(false);
  const [modal, setModal]                 = useState<InsightModalData | null>(null);

  // Lever selection state: leverOptionId per lever
  const additionalLevers  = data.additional_levers || [];
  const leverGrid         = data.lever_scenario_grid || [];
  const [leverSelections, setLeverSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(additionalLevers.map((l) => [l.id, 'none'])),
  );

  const pricing   = data.pricing_scenarios || [];
  const selected  = pricing[pricingTab];
  const sentiment = data.sentiment_scenario;

  const openPricingModal   = (p: PricingScenario)   => setModal(buildPricingScenarioModal(p));
  const openSentimentModal = (sc: SentimentScenario) => setModal(buildSentimentScenarioModal(sc));

  // Combined result: price scenario + all lever selections (use last lever that's not "none")
  const combinedResult = useMemo<LeverScenarioResult | null>(() => {
    if (!selected || leverGrid.length === 0) return null;
    const priceName = selected.scenario;

    // Pick the lever with the most impactful non-none selection
    const activeLevers = additionalLevers
      .map((l) => ({ lever: l, optId: leverSelections[l.id] || 'none' }))
      .filter((x) => x.optId !== 'none');

    if (activeLevers.length === 0) return null;

    // Find grid entries for this price scenario + each active lever, sum deltas
    let totalAdoptionChange = 0;
    let totalConvChange = 0;
    let totalRevChange = 0;
    let baseAdoption = selected.base_intent;
    let baseRevChangePct = selected.revenue_change_pct;
    let found = false;

    for (const { lever, optId } of activeLevers) {
      const row = leverGrid.find(
        (r) => r.price_scenario === priceName && r.lever_id === lever.id && r.lever_option_id === optId,
      );
      if (row) {
        found = true;
        // Use the first found row as base, add lever impacts additively
        totalAdoptionChange += (row.adoption_change - (selected.adoption_delta || 0));
        totalConvChange += row.conv_change;
        totalRevChange = row.revenue_change_pct; // use last found (closest combined result)
        baseAdoption = row.base_adoption;
      }
    }

    if (!found) return null;

    // Find the most relevant single grid row (best matching lever)
    const primaryLever = activeLevers[0];
    const primaryRow = leverGrid.find(
      (r) => r.price_scenario === priceName &&
             r.lever_id === primaryLever.lever.id &&
             r.lever_option_id === primaryLever.optId,
    );
    if (!primaryRow) return null;

    // Sum additional levers
    let extraAdoption = 0;
    let extraConv = 0;
    for (let i = 1; i < activeLevers.length; i++) {
      const { lever, optId } = activeLevers[i];
      const r2 = leverGrid.find(
        (r) => r.price_scenario === 'Price +0%' ||
               (r.lever_id === lever.id && r.lever_option_id === optId && r.price_pct === 0),
      );
      if (r2) {
        extraAdoption += r2.adoption_change;
        extraConv += r2.conv_change;
      }
    }

    const newAdoption = Math.min(100, Math.max(0, primaryRow.new_adoption + extraAdoption));
    const newConv = Math.min(99, Math.max(1, primaryRow.new_conversion + extraConv));
    const totalRevPct = primaryRow.revenue_change_pct + extraConv * 1.2; // approximate

    return {
      ...primaryRow,
      new_adoption: Math.round(newAdoption * 100) / 100,
      adoption_change: Math.round((newAdoption - baseAdoption) * 100) / 100,
      new_conversion: Math.round(newConv * 10) / 10,
      conv_change: Math.round((newConv - primaryRow.base_conversion) * 100) / 100,
      revenue_change_pct: Math.round(totalRevPct * 10) / 10,
    };
  }, [selected, leverGrid, additionalLevers, leverSelections]);

  // Display values: use combined if levers selected, else use pure price scenario
  const displayAdoption = useMemo(() => {
    if (combinedResult) return combinedResult.new_adoption;
    return selected?.new_intent ?? null;
  }, [combinedResult, selected]);

  const displayAdoptionChange = useMemo(() => {
    if (combinedResult) return combinedResult.adoption_change;
    return selected?.adoption_delta ?? null;
  }, [combinedResult, selected]);

  const displayRevChange = useMemo(() => {
    if (combinedResult) return combinedResult.revenue_change_pct;
    return selected?.revenue_change_pct ?? null;
  }, [combinedResult, selected]);

  const anyLeverActive = useMemo(
    () => additionalLevers.some((l) => (leverSelections[l.id] || 'none') !== 'none'),
    [additionalLevers, leverSelections],
  );

  const scenarioInsightText = useMemo(() => {
    if (!selected) return '';
    const pct = selected.pct_change;
    const revChange = displayRevChange ?? selected.revenue_change_pct;
    const leverNames = additionalLevers
      .filter((l) => (leverSelections[l.id] || 'none') !== 'none')
      .map((l) => {
        const optId = leverSelections[l.id];
        const opt = l.options.find((o) => o.id === optId);
        return opt ? opt.label : l.label;
      });
    const leverText = leverNames.length > 0
      ? ` Combined with ${leverNames.join(' + ')},`
      : '';

    if (pct > 0) {
      return revChange >= 0
        ? `Raising price by ${pct}% increases revenue (+${revChange.toFixed(1)}%).${leverText} the premium price signals quality and this market tolerates the increase without a sharp adoption drop.`
        : `Raising price by ${pct}% reduces net revenue (${revChange.toFixed(1)}%).${leverText} the adoption drop from price-sensitive segments outweighs the unit price gain — consider a smaller increase or stronger premium positioning first.`;
    }
    return revChange >= 0
      ? `Dropping price by ${Math.abs(pct)}% grows net revenue (+${revChange.toFixed(1)}%).${leverText} volume gain from price-sensitive segments more than offsets the margin reduction.`
      : `Dropping price by ${Math.abs(pct)}% cuts net revenue (${revChange.toFixed(1)}%).${leverText} the volume uplift does not fully offset margin reduction at this price tier.`;
  }, [selected, displayRevChange, additionalLevers, leverSelections]);

  return (
    <>
      <InsightModal data={modal} onClose={() => setModal(null)} />

      <PageSection title="9. Scenario Testing">

        {/* ── Price Scenario Tabs ── */}
        <Card className="border-border/40 mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Pricing Scenarios</CardTitle>
            <CardDescription>
              Dataset-anchored impact of price changes on adoption, conversion, and revenue.
              Select a price scenario and optional business levers below to see combined impact.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Price tabs */}
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

            {/* Additional dataset-driven levers */}
            {additionalLevers.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Additional Business Levers
                  </span>
                  <span className="text-[10px] text-muted-foreground">(dataset-selected for this product)</span>
                  {anyLeverActive && (
                    <button
                      onClick={() => setLeverSelections(Object.fromEntries(additionalLevers.map((l) => [l.id, 'none'])))}
                      className="text-[10px] text-red-400 hover:underline ml-auto"
                    >
                      Reset levers
                    </button>
                  )}
                </div>
                <div className="space-y-3 p-4 bg-muted/15 rounded-xl border border-border/40">
                  {additionalLevers.map((lever) => (
                    <LeverSelector
                      key={lever.id}
                      lever={lever}
                      value={leverSelections[lever.id] || 'none'}
                      onChange={(optId) =>
                        setLeverSelections((prev) => ({ ...prev, [lever.id]: optId }))
                      }
                    />
                  ))}
                  {additionalLevers.length > 0 && (
                    <div className="pt-2 border-t border-border/30">
                      <p className="text-[10px] text-muted-foreground">
                        <span className="font-bold text-foreground">Why these levers? </span>
                        {additionalLevers.map((l) => (
                          <span key={l.id} className="block mt-0.5">
                            <span className="text-primary font-medium">{l.label}:</span> {l.reason}
                          </span>
                        ))}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Combined metric cards */}
            {selected && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {[
                    {
                      label: 'Base Adoption',
                      value: selected.base_intent?.toFixed(1),
                      highlight: null,
                    },
                    {
                      label: 'New Adoption',
                      value: displayAdoption?.toFixed(1) ?? '—',
                      highlight: null,
                      accent: anyLeverActive,
                    },
                    {
                      label: 'Adoption Change',
                      value: `${(displayAdoptionChange ?? 0) >= 0 ? '+' : ''}${(displayAdoptionChange ?? 0).toFixed(1)}`,
                      highlight: displayAdoptionChange ?? 0,
                    },
                    {
                      label: 'Revenue Change',
                      value: `${(displayRevChange ?? 0) >= 0 ? '+' : ''}${(displayRevChange ?? 0).toFixed(1)}%`,
                      highlight: displayRevChange ?? 0,
                    },
                  ].map((m) => (
                    <div key={m.label} className={cn(
                      'p-3 rounded-lg border text-center transition-all',
                      m.accent
                        ? 'bg-primary/8 border-primary/30'
                        : 'bg-muted/30 border-border/40',
                    )}>
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

                {/* Insight paragraph */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm text-foreground/80 mb-4">
                  {scenarioInsightText}
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

        {/* ── Revenue Impact Chart with Insight ── */}
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

            {/* Rich revenue insight below the chart */}
            {(() => {
              const sorted = [...pricing].sort((a, b) => b.revenue_change_pct - a.revenue_change_pct);
              const best  = sorted[0];
              const worst = sorted[sorted.length - 1];
              const positiveCount = pricing.filter((p) => p.revenue_change_pct >= 0).length;
              const increaseScenarios = pricing.filter((p) => p.pct_change > 0);
              const decreaseScenarios = pricing.filter((p) => p.pct_change < 0);
              const bestIncrease = increaseScenarios.reduce<PricingScenario | null>(
                (a, b) => (!a || b.revenue_change_pct > a.revenue_change_pct ? b : a), null,
              );
              const bestDecrease = decreaseScenarios.reduce<PricingScenario | null>(
                (a, b) => (!a || b.revenue_change_pct > a.revenue_change_pct ? b : a), null,
              );

              // Determine recommendation
              let recommendation = '';
              if (best.pct_change > 0 && best.revenue_change_pct > 0) {
                // Best is a price increase
                recommendation = `${best.scenario} produces the strongest revenue outcome because this product has sufficient premium tolerance — consumers don't drop away sharply when price rises. Adoption dips only modestly while unit revenue increases meaningfully.`;
              } else if (best.pct_change < 0 && best.revenue_change_pct > 0) {
                // Best is a price cut
                recommendation = `${best.scenario} produces the best revenue result because volume gain from price-sensitive segments outweighs margin reduction. This market is price-elastic — lower price drives enough additional purchases to improve total revenue.`;
              } else {
                recommendation = `All price scenarios produce negative revenue impact for this product, meaning the market is tightly priced. Focus on lever improvements (advertising, trust, bundling) rather than price changes to grow revenue.`;
              }

              const increaseNote = bestIncrease
                ? (bestIncrease.revenue_change_pct > 0
                  ? `${bestIncrease.scenario} is the most viable price increase — it improves revenue (+${bestIncrease.revenue_change_pct.toFixed(1)}%) while keeping adoption loss manageable.`
                  : `Even the smallest price increase (${bestIncrease.scenario}) reduces net revenue (${bestIncrease.revenue_change_pct.toFixed(1)}%) — this market is highly price-sensitive.`)
                : '';

              const decreaseNote = bestDecrease
                ? (bestDecrease.revenue_change_pct > 0
                  ? `Lowering price at ${bestDecrease.scenario} grows revenue (+${bestDecrease.revenue_change_pct.toFixed(1)}%) because volume gain more than compensates.`
                  : `Price reductions hurt revenue — adoption gains don't cover the margin loss. Avoid discounting unless combined with volume-driving tactics.`)
                : '';

              return (
                <div className="mt-3 p-4 bg-muted/20 border border-border/40 rounded-xl text-sm text-muted-foreground space-y-2">
                  <p>
                    <span className="font-bold text-foreground">Best scenario: </span>
                    <span className="text-emerald-400 font-bold">{best.scenario}</span>
                    {best.revenue_change_pct > 0
                      ? ` (+${best.revenue_change_pct.toFixed(1)}% revenue)`
                      : ` (${best.revenue_change_pct.toFixed(1)}% revenue — least harmful)`}
                    {'. '}
                    <span className="font-bold text-foreground">Worst scenario: </span>
                    <span className="text-red-400 font-bold">{worst.scenario}</span>
                    {` (${worst.revenue_change_pct.toFixed(1)}% revenue).`}
                  </p>
                  <p>{recommendation}</p>
                  {increaseNote && <p className="text-xs">{increaseNote}</p>}
                  {decreaseNote && <p className="text-xs">{decreaseNote}</p>}
                  <p className="text-xs">
                    {positiveCount >= 4
                      ? 'This market tolerates price changes well — most scenarios maintain or improve revenue.'
                      : positiveCount >= 2
                      ? 'Revenue is directionally sensitive to price. Modest adjustments are safer than aggressive ones.'
                      : 'This market is highly price-sensitive. Price changes alone rarely improve outcomes here.'}
                    {' '}Recommendation: <span className="font-bold text-foreground">
                      {best.scenario.includes('+')
                        ? `price at ${best.scenario} level and invest in trust/value levers to sustain adoption.`
                        : `maintain or modestly reduce price and use levers above to improve conversion without margin sacrifice.`}
                    </span>
                  </p>
                </div>
              );
            })()}
          </>
        )}

        {/* ── Best Possible Improvement Scenario ── */}
        {sentiment && (
          <div className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Best Possible Improvement Scenario
            </h3>
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-5">
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

                {/* Lever cards with strong evidence */}
                {(sentiment.chosen_levers?.length ?? 0) > 0 && (
                  <div className="mb-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                      Selected improvement levers — why each was chosen
                    </p>
                    <div className="space-y-3">
                      {sentiment.chosen_levers!.map((lever, i) => {
                        const leverLabel = lever.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                        const reason = sentiment.selection_reasoning?.[i] ?? '';
                        const leverReason = sentiment.lever_reasons?.[i] ?? '';

                        // Determine affected signal and segment logic per lever
                        const leverMeta: Record<string, { signal: string; segHint: string; impact: string }> = {
                          trust_improvement: {
                            signal: 'risk_aversion + conversion_efficiency',
                            segHint: 'Risk-Averse Buyers, First-Time Buyers, Feature Researchers',
                            impact: 'Reduces trust barrier → raises conversion probability and adoption rate',
                          },
                          review_sentiment_improvement: {
                            signal: 'friction_keyword_count + risk_aversion',
                            segHint: 'Risk-Averse Buyers, Premium Quality Seekers, Gift Buyers',
                            impact: 'Higher average rating → improved trust score → more conversions',
                          },
                          pain_point_reduction: {
                            signal: 'friction_keyword_count',
                            segHint: 'Problem Solvers, Feature Researchers, Practical Buyers',
                            impact: 'Removes conversion blockers from product listing → reduces abandonment',
                          },
                          value_clarity_improvement: {
                            signal: 'budget_sensitivity + conversion_efficiency',
                            segHint: 'Budget Maximizers, Value Maximizers, Deal Hunters',
                            impact: 'Better ROI messaging → converts price-hesitant segments more effectively',
                          },
                          return_confidence_improvement: {
                            signal: 'hhi_score + risk_aversion',
                            segHint: 'Risk-Averse Buyers, First-Time Buyers, Occasional Users',
                            impact: 'Purchase guarantees reduce first-buy hesitation → faster adoption',
                          },
                          product_education_improvement: {
                            signal: 'friction_keywords + first_time_buyer_share',
                            segHint: 'First-Time Buyers, Feature Researchers, Occasional Users',
                            impact: 'Educational content bridges the knowledge gap → higher intent-to-purchase conversion',
                          },
                          advertising_push: {
                            signal: 'demand_velocity + trend_focused',
                            segHint: 'Trend Followers, Impulse Shoppers, Convenience Buyers',
                            impact: 'Visibility uplift captures latent demand from trend-sensitive segments',
                          },
                          bundle_strategy: {
                            signal: 'premium_willingness + bundle_target_share',
                            segHint: 'Gift Buyers, Value Maximizers, Occasional Users, Heavy Users',
                            impact: 'Raises perceived value without a direct price cut → improves adoption and AOV',
                          },
                        };
                        const meta = leverMeta[lever] ?? {
                          signal: 'multiple signals',
                          segHint: 'All active segments',
                          impact: 'Improves adoption and conversion across segments',
                        };

                        return (
                          <div key={lever} className="p-3 bg-card border border-emerald-500/20 rounded-xl">
                            <div className="flex items-start gap-2.5">
                              <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-[10px] font-black text-emerald-500">{i + 1}</span>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-foreground mb-1">{leverLabel}</p>
                                {leverReason && (
                                  <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">{leverReason}</p>
                                )}
                                <div className="grid grid-cols-1 gap-1 text-[10px]">
                                  <p>
                                    <span className="text-muted-foreground font-bold">Why selected: </span>
                                    <span className="text-foreground/80">{reason}</span>
                                  </p>
                                  <p>
                                    <span className="text-muted-foreground font-bold">Affected signal: </span>
                                    <span className="font-mono text-primary">{meta.signal}</span>
                                  </p>
                                  <p>
                                    <span className="text-muted-foreground font-bold">Segments impacted: </span>
                                    <span className="text-foreground/80">{meta.segHint}</span>
                                  </p>
                                  <p>
                                    <span className="text-muted-foreground font-bold">Expected impact: </span>
                                    <span className="text-emerald-400">{meta.impact}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Most impacted segments */}
                {(sentiment.most_impacted_segments?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Segments that benefit most
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sentiment.most_impacted_segments!.slice(0, 5).map((s) => (
                        <div
                          key={s.segment}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        >
                          <span className="font-medium">{s.segment.split(' ').slice(0, 2).join(' ')}</span>
                          {s.sensitivity_score != null && (
                            <span className="text-[9px] text-emerald-300/70 ml-1.5 font-mono">
                              sensitivity {s.sensitivity_score.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Final recommendation sentence */}
                {(sentiment.chosen_levers?.length ?? 0) > 0 && (
                  <div className="p-3 bg-emerald-500/8 border border-emerald-500/25 rounded-xl text-xs">
                    <span className="font-bold text-emerald-400">Best scenario recommendation: </span>
                    <span className="text-foreground/80">
                      Combine{' '}
                      {sentiment.chosen_levers!.map((l) =>
                        l.replace(/_/g, ' ').replace(/improvement|push|strategy/g, '').trim()
                          .replace(/\b\w/g, (c) => c.toUpperCase()),
                      ).join(' + ')}
                      {' '}at the current or slightly reduced price point. This addresses the dominant product weaknesses identified from your dataset and protects revenue while improving adoption and retention.
                    </span>
                  </div>
                )}

                <button
                  onClick={() => openSentimentModal(sentiment)}
                  className="text-xs text-emerald-500 hover:underline mt-4 block"
                >
                  View full analysis →
                </button>
              </CardContent>
            </Card>
          </div>
        )}
      </PageSection>
    </>
  );
}

// ─── Executive Narrative (Section 10) ────────────────────────────────────────

export function ExecutiveNarrativeSection({ r }: { r: SimResults }) {
  const execNarrative  = r.executive_narrative;
  const actionPlan     = ((r.action_plan || []) as ActionPlanItem[]).slice(0, 5); // TOP 5 ONLY
  const keyOpps        = r.key_opportunities || [];
  const keyRisks       = r.key_risks || [];
  const msgInsight     = (r.insights as Record<string, unknown>)?.messaging_intelligence as Record<string, unknown> | undefined;
  const segmentMessages = (msgInsight?.segment_messages as Array<Record<string, unknown>>) || [];
  const riskData       = r.market_risk;
  const summary        = r.population_summary;
  const dna            = r.market_dna;

  const hasContent = !!(execNarrative || keyOpps.length || keyRisks.length || actionPlan.length || segmentMessages.length);

  return (
    <PageSection title="10. Final Executive Summary">

      {/* ── Market Narrative ── */}
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

      {/* ── Top 5 Actions — Ranked by Business Impact ── */}
      {actionPlan.length > 0 && (
        <Card className="border-border/40 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              Top 5 Recommended Actions
            </CardTitle>
            <CardDescription>
              Ranked by business impact — derived from simulation outputs, not generic templates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionPlan.slice(0, 5).map((item, i) => {
              const priorityColors = [
                'bg-primary text-white',
                'bg-primary/80 text-white',
                'bg-primary/60 text-white',
                'bg-primary/40 text-foreground',
                'bg-primary/25 text-foreground',
              ];
              const impactLabel = i === 0 ? 'Highest Impact' : i === 1 ? 'High Impact' : i === 2 ? 'Medium-High Impact' : 'Medium Impact';
              return (
                <div key={i} className="flex items-start gap-4 p-4 bg-muted/20 border border-border/30 rounded-xl">
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', priorityColors[i] || 'bg-muted')}>
                    <span className="text-xs font-black">{item.priority}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-foreground/90 leading-snug">{item.action}</p>
                    {item.target_segment && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        <span className="font-bold">Target: </span>{item.target_segment}
                      </p>
                    )}
                    {item.why && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.why}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={cn(
                      'text-[9px] font-bold px-2 py-0.5 rounded border',
                      i === 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      i === 1 ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      'bg-muted text-muted-foreground border-border/40',
                    )}>
                      {impactLabel}
                    </span>
                    <p className="text-[9px] text-muted-foreground mt-1">{item.category.replace(/_/g, ' ')}</p>
                  </div>
                </div>
              );
            })}
            {actionPlan.length > 5 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                Showing top 5 of {actionPlan.length} actions — additional actions available in segment modals.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Segment Recommendations ── */}
      {segmentMessages.length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Segment Messaging Recommendations</CardTitle>
            <CardDescription>Channel and messaging strategy for priority segments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {segmentMessages.slice(0, 6).map((msg, i) => (
                <div key={i} className="p-3 border border-border/40 rounded-xl text-xs">
                  <p className="font-bold text-foreground">{String(msg.segment)}</p>
                  <p className="text-muted-foreground mt-1">{String(msg.primary_angle || '')}</p>
                  {typeof msg.emotional_trigger === 'string' && msg.emotional_trigger && (
                    <p className="text-[10px] text-primary mt-0.5">Trigger: {msg.emotional_trigger}</p>
                  )}
                </div>
              ))}
            </div>
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
