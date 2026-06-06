import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Target, Rocket, Layers,
  TrendingDown, TrendingUp, Activity, AlertTriangle, ChevronRight
} from 'lucide-react';

import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { KPICard } from '../components/ui/KPICard';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { EvidenceDrawer, type EvidenceData } from '../components/ui/EvidenceDrawer';
import { formatGenericLabel } from '../utils/formatters';
import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';
import { FilterBar } from '../components/filters/FilterBar';
import { scopeQueryKeys } from '../hooks/useCategoryScope';


type RawEvidence = {
  source_dataset: string;
  source_columns: string[];
  formula: string;
  source_values: Record<string, unknown>;
  calculation_steps: string[];
  final_value: unknown;
  interpretation: string;
  rows_included?: number;
  rows_excluded?: number;
  missing_fields?: string[];
};

type MetricWithEvidence = {
  value?: number;
  name?: string;
  score?: number;
  gap?: number;
  lift?: number;
  demand_share?: number;
  search_volume?: number;
  business_implication?: string;
  subtitle?: string;
  confidence?: number;
  confidence_level?: string;
  recommendation?: string;
  opportunity_score?: number;
  why_selected?: string;
  empty_state?: boolean;
  title?: string;
  minimum_gap_threshold?: number;
  themes_checked?: number;
  evidence: RawEvidence;
  top_keywords?: Array<Record<string, unknown>>;
  candidate_ranking?: Array<Record<string, unknown>>;
};

type SegmentRow = {
  segment: string;
  demand_share: number;
  revenue_share: number;
  total_search_volume: number;
  demand_revenue_gap: number;
  revenue_gap_label?: string;
  competition_index: number;
  opportunity_score: number;
  reliable_opportunity_score?: number;
  row_confidence?: number;
  classification_source?: string;
  recommendation: string;
  keyword_count?: number;
  top_keywords?: Array<Record<string, unknown>>;
  evidence: RawEvidence;
};

type Diagnostics = {
  total_raw_rows?: number;
  valid_sv_count?: number;
  missing_sv_count?: number;
  non_numeric_sv_count?: number;
  total_keyword_count?: number;
  total_search_volume?: number;
  classified_keyword_count?: number;
  classified_search_volume?: number;
  classified_demand_pct?: number;
  unclassified_keyword_count?: number;
  unclassified_search_volume?: number;
  unclassified_demand_pct?: number;
  theme_extraction_confidence?: number;
  original_classification_coverage?: number;
  enhanced_classification_coverage?: number;
  enhanced_classification_applied?: boolean;
  enhanced_coverage_note?: string;
  confidence_level?: string;
  show_warning?: boolean;
  warning_message?: string;
  is_degraded?: boolean;
  missing_columns?: string[];
  dataset_session_id?: string;
  pct_sum_valid?: boolean;
  volume_sum_valid?: boolean;
  top_unclassified_groups?: Array<Record<string, unknown>>;
  top_unclassified_keywords_table?: Array<Record<string, unknown>>;
  suggested_theme_repairs?: Array<Record<string, unknown>>;
  possible_duplicate_themes?: Array<Record<string, unknown>>;
  theme_quality?: Record<string, unknown>;
  evidence?: RawEvidence;
};

type ThemeQuality = {
  total_themes_detected?: number;
  specific_themes?: number;
  broad_or_classification_themes?: number;
  eligible_strategic_themes?: number;
  excluded_themes?: number;
  generic_demand_share_pct?: number;
  excluded_theme_details?: Array<Record<string, unknown>>;
};

function formatRec(base: string, confidence?: number): string {
  if (confidence == null) return base;
  if (confidence >= 80) return base;
  if (confidence >= 50) return `${base} — Medium Confidence`;
  return `Directional ${base}`;
}

