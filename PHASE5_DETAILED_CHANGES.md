# Phase 5: Detailed Implementation Changes

## Overview
This document details every specific change needed for the ConsumerAdoptionSimulator.tsx file.

## Summary of Changes
- **Lines to modify**: ~400 lines
- **New sections to add**: 5 major sections
- **Sections to remove**: 2 sections
- **Type definitions to add**: 6 interfaces
- **Components to update**: 15 sections

---

## PART 1: Type Definitions (Add after line 100)

Add these interfaces after the existing type definitions:

```typescript
// Phase 4 Type Definitions
interface SimulationConfidence {
  overall_confidence: number;
  overall_label: 'High' | 'Medium' | 'Low';
  breakdown: {
    dataset_quality: number;
    demand_stability: number;
    revenue_stability: number;
    competition_stability: number;
    customer_signal_quality: number;
  };
  per_metric_confidence: Record<string, {
    confidence_score: number;
    confidence_label: string;
    available_signals: number;
    required_signals: number;
    missing_signals: string[];
  }>;
  drivers: {
    positive: string[];
    negative: string[];
  };
  formula: string;
}

interface PricingScenario {
  scenario: string;
  direction: string;
  pct_change: number;
  base_intent: number;
  new_intent: number;
  adoption_delta: number;
  base_conversion: number;
  new_conversion: number;
  conv_delta_pct: number;
  base_revenue: number;
  new_revenue: number;
  revenue_change_pct: number;
  segment_sensitivity: Array<{
    segment: string;
    base_intent: number;
    new_intent: number;
    intent_change: number;
    sensitivity: number;
  }>;
  evidence: any;
}

interface CompetitiveScenario {
  scenario: string;
  description: string;
  base_intent: number;
  new_intent: number;
  adoption_impact: number;
  base_conversion: number;
  new_conversion: number;
  new_revenue: number;
  revenue_effect_pct: number;
  vulnerable_segments: Array<{
    segment: string;
    vulnerability_score: number;
  }>;
  evidence: any;
}

interface SentimentScenario {
  scenario: string;
  description: string;
  base_intent: number;
  new_intent: number;
  adoption_lift: number;
  base_conversion: number;
  new_conversion: number;
  conv_lift_pct: number;
  trust_improvement: number;
  retention_lift_pct: number;
  new_revenue: number;
  most_impacted_segments: Array<{
    segment: string;
    risk_aversion: number;
  }>;
  evidence: any;
}

interface ScenarioTesting {
  pricing_scenarios: PricingScenario[];
  competitive_scenarios: CompetitiveScenario[];
  sentiment_scenario: SentimentScenario;
}

interface StressTesting {
  iterations: number;
  adoption: {
    best_case: number;
    expected_case: number;
    worst_case: number;
    range: number;
    unit: string;
  };
  conversion: {
    best_case: number;
    expected_case: number;
    worst_case: number;
    range: number;
    unit: string;
  };
  revenue: {
    best_case: number;
    expected_case: number;
    worst_case: number;
    range: number;
    unit: string;
  };
  risk: {
    best_case: number;
    expected_case: number;
    worst_case: number;
    range: number;
    unit: string;
  };
  methodology: any;
}

interface SegmentStabilityItem {
  segment: string;
  population: number;
  percentage: number;
  stability_score: number;
  volatility_score: number;
  strategic_importance: number;
  intent: number;
  conversion_pct: number;
  resistance_index: number;
  switching_prob: number;
}

interface SegmentStability {
  stable_segments: SegmentStabilityItem[];
  volatile_segments: SegmentStabilityItem[];
  emerging_segments: SegmentStabilityItem[];
  all_scores: SegmentStabilityItem[];
  summary: {
    stable_count: number;
    volatile_count: number;
    emerging_count: number;
    top_stable: string;
    top_volatile: string;
    top_emerging: string;
  };
}

interface MarketRisk {
  market_entry_risk_index: number;
  risk_label: 'Critical' | 'High' | 'Moderate' | 'Low';
  components: {
    adoption_risk: { score: number; weight: number; drivers: string[] };
    revenue_risk: { score: number; weight: number; drivers: string[] };
    competition_risk: { score: number; weight: number; drivers: string[] };
    retention_risk: { score: number; weight: number; drivers: string[] };
    execution_risk: { score: number; weight: number; drivers: string[] };
  };
  formula: string;
  evidence: Record<string, number>;
}
```

