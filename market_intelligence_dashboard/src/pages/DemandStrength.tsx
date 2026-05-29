import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency, formatNumber } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, BarChart, Bar } from 'recharts';

const getSearchVolume = (row: any) => {
  const val = row.search_volume ?? row.searchVolume ?? row["Search Volume"] ?? row.searchVolumeRaw ?? row.keyword_search_volume;
  if (val === null || val === undefined || val === '' || val === '-' || Number.isNaN(Number(val))) return null;
  return Number(val);
};

const getKeywordSales = (row: any) => {
  const val = row.keyword_sales ?? row.keywordSales ?? row["Keyword Sales"] ?? row.sales ?? row.keyword_sales_count;
  if (val === null || val === undefined || val === '' || val === '-' || Number.isNaN(Number(val))) return null;
  return Number(val);
};

const getDemandLabel = (score: number) => {
  if (score < 20) return "Very Low Demand";
  if (score < 40) return "Low Demand";
  if (score < 60) return "Moderate Demand";
  if (score < 80) return "Strong Demand";
  return "Very Strong Demand";
};

const formatScoreValue = (value: any) => {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return 'Not available';
  }
  return Number(value).toFixed(1);
};

const getDemandExplanation = (components: {
  directNiche: number | null;
  broaderCategory: number | null;
  searchVolume: number | null;
  keywordSales: number | null;
  productSales: number | null;
  revenue: number | null;
  overallScore: number;
}) => {
  const {
    directNiche,
    broaderCategory,
    overallScore,
  } = components;

  if (directNiche != null && broaderCategory != null) {
    if (broaderCategory >= 50 && directNiche < 30) {
      return (
        'Broader category demand is stronger than direct niche demand. ' +
        'The final Market Demand score is lowered because this analysis weights niche-specific search signals more heavily than broad category interest.'
      );
    }
    if (directNiche >= 50 && broaderCategory < 30) {
      return (
        'Direct niche demand is the strongest signal, while broader category demand is weaker. ' +
        'This suggests focused interest in a narrower niche within the broader market.'
      );
    }
    if (directNiche < 30 && broaderCategory < 30) {
      return (
        'Both direct niche and broader category search scores are weak, which is driving the low overall demand score.'
      );
    }
    if (overallScore >= 70) {
      return 'Demand is strong across the available signals, with both niche and broader search demand contributing positively.';
    }
    if (overallScore >= 50) {
      return 'Demand is moderate. Some demand components are healthy, while others are closer to the midpoint.';
    }
  }

  return (
    'Demand is calculated from available normalized inputs. Niche-specific keyword split data is not fully available for a deeper direct/broader comparison.'
  );
};

