import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { ScoreGauge } from '../components/ui/ScoreGauge';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Loader2, Landmark, Megaphone, Crown, AlertTriangle, Warehouse, DoorOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { AttractivenessMatrix } from '../components/charts/AttractivenessMatrix';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';

type FinanceMetric = {
  status?: string;
  score?: number | null;
  classification?: string;
  risk?: string;
  mini_insight?: string;
  capital_requirement?: string;
};

function MetricCard({
  title,
  metric,
  icon,
}: {
  title: string;
  metric: FinanceMetric;
  icon: ReactNode;
}) {
  const insufficient = metric?.status === 'insufficient_data';
  const score = metric?.score;
  const label = metric?.classification || metric?.risk || 'Not Available';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {insufficient ? (
          <p className="text-sm text-muted-foreground">Insufficient Data</p>
        ) : (
          <>
            <p className="text-3xl font-bold">{score != null ? `${Number(score).toFixed(0)}` : '—'}</p>
            <Badge variant="outline" className="mt-2">{label}</Badge>
          </>
        )}
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {metric?.mini_insight || 'Upload required datasets to compute this metric.'}
        </p>
      </CardContent>
    </Card>
  );
}

export default function FinanceIntelligence() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-intelligence'],
    queryFn: () => api.getFinanceIntelligence(),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Finance Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-lg">
            {getEngineErrorMessage(data, 'Upload Magnet and BlackBox datasets with finance columns (PPC, CPR, Price, Revenue, Storage fees).')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results || {};
  const overview = results.overview_panel || {};
  const health = results.finance_health || {};
  const radar = (results.radar_chart || []).map((d: { dimension: string; score: number }) => ({
    subject: d.dimension,
    score: Number(d.score) || 0,
    fullMark: 100,
  }));
  const heatmap = results.premium_viability?.price_elasticity_heatmap || [];
  const riskScore = Number(results.economic_risk_gauge) || 0;
  const matrix = results.economic_attractiveness_matrix || {};

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-primary">Finance Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Market economics: advertising pressure, pricing power, margin risk, capital efficiency, and entry cost.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="flex flex-col items-center justify-center p-6">
          <ScoreGauge
            score={Number(health.finance_health) || 0}
            label="Finance Health"
            size={180}
          />
          <p className="font-semibold mt-4 text-center">{health.classification || overview.economic_attractiveness}</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Finance Overview</CardTitle>
            <CardDescription>Aggregate market economics signals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {[
                ['Economic Attractiveness', overview.economic_attractiveness],
                ['Capital Requirement', overview.capital_requirement],
                ['Entry Difficulty', overview.entry_difficulty],
                ['Pricing Power', overview.pricing_power],
                ['Price War Risk', overview.price_war_risk],
              ].map(([label, value]) => (
                <div key={label} className="p-3 rounded-lg bg-muted/30 border">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
                  <p className="font-semibold mt-1">{value || 'Not Available'}</p>
                </div>
              ))}
            </div>
            {results.market_economics_narrative && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed border-t pt-4">
                {results.market_economics_narrative}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard title="Advertising Pressure" metric={results.advertising_pressure || {}} icon={<Megaphone className="w-4 h-4 text-primary" />} />
        <MetricCard title="Premium Viability" metric={results.premium_viability || {}} icon={<Crown className="w-4 h-4 text-primary" />} />
        <MetricCard title="Margin Compression" metric={results.margin_compression || {}} icon={<AlertTriangle className="w-4 h-4 text-primary" />} />
        <MetricCard title="Capital Efficiency" metric={results.capital_efficiency || {}} icon={<Warehouse className="w-4 h-4 text-primary" />} />
        <MetricCard title="Entry Cost Index" metric={results.entry_cost || {}} icon={<DoorOpen className="w-4 h-4 text-primary" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Finance Radar</CardTitle>
            <CardDescription>Five-dimension market economics profile</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {radar.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.35} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No radar data available.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Economic Risk Gauge</CardTitle>
            <CardDescription>Higher values indicate elevated economic risk</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-80">
            <ScoreGauge score={riskScore} label="Risk Level" size={200} />
            <div className="flex gap-4 mt-6 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Low (0–33)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500" /> Medium (34–66)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> High (67–100)</span>
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center max-w-sm">
              {results.economic_verdict || 'Economic verdict pending sufficient data.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {matrix?.quadrant && (
        <AttractivenessMatrix data={matrix} />
      )}

      {heatmap.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Premium Viability Heatmap</CardTitle>
            <CardDescription>Revenue share and competition density by price band</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatmap} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                <XAxis dataKey="price_band" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                <Bar dataKey="revenue_share" name="Revenue Share %" radius={[4, 4, 0, 0]}>
                  {heatmap.map((_: unknown, i: number) => (
                    <Cell key={i} fill={['#94a3b8', '#64748b', '#3b82f6', '#1d4ed8'][i] || '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 flex gap-4 items-start">
          <Landmark className="w-8 h-8 text-primary shrink-0" />
          <div>
            <h3 className="font-semibold text-lg">Economic Verdict</h3>
            <p className="text-muted-foreground mt-1">{results.economic_verdict || 'Not Available'}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
