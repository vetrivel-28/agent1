import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { AlertCircle, Loader2, PackagePlus, Activity, BarChart2, Star } from 'lucide-react';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, BarChart, Bar, ScatterChart, Scatter, ZAxis } from 'recharts';
import { KPICard } from '../components/ui/KPICard';
import { motion } from 'framer-motion';

export default function BundleOpportunities() {
  const { data: bundleData, isLoading: bunLoading, isError } = useQuery({
    queryKey: ['bundle-opportunities'],
    queryFn: () => api.getBundleOpportunities(15),
  });

  if (bunLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !bundleData || bundleData.status !== 'success') {
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

  const bunResults = bundleData.results || {};
  const bunOpps = bunResults.bundle_opportunities || [];
  const highPotential = bunResults.high_potential_bundles || [];
  const bunClusters = bunResults.bundle_clusters || [];

  const averageBundleScore = bunOpps.length > 0 
    ? bunOpps.reduce((acc: number, curr: any) => acc + Number(curr.bundle_score || 0), 0) / bunOpps.length 
    : 0;

  const bunColumns: Column<any>[] = [
    { header: "Primary Product", accessorKey: "primary", cell: (r) => <div className="max-w-[200px] truncate" title={r.primary_product?.title}>{r.primary_product?.title || '—'}</div> },
    { header: "Complement Product", accessorKey: "complement", cell: (r) => <div className="max-w-[200px] truncate" title={r.complement_product?.title}>{r.complement_product?.title || '—'}</div> },
    { header: "Shared Keywords", accessorKey: "shared", cell: (r) => <div className="max-w-[150px] truncate" title={(r.shared_keywords || []).join(', ')}>{(r.shared_keywords || []).join(', ') || '—'}</div> },
    { header: "Bundle Score", accessorKey: "bundle_score", cell: (r) => r.bundle_score != null ? Number(r.bundle_score).toFixed(1) : '—' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Bundle Opportunities</h1>
        <p className="text-muted-foreground mt-1">Identify high-potential bundle combinations using complement relationships.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Bundle Opportunities"
          value={`${bunResults.total_bundle_opportunities || 0}`}
          icon={<PackagePlus className="w-5 h-5 text-primary" />}
          status="neutral"
        />
        <KPICard 
          title="High Potential Bundles"
          value={`${highPotential.length}`}
          icon={<Star className="w-5 h-5 text-warning" />}
          status={highPotential.length > 0 ? 'success' : 'neutral'}
        />
        <KPICard 
          title="Ecosystem Strength"
          value={`${Number(bunResults.ecosystem_strength || 0).toFixed(1)}/100`}
          icon={<Activity className="w-5 h-5" />}
          status={(bunResults.ecosystem_strength || 0) > 60 ? 'success' : 'neutral'}
        />
        <KPICard 
          title="Avg Bundle Score"
          value={`${averageBundleScore.toFixed(1)}`}
          icon={<BarChart2 className="w-5 h-5" />}
          status="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Bundle Categories</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bunClusters.slice(0, 10)} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="complement_subcategory" stroke="hsl(var(--muted-foreground))" fontSize={12} tick={{fill: "hsl(var(--foreground))"}} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="bundle_count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bundle Potential (Demand Overlap vs Score)</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="demand_overlap" name="Demand Overlap" stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: 'Demand Overlap', position: 'insideBottom', offset: -10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="number" dataKey="bundle_score" name="Bundle Score" stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: 'Bundle Score', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }} />
                <ZAxis type="number" dataKey="complement_strength" range={[50, 400]} name="Complement Strength" />
                <Tooltip cursor={{strokeDasharray: '3 3'}} />
                <Scatter data={bunOpps} fill="hsl(var(--success))" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bundle Combinations Table</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={bunColumns} data={bunOpps} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
