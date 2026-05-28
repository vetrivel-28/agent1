import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatNumber } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';

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
  const growing = results.fastest_growing_brands || [];
  const declining = results.declining_brands || [];

  // Prepare chart data (top 10 growing vs declining)
  const chartData = [
    ...growing.slice(0, 5).map((b: any) => ({ name: b.Brand, trend: b.Sales_Trend, type: 'grow' })),
    ...declining.slice(0, 5).map((b: any) => ({ name: b.Brand, trend: b.Sales_Trend, type: 'decline' })),
  ];

  const columns: Column<any>[] = [
    { header: "Brand", accessorKey: "Brand", cell: (r) => <div className="font-semibold">{r.Brand}</div> },
    { header: "Total Sales", accessorKey: "Total_Sales", cell: (r) => formatNumber(r.Total_Sales) },
    { 
      header: "Sales Trend", 
      accessorKey: "Sales_Trend", 
      cell: (r) => (
        <span className={r.Sales_Trend > 0 ? "text-success font-medium" : "text-danger font-medium"}>
          {r.Sales_Trend > 0 ? '+' : ''}{r.Sales_Trend}%
        </span>
      ) 
    },
    { header: "Momentum Score", accessorKey: "momentum_score", cell: (r) => r.momentum_score?.toFixed(1) },
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
                    tickFormatter={(val) => `${val}%`}
                  />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="trend" radius={[4, 4, 4, 4]}>
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

