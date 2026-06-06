import { FIXED_SEGMENT_NAMES } from '../../constants/fixedPsychographicSegments';
import type { Segment, SimulationConfidence } from './types';

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString();
}

export function fmtScore(v: number | null | undefined, max = 100): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)}/${max}`;
}

export function fmtCurrency(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function resistanceColor(level: string): string {
  if (level === 'Critical') return 'text-red-500';
  if (level === 'High') return 'text-orange-500';
  if (level === 'Medium') return 'text-amber-500';
  return 'text-emerald-500';
}

export function resistanceBg(level: string): string {
  if (level === 'Critical') return 'bg-red-500/10 border-red-500/20';
  if (level === 'High') return 'bg-orange-500/10 border-orange-500/20';
  if (level === 'Medium') return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-emerald-500/10 border-emerald-500/20';
}

export function intentColor(score: number): string {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

export function heatCell(val: number, max = 100): string {
  const pct = val / max;
  if (pct >= 0.75) return 'bg-emerald-500/20 text-emerald-400';
  if (pct >= 0.5) return 'bg-amber-500/15 text-amber-400';
  if (pct >= 0.25) return 'bg-orange-500/15 text-orange-400';
  return 'bg-red-500/10 text-red-400';
}

export function metricConfidence(
  simConfidence: SimulationConfidence | undefined,
  key: string,
  fallback = 75,
): number {
  const entry = simConfidence?.per_metric_confidence?.[key];
  return entry?.confidence_score ?? simConfidence?.overall_confidence ?? fallback;
}

const EMPTY_RESISTANCE = {
  habit_lock_in: 0,
  competitor_loyalty: 0,
  trust_barrier: 0,
  price_resistance: 0,
  product_complexity: 0,
  education_requirement: 0,
  resistance_index: 0,
  resistance_level: 'Low',
  primary_barrier: '—',
  recommended_approach: 'No consumers mapped to this segment in the current dataset scope.',
};

/** Ensure all 20 fixed segment names appear in stable order. */
export function orderSegments(apiSegments: Segment[]): Segment[] {
  const byName = new Map(apiSegments.map((s) => [s.cluster_name, s]));
  return FIXED_SEGMENT_NAMES.map((name, index) => {
    const existing = byName.get(name);
    if (existing) return existing;
    return {
      cluster_id: index + 1,
      cluster_name: name,
      population: 0,
      percentage: 0,
      purchase_intent: 0,
      conversion_probability: 0,
      trust_score: 0,
      emotional_resonance: 0,
      switching_probability: 0,
      resistance: { ...EMPTY_RESISTANCE },
      motivations: ['—'],
      objections: ['—'],
    };
  });
}

export function activeSegments(segments: Segment[]): Segment[] {
  return segments.filter((s) => s.population > 0);
}

export function adoptionRate(seg: Segment): number {
  return seg.conversion_probability * 100;
}

export function stabilityForSegment(
  segmentName: string,
  allScores: { segment: string; stability_score: number; volatility_score: number; emerging_score?: number }[] | undefined,
) {
  return allScores?.find((s) => s.segment === segmentName);
}
