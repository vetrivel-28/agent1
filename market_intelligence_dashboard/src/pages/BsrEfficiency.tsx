import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency, formatNumber } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BsrEfficiency() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bsr-efficiency'],
    queryFn: () => api.getBsrEfficiency(50),
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
          <p className="text-danger/80">Make sure BlackBox products dataset is loaded.</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const efficient = results.efficient_products || [];
  const inefficient = results.inefficient_products || [];

  const columns: Column<any>[] = [
    { header: "ASIN / Title", accessorKey: "title", cell: (r) => <div className="max-w-[200px] truncate" title={r.title}>{r.title || r.asin || '—'}</div> },
    { header: "BSR", accessorKey: "bsr", cell: (r) => r.bsr != null ? formatNumber(r.bsr) : '—' },
    { header: "Revenue", accessorKey: "revenue", cell: (r) => r.revenue != null ? formatCurrency(r.revenue) : '—' },
    { header: "Efficiency", accessorKey: "efficiency_score", cell: (r) => r.efficiency_score != null ? `${r.efficiency_score.toFixed(1)}/100` : '—' },
  ];

  const summary = results.quadrant_summary || {
    rank_threshold_bsr: 0,
    revenue_threshold: 0,
    valid_products_count: 0,
    market_leaders_count: 0,
    optimization_gaps_count: 0,
    hidden_winners_count: 0,
    weak_listings_count: 0
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">BSR Efficiency</h1>
        <p className="text-muted-foreground mt-1">
          Identifies products generating disproportionate revenue relative to their rank (anomalies) and highly inefficient rankers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Rank-to-Revenue Opportunity Map</CardTitle>
            <CardDescription>Shows where rank visibility is successfully converting into revenue, and where optimization gaps may exist.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.valid_products_count > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto mt-2">
                  <div className="p-6 rounded-xl border bg-emerald-500/10 border-emerald-500/20 flex flex-col items-center justify-center text-center shadow-sm">
                    <h3 className="font-bold text-lg text-emerald-600 dark:text-emerald-400 mb-1">Market Leaders</h3>
                    <p className="text-sm text-muted-foreground mb-4">Strong Rank + Strong Revenue</p>
                    <div className="text-4xl font-bold text-foreground">{summary.market_leaders_count}</div>
                    <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-medium">Products</p>
                  </div>

                  <div className="p-6 rounded-xl border bg-amber-500/10 border-amber-500/20 flex flex-col items-center justify-center text-center shadow-sm">
                    <h3 className="font-bold text-lg text-amber-600 dark:text-amber-400 mb-1">Optimization Gaps</h3>
                    <p className="text-sm text-muted-foreground mb-4">Strong Rank + Weak Revenue</p>
                    <div className="text-4xl font-bold text-foreground">{summary.optimization_gaps_count}</div>
                    <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-medium">Products</p>
                  </div>

                  <div className="p-6 rounded-xl border bg-blue-500/10 border-blue-500/20 flex flex-col items-center justify-center text-center shadow-sm">
                    <h3 className="font-bold text-lg text-blue-600 dark:text-blue-400 mb-1">Hidden Winners</h3>
                    <p className="text-sm text-muted-foreground mb-4">Weaker Rank + Strong Revenue</p>
                    <div className="text-4xl font-bold text-foreground">{summary.hidden_winners_count}</div>
                    <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-medium">Products</p>
                  </div>

                  <div className="p-6 rounded-xl border bg-slate-500/10 border-slate-500/20 flex flex-col items-center justify-center text-center shadow-sm">
                    <h3 className="font-bold text-lg text-slate-600 dark:text-slate-400 mb-1">Weak Listings</h3>
                    <p className="text-sm text-muted-foreground mb-4">Weaker Rank + Weak Revenue</p>
                    <div className="text-4xl font-bold text-foreground">{summary.weak_listings_count}</div>
                    <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-medium">Products</p>
                  </div>
                </div>
                
                <div className="mt-6 flex flex-col sm:flex-row justify-center items-center gap-4 text-sm text-muted-foreground border-t pt-4 max-w-4xl mx-auto">
                  <div><span className="font-medium text-foreground">Valid products used:</span> {summary.valid_products_count}</div>
                  <div className="hidden sm:block">•</div>
                  <div><span className="font-medium text-foreground">Strong rank threshold:</span> BSR ≤ {formatNumber(summary.rank_threshold_bsr)}</div>
                  <div className="hidden sm:block">•</div>
                  <div><span className="font-medium text-foreground">Strong revenue threshold:</span> Revenue ≥ {formatCurrency(summary.revenue_threshold)}</div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <p>Insufficient valid product data</p>
                <p className="text-sm opacity-80 mt-1">Check that products have numeric BSR and Revenue values &gt; 0.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Efficient Products</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={efficient} pageSize={5} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top Inefficient Products</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={inefficient} pageSize={5} />
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
