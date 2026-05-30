import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import {
  AlertCircle, Loader2, PackagePlus, Activity, BarChart2, Star, Layers, Box, TrendingUp
} from 'lucide-react';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, BarChart, Bar, ScatterChart, Scatter, ZAxis, Cell } from 'recharts';
import { motion } from 'framer-motion';

export default function BundleOpportunities() {
  const { data: bundleData, isLoading: bunLoading, isError } = useQuery({
    queryKey: ['bundle-opportunities'],
    queryFn: () => api.getBundleOpportunities(15),
  });

  if (bunLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3 theme-indigo">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Synthesizing Bundle Opportunities...</p>
      </div>
    );
  }

  if (isError || !bundleData || bundleData.status !== 'success') {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-10 theme-indigo">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2 font-serif">Bundle Analysis Failed</h2>
          <p className="text-danger/80">Ensure Keyword and BlackBox datasets are completely mapped.</p>
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
    
  const ecosystemStrength = Number(bunResults.ecosystem_strength || 0);

  const bunColumns: ColumnDef<any>[] = [
    { 
      header: "Primary Anchor", 
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="w-max text-[10px] font-mono tracking-widest">{r.primary_product?.brand || 'Unknown'}</Badge>
          <div className="max-w-[200px] truncate text-sm font-medium" title={r.primary_product?.title}>
            {r.primary_product?.title || '—'}
          </div>
        </div>
      ) 
    },
    { 
      header: "Strategic Complement", 
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <Badge variant="secondary" className="w-max text-[10px] font-mono tracking-widest bg-success/10 text-success border-success/20">
            {r.complement_product?.brand || 'Unknown'}
          </Badge>
          <div className="max-w-[200px] truncate text-sm" title={r.complement_product?.title}>
            {r.complement_product?.title || '—'}
          </div>
        </div>
      ) 
    },
    { 
      header: "Keyword Overlap", 
      cell: (r) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {(r.shared_keywords || []).slice(0, 3).map((kw: string) => (
            <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-muted rounded-md border border-border/50 truncate max-w-[80px]">{kw}</span>
          ))}
          {(r.shared_keywords?.length || 0) > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-md border border-border/50 text-muted-foreground">
              +{r.shared_keywords.length - 3}
            </span>
          )}
        </div>
      ) 
    },
    { 
      header: "Viability Score", 
      cell: (r) => {
        const score = Number(r.bundle_score) || 0;
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{score.toFixed(1)}</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full", score > 80 ? 'bg-success' : score > 50 ? 'bg-primary' : 'bg-muted-foreground')} 
                style={{ width: `${Math.min(100, score)}%` }} 
              />
            </div>
          </div>
        );
      } 
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-indigo">
      
      {/* Header — Product Strategy Style */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 mb-3 border border-primary/20 font-mono tracking-widest uppercase rounded-sm">
            Product Intelligence
          </Badge>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-sans">Bundle Opportunities</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Identify high-potential product pairings to increase AOV and monopolize category shelf space.
          </p>
        </div>
        <div className="text-right flex gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Combos</p>
            <p className="text-3xl font-black font-mono text-foreground">{bunResults.total_bundle_opportunities || 0}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Prime Bundles</p>
            <p className={cn("text-3xl font-black font-mono flex items-center gap-1", highPotential.length > 0 ? 'text-success' : 'text-primary')}>
              {highPotential.length}
            </p>
          </div>
        </div>
      </div>

      {/* Strategy KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-md text-primary"><PackagePlus className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Potential Pairings</p>
            </div>
            <p className="text-3xl font-black">{bunResults.total_bundle_opportunities || 0}</p>
            <p className="text-xs text-muted-foreground mt-2">Identified bundle combos</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-success/10 rounded-md text-success"><Star className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">High-Value Targets</p>
            </div>
            <p className="text-3xl font-black">{highPotential.length}</p>
            <p className="text-xs text-muted-foreground mt-2">Score &gt; 80/100</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-info/10 rounded-md text-info"><Activity className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Network Integrity</p>
            </div>
            <p className="text-3xl font-black">{ecosystemStrength.toFixed(1)}<span className="text-sm font-sans text-muted-foreground font-normal">/100</span></p>
            <p className="text-xs text-muted-foreground mt-2">Overall category connectivity</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-warning/10 rounded-md text-warning"><TrendingUp className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Viability Mean</p>
            </div>
            <p className="text-3xl font-black">{averageBundleScore.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-2">Average bundle potential</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Target Corridors</CardTitle>
            <CardDescription>Opportunity concentration by subcategory</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bunClusters.slice(0, 10)} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="complement_subcategory" stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl text-sm font-mono">
                          <p className="font-bold text-xs">{payload[0].payload.complement_subcategory}</p>
                          <p className="text-primary mt-1">{payload[0].value} pairings</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="bundle_count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {bunClusters.slice(0, 10).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill="hsl(var(--primary))" fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Bundle Viability Matrix</CardTitle>
            <CardDescription>Demand Overlap vs Score. Size = Complement Strength.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis type="number" dataKey="demand_overlap" name="Demand Overlap" stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} />
                <YAxis type="number" dataKey="bundle_score" name="Bundle Score" stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} />
                <ZAxis type="number" dataKey="complement_strength" range={[50, 400]} name="Complement Strength" />
                <Tooltip 
                  cursor={{strokeDasharray: '3 3'}}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl text-sm font-mono space-y-1 z-50">
                          <p className="font-bold text-xs truncate max-w-[250px] mb-2">{data.primary_product?.title} + {data.complement_product?.title}</p>
                          <div className="grid grid-cols-2 gap-4 mt-2 border-t border-border/50 pt-2">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Viability</p>
                              <p className="text-success font-bold">{Number(data.bundle_score).toFixed(1)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Demand Overlap</p>
                              <p>{Number(data.demand_overlap).toFixed(1)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter data={bunOpps}>
                  {bunOpps.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill="hsl(var(--success))" fillOpacity={entry.bundle_score > 70 ? 0.8 : 0.4} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50 glass">
        <CardHeader>
          <CardTitle className="font-sans">Strategic Pairings Ledger</CardTitle>
          <CardDescription>Detailed index of specific product combinations and keyword overlap.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={bunColumns} data={bunOpps} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
