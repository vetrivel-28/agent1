import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICard';
import { ScoreGauge } from '../components/ui/ScoreGauge';
import { AlertCircle, Loader2, FastForward, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '../components/ui/Badge';

export default function DemandVelocity() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['demand-velocity'],
    queryFn: () => api.getDemandVelocity(10),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data || data.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
          <p className="text-danger/80">Velocity analysis requires multiple datasets.</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results;
  const strongest = results.strongest_growth_signals || [];
  const weakest = results.weakest_growth_signals || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Demand Velocity</h1>
        <p className="text-muted-foreground mt-1">
          Measures how fast market demand is accelerating by combining sales, search trends, and YoY growth.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="flex flex-col items-center justify-center p-8">
          <ScoreGauge score={results.velocity_score || 0} label="Velocity Score" size={200} />
        </Card>
        
        <KPICard 
          title="Market Phase"
          value={results.market_phase || 'Unknown'}
          icon={<Activity className="w-5 h-5" />}
          status={results.velocity_score > 60 ? 'success' : 'neutral'}
        />
        
        <KPICard 
          title="Metrics Used"
          value={`${results.metrics_used?.length || 0} signals`}
          icon={<FastForward className="w-5 h-5" />}
          status="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Strong Accelerators</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {strongest.map((sig: any, i: number) => (
                <li key={i} className="flex justify-between items-center p-3 border rounded-lg bg-success/5">
                  <span className="font-medium text-sm max-w-[200px] truncate">{sig.signal}</span>
                  <div className="flex gap-2">
                    <Badge variant="success" className="text-xs">signal</Badge>
                    <Badge variant="outline" className="text-xs bg-background">{Number(sig.score || 0).toFixed(1)}/100</Badge>
                  </div>
                </li>
              ))}
              {strongest.length === 0 && (
                <li className="text-sm text-muted-foreground p-3">No strong signals detected.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decelerators (Bleeding Momentum)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {weakest.map((sig: any, i: number) => (
                <li key={i} className="flex justify-between items-center p-3 border rounded-lg bg-danger/5">
                  <span className="font-medium text-sm max-w-[200px] truncate">{sig.signal}</span>
                  <div className="flex gap-2">
                    <Badge variant="danger" className="text-xs">signal</Badge>
                    <Badge variant="outline" className="text-xs bg-background">{Number(sig.score || 0).toFixed(1)}/100</Badge>
                  </div>
                </li>
              ))}
              {weakest.length === 0 && (
                <li className="text-sm text-muted-foreground p-3">No weak signals detected.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
