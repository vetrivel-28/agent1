import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { formatCurrency, formatNumber } from '../utils/cn';
import { AlertCircle, Loader2, Activity, BarChart2, Zap } from 'lucide-react';
import { Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, ZAxis, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter } from 'recharts';
import { KPICard } from '../components/ui/KPICard';
import { motion } from 'framer-motion';

export default function PriceElasticity() {
  const { data: elasticityData, isLoading: peLoading, isError } = useQuery({
    queryKey: ['price-elasticity'],
    queryFn: () => api.getPriceElasticity(5),
  });

  if (peLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !elasticityData || elasticityData.status !== 'success') {
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

  const peResults = elasticityData.results || {};
  
  // Map buckets for frontend usage
  const peBuckets = (peResults.price_buckets || []).map((b: any) => ({
    ...b,
    bucket: `$${b.price_range?.min} - $${b.price_range?.max}`,
  }));

  const strongestBucket = peResults.strongest_price_ranges?.[0];
  const highestDemand = strongestBucket?.bucket || (strongestBucket ? `$${strongestBucket.price_range?.min} - $${strongestBucket.price_range?.max}` : '—');
  
  const revenueSorted = [...peBuckets].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
  const highestRevenue = revenueSorted[0]?.bucket || '—';

  const deadZones = peResults.dead_zones || [];
  const pricingInsights = peResults.pricing_insights || [];

  const peColumns: Column<any>[] = [
    { header: "Price Range", accessorKey: "bucket", cell: (r) => r.bucket || '—' },
    { header: "Total Sales", accessorKey: "total_sales", cell: (r) => r.total_sales != null ? formatNumber(r.total_sales) : '—' },
    { header: "Total Revenue", accessorKey: "total_revenue", cell: (r) => r.total_revenue != null ? formatCurrency(r.total_revenue) : '—' },
    { header: "Demand Score", accessorKey: "demand_score", cell: (r) => r.demand_score != null ? Number(r.demand_score).toFixed(1) : '—' },
    { header: "Market Share", accessorKey: "market_share", cell: (r) => r.market_share != null ? `${Number(r.market_share).toFixed(1)}%` : '—' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Price Range Performance</h1>
        <p className="text-muted-foreground mt-1">Find strongest-performing price ranges and identify demand dead zones.</p>
        <p className="text-sm text-muted-foreground">This is a proxy price-band performance analysis, not causal price elasticity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Strongest Price Range"
          value={highestDemand}
          icon={<Zap className="w-5 h-5 text-success" />}
          status="success"
        />
        <KPICard 
          title="Highest Demand Bucket"
          value={highestDemand}
          icon={<Activity className="w-5 h-5" />}
          status="success"
        />
        <KPICard 
          title="Highest Revenue Bucket"
          value={highestRevenue}
          icon={<BarChart2 className="w-5 h-5" />}
          status="success"
        />
        <KPICard 
          title="Dead Zones"
          value={`${deadZones.length}`}
          icon={<AlertCircle className="w-5 h-5 text-danger" />}
          status={deadZones.length > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Price Range Sales</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peBuckets} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => formatNumber(val)} />
                <Tooltip formatter={(val: any) => formatNumber(val)} />
                <Bar dataKey="total_sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={peBuckets} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `$${formatNumber(val)}`} />
                <Tooltip formatter={(val: any) => formatCurrency(val)} />
                <Area type="monotone" dataKey="total_revenue" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Demand Heatmap</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="category" dataKey="bucket" name="Price Bucket" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="number" dataKey="demand_score" name="Demand Score" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <ZAxis type="number" dataKey="total_sales" range={[50, 800]} name="Sales" />
                <Tooltip cursor={{strokeDasharray: '3 3'}} />
                <Scatter data={peBuckets} fill="hsl(var(--warning))" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {(deadZones.length > 0 || pricingInsights.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {deadZones.length > 0 && (
            <Card className="bg-danger/5 border-danger/20">
              <CardHeader>
                <CardTitle className="text-danger flex items-center gap-2"><AlertCircle className="w-5 h-5"/> Dead Zones Detected</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-2">
                  {deadZones.map((dz: any, i: number) => (
                    <li key={i} className="text-sm text-danger/80">
                      Demand weakens from ${dz.before_range?.max} to ${dz.after_range?.min} (Drop: {dz.sales_drop_percentage}%)
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {pricingInsights.length > 0 && (
            <Card className="bg-success/5 border-success/20">
              <CardHeader>
                <CardTitle className="text-success flex items-center gap-2"><Zap className="w-5 h-5"/> Pricing Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-2">
                  {pricingInsights.map((pi: string, i: number) => (
                    <li key={i} className="text-sm text-success/80">{pi}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Price Bucket Table</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={peColumns} data={peBuckets} pageSize={5} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
