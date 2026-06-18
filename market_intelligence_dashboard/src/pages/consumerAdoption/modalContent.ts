/**
 * modalContent.ts
 *
 * Builds InsightModalData objects for every clickable element on the
 * Consumer Adoption Simulator page.
 *
 * Rules:
 *  - Never surface rows_processed, calculation_scope, source_intelligence,
 *    or raw engine dumps.
 *  - Every formula must match the displayed value exactly.
 *  - If a value cannot be reliably calculated, say so.
 *  - Plain business language throughout.
 */

import type { InsightModalData } from './InsightModal';
import type { MarketDNA, PopulationSummary, Segment, SimResults, PricingScenario, CompetitiveScenario, SentimentScenario } from './types';
import { fmtCurrency, fmtNum, fmtPct, adoptionRate } from './utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function signal(label: string, value: number | string | null | undefined, note?: string): string {
  const v = value == null ? 'Not available' : typeof value === 'number' ? value.toFixed(1) : String(value);
  return note ? `${label}: ${v} (${note})` : `${label}: ${v}`;
}

function segmentTraitDescription(seg: Segment): string[] {
  const traits = seg.dominant_traits ?? {};
  const lines: string[] = [];

  if ((traits.price_focused ?? 0) > 0.6 || (traits.budget_sensitivity ?? 0) > 0.6)
    lines.push('High price sensitivity — responds strongly to discounts and value messaging.');
  if ((traits.premium_willingness ?? 0) > 0.6)
    lines.push('Willing to pay premium prices for perceived quality.');
  if ((traits.brand_loyalty ?? 0) > 0.6)
    lines.push('Strong brand loyalty — harder to win over but retains well once converted.');
  if ((traits.brand_loyalty ?? 0) < 0.3)
    lines.push('Low brand loyalty — open to switching, but may churn easily.');
  if ((traits.risk_aversion ?? 0) > 0.6)
    lines.push('Risk-averse — needs social proof, reviews, and guarantees to convert.');
  if ((traits.convenience_focused ?? 0) > 0.6)
    lines.push('Convenience-driven — Prime, fast shipping, and easy returns are decisive.');
  if ((traits.quality_focused ?? 0) > 0.6)
    lines.push('Quality-focused — invests time in reviews and product details before buying.');
  if ((traits.trend_focused ?? 0) > 0.6)
    lines.push('Trend-following — responds to bestseller badges and social momentum.');
  if ((traits.sustainability_conscious ?? 0) > 0.5)
    lines.push('Values eco-friendly and ethical product positioning.');

  if (!lines.length) lines.push('Balanced trait profile — responds to standard product value propositions.');
  return lines;
}

function resistanceExplanation(seg: Segment): string[] {
  const r = seg.resistance;
  if (!r) return ['No resistance data available for this segment.'];
  const lines: string[] = [];
  if (r.habit_lock_in > 50) lines.push(`Habit Lock-In ${r.habit_lock_in.toFixed(0)}/100 — consumers are stuck in existing purchase routines and need a compelling reason to change.`);
  if (r.trust_barrier > 50) lines.push(`Trust Barrier ${r.trust_barrier.toFixed(0)}/100 — skepticism is high; reviews, certifications, and social proof are essential.`);
  if (r.price_resistance > 50) lines.push(`Price Resistance ${r.price_resistance.toFixed(0)}/100 — pricing is a significant blocker; promotions or value framing can help.`);
  if (r.competitor_loyalty > 50) lines.push(`Competitor Loyalty ${r.competitor_loyalty.toFixed(0)}/100 — consumers have existing brand relationships that are hard to break.`);
  if (r.product_complexity > 50) lines.push(`Product Complexity ${r.product_complexity.toFixed(0)}/100 — the product category has a learning curve; education content helps.`);
  if (!lines.length) lines.push(`Resistance Index ${r.resistance_index.toFixed(0)}/100 — low overall resistance. Most barriers are manageable.`);
  return lines;
}

// ─── Executive Summary KPIs ──────────────────────────────────────────────────

export function buildSimulatedConsumersModal(summary: PopulationSummary | undefined): InsightModalData {
  const total = summary?.total_consumers ?? 0;
  const activeSegs = summary?.num_psychographic_segments ?? 0;
  return {
    title: 'Simulated Consumers',
    subtitle: 'How the simulation population is constructed',
    value: fmtNum(total),
    valueMeaning: 'Total simulated market',
    sections: [
      {
        heading: 'What this means',
        type: 'normal',
        body: `The simulator distributes ${fmtNum(total)} virtual consumers across the 20 fixed psychographic segments. Each consumer is assigned traits, purchase intent, resistance, and trust scores based on your uploaded dataset signals. This is not a real headcount — it is a model of your potential market.`,
      },
      {
        heading: 'Segment allocation',
        type: 'table',
        body: [
          signal('Total simulated consumers', total),
          signal('Segments with allocated population', activeSegs, 'active'),
          signal('Average purchase intent across all segments', summary?.avg_purchase_intent),
          signal('Average conversion probability', summary ? (summary.avg_conversion_probability * 100).toFixed(1) + '%' : null),
          signal('Average trust score', summary?.avg_trust_score),
          signal('Average resistance index', summary?.avg_resistance_index),
        ],
      },
      {
        heading: 'Business interpretation',
        type: 'insight',
        body: `A larger active segment count means more of the market has been reached by keyword and revenue signals. Segments with zero population mean the current dataset did not generate strong enough signals to populate those consumer types. Upload richer datasets to activate more segments.`,
      },
    ],
  };
}

export function buildAdoptionRateModal(
  value: string,
  activeSegs: Segment[],
  summary: PopulationSummary | undefined,
): InsightModalData {
  const totalPop = activeSegs.reduce((s, seg) => s + seg.population, 0) || 1;
  const calcLines: string[] = [];
  let checksum = 0;
  activeSegs.slice(0, 10).forEach((seg) => {
    const share = seg.population / totalPop;
    const rate = adoptionRate(seg);
    const contribution = share * rate;
    checksum += contribution;
    calcLines.push(
      `${seg.cluster_name}: ${fmtNum(seg.population)} pop (${(share * 100).toFixed(1)}%) × ${rate.toFixed(1)}% = ${contribution.toFixed(2)}% contribution`,
    );
  });
  if (activeSegs.length > 10) {
    const remaining = activeSegs.slice(10);
    const remContrib = remaining.reduce((s, seg) => {
      const share = seg.population / totalPop;
      return s + share * adoptionRate(seg);
    }, 0);
    checksum += remContrib;
    calcLines.push(`... ${remaining.length} more segments: +${remContrib.toFixed(2)}% contribution`);
  }
  calcLines.push(`→ Weighted average adoption rate: ${checksum.toFixed(1)}%`);

  return {
    title: 'Expected Adoption Rate',
    subtitle: 'Weighted average conversion across active segments',
    value,
    valueMeaning: 'of simulated consumers likely to convert',
    sections: [
      {
        heading: 'What adoption rate means',
        type: 'normal',
        body: `Adoption rate is the percentage of simulated consumers who are modeled to convert — meaning they have sufficient intent, trust, and low enough resistance to make a purchase. This is not a guaranteed real-world conversion rate; it is a model-based estimate anchored to your dataset signals.`,
      },
      {
        heading: 'Formula',
        type: 'formula',
        body: [
          'Expected Adoption Rate = Σ (Segment Adoption Rate × Segment Population Share)',
          'Segment Adoption Rate = Segment Conversion Probability × 100',
          'Segment Population Share = Segment Population ÷ Total Active Population',
        ],
      },
      {
        heading: 'Calculation (top segments shown)',
        type: 'table',
        body: calcLines,
      },
      {
        heading: 'Dashboard signals used',
        type: 'normal',
        body: [
          'Demand strength → purchase intent per segment',
          'Market concentration (HHI) → competitive friction affecting conversion',
          'Revenue efficiency → probability of completing a purchase',
          'Review sentiment → trust score feeding emotional resonance',
        ],
      },
      {
        heading: 'Business interpretation',
        type: 'insight',
        body: `${value} adoption means roughly ${value} of the simulated market is modeled as ready to buy. Focus marketing spend on the highest-intent, lowest-resistance segments for the best return. Segments below 30% adoption are conversion barriers and need targeted trust-building or pricing work.`,
      },
    ],
  };
}

