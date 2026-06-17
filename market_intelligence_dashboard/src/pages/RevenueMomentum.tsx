import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { EvidenceDrawer, type EvidenceData } from '../components/ui/EvidenceDrawer';
import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';
import { FilterBar } from '../components/filters/FilterBar';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { formatCurrency } from '../utils/cn';
import { AlertCircle, Download, Info } from 'lucide-react';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { KPICard } from '../components/ui/KPICard';
import { DashboardSkeleton } from '../components/ui/Skeletons';

type BackendEvidence = {
  metric_name: string;
  formula: string;
  source_dataset: string;
  source_columns: string[];
  source_rows: Array<{ row_index: number; values: Record<string, any> }>;
  calculation_steps: string[];
  intermediate_values: Record<string, any>;
  final_value: any;
  classification_rule?: string;
};

type LedgerRow = {
  row_number?: number;
  brand: string;
  momentum_score: number;
  primary_engine?: string;
  classification: string;
  parent_revenue: number;
  revenue_share: number;
  market_power_score?: number;
  revenue_percentile?: number;
  sales_percentile?: number;
  parent_sales?: number;
  product_count?: number;
  units_sold?: number;
  revenue_tier?: string;
  classification_reason?: string;
  sales_trend_score?: number;
  revenue_trend_score?: number;
  sales_velocity_score?: number;
  bsr_momentum_score?: number;
  revenue_efficiency_score?: number;
  evidence?: BackendEvidence;
};

type InsightItem = {
  title: string;
  observation: string;
  why_it_matters: string;
  potential_opportunity: string;
  evidence: Record<string, string>;
};

type AiInsight = {
  insights: InsightItem[];
};

type SegmentBlock = {
  count: number;
  preview_brands?: string[];
  items: LedgerRow[];
  ai_insight?: AiInsight | string;
  evidence?: BackendEvidence;
};

type RevenueMomentumPayload = {
  total_market_revenue?: number;
  concentration?: {
    top_5_share?: number;
    top_10_share?: number;
    remaining_share?: number;
    hhi?: number;
    evidence?: BackendEvidence;
  };
  metrics: {
    market_leaders: SegmentBlock;
    emerging_brands: SegmentBlock;
    premium_brands: SegmentBlock;
    niche_players: SegmentBlock;
  };
  momentum_ledger: LedgerRow[];
  classification_rules?: {
    rule_text?: string;
    thresholds?: {
      momentum_cutoff?: number;
      momentum_high_threshold?: number;
      momentum_low_threshold?: number;
      momentum_median?: number;
      percentile_50?: number;
    };
  };
  classification_summary?: {
    revenue_tiers?: Record<string, string>;
    momentum_cutoff?: number;
    momentum_high_threshold?: number;
    momentum_low_threshold?: number;
    momentum_median?: number;
    group_definitions?: Record<string, string>;
  };
};

const GROUP_META: Record<string, { title: string; ruleLabel: string; cardClass: string }> = {
  market_leaders: {
    title: 'Dominant Leaders',
    ruleLabel: 'HIGH REVENUE  •  HIGH SALES',
    cardClass: 'border-success/30 bg-success/5 text-success',
  },
  emerging_brands: {
    title: 'Growth Challengers',
    ruleLabel: 'LOW REVENUE  •  HIGH SALES',
    cardClass: 'border-primary/30 bg-primary/5 text-primary',
  },
  premium_brands: {
    title: 'Revenue Heavyweights',
    ruleLabel: 'HIGH REVENUE  •  LOW SALES',
    cardClass: 'border-warning/30 bg-warning/5 text-warning',
  },
  niche_players: {
    title: 'Long Tail Players',
    ruleLabel: 'LOW REVENUE  •  LOW SALES',
    cardClass: 'border-border bg-muted/30 text-muted-foreground',
  },
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-success/80';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
}

