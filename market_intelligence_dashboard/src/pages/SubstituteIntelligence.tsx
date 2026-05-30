import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, ShieldAlert, Activity, BarChart2, Users, Target, ArrowRightLeft
} from 'lucide-react';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, ZAxis, BarChart, Bar, ScatterChart, Scatter, Cell } from 'recharts';
import { motion } from 'framer-motion';

export default function SubstituteIntelligence() {
  const { data: substituteData, isLoading: subLoading, isError } = useQuery({
    queryKey: ['substitute-intelligence'],
    queryFn: () => api.getSubstituteIntelligence(15),
  });

  if (subLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3 theme-indigo">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Identifying Market Substitutes...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(substituteData)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-10 theme-indigo">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">Substitute Analysis Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(substituteData, 'Requires Keyword Classification (Substitute labels) and BlackBox products.')}</p>
        </CardContent>
      </Card>
    );
  }

  const memoized = useMemo(() => {
    const subResults = substituteData.results || {};
    const subProducts = subResults.substitute_products || [];
    const subClusters = subResults.substitute_clusters || [];

    const averageSimilarity = subProducts.length > 0 
      ? subProducts.reduce((acc: number, curr: any) => acc + Number(curr.similarity_score || 0), 0) / subProducts.length 
      : 0;

    const overlapScore = Number(subResults.market_overlap_score || 0);
    
    return { subResults, subProducts, subClusters, averageSimilarity, overlapScore };
  }, [substituteData]);

  const { subResults, subProducts, subClusters, averageSimilarity, overlapScore } = memoized;

  const subColumns: ColumnDef<any>[] = [
    { header: "ASIN", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.asin || '—'}</span> },
    { header: "Brand", cell: (r) => <span className="font-semibold">{r.brand || '—'}</span> },
    { 
      header: "Title", 
      cell: (r) => (
        <div className="max-w-[300px] truncate text-sm" title={r.title}>
          {r.title || '—'}
        </div>
      ) 
    },
    { 
      header: "Taxonomy", 
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="w-max text-[10px] font-mono uppercase tracking-wider">{r.category || '—'}</Badge>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{r.subcategory || '—'}</span>
        </div>
      ) 
    },
    { 
      header: "Substitution Threat", 
      cell: (r) => {
        const score = Number(r.similarity_score) || 0;
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{score.toFixed(1)}</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full", score > 80 ? 'bg-danger' : score > 50 ? 'bg-warning' : 'bg-success')} 
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
          <h1 className="text-4xl font-black tracking-tight text-foreground font-sans">Substitute Intelligence</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Identify cross-category products that serve the same customer needs and are actively stealing demand.
          </p>
        </div>
        <div className="text-right flex gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Threat Vectors</p>
            <p className="text-3xl font-black font-mono text-foreground">{subResults.total_substitute_products || 0}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Overlap Score</p>
            <p className={cn("text-3xl font-black font-mono flex items-center gap-1", overlapScore > 60 ? 'text-danger' : 'text-primary')}>
              {overlapScore.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      {/* Strategy KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-danger/10 rounded-md text-danger"><ShieldAlert className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Known Substitutes</p>
            </div>
            <p className="text-3xl font-black">{subResults.total_substitute_products || 0}</p>
            <p className="text-xs text-muted-foreground mt-2">Identified threat vectors</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-md text-primary"><Activity className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market Overlap</p>
            </div>
            <p className="text-3xl font-black">{overlapScore.toFixed(1)}<span className="text-sm font-sans text-muted-foreground font-normal">/100</span></p>
            <p className="text-xs text-muted-foreground mt-2">Demand intersection</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-info/10 rounded-md text-info"><Users className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Threat Clusters</p>
            </div>
            <p className="text-3xl font-black">{subClusters.length}</p>
            <p className="text-xs text-muted-foreground mt-2">Distinct sub-categories</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-warning/10 rounded-md text-warning"><ArrowRightLeft className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Similarity Mean</p>
            </div>
            <p className="text-3xl font-black">{averageSimilarity.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-2">Average substitution viability</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Primary Threat Clusters</CardTitle>
            <CardDescription>Substitution density by adjacent category</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subClusters.slice(0, 10)} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis dataKey="subcategory" type="category" width={140} stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl text-sm font-mono">
                          <p className="font-bold text-xs">{payload[0].payload.subcategory}</p>
                          <p className="text-danger mt-1">{payload[0].value} threat vectors</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="product_count" radius={[0, 4, 4, 0]} maxBarSize={30}>
                  {subClusters.slice(0, 10).map((_: any, index: number) => (
                     <Cell key={`cell-${index}`} fill="hsl(var(--danger))" fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Demand Gravity vs Substitution Viability</CardTitle>
            <CardDescription>Search Volume vs Similarity Score</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis type="number" dataKey="similarity_score" name="Similarity" stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} />
                <YAxis type="number" dataKey="total_search_volume" name="Search Vol" stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} tickFormatter={(val) => formatNumber(val)} />
                <ZAxis type="number" dataKey="similarity_score" range={[50, 400]} name="Score" />
                <Tooltip 
                  cursor={{strokeDasharray: '3 3'}}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl text-sm font-mono space-y-1 z-50">
                          <p className="font-bold text-xs max-w-[200px] truncate">{data.brand || data.title}</p>
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Threat</p>
                              <p className="text-danger">{Number(data.similarity_score).toFixed(1)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Search Vol</p>
                              <p>{formatNumber(data.total_search_volume || 0)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter data={subProducts}>
                  {subProducts.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill="hsl(var(--danger))" fillOpacity={entry.similarity_score > 60 ? 0.8 : 0.4} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50 glass">
        <CardHeader>
          <CardTitle className="font-sans">Substitute Ledger</CardTitle>
          <CardDescription>Detailed index of identified substitute products and threat scoring.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={subColumns} data={subProducts} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