export function buildRevenueCaptureModal(
  value: string,
  dna: MarketDNA | null,
  summary: PopulationSummary | undefined,
): InsightModalData {
  const rec = dna?.recoverable_revenue ?? null;
  const convProb = summary?.avg_conversion_probability ?? null;
  const hasData = rec != null && convProb != null && rec > 0;

  const formulaLines = hasData
    ? [
        'Predicted Revenue Capture = Recoverable Revenue × Avg Conversion Probability',
        `= ${fmtCurrency(rec)} × ${((convProb ?? 0) * 100).toFixed(1)}%`,
        `= ${value}`,
      ]
    : ['Insufficient revenue signals to calculate reliably.'];

  return {
    title: 'Predicted Revenue Capture',
    subtitle: 'Estimated revenue from convertible consumers',
    value,
    valueMeaning: hasData ? 'modeled revenue opportunity' : 'Insufficient data',
    sections: [
      {
        heading: 'What this means',
        type: 'normal',
        body: hasData
          ? `Predicted Revenue Capture is the share of recoverable market revenue that simulated consumers are modeled to generate — based on how likely they are to convert and what revenue opportunity exists.`
          : `Revenue capture cannot be reliably calculated because recoverable revenue signals are missing or zero in the current dataset. Upload revenue, price, or BSR data to enable this calculation.`,
      },
      {
        heading: 'Formula and calculation',
        type: 'formula',
        body: formulaLines,
      },
      {
        heading: 'Inputs used',
        type: 'table',
        body: [
          signal('Recoverable revenue (from revenue momentum engine)', rec != null ? fmtCurrency(rec) : null),
          signal('Average conversion probability (from adoption model)', convProb != null ? fmtPct(convProb * 100) : null),
          signal('Revenue density', dna?.revenue_density),
          signal('Total market revenue', dna?.total_market_revenue != null ? fmtCurrency(dna.total_market_revenue) : null),
        ],
      },
      {
        heading: 'Business interpretation',
        type: 'insight',
        body: hasData
          ? `This figure represents the revenue accessible with your current adoption model. To grow it, either increase adoption rate (reduce barriers) or identify higher-revenue segments. It is a ceiling estimate — actual capture depends on pricing, competition, and channel execution.`
          : `Without revenue signals, the simulator cannot generate reliable revenue forecasts. Run the Revenue Momentum or BSR Efficiency engines first, then re-run this simulator.`,
      },
    ],
  };
}

export function buildHighestSegmentModal(seg: Segment | null): InsightModalData {
  if (!seg) {
    return { title: 'Highest Converting Segment', sections: [{ heading: 'No data', type: 'warning', body: 'No active segments found in this dataset.' }] };
  }
  const rate = adoptionRate(seg);
  return {
    title: seg.cluster_name,
    subtitle: 'Highest converting psychographic segment',
    value: fmtPct(rate),
    valueMeaning: 'adoption rate — best in simulation',
    sections: [
      {
        heading: 'Who this segment represents',
        type: 'normal',
        body: `${seg.cluster_name} are the best-performing consumers in this simulation. They have the highest combination of purchase intent, trust, and conversion probability — meaning they face the fewest barriers and are most aligned with your product offering.`,
      },
      {
        heading: 'Segment characteristics',
        type: 'table',
        body: [
          signal('Population', seg.population, `${seg.percentage.toFixed(1)}% of simulated market`),
          signal('Purchase intent', seg.purchase_intent, 'out of 100'),
          signal('Conversion probability', fmtPct(rate)),
          signal('Trust score', seg.trust_score),
          signal('Emotional resonance', seg.emotional_resonance),
          signal('Resistance index', seg.resistance?.resistance_index),
          signal('Primary barrier', seg.resistance?.primary_barrier ?? '—'),
        ],
      },
      {
        heading: 'Behavioral traits',
        type: 'normal',
        body: segmentTraitDescription(seg),
      },
      {
        heading: 'Motivations',
        type: 'normal',
        body: (seg.motivations ?? []).filter(m => m !== '—').length
          ? (seg.motivations ?? []).filter(m => m !== '—')
          : ['Dataset did not produce specific motivation signals for this segment.'],
      },
      {
        heading: 'Why they convert best',
        type: 'insight',
        body: `Their resistance index of ${seg.resistance?.resistance_index?.toFixed(0) ?? '—'}/100 is one of the lowest in the simulation, meaning fewer barriers stand between intent and purchase. Their trust score of ${seg.trust_score.toFixed(0)}/100 indicates high confidence in the product. Prioritise this segment for launch campaigns and retargeting.`,
      },
    ],
  };
}

export function buildLowestSegmentModal(seg: Segment | null): InsightModalData {
  if (!seg) {
    return { title: 'Lowest Converting Segment', sections: [{ heading: 'No data', type: 'warning', body: 'No active segments found in this dataset.' }] };
  }
  const rate = adoptionRate(seg);
  return {
    title: seg.cluster_name,
    subtitle: 'Lowest converting psychographic segment — recovery opportunity',
    value: fmtPct(rate),
    valueMeaning: 'adoption rate — lowest in simulation',
    sections: [
      {
        heading: 'Who this segment represents',
        type: 'normal',
        body: `${seg.cluster_name} have the lowest modeled conversion rate in this simulation. This is not necessarily a problem — it can indicate a segment that needs specific messaging or product education, or one that simply doesn't align with the current product positioning.`,
      },
      {
        heading: 'Performance metrics',
        type: 'table',
        body: [
          signal('Population', seg.population, `${seg.percentage.toFixed(1)}% of simulated market`),
          signal('Purchase intent', seg.purchase_intent, 'out of 100'),
          signal('Conversion probability', fmtPct(rate)),
          signal('Trust score', seg.trust_score),
          signal('Resistance index', seg.resistance?.resistance_index),
          signal('Primary barrier', seg.resistance?.primary_barrier ?? '—'),
        ],
      },
      {
        heading: 'What is blocking this segment',
        type: 'normal',
        body: resistanceExplanation(seg),
      },
      {
        heading: 'Objections from this segment',
        type: 'normal',
        body: (seg.objections ?? []).filter(o => o !== '—').length
          ? (seg.objections ?? []).filter(o => o !== '—')
          : ['No specific objection signals in current dataset.'],
      },
      {
        heading: 'What can improve this segment',
        type: 'insight',
        body: seg.resistance?.recommended_approach
          ? seg.resistance.recommended_approach
          : `Address the primary barrier (${seg.resistance?.primary_barrier ?? 'unknown'}) through targeted content, pricing experiments, or trust-building strategies such as review generation and social proof.`,
      },
    ],
  };
}

