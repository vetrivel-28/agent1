import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency, formatNumber } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Loader2, ArrowUpRight, Target, Search, AlertTriangle } from 'lucide-react';
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

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">BSR Efficiency Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(data, 'Required BSR and Revenue columns not found in product dataset.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results || {};
  const efficient = results.efficient_products || [];
  const inefficient = results.inefficient_products || [];
  const qs = results.quadrant_summary || {};

  const columns: Column<any>[] = [
    { header: "ASIN / Title", accessorKey: "title", cell: (r) => <div className="max-w-[200px] truncate" title={r.title}>{r.title || r.asin || '—'}</div> },
    { header: "BSR", accessorKey: "bsr", cell: (r) => r.bsr != null ? formatNumber(r.bsr) : '—' },
    { header: "Revenue", accessorKey: "revenue", cell: (r) => r.revenue != null ? formatCurrency(r.revenue) : '—' },
    { header: "Efficiency", accessorKey: "efficiency_score", cell: (r) => r.efficiency_score != null ? `${r.efficiency_score.toFixed(1)}/100` : '—' },
  ];

  const hasQuadrantData = qs.valid_products_count > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">BSR Efficiency</h1>
        <p className="text-muted-foreground mt-1">
          Identifies products generating disproportionate revenue relative to their rank (anomalies) and highly inefficient rankers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Quadrant Map Card */}
        <Card>
          <CardHeader>
            <CardTitle>Rank-to-Revenue Opportunity Map</CardTitle>
            <CardDescription>Product segmentation based on market rank and revenue thresholds.</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasQuadrantData ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <p>Insufficient valid product data</p>
                <p className="text-sm opacity-75">Cannot calculate thresholds from available BSR and revenue fields.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Top Left: Market Leaders */}
                  <div className="p-5 rounded-lg border bg-success/5 border-success/20 flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2 text-success">
                      <ArrowUpRight className="w-5 h-5" />
                      <span className="font-bold">Market Leaders</span>
                    </div>
                    <div className="text-3xl font-bold text-success mb-1">{qs.market_leaders_count}</div>
                    <p className="text-xs text-muted-foreground">Strong BSR & Strong Revenue</p>
                  </div>

                  {/* Top Right: Optimization Gaps */}
                  <div className="p-5 rounded-lg border bg-amber-500/5 border-amber-500/20 flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-bold">Optimization Gaps</span>
                    </div>
                    <div className="text-3xl font-bold text-amber-600 dark:text-amber-500 mb-1">{qs.optimization_gaps_count}</div>
                    <p className="text-xs text-muted-foreground">Strong BSR & Weak Revenue</p>
                  </div>

                  {/* Bottom Left: Hidden Winners */}
                  <div className="p-5 rounded-lg border bg-blue-500/5 border-blue-500/20 flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2 text-blue-500">
                      <Target className="w-5 h-5" />
                      <span className="font-bold">Hidden Winners</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-500 mb-1">{qs.hidden_winners_count}</div>
                    <p className="text-xs text-muted-foreground">Weak BSR & Strong Revenue</p>
                  </div>

                  {/* Bottom Right: Weak Listings */}
                  <div className="p-5 rounded-lg border bg-muted/30 border-muted/50 flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                      <Search className="w-5 h-5" />
                      <span className="font-bold">Weak Listings</span>
                    </div>
                    <div className="text-3xl font-bold text-muted-foreground mb-1">{qs.weak_listings_count}</div>
                    <p className="text-xs text-muted-foreground">Weak BSR & Weak Revenue</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground bg-muted/20 p-3 rounded-md mt-4 justify-center">
                  <div><strong>Valid products used:</strong> {qs.valid_products_count}</div>
                  <div>•</div>
                  <div><strong>Strong rank threshold:</strong> BSR ≤ {formatNumber(qs.rank_threshold_bsr)}</div>
                  <div>•</div>
                  <div><strong>Strong revenue threshold:</strong> Revenue ≥ {formatCurrency(qs.revenue_threshold)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Existing Tables */}
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
