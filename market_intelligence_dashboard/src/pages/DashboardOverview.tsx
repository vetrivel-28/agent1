import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { KPICard } from '../components/ui/KPICard';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/cn';
import { Link } from 'react-router-dom';
import { 
  Activity, Zap, TrendingUp, DollarSign, Database, AlertTriangle, ArrowRight, Landmark
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AttractivenessMatrix } from '../components/charts/AttractivenessMatrix';

export default function DashboardOverview() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['market-report'],
    queryFn: () => api.getMarketReport(5),
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
  });

  const hasBlackbox = health?.datasets_loaded?.blackbox;

  if (!hasBlackbox && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto space-y-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Database className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight">No Data Available</h2>
        <p className="text-muted-foreground">
          You need to upload datasets before the market intelligence engines can generate insights.
        </p>
        <Link to="/upload">
          <Button size="lg" className="group">
            Upload Datasets 
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-muted animate-pulse rounded-2xl" />
          <div className="h-96 bg-muted animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-danger/50 bg-danger/5 max-w-2xl mx-auto mt-20">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Engines Failed</h2>
          <p className="text-danger/80 mb-6">
            {(error as any)?.response?.data?.detail?.[0]?.msg || (error as any)?.message || "Failed to generate market report."}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>Retry Analysis</Button>
        </CardContent>
      </Card>
    );
  }

  const results = data?.results || {};
  const engineScores = results.engine_scores || {};
  const marketOverview = results.market_overview || {};
  const marketHealth = results.market_health || {};
  const finalVerdict = results.final_market_verdict || {};
  const opportunitySignals = results.opportunity_signals || {};
  const riskSignals = results.risk_signals || {};
  const topKeywords = results.rankings?.top_demand_keywords || [];
  const marketEconomics = results.executive_summary?.market_economics || results.market_economics_narrative || '';
  const financeScore = results.engine_scores?.finance_health ?? results.pillar_scores?.finance;
  const attractivenessMatrix = results.economic_attractiveness_matrix
    || results.finance_intelligence?.economic_attractiveness_matrix
    || {};
  const finalVerdictDetails = results.final_market_verdict || {};

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Executive Dashboard</h1>
          <p className="text-muted-foreground mt-1">Live market telemetry and growth signals.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs py-1">
            Processed in: {data?.processing_time_seconds?.toFixed(2)}s
          </Badge>
          <Badge variant="success" className="text-xs py-1">Live Engines</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="flex flex-col gap-1">
          <KPICard 
            title="Market Direction"
            value={marketHealth.market_direction || marketOverview.market_direction || 'Unknown'}
            icon={<TrendingUp className="w-5 h-5" />}
            status={
              (marketHealth.market_direction || marketOverview.market_direction) === 'growing'
                ? 'success'
                : (marketHealth.market_direction || marketOverview.market_direction) === 'stable'
                ? 'warning'
                : 'danger'
            }
          />
          <p className="text-[10px] text-muted-foreground px-1 leading-tight">
            {marketHealth.market_direction_explanation || marketOverview.market_direction_explanation || ''}
          </p>
        </div>
        <KPICard 
          title="Market Revenue"
          value={formatCurrency(marketOverview.total_market_revenue || 0)}
          icon={<DollarSign className="w-5 h-5" />}
          status="neutral"
        />
        <KPICard 
          title="Final Market Score"
          value={`${(finalVerdictDetails.final_market_score ?? results.executive_summary?.final_market_score ?? 0).toFixed(1)}/100`}
          icon={<Activity className="w-5 h-5" />}
          status={
            (finalVerdictDetails.final_market_score ?? 0) >= 60 ? 'success' : 'warning'
          }
        />
      </div>

      {financeScore != null && Number(financeScore) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-primary" />
              Market Economics
            </CardTitle>
            <CardDescription>Finance Intelligence pillar — health score {Number(financeScore).toFixed(0)}/100</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {marketEconomics || 'Upload datasets with finance columns to generate market economics narrative.'}
            </p>
          </CardContent>
        </Card>
      )}

      {attractivenessMatrix?.quadrant && (
        <AttractivenessMatrix data={attractivenessMatrix} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Market Verdict</CardTitle>
            <CardDescription>Synthesized finding from all engines.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
             <div className="p-6 rounded-xl bg-primary/5 border border-primary/10 h-full flex flex-col justify-center">
                <h3 className="text-2xl font-semibold mb-4 text-primary">
                  {finalVerdict.verdict || "Analysis Pending"}
                </h3>
                {finalVerdictDetails.market_rating && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Rating: <strong>{finalVerdictDetails.market_rating}</strong>
                    {finalVerdictDetails.final_market_score != null && (
                      <> · Score: <strong>{finalVerdictDetails.final_market_score}/100</strong></>
                    )}
                  </p>
                )}
                {finalVerdictDetails.launch_recommendation && (
                  <p className="text-sm mb-4">{finalVerdictDetails.launch_recommendation}</p>
                )}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Opportunities</h4>
                    <ul className="space-y-2">
                      {opportunitySignals.signals?.slice(0, 3).map((sig: string, i: number) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <Zap className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                          <span>{sig}</span>
                        </li>
                      )) || <li className="text-sm text-muted-foreground">No prominent signals.</li>}
                    </ul>
                  </div>
                </div>
             </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Factors</CardTitle>
            <CardDescription>Detected market hostilities and barriers.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {riskSignals.signals?.map((risk: string, i: number) => (
                <li key={i} className="flex gap-3 text-sm p-3 bg-danger/5 border border-danger/10 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
                  <span>{risk}</span>
                </li>
              )) || <li className="text-sm text-muted-foreground">No significant risks detected.</li>}
            </ul>
            
            <div className="mt-8 pt-6 border-t">
              <h4 className="text-sm font-semibold mb-3">Top Keyword Demand</h4>
              <div className="flex flex-wrap gap-2">
                {topKeywords.map((kw: any, i: number) => (
                  <Badge key={i} variant="outline" className="bg-background">
                    {kw.keyword}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
