import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { ScoreGauge } from '../components/ui/ScoreGauge';
import { formatCurrency, formatNumber } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DemandStrength() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['demand-strength'],
    queryFn: () => api.getDemandStrength(50), // Fetch more for table
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
          <p className="text-danger/80">Make sure BlackBox and Magnet datasets are uploaded.</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const keywords = results.top_demand_keywords || [];
  const products = results.top_demand_products || [];

  const keywordColumns: Column<any>[] = [
    { header: "Keyword", accessorKey: "Keyword" },
    { header: "Search Volume", accessorKey: "Search Volume", cell: (r) => formatNumber(r["Search Volume"]) },
    { header: "Score (0-100)", accessorKey: "demand_score", cell: (r) => r.demand_score?.toFixed(1) },
  ];

  const productColumns: Column<any>[] = [
    { header: "Title", accessorKey: "Title", cell: (r) => <div className="max-w-xs truncate" title={r.Title}>{r.Title}</div> },
    { header: "Brand", accessorKey: "Brand" },
    { header: "Revenue", accessorKey: "Revenue", cell: (r) => formatCurrency(r.Revenue) },
    { header: "Sales", accessorKey: "Sales", cell: (r) => formatNumber(r.Sales) },
    { header: "Score (0-100)", accessorKey: "demand_score", cell: (r) => r.demand_score?.toFixed(1) },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Demand Strength</h1>
        <p className="text-muted-foreground mt-1">
          Measures overall market demand health by combining search volume, product sales, and revenue.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 flex flex-col items-center justify-center p-8">
          <ScoreGauge score={results.demand_strength_score || 0} label="Market Demand" size={220} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            A score above 70 indicates strong, highly-validated consumer demand.
          </p>
        </Card>

        <Card className="lg:col-span-2">
           <CardHeader>
             <CardTitle>Top Demand Keywords</CardTitle>
             <CardDescription>Highest volume search terms contributing to market demand.</CardDescription>
           </CardHeader>
           <CardContent>
             <DataTable columns={keywordColumns} data={keywords} pageSize={5} />
           </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Demand Products</CardTitle>
          <CardDescription>Products driving the most sales and revenue in this category.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={productColumns} data={products} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}

