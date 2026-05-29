import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { growthLabelFromScore } from '../utils/cn';
import { AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SearchMomentum() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['search-momentum'],
    queryFn: () => api.getSearchMomentum(50),
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
          <p className="text-danger/80">Check Magnet and BlackBox datasets.</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const healthy = results.healthy_keywords || [];
  const weak = results.weak_conversion_keywords || [];

  const columns: Column<any>[] = [
    { header: "Keyword", accessorKey: "keyword", cell: (r) => (
      <div className="font-semibold">{r.keyword || '—'}</div>
    )},
    { header: "Trend Strength", accessorKey: "momentum_score", cell: (r) => r.momentum_score != null ? `${r.momentum_score.toFixed(1)}/100` : '—' },
    { header: "Trend Category", accessorKey: "momentum_score", cell: (r) => growthLabelFromScore(r.momentum_score ?? 0) },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Search Momentum</h1>
        <p className="text-muted-foreground mt-1">
          Measures alignment between search growth (interest) and sales growth (conversion).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Healthy Growth Keywords</CardTitle>
            <CardDescription>Search traffic rises AND correlates with sales.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={healthy} pageSize={10} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weak Conversion Keywords</CardTitle>
            <CardDescription>High search growth but failing to translate into sales.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={weak} pageSize={10} />
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