// Convert backend evidence to comprehensive EvidenceData with count verification
function toEvidenceData(be: BackendEvidence | null | undefined, displayValue: any, brandList?: LedgerRow[]): EvidenceData | null {
  if (!be) return null;
  
  const topRecords = brandList 
    ? brandList.slice(0, 15).map((br, idx) => ({
        rank: idx + 1,
        brand: br.brand,
        revenue: br.parent_revenue || 0,
        revenue_share: `${(br.revenue_share || 0).toFixed(2)}%`,
        units: br.units_sold ?? null,
        products: br.product_count || 0,
        momentum_score: br.momentum_score?.toFixed(1) || 'N/A',
        tier: br.revenue_tier || 'C',
        classification: br.classification,
      }))
    : (be.source_rows || []).slice(0, 10).map(sr => {
        const rec: Record<string, string | number> = { row_index: sr.row_index };
        Object.entries(sr.values || {}).forEach(([k, v]) => {
          if (v != null) rec[k] = v;
        });
        return rec;
      });

  const brandCount = brandList?.length || 0;
  const totalRevenue = brandList?.reduce((sum, b) => sum + (b.parent_revenue || 0), 0) || 0;
  const totalUnits = brandList?.reduce((sum, b) => sum + (b.units_sold ?? 0), 0) ?? null;
  const totalShare = brandList?.reduce((sum, b) => sum + (b.revenue_share || 0), 0) || 0;
  
  const unitsAvailable = brandList?.some(b => b.units_sold != null) ?? false;
  const unitsDisplay = unitsAvailable && totalUnits != null 
    ? totalUnits.toLocaleString() 
    : 'Unavailable';


  return {
    title: be.metric_name || 'Metric Evidence',
    displayed_value: displayValue,
    source_datasets: [be.source_dataset || 'BlackBox Products Dataset'],
    source_columns: be.source_columns || ['Brand', 'Parent Level Revenue', 'Parent Level Units Sold'],
    source_row_count: brandCount > 0 ? brandCount : (be.source_rows?.length || 0),
    formula: be.formula || null,
    calculation_steps: brandCount > 0 
      ? [
          `1. Group products by Brand`,
          `2. Sum Parent Level Revenue and Units Sold per brand`,
          `3. Calculate market share = brand revenue / total market revenue × 100`,
          `4. Classify brands using revenue tier and momentum score`,
          `5. Total brands in this group: ${brandCount.toLocaleString()}`,
          `6. Combined revenue: $${totalRevenue.toLocaleString()}`,
          `7. Combined units: ${unitsDisplay}`,
          `8. Combined market share: ${totalShare.toFixed(2)}%`,
          ...(be.calculation_steps || [])
        ]
      : (be.calculation_steps || []),
    top_records: topRecords.length > 0 ? topRecords : undefined,
    aggregation_method: brandCount > 0 
      ? `Brands grouped and classified by revenue tier and momentum score. ${brandCount} brands match the classification criteria.`
      : 'Aggregation based on dataset grouping and classification logic',
    thresholds: brandCount > 0 ? {
      high: `Total brands: ${brandCount}`,
      medium: `Combined revenue: $${totalRevenue.toLocaleString()}`,
      low: `Combined share: ${totalShare.toFixed(2)}%`,
    } : undefined,
    classification_reason: be.classification_rule || undefined,
    confidence_note: brandCount > 0 
      ? `${brandCount} brand(s) classified using revenue tier and momentum thresholds from active dataset. Top ${Math.min(15, brandCount)} brands shown.`
      : `Based on ${be.source_rows?.length || 0} records from active dataset.`,
    data_quality_notes: undefined,
    llm_used: false,
  };
}

