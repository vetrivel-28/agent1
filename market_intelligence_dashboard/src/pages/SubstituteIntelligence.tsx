import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { AlertCircle, Loader2, ShieldAlert, Activity, BarChart2, Users } from 'lucide-react';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, ZAxis, BarChart, Bar, ScatterChart, Scatter, Cell } from 'recharts';
import { KPICard } from '../components/ui/KPICard';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

export default function SubstituteIntelligence() {
  const { data: substituteData, isLoading: subLoading, isError } = useQuery({
    queryKey: ['substitute-intelligence'],
    queryFn: () => api.getSubstituteIntelligence(15),
  });

  if (subLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !isEngineOk(substituteData)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Substitute Analysis Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(substituteData, 'Requires Keyword Classification (Substitute labels) and BlackBox products.')}</p>
        </CardContent>
      </Card>
    );
  }

  const subResults = substituteData.results || {};
  const subProducts = subResults.substitute_products || [];
  const subClusters = subResults.substitute_clusters || [];

  // Calculate Average Similarity
  const averageSimilarity = subProducts.length > 0 
    ? subProducts.reduce((acc: number, curr: any) => acc + Number(curr.similarity_score || 0), 0) / subProducts.length 
    : 0;

  const subColumns: Column<any>[] = [
    { header: "ASIN", accessorKey: "asin", cell: (r) => r.asin || '—' },
    { header: "Brand", accessorKey: "brand", cell: (r) => r.brand || '—' },
    { header: "Title", accessorKey: "title", cell: (r) => <div className="max-w-xs truncate" title={r.title}>{r.title || '—'}</div> },
    { header: "Category", accessorKey: "category", cell: (r) => r.category || '—' },
    { header: "Subcategory", accessorKey: "subcategory", cell: (r) => r.subcategory || '—' },
    { header: "Similarity Score", accessorKey: "similarity_score", cell: (r) => r.similarity_score != null ? Number(r.similarity_score).toFixed(1) : '—' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Substitute Intelligence</h1>
        <p className="text-muted-foreground mt-1">Identify substitute products stealing demand from your target market.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Substitute Products"
          value={`${subResults.total_substitute_products || 0}`}
          icon={<ShieldAlert className="w-5 h-5 text-warning" />}
          status="warning"
        />
        <KPICard 
          title="Market Overlap Score"
          value={`${Number(subResults.market_overlap_score || 0).toFixed(1)}/100`}
          icon={<Activity className="w-5 h-5" />}
          status={(subResults.market_overlap_score || 0) > 60 ? 'danger' : 'neutral'}
        />
        <KPICard 
          title="Substitute Clusters"
          value={`${subClusters.length}`}
          icon={<Users className="w-5 h-5" />}
          status="neutral"
        />
        <KPICard 
          title="Avg Similarity"
          value={`${averageSimilarity.toFixed(1)}`}
          icon={<BarChart2 className="w-5 h-5" />}
          status="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Substitute Clusters</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subClusters.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis dataKey="subcategory" type="category" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} tick={{fill: "hsl(var(--foreground))"}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="product_count" radius={[0, 4, 4, 0]}>
                  {subClusters.slice(0, 10).map((_: any, index: number) => (
                     <Cell key={`cell-${index}`} fill="hsl(var(--warning))" fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Substitute Positioning (Search Vol vs Similarity)</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="similarity_score" name="Similarity" stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: 'Similarity Score', position: 'insideBottom', offset: -10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="number" dataKey="total_search_volume" name="Search Volume" stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: 'Search Volume', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }} />
                <ZAxis type="number" dataKey="similarity_score" range={[50, 400]} name="Score" />
                <Tooltip cursor={{strokeDasharray: '3 3'}} />
                <Scatter data={subProducts} fill="hsl(var(--danger))" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Substitute Products Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={subColumns} data={subProducts} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
