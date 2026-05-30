import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Users, Activity, BarChart2, Zap, Target, Hexagon, Crosshair
} from 'lucide-react';
import { Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, XAxis, YAxis, ZAxis, Treemap, Cell } from 'recharts';
import { motion } from 'framer-motion';

export default function DirectCompetitors() {
  const { data: directCompData, isLoading: dcLoading, isError } = useQuery({
    queryKey: ['direct-competitors'],
    queryFn: () => api.getDirectCompetitors(15, 17.5),
  });

  if (dcLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3 theme-indigo">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Mapping Competitive Landscape...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(directCompData)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-10 theme-indigo">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">Landscape Mapping Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(directCompData, 'Requires BlackBox with Title, Category, and Price.')}</p>
        </CardContent>
      </Card>
    );
  }

  const dcResults = directCompData.results || {};
  
  const allCompetitorsRaw = dcResults.direct_competitors || [];
  const dcCompetitors = allCompetitorsRaw.flatMap((ref: any) => ref.top_competitors || []);

  const averageSimilarity = dcCompetitors.length > 0
    ? dcCompetitors.reduce((acc: number, curr: any) => acc + Number(curr.similarity_score || 0), 0) / dcCompetitors.length
    : 0;

  const averagePrice = dcResults.price_positioning?.price_distribution?.mean || 0;

  const clusterDistribution = (dcResults.market_clusters || []).map((c: any) => ({
    cluster: `${c.category} > ${c.subcategory}`,
    product_count: c.cluster_size
  }));

  const dcColumns: ColumnDef<any>[] = [
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
    { header: "Price", cell: (r) => <span className="font-mono">{r.price != null ? formatCurrency(r.price) : '—'}</span> },
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
      header: "Threat Score", 
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

  const CustomTreemapTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl text-sm space-y-1 font-mono">
          <p className="font-bold text-foreground text-xs">{payload[0].payload.cluster}</p>
          <p className="text-muted-foreground text-[10px] uppercase mt-2">Product Density</p>
          <p className="font-medium text-primary text-lg">{payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-indigo">
      
      {/* Header — Product Strategy Style */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 mb-3 border border-primary/20 font-mono tracking-widest uppercase rounded-sm">
            Product Intelligence
          </Badge>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-sans">Direct Competitors</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Map the immediate competitive radius, track positioning overlaps, and identify direct substitutes.
          </p>
        </div>
        <div className="text-right flex gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Vector Density</p>
            <p className="text-3xl font-black font-mono text-foreground">{dcResults.total_products_analyzed || 0}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Threat Index</p>
            <p className={cn("text-3xl font-black font-mono flex items-center gap-1", averageSimilarity > 50 ? 'text-danger' : 'text-primary')}>
              {averageSimilarity.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      {/* Strategy KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-md text-primary"><Users className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market Vectors</p>
            </div>
            <p className="text-3xl font-black">{dcResults.total_products_analyzed || 0}</p>
            <p className="text-xs text-muted-foreground mt-2">Analyzed competitors</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-info/10 rounded-md text-info"><Hexagon className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sub-Clusters</p>
            </div>
            <p className="text-3xl font-black">{dcResults.total_clusters || 0}</p>
            <p className="text-xs text-muted-foreground mt-2">Taxonomy groupings</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-warning/10 rounded-md text-warning"><Crosshair className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Similarity Mean</p>
            </div>
            <p className="text-3xl font-black">{averageSimilarity.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground mt-2">Average threat score</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-card/40 glass shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-success/10 rounded-md text-success"><Zap className="w-4 h-4" /></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market Peg</p>
            </div>
            <p className="text-3xl font-black">{formatCurrency(averagePrice)}</p>
            <p className="text-xs text-muted-foreground mt-2">Mean pricing vector</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Positioning Matrix</CardTitle>
            <CardDescription>Price vs. Similarity Mapping</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis type="number" dataKey="price" name="Price" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(val) => `$${val}`} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="similarity_score" name="Similarity" stroke="hsl(var(--muted-foreground))" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} />
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
                              <p className="text-[10px] text-muted-foreground uppercase">Price</p>
                              <p>{formatCurrency(data.price)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Threat</p>
                              <p className="text-danger">{Number(data.similarity_score).toFixed(1)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter data={dcCompetitors}>
                  {dcCompetitors.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill="hsl(var(--primary))" fillOpacity={entry.similarity_score > 60 ? 0.8 : 0.4} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-muted/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Taxonomy Density</CardTitle>
            <CardDescription>Competitive clustering by category</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={clusterDistribution}
                dataKey="product_count"
                nameKey="cluster"
                stroke="hsl(var(--background))"
                fill="hsl(var(--primary))"
                fillOpacity={0.8}
              >
                <Tooltip content={<CustomTreemapTooltip />} />
              </Treemap>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50 glass">
        <CardHeader>
          <CardTitle className="font-sans">Competitor Ledger</CardTitle>
          <CardDescription>Detailed index of identified direct competitors and threat scoring.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={dcColumns} data={dcCompetitors} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