export function buildRevenueLiftModal(
  value: string,
  activeSegs: Segment[],
  dna: MarketDNA | null,
): InsightModalData {
  const recov = dna?.recoverable_revenue ?? 0;
  const avgConv = activeSegs.reduce((s, seg) => s + seg.conversion_probability, 0) / Math.max(activeSegs.length, 1);
  const current = recov * avgConv;

  // Uplift factor is based on average resistance across segments:
  // higher avg resistance = larger gap between current and potential adoption
  const avgResistance = activeSegs.reduce((s, seg) => s + (seg.resistance?.resistance_index ?? 0), 0) / Math.max(activeSegs.length, 1);
  const upliftFactor = 1.0 + Math.min(avgResistance / 100.0, 0.8); // 1.0–1.8× based on resistance
  const potential = current * upliftFactor;
  const lift = potential - current;

  const topGainers = [...activeSegs]
    .sort((a, b) => {
      const liftA = (Math.min(100, a.purchase_intent + (a.resistance?.resistance_index ?? 0) * 0.4) - a.purchase_intent);
      const liftB = (Math.min(100, b.purchase_intent + (b.resistance?.resistance_index ?? 0) * 0.4) - b.purchase_intent);
      return liftB - liftA;
    })
    .slice(0, 5);

  // Find the dominant barrier across top gainers
  const barrierCounts: Record<string, number> = {};
  topGainers.forEach(seg => {
    const b = seg.resistance?.primary_barrier ?? '—';
    barrierCounts[b] = (barrierCounts[b] ?? 0) + 1;
  });
  const topBarrier = Object.entries(barrierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Habit Lock-In';

  return {
    title: 'Revenue Lift Opportunity',
    subtitle: 'Incremental revenue achievable by reducing consumer barriers',
    value,
    valueMeaning: 'additional revenue if primary barriers are resolved',
    sections: [
      {
        heading: 'What revenue lift means',
        type: 'normal',
        body: `Revenue Lift Opportunity represents the gap between what the product is likely to earn with current adoption levels and what it could earn if the primary barriers blocking each segment were reduced. It is a target for conversion optimisation — not a guaranteed outcome.`,
      },
      {
        heading: 'Formula and calculation',
        type: 'formula',
        body: [
          'Revenue Lift = Potential Revenue − Current Predicted Revenue',
          `Uplift Factor = 1.0 + (avg resistance / 100) = ${upliftFactor.toFixed(2)}× (higher resistance = more room to improve)`,
          `Current Revenue = Recoverable Revenue × Avg Conversion = ${fmtCurrency(recov)} × ${(avgConv * 100).toFixed(1)}% = ${fmtCurrency(current)}`,
          `Potential Revenue = Current × Uplift Factor = ${fmtCurrency(current)} × ${upliftFactor.toFixed(2)} = ${fmtCurrency(potential)}`,
          `→ Revenue Lift = ${fmtCurrency(potential)} − ${fmtCurrency(current)} = ${fmtCurrency(lift)}`,
        ],
      },
      {
        heading: 'Inputs used',
        type: 'table',
        body: [
          signal('Recoverable revenue (from revenue engine)', recov > 0 ? fmtCurrency(recov) : null),
          signal('Average conversion probability', fmtPct(avgConv * 100)),
          signal('Average segment resistance index', avgResistance.toFixed(1)),
          signal('Uplift factor (resistance-derived)', `${upliftFactor.toFixed(2)}×`),
          signal('Dominant barrier in high-lift segments', topBarrier),
        ],
      },
      {
        heading: 'Segments with highest lift potential',
        type: 'table',
        body: topGainers.map((seg) => {
          const gap = Math.min(100, seg.purchase_intent + (seg.resistance?.resistance_index ?? 0) * 0.4) - seg.purchase_intent;
          return `${seg.cluster_name}: +${gap.toFixed(1)} pt adoption gap (barrier: ${seg.resistance?.primary_barrier ?? '—'})`;
        }),
      },
      {
        heading: 'Business action',
        type: 'insight',
        body: `The dominant barrier across top-lift segments is "${topBarrier}". Start there — resolving this single barrier unlocks the largest portion of this opportunity. Work down the list segment by segment rather than trying to fix everything at once.`,
      },
    ],
  };
}

// ─── Market DNA ───────────────────────────────────────────────────────────────

export function buildDemandEnvironmentModal(value: number | null | undefined, dna: MarketDNA | null): InsightModalData {
  const v = value ?? null;
  const label = v == null ? '—' : v >= 70 ? 'Strong' : v >= 45 ? 'Moderate' : 'Weak';
  const hasData = v != null && v > 0;
  return {
    title: 'Demand Environment',
    subtitle: 'How strong is consumer demand in this product category?',
    value: v != null ? v.toFixed(1) : '—',
    valueMeaning: `${label} demand signal`,
    sections: [
      {
        heading: 'What this score means',
        type: 'normal',
        body: hasData
          ? `A demand score of ${v!.toFixed(1)}/100 indicates ${label.toLowerCase()} consumer demand. This reflects how actively consumers are searching for and engaging with products in this category based on keyword volume, search velocity, and growth trends.`
          : 'Demand score could not be calculated from available data. Run the Demand Strength engine to generate this signal.',
      },
      {
        heading: 'Dashboard signals used',
        type: 'table',
        body: [
          signal('Demand score (Demand Strength engine)', dna?.demand_score),
          signal('Demand velocity (growth rate)', dna?.demand_velocity),
          signal('Total search volume', dna?.total_search_volume != null ? fmtNum(dna.total_search_volume) : null),
          signal('Growth trend', dna?.growth_trend ?? null),
        ],
      },
      {
        heading: 'Business interpretation',
        type: 'insight',
        body: hasData
          ? (v! >= 70
            ? 'Strong demand means a large, actively searching audience. The market is primed — the main challenge is competing for visibility and conversion.'
            : v! >= 45
            ? 'Moderate demand suggests a real market with room to grow. Focus on capturing intent-rich keyword traffic rather than broad awareness campaigns.'
            : 'Weak demand signals mean fewer consumers are actively searching. Consider whether the product needs category education or is better suited to a demand-creation strategy.')
          : 'Run the Demand Strength engine with keyword data to populate this signal.',
      },
    ],
  };
}

export function buildRevenueEnvironmentModal(value: number | null | undefined, dna: MarketDNA | null): InsightModalData {
  const v = value ?? null;
  const label = v == null ? '—' : v >= 70 ? 'High' : v >= 45 ? 'Moderate' : 'Low';
  const hasData = v != null && v > 0;
  return {
    title: 'Revenue Environment',
    subtitle: 'How much revenue is available to capture in this market?',
    value: v != null ? v.toFixed(1) : '—',
    valueMeaning: `${label} revenue density`,
    sections: [
      {
        heading: 'What this score means',
        type: 'normal',
        body: hasData
          ? `Revenue density of ${v!.toFixed(1)}/100 indicates ${label.toLowerCase()} monetisation potential. This combines how much revenue is flowing through the category, how efficiently products convert that revenue, and how much is recoverable for new entrants.`
          : 'Revenue density score could not be calculated. Run the Revenue Momentum or BSR Efficiency engine to generate revenue signals.',
      },
      {
        heading: 'Dashboard signals used',
        type: 'table',
        body: [
          signal('Revenue density (Revenue Momentum engine)', dna?.revenue_density),
          signal('Recoverable revenue', dna?.recoverable_revenue != null ? fmtCurrency(dna.recoverable_revenue) : null),
          signal('Conversion efficiency', dna?.conversion_efficiency),
          signal('Market price floor', dna?.market_price_floor != null ? `$${dna.market_price_floor.toFixed(2)}` : null),
          signal('Market price ceiling', dna?.market_price_ceiling != null ? `$${dna.market_price_ceiling.toFixed(2)}` : null),
        ],
      },
      {
        heading: 'Business interpretation',
        type: 'insight',
        body: hasData
          ? (v! >= 70
            ? 'High revenue density means significant money is flowing through this category. Products that capture even a small share will generate meaningful revenue. Competition for that revenue is likely intense.'
            : v! >= 45
            ? 'Moderate revenue density indicates a viable market. Revenue is present but may require category leadership or pricing differentiation to capture efficiently.'
            : 'Low revenue density suggests either a price-competitive market with thin margins or a category where volume must compensate for low unit economics.')
          : 'Run revenue-based engines (Revenue Momentum, BSR Efficiency) to calculate this signal.',
      },
    ],
  };
}

export function buildCompetitionEnvironmentModal(value: number | null | undefined, dna: MarketDNA | null): InsightModalData {
  const v = value ?? null;
  const label = v == null ? '—' : v >= 70 ? 'Highly competitive' : v >= 45 ? 'Moderately competitive' : 'Low competition';
  const hasData = v != null && v > 0;
  return {
    title: 'Competition Environment',
    subtitle: 'How saturated and competitive is this product category?',
    value: v != null ? v.toFixed(1) : '—',
    valueMeaning: `${label}`,
    sections: [
      {
        heading: 'What this score means',
        type: 'normal',
        body: hasData
          ? `A competitive saturation of ${v!.toFixed(1)}/100 reflects ${label.toLowerCase()}. Higher scores mean more established competitors dominate the category. This score is derived from the HHI (Herfindahl-Hirschman Index) and brand concentration data.`
          : 'Competition score could not be calculated. Run the Market Concentration engine to generate this signal.',
      },
      {
        heading: 'Dashboard signals used',
        type: 'table',
        body: [
          signal('HHI score (Market Concentration engine)', dna?.hhi_score),
          signal('Competitive saturation', dna?.competitive_saturation),
        ],
      },
      {
        heading: 'Business interpretation',
        type: 'insight',
        body: hasData
          ? (v! >= 70
            ? 'High competition means a few dominant brands control most of the category. New entrants need strong differentiation, a clear niche, or a significant price or quality advantage to gain traction.'
            : v! >= 45
            ? 'Moderate competition means the market has established players but room for new entrants. A well-targeted product with solid reviews can build share over time.'
            : 'Low competition is rare and valuable. It indicates fragmentation — no single player dominates, making it easier for a new product to capture share quickly.')
          : 'Run the Market Concentration engine with ASIN or competitor data to populate this signal.',
      },
    ],
  };
}

export function buildConsumerEnvironmentModal(value: number | null | undefined, summary: PopulationSummary | undefined, dna: MarketDNA | null): InsightModalData {
  const v = value ?? null;
  const label = v == null ? '—' : v >= 70 ? 'Strong consumer confidence' : v >= 45 ? 'Moderate trust' : 'Low consumer trust';
  const hasData = v != null && v > 0;
  return {
    title: 'Consumer Environment',
    subtitle: 'How trusted and receptive are consumers in this category?',
    value: v != null ? v.toFixed(1) : '—',
    valueMeaning: `${label}`,
    sections: [
      {
        heading: 'What this score means',
        type: 'normal',
        body: hasData
          ? `Consumer environment score of ${v!.toFixed(1)}/100 combines average trust scores from the simulated population with review sentiment signals. Higher scores mean consumers in this category are receptive and trust product claims — which accelerates adoption.`
          : 'Consumer environment score could not be calculated. Review and sentiment data helps populate this signal.',
      },
      {
        heading: 'Dashboard signals used',
        type: 'table',
        body: [
          signal('Average trust score (from adoption model)', summary?.avg_trust_score),
          signal('Average emotional resonance', summary?.avg_emotional_resonance),
          signal('Review sentiment score', dna?.review_sentiment_score),
          signal('Friction keyword count', dna?.friction_keyword_count),
        ],
      },
      {
        heading: 'Business interpretation',
        type: 'insight',
        body: hasData
          ? (v! >= 70
            ? 'Strong consumer trust means the category has positive review ecosystems and high buyer confidence. New products benefit from spillover trust — good reviews convert quickly.'
            : v! >= 45
            ? 'Moderate trust means consumer reviews are mixed or incomplete. New products need to actively build social proof through review programs and Q&A engagement.'
            : 'Low consumer trust indicates high friction — negative reviews, buyer uncertainty, or complex buying decisions. Products must work harder to earn the first purchase.')
          : 'Review sentiment signals from your dataset help calculate this score. Ensure review data is included in your uploaded files.',
      },
    ],
  };
}

// ─── Segment Card Modal ────────────────────────────────────────────────────────

/** Compute a concise classification label for the modal header */
function segmentClassification(seg: Segment): string {
  const rate       = adoptionRate(seg);
  const resistance = seg.resistance?.resistance_index ?? 0;
  const intent     = seg.purchase_intent ?? 0;
  const popShare   = seg.percentage ?? 0;

  // Primary classification
  let primary = '';
  if (rate >= 50 && resistance < 45 && popShare >= 5) primary = 'Scale Candidate';
  else if (rate >= 50 && resistance < 60 && popShare >= 5) primary = 'High Opportunity';
  else if (rate >= 50 && popShare < 5) primary = 'Niche Segment';
  else if (rate >= 35 && rate < 50) primary = 'Moderate Opportunity';
  else if (resistance >= 60) primary = 'Barrier Heavy';
  else primary = 'Low Fit';

  // Secondary qualifier
  let secondary = '';
  if (resistance >= 60) secondary = 'High Resistance';
  else if (resistance >= 45) secondary = 'Moderate Resistance';
  else secondary = 'Low Resistance';

  // Override secondary when intent is distinctive
  if (intent >= 65) secondary = 'Strong Intent';
  else if (intent < 45) secondary = 'Weak Intent';

  return `${primary} · ${secondary}`;
}

/** Sort resistance barriers highest-to-lowest and build labelled lines */
function sortedBarrierLines(seg: Segment): string[] {
  const r = seg.resistance;
  if (!r) return ['No resistance data available for this segment.'];

  const barriers: Array<[string, number]> = [
    ['Habit Lock-In',         r.habit_lock_in         ?? 0],
    ['Competitor Loyalty',    r.competitor_loyalty    ?? 0],
    ['Trust Barrier',         r.trust_barrier         ?? 0],
    ['Price Resistance',      r.price_resistance      ?? 0],
    ['Product Complexity',    r.product_complexity    ?? 0],
    ['Education Required',    r.education_requirement ?? 0],
  ].filter(([, v]) => (v as number) > 0) as Array<[string, number]>;

  // Sort highest first
  barriers.sort((a, b) => (b[1] as number) - (a[1] as number));

  return barriers.map(([name, score], i) => {
    const label = i === 0 ? 'Primary barrier'
                : i === 1 ? 'Secondary barrier'
                : 'Other barrier';
    const s = score as number;
    const severity = s >= 60 ? '⚠ High' : s >= 45 ? 'Moderate' : 'Low';
    return `${label}: ${name} — ${s.toFixed(0)}/100 (${severity})`;
  });
}

/** Intent vs adoption explanation */
function intentAdoptionExplanation(seg: Segment): string {
  const rate       = adoptionRate(seg);
  const intent     = seg.purchase_intent ?? 0;
  const resistance = seg.resistance?.resistance_index ?? 0;
  const switching  = (seg.switching_probability ?? 0) * 100;
  const trust      = seg.trust_score ?? 0;
  const gap        = intent - rate;

  if (gap > 15) {
    // Intent noticeably higher than adoption — explain the drop
    const reasons: string[] = [];
    if (resistance >= 55) reasons.push(`high resistance (${resistance.toFixed(0)}/100)`);
    if (switching >= 45)  reasons.push(`elevated switching difficulty (${switching.toFixed(0)}%)`);
    if (trust < 50)       reasons.push(`low trust score (${trust.toFixed(0)}/100)`);
    const r = seg.resistance;
    const topBarrier = r
      ? (() => {
          const bars: Array<[string, number]> = [
            ['habit lock-in',       r.habit_lock_in      ?? 0],
            ['competitor loyalty',  r.competitor_loyalty ?? 0],
            ['price resistance',    r.price_resistance   ?? 0],
            ['trust barrier',       r.trust_barrier      ?? 0],
          ].map(([n, v]) => [n, v as number] as [string, number]);
          bars.sort((a, b) => b[1] - a[1]);
          return bars[0][0];
        })()
      : null;

    const reasonStr = reasons.length > 0
      ? reasons.join(' and ')
      : `${seg.resistance?.primary_barrier ?? 'unknown barriers'} reducing conversion`;

    return `Adoption (${rate.toFixed(1)}%) is lower than intent (${intent.toFixed(0)}/100) because this segment shows ${reasonStr}.${
      topBarrier ? ` The dominant blocker is ${topBarrier} — addressing it is the most direct path to improving conversion.` : ''
    } Interest exists, but conversion needs stronger proof or incentive to close the gap.`;
  }

  if (rate >= intent * 0.95) {
    // Adoption is close to or exceeds intent level
    return `Adoption (${rate.toFixed(1)}%) is strong relative to intent (${intent.toFixed(0)}/100). This segment's motivations align closely with the product benefits and resistance (${resistance.toFixed(0)}/100) is manageable. Trust (${trust.toFixed(0)}/100) and emotional resonance support conversion without major friction.`;
  }

  // Small gap
  return `Adoption (${rate.toFixed(1)}%) tracks close to intent (${intent.toFixed(0)}/100), with a modest gap driven by ${
    resistance >= 45 ? `moderate resistance (${resistance.toFixed(0)}/100)` : 'minor friction factors'
  }. Small improvements to trust or value clarity can close this gap.`;
}

/** Segment-specific business insight */
function segmentBusinessInsight(seg: Segment): string {
  const name = seg.cluster_name;
  const r    = seg.resistance;

  // Build sorted barriers with explicit tuple types to satisfy TypeScript
  const topBarrier: string = r
    ? ((): string => {
        const bars: [string, number][] = [
          ['Habit Lock-In',       Number(r.habit_lock_in       ?? 0)] as [string, number],
          ['Competitor Loyalty',  Number(r.competitor_loyalty  ?? 0)] as [string, number],
          ['Trust Barrier',       Number(r.trust_barrier       ?? 0)] as [string, number],
          ['Price Resistance',    Number(r.price_resistance    ?? 0)] as [string, number],
          ['Product Complexity',  Number(r.product_complexity  ?? 0)] as [string, number],
          ['Education Required',  Number(r.education_requirement ?? 0)] as [string, number],
        ];
        bars.sort((a, b) => b[1] - a[1]);
        return bars[0][0];
      })()
    : (seg.resistance?.primary_barrier as string | undefined) ?? 'resistance';

  const insights: Record<string, string> = {
    'Sustainability Focused':
      `Position the product around responsible materials, durability, reduced waste, ethical sourcing, recyclable packaging, or long-term value. Certifications and transparency of supply chain build the most trust here. Avoid purely discount-led messaging — this segment needs proof of responsible value, not just a lower price. Primary blocker: ${topBarrier}.`,
    'Value Maximizers':
      `Frame the product around value per use, bundle savings, durability, and long-term cost advantage. This segment responds better to proof of savings (e.g. cost-per-use calculator, quantity per pack) than premium lifestyle imagery. Show the math — they want evidence, not claims. Primary blocker: ${topBarrier}.`,
    'First-Time Buyers':
      `Reduce uncertainty with simple, jargon-free explanations, a buyer guide or how-it-works section, FAQ content addressing the most common concerns, return confidence, and beginner-friendly proof points. This segment has the most to gain from an easy first-purchase experience. Primary blocker: ${topBarrier}.`,
    'Brand Loyalists':
      `Win trust through clear comparison proof against familiar alternatives, credibility signals (certifications, verified reviews, seller tenure), and explicit reasons to switch. Don't ask them to abandon their loyalty — give them a compelling reason to try this instead. Primary blocker: ${topBarrier}.`,
    'Risk-Averse Buyers':
      `Lead with trust infrastructure: return policy guarantees, a+ content, verified buyer reviews that address their specific concerns, and purchase protection signals. Every friction point they encounter reduces conversion — address their top objection directly above the fold. Primary blocker: ${topBarrier}.`,
    'Deal Hunters':
      `Activate with limited-time offers, visible coupon codes, percentage-off anchors, and bundle discounts. "Deal of the day" mechanics and lightning deals outperform standard promotions for this segment. Price anchoring (crossed-out original price) raises perceived savings. Primary blocker: ${topBarrier}.`,
    'Premium Quality Seekers':
      `Prove superiority through material quality evidence, craftsmanship details, performance specifications, and comparison against cheaper alternatives. This segment will pay more — but only if they believe the product genuinely outperforms. Don't undersell. Primary blocker: ${topBarrier}.`,
    'Convenience Buyers':
      `Eliminate every friction point: emphasise Prime eligibility, fast and reliable delivery, easy returns, and simple one-step replenishment (subscribe-and-save). Effort reduction is the dominant motivator — make the buying experience effortless. Primary blocker: ${topBarrier}.`,
    'Category Experts':
      `Provide accurate technical specifications, detailed comparison tables, and advanced use-case proof. This segment detects vague or generic claims immediately and will abandon listings that don't prove performance at a technical level. They reward honesty. Primary blocker: ${topBarrier}.`,
    'Heavy Users':
      `Emphasise durability, repeat-use reliability, cost-over-time value, and subscription/auto-reorder benefits. This segment buys frequently, so subscription pricing and bulk discounts reduce churn. Consistency is the key trust signal. Primary blocker: ${topBarrier}.`,
    'Occasional Users':
      `Position as a low-commitment, high-value choice. Highlight simple use cases, flexible purchase options (single purchase, no subscription required), and clear suitability for infrequent needs. Reduce the fear of buying something they won't use. Primary blocker: ${topBarrier}.`,
    'Gift Buyers':
      `Emphasise emotional appeal, safe and universal choice, high-quality presentation, and gifting suitability signals. Gift-wrap availability, premium packaging photos, and "perfect for occasions" messaging help. Price should feel appropriate, not cheap or excessive. Primary blocker: ${topBarrier}.`,
    'Impulse Shoppers':
      `Maximise urgency and visual appeal: hero images, strong emotional headline, clear price, and quick social proof. Bestseller rank, "X people bought this today", and limited-stock signals trigger impulse conversion. Keep the path to purchase very short. Primary blocker: ${topBarrier}.`,
    'Practical Buyers':
      `Prove functionality and reliability with real-world use cases, honest performance claims, and no-fluff product descriptions. This segment is allergic to marketing puffery — clear, factual, and direct language converts best. Show what it does and why it works. Primary blocker: ${topBarrier}.`,
    'Problem Solvers':
      `Match the product description precisely to their stated problem. Use "if you struggle with X, this product solves it by Y" framing. Before/after clarity and specific pain-point resolution are the highest-converting messaging patterns for this segment. Primary blocker: ${topBarrier}.`,
    'Switchers':
      `Provide direct side-by-side comparison with what they currently use. Highlight specific advantages (price, features, quality, availability) over their existing choice. Introductory offers or trial incentives reduce the perceived risk of switching brands. Primary blocker: ${topBarrier}.`,
    'Trend Followers':
      `Use social proof heavily: bestseller ranking, review count and velocity, "trending in [category]" signals, and "customers who viewed this also bought" patterns. Recency signals (new launch, recently updated, popular right now) drive this segment. Primary blocker: ${topBarrier}.`,
    'Feature Researchers':
      `Provide the most comprehensive listing possible: detailed feature comparison table, technical spec sheet, video walkthrough, and answers to the most asked questions. This segment will find any gap — fill it before they do. Primary blocker: ${topBarrier}.`,
    'Budget Maximizers':
      `Lead with affordability proof: unit economics, quantity per pack, total value vs. alternatives, and visible price transparency. "Lowest price for this quality" framing outperforms premium messaging entirely. Show exactly what they get for the price. Primary blocker: ${topBarrier}.`,
    'Status Seekers':
      `Signal exclusivity, style, and brand reputation. Premium packaging, aspirational lifestyle imagery, limited-edition cues, and association with respected brands or celebrities convert this segment. Price should feel elevated, not discounted. Primary blocker: ${topBarrier}.`,
  };

  return insights[name]
    ?? `Focus messaging on ${(seg.motivations ?? ['value and quality'])[0]?.toLowerCase() ?? 'value and quality'} — the primary driver for this segment. Reducing "${topBarrier}" (currently ${r?.resistance_index?.toFixed(0) ?? '—'}/100 resistance) is the most direct route to improving conversion.`;
}

/** Full description of each segment archetype */
function getSegmentDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'Budget Maximizers':
      'Highly price-sensitive consumers who systematically compare prices across options and wait for deals before committing. They are motivated by extracting maximum value from every purchase and are immediately deterred by any perception of overpricing.',
    'Premium Quality Seekers':
      'Consumers who equate higher prices with superior quality. They invest time reading detailed product descriptions, comparing specifications, and evaluating reviews. They willingly pay a premium for products that genuinely outperform alternatives.',
    'Convenience Buyers':
      'Motivated entirely by speed, simplicity, and frictionless purchase experience. Prime membership, fast shipping, easy returns, and minimal steps to checkout are decisive. Any additional effort in the buying process loses them.',
    'Brand Loyalists':
      'Have strong, established brand preferences and rarely deviate without a compelling reason. They are challenging to acquire but retain extremely well once converted. Brand credibility and comparison signals are the most effective levers.',
    'Deal Hunters':
      'Actively and systematically hunt for coupons, limited-time offers, and promotional pricing. They respond powerfully to "deal of the day" mechanics, visible savings, and lightning deals. Price anchoring against a higher original price drives conversion.',
    'Feature Researchers':
      'Invest significant time comparing product specifications, reading detailed reviews, and watching product videos before purchasing. Comprehensive listings, detailed Q&A, and feature comparison tables are essential to convert them.',
    'Risk-Averse Buyers':
      'Deeply concerned about making a poor purchase decision. Social proof, strong return policies, A+ content, verified review counts, and purchase guarantees reduce their hesitation. They convert slowly but confidently once trust is established.',
    'Impulse Shoppers':
      'Make fast, low-consideration purchase decisions based on immediate visual appeal, clear pricing, and emotional triggers. Strong hero images, compelling headlines, bestseller signals, and urgency cues drive quick conversion.',
    'Trend Followers':
      'Attracted to products that are socially validated, trending, or recently popular. Bestseller rank, review velocity, "customers also bought" patterns, and "trending now" signals influence them strongly.',
    'Practical Buyers':
      'Focus on functional utility and real-world performance. They care whether the product does the job reliably, not about brand prestige or aesthetics. Honest, functional product descriptions and practical use-case proof convert them best.',
    'Gift Buyers':
      'Purchasing on behalf of someone else. Packaging quality, giftability, appropriate price point, and ease of gifting are the top decision factors. Occasion-specific messaging, gift-wrap options, and "ideal gift for" framing help.',
    'Heavy Users':
      'Frequent, high-volume purchasers with strong category knowledge. They typically buy in bulk or use auto-reorder. They value product reliability, consistency, and the economics of repeat purchase above novelty.',
    'Occasional Users':
      'Purchase infrequently — typically for seasonal needs or specific life events. They require more category education and purchase reassurance because they are less familiar with the category norms and expectations.',
    'Sustainability Focused':
      'Prioritise environmentally responsible and ethically sourced products. They look for certifications, recyclable or minimal packaging, sustainable sourcing claims, and transparent supply chains. Greenwashing immediately destroys trust.',
    'Status Seekers':
      'Purchase decisions are strongly influenced by how the product reflects on their identity and social standing. Premium positioning, aspirational imagery, exclusivity signals, and strong brand associations drive this segment.',
    'Value Maximizers':
      'Neither the cheapest nor the most premium — they seek the optimal quality-to-price ratio. They respond well to clear value comparisons, cost-per-use breakdowns, and evidence that the product outperforms alternatives at its price point.',
    'Problem Solvers':
      'Have a specific, well-defined problem and are actively searching for the right solution. They use precise, problem-focused search queries. Product descriptions that directly map to their stated problem convert them most effectively.',
    'First-Time Buyers':
      'New to the product category. They require education, reassurance, and guided decision support. FAQs, how-it-works explanations, return guarantees, and beginner-friendly proof points significantly reduce their purchase anxiety.',
    'Category Experts':
      'Possess deep category knowledge and very specific technical requirements. They are not misled by generic marketing language and require accurate, detailed specifications. They are highly valuable long-term customers when won.',
    'Switchers':
      'Currently purchasing from a competitor but open to better alternatives. They are motivated by dissatisfaction, price differences, or the lure of something better. Comparison messaging, introductory offers, and strong differentiation proof win them.',
  };
  return descriptions[name]
    ?? `${name} is a distinct psychographic segment in this simulation. Their behavior, intent, and resistance values are calculated from actual dataset signals — not hardcoded archetypes.`;
}