## PART 2: Update SimResults Interface

Update the `SimResults` interface to include Phase 4 fields:

```typescript
interface SimResults {
  population_summary: PopulationSummary;
  market_dna: MarketDNA;
  psychographic_segments: Segment[];
  high_intent_segments: Segment[];
  critical_resistance_segments: any[];
  data_completeness: Record<string, boolean>;
  completeness_score: number;
  // AI Insight Layer
  insights?: Record<string, any>;
  executive_narrative?: { narrative: string; headline_metrics: Record<string, any> };
  action_plan?: Array<{ priority: number; action: string; category: string }>;
  key_opportunities?: Array<{ title: string; detail: string; type: string }>;
  key_risks?: Array<{ title: string; detail: string; severity: string }>;
  // Phase 4 additions
  simulation_confidence?: SimulationConfidence;
  scenario_testing?: ScenarioTesting;
  stress_testing?: StressTesting;
  segment_stability?: SegmentStability;
  market_risk?: MarketRisk;
}
```

## PART 3: Extract Phase 4 Data (Add in useMemo section)

Add these useMemo hooks after the existing ones:

```typescript
const simConfidence = useMemo(() => r?.simulation_confidence, [r]);
const scenarioData = useMemo(() => r?.scenario_testing, [r]);
const stressData = useMemo(() => r?.stress_testing, [r]);
const stabilityData = useMemo(() => r?.segment_stability, [r]);
const riskData = useMemo(() => r?.market_risk, [r]);
```

## PART 4: Remove Dominant Channel KPI

In the Executive Summary section, REMOVE this KPI card:

```typescript
<KPICard
  label="Dominant Channel"
  value={summary?.dominant_channel || '—'}
  implication="Primary purchase channel across the simulated population"
  icon={Activity}
  confidence={76}
/>
```

## PART 5: Update Remaining KPI Cards with Evidence

Wrap each KPI card with evidence capability. This is an example - apply to all KPIs:

```typescript
<div className="relative group">
  <KPICard
    label="Expected Adoption Rate"
    value={fmtPct(expectedAdoptionRate)}
    implication="Average purchase intent across all segments"
    icon={TrendingUp}
    confidence={simConfidence?.per_metric_confidence?.expected_adoption_rate?.confidence_score || 82}
  />
  {simConfidence && (
    <button 
      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded-full"
      onClick={() => {/* Open evidence modal */}}
    >
      <Info className="w-4 h-4 text-muted-foreground" />
    </button>
  )}
</div>
```

## PART 6: Add NEW Section - Simulation Confidence (After Executive Summary)

