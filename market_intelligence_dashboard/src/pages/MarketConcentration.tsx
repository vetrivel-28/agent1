import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { ScoreGauge } from '../components/ui/ScoreGauge';
import { formatCurrency } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

export default function MarketConcentration() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-concentration'],
    queryFn: () => api.getMarketConcentration(50),
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
          <h2 className="text-xl font-bold text-danger mb-2">Market Structure Unavailable</h2>
          <p className="text-danger/80">{getEngineErrorMessage(data, 'Requires BlackBox with Brand and Revenue columns.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const topBrands = results.top_brands_by_market_share || [];

  const columns: Column<any>[] = [
    { header: "Brand", accessorKey: "brand", cell: (r) => (
      <div className="font-semibold">{r.brand}</div>
    )},
    { header: "Revenue", accessorKey: "revenue", cell: (r) => r.revenue != null ? formatCurrency(r.revenue) : '—' },
    { header: "Market Share", accessorKey: "market_share_pct", cell: (r) => r.market_share_pct != null ? `${r.market_share_pct.toFixed(2)}%` : '—' },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

  // market_share is already a fraction (0-1 range based on market_share_pct / 100)
  const chartData = topBrands.slice(0, 5).map((b: any) => ({
    name: b.brand,
    value: (b.market_share_pct || 0) / 100
  }));
  
  // Calculate "Others"
  const othersShare = 1 - chartData.reduce((acc: number, curr: any) => acc + curr.value, 0);
  if (othersShare > 0.001) {
    chartData.push({ name: 'Others', value: othersShare });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Market Concentration</h1>
        <p className="text-muted-foreground mt-1">
          HHI (Herfindahl-Hirschman Index) reveals monopoly power vs fragmentation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex flex-col items-center justify-center p-8">
          <ScoreGauge score={results.hhi_normalized_score || 0} label="HHI Score (0-100)" size={180} />
          <p className="font-bold text-2xl mt-4">{results.hhi_score?.toLocaleString()}</p>
          <p className="text-muted-foreground text-sm uppercase tracking-wide">RAW INDEX</p>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
             <CardTitle>Market Structure: {results.market_structure_type}</CardTitle>
             <CardDescription>
               {results.market_structure_type === 'monopoly danger' || results.market_structure_type === 'concentrated market'
                ? 'A few dominant players control this market. High barrier to entry.' 
                : 'Market is fragmented. Accessible to new entrants but highly competitive.'}
             </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-center justify-between gap-8 h-64">
            <div className="w-full h-full flex-1 min-w-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip 
                    formatter={(val: any) => `${(Number(val) * 100).toFixed(2)}%`}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Pie
                    data={chartData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex-1 space-y-4">
               {chartData.map((entry: any, idx: number) => (
                 <div key={idx} className="flex justify-between items-center text-sm">
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="font-medium truncate max-w-[120px]">{entry.name}</span>
                   </div>
                   <span className="font-mono">{(entry.value * 100).toFixed(2)}%</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brand Market Share (Top 50)</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={topBrands} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
