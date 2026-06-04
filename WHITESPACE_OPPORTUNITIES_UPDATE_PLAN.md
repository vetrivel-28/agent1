# WhitespaceOpportunities.tsx Update Plan

## Current Status
- File: 654 lines
- Already has: KpiCard component, DataTable integration, segment modal
- Missing: EvidenceModal integration, clickable evidence for cards/rows

## Required Changes Summary

### 1. Imports
```typescript
// Remove
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';

// Add
import { EvidenceModal, type EvidenceData } from '../components/ui/EvidenceModal';

// Keep all other imports
```

### 2. Remove Icons from PageSection
- Line ~410: `<PageSection title="1. Category Whitespace Scorecard" icon={Target}>` → remove `icon={Target}`
- Line ~475: `<PageSection title="2. Segment Intelligence" icon={Lightbulb}>` → remove `icon={Lightbulb}`
- Line ~500: `<PageSection title="3. Segment Revenue Analysis" icon={TrendingUp}>` → remove `icon={TrendingUp}`
- Line ~580: `<PageSection title="4. Supporting Keyword Evidence" icon={Layers}>` → remove `icon={Layers}`

### 3. Add Evidence State
```typescript
const [selectedEvidence, setSelectedEvidence] = useState<EvidenceData | null>(null);
```

### 4. Make All KPI Cards Clickable

**Overall Whitespace Score Card** (line ~412)
```typescript
onClick={() => {
  const ev: EvidenceData = {
    title: 'Overall Whitespace Score',
    displayed_value: `${Number(r.overall_whitespace_score ?? 0).toFixed(1)} / 100`,
    source_datasets: ['Magnet Keyword Dataset'],
    source_columns: ['Keyword Phrase', 'Search Volume', 'Keyword Sales', 'Title Density'],
    source_row_count: totalKeywords,
    formula: 'Mean opportunity score after percentile ranking across all keywords',
    calculation_steps: [
      'Calculate demand score (search volume percentile)',
      'Calculate revenue score (keyword sales percentile)',
      'Calculate competition score (title density percentile, inverted)',
      'Composite opportunity score = weighted average',
      'Overall whitespace score = mean of all keyword opportunity scores'
    ],
    aggregation_method: 'Mean of percentile-ranked opportunity scores',
    thresholds: {
      high: '≥ 65 (Strong opportunity)',
      medium: '50-64 (Moderate opportunity)',
      low: '< 50 (Limited opportunity)'
    },
    classification_reason: `Category-wide opportunity level: ${(r.overall_whitespace_score ?? 0) >= 65 ? 'Strong' : (r.overall_whitespace_score ?? 0) >= 50 ? 'Moderate' : 'Limited'}`,
    confidence_note: titleDensityReliable ? 'Title density data available' : 'Title density not available - competition score limited',
    data_quality_notes: undefined,
    llm_used: false,
  };
  setSelectedEvidence(ev);
}}
```

**Extreme Opportunities Card** (line ~423)
```typescript
onClick={() => {
  // Get actual extreme opportunity keywords from wsKeywords
  const extremeKeywords = wsKeywords.filter(kw => kw.opportunity_label === 'Extreme Opportunity');
  const topRecords = extremeKeywords.slice(0, 20).map(kw => ({
    keyword: kw.keyword || '—',
    search_volume: kw.search_volume || 0,
    keyword_sales: kw.keyword_sales || 0,
    whitespace_score: kw.whitespace_score || 0,
    opportunity_label: kw.opportunity_label || '—'
  }));
  
  const ev: EvidenceData = {
    title: 'Extreme Opportunities',
    displayed_value: extremeCount.toLocaleString(),
    source_datasets: ['Magnet Keyword Dataset'],
    source_columns: ['Keyword Phrase', 'Search Volume', 'Keyword Sales', 'Title Density'],
    source_row_count: extremeCount,
    formula: 'COUNT(keywords WHERE opportunity_score >= 80th percentile)',
    calculation_steps: [
      'Calculate opportunity score for each keyword (demand + revenue - competition)',
      'Rank all keywords by opportunity score',
      'Filter keywords with score >= 80th percentile',
      'Count resulting keywords'
    ],
    top_records: topRecords.length > 0 ? topRecords : undefined,
    aggregation_method: 'Count of keywords in top 20% by opportunity score',
    thresholds: {
      high: 'Top 20% (80th percentile+)',
      medium: '65-79th percentile',
      low: '< 65th percentile'
    },
    classification_reason: `${extremeCount} keywords classified as Extreme Opportunity (top 20% by composite score)`,
    confidence_note: `Represents ${formatPct(extremeCount, totalKeywords)}% of analyzed keyword universe`,
    data_quality_notes: undefined,
    llm_used: false,
  };
  setSelectedEvidence(ev);
}}
```

