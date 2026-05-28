import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { ScoreGauge } from '../components/ui/ScoreGauge';
import { formatCurrency, formatPercent } from '../utils/cn';
import { AlertCircle, Loader2, PieChart as PieChartIcon } from 'lucide-react';
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

  if (isError || !data || data.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const topBrands = results.top_brands_by_share || [];

  const columns: Column<any>[] = [
    { header: "Brand", accessorKey: "Brand", cell: (r) => <div className="font-semibold">{r.Brand}</div> },
    { header: "Revenue", accessorKey: "Brand_Revenue", cell: (r) => formatCurrency(r.Brand_Revenue) },
    { header: "Market Share", accessorKey: "Market_Share", cell: (r) => formatPercent(r.Market_Share * 100) },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

  const chartData = topBrands.slice(0, 5).map((b: any) => ({
    name: b.Brand,
    value: b.Market_Share
  }));
  
  // Calculate "Others"
  const othersShare = 1 - chartData.reduce((acc: number, curr: any) => acc + curr.value, 0);
  if (othersShare > 0) {
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
          <ScoreGauge score={100 - (results.hhi_score / 100)} label="HHI Score" size={180} />
          <p className="font-bold text-2xl mt-4">{results.hhi_score?.toLocaleString()}</p>
          <p className="text-muted-foreground text-sm uppercase tracking-wide">RAW INDEX</p>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
             <CardTitle>Market Structure: {results.structure_type}</CardTitle>
             <CardDescription>
               {results.structure_type === 'Monopolistic / Highly Concentrated' 
                ? 'A few dominant players control this market. High barrier to entry.' 
                : 'Market is fragmented. Accessible to new entrants but highly competitive.'}
             </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-center justify-between gap-8 h-64">
            <div className="w-full h-full flex-1 min-w-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip 
                    formatter={(val: number) => formatPercent(val * 100)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Pie
                    data={chartData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex-1 space-y-4">
               {chartData.map((entry, idx) => (
                 <div key={idx} className="flex justify-between items-center text-sm">
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="font-medium truncate max-w-[120px]">{entry.name}</span>
                   </div>
                   <span className="font-mono">{formatPercent(entry.value * 100)}</span>
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

