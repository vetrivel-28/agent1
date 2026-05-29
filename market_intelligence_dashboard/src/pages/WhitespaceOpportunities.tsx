import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { DataTable, type Column } from '../components/tables/DataTable';
import { AlertCircle, Loader2, Target, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { KPICard } from '../components/ui/KPICard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, ZAxis, Cell } from 'recharts';
import { formatNumber } from '../utils/cn';

export default function WhitespaceOpportunities() {
  const { data: whitespaceData, isLoading: wsLoading, isError } = useQuery({
    queryKey: ['whitespace-opportunities'],
    queryFn: () => api.getWhitespaceOpportunities(15),
  });

  if (wsLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !whitespaceData || whitespaceData.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
          <p className="text-danger/80">Make sure Magnet dataset is uploaded.</p>
        </CardContent>
      </Card>
    );
  }

  const wsResults = whitespaceData.results || {};
  const wsKeywords = wsResults.top_whitespace_keywords || [];
  const distribution = wsResults.opportunity_distribution || {};

  // Calculate market_average_title_density since the backend doesn't provide it
  const averageTitleDensity = wsKeywords.length > 0 
    ? wsKeywords.reduce((acc: number, curr: any) => acc + Number(curr.title_density || 0), 0) / wsKeywords.length 
    : 0;

  const wsKeywordColumns: Column<any>[] = [
    { header: "Keyword", accessorKey: "keyword", cell: (r) => r.keyword || '—' },
    { header: "Search Volume", accessorKey: "search_volume", cell: (r) => formatNumber(r.search_volume) },
    { header: "Title Density", accessorKey: "title_density", cell: (r) => r.title_density != null ? formatNumber(r.title_density) : '—' },
    { header: "Whitespace Score", accessorKey: "whitespace_score", cell: (r) => r.whitespace_score != null ? Number(r.whitespace_score).toFixed(1) : '—' },
    { 
      header: "Opportunity", 
      accessorKey: "opportunity_label", 
      cell: (r) => {
        const colors: Record<string, string> = {
          'Extreme': 'text-primary font-bold',
          'High': 'text-success font-semibold',
          'Moderate': 'text-warning',
          'Low': 'text-muted-foreground'
        };
        const label = r.opportunity_label ? r.opportunity_label.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—';
        const key = label.split(' ')[0] || '';
        return <span className={colors[key] || ''}>{label}</span>;
      }
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border rounded-lg p-3 shadow-lg max-w-[250px]">
          <p className="font-semibold text-sm mb-1">{data.keyword}</p>
          <p className="text-xs text-muted-foreground">Score: {Number(data.whitespace_score).toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">Volume: {formatNumber(data.search_volume)}</p>
          <p className="text-xs text-muted-foreground">Density: {data.title_density}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Whitespace Opportunities</h1>
        <p className="text-muted-foreground mt-1">Find high-demand keywords with weak competitor optimization.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Overall Whitespace"
          value={`${Number(wsResults.overall_whitespace_score || 0).toFixed(1)}/100`}
          icon={<Target className="w-5 h-5" />}
          status={(wsResults.overall_whitespace_score || 0) > 60 ? 'success' : 'neutral'}
        />
        <KPICard 
          title="High Opportunity"
          value={`${distribution.high_opportunity || 0}`}
          icon={<BarChart2 className="w-5 h-5" />}
          status="success"
        />
        <KPICard 
          title="Extreme Opportunity"
          value={`${distribution.extreme_opportunity || 0}`}
          icon={<Target className="w-5 h-5 text-primary" />}
          status="neutral"
        />
        <KPICard 
          title="Avg Title Density"
          value={`${averageTitleDensity.toFixed(1)}`}
          icon={<BarChart2 className="w-5 h-5" />}
          status="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Whitespace Opportunity Ranking</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wsKeywords.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis dataKey="keyword" type="category" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} tick={{fill: "hsl(var(--foreground))"}} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="whitespace_score" radius={[0, 4, 4, 0]}>
                  {wsKeywords.slice(0, 10).map((entry: any, index: number) => {
                     let fill = 'hsl(var(--primary))';
                     const lbl = (entry.opportunity_label || '').toLowerCase();
                     if (lbl.includes('extreme')) fill = 'hsl(var(--primary))';
                     else if (lbl.includes('high')) fill = 'hsl(var(--success))';
                     else if (lbl.includes('moderate')) fill = 'hsl(var(--warning))';
                     else fill = 'hsl(var(--muted))';
                     return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Opportunity Heatmap (Volume vs Density)</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="title_density" name="Density" stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: 'Title Density', position: 'insideBottom', offset: -10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="number" dataKey="search_volume" name="Volume" stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: 'Search Volume', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }} />
                <ZAxis type="number" dataKey="whitespace_score" range={[50, 400]} name="Score" />
                <Tooltip content={<CustomTooltip />} cursor={{strokeDasharray: '3 3'}} />
                <Scatter data={wsKeywords} fill="hsl(var(--primary))" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Whitespace Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={wsKeywordColumns} data={wsKeywords} pageSize={10} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