// Convert ledger row evidence to comprehensive EvidenceData with momentum breakdown
function ledgerRowEvidence(
  row: LedgerRow,
  momentumHigh: number,
  momentumLow: number,
  totalRevenue: number,
  filterContext?: Record<string, unknown>,
): EvidenceData | null {
  const be = row.evidence;
  
  // Build comprehensive calculation steps
  const components: Record<string, number> = {
    'Sales Trend': row.sales_trend_score || 0,
    'Revenue Trend': row.revenue_trend_score || 0,
    'Sales Velocity': row.sales_velocity_score || 0,
    'BSR Momentum': row.bsr_momentum_score || 0,
    'Revenue Efficiency': row.revenue_efficiency_score || 0,
  };
  
  const availableComponents = Object.entries(components).filter(([_, v]) => v > 0);
  const componentCount = availableComponents.length;

  const calcSteps = [
    `1. Brand: ${row.brand}`,
    `2. Parent Level Revenue: $${(row.parent_revenue || 0).toLocaleString()}`,
    `3. Market Share: ${row.parent_revenue || 0} / ${totalRevenue} × 100 = ${(row.revenue_share || 0).toFixed(2)}%`,
    `4. Revenue Tier: ${row.revenue_tier || 'C'} (based on cumulative revenue share)`,
    `5. Momentum Score Components:`,
    ...availableComponents.map(([name, score]) => `   - ${name}: ${score.toFixed(1)}`),
    `6. Weighted Momentum Score: ${row.momentum_score.toFixed(1)}`,
    `7. Momentum Classification: ${row.momentum_score >= momentumHigh ? 'High' : row.momentum_score >= momentumLow ? 'Medium' : 'Low'}`,
    `8. Final Classification: ${row.classification}`,
    `9. Primary Growth Driver: ${row.primary_engine || 'N/A'}`,
  ];

  const topRecords = [{
    brand: row.brand,
    revenue: row.parent_revenue || 0,
    units: row.units_sold ?? null,
    products: row.product_count || 0,
    market_share: `${(row.revenue_share || 0).toFixed(2)}%`,
    momentum_score: row.momentum_score.toFixed(1),
    power_score: row.market_power_score?.toFixed(1) || 'N/A',
    tier: row.revenue_tier || 'C',
    classification: row.classification,
    growth_driver: row.primary_engine || 'N/A',
    ...components,
  }];

  return {
    title: `${row.brand} — Revenue Momentum Analysis`,
    displayed_value: row.momentum_score.toFixed(1),
    source_datasets: ['BlackBox Products Dataset'],
    source_columns: be?.source_columns || ['Brand', 'Parent Level Revenue', 'Parent Level Sales', 'Parent Level Units Sold', 'BSR'],
    source_row_count: row.product_count || 1,
    formula: `Momentum Score = weighted average of ${componentCount} available growth signals (Sales Trend, Revenue Trend, Sales Velocity, BSR Momentum, Revenue Efficiency). Weights normalized across available components.`,
    calculation_steps: calcSteps,
    top_records: topRecords,
    aggregation_method: `Brand-level aggregation: ${row.product_count || 0} product(s) grouped under "${row.brand}". Momentum calculated from weighted growth signals.`,
    thresholds: {
      high: `High Momentum: score ≥ ${momentumHigh.toFixed(1)} (75th percentile)`,
      medium: `Medium Momentum: ${momentumLow.toFixed(1)} ≤ score < ${momentumHigh.toFixed(1)}`,
      low: `Low Momentum: score < ${momentumLow.toFixed(1)} (25th percentile)`,
    },
    classification_reason: row.classification_reason || `"${row.brand}" classified as "${row.classification}" based on Revenue Tier "${row.revenue_tier || 'C'}" and Momentum Score ${row.momentum_score.toFixed(1)} (${row.momentum_score >= momentumHigh ? 'High' : row.momentum_score >= momentumLow ? 'Medium' : 'Low'} momentum).`,
    confidence_note: `Momentum score calculated from ${componentCount} available signal components out of 5 total signals. Confidence: ${componentCount >= 4 ? 'High' : componentCount >= 3 ? 'Medium' : 'Low'}. Missing components are excluded and weights are normalized.`,
    data_quality_notes: componentCount < 5 ? [`${5 - componentCount} momentum component(s) missing or zero — weights normalized across available components`] : undefined,
    llm_used: false,
  };
}

function ScoreBar({ score, onClick }: { score: number; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 w-32 text-left hover:opacity-80 transition-opacity">
      <span className={`font-mono text-xs font-bold w-8 text-right ${scoreColor(score)}`}>{score.toFixed(0)}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 60 ? 'bg-success' : score >= 40 ? 'bg-warning' : 'bg-danger'}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </button>
  );
}

