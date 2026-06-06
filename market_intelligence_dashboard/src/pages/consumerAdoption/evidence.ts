import type { EvidenceData } from '../../components/ui/EvidenceDrawer';
import type { MarketDNA, PopulationSummary, Segment, SimulationConfidence } from './types';
import { fmtCurrency, fmtNum, fmtPct } from './utils';

export function baseEvidence(
  title: string,
  displayed: string | number,
  summary: string,
  extra?: Partial<EvidenceData>,
): EvidenceData {
  return {
    title,
    displayed_value: displayed,
    business_summary: summary,
    source_datasets: ['BlackBox', 'Magnet', 'Engine Cache'],
    source_columns: ['Simulated consumer population', 'Psychographic clusters', 'Market DNA'],
    source_row_count: 0,
    formula: null,
    confidence_note: 'Derived from uploaded dataset engine outputs — no synthetic records.',
    ...extra,
  };
}

export function kpiEvidence(
  label: string,
  value: string | number,
  summary: string,
  simConfidence?: SimulationConfidence,
  metricKey?: string,
): EvidenceData {
  const conf = metricKey
    ? simConfidence?.per_metric_confidence?.[metricKey]
    : undefined;
  return baseEvidence(label, value, summary, {
    counts: conf
      ? {
          confidence_score: conf.confidence_score,
          signals_available: conf.available_signals,
          signals_required: conf.required_signals,
        }
      : simConfidence
        ? { overall_confidence: simConfidence.overall_confidence }
        : undefined,
    calculation_steps: simConfidence?.formula ? [simConfidence.formula] : undefined,
    data_quality_notes: conf?.missing_signals?.length
      ? [`Missing signals: ${conf.missing_signals.join(', ')}`]
      : undefined,
  });
}

export function segmentEvidence(seg: Segment): EvidenceData {
  return baseEvidence(
    seg.cluster_name,
    fmtPct(seg.conversion_probability * 100),
    `${fmtNum(seg.population)} simulated consumers (${fmtPct(seg.percentage)} of population). Purchase intent ${seg.purchase_intent.toFixed(1)}/100.`,
    {
      counts: {
        population: seg.population,
        purchase_intent: seg.purchase_intent,
        conversion_pct: (seg.conversion_probability * 100).toFixed(1),
        trust: seg.trust_score,
        resistance_index: seg.resistance?.resistance_index ?? 0,
      },
      top_records: [
        { metric: 'Primary barrier', value: seg.resistance?.primary_barrier ?? '—' },
        { metric: 'Resistance level', value: seg.resistance?.resistance_level ?? '—' },
      ],
    },
  );
}

export function matrixRowEvidence(seg: Segment): EvidenceData {
  return baseEvidence(
    `${seg.cluster_name} — Adoption Matrix`,
    fmtPct(seg.conversion_probability * 100),
    `Intent ${seg.purchase_intent.toFixed(0)}, trust ${seg.trust_score.toFixed(0)}, resonance ${seg.emotional_resonance.toFixed(0)}, switching ${(seg.switching_probability * 100).toFixed(1)}%.`,
    {
      counts: {
        adoption: (seg.conversion_probability * 100).toFixed(1),
        intent: seg.purchase_intent,
        trust: seg.trust_score,
        resonance: seg.emotional_resonance,
        resistance: seg.resistance?.resistance_index ?? 0,
      },
    },
  );
}

export function liftRowEvidence(seg: Segment, potential: number, lift: number, revOpp: number): EvidenceData {
  return baseEvidence(
    `${seg.cluster_name} — Revenue Lift`,
    `+${lift.toFixed(1)} pts`,
    `Current adoption ${seg.purchase_intent.toFixed(0)} → potential ${potential.toFixed(0)}. Estimated opportunity ${fmtCurrency(revOpp)}.`,
    {
      counts: {
        current_adoption: seg.purchase_intent,
        potential_adoption: potential,
        lift_points: lift,
        revenue_opportunity: revOpp,
        primary_barrier: seg.resistance?.primary_barrier ?? '—',
      },
    },
  );
}

export function marketDnaEvidence(
  label: string,
  value: number | null | undefined,
  dna: MarketDNA | null,
  summary: string,
): EvidenceData {
  return baseEvidence(label, value != null ? value.toFixed(1) : '—', summary, {
    counts: {
      demand_score: dna?.demand_score ?? '—',
      hhi: dna?.hhi_score ?? '—',
      conversion_efficiency: dna?.conversion_efficiency ?? '—',
      recoverable_revenue: dna?.recoverable_revenue ?? '—',
    },
  });
}

export function populationEvidence(summary: PopulationSummary | undefined): EvidenceData {
  return baseEvidence(
    'Simulated Consumers',
    fmtNum(summary?.total_consumers),
    `Average intent ${summary?.avg_purchase_intent?.toFixed(1) ?? '—'}, conversion ${fmtPct((summary?.avg_conversion_probability ?? 0) * 100)}.`,
    {
      counts: {
        segments: summary?.num_psychographic_segments ?? 0,
        avg_trust: summary?.avg_trust_score ?? 0,
        avg_resistance: summary?.avg_resistance_index ?? 0,
      },
    },
  );
}