function rawToEvidence(
  title: string,
  raw: RawEvidence | undefined,
  extra: Partial<EvidenceData> = {},
): EvidenceData | null {
  if (!raw) return null;
  const sv = raw.source_values || {};
  const rows = typeof raw.rows_included === 'number'
    ? raw.rows_included
    : typeof sv.keyword_count === 'number'
      ? Number(sv.keyword_count)
      : 0;

  return {
    title,
    displayed_value: String(raw.final_value ?? '—'),
    source_datasets: [raw.source_dataset || 'Magnet'],
    source_columns: raw.source_columns || [],
    source_row_count: rows,
    formula: raw.formula || null,
    calculation_steps: raw.calculation_steps || [],
    confidence_note: raw.interpretation || undefined,
    missing_fields: raw.missing_fields,
    dataset_session_id: typeof sv.dataset_session_id === 'string' ? sv.dataset_session_id : undefined,
    ...extra,
  };
}

function diagnosticsEvidence(diag: Diagnostics): EvidenceData {
  const ev = diag.evidence;
  const counts: Record<string, string | number> = {
    total_raw_rows: diag.total_raw_rows ?? 0,
    missing_sv_rows: diag.missing_sv_count ?? 0,
    non_numeric_sv_rows: diag.non_numeric_sv_count ?? 0,
    valid_sv_rows: diag.valid_sv_count ?? 0,
    total_keywords: diag.total_keyword_count ?? 0,
    total_search_volume: diag.total_search_volume ?? 0,
    classified_keywords: diag.classified_keyword_count ?? 0,
    classified_search_volume: diag.classified_search_volume ?? 0,
    classified_demand_pct: `${Number(diag.classified_demand_pct ?? 0).toFixed(1)}%`,
    unclassified_keywords: diag.unclassified_keyword_count ?? 0,
    unclassified_search_volume: diag.unclassified_search_volume ?? 0,
    unclassified_demand_pct: `${Number(diag.unclassified_demand_pct ?? 0).toFixed(1)}%`,
    original_coverage: `${Number(diag.original_classification_coverage ?? 0).toFixed(1)}%`,
    enhanced_coverage: `${Number(diag.enhanced_classification_coverage ?? 0).toFixed(1)}%`,
    theme_confidence: `${Number(diag.theme_extraction_confidence ?? 0).toFixed(1)}%`,
  };

  const detail_tables: EvidenceData['detail_tables'] = [];

  if (diag.top_unclassified_groups?.length) {
    detail_tables.push({
      title: 'Top Unclassified Keyword Groups',
      columns: ['suggested_theme', 'total_search_volume', 'keyword_count', 'derived_confidence'],
      rows: diag.top_unclassified_groups.slice(0, 10).map((g) => ({
        suggested_theme: String(g.suggested_theme ?? '—'),
        total_search_volume: Number(g.total_search_volume ?? 0),
        keyword_count: Number(g.keyword_count ?? 0),
        derived_confidence: `${Number(g.derived_confidence ?? 0).toFixed(0)}%`,
      })),
    });
  }

  if (diag.top_unclassified_keywords_table?.length) {
    detail_tables.push({
      title: 'Top Unclassified Keywords',
      columns: ['keyword', 'search_volume', 'reason_unclassified', 'suggested_action'],
      rows: diag.top_unclassified_keywords_table.map((r) => ({
        keyword: String(r.keyword ?? ''),
        search_volume: Number(r.search_volume ?? 0),
        reason_unclassified: String(r.reason_unclassified ?? ''),
        suggested_action: String(r.suggested_action ?? ''),
      })),
      view_all_count: diag.unclassified_keyword_count,
    });
  }

  if (diag.suggested_theme_repairs?.length) {
    detail_tables.push({
      title: 'Suggested Theme Repairs',
      columns: ['suggested_theme', 'matched_search_volume', 'keyword_count', 'derived_confidence'],
      rows: diag.suggested_theme_repairs.map((r) => ({
        suggested_theme: String(r.suggested_theme ?? ''),
        matched_search_volume: Number(r.matched_search_volume ?? 0),
        keyword_count: Number(r.keyword_count ?? 0),
        derived_confidence: `${Number(r.derived_confidence ?? 0).toFixed(0)}%`,
      })),
    });
  }

  const qualityNotes: string[] = [];
  if (diag.pct_sum_valid === false) {
    qualityNotes.push('Classified + unclassified demand % does not sum to 100% — check for invalid search volume rows.');
  }
  if (diag.volume_sum_valid === false) {
    qualityNotes.push('Classified + unclassified search volume does not match total search volume.');
  }

  return {
    title: 'Demand Intelligence Quality',
    displayed_value: `${Number(diag.theme_extraction_confidence ?? 0).toFixed(1)}%`,
    source_datasets: ['Magnet', 'Keyword Classification'],
    source_columns: ev?.source_columns ?? [],
    source_row_count: diag.total_keyword_count ?? 0,
    formula: ev?.formula ?? 'Classified Demand % = Classified SV / Total SV × 100',
    calculation_steps: ev?.calculation_steps ?? [],
    business_summary: diag.warning_message ?? 'Theme classification coverage from active dataset.',
    business_meaning:
      'Low coverage means recommendations are driven by incomplete theme assignment. Review unclassified groups to improve classification.',
    suggested_action: 'Map top unclassified keyword groups to themes in your classification dataset.',
    counts,
    dataset_session_id: diag.dataset_session_id,
    detail_tables,
    data_quality_notes: qualityNotes,
    confidence_note: diag.enhanced_coverage_note,
  };
}

