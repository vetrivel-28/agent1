import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { adaptiveDomain, formatCurrency, formatNumber } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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

  const chartData = [
    ...efficient.map((p: any) => ({ ...p, type: 'efficient' })),
    ...inefficient.map((p: any) => ({ ...p, type: 'inefficient' }))
  ];
  const bsrDomain = adaptiveDomain(chartData.map((d: any) => Number(d.bsr || 0)), 0.02, 0.98);
  const revenueDomain = adaptiveDomain(chartData.map((d: any) => Number(d.revenue || 0)), 0.02, 0.98);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-sm">
          <p className="font-semibold text-sm max-w-xs truncate mb-2">{data.title || data.asin}</p>
          <p className="text-sm">BSR: {data.bsr != null ? formatNumber(data.bsr) : '—'}</p>
          <p className="text-sm">Revenue: {data.revenue != null ? formatCurrency(data.revenue) : '—'}</p>
          <p className="text-sm">Score: <span className={data.type === 'efficient' ? 'text-success' : 'text-danger'}>{data.efficiency_score?.toFixed(1)}</span></p>
        </div>
      );
    }
    return null;
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
            <CardTitle>Rank vs Revenue Frontier</CardTitle>
            <CardDescription>Mapping market efficiency. Quadrant outliers indicate strategic opportunities.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    type="number" 
                    dataKey="bsr" 
                    name="Best Sellers Rank"
                    domain={bsrDomain}
                    reversed
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                    tickFormatter={(val) => formatNumber(val)}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="revenue" 
                    name="Revenue"
                    domain={revenueDomain}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(val) => `$${formatNumber(val)}`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{strokeDasharray: '3 3'}} />
                  <Scatter data={chartData}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.type === 'efficient' ? '#10b981' : '#ef4444'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
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
