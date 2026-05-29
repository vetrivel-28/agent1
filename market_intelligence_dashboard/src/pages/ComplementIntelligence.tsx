import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { AlertCircle, Loader2, LinkIcon, Activity, BarChart2, PlusCircle } from 'lucide-react';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, BarChart, Bar, Cell } from 'recharts';
import { KPICard } from '../components/ui/KPICard';
import { motion } from 'framer-motion';

export default function ComplementIntelligence() {
  const { data: complementData, isLoading: compLoading, isError } = useQuery({
    queryKey: ['complement-intelligence'],
    queryFn: () => api.getComplementIntelligence(15),
  });

  if (compLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !complementData || complementData.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
          <p className="text-danger/80">Make sure Keyword and BlackBox datasets are uploaded.</p>
        </CardContent>
      </Card>
    );
  }

  const compResults = complementData.results || {};
  const compProducts = compResults.complement_products || [];
  const compClusters = compResults.ecosystem_clusters || [];
  const crossSellOpps = compResults.cross_sell_opportunities || [];

  const averageStrength = compProducts.length > 0
    ? compProducts.reduce((acc: number, curr: any) => acc + Number(curr.complement_strength || 0), 0) / compProducts.length
    : 0;

  const compColumns: Column<any>[] = [
    { header: "ASIN", accessorKey: "asin", cell: (r) => r.asin || '—' },
    { header: "Brand", accessorKey: "brand", cell: (r) => r.brand || '—' },
    { header: "Title", accessorKey: "title", cell: (r) => <div className="max-w-xs truncate" title={r.title}>{r.title || '—'}</div> },
    { header: "Category", accessorKey: "category", cell: (r) => r.category || '—' },
    { header: "Subcategory", accessorKey: "subcategory", cell: (r) => r.subcategory || '—' },
    { header: "Strength Score", accessorKey: "complement_strength", cell: (r) => r.complement_strength != null ? Number(r.complement_strength).toFixed(1) : '—' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Complement Intelligence</h1>
        <p className="text-muted-foreground mt-1">Discover complementary products and cross-sell opportunities within your ecosystem.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Complement Products"
          value={`${compResults.total_complement_products || 0}`}
          icon={<LinkIcon className="w-5 h-5 text-primary" />}
          status="neutral"
        />
        <KPICard 
          title="Cross-Sell Opportunities"
          value={`${crossSellOpps.length}`}
          icon={<PlusCircle className="w-5 h-5" />}
          status={crossSellOpps.length > 0 ? 'success' : 'neutral'}
        />
        <KPICard 
          title="Ecosystem Strength"
          value={`${Number(compResults.ecosystem_strength || 0).toFixed(1)}/100`}
          icon={<Activity className="w-5 h-5" />}
          status={(compResults.ecosystem_strength || 0) > 60 ? 'success' : 'neutral'}
        />
        <KPICard 
          title="Avg Strength"
          value={`${averageStrength.toFixed(1)}`}
          icon={<BarChart2 className="w-5 h-5" />}
          status="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Ecosystem Clusters</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compClusters.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis dataKey="subcategory" type="category" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} tick={{fill: "hsl(var(--foreground))"}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="product_count" radius={[0, 4, 4, 0]}>
                  {compClusters.slice(0, 10).map((_: any, index: number) => (
                     <Cell key={`cell-${index}`} fill="hsl(var(--primary))" fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Cross-Sell Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto h-[350px] pr-2">
            <div className="space-y-4">
              {crossSellOpps.map((opp: any, idx: number) => (
                <div key={idx} className="p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-primary">{opp.bridge_keyword}</h3>
                    <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">{opp.connection_count} categories</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{opp.insight}</p>
                </div>
              ))}
              {crossSellOpps.length === 0 && (
                <p className="text-muted-foreground text-center pt-10">No significant cross-sell opportunities detected.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Complement Products Table</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={compColumns} data={compProducts} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