export function buildSegmentModal(seg: Segment): InsightModalData {
  const rate       = adoptionRate(seg);
  const inactive   = seg.population === 0;
  const resistance = seg.resistance?.resistance_index ?? 0;
  const intent     = seg.purchase_intent ?? 0;
  const trust      = seg.trust_score ?? 0;
  const resonance  = seg.emotional_resonance ?? 0;
  const switching  = (seg.switching_probability ?? 0) * 100;

  // Classification label for subtitle
  const classLabel = inactive ? 'Minimum Population Allocated' : segmentClassification(seg);

  return {
    title: seg.cluster_name,
    subtitle: classLabel,
    value: inactive ? fmtPct(0) : fmtPct(rate),
    valueMeaning: inactive
      ? `${fmtNum(seg.population)} consumers allocated (minimum floor) — limited signal match`
      : `adoption rate · ${fmtNum(seg.population)} consumers (${seg.percentage?.toFixed(1) ?? '0'}% of 1,000)`,
    sections: [
      // ── Who this segment is ──────────────────────────────────────────────
      {
        heading: 'Who this segment represents',
        type: 'normal',
        body: getSegmentDescription(seg.cluster_name),
      },

      // ── Adoption metrics ─────────────────────────────────────────────────
      {
        heading: 'Adoption metrics',
        type: 'table',
        body: [
          signal('Population', seg.population,
            `${seg.percentage?.toFixed(1) ?? '—'}% share · constrained to 25–150 per segment`),
          signal('Purchase intent', intent, 'willingness to buy, out of 100'),
          signal('Adoption rate (conversion probability)', fmtPct(rate),
            'modeled % likely to complete purchase given intent, trust, and resistance'),
          signal('Trust score', trust,
            'estimated from review sentiment, rating confidence, friction signals, and brand familiarity'),
          signal('Emotional resonance', resonance,
            'how strongly segment motivations match the product\'s perceived benefits'),
          signal('Switching probability', fmtPct(switching),
            'estimated from competitor loyalty, habit lock-in, price sensitivity, and perceived differentiation'),
          signal('Resistance index', resistance,
            resistance >= 60 ? 'High — strong barriers to first purchase'
              : resistance >= 45 ? 'Moderate — notable but addressable barriers'
              : 'Low — few barriers, easier to convert'),
        ],
      },

      // ── Intent vs adoption explanation ───────────────────────────────────
      {
        heading: 'Intent vs adoption analysis',
        type: 'normal',
        body: intentAdoptionExplanation(seg),
      },

      // ── Score explanations ───────────────────────────────────────────────
      {
        heading: 'Score explanations',
        type: 'table',
        body: [
          `Trust score (${trust.toFixed(0)}/100): Estimated from review sentiment score, average rating confidence, complaint and friction keyword signals, brand familiarity, and return confidence where available from the dataset.`,
          `Emotional resonance (${resonance.toFixed(0)}/100): Estimates how strongly this segment's motivations match the product's perceived benefits — quality, convenience, sustainability, status, safety, or value. Higher resonance = better motivation-product fit.`,
          `Switching probability (${switching.toFixed(1)}%): Estimated from competitor loyalty strength, habit lock-in score, price sensitivity, trust barrier level, and perceived differentiation advantage. Lower is better — under 35% is low risk.`,
        ],
      },

      // ── Motivations ──────────────────────────────────────────────────────
      {
        heading: 'Motivations',
        type: 'normal',
        body: (() => {
          const motives = (seg.motivations ?? []).filter(m => m && m !== '—');
          return motives.length > 0
            ? motives.slice(0, 3)
            : ['No specific motivation signals from current dataset — upload richer keyword and revenue data to activate segment-specific motivations.'];
        })(),
      },

      // ── Behavioral traits ─────────────────────────────────────────────────
      {
        heading: 'Behavioral traits',
        type: 'normal',
        body: segmentTraitDescription(seg),
      },

      // ── Barriers (sorted highest → lowest) ──────────────────────────────
      {
        heading: 'Barriers — sorted highest to lowest',
        type: 'normal',
        body: sortedBarrierLines(seg),
      },

      ...(seg.llm_reasoning ? [{
        heading: 'LLM Analysis',
        type: 'insight' as const,
        body: seg.llm_reasoning,
      }] : []),

      // ── Business insight (segment-specific) ──────────────────────────────
      {
        heading: 'Business insight',
        type: 'insight',
        body: segmentBusinessInsight(seg),
      },

      // ── Calculation details ───────────────────────────────────────────────
      {
        heading: 'Calculation details',
        type: 'formula',
        body: [
          'Segment Adoption Probability = Base Intent + Motivation Fit + Trust Score Impact + Product Resonance − Resistance Penalty − Switching Difficulty',
          '',
          `Base intent (purchase_intent): ${intent.toFixed(1)}/100`,
          `  → Derived from demand score, segment trait affinity, and dataset signal alignment`,
          '',
          `Trust score impact: ${trust.toFixed(1)}/100`,
          `  → From review sentiment, friction keyword count, and brand familiarity signals`,
          '',
          `Emotional resonance: ${resonance.toFixed(1)}/100`,
          `  → Motivation-product match across quality, convenience, sustainability, value axes`,
          '',
          `Resistance penalty: ${resistance.toFixed(1)}/100`,
          `  → Composite of habit lock-in, competitor loyalty, trust barrier, price resistance,`,
          `    product complexity, and education requirement`,
          '',
          `Switching difficulty: ${switching.toFixed(1)}%`,
          `  → Competitor loyalty + habit lock-in + price sensitivity + trust barrier`,
          '',
          `Final adoption probability ≈ ${fmtPct(rate)}`,
          `  → conversion_probability × 100`,
          '',
          'Population allocation method:',
          `  All 20 segments start at minimum 25 consumers. Remaining 500 are distributed`,
          `  by dataset-driven fit scores (affinity × DNA signals), capped at 150 per segment.`,
          `  Largest-remainder rounding ensures total = exactly 1,000.`,
          `  This segment: ${seg.population} consumers (${seg.percentage?.toFixed(1) ?? '—'}% share).`,
        ],
      },
    ],
  };
}