function segmentEvidence(
  row: SegmentRow,
  diag: Diagnostics,
  filterContext?: {
    active_filters: Record<string, any>;
    filtered_row_count: number;
    total_row_count: number;
  }
): EvidenceData {
  const rec = row.evidence;
  const sv = (rec?.source_values || {}) as Record<string, unknown>;
  const gapLabel = row.revenue_gap_label || (row.demand_revenue_gap > 0 ? 'Revenue Gap' : 'Revenue Premium');

  const topKw = (row.top_keywords || []).slice(0, 10).map((k) => ({
    keyword: String(k.keyword ?? ''),
    search_volume: Number(k.search_volume ?? 0),
    contribution_pct: Number(k.contribution_pct ?? 0),
  }));

  return {
    title: `Theme: ${formatGenericLabel(row.segment)}`,
    displayed_value: `Score ${Number(row.opportunity_score).toFixed(1)} (Reliable: ${Number(row.reliable_opportunity_score ?? 0).toFixed(1)})`,
    source_datasets: [rec?.source_dataset || 'Magnet'],
    source_columns: rec?.source_columns || [],
    source_row_count: row.keyword_count ?? 0,
    active_filters: filterContext?.active_filters,
    filtered_row_count: filterContext?.filtered_row_count,
    total_row_count: filterContext?.total_row_count,
    calculation_scope: filterContext ? 'Filtered' : 'Global',
    formula: rec?.formula || 'Opportunity Score = weighted demand, monetization, competition, gap',
    calculation_steps: rec?.calculation_steps ?? [],
    business_summary: `"${formatGenericLabel(row.segment)}" — ${row.recommendation}`,
    business_meaning: `Demand ${Number(row.demand_share).toFixed(1)}% vs revenue ${Number(row.revenue_share).toFixed(1)}%. ${gapLabel}: ${Math.abs(Number(row.demand_revenue_gap)).toFixed(1)} pts.`,
    recommendation: row.recommendation,
    suggested_action:
      row.row_confidence != null && row.row_confidence < 50
        ? 'Treat as directional — improve theme classification or add revenue data.'
        : 'Evaluate product positioning and competition before entry.',
    counts: {
      total_raw_rows: diag.total_raw_rows ?? 0,
      missing_sv_rows: diag.missing_sv_count ?? 0,
      non_numeric_sv_rows: diag.non_numeric_sv_count ?? 0,
      valid_sv_rows: diag.valid_sv_count ?? 0,
      theme_search_volume: row.total_search_volume,
      total_search_volume: diag.total_search_volume ?? 0,
      keyword_count: row.keyword_count ?? 0,
      opportunity_score: Number(row.opportunity_score).toFixed(1),
      reliable_score: Number(row.reliable_opportunity_score ?? 0).toFixed(1),
      confidence: `${Number(row.row_confidence ?? 0).toFixed(0)}%`,
      classification: row.classification_source ?? '—',
    },
    dataset_session_id: typeof sv.dataset_session_id === 'string' ? sv.dataset_session_id : diag.dataset_session_id,
    top_records: topKw.length ? topKw : undefined,
    classification_reason: `Sorted by Reliable Opportunity Score (opportunity × confidence). Source: ${row.classification_source || 'dataset'}.`,
    data_quality_notes:
      row.row_confidence != null && row.row_confidence < 50
        ? ['Low confidence: recommendation is directional because required fields are incomplete.']
        : undefined,
  };
}

