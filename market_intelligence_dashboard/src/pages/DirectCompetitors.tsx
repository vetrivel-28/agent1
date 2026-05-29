import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency } from '../utils/cn';
import { AlertCircle, Loader2, Users, Activity, BarChart2, Zap } from 'lucide-react';
import { Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, XAxis, YAxis, ZAxis, Treemap } from 'recharts';
import { KPICard } from '../components/ui/KPICard';
import { motion } from 'framer-motion';

export default function DirectCompetitors() {
  const { data: directCompData, isLoading: dcLoading, isError } = useQuery({
    queryKey: ['direct-competitors'],
    queryFn: () => api.getDirectCompetitors(15, 17.5),
  });

  if (dcLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !directCompData || directCompData.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
          <p className="text-danger/80">Make sure BlackBox dataset is uploaded.</p>
        </CardContent>
      </Card>
    );
  }

  const dcResults = directCompData.results || {};
  
  // Flatten top_competitors from the list of references
  const allCompetitorsRaw = dcResults.direct_competitors || [];
  const dcCompetitors = allCompetitorsRaw.flatMap((ref: any) => ref.top_competitors || []);
  
  // Dedup competitors by ASIN if needed, though they might be repeated for different references.
  // For the table, it's fine.

  // Calculate average similarity
  const averageSimilarity = dcCompetitors.length > 0
    ? dcCompetitors.reduce((acc: number, curr: any) => acc + Number(curr.similarity_score || 0), 0) / dcCompetitors.length
    : 0;

  // Extract average price
  const averagePrice = dcResults.price_positioning?.price_distribution?.mean || 0;

  // Treemap data needs `cluster` and `product_count`
  const clusterDistribution = (dcResults.market_clusters || []).map((c: any) => ({
    cluster: `${c.category}/${c.subcategory}`,
    product_count: c.cluster_size
  }));

  const dcColumns: Column<any>[] = [
    { header: "ASIN", accessorKey: "asin", cell: (r) => r.asin || '—' },
    { header: "Brand", accessorKey: "brand", cell: (r) => r.brand || '—' },
    { header: "Title", accessorKey: "title", cell: (r) => <div className="max-w-xs truncate" title={r.title}>{r.title || '—'}</div> },
    { header: "Price", accessorKey: "price", cell: (r) => r.price != null ? formatCurrency(r.price) : '—' },
    { header: "Category", accessorKey: "category", cell: (r) => r.category || '—' },
    { header: "Subcategory", accessorKey: "subcategory", cell: (r) => r.subcategory || '—' },
    { header: "Similarity Score", accessorKey: "similarity_score", cell: (r) => r.similarity_score != null ? Number(r.similarity_score).toFixed(1) : '—' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Direct Competitor Analysis</h1>
        <p className="text-muted-foreground mt-1">Identify direct market competitors by category, subcategory, and price.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Competitor Count"
          value={`${dcResults.total_products_analyzed || 0}`}
          icon={<Users className="w-5 h-5" />}
          status="neutral"
        />
        <KPICard 
          title="Competition Density"
          value={`${dcResults.total_clusters || 0} Clusters`}
          icon={<Activity className="w-5 h-5" />}
          status={dcResults.total_clusters > 10 ? 'danger' : 'warning'}
        />
        <KPICard 
          title="Avg Similarity"
          value={`${averageSimilarity.toFixed(1)}`}
          icon={<BarChart2 className="w-5 h-5" />}
          status="neutral"
        />
        <KPICard 
          title="Avg Market Price"
          value={`${formatCurrency(averagePrice)}`}
          icon={<Zap className="w-5 h-5 text-warning" />}
          status="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Competitor Positioning Map</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="price" name="Price" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `$${val}`} />
                <YAxis type="number" dataKey="similarity_score" name="Similarity" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <ZAxis type="number" dataKey="similarity_score" range={[50, 800]} name="Score" />
                <Tooltip 
                  cursor={{strokeDasharray: '3 3'}}
                  formatter={(val: any, name: any) => name === 'Score' ? val : name === 'Price' ? formatCurrency(val) : val}
                />
                <Scatter data={dcCompetitors} fill="hsl(var(--primary))" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Competition Treemap</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={clusterDistribution}
                dataKey="product_count"
                nameKey="cluster"
                stroke="hsl(var(--background))"
                fill="hsl(var(--primary))"
              >
                <Tooltip />
              </Treemap>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Competitor Analysis Table</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={dcColumns} data={dcCompetitors} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