**High Opportunities Card** (line ~434)
```typescript
onClick={() => {
  const highKeywords = wsKeywords.filter(kw => kw.opportunity_label === 'High Opportunity');
  const topRecords = highKeywords.slice(0, 20).map(kw => ({
    keyword: kw.keyword || '—',
    search_volume: kw.search_volume || 0,
    keyword_sales: kw.keyword_sales || 0,
    whitespace_score: kw.whitespace_score || 0,
    opportunity_label: kw.opportunity_label || '—'
  }));
  
  const ev: EvidenceData = {
    title: 'High Opportunities',
    displayed_value: highCount.toLocaleString(),
    source_datasets: ['Magnet Keyword Dataset'],
    source_columns: ['Keyword Phrase', 'Search Volume', 'Keyword Sales', 'Title Density'],
    source_row_count: highCount,
    formula: 'COUNT(keywords WHERE opportunity_score in 65-79th percentile)',
    calculation_steps: [
      'Calculate opportunity score for each keyword',
      'Rank all keywords by opportunity score',
      'Filter keywords with score in 65-79th percentile range',
      'Count resulting keywords'
    ],
    top_records: topRecords.length > 0 ? topRecords : undefined,
    aggregation_method: 'Count of keywords in strong opportunity band',
    thresholds: {
      high: '65-79th percentile (High Opportunity)',
      medium: '50-64th percentile (Moderate)',
      low: '< 50th percentile (Low)'
    },
    classification_reason: `${highCount} keywords classified as High Opportunity (65-79th percentile)`,
    confidence_note: `Represents ${formatPct(highCount, totalKeywords)}% of analyzed keyword universe`,
    data_quality_notes: undefined,
    llm_used: false,
  };
  setSelectedEvidence(ev);
}}
```

**Opportunity Revenue Signal Card** (line ~445)
```typescript
onClick={() => {
  const ev: EvidenceData = {
    title: 'Opportunity Revenue Signal',
    displayed_value: revenueSignal > 0 ? formatNumber(Math.round(revenueSignal)) : '—',
    source_datasets: ['Magnet Keyword Dataset'],
    source_columns: ['Keyword Sales', 'Opportunity Score'],
    source_row_count: extremeCount + highCount,
    formula: 'SUM(keyword_sales WHERE opportunity_label IN ("Extreme Opportunity", "High Opportunity")) with tier weighting',
    calculation_steps: [
      'Filter keywords classified as Extreme or High Opportunity',
      'Apply tier weighting (Extreme = 100%, High = partial weight)',
      'Sum weighted keyword sales',
      'Apply conservative capping if signal exceeds realistic bounds'
    ],
    aggregation_method: 'Tier-weighted sum of keyword sales',
    thresholds: undefined,
    classification_reason: `${revenuePctCategory}% of measurable category keyword sales. ${revenueCapped ? 'Conservative estimate (capped for realism)' : 'Addressable revenue from high-tier keywords'}`,
    confidence_note: String(r.revenue_signal_method ?? 'Tier-weighted sales signal, not total capturable category revenue'),
    data_quality_notes: revenueCapped ? ['Signal was capped to prevent unrealistic estimates'] : undefined,
    llm_used: false,
  };
  setSelectedEvidence(ev);
}}
```

**Best Entry Cluster Card** (line ~463)
```typescript
onClick={() => {
  const bestSegment = entrySegments.find(s => s.segment === bestEntryCluster);
  const ev: EvidenceData = {
    title: 'Best Entry Cluster',
    displayed_value: bestEntryCluster ?? '—',
    source_datasets: ['Magnet Keyword Dataset'],
    source_columns: ['Segment', 'Opportunity Revenue', 'Keyword Count'],
    source_row_count: entrySegments.length,
    formula: 'SELECT segment WITH MAX(opportunity_revenue)',
    calculation_steps: [
      'Calculate opportunity revenue for each segment',
      'Rank segments by opportunity revenue descending',
      'Select top segment as best entry cluster'
    ],
    top_records: bestSegment ? [{
      segment: bestSegment.segment,
      opportunity_revenue: bestSegment.opportunity_revenue,
      keyword_count: bestSegment.keyword_count,
      avg_opportunity_score: bestSegment.avg_opportunity_score,
      recommended_priority: bestSegment.recommended_priority || '—'
    }] : undefined,
    aggregation_method: 'MAX(opportunity_revenue) across segments',
    thresholds: undefined,
    classification_reason: bestEntryCluster ? `${bestEntryCluster} has the largest addressable opportunity revenue` : 'No segment analysis available yet',
    confidence_note: bestSegment ? `${bestSegment.keyword_count} keywords, avg score ${bestSegment.avg_opportunity_score.toFixed(1)}` : undefined,
    data_quality_notes: undefined,
    llm_used: false,
  };
  setSelectedEvidence(ev);
}}
```

### 5. Update KpiCard Component to Accept onClick
```typescript
function KpiCard({ title, value, sub, highlight, icon, color, bg, tooltip, onClick }: KpiProps & { onClick?: () => void }) {
  return (
    <Card className={cn('hover-card-anim', onClick && 'cursor-pointer hover:border-primary/50')} onClick={onClick}>
      {/* ... rest stays same ... */}
    </Card>
  );
}
```

### 6. Make Table Rows Clickable

**Segment Opportunity Table** - Add onRowClick to create segment evidence

**Top Entry Segments Table** - Add onRowClick to create segment recommendation evidence

**Supporting Keyword Evidence Table** - Add onRowClick to create keyword evidence

### 7. Add EvidenceModal Before Closing Div
```typescript
<EvidenceModal isOpen={!!selectedEvidence} onClose={() => setSelectedEvidence(null)} evidence={selectedEvidence} />
```

### 8. Remove Evidence/Proof Columns
- Check all table column definitions
- No "Evidence" or "Proof" columns found in current code ✓

### 9. Best Entry Cluster Column
- Not a column, it's a KPI card - keep it and make clickable ✓

## Implementation Notes

This file is large (654 lines). The update should:
1. Be done incrementally to avoid token limits
2. Preserve all existing logic (segment modal, charts, filters)
3. Add evidence without breaking existing functionality
4. Keep the segment keyword modal (it's useful)

## Next Step
Implement these changes in WhitespaceOpportunities.tsx file.
