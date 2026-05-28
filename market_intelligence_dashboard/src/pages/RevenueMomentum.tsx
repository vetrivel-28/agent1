import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency, formatNumber } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

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

  if (isError || !data || data.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
          <p className="text-danger/80">Dataset processing failed or missing.</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const growing = results.top_revenue_growth_brands || [];
  const declining = results.declining_revenue_brands || [];

  const columns: Column<any>[] = [
    { header: "Brand", accessorKey: "Brand", cell: (r) => <div className="font-semibold">{r.Brand}</div> },
    { header: "Total Revenue", accessorKey: "Total_Revenue", cell: (r) => formatCurrency(r.Total_Revenue) },
    { header: "Revenue Trend", accessorKey: "Revenue_Trend", cell: (r) => (
      <span className={r.Revenue_Trend > 0 ? "text-success font-medium" : "text-danger font-medium"}>
        {r.Revenue_Trend > 0 ? '+' : ''}{r.Revenue_Trend?.toFixed(1)}%
      </span>
    )},
    { header: "Momentum Score", accessorKey: "momentum_score", cell: (r) => r.momentum_score?.toFixed(1) },
  ];

  // For the area chart, let's plot cumulative or top revenue distributions
  const chartData = growing.slice(0, 15).map((b: any) => ({
    name: b.Brand,
    Revenue: b.Total_Revenue
  }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Revenue Momentum</h1>
        <p className="text-muted-foreground mt-1">
          Identifies brands rapidly expanding their revenue footprint versus shrinking incumbents.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Distribution (Top Growing Brands)</CardTitle>
            <CardDescription>Visualizing market capitalization held by accelerating players.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
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
                    tickFormatter={(val) => `$${formatNumber(val)}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(val: number) => formatCurrency(val)}
                  />
                  <Area type="monotone" dataKey="Revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Growth Leaders</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={columns} data={growing} pageSize={5} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bleeding Revenue</CardTitle>
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

