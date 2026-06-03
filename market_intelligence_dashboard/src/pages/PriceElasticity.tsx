import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { getEngineErrorMessage } from '../utils/analysisStatus';
import { Modal } from '../components/ui/Modal';
import {
  AlertCircle, Loader2, Target, Layers, Crown, Activity, Maximize, Target as TargetIcon, Info, Package, Database, Code, ChevronRight, Scale
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ScatterChart, Scatter, Cell, Legend
} from 'recharts';
import { motion } from 'framer-motion';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';

// --- Types ---
type Evidence = {
  source_dataset: string;
  source_columns: string[];
  formula: string;
  source_values: string;
  rows_included: number;
  rows_excluded: number;
  calculation_steps: string[];
  final_value: string | number;
  interpretation: string;
};

type PriceRange = {
  range_label: string;
  min_price: number;
  max_price: number;
  tier: string;
  color_key: string;
  product_count: number;
  parent_revenue: number;
  parent_sales: number;
  products: any[];
  revenue_share?: number;
  evidence: Evidence;
};

type MarketPriceStructure = {
  price_floor: number;
  price_ceiling: number;
  price_spread: number;
  evidence: Evidence;
};

type MarketSweetSpot = {
  range_label: string;
  tier: string;
  parent_revenue: number;
  parent_sales: number;
  product_count: number;
  insight: string;
  formula: string;
  evidence: Evidence;
};

type EntryPriceRecommendation = {
  recommended_range: string;
  tier: string;
  strategy: string;
  llm_strategy: string | null;
  rule_based_strategy: string;
  evidence: Evidence;
};

type PositioningData = {
  title: string;
  brand: string;
  asin: string;
  price: number;
  parent_revenue: number;
  parent_sales: number;
  tier: string;
  color_key: string;
  evidence: Evidence;
};

type TopOpportunity = {
  price_range: string;
  tier: string;
  color_key: string;
  parent_revenue: number;
  parent_sales: number;
  product_count: number;
  competition_density: number;
  opportunity_score: number;
  evidence: Evidence;
};

type BrandBreakdown = {
  brand: string;
  parent_revenue: number;
  parent_sales: number;
  product_count: number;
  brand_share: number;
  top_products: any[];
};

type BrandPosition = {
  price_range: string;
  tier: string;
  color_key: string;
  total_parent_revenue: number;
  total_parent_sales: number;
  product_count: number;
  brand_count: number;
  leading_brand: string;
  leading_brand_revenue: number;
  leading_brand_share: number;
  concentration_note: string;
  brand_breakdown: BrandBreakdown[];
  evidence: Evidence;
};

type CrossTierCompetitor = {
  brand: string;
  price_ranges_present: number;
  total_parent_revenue: number;
  total_parent_sales: number;
  strongest_price_range: string;
  strategic_note: string;
  evidence: Evidence;
};

type PricingIntelligenceData = {
  price_tiers: PriceRange[];
  color_map: Record<string, string>;
  market_price_structure: MarketPriceStructure;
  market_sweet_spot: MarketSweetSpot;
  entry_price_recommendation: EntryPriceRecommendation;
  product_positioning_map: PositioningData[];
  revenue_distribution: any[];
  competition_density: any[];
  top_pricing_opportunities: TopOpportunity[];
  brand_position_by_price_range: BrandPosition[];
  cross_tier_competitors: CrossTierCompetitor[];
};

// --- Color Mapping ---
const COLOR_MAP: Record<string, string> = {
  "tier_budget": "#2563eb",
  "tier_mass_market": "#16a34a",
  "tier_mass_premium": "#f59e0b",
  "tier_premium": "#7c3aed",
  "tier_luxury": "#dc2626",
  "tier_ultra_luxury": "#0891b2"
};

// --- Components ---

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-64">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

