import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Crown, Network, Layers, Shield
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { motion } from 'framer-motion';

// Unified Layouts
import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { KPICard } from '../components/ui/KPICard';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';

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

function segmentBadgeClass(segment: string): string {
  switch (segment) {
    case 'Market Leaders': return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    case 'Strong Competitors': return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    case 'Niche Players': return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30';
    case 'Long Tail': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    default:                  return 'bg-muted text-muted-foreground border border-border';
  }
}

function hhiColor(hhi: number): string {
  if (hhi < 1500) return 'text-emerald-500';
  if (hhi <= 2500) return 'text-amber-500';
  if (hhi <= 4000) return 'text-orange-500';
  return 'text-danger';
}

function ControlBar({ top1, top3, top5, top10 }: { top1: number; top3: number; top5: number; top10: number }) {
  const others = Math.max(0, 100 - top10);
  const segments = [
    { width: top1,            color: 'bg-primary', label: `#1 (${top1.toFixed(1)}%)` },
    { width: top3 - top1,     color: 'bg-primary/80',   label: `#2–3 (${(top3 - top1).toFixed(1)}%)` },
    { width: top5 - top3,     color: 'bg-primary/60',   label: `#4–5 (${(top5 - top3).toFixed(1)}%)` },
    { width: top10 - top5,    color: 'bg-primary/40',    label: `#6–10 (${(top10 - top5).toFixed(1)}%)` },
    { width: others,          color: 'bg-muted',      label: `Others (${others.toFixed(1)}%)` },
  ];
  return (
    <div className="space-y-4 w-full">
      <div className="flex h-12 rounded-xl overflow-hidden w-full shadow-inner border border-black/10 dark:border-white/10">
        {segments.map((s, i) => (
          <div key={i} className={cn('flex items-center justify-center text-xs font-bold text-white transition-all', s.color)}
            style={{ width: `${Math.max(0, s.width)}%` }} title={s.label}>
            {s.width > 9 ? `${s.width.toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-3 text-sm font-medium">
        {[
          { color: 'bg-primary', label: `#1 Brand (${top1.toFixed(1)}%)` },
          { color: 'bg-primary/80',   label: `Top 3 (${top3.toFixed(1)}%)` },
          { color: 'bg-primary/60',   label: `Top 5 (${top5.toFixed(1)}%)` },
          { color: 'bg-primary/40',    label: `Top 10 (${top10.toFixed(1)}%)` },
          { color: 'bg-muted-foreground/30', label: `Others (${others.toFixed(1)}%)` },
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
      <div className="flex justify-between"><span className="text-muted-foreground">Parent Revenue:</span> <span className="font-medium">{formatCurrency(d.parent_revenue)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Units Sold:</span> <span className="font-medium">{d.units_sold?.toLocaleString() || 0}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">ASP:</span> <span className="font-medium">{formatCurrency(d.asp || 0)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Share:</span> <span className="font-medium text-primary">{d.revenue_share?.toFixed(2)}%</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Segment:</span> <span className="font-medium">{d.segment}</span></div>
    </div>
  );
}


function HHIModal({ isOpen, onClose, hhi, topBrands, top5Share, totalBrands }: { isOpen: boolean; onClose: () => void; hhi: number; topBrands: BrandRanking[]; top5Share: number; totalBrands: number }) {
  const leader = topBrands[0] || { brand: 'N/A', revenue_share: 0 };
  const hhiType = hhi < 1500 ? 'Highly Fragmented' : hhi <= 2500 ? 'Moderately Concentrated' : hhi <= 4000 ? 'Highly Concentrated' : 'Monopolistic';
  
  const leaderContribution = Math.pow(leader.revenue_share || 0, 2);
  const second = topBrands[1];
  const secondContribution = second ? Math.pow(second.revenue_share || 0, 2) : 0;
  
  let newEntrantAdvice = '';
  let existingAdvice = '';
  if (hhi < 1500) {
    newEntrantAdvice = 'Low barriers to entry. Focus on niche differentiation rather than competing on massive scale.';
    existingAdvice = 'Market is highly competitive. Seek consolidation opportunities or build strong brand loyalty to protect margins.';
  } else if (hhi <= 2500) {
    newEntrantAdvice = 'Moderate barriers. Target specific underserved customer segments rather than broad market appeal.';
    existingAdvice = 'Defend market share by expanding product lines and optimizing supply chain efficiencies.';
  } else if (hhi <= 4000) {
    newEntrantAdvice = 'High barriers to entry. Requires significant capital or a highly disruptive technological advantage.';
    existingAdvice = 'Focus on protecting core market share. High risk of price wars if challengers attempt to take share.';
  } else {
    newEntrantAdvice = 'Extreme barriers. Direct competition is not recommended. Consider alternative markets or strategic partnerships.';
    existingAdvice = 'Maintain dominance through continuous innovation and leveraging economies of scale.';
  }
  
  const execSummary = `This market exhibits a ${hhiType.toLowerCase()} structure with an HHI score of ${hhi.toLocaleString()}. ` +
    `The leading brand, ${leader.brand}, controls ${Number(leader.revenue_share).toFixed(1)}% of the market, while the Top 5 brands collectively capture ${top5Share.toFixed(1)}% across ${totalBrands.toLocaleString()} active competitors. ` +
    (hhi < 2500 ? `This presents a viable opportunity for targeted entry.` : `This structure strongly favors incumbents and poses significant risks for new entrants.`);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Market Concentration (HHI) Analysis" maxWidth="max-w-3xl">
      <div className="space-y-6 text-sm">
        {/* Section 1: Your Result */}
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

        {/* Section 2: How We Calculated It */}
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
              <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Top Contributors in Your Market</span>
              <ul className="space-y-1 font-mono text-xs text-foreground/80 bg-muted/20 p-3 rounded">
                <li>{leader.brand}: ({Number(leader.revenue_share).toFixed(1)}%)² = {leaderContribution.toFixed(1)}</li>
                {second && <li>{second.brand}: ({Number(second.revenue_share).toFixed(1)}%)² = {secondContribution.toFixed(1)}</li>}
                <li className="text-muted-foreground italic">...plus remaining brands</li>
                <li className="pt-1 mt-1 border-t border-border/50 text-primary font-bold">Total HHI = {hhi.toLocaleString()}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Section 3: What This Means */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2 border-b border-border/50"><h4 className="font-bold text-foreground">What This Means (HHI Scale)</h4></div>
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
                <tr className={`border-b border-border/10 ${hhi < 1500 ? 'bg-primary/10 font-medium' : ''}`}>
                  <td className="p-3">0 - 1,500</td>
                  <td className="p-3 text-emerald-500">Highly Fragmented</td>
                  <td className="p-3">Intense. Many small players. Easy entry.</td>
                </tr>
                <tr className={`border-b border-border/10 ${hhi >= 1500 && hhi <= 2500 ? 'bg-primary/10 font-medium' : ''}`}>
                  <td className="p-3">1,500 - 2,500</td>
                  <td className="p-3 text-amber-500">Moderately Concentrated</td>
                  <td className="p-3">Moderate. A few established leaders emerging.</td>
                </tr>
                <tr className={`border-b border-border/10 ${hhi > 2500 && hhi <= 4000 ? 'bg-primary/10 font-medium' : ''}`}>
                  <td className="p-3">2,500 - 4,000</td>
                  <td className="p-3 text-orange-500">Highly Concentrated</td>
                  <td className="p-3">Low. Dominated by a few major players. Hard entry.</td>
                </tr>
                <tr className={`${hhi > 4000 ? 'bg-primary/10 font-medium' : ''}`}>
                  <td className="p-3">4,000+</td>
                  <td className="p-3 text-danger">Monopolistic</td>
                  <td className="p-3">Minimal. One or two giants control the market.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4 & 5: What We Found & Interpretation */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-border/50 rounded-lg p-4 bg-card">
            <h4 className="font-bold text-foreground mb-3 pb-2 border-b border-border/50">What We Found</h4>
            <ul className="space-y-2">
              <li className="flex justify-between"><span className="text-muted-foreground">Market Leader Share:</span> <span className="font-bold">{Number(leader.revenue_share).toFixed(1)}%</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Top 5 Brands Share:</span> <span className="font-bold">{top5Share.toFixed(1)}%</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Active Brands:</span> <span className="font-bold">{totalBrands.toLocaleString()}</span></li>
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

        {/* Section 6: Final Conclusion */}
        <div className="bg-muted/20 p-4 rounded-lg border border-border/50 border-l-4 border-l-primary">
          <h4 className="font-bold text-primary mb-1">Final Conclusion</h4>
          <p className="text-foreground/90 font-medium leading-relaxed">{execSummary}</p>
        </div>
      </div>
    </Modal>
  );
}

export default function MarketConcentration() {
  const [isHHIOpen, setIsHHIOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-concentration'],
    queryFn: () => api.getMarketConcentration(50),
  });

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10 theme-structure">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Market Structure Unavailable</h2>
          <p className="text-danger/80">{getEngineErrorMessage(data, 'Requires BlackBox with Brand and Revenue columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const structure = data.data?.results?.market_structure || {};
  const topBrands: BrandRanking[] = structure.brand_rankings || [];
  const landscape: CompetitiveSegment[] = structure.competitive_landscape || [];
  const hhi: number = data.data?.results?.hhi_score ?? 0;
  const totalRevenue: number = structure.total_market_revenue ?? 0;
  const totalUnits: number = structure.total_units_sold ?? 0;
  const totalBrands: number = structure.active_brand_count ?? 0;
  const top1Share = Number(structure.top_1_share ?? 0);
  const top3Share = Number(structure.top_3_share ?? 0);
  const top5Share = Number(structure.top_5_share ?? 0);
  const concentrationType: string = structure.concentration_type ?? 'N/A';
  const productCountSource: string = structure.product_count_source ?? 'N/A';
  const totalProducts: number = structure.total_products ?? 0;
  const top10Share = topBrands.slice(0, 10).reduce((s: number, b) => s + (b.revenue_share ?? 0), 0);
  const leader = topBrands[0] || null;

  const top10Brands = topBrands.slice(0, 10);
  
  let pricingInsight = '';
  if (topBrands.length > 0) {
    const revLeader = topBrands[0];
    const unitLeader = [...topBrands].sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0))[0];
    
    if (revLeader.brand === unitLeader.brand) {
      pricingInsight = `${revLeader.brand} dominates the market, leading in both Revenue and Volume.`;
    } else {
      const revLeaderUnitRank = [...topBrands].sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0)).findIndex(b => b.brand === revLeader.brand) + 1;
      const unitLeaderRevRank = topBrands.findIndex(b => b.brand === unitLeader.brand) + 1;
      
      pricingInsight = `${revLeader.brand} leads in revenue but ranks #${revLeaderUnitRank} in units sold, indicating a premium pricing strategy (ASP: ${formatCurrency(revLeader.asp || 0)}). Meanwhile, ${unitLeader.brand} drives the most volume (${unitLeader.units_sold?.toLocaleString()} units) but ranks #${unitLeaderRevRank} in revenue due to mass-market pricing (ASP: ${formatCurrency(unitLeader.asp || 0)}).`;
    }
  }

  const othersRevenue = topBrands.slice(10).reduce((s: number, b) => s + (b.parent_revenue ?? 0), 0);
  const othersShare = topBrands.slice(10).reduce((s: number, b) => s + (b.revenue_share ?? 0), 0);
  const barData = [
    ...top10Brands.map((b) => ({
      ...b,
      brand:    b.brand?.length > 20 ? b.brand.slice(0, 18) + '…' : b.brand,
      fullBrand: b.brand,
    })),
    ...(othersShare > 0 ? [{
      rank: 99, brand: 'Others', fullBrand: 'Others (aggregated)',
      parent_revenue: othersRevenue,
      revenue_share: parseFloat(othersShare.toFixed(2)),
      segment: 'Long Tail',
    }] : []),
  ];

  const columns: ColumnDef<BrandRanking>[] = [
    {
      header: 'Rank',
      cell: (row) => (
        <span className={cn('font-bold text-sm', row.rank === 1 ? 'text-primary' : row.rank <= 3 ? 'text-primary/80' : 'text-muted-foreground')}>
          {row.rank === 1 ? <Crown className="w-4 h-4 inline mr-1 -mt-1" /> : ''}{row.rank}
        </span>
      ),
    },
    { header: 'Brand', cell: (row) => <span className="font-bold text-foreground/90">{row.brand}</span> },
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
    { header: 'ASP', cell: (row) => <span className="text-sm font-medium text-primary">{formatCurrency(row.asp || 0)}</span> },
    {
      header: 'Products',
      cell: (row) => <span className="text-sm">{row.product_count.toLocaleString()}</span>,
    },
    { header: 'Segment', cell: (row) => <Badge variant="outline" className={segmentBadgeClass(row.segment)}>{row.segment}</Badge> },
  ];

  const narrative = `The market is valued at ${formatCurrency(totalRevenue)} across ${totalBrands.toLocaleString()} active brands. ${leader?.brand || 'The market leader'} commands ${top1Share.toFixed(1)}% of total revenue, generating a market concentration (HHI) score of ${hhi.toLocaleString()} (${concentrationType}). ${pricingInsight}`;

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      <PageHeader 
        badge="Ownership & Dominance"
        title="Market Structure"
        description="Revenue-based market structure calculated from Parent Level Revenue."
        kpiSummary={
          <div className="mt-4 flex gap-6 border-t border-border/40 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Market Scale</p>
              <p className="text-xl font-bold font-mono text-primary">{formatCurrency(totalRevenue)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Volume</p>
              <p className="text-xl font-bold font-mono text-foreground">{totalUnits.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Active Brands</p>
              <p className="text-xl font-bold font-mono text-foreground">{totalBrands.toLocaleString()}</p>
            </div>
          </div>
        }
      />

      <ExecutiveNarrative content={narrative} />

      <PageSection title="1. Dominance & Concentration" icon={Crown}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-card border-border/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5"><Crown className="w-64 h-64 text-primary" /></div>
            <CardContent className="p-8 relative z-10 flex flex-col h-full justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Market Leader Spotlight</p>
                <h2 className="text-4xl font-black mb-1">{leader?.brand || 'N/A'}</h2>
                <p className="text-base text-foreground/80 font-medium mb-6">
                  Commands <strong className="text-primary">{top1Share.toFixed(1)}%</strong> of total market revenue.
                </p>
                <div className="grid grid-cols-3 gap-4 border-t border-border/40 pt-6">
                  <KPICard label="Revenue" value={formatCurrency(leader?.parent_revenue || 0)} />
                  <KPICard label="Units Sold" value={leader?.units_sold?.toLocaleString() || '0'} />
                  <KPICard label="ASP" value={formatCurrency(leader?.asp || 0)} />
                </div>
              </div>
            </CardContent>
          </Card>

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

      <PageSection title="2. Competitive Hierarchy" icon={Layers}>
        <Card className="p-8 bg-card border-border/40">
          <ControlBar top1={top1Share} top3={top3Share} top5={top5Share} top10={top10Share} />
        </Card>
      </PageSection>

      <PageSection title="3. Revenue Distribution by Brand" icon={BarChart}>
        <ChartContainer 
          title="Revenue Control"
          yAxisLabel="Brand"
          xAxisLabel="Revenue Share (%)"
          businessExplanation="Maps market share consolidation. If the blue bars fall off steeply after the top 2-3, the market is monopolistic. A smooth curve indicates healthy competition."
        >
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
              <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="brand" width={140} tick={{ fill: 'hsl(var(--foreground))', fontWeight: 500 }} axisLine={false} tickLine={false} />
              <Tooltip content={<BarTip />} cursor={{ fill: 'hsl(var(--muted)/0.3)' }} />
              <Bar dataKey="revenue_share" radius={[0, 4, 4, 0]} maxBarSize={32}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.rank === 1 ? 'hsl(var(--primary))' : entry.rank <= 3 ? 'hsl(var(--primary)/0.8)' : entry.rank <= 5 ? 'hsl(var(--primary)/0.6)' : entry.rank <= 10 ? 'hsl(var(--primary)/0.4)' : 'hsl(var(--muted))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </PageSection>

      <PageSection title="4. Competitive Landscape by Revenue" icon={Network}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {landscape.map((seg) => (
            <Card key={seg.segment} className="bg-card border-border/40">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className={segmentBadgeClass(seg.segment)}>{seg.segment}</Badge>
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
        <DataTable 
          title="Brand Revenue Ranking"
          description="Sorted by Parent Level Revenue with share and per-product efficiency."
          columns={columns} 
          data={topBrands} 
          keyExtractor={(r) => r.brand}
        />
      </PageSection>

      <HHIModal 
        isOpen={isHHIOpen} 
        onClose={() => setIsHHIOpen(false)} 
        hhi={hhi} 
        topBrands={topBrands} 
        top5Share={top5Share} 
        totalBrands={totalBrands} 
      />
    </div>
  );
}
