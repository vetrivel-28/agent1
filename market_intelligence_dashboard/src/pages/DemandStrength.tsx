import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Loader2, Target } from 'lucide-react';
import { motion } from 'framer-motion';

async function fetchDemand() {
  const snap = await api.getAnalysisSnapshot();
  if (snap?.engines?.demand && isEngineOk(snap.engines.demand)) {
    return snap.engines.demand;
  }
  return api.getDemandStrength(50);
}

export default function DemandStrength() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['demand-intelligence'],
    queryFn: fetchDemand,
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
          <h2 className="text-xl font-bold text-danger mb-2">Demand Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-md">
            {getEngineErrorMessage(data, 'Upload Magnet (keywords) and/or BlackBox (products) with Search Volume columns.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const results = data!.results || {};
  const topKw = results.top_demand_keyword || {};
  const keywords = results.top_demand_keywords || [];
  const products = results.top_demand_products || [];

  const keywordColumns: Column<Record<string, unknown>>[] = [
    { header: 'Keyword', accessorKey: 'keyword', cell: (r) => String(r.keyword || '—') },
    { header: 'Search Volume', accessorKey: 'search_volume', cell: (r) => formatNumber(r.search_volume as number) },
    { header: 'Demand %', accessorKey: 'demand_contribution', cell: (r) => r.demand_contribution != null ? `${Number(r.demand_contribution).toFixed(1)}%` : '—' },
  ];

  const productColumns: Column<Record<string, unknown>>[] = [
    { header: 'Title', accessorKey: 'title', cell: (r) => <div className="max-w-xs truncate" title={String(r.title)}>{String(r.title || '—')}</div> },
    { header: 'ASIN', accessorKey: 'asin', cell: (r) => String(r.asin || '—') },
    { header: 'Revenue', accessorKey: 'revenue', cell: (r) => r.revenue != null ? formatCurrency(r.revenue as number) : '—' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Demand Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Keyword-led demand signals — which search terms drive the most category volume and revenue opportunity.
        </p>
      </div>

      {topKw.keyword && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Top Demand Keyword
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-4">&quot;{topKw.keyword}&quot;</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Search Volume</p>
                <p className="font-semibold text-lg">{formatNumber(topKw.search_volume as number)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Demand Contribution</p>
                <p className="font-semibold text-lg">{topKw.demand_contribution}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Opportunity Level</p>
                <Badge variant="outline" className="mt-1">{topKw.opportunity_level || topKw.revenue_opportunity}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Revenue Opportunity</p>
                <p className="font-semibold">{topKw.revenue_opportunity || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top Demand Keywords</CardTitle>
          <CardDescription>Ranked by search volume with share of total measured demand.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={keywordColumns} data={keywords} pageSize={10} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Demand Products</CardTitle>
          <CardDescription>Products with the strongest sales or revenue in the category.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={productColumns} data={products} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
