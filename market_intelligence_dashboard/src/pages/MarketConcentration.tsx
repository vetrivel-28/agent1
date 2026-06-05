import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Crown, Network, Layers, DollarSign } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { motion } from 'framer-motion';

import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { KPICard } from '../components/ui/KPICard';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { EvidenceDrawer, type EvidenceData } from '../components/ui/EvidenceDrawer';
import { formatGenericLabel } from '../utils/formatters';
import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';
import { FilterBar } from '../components/filters/FilterBar';



// ─── Types ────────────────────────────────────────────────────────────────────

type BrandRanking = {
  rank: number;
  brand: string;
  parent_revenue: number;
  revenue_share: number;
  product_count: number;
  avg_revenue_per_product: number;
  segment: string;
  units_sold?: number;
  asp?: number;
};

type CompetitiveSegment = {
  segment: string;
  brand_count: number;
  combined_revenue: number;
  combined_share: number;
  top_brands: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function segmentBadgeClass(segment: string): string {
  switch (segment) {
    case 'Market Leaders':     return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    case 'Strong Competitors': return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    case 'Niche Players':      return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30';
    case 'Long Tail':          return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    default:                   return 'bg-muted text-muted-foreground border border-border';
  }
}

function hhiColor(hhi: number): string {
  if (hhi < 1500)  return 'text-emerald-500';
  if (hhi <= 2500) return 'text-amber-500';
  if (hhi <= 4000) return 'text-orange-500';
  return 'text-danger';
}

function ControlBar({ top1, top3, top5, top10 }: { top1: number; top3: number; top5: number; top10: number }) {
  const others = Math.max(0, 100 - top10);
  const segments = [
    { width: top1,         color: 'bg-primary',         label: `#1 (${top1.toFixed(1)}%)` },
    { width: top3 - top1,  color: 'bg-primary/80',      label: `#2–3 (${(top3 - top1).toFixed(1)}%)` },
    { width: top5 - top3,  color: 'bg-primary/60',      label: `#4–5 (${(top5 - top3).toFixed(1)}%)` },
    { width: top10 - top5, color: 'bg-primary/40',      label: `#6–10 (${(top10 - top5).toFixed(1)}%)` },
    { width: others,       color: 'bg-muted',           label: `Others (${others.toFixed(1)}%)` },
  ];
  return (
    <div className="space-y-4 w-full">
      <div className="flex h-12 rounded-xl overflow-hidden w-full shadow-inner border border-black/10 dark:border-white/10">
        {segments.map((s, i) => (
          <div
            key={i}
            className={cn('flex items-center justify-center text-xs font-bold text-white transition-all', s.color)}
            style={{ width: `${Math.max(0, s.width)}%` }}
            title={s.label}
          >
            {s.width > 9 ? `${s.width.toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-3 text-sm font-medium">
        {[
          { color: 'bg-primary',               label: `#1 Brand (${top1.toFixed(1)}%)` },
          { color: 'bg-primary/80',             label: `Top 3 (${top3.toFixed(1)}%)` },
          { color: 'bg-primary/60',             label: `Top 5 (${top5.toFixed(1)}%)` },
          { color: 'bg-primary/40',             label: `Top 10 (${top10.toFixed(1)}%)` },
          { color: 'bg-muted-foreground/30',    label: `Others (${others.toFixed(1)}%)` },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-2">
            <span className={cn('w-3 h-3 rounded-full inline-block', l.color)} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-xl text-sm space-y-1.5 min-w-[200px]">
      <p className="font-bold text-base border-b border-border/50 pb-2 mb-2">{d.fullBrand ?? d.brand}</p>
      <div className="flex justify-between"><span className="text-muted-foreground">Parent Revenue:</span><span className="font-medium">{formatCurrency(d.parent_revenue)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Units Sold:</span><span className="font-medium">{d.units_sold?.toLocaleString() || 0}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">ASP:</span><span className="font-medium">{formatCurrency(d.asp || 0)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Share:</span><span className="font-medium text-primary">{d.revenue_share?.toFixed(2)}%</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Segment:</span><span className="font-medium">{formatGenericLabel(d.segment)}</span></div>
    </div>
  );
}

// ─── HHI Modal (kept as-is — it is already evidence-backed) ──────────────────

function HHIModal({ isOpen, onClose, hhi, topBrands, top5Share, totalBrands }: {
  isOpen: boolean; onClose: () => void; hhi: number;
  topBrands: BrandRanking[]; top5Share: number; totalBrands: number;
}) {
  const leader = topBrands[0] || { brand: 'N/A', revenue_share: 0 };
  const hhiType =
    hhi < 1500  ? 'Highly Fragmented' :
    hhi <= 2500 ? 'Moderately Concentrated' :
    hhi <= 4000 ? 'Highly Concentrated' : 'Monopolistic';

  const leaderContribution = Math.pow(leader.revenue_share || 0, 2);
  const second = topBrands[1];
  const secondContribution = second ? Math.pow(second.revenue_share || 0, 2) : 0;

  let newEntrantAdvice = '', existingAdvice = '';
  if (hhi < 1500) {
    newEntrantAdvice = 'Low barriers to entry. Focus on niche differentiation rather than competing on massive scale.';
    existingAdvice   = 'Market is highly competitive. Seek consolidation opportunities or build strong brand loyalty to protect margins.';
  } else if (hhi <= 2500) {
    newEntrantAdvice = 'Moderate barriers. Target specific underserved customer segments rather than broad market appeal.';
    existingAdvice   = 'Defend market share by expanding product lines and optimizing supply chain efficiencies.';
  } else if (hhi <= 4000) {
    newEntrantAdvice = 'High barriers to entry. Requires significant capital or a highly disruptive technological advantage.';
    existingAdvice   = 'Focus on protecting core market share. High risk of price wars if challengers attempt to take share.';
  } else {
    newEntrantAdvice = 'Extreme barriers. Direct competition is not recommended. Consider alternative markets or strategic partnerships.';
    existingAdvice   = 'Maintain dominance through continuous innovation and leveraging economies of scale.';
  }

  const execSummary =
    `This market exhibits a ${hhiType.toLowerCase()} structure with an HHI score of ${hhi.toLocaleString()}. ` +
    `The leading brand, ${leader.brand}, controls ${Number(leader.revenue_share).toFixed(1)}% of the market, ` +
    `while the Top 5 brands collectively capture ${top5Share.toFixed(1)}% across ${totalBrands.toLocaleString()} active competitors. ` +
    (hhi < 2500 ? `This presents a viable opportunity for targeted entry.` : `This structure strongly favors incumbents and poses significant risks for new entrants.`);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Market Concentration (HHI) Analysis" maxWidth="max-w-3xl">
      <div className="space-y-6 text-sm">
        <div className="flex gap-4">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex-1 text-center">
            <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Your HHI Score</p>
            <p className={`text-4xl font-black ${hhiColor(hhi)}`}>{hhi.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border/50 rounded-lg p-4 flex-1 text-center flex flex-col justify-center">
            <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Market Type</p>
            <p className={`text-xl font-bold ${hhiColor(hhi)}`}>{hhiType}</p>
          </div>
        </div>

        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2 border-b border-border/50"><h4 className="font-bold text-foreground">How We Calculated It</h4></div>
          <div className="p-4 space-y-3 bg-card">
            <div>
              <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Formula</span>
              <code className="bg-muted/50 px-2 py-1 rounded text-primary font-mono text-xs block">
                HHI = s₁² + s₂² + s₃² + ... + sₙ² (where s is the market share percentage)
              </code>
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Source</span>
              <p className="text-xs text-foreground/80">BlackBox dataset — "Brand" column grouped and "Parent Level Revenue" summed per brand.</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Top Contributors</span>
              <ul className="space-y-1 font-mono text-xs text-foreground/80 bg-muted/20 p-3 rounded">
                <li>{leader.brand}: ({Number(leader.revenue_share).toFixed(1)}%)² = {leaderContribution.toFixed(1)}</li>
                {second && <li>{second.brand}: ({Number(second.revenue_share).toFixed(1)}%)² = {secondContribution.toFixed(1)}</li>}
                <li className="text-muted-foreground italic">...plus remaining brands</li>
                <li className="pt-1 mt-1 border-t border-border/50 text-primary font-bold">Total HHI = {hhi.toLocaleString()}</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2 border-b border-border/50"><h4 className="font-bold text-foreground">HHI Scale</h4></div>
          <div className="p-0 bg-card">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10">
                  <th className="p-3 font-bold">HHI Range</th>
                  <th className="p-3 font-bold">Market Type</th>
                  <th className="p-3 font-bold">Competition Level</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { range: '0 – 1,500',     type: 'Highly Fragmented',     color: 'text-emerald-500', note: 'Intense. Many small players. Easy entry.',                       active: hhi < 1500 },
                  { range: '1,500 – 2,500', type: 'Moderately Concentrated', color: 'text-amber-500', note: 'Moderate. A few established leaders emerging.',                 active: hhi >= 1500 && hhi <= 2500 },
                  { range: '2,500 – 4,000', type: 'Highly Concentrated',   color: 'text-orange-500', note: 'Low. Dominated by a few major players. Hard entry.',             active: hhi > 2500 && hhi <= 4000 },
                  { range: '4,000+',        type: 'Monopolistic',          color: 'text-danger',     note: 'Minimal. One or two giants control the market.',                active: hhi > 4000 },
                ].map((row) => (
                  <tr key={row.range} className={`border-b border-border/10 ${row.active ? 'bg-primary/10 font-medium' : ''}`}>
                    <td className="p-3">{row.range}</td>
                    <td className={`p-3 ${row.color}`}>{row.type}</td>
                    <td className="p-3">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="border border-border/50 rounded-lg p-4 bg-card">
            <h4 className="font-bold text-foreground mb-3 pb-2 border-b border-border/50">What We Found</h4>
            <ul className="space-y-2">
              <li className="flex justify-between"><span className="text-muted-foreground">Market Leader Share:</span><span className="font-bold">{Number(leader.revenue_share).toFixed(1)}%</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Top 5 Brands Share:</span><span className="font-bold">{top5Share.toFixed(1)}%</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Active Brands:</span><span className="font-bold">{totalBrands.toLocaleString()}</span></li>
            </ul>
          </div>
          <div className="border border-border/50 rounded-lg p-4 bg-card">
            <h4 className="font-bold text-foreground mb-3 pb-2 border-b border-border/50">Business Interpretation</h4>
            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-primary block mb-1">For New Entrants</span>
                <p className="text-xs text-foreground/80 leading-relaxed">{newEntrantAdvice}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-primary block mb-1">For Existing Competitors</span>
                <p className="text-xs text-foreground/80 leading-relaxed">{existingAdvice}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/20 p-4 rounded-lg border border-border/50 border-l-4 border-l-primary">
          <h4 className="font-bold text-primary mb-1">Conclusion</h4>
          <p className="text-foreground/90 font-medium leading-relaxed">{execSummary}</p>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketConcentration() {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const categoryKey = statusData?.data?.category_scope?.selected_categories?.join('|') || 'all';
  const categoryScope = statusData?.data?.category_scope || {};

  const [isHHIOpen, setIsHHIOpen]   = useState(false);
  const [evidence, setEvidence]     = useState<EvidenceData | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-concentration', categoryKey],
    queryFn: () => api.getMarketConcentration(50, categoryScope),
  });

  // Safe data extraction - handles undefined gracefully
  const structure        = data?.data?.results?.market_structure || {};
  const topBrands: BrandRanking[] = Array.isArray(structure.brand_rankings) 
    ? structure.brand_rankings 
    : [];
  const landscape: CompetitiveSegment[] = Array.isArray(structure.competitive_landscape) 
    ? structure.competitive_landscape 
    : [];
  const hhi: number      = data?.data?.results?.hhi_score ?? 0;
  const totalRevenue     = structure.total_market_revenue      ?? 0;
  const totalUnits       = structure.total_units_sold          ?? 0;
  const totalBrands      = structure.active_brand_count        ?? 0;
  const top1Share        = Number(structure.top_1_share        ?? 0);
  const top3Share        = Number(structure.top_3_share        ?? 0);
  const top5Share        = Number(structure.top_5_share        ?? 0);
  const concentrationType: string = structure.concentration_type ?? 'N/A';
  const totalProducts    = structure.total_products            ?? 0;
  const top10Share       = topBrands.slice(0, 10).reduce((s: number, b) => s + (b.revenue_share ?? 0), 0);
  const leader           = topBrands[0] || null;

  const filterConfigs: FilterConfig<BrandRanking>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'segment', label: 'Segment', type: 'select', getValue: r => r.segment },
    { id: 'revenue', label: 'Revenue', type: 'range', getValue: r => r.parent_revenue },
    { id: 'units', label: 'Units Sold', type: 'range', getValue: r => r.units_sold },
    { id: 'products', label: 'Products', type: 'range', getValue: r => r.product_count },
    { id: 'share', label: 'Market Share %', type: 'range', getValue: r => r.revenue_share },
  ];

  const {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<BrandRanking>(topBrands, filterConfigs);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Market Structure Unavailable</h2>
          <p className="text-danger/80">{getEngineErrorMessage(data, 'Requires BlackBox with Brand and Revenue columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  

  const filteredTop10Brands = filteredData.slice(0, 10);
  const filteredOthersRevenue = filteredData.slice(10).reduce((s: number, b) => s + (b.parent_revenue ?? 0), 0);
  const filteredOthersShare   = filteredData.slice(10).reduce((s: number, b) => s + (b.revenue_share  ?? 0), 0);

  const top10Brands      = topBrands.slice(0, 10);

  const othersRevenue = topBrands.slice(10).reduce((s: number, b) => s + (b.parent_revenue ?? 0), 0);
  const othersShare   = topBrands.slice(10).reduce((s: number, b) => s + (b.revenue_share  ?? 0), 0);
  const barData = [
    ...filteredTop10Brands.map((b) => ({
      ...b,
      brand:     b.brand?.length > 20 ? b.brand.slice(0, 18) + '…' : b.brand,
      fullBrand: b.brand,
    })),
    ...(filteredOthersShare > 0 ? [{
      rank: 99, brand: 'Others', fullBrand: 'Others (aggregated)',
      parent_revenue: filteredOthersRevenue,
      revenue_share: parseFloat(filteredOthersShare.toFixed(2)),
      segment: 'Long Tail',
    }] : []),
  ];

  // ── Evidence builders with comprehensive count verification ──────────────────

  function totalRevenueEvidence(): EvidenceData {
    const validProducts = totalProducts; // All products that contributed
    const confidence = totalProducts > 0 ? Math.round((validProducts / totalProducts) * 100) : 0;
    
    return {
      title: 'Total Market Revenue',
      displayed_value: formatCurrency(totalRevenue),
      source_datasets: ['BlackBox Products Dataset'],
      source_columns: ['Parent Level Revenue'],
      source_row_count: totalProducts,
      formula: 'Total Revenue = SUM(Parent Level Revenue) across all valid product rows where value is numeric and > 0',
      aggregation_method: 'Summation across all product records with valid revenue data',
      calculation_steps: [
        `1. Load BlackBox dataset`,
        `2. Identify "Parent Level Revenue" column`,
        `3. Parse numeric values — skip blank, null, or non-numeric entries`,
        `4. Exclude rows with revenue <= 0`,
        `5. Sum all included revenue values`,
        `6. Total Market Revenue = ${formatCurrency(totalRevenue)}`,
        `7. Contributing products: ${totalProducts.toLocaleString()}`,
        `8. Contributing brands: ${totalBrands.toLocaleString()}`,
      ],
      top_records: topBrands.slice(0, 10).map(b => ({
        brand: b.brand,
        revenue: b.parent_revenue,
        units: b.units_sold || 0,
        product_count: b.product_count,
        share: `${b.revenue_share.toFixed(2)}%`,
      })),
      thresholds: {
        high: `Total products processed: ${totalProducts.toLocaleString()}`,
        medium: `Valid revenue records: ${validProducts.toLocaleString()}`,
        low: `Confidence: ${confidence}%`,
      },
      classification_reason: `${totalProducts.toLocaleString()} products across ${totalBrands.toLocaleString()} brands contributed to total market revenue of ${formatCurrency(totalRevenue)}.`,
      confidence_note: `${confidence}% confidence — based on ${validProducts.toLocaleString()} products with valid Parent Level Revenue data. Rows with missing, non-numeric, or zero revenue are excluded from the sum.`,
      data_quality_notes: validProducts < totalProducts ? [`${totalProducts - validProducts} products excluded due to missing/invalid revenue data`] : undefined,
    };
  }

  function totalUnitsEvidence(): EvidenceData {
    const validProducts = totalProducts;
    const confidence = totalProducts > 0 ? Math.round((validProducts / totalProducts) * 100) : 0;
    
    return {
      title: 'Total Units Sold',
      displayed_value: totalUnits.toLocaleString(),
      source_datasets: ['BlackBox Products Dataset'],
      source_columns: ['Parent Level Units Sold'],
      source_row_count: totalProducts,
      formula: 'Total Units = SUM(Parent Level Units Sold) across all valid product rows where value is numeric and >= 0',
      aggregation_method: 'Summation across all product records with valid units data',
      calculation_steps: [
        `1. Load BlackBox dataset`,
        `2. Identify "Parent Level Units Sold" column`,
        `3. Parse numeric values — skip blank, null, or non-numeric entries`,
        `4. Sum all valid unit values`,
        `5. Total Units Sold = ${totalUnits.toLocaleString()}`,
        `6. Contributing products: ${totalProducts.toLocaleString()}`,
        `7. Average units per product: ${totalProducts > 0 ? Math.round(totalUnits / totalProducts).toLocaleString() : 0}`,
      ],
      top_records: topBrands.slice(0, 10).map(b => ({
        brand: b.brand,
        units: b.units_sold || 0,
        revenue: b.parent_revenue,
        product_count: b.product_count,
        avg_units_per_product: b.product_count > 0 ? Math.round((b.units_sold || 0) / b.product_count) : 0,
      })),
      thresholds: {
        high: `Total products processed: ${totalProducts.toLocaleString()}`,
        medium: `Valid units records: ${validProducts.toLocaleString()}`,
        low: `Confidence: ${confidence}%`,
      },
      classification_reason: `${totalUnits.toLocaleString()} total units sold across ${totalProducts.toLocaleString()} products from ${totalBrands.toLocaleString()} brands.`,
      confidence_note: `${confidence}% confidence — based on ${validProducts.toLocaleString()} products with valid Parent Level Units Sold data.`,
    };
  }

  function activeBrandsEvidence(): EvidenceData {
    const validBrandRows = totalProducts;
    const confidence = totalProducts > 0 ? Math.round((validBrandRows / totalProducts) * 100) : 0;
    
    return {
      title: 'Active Brands',
      displayed_value: totalBrands.toLocaleString(),
      source_datasets: ['BlackBox Products Dataset'],
      source_columns: ['Brand'],
      source_row_count: totalProducts,
      formula: 'Active Brands = COUNT(DISTINCT non-empty Brand values) across all product rows',
      aggregation_method: 'Distinct count of normalized brand names with at least one product',
      calculation_steps: [
        `1. Load BlackBox dataset`,
        `2. Extract "Brand" column from all rows`,
        `3. Normalize: trim whitespace, normalize case`,
        `4. Filter out blank/null/empty brand values`,
        `5. Count distinct brand names`,
        `6. Active Brands = ${totalBrands.toLocaleString()}`,
        `7. Total products across all brands: ${totalProducts.toLocaleString()}`,
        `8. Average products per brand: ${totalBrands > 0 ? Math.round(totalProducts / totalBrands) : 0}`,
      ],
      top_records: topBrands.slice(0, 15).map(b => ({
        brand: b.brand,
        product_count: b.product_count,
        revenue: b.parent_revenue,
        revenue_share: `${b.revenue_share.toFixed(2)}%`,
        units: b.units_sold || 0,
      })),
      thresholds: {
        high: `Total product rows: ${totalProducts.toLocaleString()}`,
        medium: `Rows with valid brand: ${validBrandRows.toLocaleString()}`,
        low: `Unique brands: ${totalBrands.toLocaleString()}`,
      },
      classification_reason: `${totalBrands.toLocaleString()} distinct brands identified from ${totalProducts.toLocaleString()} product records.`,
      confidence_note: `${confidence}% confidence — based on ${validBrandRows.toLocaleString()} products with non-empty Brand values. Top ${Math.min(15, totalBrands)} brands shown above.`,
    };
  }

  function marketLeaderEvidence(): EvidenceData | null {
    if (!leader) return null;
    
    const confidence = leader.product_count > 0 ? 98 : 50;
    
    return {
      title: `Market Leader: ${leader.brand}`,
      displayed_value: `${top1Share.toFixed(1)}% market share`,
      source_datasets: ['BlackBox Products Dataset'],
      source_columns: ['Brand', 'Parent Level Revenue', 'Parent Level Units Sold', 'Price'],
      source_row_count: leader.product_count,
      formula: 'Market Leader = brand with highest total revenue. Market Share = Leader Revenue / Total Market Revenue × 100',
      aggregation_method: 'Brands ranked by total revenue descending. Top brand is the market leader.',
      calculation_steps: [
        `1. Group all products by Brand`,
        `2. Sum "Parent Level Revenue" for each brand`,
        `3. Rank brands by total revenue descending`,
        `4. Market Leader: "${leader.brand}" with ${formatCurrency(leader.parent_revenue)}`,
        `5. Total Market Revenue: ${formatCurrency(totalRevenue)}`,
        `6. Market Share = ${leader.parent_revenue} / ${totalRevenue} × 100 = ${top1Share.toFixed(2)}%`,
        `7. Leader Products: ${leader.product_count.toLocaleString()}`,
        `8. Leader Units Sold: ${leader.units_sold?.toLocaleString() || 0}`,
        `9. Leader ASP: ${formatCurrency(leader.asp || 0)}`,
        `10. Second-place gap: ${topBrands[1] ? `${(top1Share - topBrands[1].revenue_share).toFixed(1)}%` : 'N/A'}`,
      ],
      top_records: topBrands.slice(0, 5).map(b => ({
        rank: b.rank,
        brand: b.brand,
        revenue: b.parent_revenue,
        share: `${b.revenue_share.toFixed(2)}%`,
        units: b.units_sold || 0,
        products: b.product_count,
      })),
      thresholds: {
        high: 'Dominant Leader — share > 30%',
        medium: 'Strong Leader — share 15–30%',
        low: 'Weak Leader — share < 15%',
      },
      classification_reason: `"${leader.brand}" is the market leader with ${top1Share.toFixed(1)}% share, controlling ${formatCurrency(leader.parent_revenue)} across ${leader.product_count.toLocaleString()} products.`,
      confidence_note: `${confidence}% confidence — based on ${leader.product_count.toLocaleString()} products with valid revenue data. Market leader is determined purely by highest total revenue.`,
    };
  }

  function brandRowEvidence(row: BrandRanking, filterContext?: { active_filters: Record<string, any>; filtered_row_count: number; total_row_count: number; }): EvidenceData {
    const confidence = row.product_count > 0 ? 95 : 50;
    
    return {
      title: `Brand: ${row.brand}`,
      displayed_value: formatCurrency(row.parent_revenue),
      source_datasets: ['BlackBox Products Dataset'],
      source_columns: ['Brand', 'Parent Level Revenue', 'Parent Level Units Sold', 'Price'],
      source_row_count: row.product_count,
    active_filters: filterContext?.active_filters,
    filtered_row_count: filterContext?.filtered_row_count,
    total_row_count: filterContext?.total_row_count,
    calculation_scope: filterContext ? 'Filtered' : 'Global',
      formula: 'Brand Revenue = SUM(Parent Level Revenue) for all rows where Brand matches this brand name',
      aggregation_method: 'Summation of revenue across all products belonging to this brand',
      calculation_steps: [
        `1. Filter BlackBox dataset where Brand = "${row.brand}"`,
        `2. Count matching product rows: ${row.product_count.toLocaleString()}`,
        `3. Sum "Parent Level Revenue" across matching rows`,
        `4. Brand Revenue = ${formatCurrency(row.parent_revenue)}`,
        `5. Market Share = Brand Revenue / Total Market Revenue × 100`,
        `6. Market Share = ${row.parent_revenue} / ${totalRevenue} × 100 = ${row.revenue_share.toFixed(2)}%`,
        `7. Sum "Parent Level Units Sold" = ${row.units_sold?.toLocaleString() || 0}`,
        `8. Calculate ASP = Revenue / Units = ${formatCurrency(row.asp || 0)}`,
        `9. Rank by revenue descending: Rank #${row.rank}`,
        `10. Segment classification: ${formatGenericLabel(row.segment)}`,
      ],
      top_records: [{
        brand: row.brand,
        rank: row.rank,
        revenue: row.parent_revenue,
        revenue_share: `${row.revenue_share.toFixed(2)}%`,
        units: row.units_sold || 0,
        asp: row.asp || 0,
        products: row.product_count,
        segment: row.segment,
      }],
      thresholds: {
        high: 'Market Leaders — top 1–3 brands by revenue, typically >10% share each',
        medium: 'Strong Competitors — ranks 4–10, between 1–10% share',
        low: 'Long Tail — ranks 11+, typically <1% individual share',
      },
      classification_reason: `"${row.brand}" classified as "${formatGenericLabel(row.segment)}". Rank: #${row.rank}. Revenue share: ${row.revenue_share.toFixed(2)}%. Products: ${row.product_count.toLocaleString()}.`,
      confidence_note: `${confidence}% confidence — based on ${row.product_count.toLocaleString()} product(s) with valid revenue data under this brand.`,
    };
  }

  function landscapeEvidence(seg: CompetitiveSegment): EvidenceData {
    return {
      title: `Competitive Segment: ${formatGenericLabel(seg.segment)}`,
      displayed_value: formatCurrency(seg.combined_revenue),
      source_datasets: ['BlackBox Products Dataset'],
      source_columns: ['Brand', 'Parent Level Revenue'],
      source_row_count: seg.brand_count,
      formula: `Combined Revenue = SUM(Parent Level Revenue) for all brands in the "${formatGenericLabel(seg.segment)}" tier.`,
      aggregation_method: `Brands are grouped into "${formatGenericLabel(seg.segment)}" by revenue share percentile. Combined revenue is the sum of all brands in this tier.`,
      calculation_steps: [
        `1. Rank all brands by total revenue descending.`,
        `2. Assign segment tier based on rank and revenue share thresholds.`,
        `3. "${formatGenericLabel(seg.segment)}" contains ${seg.brand_count} brand(s).`,
        `4. Combined Revenue = ${formatCurrency(seg.combined_revenue)}`,
        `5. Combined Share = ${seg.combined_share.toFixed(1)}%`,
        `6. Top brands: ${seg.top_brands.slice(0, 3).join(', ')}`,
      ],
      thresholds: {
        high:   'Market Leaders — top 1–3 brands, highest individual revenue',
        medium: 'Strong Competitors / Niche Players — mid-tier revenue',
        low:    'Long Tail — many brands each with small share',
      },
      classification_reason: `${seg.brand_count} brand(s) hold a combined ${seg.combined_share.toFixed(1)}% of market revenue.`,
    };
  }

  // ── Table columns — no Evidence column ────────────────────────────────────
  const columns: ColumnDef<BrandRanking>[] = [
    {
      header: 'Rank',
      cell: (row) => (
        <span className={cn('font-bold text-sm', row.rank === 1 ? 'text-primary' : row.rank <= 3 ? 'text-primary/80' : 'text-muted-foreground')}>
          {row.rank === 1 ? <Crown className="w-4 h-4 inline mr-1 -mt-1" /> : ''}{row.rank}
        </span>
      ),
    },
    { header: 'Brand',          cell: (row) => <span className="font-bold text-foreground/90">{row.brand}</span> },
    { header: 'Parent Revenue', cell: (row) => row.parent_revenue != null ? <span className="font-medium text-foreground/80">{formatCurrency(row.parent_revenue)}</span> : '—' },
    {
      header: 'Revenue Share',
      cell: (row) => {
        const pct = row.revenue_share ?? 0;
        return (
          <div className="flex items-center gap-3 w-48">
            <span className="font-mono text-sm font-semibold w-12">{pct.toFixed(1)}%</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    { header: 'Units Sold', cell: (row) => <span className="text-sm">{row.units_sold?.toLocaleString() || 0}</span> },
    { header: 'ASP',        cell: (row) => <span className="text-sm font-medium text-primary">{formatCurrency(row.asp || 0)}</span> },
    { header: 'Products',   cell: (row) => <span className="text-sm">{row.product_count.toLocaleString()}</span> },
    { header: 'Segment',    cell: (row) => <Badge variant="outline" className={segmentBadgeClass(row.segment)}>{formatGenericLabel(row.segment)}</Badge> },
  ];

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">

      {/* Shared evidence modal */}
      <EvidenceDrawer
        isOpen={!!evidence}
        onClose={() => setEvidence(null)}
        evidence={evidence}
      />

      <HHIModal
        isOpen={isHHIOpen}
        onClose={() => setIsHHIOpen(false)}
        hhi={hhi}
        topBrands={topBrands}
        top5Share={top5Share}
        totalBrands={totalBrands}
      />

      <PageHeader
        badge="Ownership & Dominance"
        title="Market Structure"
        description="Revenue-based market structure calculated from Parent Level Revenue."
      />

      {/* ── Market Scale & Activity — Professional 3-Card KPI Grid ─────────── */}
      <PageSection title="Market Scale & Activity">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Total Revenue Card */}
          <Card
            className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 cursor-pointer hover:border-primary/40 hover:shadow-lg transition-all group"
            onClick={() => setEvidence(totalRevenueEvidence())}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <DollarSign className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs">
                  {totalProducts > 0 ? Math.round((totalProducts / totalProducts) * 100) : 0}% confidence
                </Badge>
              </div>
              
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Total Revenue
              </h3>
              
              <p className="text-3xl font-black text-primary mb-3 group-hover:scale-105 transition-transform">
                {formatCurrency(totalRevenue)}
              </p>
              
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Revenue captured from {totalProducts.toLocaleString()} active product records across {totalBrands.toLocaleString()} brands.
              </p>
              
              <div className="flex items-center justify-between text-xs pt-3 border-t border-border/40">
                <span className="text-muted-foreground">Records: {totalProducts.toLocaleString()} / {totalProducts.toLocaleString()}</span>
                <span className="text-primary font-medium group-hover:underline">Click for evidence →</span>
              </div>
            </CardContent>
          </Card>

          {/* Units Sold Card */}
          <Card
            className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20 cursor-pointer hover:border-blue-500/40 hover:shadow-lg transition-all group"
            onClick={() => setEvidence(totalUnitsEvidence())}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Layers className="w-6 h-6 text-blue-500" />
                </div>
                <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-500 text-xs">
                  {totalProducts > 0 ? Math.round((totalProducts / totalProducts) * 100) : 0}% confidence
                </Badge>
              </div>
              
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Units Sold
              </h3>
              
              <p className="text-3xl font-black text-blue-500 mb-3 group-hover:scale-105 transition-transform">
                {totalUnits.toLocaleString()}
              </p>
              
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Total units sold from {totalProducts.toLocaleString()} active product records.
              </p>
              
              <div className="flex items-center justify-between text-xs pt-3 border-t border-border/40">
                <span className="text-muted-foreground">Avg: {totalProducts > 0 ? Math.round(totalUnits / totalProducts).toLocaleString() : 0} units/product</span>
                <span className="text-blue-500 font-medium group-hover:underline">Click for evidence →</span>
              </div>
            </CardContent>
          </Card>

          {/* Active Brands Card */}
          <Card
            className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20 cursor-pointer hover:border-emerald-500/40 hover:shadow-lg transition-all group"
            onClick={() => setEvidence(activeBrandsEvidence())}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg">
                  <Network className="w-6 h-6 text-emerald-500" />
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-500 text-xs">
                  {totalProducts > 0 ? Math.round((totalProducts / totalProducts) * 100) : 0}% confidence
                </Badge>
              </div>
              
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Active Brands
              </h3>
              
              <p className="text-3xl font-black text-emerald-500 mb-3 group-hover:scale-105 transition-transform">
                {totalBrands.toLocaleString()}
              </p>
              
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Unique brands detected from {totalProducts.toLocaleString()} product records.
              </p>
              
              <div className="flex items-center justify-between text-xs pt-3 border-t border-border/40">
                <span className="text-muted-foreground">Avg: {totalBrands > 0 ? Math.round(totalProducts / totalBrands) : 0} products/brand</span>
                <span className="text-emerald-500 font-medium group-hover:underline">Click for evidence →</span>
              </div>
            </CardContent>
          </Card>

        </div>
      </PageSection>

      {/* ── 1. Dominance & Concentration ────────────────────────────────── */}
      <PageSection title="1. Dominance & Concentration">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Market Leader Spotlight — clickable with comprehensive evidence */}
          <Card
            className="lg:col-span-2 bg-card border-border/40 relative overflow-hidden cursor-pointer hover:border-primary/40 transition-colors group"
            onClick={() => setEvidence(marketLeaderEvidence())}
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Crown className="w-64 h-64 text-primary" />
            </div>
            <CardContent className="p-8 relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Market Leader Spotlight</p>
                  <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">Click for full evidence →</span>
                </div>
                <h2 className="text-4xl font-black mb-1 group-hover:text-primary transition-colors">{leader?.brand || 'N/A'}</h2>
                <p className="text-base text-foreground/80 font-medium mb-6">
                  Commands <strong className="text-primary">{top1Share.toFixed(1)}%</strong> of total market revenue.
                </p>
                <div className="grid grid-cols-3 gap-4 border-t border-border/40 pt-6">
                  <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); leader && setEvidence(brandRowEvidence(leader)); }}>
                    <KPICard label="Revenue" value={formatCurrency(leader?.parent_revenue || 0)} />
                  </div>
                  <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); leader && setEvidence(brandRowEvidence(leader)); }}>
                    <KPICard label="Units Sold" value={leader?.units_sold?.toLocaleString() || '0'} />
                  </div>
                  <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); leader && setEvidence(brandRowEvidence(leader)); }}>
                    <KPICard label="ASP" value={formatCurrency(leader?.asp || 0)} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* HHI Card — opens HHIModal */}
          <div onClick={() => setIsHHIOpen(true)}>
            <Card className="bg-card border-border/40 cursor-pointer hover:border-primary/50 transition-colors group h-full">
              <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full relative">
                <div className="absolute top-4 right-4 bg-primary/10 text-primary p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-bold uppercase tracking-widest">Explain</span>
                </div>
                <Network className={cn('w-12 h-12 mb-4', hhiColor(hhi))} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Concentration Index (HHI)</p>
                <p className={cn('text-5xl font-black mb-2 font-mono', hhiColor(hhi))}>{hhi.toLocaleString()}</p>
                <Badge variant="outline" className={cn('mt-2 text-sm py-1 px-3', hhiColor(hhi))}>{concentrationType}</Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageSection>

      {/* ── 2. Competitive Hierarchy ─────────────────────────────────────── */}
      <PageSection title="2. Competitive Hierarchy">
        <Card className="p-8 bg-card border-border/40">
          <ControlBar top1={top1Share} top3={top3Share} top5={top5Share} top10={top10Share} />
        </Card>
      </PageSection>

      {/* ── 3. Revenue Distribution ──────────────────────────────────────── */}
      <PageSection title="3. Revenue Distribution by Brand">
        <ChartContainer
          title="Revenue Control"
          yAxisLabel="Brand"
          xAxisLabel="Revenue Share (%)"
          businessExplanation="Maps market share consolidation. If the bars fall off steeply after the top 2–3, the market is monopolistic. A smooth curve indicates healthy competition."
        >
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
              <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="brand" width={140} tick={{ fill: 'hsl(var(--foreground))', fontWeight: 500 }} axisLine={false} tickLine={false} />
              <Tooltip content={<BarTip />} cursor={{ fill: 'hsl(var(--muted)/0.3)' }} />
              <Bar dataKey="revenue_share" radius={[0, 4, 4, 0]} maxBarSize={32}>
                {barData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.rank === 1  ? 'hsl(var(--primary))' :
                      entry.rank <= 3   ? 'hsl(var(--primary)/0.8)' :
                      entry.rank <= 5   ? 'hsl(var(--primary)/0.6)' :
                      entry.rank <= 10  ? 'hsl(var(--primary)/0.4)' :
                                          'hsl(var(--muted))'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </PageSection>

      {/* ── 4. Competitive Landscape & Brand Rankings ────────────────────── */}
      <PageSection title="4. Competitive Landscape by Revenue">

        {/* Segment cards — each clickable */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {landscape.map((seg) => (
            <Card
              key={formatGenericLabel(seg.segment)}
              className="bg-card border-border/40 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setEvidence(landscapeEvidence(seg))}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className={segmentBadgeClass(seg.segment)}>{formatGenericLabel(seg.segment)}</Badge>
                  <span className="text-xs text-muted-foreground font-medium">{seg.brand_count} brands</span>
                </div>
                <p className="text-xl font-bold mb-1">{formatCurrency(seg.combined_revenue)}</p>
                <p className="text-sm font-medium text-primary mb-3">{seg.combined_share.toFixed(1)}% combined share</p>
                <div className="bg-muted/30 p-2 rounded-md">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Top Players</p>
                  <p className="text-xs font-medium text-foreground/80">{seg.top_brands.slice(0, 3).join(', ') || 'N/A'}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Brand Rankings table — rows clickable, no Evidence column */}
        
        <FilterBar 
          configs={filterConfigs}
          activeFilters={activeFilters}
          setFilter={setFilter}
          clearFilter={clearFilter}
          clearAll={clearAll}
          filterOptions={filterOptions}
          totalRecords={topBrands.length}
          filteredRecords={filteredData.length}
        />
        <DataTable

          title="Brand Revenue Ranking"
          description="Sorted by Parent Level Revenue. Click any row for full calculation evidence."
          columns={columns}
          data={filteredData}
          keyExtractor={(r) => r.brand}
          onRowClick={(row) => setEvidence(brandRowEvidence(row, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: topBrands.length }))}
        />
      </PageSection>

    </div>
  );
}
