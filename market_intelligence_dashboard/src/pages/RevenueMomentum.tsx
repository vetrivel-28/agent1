import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

export default function RevenueMomentum() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['revenue-momentum'],
    queryFn: () => api.getRevenueMomentum(50),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Growth Velocity Unavailable</h2>
          <p className="text-danger/80 max-w-lg">
            {getEngineErrorMessage(data, 'Requires BlackBox with revenue, sales, review, and rank data.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results || {};

  // Helper: normalize brand names (trim, collapse spaces, remove repeated words, title case)
  const normalizeBrand = (raw: string) => {
    if (!raw) return '';
    let s = String(raw).trim();
    // collapse multiple spaces
    s = s.replace(/\s+/g, ' ');
    // remove repeated consecutive words (e.g. "KIPLING KIPLING")
    s = s
      .split(' ')
      .filter((v, i, arr) => !(i > 0 && v.toLowerCase() === arr[i - 1].toLowerCase()))
      .join(' ');
    // title case: capitalize first letter of each word, lower the rest
    s = s
      .toLowerCase()
      .split(' ')
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
    return s;
  };

  const rawBrands = results.all_brands_momentum || [];
  const brandMap = new Map<string, any>();
  rawBrands.forEach((b: any) => {
    const name = normalizeBrand(b.brand || '');
    if (!name) return;
    const existing = brandMap.get(name);
    if (!existing) {
      brandMap.set(name, { ...b, brand: name });
      return;
    }
    // keep the record with higher momentum_score, but preserve best component scores
    const choose = (a: any, c: any) => ( (c ?? 0) > (a ?? 0) ? c : a );
    const merged = { ...existing };
    merged.momentum_score = Math.max(existing.momentum_score ?? 0, b.momentum_score ?? 0);
    merged.sales_velocity_score = choose(existing.sales_velocity_score, b.sales_velocity_score);
    merged.review_velocity_score = choose(existing.review_velocity_score, b.review_velocity_score);
    merged.bsr_momentum_score = choose(existing.bsr_momentum_score, b.bsr_momentum_score);
    merged.revenue_strength_score = choose(existing.revenue_strength_score, b.revenue_strength_score);
    merged.total_revenue = Math.max(existing.total_revenue ?? 0, b.total_revenue ?? 0);
    merged.momentum_category = merged.momentum_category || b.momentum_category || existing.momentum_category;
    brandMap.set(name, merged);
  });

  const uniqueBrands = Array.from(brandMap.values());

  // Compute primary driver and market position for every brand
  uniqueBrands.forEach((b: any) => {
    const sales = Number(b.sales_velocity_score ?? 0);
    const review = Number(b.review_velocity_score ?? 0);
    const bsr = Number(b.bsr_momentum_score ?? 0);
    const rev = Number(b.revenue_strength_score ?? 0);
    // determine primary driver
    const drivers = [
      { key: 'Sales Velocity', val: sales },
      { key: 'Review Velocity', val: review },
      { key: 'BSR Momentum', val: bsr },
      { key: 'Revenue Strength', val: rev },
    ];
    drivers.sort((x, y) => y.val - x.val);
    b.primary_driver = drivers[0].key;
    b.weakest_driver = drivers[drivers.length - 1].key;
    // determine market position
    const momentum = Number(b.momentum_score ?? 0);
    if (b.revenue_strength_score >= 60 && momentum >= 60) b.market_position = 'Market Leader';
    else if (b.revenue_strength_score < 60 && momentum >= 60) b.market_position = 'Emerging Challenger';
    else if (b.revenue_strength_score >= 60 && momentum < 60) b.market_position = 'Mature Incumbent';
    else b.market_position = 'Weak Player';
  });

  // Rebuild segments from normalized brands to ensure counts reconcile
  const marketLeaders = uniqueBrands.filter((b: any) => b.market_position === 'Market Leader');
  const emerging = uniqueBrands.filter((b: any) => b.market_position === 'Emerging Challenger');
  const incumbents = uniqueBrands.filter((b: any) => b.market_position === 'Mature Incumbent');
  const weak = uniqueBrands.filter((b: any) => b.market_position === 'Weak Player');

  const computedSegments = [
    {
      segment_label: 'Market Leaders',
      brand_count: marketLeaders.length,
      avg_momentum_score: marketLeaders.length ? marketLeaders.reduce((s: any, x: any) => s + (x.momentum_score ?? 0), 0) / marketLeaders.length : 0,
      top_brands: marketLeaders.sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0)).slice(0, 3).map((x: any) => x.brand),
    },
    {
      segment_label: 'Emerging Challengers',
      brand_count: emerging.length,
      avg_momentum_score: emerging.length ? emerging.reduce((s: any, x: any) => s + (x.momentum_score ?? 0), 0) / emerging.length : 0,
      top_brands: emerging.sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0)).slice(0, 3).map((x: any) => x.brand),
    },
    {
      segment_label: 'Mature Incumbents',
      brand_count: incumbents.length,
      avg_momentum_score: incumbents.length ? incumbents.reduce((s: any, x: any) => s + (x.momentum_score ?? 0), 0) / incumbents.length : 0,
      top_brands: incumbents.sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0)).slice(0, 3).map((x: any) => x.brand),
    },
    {
      segment_label: 'Weak Players',
      brand_count: weak.length,
      avg_momentum_score: weak.length ? weak.reduce((s: any, x: any) => s + (x.momentum_score ?? 0), 0) / weak.length : 0,
      top_brands: weak.sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0)).slice(0, 3).map((x: any) => x.brand),
    },
  ];

  // Primary lists: risks and opportunities computed from normalized data
  const computedRisks = uniqueBrands.filter((b: any) => (b.revenue_strength_score ?? 0) >= 60 && (b.momentum_score ?? 0) < 60);
  const computedOpportunities = uniqueBrands
    .filter((b: any) => (b.momentum_score ?? 0) > 75 && (b.revenue_strength_score ?? 0) < 40)
    .sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))
    .slice(0, 5);

  // Market momentum driver: which component has the highest average contribution
  const comps = ['sales_velocity_score', 'review_velocity_score', 'bsr_momentum_score', 'revenue_strength_score'];
  const compAverages: Record<string, number> = {};
  comps.forEach((k) => {
    compAverages[k] = uniqueBrands.length ? uniqueBrands.reduce((s: any, b: any) => s + (Number(b[k] ?? 0)), 0) / uniqueBrands.length : 0;
  });
  const compLabel = (k: string) => {
    if (k === 'sales_velocity_score') return 'Sales Velocity';
    if (k === 'review_velocity_score') return 'Review Velocity';
    if (k === 'bsr_momentum_score') return 'BSR Momentum';
    return 'Revenue Strength';
  };
  const marketDriverKey = Object.keys(compAverages).sort((a, b) => compAverages[b] - compAverages[a])[0];
  const marketMomentumDriver = compLabel(marketDriverKey || 'sales_velocity_score');

  const averageMarketMomentum = results.market_mean_score ?? (uniqueBrands.length ? uniqueBrands.reduce((s: any, b: any) => s + (b.momentum_score ?? 0), 0) / uniqueBrands.length : 0);
  const highestMomentumBrand = uniqueBrands.sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))[0] || {};
  const highestReviewVelocityBrand = uniqueBrands.sort((a: any, b: any) => (b.review_velocity_score ?? 0) - (a.review_velocity_score ?? 0))[0] || {};

  const topBrandColumns: Column<any>[] = [
    { header: 'Rank', accessorKey: 'rank', cell: (r) => r.rank },
    {
      header: 'Brand',
      accessorKey: 'brand',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <div className="text-lg">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ''}</div>
          <div className="font-semibold">{r.brand}</div>
        </div>
      ),
    },
    { header: 'Momentum Score', accessorKey: 'momentum_score', cell: (r) => (Number(r.momentum_score) || 0).toFixed(1) },
    {
      header: 'Category',
      accessorKey: 'momentum_category',
      cell: (r) => <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-800 text-sm">{r.momentum_category || 'Unknown'}</span>,
    },
    {
      header: 'Primary Driver',
      accessorKey: 'primary_driver',
      cell: (r) => {
        const drv = r.primary_driver || 'Revenue Strength';
        const map: Record<string, string> = {
          'Sales Velocity': '🔥',
          'Review Velocity': '⭐',
          'BSR Momentum': '📈',
          'Revenue Strength': '💰',
        };
        return <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 text-sm">{map[drv] ?? ''} {drv}</span>;
      },
    },
    {
      header: 'Market Position',
      accessorKey: 'market_position',
      cell: (r) => {
        const pos = r.market_position || 'Weak Player';
        const map: Record<string, string> = {
          'Market Leader': '🏆',
          'Emerging Challenger': '⚡',
          'Mature Incumbent': '🛡',
          'Weak Player': '📉',
        };
        const color = pos === 'Market Leader' ? 'bg-green-50 text-green-800' : pos === 'Emerging Challenger' ? 'bg-blue-50 text-blue-800' : pos === 'Mature Incumbent' ? 'bg-orange-50 text-orange-800' : 'bg-slate-50 text-slate-800';
        return <span className={`px-2 py-1 rounded-full text-sm ${color}`}>{map[pos] ?? ''} {pos}</span>;
      },
    },
  ];

  const riskColumns: Column<any>[] = [
    { header: 'Brand', accessorKey: 'brand', cell: (r) => <div className="font-semibold">{r.brand}</div> },
    {
      header: 'Revenue Strength',
      accessorKey: 'revenue_strength_score',
      cell: (r) => {
        const val = Number(r.revenue_strength_score) || 0;
        const cls = val >= 80 ? 'bg-red-700 text-white' : val >= 60 ? 'bg-red-400 text-white' : 'bg-red-100 text-red-800';
        return <span className={`px-2 py-1 rounded-full text-sm ${cls}`}>{val.toFixed(1)}</span>;
      },
    },
    { header: 'Momentum Score', accessorKey: 'momentum_score', cell: (r) => {
        const val = Number(r.momentum_score) || 0;
        const cls = val < 40 ? 'text-red-600' : val < 60 ? 'text-yellow-600' : 'text-green-600';
        return <span className={`${cls}`}>{val.toFixed(1)}</span>;
      } },
    { header: 'Primary Weakness', accessorKey: 'weakest_driver', cell: (r) => <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-800 text-sm">📉 {r.weakest_driver || 'Unknown'}</span> },
  ];


  const segmentCards = computedSegments.map((segment: any) => (
    (() => {
      const label = segment.segment_label;
      let classes = 'rounded-3xl p-5 shadow-sm';
      let emoji = '';
      if (label === 'Market Leaders') {
        classes += ' bg-green-50 border border-green-200';
        emoji = '🏆 ';
      } else if (label === 'Emerging Challengers') {
        classes += ' bg-blue-50 border border-blue-200';
        emoji = '⚡ ';
      } else if (label === 'Mature Incumbents') {
        classes += ' bg-orange-50 border border-orange-200';
        emoji = '🛡 ';
      } else {
        classes += ' bg-slate-50 border border-slate-200';
        emoji = '📉 ';
      }
      return (
        <div key={segment.segment_label} className={classes}>
          <div className="text-sm font-medium text-slate-500">{emoji}{segment.segment_label}</div>
          <div className="mt-3 text-3xl font-bold">{segment.brand_count}</div>
          <div className="mt-1 text-sm text-muted-foreground">Average Momentum: {segment.avg_momentum_score?.toFixed(1) ?? '0.0'}</div>
          <div className="mt-4 text-sm text-slate-700">Top Brand: {segment.top_brands?.[0] ?? '—'}</div>
        </div>
      );
    })()
  ));

  const topTenBrands = uniqueBrands
    .slice()
    .sort((a: any, b: any) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))
    .slice(0, 10)
    .map((brand: any, index: number) => ({
      rank: index + 1,
      brand: brand.brand,
      momentum_score: Number(brand.momentum_score ?? 0),
      momentum_category: brand.momentum_category || '—',
      primary_driver: brand.primary_driver || 'Revenue Strength',
      market_position: brand.market_position || 'Weak Player',
      revenue_strength_score: Number(brand.revenue_strength_score ?? 0),
    }));

  // expose computed lists for rendering
  const computedOpportunitiesDisplay = computedOpportunities;
  const computedRisksDisplay = computedRisks;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Revenue Momentum</h1>
        <p className="text-muted-foreground mt-1">
          A business intelligence view of which brands are gaining traction, why, and where market risk exists.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <CardTitle>Market Average</CardTitle>
                <CardDescription>Average momentum score for the total market.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="text-4xl font-bold text-blue-800">{averageMarketMomentum.toFixed(1)}</CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="text-2xl">🚀</div>
              <div>
                <CardTitle>Highest Momentum Brand</CardTitle>
                <CardDescription>Growth Leader</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-green-800">{highestMomentumBrand.brand || '—'}</div>
            <div className="text-3xl font-bold mt-2 text-green-900">
              {highestMomentumBrand.momentum_score != null ? highestMomentumBrand.momentum_score.toFixed(1) : '—'}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="text-2xl">⭐</div>
              <div>
                <CardTitle>Highest Review Velocity</CardTitle>
                <CardDescription>Customer Traction Leader</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-purple-800">{highestReviewVelocityBrand.brand || '—'}</div>
            <div className="text-3xl font-bold mt-2 text-purple-900">
              {highestReviewVelocityBrand.review_velocity_score != null ? highestReviewVelocityBrand.review_velocity_score.toFixed(1) : '—'}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="text-2xl">🔥</div>
              <div>
                <CardTitle>Market Momentum Driver</CardTitle>
                <CardDescription>Primary Growth Engine</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-orange-800">{marketMomentumDriver}</div>
            <div className="text-sm text-muted-foreground mt-2">
              Momentum distribution: {results.momentum_distribution_label || 'undetermined'}. Top 10 control {results.momentum_concentration?.toFixed(1) ?? '0.0'}%.
            </div>
          </CardContent>
        </Card>

        <Card className="bg-teal-50 border-teal-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="text-2xl">⚡</div>
              <div>
                <CardTitle>Emerging Challengers</CardTitle>
                <CardDescription>Rising Competitive Threats</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-teal-800">{emerging.length}</div>
            <div className="text-sm text-muted-foreground mt-2">Brands in Breakout or Hyper Growth.</div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="text-2xl">⚠</div>
              <div>
                <CardTitle>Incumbents Losing Momentum</CardTitle>
                <CardDescription>Brands Requiring Attention</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-red-800">{incumbents.length}</div>
            <div className="text-sm text-muted-foreground mt-2">High revenue strength with weak momentum.</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6">
        <CardHeader>
          <CardTitle>Market Momentum Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-700">
            Momentum remains {results.momentum_distribution_label || 'broadly distributed'} across the category. {highestMomentumBrand.brand || 'A leader'} currently leads momentum with a score of {Number(highestMomentumBrand.momentum_score ?? averageMarketMomentum).toFixed(1)}. {computedSegments.find(s=>s.segment_label==='Emerging Challengers')?.brand_count ?? 0} emerging challengers are gaining traction while {computedSegments.find(s=>s.segment_label==='Mature Incumbents')?.brand_count ?? 0} incumbents show weakening momentum signals. Primary growth driver across the market is {marketMomentumDriver}.
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Momentum Segmentation</CardTitle>
            <CardDescription>Business segments by revenue strength and momentum.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">{segmentCards}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Momentum Brands</CardTitle>
            <CardDescription>Ranked by momentum score and business position.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={topBrandColumns} data={topTenBrands} pageSize={10} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Momentum Risks</CardTitle>
            <CardDescription>Weakened incumbents with strong revenue and low momentum.</CardDescription>
          </CardHeader>
          <CardContent>
            {computedRisksDisplay.length === 0 ? (
              <div className="text-sm text-slate-700">No major momentum risks detected. All high-revenue brands currently maintain healthy momentum signals.</div>
            ) : (
              <DataTable columns={riskColumns} data={computedRisksDisplay} pageSize={10} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Momentum Opportunities</CardTitle>
            <CardDescription>Top challengers with high momentum but low revenue strength.</CardDescription>
          </CardHeader>
          <CardContent>
            {computedOpportunitiesDisplay.length === 0 ? (
              <div className="text-sm text-slate-700">No high-momentum low-revenue opportunities found at this threshold.</div>
            ) : (
              <DataTable
                columns={[
                  { header: 'Brand', accessorKey: 'brand', cell: (r) => <div className="font-semibold">{r.brand}</div> },
                  { header: 'Momentum Score', accessorKey: 'momentum_score', cell: (r) => (r.momentum_score ?? 0).toFixed(1) },
                  { header: 'Revenue Strength', accessorKey: 'revenue_strength_score', cell: (r) => (r.revenue_strength_score ?? 0).toFixed(1) },
                  { header: 'Primary Driver', accessorKey: 'primary_driver', cell: (r) => r.primary_driver || 'Revenue Strength' },
                  { header: 'Market Position', accessorKey: 'market_position', cell: (r) => r.market_position || 'Weak Player' },
                ]}
                data={computedOpportunitiesDisplay}
                pageSize={5}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="text-2xl">🚀</div>
              <div>
                <CardTitle>Key Finding</CardTitle>
                <CardDescription>Top momentum leader</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{highestMomentumBrand.brand || '—'}</div>
            <div className="text-2xl font-bold">{Number(highestMomentumBrand.momentum_score ?? averageMarketMomentum).toFixed(1)}</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="text-2xl">⚡</div>
              <div>
                <CardTitle>Challenger Alert</CardTitle>
                <CardDescription>High momentum, low revenue</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {computedOpportunitiesDisplay.length > 0 ? (
              <>
                <div className="font-semibold">{computedOpportunitiesDisplay[0].brand}</div>
                <div className="text-2xl font-bold">{Number(computedOpportunitiesDisplay[0].momentum_score).toFixed(1)}</div>
              </>
            ) : (
              <div className="text-sm text-slate-700">No clear emerging challenger identified at this time.</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="text-2xl">⚠</div>
              <div>
                <CardTitle>Incumbent Risk</CardTitle>
                <CardDescription>High revenue, weak momentum</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {computedRisksDisplay.length > 0 ? (
              <>
                <div className="font-semibold">{computedRisksDisplay[0].brand}</div>
                <div className="text-2xl font-bold">{Number(computedRisksDisplay[0].momentum_score).toFixed(1)}</div>
              </>
            ) : (
              <div className="text-sm text-slate-700">No major incumbent momentum deterioration detected.</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-50 border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="text-2xl">📈</div>
              <div>
                <CardTitle>Market Direction</CardTitle>
                <CardDescription>Category momentum</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{averageMarketMomentum.toFixed(1)}</div>
            <div className="text-sm text-muted-foreground">{averageMarketMomentum >= 60 ? 'Increasing' : averageMarketMomentum < 40 ? 'Decreasing' : 'Stable'}</div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="text-2xl">🔥</div>
              <div>
                <CardTitle>Growth Driver</CardTitle>
                <CardDescription>Primary contributor across category</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{marketMomentumDriver}</div>
            <div className="text-sm text-muted-foreground">Component contribution highest across brands.</div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
