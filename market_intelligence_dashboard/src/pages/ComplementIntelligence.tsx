import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, LinkIcon, Activity, BarChart2, PlusCircle, Network, Layers, Sparkles
} from 'lucide-react';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, BarChart, Bar, Cell } from 'recharts';
import { motion } from 'framer-motion';

export default function ComplementIntelligence() {
  const { data: complementData, isLoading: compLoading, isError } = useQuery({
    queryKey: ['complement-intelligence'],
    queryFn: () => api.getComplementIntelligence(15),
  });

  if (compLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3 theme-indigo">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Mapping Product Ecosystem...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(complementData)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-10 theme-indigo">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">Ecosystem Mapping Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(complementData, 'Requires Keyword Classification (Complement labels) and BlackBox products.')}</p>
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
    
  const ecosystemStrength = Number(compResults.ecosystem_strength || 0);

  const compColumns: ColumnDef<any>[] = [
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
      header: "Complement Strength", 
      cell: (r) => {
        const score = Number(r.complement_strength) || 0;
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
          <h1 className="text-4xl font-black tracking-tight text-foreground font-sans">Complement Ecosystem</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Map adjacent product categories and discover logical cross-sell and bundling vectors.
          </p>
        </div>
        <div className="text-right flex gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Ecosystem Nodes</p>
            <p className="text-3xl font-black font-mono text-foreground">{compResults.total_complement_products || 0}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Network Strength</p>
            <p className={cn("text-3xl font-black font-mono flex items-center gap-1", ecosystemStrength > 60 ? 'text-success' : 'text-primary')}>
              {ecosystemStrength.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      {/* Strategy KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-md text-primary"><LinkIcon className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Adjacencies</p>
            </div>
            <p className="text-3xl font-black">{compResults.total_complement_products || 0}</p>
            <p className="text-xs text-muted-foreground mt-2">Identified complementary products</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-success/10 rounded-md text-success"><PlusCircle className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cross-Sell Vectors</p>
            </div>
            <p className="text-3xl font-black">{crossSellOpps.length}</p>
            <p className="text-xs text-muted-foreground mt-2">Strategic expansion points</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-info/10 rounded-md text-info"><Network className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ecosystem Health</p>
            </div>
            <p className="text-3xl font-black">{ecosystemStrength.toFixed(1)}<span className="text-sm font-sans text-muted-foreground font-normal">/100</span></p>
            <p className="text-xs text-muted-foreground mt-2">Overall category connectivity</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-warning/10 rounded-md text-warning"><BarChart2 className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Linkage Mean</p>
            </div>
            <p className="text-3xl font-black">{averageStrength.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-2">Average complement correlation</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Ecosystem Density</CardTitle>
            <CardDescription>Complement concentration by subcategory</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compClusters.slice(0, 10)} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
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
                          <p className="text-primary mt-1">{payload[0].value} connected products</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="product_count" radius={[0, 4, 4, 0]} maxBarSize={30}>
                  {compClusters.slice(0, 10).map((_: any, index: number) => (
                     <Cell key={`cell-${index}`} fill="hsl(var(--primary))" fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Cross-Sell Opportunity Matrix</CardTitle>
            <CardDescription>High-probability expansion vectors identified</CardDescription>
          </CardHeader>
          <CardContent className="overflow-y-auto h-[350px] pr-2 custom-scrollbar">
            <div className="space-y-3">
              {crossSellOpps.map((opp: any, idx: number) => (
                <div key={idx} className="p-4 rounded-xl bg-card border border-border/50 hover:border-primary/50 transition-all shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-foreground font-sans flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" /> {opp.bridge_keyword}
                    </h3>
                    <Badge variant="outline" className="font-mono bg-primary/5 text-primary border-primary/20">
                      {opp.connection_count} nodes
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{opp.insight}</p>
                </div>
              ))}
              {crossSellOpps.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Layers className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground font-mono text-sm uppercase tracking-widest">No distinct cross-sell vectors detected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50 glass">
        <CardHeader>
          <CardTitle className="font-sans">Complementary Product Ledger</CardTitle>
          <CardDescription>Detailed index of identified ecosystem products and synergy scoring.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={compColumns} data={compProducts} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