```typescript
{/* ── 2. Simulation Confidence ─────────────────────────────────────── */}
{simConfidence && (
  <PageSection title="2. Simulation Confidence">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Overall Confidence Gauge */}
      <Card className="border-border/40 col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Overall Confidence</CardTitle>
          <CardDescription>Simulation prediction reliability</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <div className="relative w-32 h-32 mb-4">
            <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
              <circle cx="64" cy="64" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
              <circle cx="64" cy="64" r="52" fill="none" 
                stroke={simConfidence.overall_confidence >= 80 ? '#10B981' : simConfidence.overall_confidence >= 50 ? '#F59E0B' : '#EF4444'}
                strokeWidth="12"
                strokeDasharray={`${(simConfidence.overall_confidence / 100) * 327} 327`} 
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black font-mono">{simConfidence.overall_confidence.toFixed(0)}</span>
              <span className="text-xs text-muted-foreground">out of 100</span>
            </div>
          </div>
          <Badge variant={simConfidence.overall_label === 'High' ? 'default' : simConfidence.overall_label === 'Medium' ? 'warning' : 'destructive'}>
            {simConfidence.overall_label} Confidence
          </Badge>
          <p className="text-xs text-center text-muted-foreground mt-3 leading-relaxed">
            Based on {Object.values(r?.data_completeness || {}).filter(Boolean).length} available data signals
          </p>
        </CardContent>
      </Card>

      {/* Confidence Breakdown */}
      <Card className="border-border/40 col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Confidence Breakdown</CardTitle>
          <CardDescription>5-dimension confidence analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(simConfidence.breakdown).map(([key, value]) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-bold font-mono">{value.toFixed(1)}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={cn('h-full rounded-full transition-all', 
                    value >= 70 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  )} 
                  style={{ width: `${value}%` }} 
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>

    {/* Confidence Drivers */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Positive Drivers */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Positive Confidence Drivers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {simConfidence.drivers.positive.map((driver, i) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-2">
                <span className="text-emerald-500">✓</span>
                {driver}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Negative Drivers */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Confidence Limitations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {simConfidence.drivers.negative.map((driver, i) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-2">
                <span className="text-amber-500">⚠</span>
                {driver}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  </PageSection>
)}
```

## PART 7: Remove Channel Preference Distribution Chart

In Section 4 (Cluster Distribution Visualizations), REMOVE the entire ChartContainer for "Channel Preference Distribution"

## PART 8: Remove Channel Column from Matrix

In Section 5 (Adoption Simulation Matrix), remove this table header and data cell:

REMOVE from `<thead>`:
```typescript
<th className="text-left px-3 py-3 font-bold text-muted-foreground uppercase tracking-wider">Channel</th>
```

REMOVE from `<tbody>` row:
```typescript
<td className="px-3 py-2.5 text-muted-foreground">{seg.channel_preference}</td>
```

## PART 9: Add NEW Section - Scenario Testing (After Resistance Dashboard)

This is a substantial new section - to be added after Section 7 (Revenue Lift Simulator).

[Due to length, this will be in a separate implementation file]

## PART 10: Add NEW Section - Market Stress Testing

[Due to length, this will be in a separate implementation file]

## PART 11: Add NEW Section - Segment Stability

[Due to length, this will be in a separate implementation file]

## PART 12: Add NEW Section - Market Entry Risk

[Due to length, this will be in a separate implementation file]

## PART 13: Remove Old Strategic Launch Simulator

Find and REMOVE the entire section that renders launch scenarios (the section with "Launch First", "Regional Pilot", etc.).

## PART 14: Move Executive Narrative to Bottom

Move all AI insight sections (Executive Narrative, Key Opportunities, Key Risks, Action Plan) to the very end of the component, after all other sections.

---

## Implementation Strategy

Due to the file size and complexity, I recommend:

1. **Phase A**: Type definitions + data extraction (30 min)
2. **Phase B**: Update existing sections (remove channel, update KPIs) (1 hour)
3. **Phase C**: Add Simulation Confidence section (1 hour)
4. **Phase D**: Add Scenario Testing section (2 hours)
5. **Phase E**: Add Stress Testing, Stability, Risk sections (3 hours)
6. **Phase F**: Reorganize Executive Narrative (1 hour)
7. **Phase G**: Testing & refinement (2 hours)

**Total Estimated Time**: 10-12 hours

---

## Testing Checklist

After implementation:
- [ ] TypeScript compiles without errors
- [ ] All Phase 4 sections render when data available
- [ ] Graceful fallbacks when Phase 4 data missing
- [ ] Channel elements removed (KPI, chart, table column)
- [ ] Executive Narrative at bottom
- [ ] Old Strategic Launch Simulator removed
- [ ] Evidence panels functional
- [ ] Responsive layout intact
- [ ] No broken existing functionality

---

**Status**: Ready for full implementation
**Next Step**: Begin Phase A (Type definitions)
