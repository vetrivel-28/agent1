import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICard';
import { ScoreGauge } from '../components/ui/ScoreGauge';
import { AlertCircle, Loader2, FastForward, Activity, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Cell } from 'recharts';

import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ChartContainer } from '../components/ui/ChartContainer';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { formatGenericLabel } from '../utils/formatters';


export default function DemandVelocity() {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const categoryKey = statusData?.data?.category_scope?.selected_categories?.join('|') || 'all';
  const categoryScope = statusData?.data?.category_scope || {};

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['demand-velocity', categoryKey],
    queryFn: () => api.getDemandVelocity(10, categoryScope),
  });

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Velocity Analysis Unavailable</h2>
          <p className="text-danger/80">Velocity analysis requires multiple datasets. {error instanceof Error ? error.message : ''}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.data?.results || {};
  const strongest = results.strongest_growth_signals || [];
  const weakest = results.weakest_growth_signals || [];
  const velocityScore = results.velocity_score || 0;

  // Chart data
  const combinedChartData = [
    ...strongest.map((s: any) => ({ name: s.signal, score: s.score, type: 'strong' })),
    ...weakest.map((s: any) => ({ name: s.signal, score: s.score, type: 'weak' }))
  ].sort((a, b) => b.score - a.score);

  const narrative = `Market velocity is currently scoring ${velocityScore.toFixed(1)}/100, placing the market in a '${results.market_phase || 'Transitional'}' phase. There are ${strongest.length} strong accelerators pushing the category forward, while ${weakest.length} decelerators show bleeding momentum.`;

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      
      <PageHeader 
        badge="Momentum Intelligence"
        title="Demand Velocity Tracking"
        description="Measures how fast market demand is accelerating by combining sales trajectories, search intent trends, and year-over-year momentum."
      />

      <PageSection title="1. Macro Trajectory Metrics">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="flex flex-col items-center justify-center p-8 border-border/40 bg-card">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Overall Velocity Score</span>
            <ScoreGauge score={velocityScore} label="" size={200} />
          </Card>
          
          <KPICard 
            label="Market Phase"
            value={results.market_phase || 'Unknown'}
            implication={velocityScore > 60 ? 'Market is expanding rapidly. Aggressive entry recommended.' : 'Market is cooling. Focus on margin retention.'}
            icon={Target}
            confidence={88}
          />
          
          <KPICard 
            label="Metrics Used"
            value={`${results.metrics_used?.length || 0} signals`}
            implication="Number of unique temporal data points analyzed to calculate velocity."
            icon={FastForward}
            confidence={99}
          />
        </div>
      </PageSection>

      <PageSection title="2. Velocity Spectrum">
        <ChartContainer 
          title="Growth Accelerators vs Decelerators"
          xAxisLabel="Signal Name"
          yAxisLabel="Velocity Score (0-100)"
          businessExplanation="Compares the strongest upward momentum vectors against the segments losing traction the fastest. Focus R&D on the blue signals, avoid the red."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={combinedChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 11}} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <RechartsTooltip cursor={{fill: 'hsl(var(--muted))'}} contentStyle={{ borderRadius: '8px' }} />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {combinedChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.type === 'strong' ? '#3b82f6' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </PageSection>

      <PageSection title="3. Signal Breakdown">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-success/20 bg-card">
            <CardContent className="p-0">
              <div className="p-4 bg-success/5 border-b border-success/10 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-success" />
                <h3 className="font-bold text-success">Strong Accelerators</h3>
              </div>
              <ul className="divide-y divide-border/40">
                {strongest.map((sig: any, i: number) => (
                  <li key={i} className="flex justify-between items-center p-4 hover:bg-success/5 transition-colors">
                    <span className="font-medium text-sm text-foreground">{sig.signal}</span>
                    <Badge variant="outline" className="bg-success/10 text-success border-success/30 font-mono">
                      {Number(sig.score || 0).toFixed(1)}/100
                    </Badge>
                  </li>
                ))}
                {strongest.length === 0 && (
                  <li className="text-sm text-muted-foreground p-4 text-center">No strong signals detected.</li>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-card">
            <CardContent className="p-0">
              <div className="p-4 bg-danger/5 border-b border-danger/10 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-danger" />
                <h3 className="font-bold text-danger">Decelerators (Bleeding Momentum)</h3>
              </div>
              <ul className="divide-y divide-border/40">
                {weakest.map((sig: any, i: number) => (
                  <li key={i} className="flex justify-between items-center p-4 hover:bg-danger/5 transition-colors">
                    <span className="font-medium text-sm text-foreground">{sig.signal}</span>
                    <Badge variant="outline" className="bg-danger/10 text-danger border-danger/30 font-mono">
                      {Number(sig.score || 0).toFixed(1)}/100
                    </Badge>
                  </li>
                ))}
                {weakest.length === 0 && (
                  <li className="text-sm text-muted-foreground p-4 text-center">No weak signals detected.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      </PageSection>

    </div>
  );
}