// ─── Adoption Matrix Row ──────────────────────────────────────────────────────

export function buildMatrixRowModal(seg: Segment): InsightModalData {
  const rate = adoptionRate(seg);
  return {
    title: seg.cluster_name,
    subtitle: 'Adoption Simulation Matrix — detailed breakdown',
    value: fmtPct(rate),
    valueMeaning: 'modeled conversion rate',
    sections: [
      {
        heading: 'Adoption drivers',
        type: 'table',
        body: [
          signal('Purchase intent', seg.purchase_intent, 'willingness to buy, out of 100'),
          signal('Conversion probability', fmtPct(rate), 'modeled % likely to complete purchase'),
          signal('Trust score', seg.trust_score, 'confidence in product claims'),
          signal('Emotional resonance', seg.emotional_resonance, 'emotional alignment with product'),
          signal('Switching probability', fmtPct(seg.switching_probability * 100), 'likelihood to switch from current brand'),
        ],
      },
      {
        heading: 'Conversion logic',
        type: 'formula',
        body: [
          'Conversion Probability = f(purchase_intent, trust_score, resistance_index)',
          `= intent ${seg.purchase_intent.toFixed(0)} × trust factor ${(seg.trust_score / 100).toFixed(2)} × (1 − resistance ${((seg.resistance?.resistance_index ?? 0) / 100).toFixed(2)})`,
          `≈ ${fmtPct(rate)}`,
        ],
      },
      {
        heading: 'Resistance breakdown',
        type: 'normal',
        body: resistanceExplanation(seg),
      },
      {
        heading: 'Business meaning',
        type: 'insight',
        body: `A ${fmtPct(rate)} conversion rate means ${fmtPct(rate)} of the ${fmtNum(seg.population)} simulated ${seg.cluster_name} consumers are likely to purchase. ${seg.resistance?.recommended_approach ?? 'Focus on the primary barrier to improve this rate.'}`,
      },
    ],
  };
}