export default function DemandStrength() {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const { categoryScope, categoryKey, keywordScopeKey, datasetSessionId } = scopeQueryKeys(statusData);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['demand-strength', datasetSessionId, categoryKey, keywordScopeKey],
    queryFn: () => api.getDemandStrength(50, categoryScope),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [evidence, setEvidence] = useState<EvidenceData | null>(null);

  // Safe data extraction - runs unconditionally, handles undefined gracefully
  const results = data?.data?.results || {};
  const keywordScope = data?.data?.keyword_scope;
  const largestDemand = results.largest_demand_segment as MetricWithEvidence | undefined;
  const recommendedEntry = results.recommended_entry as MetricWithEvidence | undefined;
  const undervalued = results.most_undervalued_theme as MetricWithEvidence | undefined;
  const monetized = results.best_monetized_theme as MetricWithEvidence | undefined;
  const diagnostics = (results.classification_diagnostics || {}) as Diagnostics;
  const sessionId = (results as { dataset_session_id?: string }).dataset_session_id
    || diagnostics.dataset_session_id;

  const db: SegmentRow[] = Array.isArray(results.demand_opportunity_database) 
    ? results.demand_opportunity_database 
    : [];

  const themeQuality = (diagnostics.theme_quality || results.theme_quality || {}) as ThemeQuality;

  const filterConfigs: FilterConfig<SegmentRow>[] = [
    { id: 'theme', label: 'Theme', type: 'search', getValue: r => r.segment },
    { id: 'recommendation', label: 'Recommendation', type: 'select', getValue: r => r.recommendation },
    { id: 'confidence', label: 'Confidence', type: 'select', getValue: r => {
      const c = r.row_confidence ?? 0;
      if (c >= 80) return 'High';
      if (c >= 50) return 'Medium';
      return 'Low';
    }},
    { id: 'source', label: 'Source Type', type: 'select', getValue: r => r.classification_source || 'Unknown' },
  ];

  const {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<SegmentRow>(db, filterConfigs);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data || !isEngineOk(data)) {
    const timeoutMsg =
      error instanceof Error && error.message.includes('timeout')
        ? 'The analysis took too long. Try uploading a smaller keyword file.'
        : getEngineErrorMessage(data, 'Upload Magnet (keywords) and/or BlackBox (products) to proceed.');
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Demand Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-md">{timeoutMsg}</p>
        </CardContent>
      </Card>
    );
  }

  

  const showQualityPanel =
    diagnostics.show_warning ||
    diagnostics.confidence_level === 'Medium' ||
    diagnostics.confidence_level === 'Low';

  const columns: ColumnDef<SegmentRow>[] = [
    {
      header: 'Theme',
      cell: (r) => (
        <span className="font-semibold text-foreground/90">
          {formatGenericLabel(r.segment)}
          {r.row_confidence != null && r.row_confidence < 50 && (
            <AlertTriangle className="inline w-3 h-3 ml-1 text-warning" />
          )}
        </span>
      ),
    },
    {
      header: 'Demand %',
      cell: (r) => <Badge variant="outline">{Number(r.demand_share).toFixed(1)}%</Badge>,
    },
    {
      header: 'Revenue %',
      cell: (r) => <span className="font-medium">{Number(r.revenue_share).toFixed(1)}%</span>,
    },
    {
      header: 'Competition',
      cell: (r) => (r.segment === 'Other' ? '—' : Number(r.competition_index).toFixed(1)),
    },
    {
      header: 'Score',
      cell: (r) =>
        r.segment === 'Other' ? '—' : (
          <span className="font-bold text-primary">{Number(r.opportunity_score).toFixed(1)}</span>
        ),
    },
    {
      header: 'Confidence',
      cell: (r) =>
        r.segment === 'Other' ? '—' : (
          <span className="text-xs font-mono">{Number(r.row_confidence ?? 0).toFixed(0)}%</span>
        ),
    },
    {
      header: 'Recommendation',
      cell: (r) => {
        const rec = r.recommendation || 'N/A';
        const color =
          rec.includes('Needs Refinement') ? 'text-warning'
          : rec.includes('Prime') ? 'text-success'
          : rec.includes('Strong') ? 'text-success/80'
          : rec.includes('Low') || rec.includes('Directional') ? 'text-muted-foreground'
          : 'text-warning';
        return <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{rec}</span>;
      },
    },
  ];

  const undervaluedValue = undervalued?.empty_state
    ? (undervalued.title || 'No undervalued theme detected')
    : (undervalued?.name || 'Insufficient data');
  const undervaluedImplication = undervalued?.empty_state
    ? (undervalued.subtitle || undervalued.business_implication)
    : (undervalued?.subtitle || undervalued?.business_implication);

  const entryRec = recommendedEntry?.recommendation
    || formatRec('Prime Entry', recommendedEntry?.confidence);

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">

      <EvidenceDrawer
        isOpen={!!evidence}
        onClose={() => setEvidence(null)}
        evidence={evidence}
      />

      <PageHeader
        badge="Demand Intelligence"
        title="Market Demand Strength"
        description="All metrics are calculated from your active uploaded datasets only."
      />

      {sessionId && (
        <p className="text-[10px] font-mono text-muted-foreground mb-4 -mt-6">
          Active session: {sessionId}
        </p>
      )}

      {/* Data quality panel */}
      {showQualityPanel && (
        <Card
          className={`border-l-4 shadow-sm mb-8 cursor-pointer hover:border-primary/40 transition-colors ${
            diagnostics.show_warning ? 'border-warning bg-warning/5' : 'border-primary/30 bg-muted/20'
          }`}
          onClick={() => setEvidence(diagnosticsEvidence(diagnostics))}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <AlertTriangle className={`w-7 h-7 shrink-0 mt-0.5 ${diagnostics.show_warning ? 'text-warning' : 'text-primary'}`} />
                <div className="space-y-3 flex-1">
                  <h3 className="text-lg font-bold tracking-tight">
                    {diagnostics.show_warning ? 'Demand Intelligence Quality Warning' : 'Theme Classification Notice'}
                  </h3>
                  <p className="text-sm font-medium text-foreground/80">
                    {diagnostics.warning_message}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-2 rounded border border-border/40 bg-card">
                      <p className="text-muted-foreground">Keywords</p>
                      <p className="font-bold">{diagnostics.total_keyword_count?.toLocaleString() ?? '—'}</p>
                    </div>
                    <div className="p-2 rounded border border-border/40 bg-card">
                      <p className="text-muted-foreground">Search Volume</p>
                      <p className="font-bold">{diagnostics.total_search_volume?.toLocaleString() ?? '—'}</p>
                    </div>
                    <div className="p-2 rounded border border-border/40 bg-card">
                      <p className="text-muted-foreground">Classified</p>
                      <p className="font-bold text-success">{Number(diagnostics.classified_demand_pct ?? 0).toFixed(1)}%</p>
                    </div>
                    <div className="p-2 rounded border border-border/40 bg-card">
                      <p className="text-muted-foreground">Unclassified</p>
                      <p className="font-bold text-warning">{Number(diagnostics.unclassified_demand_pct ?? 0).toFixed(1)}%</p>
                    </div>
                  </div>
                  {diagnostics.enhanced_classification_applied && (
                    <p className="text-xs text-muted-foreground">{diagnostics.enhanced_coverage_note}</p>
                  )}
                  {diagnostics.confidence_level === 'Low' && (
                    <p className="text-xs font-semibold text-warning">
                      Low confidence: recommendations are directional because theme coverage is incomplete.
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top unclassified groups (inline) */}
      {diagnostics.top_unclassified_groups && diagnostics.top_unclassified_groups.length > 0 && (
        <PageSection title="Top Unclassified Keyword Groups">
          <DataTable
            data={diagnostics.top_unclassified_groups.slice(0, 10) as Array<Record<string, unknown>>}
            columns={[
              { header: 'Suggested Theme', cell: (r) => String(r.suggested_theme ?? '—') },
              { header: 'Search Volume', cell: (r) => Number(r.total_search_volume ?? 0).toLocaleString() },
              { header: 'Keywords', cell: (r) => Number(r.keyword_count ?? 0) },
              { header: 'Confidence', cell: (r) => `${Number(r.derived_confidence ?? 0).toFixed(0)}%` },
            ]}
            keyExtractor={(r, i) => String(r.suggested_theme ?? i)}
          />
        </PageSection>
      )}

      {(themeQuality.eligible_strategic_themes != null || themeQuality.generic_demand_share_pct != null) && (
        <PageSection title="Theme Quality Summary">
          <Card className="border-border/50 bg-card">
            <CardContent className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Themes detected</p>
                <p className="font-bold">{themeQuality.total_themes_detected ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Specific themes</p>
                <p className="font-bold text-success">{themeQuality.specific_themes ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Broad / classification</p>
                <p className="font-bold text-warning">{themeQuality.broad_or_classification_themes ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Eligible for KPIs</p>
                <p className="font-bold">{themeQuality.eligible_strategic_themes ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Excluded</p>
                <p className="font-bold">{themeQuality.excluded_themes ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Generic demand share</p>
                <p className="font-bold">{Number(themeQuality.generic_demand_share_pct ?? 0).toFixed(1)}%</p>
              </div>
            </CardContent>
          </Card>
        </PageSection>
      )}

      <PageSection title="Strategic Demand Metrics">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          <KPICard
            label={largestDemand?.empty_state ? 'Largest Classified Segment' : 'Largest Segment'}
            value={largestDemand?.empty_state ? (largestDemand.title || 'No specific theme detected') : (largestDemand?.name || 'Insufficient data')}
            implication={largestDemand?.subtitle || largestDemand?.business_implication || 'Upload keyword data'}
            confidence={largestDemand?.confidence}
            icon={Target}
            scope="Global"
            onClick={() => setEvidence(rawToEvidence('Largest Demand Segment', largestDemand?.evidence, {
              displayed_value: largestDemand?.name || '—',
              business_summary: largestDemand?.business_implication,
              business_meaning: 'Largest share of search volume among classified themes in the active dataset.',
              counts: {
                demand_share: `${Number(largestDemand?.demand_share ?? 0).toFixed(1)}%`,
                search_volume: largestDemand?.search_volume ?? 0,
              },
              top_records: (largestDemand?.top_keywords || []).slice(0, 10).map((k) => ({
                keyword: String(k.keyword ?? ''),
                search_volume: Number(k.search_volume ?? 0),
              })),
              dataset_session_id: sessionId,
              missing_fields: largestDemand?.evidence?.missing_fields,
            }))}
          />

          <KPICard
            label="Highest Efficiency"
            value={monetized?.name || (results.total_keyword_sales ? 'Insufficient data' : 'No revenue data')}
            implication={monetized?.subtitle || monetized?.business_implication || 'Requires Keyword Sales column'}
            confidence={monetized?.confidence}
            icon={TrendingUp}
            scope="Global"
            onClick={() => monetized && setEvidence(rawToEvidence('Highest Efficiency', monetized.evidence, {
              displayed_value: monetized.name || '—',
              business_summary: monetized.business_implication,
              business_meaning: 'Revenue share divided by demand share — values above 1× indicate strong monetization.',
              counts: { efficiency_lift: `${Number(monetized.lift ?? 0).toFixed(2)}×` },
              top_records: (monetized.top_keywords || []).slice(0, 10).map((k) => ({
                keyword: String(k.keyword ?? ''),
                search_volume: Number(k.search_volume ?? 0),
              })),
              dataset_session_id: sessionId,
            }))}
          />

          <KPICard
            label="Undervalued Theme"
            value={undervaluedValue}
            implication={undervaluedImplication || ''}
            confidence={undervalued?.confidence}
            icon={TrendingDown}
            scope="Global"
            onClick={() => setEvidence(rawToEvidence('Undervalued Theme', undervalued?.evidence, {
              displayed_value: undervalued?.empty_state ? 'None detected' : (undervalued?.name || '—'),
              business_summary: undervalued?.business_implication,
              business_meaning: undervalued?.empty_state
                ? `No theme exceeds ${undervalued?.minimum_gap_threshold ?? 2} pt demand-over-revenue gap.`
                : 'Demand share exceeds revenue share — under-monetized search intent.',
              counts: {
                themes_checked: undervalued?.themes_checked ?? 0,
                gap_threshold: `${undervalued?.minimum_gap_threshold ?? 2} pts`,
                gap: undervalued?.gap != null ? `${undervalued.gap}%` : '—',
              },
              dataset_session_id: sessionId,
            }))}
          />

          <KPICard
            label="Best Entry"
            value={recommendedEntry?.empty_state ? (recommendedEntry.title || 'No specific entry theme') : (recommendedEntry?.name || 'Insufficient data')}
            implication={recommendedEntry?.subtitle || recommendedEntry?.business_implication || ''}
            confidence={recommendedEntry?.confidence}
            icon={Rocket}
            scope="Global"
            onClick={() => recommendedEntry && setEvidence(rawToEvidence('Best Entry Opportunity', recommendedEntry.evidence, {
              displayed_value: recommendedEntry.name || '—',
              business_summary: recommendedEntry.business_implication,
              business_meaning: recommendedEntry.why_selected || 'Balanced score weights opportunity, competition, and confidence.',
              recommendation: entryRec,
              counts: {
                best_entry_score: Number(recommendedEntry.score ?? 0).toFixed(1),
                opportunity_score: Number(recommendedEntry.opportunity_score ?? recommendedEntry.score ?? 0).toFixed(1),
              },
              detail_tables: recommendedEntry.candidate_ranking?.length ? [{
                title: 'Top Candidates by Best Entry Score',
                columns: ['segment', 'best_entry_score', 'opportunity_score', 'competition_index'],
                rows: recommendedEntry.candidate_ranking.map((c) => ({
                  segment: String(c.segment ?? ''),
                  best_entry_score: Number(c.best_entry_score ?? 0).toFixed(1),
                  opportunity_score: Number(c.opportunity_score ?? 0).toFixed(1),
                  competition_index: Number(c.competition_index ?? 0).toFixed(1),
                })),
              }] : undefined,
              data_quality_notes:
                recommendedEntry.confidence != null && recommendedEntry.confidence < 50
                  ? ['Low confidence: recommendation is directional because theme coverage or required fields are incomplete.']
                  : undefined,
              dataset_session_id: sessionId,
            }))}
          />
        </div>
      </PageSection>

      <PageSection title="Opportunity Database">
        <FilterBar 
          configs={filterConfigs}
          activeFilters={activeFilters}
          setFilter={setFilter}
          clearFilter={clearFilter}
          clearAll={clearAll}
          filterOptions={filterOptions}
          totalRecords={db.length}
          filteredRecords={filteredData.length}
        />
        {db.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              No validated theme opportunities available. Upload complete Keyword and Classification datasets.
            </CardContent>
          </Card>
        ) : (
          <DataTable
            data={filteredData}
            columns={columns}
            keyExtractor={(r) => r.segment}
            onRowClick={(row) => setEvidence(segmentEvidence(row, diagnostics, {
              active_filters: activeFilters,
              filtered_row_count: filteredData.length,
              total_row_count: db.length
            }))}
          />
        )}
        {diagnostics.confidence_level === 'Low' && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger/20 rounded text-danger font-medium text-sm text-center">
            Low theme coverage — sort uses Reliable Opportunity Score (opportunity × confidence).
          </div>
        )}
      </PageSection>
    </div>
  );
}
