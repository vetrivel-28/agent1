import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { AlertCircle, Loader2, Activity, Info, TrendingUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
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

  const results = data.results || {};
  const scores = results.metric_scores || {};
  const velocityScore = results.velocity_score || 0;

  const searchTrend = scores['Normalized Search Trend'];
  const salesTrend = scores['Normalized Sales Trend'];
  const yoyGrowth = scores['Normalized YoY Growth'];
  const revenueTrend = scores['Normalized Revenue Trend'];

  const availableCount = [searchTrend, salesTrend, yoyGrowth, revenueTrend].filter(v => v != null).length;

  // 1. Trend Verdict Logic
  let verdictConfidence = "Very Limited Confidence";
  let verdictExplanation = "Confidence is very limited because only 1 signal is available.";
  if (availableCount === 4) {
    verdictConfidence = "High Confidence";
    verdictExplanation = "All growth signals are available, providing a complete picture of market demand.";
  } else if (availableCount === 3) {
    verdictConfidence = "Medium Confidence";
    verdictExplanation = "Confidence is moderate. Missing signals reduce full visibility into demand.";
  } else if (availableCount === 2) {
    verdictConfidence = "Limited Confidence";
    verdictExplanation = "Stable but Limited Signal. Confidence is limited because only 2 signals are available.";
    if (searchTrend != null && salesTrend != null) {
      verdictExplanation = "Stable but Limited Signal. Confidence is limited because only Search Trend and Sales Trend are available.";
    }
  }

  // 2. Signal Health Cards Logic
  const getSignalBucket = (val: number | null | undefined) => {
    if (val == null) return { label: "Not Available", status: "muted" };
    if (val >= 60) return { label: "Accelerator", status: "success" };
    if (val >= 40) return { label: "Stable", status: "warning" };
    return { label: "Decelerator", status: "danger" };
  };

  const signals = [
    { name: "Search Trend", value: searchTrend, source: "Magnet", ...getSignalBucket(searchTrend) },
    { name: "Sales Trend", value: salesTrend, source: "BlackBox", ...getSignalBucket(salesTrend) },
    { name: "YoY Growth", value: yoyGrowth, source: "Magnet", ...getSignalBucket(yoyGrowth) },
    { name: "Revenue Trend", value: revenueTrend, source: "BlackBox", ...getSignalBucket(revenueTrend) },
  ];

  // 3. Search vs Sales Alignment Logic
  let alignmentInsight = "Not enough data to compare Search vs Sales.";
  let actionRecommendation = "Validation required due to missing data.";
  
  if (searchTrend != null && salesTrend != null) {
    if (searchTrend >= 60 && salesTrend >= 60) {
      alignmentInsight = "Healthy growth: search interest and sales movement are both strong.";
      actionRecommendation = "Prioritize this market for deeper competitor and pricing analysis.";
    } else if (searchTrend >= 60 && salesTrend < 40) {
      alignmentInsight = "Interest without conversion: search interest is rising but sales are not keeping up.";
      actionRecommendation = "Investigate listing quality, price, reviews, and product-market fit before entering.";
    } else if (searchTrend < 40 && salesTrend >= 60) {
      alignmentInsight = "Sales holding despite weak search: demand may be driven by existing listings, repeat purchase, or non-search channels.";
      actionRecommendation = "Validate sales sources before relying on organic search strategy.";
    } else if (searchTrend < 40 && salesTrend < 40) {
      alignmentInsight = "Weak demand movement: both search and sales signals are soft.";
      actionRecommendation = "Treat this as a risk signal and avoid scaling without stronger validation.";
    } else {
      alignmentInsight = "Stable demand: search and sales signals are steady but not accelerating.";
      actionRecommendation = "Do not treat this market as fast-growing yet. Validate demand using stronger niche keywords, product sales consistency, and revenue movement before scaling.";
    }
  } else if (availableCount <= 2) {
    actionRecommendation = "Do not treat this market as fast-growing yet. Validate demand using stronger niche keywords, product sales consistency, and revenue movement before scaling.";
  }

  // 4. Missing Signals
  const missingSignals = signals.filter(s => s.value == null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Demand Trend Diagnostics</h1>
        <p className="text-muted-foreground mt-1">
          Shows whether market interest, sales movement, and available growth signals are aligned.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Trend Verdict Card */}
        <Card className="lg:col-span-2 border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Trend Verdict
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">{verdictConfidence}</div>
            <p className="text-muted-foreground text-sm">{verdictExplanation}</p>
          </CardContent>
        </Card>

        {/* Alignment Insight */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Search vs Sales Alignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{alignmentInsight}</p>
          </CardContent>
        </Card>
      </div>

      {/* Signal Health Cards */}
      <h2 className="text-xl font-bold mt-8 mb-4">Signal Health</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {signals.map((sig, idx) => (
          <Card key={idx} className={sig.value == null ? 'opacity-70 bg-muted/20' : ''}>
            <CardContent className="p-5 flex flex-col items-center text-center justify-center min-h-[140px]">
              <div className="text-sm font-bold text-muted-foreground mb-2">{sig.name}</div>
              {sig.value != null ? (
                <>
                  <div className="text-3xl font-bold mb-1">{Number(sig.value).toFixed(1)}</div>
                  <Badge variant={sig.status as any} className="mb-2">{sig.label}</Badge>
                </>
              ) : (
                <div className="text-lg font-medium text-muted-foreground mb-2 mt-2">Not Available</div>
              )}
              <div className="text-xs text-muted-foreground mt-auto">Source: {sig.source}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Missing Signals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              Missing Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {missingSignals.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  Confidence is limited because missing growth signals reduce certainty.
                </p>
                <ul className="space-y-2">
                  {missingSignals.map((m, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{m.name}:</span> Not Available
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="w-4 h-4" />
                All trend signals are available.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommended Action Card */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-5 h-5" />
              Recommended Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium leading-relaxed bg-primary/5 p-4 rounded-lg">
              {actionRecommendation}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Pulse Score & Transparency Note */}
      <div className="flex flex-col md:flex-row justify-between items-center mt-12 pt-6 border-t gap-4">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1 font-normal bg-background">
            Trend Pulse Score: <strong className="ml-1">{velocityScore.toFixed(1)} / 100</strong>
          </Badge>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground max-w-2xl bg-muted/20 p-3 rounded-lg">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            This is a market-level trend proxy. Magnet keyword trends and BlackBox product trends are processed separately and combined through averages. They are not joined row-wise.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