// ─── Revenue Lift Row ──────────────────────────────────────────────────────────

export function buildLiftRowModal(seg: Segment, potential: number, lift: number, revOpp: number): InsightModalData {
  return {
    title: seg.cluster_name,
    subtitle: 'Revenue Lift — adoption gap and opportunity',
    value: `+${lift.toFixed(1)} pts`,
    valueMeaning: 'adoption lift potential',
    sections: [
      {
        heading: 'What this row shows',
        type: 'normal',
        body: `This segment has a ${lift.toFixed(1)} percentage point gap between current modeled adoption and what it could achieve if its primary barriers were reduced. Closing this gap represents a ${fmtCurrency(revOpp)} revenue opportunity.`,
      },
      {
        heading: 'Calculation',
        type: 'formula',
        body: [
          'Potential Adoption = min(100, Current Intent + Resistance Index × 0.4)',
          `= min(100, ${seg.purchase_intent.toFixed(1)} + ${(seg.resistance?.resistance_index ?? 0).toFixed(1)} × 0.4)`,
          `= ${potential.toFixed(1)}%`,
          `Adoption Lift = Potential − Current = ${potential.toFixed(1)} − ${seg.purchase_intent.toFixed(1)} = +${lift.toFixed(1)} pts`,
          `Revenue Opportunity = Recoverable Revenue × Segment Share × Lift Factor`,
          `≈ ${fmtCurrency(revOpp)}`,
        ],
      },
      {
        heading: 'What is blocking this segment',
        type: 'normal',
        body: resistanceExplanation(seg),
      },
      {
        heading: 'Business action',
        type: 'insight',
        body: `Primary barrier: ${seg.resistance?.primary_barrier ?? '—'}. ${seg.resistance?.recommended_approach ?? 'Reducing this specific barrier is the fastest path to closing the adoption gap for this segment.'}`,
      },
    ],
  };
}

