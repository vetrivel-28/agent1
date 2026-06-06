import type { EvidenceData } from '../../components/ui/EvidenceDrawer';

export interface DominantTraits {
  quality_focused?: number;
  convenience_focused?: number;
  price_focused?: number;
  trend_focused?: number;
  risk_aversion?: number;
  health_conscious?: number;
  sustainability_conscious?: number;
  budget_sensitivity?: number;
  premium_willingness?: number;
  switching_cost?: number;
  brand_loyalty?: number;
}

export interface ResistanceData {
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

export interface Segment {
  cluster_id: number;
  cluster_name: string;
  population: number;
  percentage: number;
  purchase_intent: number;
  conversion_probability: number;
  trust_score: number;
  emotional_resonance: number;
  switching_probability: number;
  channel_preference?: string;
  channel_scores?: Record<string, number>;
  resistance: ResistanceData;
  motivations?: string[];
  objections?: string[];
  dominant_traits?: DominantTraits;
  primary_theme?: string;
}

export interface PopulationSummary {
  total_consumers: number;
  num_psychographic_segments: number;
  avg_purchase_intent: number;
  avg_conversion_probability: number;
  avg_trust_score: number;
  avg_emotional_resonance: number;
  avg_resistance_index: number;
  dominant_channel?: string;
  channel_distribution?: Record<string, number>;
}

export interface MarketDNA {
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
  growth_trend?: string;
  review_sentiment_score?: number | null;
  friction_keyword_count?: number | null;
  total_market_revenue?: number | null;
}

export interface SimulationConfidence {
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
  drivers: { positive: string[]; negative: string[] };
  formula?: string;
}

export interface SegmentFilter {
  id: string;
  label: string;
  description: string;
  segment_names: string[];
}

export interface ScenarioTesting {
  pricing_scenarios: PricingScenario[];
  competitive_scenarios: CompetitiveScenario[];  // always [] now (removed)
  sentiment_scenario: SentimentScenario | null;
  segment_filters?: SegmentFilter[];
}

export interface PricingScenario {
  scenario: string;
  direction: string;
  pct_change: number;
  base_intent: number;
  new_intent: number;
  adoption_delta: number;
  revenue_change_pct: number;
  segment_sensitivity?: Array<{
    segment: string;
    base_intent: number;
    new_intent: number;
    intent_change: number;
    sensitivity: number;
  }>;
}

export interface CompetitiveScenario {
  scenario: string;
  description: string;
  adoption_impact: number;
  revenue_effect_pct: number;
  vulnerable_segments?: Array<{ segment: string; vulnerability_score: number }>;
}

export interface SentimentScenario {
  scenario: string;
  description: string;
  adoption_lift: number;
  conv_lift_pct: number;
  retention_lift_pct: number;
  new_intent?: number;
  new_conversion?: number;
  chosen_levers?: string[];
  lever_reasons?: string[];
  selection_reasoning?: string[];
  most_impacted_segments?: Array<{ segment: string; risk_aversion: number; sensitivity_score?: number }>;
  evidence?: Record<string, unknown>;
}

export interface StressCase {
  best_case: number;
  expected_case: number;
  worst_case: number;
  range: number;
  unit: string;
}

export interface StressTesting {
  iterations: number;
  adoption: StressCase;
  conversion: StressCase;
  revenue: StressCase;
  risk: StressCase;
  methodology?: Record<string, unknown>;
}

export interface SegmentStabilityItem {
  segment: string;
  population: number;
  percentage: number;
  stability_score: number;
  volatility_score: number;
  strategic_importance: number;
  emerging_score?: number;
  intent: number;
  conversion_pct: number;
  resistance_index: number;
  switching_prob: number;
}

export interface SegmentStability {
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

export interface MarketRisk {
  market_entry_risk_index: number;
  risk_label: 'Critical' | 'High' | 'Moderate' | 'Low';
  components: Record<string, { score: number; weight: number; drivers: string[] }>;
  formula?: string;
  evidence?: Record<string, number>;
}

export interface SimResults {
  population_summary: PopulationSummary;
  market_dna: MarketDNA;
  psychographic_segments: Segment[];
  high_intent_segments: Segment[];
  critical_resistance_segments: unknown[];
  data_completeness: Record<string, boolean>;
  completeness_score: number;
  insights?: Record<string, unknown>;
  executive_narrative?: { narrative: string; headline_metrics: Record<string, unknown> };
  action_plan?: Array<{ priority: number; action: string; category: string }>;
  key_opportunities?: Array<{ title: string; detail: string; type: string }>;
  key_risks?: Array<{ title: string; detail: string; severity: string }>;
  simulation_confidence?: SimulationConfidence;
  scenario_testing?: ScenarioTesting;
  stress_testing?: StressTesting;
  segment_stability?: SegmentStability;
  market_risk?: MarketRisk;
}

export type { EvidenceData };
