import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { adaptiveDomain, formatNumber, growthLabelFromScore } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

export default function SalesMomentum() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-momentum'],
    queryFn: () => api.getSalesMomentum(30),
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
          <h2 className="text-xl font-bold text-danger mb-2">Sales Momentum Unavailable</h2>
          <p className="text-danger/80">{getEngineErrorMessage(data, 'Requires BlackBox with sales trend data.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const growing = results.fastest_growing_brands || [];
  const declining = results.declining_brands || [];

  // Prepare chart data (top 5 growing vs declining)
  const chartData = [
    ...growing.slice(0, 5).map((b: any) => ({ name: b.brand, trend_strength: b.momentum_score || 0, type: 'grow' })),
    ...declining.slice(0, 5).map((b: any) => ({ name: b.brand, trend_strength: b.momentum_score || 0, type: 'decline' })),
  ];
  const yDomain = adaptiveDomain(chartData.map((d) => d.trend_strength), 0.02, 0.98);

  const columns: Column<any>[] = [
    { header: "Brand", accessorKey: "brand", cell: (r) => <div className="font-semibold">{r.brand}</div> },
    { header: "Total Sales", accessorKey: "total_asin_sales", cell: (r) => r.total_asin_sales != null ? formatNumber(r.total_asin_sales) : '—' },
    { header: "Trend Category", accessorKey: "momentum_score", cell: (r) => growthLabelFromScore(r.momentum_score ?? 0) },
    { header: "Momentum Score", accessorKey: "momentum_score", cell: (r) => r.momentum_score != null ? r.momentum_score.toFixed(1) : '—' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Sales Momentum</h1>
        <p className="text-muted-foreground mt-1">
          Brand-level acceleration mapping. Identifies who is capturing or losing market velocity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Momentum Divergence</CardTitle>
            <CardDescription>Sales trends for the fastest growing vs fastest declining brands.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                    dy={10} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                    domain={yDomain}
                    tickFormatter={(val) => `${Number(val).toFixed(0)}`}
                  />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="trend_strength" radius={[4, 4, 4, 4]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.type === 'grow' ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Growth Leaders</CardTitle>
              <CardDescription>Brands accelerating rapidly.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={growing} pageSize={5} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Declining Brands</CardTitle>
              <CardDescription>Brands losing sales velocity.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={declining} pageSize={5} />
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