// ─── Scenario Testing ─────────────────────────────────────────────────────────

export function buildPricingScenarioModal(scenario: PricingScenario): InsightModalData {
  const dir = scenario.pct_change > 0 ? 'increase' : 'decrease';
  const revenueGood = scenario.revenue_change_pct >= 0;
  return {
    title: `Pricing Scenario: ${scenario.scenario}`,
    subtitle: `What happens if price changes by ${scenario.pct_change > 0 ? '+' : ''}${scenario.pct_change}%?`,
    sections: [
      {
        heading: 'Scenario impact summary',
        type: 'table',
        body: [
          signal('Base purchase intent', scenario.base_intent?.toFixed(1), 'before price change'),
          signal('New purchase intent', scenario.new_intent?.toFixed(1), 'after price change'),
          signal('Adoption change', `${scenario.adoption_delta >= 0 ? '+' : ''}${scenario.adoption_delta?.toFixed(1)} pts`),
          signal('Revenue change', `${scenario.revenue_change_pct >= 0 ? '+' : ''}${scenario.revenue_change_pct?.toFixed(1)}%`),
        ],
      },
      {
        heading: 'Why this happened',
        type: 'normal',
        body: [
          `A ${Math.abs(scenario.pct_change)}% price ${dir} affects price-sensitive segments most. The simulation models each segment's price sensitivity (from dataset price elasticity and resistance signals) and calculates how intent changes.`,
          revenueGood
            ? `Revenue increased because the price uplift outweighs the adoption drop — the market can absorb this price ${dir}.`
            : `Revenue fell because the adoption drop is larger than the price gain — this price ${dir} costs more than it earns.`,
        ],
      },
      ...(scenario.segment_sensitivity?.length
        ? [{
            heading: 'Most sensitive segments',
            type: 'table' as const,
            body: (scenario.segment_sensitivity ?? []).slice(0, 5).map(s =>
              signal(s.segment, `${s.intent_change >= 0 ? '+' : ''}${s.intent_change.toFixed(1)} pts intent`, `sensitivity ${s.sensitivity.toFixed(2)}`),
            ),
          }]
        : []),
      {
        heading: 'Business action',
        type: 'insight',
        body: revenueGood
          ? `This price ${dir} is modeled as net-positive. Monitor adoption closely if implemented — if real-world adoption drops faster than modeled, the price change may need to be partially reversed.`
          : `This price ${dir} is modeled as net-negative. The revenue loss from lower adoption outweighs the price gain. Consider whether a smaller ${dir} (e.g., half the modelled amount) could preserve adoption while improving margins.`,
      },
    ],
  };
}