function TierModalContent({ tier }: { tier: PriceRange }) {
  return (
    <div className="space-y-6">
      <div className="bg-muted/30 p-4 rounded-xl border border-border" style={{ borderLeftWidth: '4px', borderLeftColor: COLOR_MAP[tier.color_key] }}>
        <h3 className="text-xl font-bold leading-tight text-foreground mb-2" style={{ color: COLOR_MAP[tier.color_key] }}>
          {tier.tier} ({tier.range_label})
        </h3>
        <div className="flex flex-wrap gap-6 mt-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Products</p>
            <p className="text-xl font-mono font-black">{formatNumber(tier.product_count)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Parent Revenue</p>
            <p className="text-xl font-mono font-black text-emerald-500">{formatCurrency(tier.parent_revenue)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Parent Sales</p>
            <p className="text-xl font-mono font-black text-blue-500">{formatNumber(tier.parent_sales)}</p>
          </div>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Products Included</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">ASIN</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Sales</th>
              </tr>
            </thead>
            <tbody>
              {tier.products?.map((p, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2 font-medium truncate max-w-[200px]" title={p.title}>{p.title}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.asin}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.brand}</td>
                  <td className="px-3 py-2 font-mono text-right">{formatCurrency(p.price)}</td>
                  <td className="px-3 py-2 font-mono text-emerald-500 text-right">{formatCurrency(p.parent_revenue)}</td>
                  <td className="px-3 py-2 font-mono text-blue-500 text-right">{formatNumber(p.parent_sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EvidenceModalContent({ evidence, title }: { evidence: Evidence; title: string }) {
  if (!evidence) return <div className="p-4 text-muted-foreground">Evidence unavailable.</div>;
  return (
    <div className="space-y-6">
      <div className="bg-muted/30 p-4 rounded-xl border border-border">
        <h3 className="text-xl font-bold leading-tight text-foreground mb-2">{title}</h3>
        <p className="text-sm text-foreground/80 leading-relaxed bg-card p-3 rounded border border-border shadow-sm">
          {evidence.interpretation}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2 flex items-center gap-1">
            <Database className="w-3 h-3 text-blue-500" /> Source Data
          </span>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Dataset:</span> <span className="font-mono">{evidence.source_dataset}</span></p>
            <p><span className="text-muted-foreground">Columns:</span> <span className="font-mono">{evidence.source_columns.join(', ')}</span></p>
            <p><span className="text-muted-foreground">Rows Included:</span> <span className="font-mono">{formatNumber(evidence.rows_included)}</span></p>
            <p><span className="text-muted-foreground">Rows Excluded:</span> <span className="font-mono">{formatNumber(evidence.rows_excluded)}</span></p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2 flex items-center gap-1">
            <Code className="w-3 h-3 text-emerald-500" /> Formula & Values
          </span>
          <div className="space-y-3">
            <div className="bg-muted/50 p-2 rounded border border-border/50 font-mono text-xs text-emerald-600 break-words">
              {evidence.formula}
            </div>
            <p className="text-xs text-muted-foreground">Source Values:</p>
            <p className="font-mono text-sm">{evidence.source_values}</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-3 flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-primary" /> Calculation Steps
        </span>
        <ol className="list-decimal list-inside space-y-2 text-sm text-foreground/80 font-mono">
          {evidence.calculation_steps.map((step, idx) => (
            <li key={idx} className="pb-1 border-b border-border/50 last:border-0">{step}</li>
          ))}
        </ol>
      </div>
      
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 shadow-sm flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-widest text-primary">Final Computed Value</span>
        <span className="text-2xl font-black font-mono text-primary">{evidence.final_value}</span>
      </div>
    </div>
  );
}

function BrandDetailsModalContent({ tier, brandBreakdown }: { tier: string; brandBreakdown: BrandBreakdown[] }) {
  return (
    <div className="space-y-6">
      <div className="bg-muted/30 p-4 rounded-xl border border-border">
        <h3 className="text-xl font-bold leading-tight text-foreground mb-2">Brands in {tier} Tier</h3>
        <p className="text-sm text-foreground/80 leading-relaxed bg-card p-3 rounded border border-border shadow-sm">
          A breakdown of all brands actively selling within this specific price tier, ranked by their Parent Level Revenue share.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="overflow-x-auto max-h-[50vh]">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Products</th>
                <th className="px-3 py-2 text-right">Share %</th>
              </tr>
            </thead>
            <tbody>
              {brandBreakdown.map((b, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2 font-bold truncate max-w-[200px]" title={b.brand}>{b.brand}</td>
                  <td className="px-3 py-2 font-mono text-emerald-500 text-right font-bold">{formatCurrency(b.parent_revenue)}</td>
                  <td className="px-3 py-2 font-mono text-blue-500 text-right">{formatNumber(b.parent_sales)}</td>
                  <td className="px-3 py-2 font-mono text-right">{formatNumber(b.product_count)}</td>
                  <td className="px-3 py-2 font-mono text-right font-bold">{b.brand_share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductDetailModalContent({ data, onShowEvidence }: { data: PositioningData, onShowEvidence: () => void }) {
  return (
    <div className="p-1 space-y-4">
      <div className="space-y-3 font-mono text-sm">
        <p className="text-muted-foreground flex justify-between gap-4">Tier: <span className="font-bold text-right uppercase tracking-widest" style={{ color: COLOR_MAP[data.color_key] }}>{data.tier}</span></p>
        <p className="text-muted-foreground flex justify-between gap-4">Brand: <span className="text-foreground text-right">{data.brand}</span></p>
        <p className="text-muted-foreground flex justify-between gap-4">Price: <span className="text-foreground font-bold">{formatCurrency(data.price)}</span></p>
        <p className="text-muted-foreground flex justify-between gap-4">Parent Revenue: <span className="text-emerald-500 font-bold">{formatCurrency(data.parent_revenue)}</span></p>
        <p className="text-muted-foreground flex justify-between gap-4">Units Sold: <span className="text-blue-500 font-bold">{formatNumber(data.parent_sales)}</span></p>
        {data.asin && (
            <p className="text-muted-foreground flex justify-between gap-4 text-xs">ASIN: <span className="text-foreground">{data.asin}</span></p>
        )}
      </div>
      <button 
        onClick={onShowEvidence}
        className="w-full mt-2 py-2 px-4 border border-border rounded-md text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
      >
        <Database className="w-3 h-3" /> View Details
      </button>
    </div>
  );
}

interface KpiProps {
  title: string;
  value: string | React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
  onClick?: () => void;
}

function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip, onClick }: KpiProps) {
  return (
    <Card 
      onClick={onClick}
      className={cn("border-t-4 border-t-primary/20 bg-card/50 glass", onClick ? "cursor-pointer hover:border-primary transition-all hover:-translate-y-1" : "hover-card-anim")}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
            {tooltip && (
              <Tip text={tooltip}>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </Tip>
            )}
          </div>
          <div className={cn('p-1.5 rounded-md border flex-shrink-0', bg)}>
            <span className={color}>{icon}</span>
          </div>
        </div>
        <div className={cn('text-2xl font-black leading-tight tracking-tight font-mono', color)}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function UnavailableCard({ message }: { message: string }) {
  return (
    <Card className="border-red-500/20 bg-red-500/5 mt-10">
      <CardContent className="p-8 flex flex-col items-center text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2 font-serif">Pricing Economics Unavailable</h2>
        <p className="text-red-500/80 max-w-lg">{message}</p>
      </CardContent>
    </Card>
  );
}

type ModalState = 
  | { type: 'evidence'; title: string; evidence: Evidence }
  | { type: 'tier'; tier: PriceRange }
  | { type: 'brand_details'; title: string; tier: string; brand_breakdown: BrandBreakdown[]; evidence: Evidence }
  | { type: 'product_detail'; data: PositioningData }
  | null;

export default function PriceElasticity() {
  const [modalState, setModalState] = useState<ModalState>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['price-intelligence'],
    queryFn: () => api.getPriceElasticity(6), // We mock project_id 6
  });

  const engineResponse = useMemo(() => {
    return data;
  }, [data]);

  const memoized = useMemo(() => {
    const engineData = engineResponse?.data;
    if (engineData?.status === 'unavailable') return null;
    
    const results = engineData?.results;
    if (!results || Object.keys(results).length === 0) return null;
    return results as PricingIntelligenceData;
  }, [engineResponse]);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || engineResponse?.data?.status === 'unavailable' || !memoized) {
    const fallbackMsg = 'Could not calculate price economics. Ensure Parent Level Revenue and Price are mapped.';
    const specificReason = engineResponse?.data?.summary;
    let msg = specificReason || getEngineErrorMessage(data, fallbackMsg);
    
    if (msg.toLowerCase() === 'success' || !msg) {
        msg = fallbackMsg;
    }
    
    return <UnavailableCard message={msg} />;
  }

  const pi = memoized;
  const struct = pi.market_price_structure;

  // Render Table Columns
  const topOpportunitiesColumns: Column<TopOpportunity>[] = [
    { 
      header: 'Price Range', 
      accessorKey: 'price_range', 
      cell: (r) => <span className="font-mono font-bold block">{r.price_range}</span>
    },
    { 
        header: 'Tier', 
        accessorKey: 'tier', 
        cell: (r) => <Badge variant="outline" className="text-[10px] font-mono tracking-widest uppercase" style={{ color: COLOR_MAP[r.color_key], borderColor: COLOR_MAP[r.color_key] }}>{r.tier}</Badge>
    },
    { 
        header: 'Parent Level Revenue', 
        accessorKey: 'parent_revenue', 
        cell: (r) => <span className="font-mono font-bold" style={{ color: COLOR_MAP[r.color_key] }}>{formatCurrency(r.parent_revenue)}</span>
    },
    { 
        header: 'Units Sold', 
        accessorKey: 'parent_sales', 
        cell: (r) => <span className="font-mono font-bold">{formatNumber(r.parent_sales)}</span>
    },
    { 
        header: 'Product Count', 
        accessorKey: 'product_count', 
        cell: (r) => <span className="font-mono">{formatNumber(r.product_count)}</span>
    },
    { 
        header: 'Competition Density', 
        accessorKey: 'competition_density', 
        cell: (r) => <span className="font-mono">{r.competition_density.toFixed(1)}%</span>
    },
    { 
      header: 'Opportunity Score', 
      accessorKey: 'opportunity_score',
      cell: (r) => (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm w-10 font-black" style={{ color: COLOR_MAP[r.color_key] }}>{r.opportunity_score.toFixed(0)}</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden hidden md:block">
              <div className="h-full rounded-full" style={{ width: `${r.opportunity_score}%`, backgroundColor: COLOR_MAP[r.color_key] }} />
            </div>
          </div>
        </div>
      )
    },
  ];

  const brandPositionColumns: Column<BrandPosition>[] = [
    { 
      header: 'Price Range', 
      accessorKey: 'price_range', 
      cell: (r) => <span className="font-mono font-bold block">{r.price_range}</span>
    },
    { 
        header: 'Tier', 
        accessorKey: 'tier', 
        cell: (r) => <Badge variant="outline" className="text-[10px] font-mono tracking-widest uppercase" style={{ color: COLOR_MAP[r.color_key], borderColor: COLOR_MAP[r.color_key] }}>{r.tier}</Badge>
    },
    { 
        header: 'Total Revenue', 
        accessorKey: 'total_parent_revenue', 
        cell: (r) => <span className="font-mono text-emerald-600 font-bold">{formatCurrency(r.total_parent_revenue)}</span>
    },
    { 
        header: 'Total Sales', 
        accessorKey: 'total_parent_sales', 
        cell: (r) => <span className="font-mono text-blue-500 font-bold">{formatNumber(r.total_parent_sales)}</span>
    },
    { 
        header: 'Products', 
        accessorKey: 'product_count', 
        cell: (r) => <span className="font-mono">{formatNumber(r.product_count)}</span>
    },
    { 
        header: 'Brands', 
        accessorKey: 'brand_count', 
        cell: (r) => <span className="font-mono">{r.brand_count}</span>
    },
    { 
        header: 'Leading Brand', 
        accessorKey: 'leading_brand', 
        cell: (r) => <span className="font-bold block truncate max-w-[150px]">{r.leading_brand}</span>
    },
    { 
        header: 'Leader Revenue', 
        accessorKey: 'leading_brand_revenue', 
        cell: (r) => <span className="font-mono text-emerald-600 font-medium">{formatCurrency(r.leading_brand_revenue)}</span>
    },
    { 
        header: 'Leader Share', 
        accessorKey: 'leading_brand_share', 
        cell: (r) => <span className="font-mono font-bold">{r.leading_brand_share.toFixed(1)}%</span>
    },
    { 
        header: 'Competition Note', 
        accessorKey: 'concentration_note', 
        cell: (r) => <span className="text-xs text-muted-foreground block max-w-[200px]">{r.concentration_note}</span>
    },
  ];

  const crossTierColumns: Column<CrossTierCompetitor>[] = [
    { 
        header: 'Brand', 
        accessorKey: 'brand', 
        cell: (r) => <span className="font-bold">{r.brand}</span>
    },
    { 
        header: 'Tiers Present', 
        accessorKey: 'price_ranges_present', 
        cell: (r) => <span className="font-mono">{r.price_ranges_present}</span>
    },
    { 
        header: 'Total Revenue', 
        accessorKey: 'total_parent_revenue', 
        cell: (r) => <span className="font-mono text-emerald-600 font-medium">{formatCurrency(r.total_parent_revenue)}</span>
    },
    { 
        header: 'Total Sales', 
        accessorKey: 'total_parent_sales', 
        cell: (r) => <span className="font-mono text-blue-500 font-medium">{formatNumber(r.total_parent_sales)}</span>
    },
    { 
        header: 'Strongest Tier', 
        accessorKey: 'strongest_price_range', 
        cell: (r) => <Badge variant="outline" className="font-mono text-[10px]">{r.strongest_price_range}</Badge>
    },
    { 
        header: 'Insight', 
        accessorKey: 'strategic_note', 
        cell: (r) => <span className="text-xs text-muted-foreground block max-w-xs">{r.strategic_note}</span>
    },
  ];

  const narrative = `The market's price floor sits at ${formatCurrency(struct.price_floor)}, extending up to a ceiling of ${formatCurrency(struct.price_ceiling)}, yielding a price spread of ${formatCurrency(struct.price_spread)}. The optimal strategic sweet spot is ${pi.market_sweet_spot.range_label} (${pi.market_sweet_spot.tier}), which currently commands ${formatCurrency(pi.market_sweet_spot.parent_revenue)} in Parent Level Revenue. The recommended entry range is ${pi.entry_price_recommendation.recommended_range}.`;

  return (
    <>
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      
      <PageHeader 
        badge="Pricing Intelligence"
        title="Price Economics & Strategy"
        description="Structural analysis utilizing Parent Level Revenue to calculate distribution, sweet spots, and entry recommendations across refined market tiers."
      />

      <ExecutiveNarrative content={narrative} />

      {/* TIER DEFINITIONS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {pi.price_tiers.map((tier, idx) => (
          <Card 
            key={idx} 
            className="cursor-pointer transition-all hover:-translate-y-1 bg-card/50 shadow-sm border-border"
            style={{ borderTopColor: COLOR_MAP[tier.color_key], borderTopWidth: '4px' }}
            onClick={() => setModalState({ type: 'tier', tier })}
          >
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-widest font-bold mb-1" style={{ color: COLOR_MAP[tier.color_key] }}>{tier.tier}</span>
              <span className="font-mono font-black text-sm text-foreground mb-2">{tier.range_label}</span>
              <div className="flex gap-3 text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                  <span title="Revenue">{formatCurrency(tier.parent_revenue)}</span>
                  <span title="Units Sold">{formatNumber(tier.parent_sales)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PageSection title="1. Market Price Structure" icon={Scale}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Price Floor" value={formatCurrency(struct.price_floor)} icon={<Maximize className="w-4 h-4" />} color="text-muted-foreground" bg="bg-muted border-border" tooltip="Lowest statistically significant price point in market" onClick={() => setModalState({ type: 'evidence', title: "Market Price Structure", evidence: struct.evidence })} />
          <KpiCard title="Price Ceiling" value={formatCurrency(struct.price_ceiling)} icon={<Maximize className="w-4 h-4" />} color="text-muted-foreground" bg="bg-muted border-border" tooltip="Highest statistically significant price point in market" onClick={() => setModalState({ type: 'evidence', title: "Market Price Structure", evidence: struct.evidence })} />
          <KpiCard title="Price Spread" value={formatCurrency(struct.price_spread)} icon={<Layers className="w-4 h-4" />} color="text-primary" bg="bg-primary/10 border-primary/20" tooltip="Difference between ceiling and floor" onClick={() => setModalState({ type: 'evidence', title: "Market Price Structure", evidence: struct.evidence })} />
        </div>
      </PageSection>

      {/* SECTION: PRODUCT POSITIONING MAP */}
      <PageSection title="2. Product Positioning Map" icon={Target}>
        <ChartContainer 
          title="Price vs Revenue Distribution"
          yAxisLabel="Parent Level Revenue"
          xAxisLabel="Price"
          businessExplanation="Plots individual products based on their price and parent revenue. Clusters indicate optimal pricing tiers where the highest revenue is concentrated."
        >
          <div className="h-[400px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  type="number" 
                  dataKey="price" 
                  name="Price" 
                  tickFormatter={v => formatCurrency(v)} 
                  label={{ value: 'Price ($)', position: 'insideBottom', offset: -25, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="parent_revenue" 
                  name="Parent Level Revenue" 
                  tickFormatter={v => `$${formatNumber(v)}`} 
                  label={{ value: 'Parent Level Revenue', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as PositioningData;
                    return (
                      <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl text-sm font-mono space-y-1 z-50 min-w-[250px]">
                        <p className="font-bold border-b border-border/50 pb-2 mb-2 truncate text-foreground">{d.title}</p>
                        <p className="text-muted-foreground flex justify-between gap-4">Tier: <span style={{ color: COLOR_MAP[d.color_key] }}>{d.tier}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Brand: <span className="text-foreground truncate max-w-[100px] text-right">{d.brand}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Price: <span className="text-foreground font-bold">{formatCurrency(d.price)}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Parent Revenue: <span className="text-emerald-500 font-bold">{formatCurrency(d.parent_revenue)}</span></p>
                        <p className="text-muted-foreground flex justify-between gap-4">Units Sold: <span className="text-blue-500 font-bold">{formatNumber(d.parent_sales)}</span></p>
                      </div>
                    );
                  }}
                />
                <Scatter 
                  data={pi.product_positioning_map}
                  onClick={(e: any) => {
                    const data = e?.payload || e;
                    setModalState({ type: 'product_detail', data });
                  }}
                  className="cursor-pointer"
                >
                  {pi.product_positioning_map.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLOR_MAP[entry.color_key] || 'hsl(var(--primary))'} fillOpacity={0.8} stroke="hsl(var(--background))" strokeWidth={1} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </PageSection>

      {/* STRATEGIC INSIGHTS */}
      <PageSection title="3. Strategic Price Economics" icon={Activity}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Market Sweet Spot */}
        <Card 
          className="border-border/50 shadow-sm bg-primary/5 cursor-pointer transition-all hover:-translate-y-1"
          onClick={() => setModalState({ type: 'evidence', title: "Market Sweet Spot", evidence: pi.market_sweet_spot.evidence })}
        >
          <CardHeader className="border-b border-primary/10 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <TargetIcon className="w-4 h-4 text-primary" /> Market Sweet Spot
            </CardTitle>
            <span className="text-[10px] uppercase tracking-widest text-primary/50 flex items-center gap-1"><Database className="w-3 h-3" /> Evidence</span>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col justify-center h-full space-y-4">
            <div className="text-center">
                <p className="text-4xl font-black font-mono text-primary leading-tight mb-2">{pi.market_sweet_spot.range_label}</p>
                <Badge variant="outline" className="border-primary/30 text-primary uppercase tracking-widest text-[10px] mb-6">{pi.market_sweet_spot.tier}</Badge>
                
                <div className="flex justify-center gap-4 mb-4">
                  <div className="bg-card border border-primary/20 p-4 rounded-xl shadow-sm inline-block">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1 justify-center"><Activity className="w-3 h-3 text-emerald-500" /> Parent Revenue</p>
                      <p className="font-mono text-emerald-600 font-black text-xl">{formatCurrency(pi.market_sweet_spot.parent_revenue)}</p>
                  </div>
                  <div className="bg-card border border-primary/20 p-4 rounded-xl shadow-sm inline-block">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1 justify-center"><Package className="w-3 h-3 text-blue-500" /> Units Sold</p>
                      <p className="font-mono text-blue-600 font-black text-xl">{formatNumber(pi.market_sweet_spot.parent_sales)}</p>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground/80 leading-relaxed font-medium bg-background/50 p-3 rounded border border-primary/10 max-w-sm mx-auto">
                  {pi.market_sweet_spot.insight}
                </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">

            {/* Entry Recommendation */}
            <Card 
              className="border-border/50 shadow-sm flex-1 cursor-pointer transition-all hover:-translate-y-1"
              onClick={() => setModalState({ type: 'evidence', title: "Entry Recommendation", evidence: pi.entry_price_recommendation.evidence })}
            >
            <CardHeader className="border-b border-border/50 pb-3 bg-muted/10 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <TargetIcon className="w-4 h-4 text-muted-foreground" /> Entry Price Recommendation
                </CardTitle>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 flex items-center gap-1"><Database className="w-3 h-3" /> Evidence</span>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className="text-3xl font-black font-mono text-foreground">{pi.entry_price_recommendation.recommended_range}</p>
                    </div>
                    <Badge variant="outline" className="uppercase text-[10px] tracking-widest bg-background border-border text-foreground">
                        {pi.entry_price_recommendation.tier}
                    </Badge>
                </div>
                
                <div className="space-y-3">
                    {pi.entry_price_recommendation.llm_strategy ? (
                        <div className="bg-primary/5 p-3 rounded border border-primary/20 text-xs leading-relaxed text-foreground/90">
                            <span className="font-bold text-primary block mb-1">Analyst Insight:</span>
                            {pi.entry_price_recommendation.llm_strategy}
                        </div>
                    ) : (
                        <p className="text-xs text-foreground/80 leading-relaxed font-medium bg-muted/30 p-3 rounded border border-border">
                        {pi.entry_price_recommendation.rule_based_strategy}
                        </p>
                    )}
                </div>
            </CardContent>
            </Card>
        </div>
        </div>
      </PageSection>

      {/* SECTIONS 3 & 4: CHARTS */}
      <PageSection title="4. Pricing Demographics" icon={Layers}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Revenue Pricing Chart */}
        <Card className="border-border/50 transition-colors">
          <CardHeader className="bg-muted/10 border-b border-border/50 flex flex-row justify-between items-center group">
            <div>
                <CardTitle className="font-serif text-lg">Revenue Distribution</CardTitle>
                <CardDescription>Parent Level Revenue by Price Range</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={pi.revenue_distribution} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={v => `$${formatNumber(v)}`} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis dataKey="range_label" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={100} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Parent Revenue']}
                />
                <Bar dataKey="parent_revenue" radius={[0, 4, 4, 0]}>
                  {pi.revenue_distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLOR_MAP[entry.color_key] || 'hsl(var(--primary))'} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Competition Density Chart */}
        <Card className="border-border/50 transition-colors">
          <CardHeader className="bg-muted/10 border-b border-border/50 flex flex-row justify-between items-center group">
            <div>
                <CardTitle className="font-serif text-lg">Competition Density</CardTitle>
                <CardDescription>Product count by Price Range</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pi.competition_density} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="range_label" stroke="hsl(var(--muted-foreground))" fontSize={10} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  formatter={(value: any) => [formatNumber(Number(value)), 'Products']}
                />
                <Bar dataKey="product_count" radius={[4, 4, 0, 0]} opacity={0.8}>
                  {pi.competition_density.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLOR_MAP[entry.color_key] || 'hsl(var(--primary))'} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        </div>
      </PageSection>

      {/* SECTION 9: TOP PRICING OPPORTUNITIES */}
      <Card className="border-border/50 overflow-hidden shadow-sm">
        <CardHeader className="bg-primary/5 border-b border-border/50">
          <CardTitle className="font-serif">Top Pricing Opportunities</CardTitle>
          <CardDescription>Ranked by composite opportunity score (Click any row for evidence)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable 
            columns={topOpportunitiesColumns} 
            data={pi.top_pricing_opportunities} 
            pageSize={5} 
            onRowClick={(row) => setModalState({ type: 'evidence', title: `Opportunity Score: ${row.price_range}`, evidence: row.evidence })}
          />
        </CardContent>
      </Card>

      {/* SECTION 10: BRAND POSITION BY PRICE RANGE */}
      <Card className="border-border/50 overflow-hidden shadow-sm">
        <CardHeader className="bg-muted/10 border-b border-border/50">
          <CardTitle className="font-serif">Brand Position by Price Range</CardTitle>
          <CardDescription>Identify which brands dominate each specific price tier segment (Click any row for evidence)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable 
            columns={brandPositionColumns} 
            data={pi.brand_position_by_price_range} 
            pageSize={10} 
            onRowClick={(row) => setModalState({ type: 'brand_details', title: `Brand Breakdown: ${row.price_range}`, tier: row.tier, brand_breakdown: row.brand_breakdown, evidence: row.evidence })}
          />
        </CardContent>
      </Card>

      {/* SECTION 11: CROSS-TIER COMPETITORS */}
      {pi.cross_tier_competitors.length > 0 && (
        <Card className="border-border/50 overflow-hidden shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/50">
            <CardTitle className="font-serif">Cross-tier Competitors</CardTitle>
            <CardDescription>Identify broad competitors spanning multiple price ranges (Click any row for evidence)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable 
              columns={crossTierColumns} 
              data={pi.cross_tier_competitors} 
              pageSize={5} 
              onRowClick={(row) => setModalState({ type: 'evidence', title: `Cross-tier Competitor: ${row.brand}`, evidence: row.evidence })}
            />
          </CardContent>
        </Card>
      )}

    </div>

    {/* MODAL (REPLACES DRAWER) */}
    <Modal 
      isOpen={!!modalState} 
      onClose={() => setModalState(null)} 
      title={modalState?.type === 'evidence' ? "Calculation Evidence" : modalState?.type === 'tier' ? "Market Tier Details" : modalState?.type === 'brand_details' ? "Brand Breakdown Details" : modalState?.type === 'product_detail' ? (modalState.data.title.length > 30 ? modalState.data.title.substring(0, 30) + '...' : modalState.data.title) : ""}
      maxWidth={modalState?.type === 'product_detail' ? "max-w-sm" : "max-w-4xl"}
    >
      {modalState?.type === 'evidence' && (
        <EvidenceModalContent evidence={modalState.evidence} title={modalState.title} />
      )}
      {modalState?.type === 'tier' && (
        <TierModalContent tier={modalState.tier} />
      )}
      {modalState?.type === 'product_detail' && (
        <ProductDetailModalContent 
          data={modalState.data} 
          onShowEvidence={() => setModalState({ type: 'evidence', title: `Point Evidence: ${modalState.data.title}`, evidence: modalState.data.evidence })}
        />
      )}
      {modalState?.type === 'brand_details' && (
        <div className="space-y-6">
            <BrandDetailsModalContent tier={modalState.tier} brandBreakdown={modalState.brand_breakdown} />
            <div className="pt-6 border-t border-border">
                <EvidenceModalContent evidence={modalState.evidence} title="Brand Aggregation Evidence" />
            </div>
        </div>
      )}
    </Modal>
    </>
  );
}