function exportToCSV(filename: string, rows: LedgerRow[]) {
  const headers = ['Brand Name', 'Revenue', 'Units Sold', 'Market Share %', 'Classification'];
  const csvContent = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.brand}"`,
      r.parent_revenue || 0,
      r.units_sold || 0,
      r.revenue_share || 0,
      `"${r.classification}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function KPIDrillDownModal({
  isOpen, onClose, title, explanation, items
}: { isOpen: boolean; onClose: () => void; title: string; explanation: string; items: LedgerRow[] }) {
  const brandCount = items.length;
  const totalRev = items.reduce((s, r) => s + (r.parent_revenue || 0), 0);
  const totalUnits = items.reduce((s, r) => s + (r.units_sold || 0), 0);
  const totalShare = items.reduce((s, r) => s + (r.revenue_share || 0), 0);

  const columns: Column<LedgerRow>[] = [
    { header: 'Brand Name', accessorKey: 'brand', cell: (r) => <span className="font-bold">{r.brand}</span> },
    { header: 'Revenue', accessorKey: 'parent_revenue', cell: (r) => formatCurrency(r.parent_revenue || 0) },
    { header: 'Units Sold', accessorKey: 'units_sold', cell: (r) => (r.units_sold || 0).toLocaleString() },
    { header: 'Market Share %', accessorKey: 'revenue_share', cell: (r) => <span className="font-mono">{Number(r.revenue_share || 0).toFixed(1)}%</span> },
    { header: 'Classification', accessorKey: 'classification', cell: (r) => <Badge variant="outline">{r.classification}</Badge> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-4xl">
      <div className="space-y-6">
        <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 text-sm">
          <p className="text-foreground leading-relaxed">
            <span className="font-bold block mb-1 uppercase tracking-widest text-[10px] text-primary">Classification Criteria</span>
            {explanation}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Brands Count</p>
            <p className="text-xl font-mono font-bold text-foreground">{brandCount.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Combined Revenue</p>
            <p className="text-xl font-mono font-bold text-success">{formatCurrency(totalRev)}</p>
          </div>
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Combined Units Sold</p>
            <p className="text-xl font-mono font-bold text-primary">{totalUnits.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border/50 p-4 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Combined Market Share</p>
            <p className="text-xl font-mono font-bold text-foreground">{totalShare.toFixed(1)}%</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => exportToCSV(`${title.replace(/ /g, '_')}_Brands.csv`, items)}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="border border-border/50 rounded-lg bg-card">
          <DataTable 
            columns={columns} 
            data={items} 
            pageSize={8} 
            searchable={true} 
            rowKey={(r) => r.brand}
          />
        </div>
      </div>
    </Modal>
  );
}

export default function RevenueMomentum() {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const categoryKey = statusData?.data?.category_scope?.selected_categories?.join('|') || 'all';
  const categoryScope = statusData?.data?.category_scope || {};

  const [selectedGroupKey, setSelectedGroupKey] = useState<keyof RevenueMomentumPayload['metrics'] | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceData | null>(null);
  const [drillDownConfig, setDrillDownConfig] = useState<{ title: string; explanation: string; items: LedgerRow[] } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['revenue-momentum', categoryKey],
    queryFn: () => api.getRevenueMomentum({ topN: 500, scope: categoryScope }),
  });

  const rm: RevenueMomentumPayload = data?.data?.results?.revenue_momentum || {
    total_market_revenue: 0,
    concentration: { top_5_share: 0, top_10_share: 0, remaining_share: 0, hhi: 0 },
    metrics: {
      market_leaders: { count: 0, items: [] },
      emerging_brands: { count: 0, items: [] },
      premium_brands: { count: 0, items: [] },
      niche_players: { count: 0, items: [] },
    },
    momentum_ledger: [],    };

  const filterConfigs: FilterConfig<LedgerRow>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'tier', label: 'Revenue Tier', type: 'select', getValue: r => r.revenue_tier || 'C' },
    { id: 'classification', label: 'Classification', type: 'select', getValue: r => r.classification },
    { id: 'driver', label: 'Growth Driver', type: 'select', getValue: r => r.primary_engine || 'N/A' },
  ];

  const {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<LedgerRow>(rm.momentum_ledger || [], filterConfigs);

  const groupCards = useMemo(
    () =>
      (Object.keys(rm.metrics) as Array<keyof RevenueMomentumPayload['metrics']>).map((k) => ({
        key: k,
        meta: GROUP_META[k],
        block: rm.metrics[k],
      })),
    [rm.metrics]
  );

  const momentumHigh =
    rm.classification_summary?.momentum_high_threshold
    ?? rm.classification_rules?.thresholds?.momentum_high_threshold
    ?? rm.classification_rules?.thresholds?.momentum_cutoff
    ?? rm.classification_summary?.momentum_cutoff
    ?? 75;
  const momentumLow =
    rm.classification_summary?.momentum_low_threshold
    ?? rm.classification_rules?.thresholds?.momentum_low_threshold
    ?? 25;
  const momentumMedian =
    rm.classification_summary?.momentum_median
    ?? rm.classification_rules?.thresholds?.momentum_median
    ?? rm.classification_rules?.thresholds?.percentile_50
    ?? 50;
  const tierDefinitions = rm.classification_summary?.revenue_tiers || {
    A: 'Top 60% cumulative revenue',
    B: 'Next 25% (60-85%)',
    C: 'Remaining long tail (>85%)',
  };



  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Revenue Momentum Unavailable</h2>
          <p className="text-danger/80">{getEngineErrorMessage(data, 'Requires BlackBox with Parent Level Revenue and Brand columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const selectedGroup = selectedGroupKey ? rm.metrics[selectedGroupKey] : null;
  const selectedGroupMeta = selectedGroupKey ? GROUP_META[selectedGroupKey] : null;

  const drillColumns: Column<LedgerRow>[] = [
    { header: 'Brand', accessorKey: 'brand', cell: (r) => <span className="font-semibold">{r.brand}</span> },
    { header: 'Parent Level Revenue', accessorKey: 'parent_revenue', cell: (r) => `$${Number(r.parent_revenue || 0).toLocaleString()}` },
    { header: 'Market Share %', accessorKey: 'revenue_share', cell: (r) => `${Number(r.revenue_share || 0).toFixed(2)}%` },
    { header: 'Market Power', accessorKey: 'market_power_score', cell: (r) => <span className="font-mono text-muted-foreground">{Number(r.market_power_score || 0).toFixed(2)}</span> },
    { header: 'Revenue Tier', accessorKey: 'revenue_tier', cell: (r) => <Badge variant="outline">{r.revenue_tier || 'C'}</Badge> },
    { header: 'Momentum Score', accessorKey: 'momentum_score', cell: (r) => <ScoreBar score={Number(r.momentum_score || 0)} onClick={(e) => { e.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumHigh, momentumLow, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 })); }} /> },
    { header: 'Growth Driver', accessorKey: 'primary_engine', cell: (r) => <Badge variant="outline">{r.primary_engine || 'N/A'}</Badge> },
    { header: 'Classification', accessorKey: 'classification', cell: (r) => <Badge variant="outline">{r.classification}</Badge> },
  ];

  const ledgerColumns: Column<LedgerRow>[] = [
    { header: '#', accessorKey: 'row_number', cell: (r) => <span className="font-mono text-muted-foreground">{r.row_number ?? '-'}</span> },
    { header: 'Ticker / Brand', accessorKey: 'brand', cell: (r) => <span className="font-bold text-foreground uppercase tracking-wide">{r.brand}</span> },
    { header: 'Market Share %', accessorKey: 'revenue_share', cell: (r) => <span className="font-mono">{Number(r.revenue_share || 0).toFixed(2)}%</span> },
    { header: 'Momentum', accessorKey: 'momentum_score', cell: (r) => <ScoreBar score={Number(r.momentum_score || 0)} onClick={(e) => { e?.stopPropagation(); setSelectedEvidence(ledgerRowEvidence(r, momentumHigh, momentumLow, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 })); }} /> },
    { header: 'Power / Tier', accessorKey: 'market_power_score', cell: (r) => <span className="font-mono">{Number(r.market_power_score || 0).toFixed(0)} / {r.revenue_tier || 'C'}</span> },
    { header: 'Growth Driver', accessorKey: 'primary_engine', cell: (r) => <Badge variant="outline">{r.primary_engine || 'N/A'}</Badge> },
    { header: 'Classification', accessorKey: 'classification', cell: (r) => <Badge variant="outline">{r.classification}</Badge> },
  ];

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      
      <PageHeader 
        badge="Live Momentum Feed"
        title="Revenue Momentum"
        description="Track growth velocity, emerging threats, and shifting market dominance."
      />

      <PageSection title="1. Category Momentum Posture">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          <KPICard 
            label="Total Brands Tracked"
            value={rm.momentum_ledger.length}
            onClick={() => {
              const allBrands = rm.momentum_ledger;
              const ev = toEvidenceData(
                {
                  metric_name: 'Total Brands Tracked',
                  formula: 'COUNT(DISTINCT non-empty Brand values) from BlackBox dataset grouped and aggregated',
                  source_dataset: 'BlackBox Products Dataset',
                  source_columns: ['Brand', 'Parent Level Revenue', 'Parent Level Units Sold'],
                  source_rows: [],
                  calculation_steps: [
                    'Group all products by Brand',
                    'Count unique brands with valid revenue data',
                    'Aggregate revenue, units, and product count per brand',
                  ],
                  intermediate_values: {},
                  final_value: rm.momentum_ledger.length,
                },
                rm.momentum_ledger.length,
                allBrands
              );
              if (ev) setSelectedEvidence(ev);
            }}
          />
          <KPICard 
            label="Dominant Leaders"
            value={rm.metrics.market_leaders.count}
            implication="High Revenue, High Momentum"
            onClick={() => {
              const brands = rm.metrics.market_leaders.items;
              const ev = toEvidenceData(
                rm.metrics.market_leaders.evidence || {
                  metric_name: 'Dominant Leaders',
                  formula: 'Brands where Revenue Tier = A AND Momentum Score >= High Threshold',
                  source_dataset: 'BlackBox Products Dataset',
                  source_columns: ['Brand', 'Parent Level Revenue', 'Momentum Score'],
                  source_rows: [],
                  calculation_steps: [
                    `Filter brands with Revenue Tier = A (top 60% cumulative revenue)`,
                    `Filter brands with Momentum Score >= ${momentumHigh.toFixed(1)}`,
                    `Count matching brands: ${rm.metrics.market_leaders.count}`,
                  ],
                  intermediate_values: {},
                  final_value: rm.metrics.market_leaders.count,
                  classification_rule: `Revenue Tier A + High Momentum (Score >= ${momentumHigh.toFixed(1)})`,
                },
                rm.metrics.market_leaders.count,
                brands
              );
              if (ev) setSelectedEvidence(ev);
            }}
          />
          <KPICard 
            label="Growth Challengers"
            value={rm.metrics.emerging_brands.count}
            implication="Lower Revenue, High Momentum"
            onClick={() => {
              const brands = rm.metrics.emerging_brands.items;
              const ev = toEvidenceData(
                rm.metrics.emerging_brands.evidence || {
                  metric_name: 'Growth Challengers',
                  formula: 'Brands where Revenue Tier in (B, C) AND Momentum Score >= High Threshold',
                  source_dataset: 'BlackBox Products Dataset',
                  source_columns: ['Brand', 'Parent Level Revenue', 'Momentum Score'],
                  source_rows: [],
                  calculation_steps: [
                    `Filter brands with Revenue Tier = B or C (not top tier)`,
                    `Filter brands with Momentum Score >= ${momentumHigh.toFixed(1)}`,
                    `Count matching brands: ${rm.metrics.emerging_brands.count}`,
                  ],
                  intermediate_values: {},
                  final_value: rm.metrics.emerging_brands.count,
                  classification_rule: `Revenue Tier B/C + High Momentum (Score >= ${momentumHigh.toFixed(1)})`,
                },
                rm.metrics.emerging_brands.count,
                brands
              );
              if (ev) setSelectedEvidence(ev);
            }}
          />
          <KPICard 
            label="Revenue Heavyweights"
            value={rm.metrics.premium_brands.count}
            implication="High Revenue, Low Momentum"
            onClick={() => {
              const brands = rm.metrics.premium_brands.items;
              const ev = toEvidenceData(
                rm.metrics.premium_brands.evidence || {
                  metric_name: 'Revenue Heavyweights',
                  formula: 'Brands where Revenue Tier in (A, B) AND Momentum Score < High Threshold',
                  source_dataset: 'BlackBox Products Dataset',
                  source_columns: ['Brand', 'Parent Level Revenue', 'Momentum Score'],
                  source_rows: [],
                  calculation_steps: [
                    `Filter brands with Revenue Tier = A or B (top/mid tier)`,
                    `Filter brands with Momentum Score < ${momentumHigh.toFixed(1)}`,
                    `Count matching brands: ${rm.metrics.premium_brands.count}`,
                  ],
                  intermediate_values: {},
                  final_value: rm.metrics.premium_brands.count,
                  classification_rule: `Revenue Tier A/B + Low/Medium Momentum (Score < ${momentumHigh.toFixed(1)})`,
                },
                rm.metrics.premium_brands.count,
                brands
              );
              if (ev) setSelectedEvidence(ev);
            }}
          />
          <KPICard 
            label="Long Tail Players"
            value={rm.metrics.niche_players.count}
            implication="Low Revenue, Low Momentum"
            onClick={() => {
              const brands = rm.metrics.niche_players.items;
              const ev = toEvidenceData(
                rm.metrics.niche_players.evidence || {
                  metric_name: 'Long Tail Players',
                  formula: 'Brands where Revenue Tier = C AND Momentum Score < High Threshold',
                  source_dataset: 'BlackBox Products Dataset',
                  source_columns: ['Brand', 'Parent Level Revenue', 'Momentum Score'],
                  source_rows: [],
                  calculation_steps: [
                    `Filter brands with Revenue Tier = C (long tail)`,
                    `Filter brands with Momentum Score < ${momentumHigh.toFixed(1)}`,
                    `Count matching brands: ${rm.metrics.niche_players.count}`,
                  ],
                  intermediate_values: {},
                  final_value: rm.metrics.niche_players.count,
                  classification_rule: `Revenue Tier C + Low/Medium Momentum (Score < ${momentumHigh.toFixed(1)})`,
                },
                rm.metrics.niche_players.count,
                brands
              );
              if (ev) setSelectedEvidence(ev);
            }}
          />
        </div>
      </PageSection>

      {/* Tier and Threshold Explanations — Consistent White Card Design */}
      <PageSection title="Revenue Tier & Momentum Definitions">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Revenue Tier Definitions Card */}
          <Card className="border-border/50 bg-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Info className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base">Revenue Tier Definitions</h3>
                  <p className="text-xs text-muted-foreground mt-1">Dataset-adaptive classification based on cumulative revenue share</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const tierABrands = rm.momentum_ledger.filter(b => b.revenue_tier === 'A');
                    setDrillDownConfig({
                      title: 'Tier A Brands',
                      explanation: tierDefinitions.A || 'Top revenue brands contributing first 60% of cumulative revenue',
                      items: tierABrands,
                    });
                  }}
                  className="w-full p-3 bg-success/5 border border-success/20 rounded hover:border-success/40 transition-colors text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-success">Tier A</p>
                    <Badge variant="outline" className="bg-success/10 border-success/30 text-success">
                      {rm.momentum_ledger.filter(b => b.revenue_tier === 'A').length} brands
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{tierDefinitions.A || 'Top 60% cumulative revenue'}</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    const tierBBrands = rm.momentum_ledger.filter(b => b.revenue_tier === 'B');
                    setDrillDownConfig({
                      title: 'Tier B Brands',
                      explanation: tierDefinitions.B || 'Mid-tier brands contributing next 25% (60-85% cumulative)',
                      items: tierBBrands,
                    });
                  }}
                  className="w-full p-3 bg-primary/5 border border-primary/20 rounded hover:border-primary/40 transition-colors text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-primary">Tier B</p>
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">
                      {rm.momentum_ledger.filter(b => b.revenue_tier === 'B').length} brands
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{tierDefinitions.B || 'Next 25% (60-85% cumulative)'}</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    const tierCBrands = rm.momentum_ledger.filter(b => b.revenue_tier === 'C');
                    setDrillDownConfig({
                      title: 'Tier C Brands',
                      explanation: tierDefinitions.C || 'Long tail brands beyond 85% cumulative revenue',
                      items: tierCBrands,
                    });
                  }}
                  className="w-full p-3 bg-muted border border-border/50 rounded hover:border-border transition-colors text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-muted-foreground">Tier C</p>
                    <Badge variant="outline" className="bg-muted border-border text-muted-foreground">
                      {rm.momentum_ledger.filter(b => b.revenue_tier === 'C').length} brands
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{tierDefinitions.C || 'Remaining long tail (>85%)'}</p>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Momentum Threshold Card */}
          <Card className="border-border/50 bg-card">
            <CardContent className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Info className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base">Momentum Thresholds</h3>
                  <p className="text-xs text-muted-foreground mt-1">Adaptive thresholds calculated from current dataset distribution</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const highMomentumBrands = rm.momentum_ledger.filter(b => b.momentum_score >= momentumHigh);
                    setDrillDownConfig({
                      title: 'High Momentum Brands',
                      explanation: `Brands with momentum score ≥ ${momentumHigh.toFixed(1)} (75th percentile). Strong growth signals across available indicators.`,
                      items: highMomentumBrands,
                    });
                  }}
                  className="w-full p-3 bg-success/5 border border-success/20 rounded hover:border-success/40 transition-colors text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-success">High Momentum</p>
                    <Badge variant="outline" className="bg-success/10 border-success/30 text-success">
                      {rm.momentum_ledger.filter(b => b.momentum_score >= momentumHigh).length} brands
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Score ≥ {momentumHigh.toFixed(1)} (75th percentile)</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    const medMomentumBrands = rm.momentum_ledger.filter(
                      b => b.momentum_score >= momentumLow && b.momentum_score < momentumHigh,
                    );
                    setDrillDownConfig({
                      title: 'Medium Momentum Brands',
                      explanation: `Brands with ${momentumLow.toFixed(1)} ≤ momentum score < ${momentumHigh.toFixed(1)} (between 25th and 75th percentile).`,
                      items: medMomentumBrands,
                    });
                  }}
                  className="w-full p-3 bg-warning/5 border border-warning/20 rounded hover:border-warning/40 transition-colors text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-warning">Medium Momentum</p>
                    <Badge variant="outline" className="bg-warning/10 border-warning/30 text-warning">
                      {rm.momentum_ledger.filter(
                        b => b.momentum_score >= momentumLow && b.momentum_score < momentumHigh,
                      ).length} brands
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {momentumLow.toFixed(1)} ≤ score &lt; {momentumHigh.toFixed(1)}
                  </p>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    const lowMomentumBrands = rm.momentum_ledger.filter(b => b.momentum_score < momentumLow);
                    setDrillDownConfig({
                      title: 'Low Momentum Brands',
                      explanation: `Brands with momentum score < ${momentumLow.toFixed(1)} (below 25th percentile). Weak or declining growth signals.`,
                      items: lowMomentumBrands,
                    });
                  }}
                  className="w-full p-3 bg-muted border border-border/50 rounded hover:border-border transition-colors text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-muted-foreground">Low Momentum</p>
                    <Badge variant="outline" className="bg-muted border-border text-muted-foreground">
                      {rm.momentum_ledger.filter(b => b.momentum_score < momentumLow).length} brands
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Score &lt; {momentumLow.toFixed(1)} (25th percentile)</p>
                </button>
              </div>
            </CardContent>
          </Card>

        </div>
        
        <div className="mt-4">
          <p className="text-xs text-muted-foreground italic">
            <strong>Classification Logic:</strong> Final classification combines Revenue Tier (A/B/C based on cumulative revenue share) with Momentum Score (High/Medium/Low based on growth signals). 
            Thresholds adapt to the current uploaded dataset. Momentum calculated from available growth signals: Sales Trend, Revenue Trend, Sales Velocity, BSR Momentum, Revenue Efficiency.
          </p>
        </div>
      </PageSection>

      <PageSection title="2. Market Momentum Matrix">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupCards.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`border rounded-xl p-6 flex flex-col h-full transition-all text-left bg-card hover:border-primary/50 shadow-sm`}
              onClick={() => setSelectedGroupKey(g.key)}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-bold text-lg text-foreground">{g.meta.title}</h3>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mt-1">
                    {rm.classification_summary?.group_definitions?.[g.meta.title] || g.meta.ruleLabel}
                  </p>
                </div>
                <div className={`text-4xl font-black font-mono ${g.meta.cardClass.split(' ')[2]}`}>{g.block.count}</div>
              </div>
              <div className="mt-auto pt-4 border-t border-border/40 w-full">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-mono">Top Brands in Quadrant</p>
                <div className="flex flex-wrap gap-2">
                  {(g.block.preview_brands || []).slice(0, 3).map((b) => (
                    <span key={b} className="text-xs font-semibold bg-muted/30 px-2 py-1 rounded border border-border/50 truncate max-w-[120px]">
                      {b}
                    </span>
                  ))}
                  {(g.block.preview_brands || []).length === 0 && <span className="text-xs opacity-50 italic">None</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PageSection>

      <PageSection title="3. Full Momentum Ledger">
        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="pt-6">
            <DataTable
              columns={ledgerColumns}
              data={rm.momentum_ledger.slice().sort((a, b) => Number(b.revenue_share || 0) - Number(a.revenue_share || 0) || Number(b.momentum_score || 0) - Number(a.momentum_score || 0))}
              pageSize={15}
              rowKey={(row, i) => `${row.brand}-${row.row_number ?? i}`}
              onRowClick={(row) => setSelectedEvidence(ledgerRowEvidence(row, momentumHigh, momentumLow, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 }))}
            />
          </CardContent>
        </Card>
      </PageSection>

      <Drawer
        isOpen={Boolean(selectedGroupKey && selectedGroupMeta && selectedGroup)}
        onClose={() => setSelectedGroupKey(null)}
        title={selectedGroupMeta ? `${selectedGroupMeta.title} (${selectedGroup?.count || 0})` : 'Momentum Group'}
      >
        {selectedGroup && selectedGroupMeta && (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/20 p-5 space-y-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border/50 pb-2 mb-2">
                {rm.classification_summary?.group_definitions?.[selectedGroupMeta.title] || selectedGroupMeta.ruleLabel}
              </p>
              
              {!selectedGroup.ai_insight ? (
                <div className="text-sm italic text-muted-foreground">AI Insight Unavailable</div>
              ) : typeof selectedGroup.ai_insight === 'string' ? (
                <div className="text-sm whitespace-pre-line leading-relaxed">{selectedGroup.ai_insight}</div>
              ) : (
                <div className="space-y-4 text-sm">
                  {selectedGroup.ai_insight.insights?.map((insight: any, idx: number) => (
                    <div key={idx} className="bg-card border border-border/60 rounded-lg overflow-hidden shadow-sm">
                      <div className="bg-muted/40 px-4 py-3 border-b border-border/50">
                        <h4 className="font-semibold text-foreground tracking-wide text-xs">{insight.title}</h4>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="bg-primary/5 border border-primary/20 rounded p-3 text-sm font-mono flex flex-col gap-1">
                          {Object.entries(insight.evidence || {}).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-center text-primary">
                              <span className="opacity-70">{key}:</span>
                              <span className="font-semibold">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1 block">Observation</span>
                          <p className="text-foreground leading-relaxed">{insight.observation}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1 block">Why It Matters</span>
                          <p className="text-foreground leading-relaxed">{insight.why_it_matters}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1 block">Potential Opportunity</span>
                          <p className="text-foreground leading-relaxed">{insight.potential_opportunity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {(!selectedGroup.ai_insight.insights || selectedGroup.ai_insight.insights.length === 0) && (
                    <div className="text-muted-foreground text-center py-6 italic border rounded-lg bg-muted/20">
                      The available data does not provide enough evidence to generate insights.
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex gap-2 pt-2 mt-4 border-t border-border/50">
                <Button size="sm" variant="outline" onClick={() => {
                  const ev = toEvidenceData(selectedGroup.evidence, selectedGroup.count, selectedGroup.items);
                  if (ev) setSelectedEvidence(ev);
                }}>
                  View Audit Trail
                </Button>
              </div>
            </div>

            <DataTable
              columns={drillColumns}
              data={selectedGroup.items.slice().sort((a, b) => Number(b.revenue_share || 0) - Number(a.revenue_share || 0) || Number(b.momentum_score || 0) - Number(a.momentum_score || 0))}
              pageSize={20}
              rowKey={(row, i) => `${row.brand}-${row.row_number ?? i}`}
              onRowClick={(row) => setSelectedEvidence(ledgerRowEvidence(row, momentumHigh, momentumLow, rm.total_market_revenue || 0, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: rm.momentum_ledger?.length || 0 }))}
            />
          </div>
        )}
      </Drawer>

      <KPIDrillDownModal 
        isOpen={Boolean(drillDownConfig)} 
        onClose={() => setDrillDownConfig(null)} 
        title={drillDownConfig?.title || ''} 
        explanation={drillDownConfig?.explanation || ''} 
        items={drillDownConfig?.items || []} 
      />
      <EvidenceDrawer isOpen={!!selectedEvidence} onClose={() => setSelectedEvidence(null)} evidence={selectedEvidence} />
    </div>
  );
}