export function buildCompetitiveScenarioModal(scenario: CompetitiveScenario): InsightModalData {
  return {
    title: scenario.scenario,
    subtitle: 'Competitive landscape change impact',
    sections: [
      {
        heading: 'What this scenario models',
        type: 'normal',
        body: scenario.description,
      },
      {
        heading: 'Modeled impact',
        type: 'table',
        body: [
          signal('Adoption impact', `${scenario.adoption_impact >= 0 ? '+' : ''}${scenario.adoption_impact?.toFixed(1)} pts`),
          signal('Revenue effect', `${scenario.revenue_effect_pct >= 0 ? '+' : ''}${scenario.revenue_effect_pct?.toFixed(1)}%`),
        ],
      },
      ...(scenario.vulnerable_segments?.length
        ? [{
            heading: 'Most vulnerable segments',
            type: 'table' as const,
            body: (scenario.vulnerable_segments ?? []).slice(0, 5).map(s =>
              signal(s.segment, `vulnerability score ${s.vulnerability_score.toFixed(1)}`),
            ),
          }]
        : []),
      {
        heading: 'Business action',
        type: 'insight',
        body: scenario.adoption_impact < 0
          ? 'This competitive change reduces your addressable market. Strengthen brand-loyal and trust-based segments, and focus on differentiation rather than price competition.'
          : 'This competitive change is favorable. Use the window to invest in brand-building and category leadership while competitors are weakened.',
      },
    ],
  };
}

export function buildSentimentScenarioModal(scenario: SentimentScenario): InsightModalData {
  const leverLines = (scenario.chosen_levers ?? []).map((lv, i) => {
    const label = lv.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const reason = scenario.selection_reasoning?.[i] ?? '';
    return reason ? `${label}: ${reason}` : label;
  });

  return {
    title: scenario.scenario,
    subtitle: 'Dataset-driven improvement combination for this product',
    sections: [
      {
        heading: 'What this scenario models',
        type: 'normal',
        body: scenario.description,
      },
      {
        heading: 'Modeled impact',
        type: 'table',
        body: [
          signal('Adoption lift', `+${scenario.adoption_lift?.toFixed(1)} pts`),
          signal('Conversion lift', `+${scenario.conv_lift_pct?.toFixed(1)}%`),
          signal('Retention lift', `+${scenario.retention_lift_pct?.toFixed(1)}%`),
          signal('New intent', `${scenario.new_intent?.toFixed(1)}/100`),
          signal('New conversion', `${scenario.new_conversion?.toFixed(1)}%`),
        ],
      },
      ...(leverLines.length > 0 ? [{
        heading: 'Selected improvement levers (why these were chosen)',
        type: 'normal' as const,
        body: leverLines,
      }] : []),
      {
        heading: 'Most impacted segments',
        type: 'table',
        body: (scenario.most_impacted_segments ?? []).slice(0, 5).map(s =>
          `${s.segment} — sensitivity score: ${(s.sensitivity_score ?? s.risk_aversion ?? 0).toFixed(2)}`,
        ),
      },
      {
        heading: 'Business action',
        type: 'insight',
        body: `These improvements are prioritised for your specific dataset. Focus execution budget on the top 1–2 levers — they account for most of the expected adoption lift. The third lever provides diminishing returns and can be addressed in a second phase.`,
      },
    ],
  };
}
