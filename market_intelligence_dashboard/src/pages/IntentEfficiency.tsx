import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';

export default function IntentEfficiency() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['intent-efficiency'],
    queryFn: () => api.getSearchIntentEfficiency(50),
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
          <p className="text-danger/80">Requires Magnet dataset.</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const efficient = results.highest_efficiency_keywords || [];
  const inefficient = results.lowest_efficiency_keywords || [];

  const columns: Column<any>[] = [
    { header: "Keyword", accessorKey: "keyword", cell: (r) => (
      <div className="font-semibold">{r.keyword || '—'}</div>
    )},
    { header: "Click Share", accessorKey: "click_share", cell: (r) => r.click_share != null ? `${(r.click_share * 100).toFixed(2)}%` : '—' },
    { header: "Conv Share", accessorKey: "conv_share", cell: (r) => r.conv_share != null ? `${(r.conv_share * 100).toFixed(2)}%` : '—' },
    { header: "SIEI", accessorKey: "siei", cell: (r) => r.siei != null ? r.siei.toFixed(2) : '—' },
  ];

  const chartData = [
    ...efficient.map((k: any) => ({ ...k, type: 'efficient' })),
    ...inefficient.map((k: any) => ({ ...k, type: 'inefficient' }))
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-sm">
          <p className="font-semibold text-sm max-w-xs truncate mb-2">{data.keyword}</p>
          <p className="text-sm">Clicks: {data.click_share != null ? (data.click_share * 100).toFixed(2) : '—'}%</p>
          <p className="text-sm">Conv: {data.conv_share != null ? (data.conv_share * 100).toFixed(2) : '—'}%</p>
          <p className="text-sm">SIEI: <span className={data.siei > 1 ? 'text-success' : 'text-danger'}>{data.siei?.toFixed(2)}</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Intent Efficiency Index</h1>
        <p className="text-muted-foreground mt-1">
          Identifies keywords receiving clicks but failing to convert, diagnosing market friction.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversion vs Click Map</CardTitle>
          <CardDescription>SIEI &gt; 1 means highly efficient (over-converts relative to clicks).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  type="number" 
                  dataKey="click_share" 
                  name="Click Share"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                  tickFormatter={(val) => `${(val * 100).toFixed(1)}%`}
                />
                <YAxis 
                  type="number" 
                  dataKey="conv_share" 
                  name="Conversion Share"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(val) => `${(val * 100).toFixed(1)}%`}
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
            <CardTitle>High Efficiency Keywords</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={efficient} pageSize={5} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Friction Keywords (Low Efficiency)</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={inefficient} pageSize={5} />
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