export default function DemandStrength() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['demand-strength'],
    queryFn: () => api.getDemandStrength(50),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data || data.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
          <p className="text-danger/80">Make sure BlackBox and Magnet datasets are uploaded.</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const directNiche = results.direct_niche_keywords || [];
  const broaderCategory = results.broader_category_keywords || [];
  const relatedKeywords = results.related_keywords || [];
  const keywords = results.top_demand_keywords || [];
  const products = results.top_demand_products || [];
  const scoreComponents = results.score_components || {};

  const overallScore = results.overall_demand_score ?? 0;
  const demandLabel = getDemandLabel(overallScore);

  const scoreChartData = [
    { name: 'Search Volume', value: scoreComponents.search_volume_score ?? 0 },
    { name: 'Keyword Sales', value: scoreComponents.keyword_sales_score ?? 0 },
    { name: 'Product Sales', value: scoreComponents.product_sales_score ?? 0 },
    { name: 'Revenue', value: scoreComponents.revenue_score ?? 0 },
  ];

  const keywordColumns: Column<any>[] = [
    { header: "Keyword", accessorKey: "keyword", cell: (r) => r.keyword || '—' },
    { header: "Search Volume", accessorKey: "search_volume", cell: (r) => { const v = getSearchVolume(r); return v !== null ? formatNumber(v) : '—'; } },
    { header: "Keyword Sales", accessorKey: "keyword_sales", cell: (r) => { const v = getKeywordSales(r); return v !== null ? formatNumber(v) : '—'; } },
  ];

  const productColumns: Column<any>[] = [
    { header: "Title", accessorKey: "title", cell: (r) => <div className="max-w-xs truncate" title={r.title}>{r.title || '—'}</div> },
    { header: "ASIN", accessorKey: "asin", cell: (r) => r.asin || '—' },
    { header: "Revenue", accessorKey: "revenue", cell: (r) => r.revenue != null ? formatCurrency(r.revenue) : '—' },
    { header: "Sales", accessorKey: "ASIN Sales", cell: (r) => r["ASIN Sales"] != null ? formatNumber(r["ASIN Sales"]) : '—' },
  ];



  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Demand Strength</h1>
        <p className="text-muted-foreground mt-1">
          Measures overall market demand health by combining search volume, product sales, and revenue.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 p-6">
          <CardHeader>
            <CardTitle>Market Demand</CardTitle>
            <CardDescription>Overall demand score from normalized inputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-5xl font-bold">{overallScore.toFixed(1)} <span className="text-xl text-muted-foreground">/ 100</span></div>
            <div className="text-lg font-semibold text-muted-foreground">{demandLabel}</div>
            <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Direct niche search score:</span>{' '}
                {formatScoreValue(scoreComponents.direct_niche_search_score ?? null)}
              </div>
              <div>
                <span className="font-medium">Broader category search score:</span>{' '}
                {formatScoreValue(scoreComponents.broader_category_search_score ?? null)}
              </div>
              <div>
                <span className="font-medium">Keyword sales score:</span>{' '}
                {formatScoreValue(scoreComponents.keyword_sales_score ?? null)}
              </div>
              <div>
                <span className="font-medium">Product sales score:</span>{' '}
                {formatScoreValue(scoreComponents.product_sales_score ?? null)}
              </div>
              <div>
                <span className="font-medium">Revenue score:</span>{' '}
                {formatScoreValue(scoreComponents.revenue_score ?? null)}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {getDemandExplanation({
                directNiche: scoreComponents.direct_niche_search_score ?? null,
                broaderCategory: scoreComponents.broader_category_search_score ?? null,
                searchVolume: scoreComponents.search_volume_score ?? null,
                keywordSales: scoreComponents.keyword_sales_score ?? null,
                productSales: scoreComponents.product_sales_score ?? null,
                revenue: scoreComponents.revenue_score ?? null,
                overallScore,
              })}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 p-6">
          <CardHeader>
            <CardTitle>Demand Signal Breakdown</CardTitle>
            <CardDescription>Normalized score contributions for each demand component.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreChartData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(val: any) => Number(val).toFixed(1)} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {(directNiche.length > 0 || broaderCategory.length > 0 || relatedKeywords.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Direct Niche Demand Keywords</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={keywordColumns} data={directNiche} pageSize={5} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Broader Category Demand Keywords</CardTitle>
              <CardDescription>
                Broader category keywords represent general category demand and should not be interpreted as niche-specific demand.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={keywordColumns} data={broaderCategory} pageSize={5} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Related Demand Keywords</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={keywordColumns} data={relatedKeywords} pageSize={5} />
            </CardContent>
          </Card>
        </div>
      )}

      {keywords.length > 0 && directNiche.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Demand Keywords</CardTitle>
            <CardDescription>Highest volume search terms (upload keyword classification for niche-specific splits).</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={keywordColumns} data={keywords} pageSize={5} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top Demand Products</CardTitle>
          <CardDescription>Products driving the most sales and revenue in this category.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={productColumns} data={products} pageSize={10} />
        </CardContent>
      </Card>

    </motion.div>
  );
}
