import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { AttractivenessMatrix } from '../components/charts/AttractivenessMatrix';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Megaphone, DoorOpen, Landmark,
  TrendingUp, TrendingDown, Lightbulb, Info, ShieldCheck,
  DollarSign, Check,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number, invert = false): string {
  const s = invert ? 100 - score : score;
  if (s <= 33) return 'text-emerald-500';
  if (s <= 66) return 'text-yellow-500';
  return 'text-red-500';
}

function classColor(cls: string): string {
  const low = ['Low', 'Easy', 'Light', 'Accessible', 'Attractive', 'Highly Attractive', 'Favourable'];
  const high = ['High', 'Difficult', 'Heavy', 'Challenging', 'Less Attractive', 'Unattractive'];
  if (low.some((l) => cls?.includes(l))) return 'text-emerald-500';
  if (high.some((h) => cls?.includes(h))) return 'text-red-500';
  return 'text-yellow-500';
}

function classBg(cls: string): string {
  const low = ['Low', 'Easy', 'Light', 'Accessible', 'Attractive', 'Highly Attractive', 'Favourable'];
  const high = ['High', 'Difficult', 'Heavy', 'Challenging', 'Less Attractive', 'Unattractive'];
  if (low.some((l) => cls?.includes(l))) return 'bg-emerald-500/10 border-emerald-500/30';
  if (high.some((h) => cls?.includes(h))) return 'bg-red-500/10 border-red-500/30';
  return 'bg-yellow-500/10 border-yellow-500/30';
}

function mapHealthClass(cls: string): string {
  const map: Record<string, string> = {
    'Excellent Economics': 'Highly Attractive',
    'Attractive': 'Attractive',
    'Moderate': 'Moderate',
    'Challenging': 'Challenging',
    'Unattractive': 'Less Attractive',
  };
  return map[cls] ?? cls;
}

function marketRiskLabel(score: number): string {
  if (score <= 33) return 'Low';
  if (score <= 66) return 'Moderate';
  return 'High';
}

function sanitizeExecutiveText(text: string): string {
  return text
    .replace(/\bexcellent economics\b/gi, 'favorable')
    .replace(/\bstrong profitability\b/gi, 'favorable entry conditions')
    .replace(/\battractive returns\b/gi, 'attractive entry conditions')
    .replace(/\bhigh roi\b/gi, 'entry potential')
    .replace(/\bprofitab\w*\b/gi, 'entry')
    .replace(/\bmargin(s)?\b/gi, 'positioning')
    .replace(/\beconomics\b/gi, 'market conditions')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

type MetricBlock = {
  status?: string;
  score?: number | null;
  classification?: string;
  risk?: string;
  mini_insight?: string;
  capital_requirement?: string;
};

function metricOk(block: MetricBlock | undefined): boolean {
  return block?.status === 'success' && block.score != null;
}

function safeInsight(block: MetricBlock, fallback: string): string {
  const raw = block.mini_insight;
  if (!raw || /required columns|not found|columns not|profitab|margin compression|capital efficiency/i.test(raw)) {
    return fallback;
  }
  return sanitizeExecutiveText(raw);
}

// ---------------------------------------------------------------------------
// Tooltip wrapper
// ---------------------------------------------------------------------------

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-60">
        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed">
          {text}
        </div>
        <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

interface KpiProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
}

function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip }: KpiProps) {
  return (
    <Card className="hover-card-anim">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {tooltip && (
              <Tip text={tooltip}>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </Tip>
            )}
          </div>
          <div className={cn('p-2 rounded-lg border', bg)}>
            <span className={color}>{icon}</span>
          </div>
        </div>
        <p className={cn('text-2xl font-bold leading-tight', color)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metric cards
// ---------------------------------------------------------------------------

function MetricDetail({
  title, description, score, classification, insight, icon, invertColor = false,
}: {
  title: string; description: string; score: number; classification: string;
  insight: string; icon: React.ReactNode; invertColor?: boolean;
}) {
  const color = scoreColor(score, invertColor);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className={classColor(classification)}>{icon}</span>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-4xl font-bold', color)}>{score.toFixed(0)}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className={cn('text-sm font-semibold mt-0.5', classColor(classification))}>{classification}</p>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={cn('h-2 rounded-full transition-all', color.replace('text-', 'bg-'))}
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
      </CardContent>
    </Card>
  );
}

function BulletList({
  items,
  variant,
  emptyMessage,
}: {
  items: string[];
  variant: 'opportunity' | 'risk';
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const dotClass = variant === 'opportunity' ? 'text-emerald-500' : 'text-red-500';
  const Icon = variant === 'opportunity' ? Check : null;

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {Icon ? (
            <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', dotClass)} />
          ) : (
            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2', dotClass.replace('text-', 'bg-'))} />
          )}
          <span className="text-foreground/90 leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FinanceIntelligence() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-intelligence'],
    queryFn: () => api.getFinanceIntelligence(),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3 theme-teal">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Evaluating Market Economics...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-10 theme-teal">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2 font-serif">Market Entry Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-lg">
            {getEngineErrorMessage(data, 'Upload Magnet and BlackBox datasets to generate market entry signals.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const results = data.results || {};
  const api_data = (results.advertising_pressure || {}) as MetricBlock;
  const pvs_data = (results.premium_viability || {}) as MetricBlock;
  const eci_data = (results.entry_cost || {}) as MetricBlock;
  const financeHealthBlock = results.finance_health || {};

  const apiOk = metricOk(api_data);
  const pvsOk = metricOk(pvs_data);
  const eciOk = metricOk(eci_data);

  const apiScore = apiOk ? Number(api_data.score) : null;
  const eciScore = eciOk ? Number(eci_data.score) : null;
  const pvsScore = pvsOk ? Number(pvs_data.score) : null;

  const healthOk = financeHealthBlock.status === 'success';
  const marketAttractivenessScore = healthOk
    ? Number(financeHealthBlock.finance_health ?? 0)
    : (apiOk || eciOk)
      ? (() => {
          const parts: number[] = [];
          if (apiOk) parts.push(100 - apiScore!);
          if (eciOk) parts.push(100 - eciScore!);
          return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
        })()
      : null;

  const marketAttractivenessLabel = healthOk
    ? mapHealthClass(String(financeHealthBlock.classification ?? '—'))
    : marketAttractivenessScore == null
      ? '—'
      : marketAttractivenessScore >= 75
        ? 'Highly Attractive'
        : marketAttractivenessScore >= 55
          ? 'Attractive'
          : marketAttractivenessScore >= 35
            ? 'Moderate'
            : 'Challenging';

  const marketRiskScore = Number(results.economic_risk_gauge ?? 50);
  const marketRiskClass = marketRiskLabel(marketRiskScore);

  const accessibilityLabel = !eciOk
    ? '—'
    : eci_data.classification === 'Easy'
      ? 'Accessible'
      : eci_data.classification === 'Moderate'
        ? 'Moderately Accessible'
        : 'Difficult';

  const competitionCostLabel = !eciOk
    ? '—'
    : eciScore! <= 33
      ? 'Low'
      : eciScore! <= 66
        ? 'Moderate'
        : 'High';

  // ── Metric-backed opportunities (favorable signals only) ─────────────────

  const opportunities: string[] = [];

  if (apiOk && api_data.classification === 'Low') {
    opportunities.push(`Low advertising pressure (${apiScore!.toFixed(0)}/100)`);
  }
  if (eciOk && competitionCostLabel === 'Low') {
    opportunities.push('Competition cost remains low');
  }
  if (eciOk && accessibilityLabel === 'Accessible') {
    opportunities.push('Market accessibility classified as Accessible');
  }
  if (eciOk && eci_data.classification === 'Easy') {
    opportunities.push(`Entry difficulty score indicates easy market entry (${eciScore!.toFixed(0)}/100)`);
  }
  if (pvsOk && (pvs_data.classification === 'High' || pvs_data.classification === 'Medium')) {
    opportunities.push(
      `Price positioning potential supports premium placement (${pvsScore!.toFixed(0)}/100 — ${pvs_data.classification})`,
    );
  }
  if (marketAttractivenessScore != null && marketAttractivenessScore >= 60) {
    opportunities.push(`Market attractiveness score ${marketAttractivenessScore}/100`);
  }

  // ── Data-supported risks only ────────────────────────────────────────────

  const risks: string[] = [];
  const noRisksMessage = 'No material risks identified from available market signals.';

  if (apiOk && api_data.classification === 'High') {
    risks.push(`High advertising pressure (${apiScore!.toFixed(0)}/100)`);
  }
  if (eciOk && competitionCostLabel === 'High') {
    risks.push('Elevated competition cost');
  }
  if (eciOk && eci_data.classification === 'Difficult') {
    risks.push('Competitive saturation');
  }
  if (eciOk && accessibilityLabel === 'Difficult') {
    risks.push('Market accessibility classified as Difficult');
  }
  if (marketRiskClass === 'High') {
    risks.push(`Market risk gauge elevated (${marketRiskScore.toFixed(0)}/100)`);
  }

  // ── Executive insight panels ─────────────────────────────────────────────

  const keyFinding = apiOk && eciOk
    ? `Advertising pressure is ${api_data.classification} (${apiScore!.toFixed(0)}/100) and entry difficulty is ${eci_data.classification} (${eciScore!.toFixed(0)}/100) — signals suggest ${marketAttractivenessLabel.toLowerCase()} entry conditions.`
    : apiOk
      ? `Advertising pressure is ${api_data.classification} (${apiScore!.toFixed(0)}/100). Entry-cost signals will complete the assessment.`
      : eciOk
        ? `Entry difficulty is ${eci_data.classification} (${eciScore!.toFixed(0)}/100). Advertising signals will complete the assessment.`
        : 'Upload datasets to generate market entry intelligence from available signals.';

  const biggestBarrier = eciOk && eciScore! > 50
    ? `Competition and visibility signals are the primary obstacle (entry difficulty ${eciScore!.toFixed(0)}/100).`
    : apiOk && apiScore! > 50
      ? `Advertising pressure is the primary challenge (${apiScore!.toFixed(0)}/100).`
      : 'No major barriers identified from currently available data.';

  const entryInvestment = apiOk
    ? `Entry investment requirements appear ${api_data.capital_requirement?.toLowerCase() ?? 'moderate'} based on advertising pressure (${apiScore!.toFixed(0)}/100).`
    : 'Entry investment signals will appear when advertising pressure data is available.';

  const marketAttractivenessInsight =
    marketAttractivenessScore == null
      ? 'Upload datasets to assess market attractiveness from available signals.'
      : marketAttractivenessScore >= 65
        ? `Available market signals indicate favorable entry conditions (attractiveness ${marketAttractivenessScore}/100).`
        : marketAttractivenessScore >= 40
          ? `Market conditions appear mixed with selective entry potential (attractiveness ${marketAttractivenessScore}/100).`
          : `Market conditions appear challenging for new entrants (attractiveness ${marketAttractivenessScore}/100).`;

  const insightPanels = [
    { category: 'Key Finding', text: keyFinding, border: 'border-l-4 border-l-purple-500 border-purple-500/30 bg-purple-500/5', badge: 'bg-purple-500/10 text-purple-500 border-purple-500/20', dot: 'bg-purple-500' },
    { category: 'Biggest Barrier', text: biggestBarrier, border: 'border-l-4 border-l-red-500 border-red-500/30 bg-red-500/5', badge: 'bg-red-500/10 text-red-500 border-red-500/20', dot: 'bg-red-500' },
    { category: 'Entry Investment', text: entryInvestment, border: 'border-l-4 border-l-amber-500 border-amber-500/30 bg-amber-500/5', badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dot: 'bg-amber-500' },
    { category: 'Market Attractiveness', text: marketAttractivenessInsight, border: 'border-l-4 border-l-blue-500 border-blue-500/30 bg-blue-500/5', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20', dot: 'bg-blue-500' },
  ];

  const attractivenessMatrix = results.economic_attractiveness_matrix;
  const rawVerdict = results.economic_verdict
    || (healthOk ? mapHealthClass(String(financeHealthBlock.classification)) : null);
  const entryVerdict = rawVerdict ? sanitizeExecutiveText(String(rawVerdict)) : null;
  const narrative = results.market_economics_narrative
    ? sanitizeExecutiveText(String(results.market_economics_narrative))
    : null;

  const availableMetrics = [
    apiOk && {
      title: 'Advertising Pressure',
      description: 'Visibility acquisition cost from keyword signals',
      data: api_data,
      icon: <Megaphone className="w-4 h-4" />,
      invert: true,
      fallbackInsight: 'Derived from advertising and keyword competition signals.',
      displayClass: String(api_data.classification ?? '—'),
    },
    pvsOk && {
      title: 'Price Positioning Potential',
      description: 'Measures whether the market supports higher-priced product positioning.',
      data: pvs_data,
      icon: <DollarSign className="w-4 h-4" />,
      invert: false,
      fallbackInsight: 'Price-band signals from catalog data when available.',
      displayClass: String(pvs_data.classification ?? '—'),
    },
    eciOk && {
      title: 'Entry Cost Index',
      description: 'Market entry difficulty from competition signals',
      data: eci_data,
      icon: <DoorOpen className="w-4 h-4" />,
      invert: true,
      fallbackInsight: 'Derived from CPR, sponsorship, and competition density signals.',
      displayClass: String(eci_data.classification ?? '—'),
    },
  ].filter(Boolean) as Array<{
    title: string;
    description: string;
    data: MetricBlock;
    icon: React.ReactNode;
    invert: boolean;
    fallbackInsight: string;
    displayClass: string;
  }>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-teal">

      {/* Header — Investment Dashboard Style */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="inline-flex items-center justify-center px-2 py-1 rounded border border-primary/20 bg-primary/10 text-primary text-[10px] font-mono tracking-widest uppercase mb-3">
            Investment Intelligence
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-sans">Market Entry Intelligence</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Evaluate barrier-to-entry economics and risk factors before allocating capital.
          </p>
        </div>
        <div className="text-right flex gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Attractiveness</p>
            <p className={cn("text-3xl font-black font-mono", marketAttractivenessScore && marketAttractivenessScore >= 60 ? 'text-emerald-500' : 'text-red-500')}>{marketAttractivenessScore || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Risk Gauge</p>
            <p className={cn("text-3xl font-black font-mono", marketRiskScore <= 40 ? 'text-emerald-500' : 'text-red-500')}>
              {marketRiskScore.toFixed(0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          title="Market Attractiveness"
          value={marketAttractivenessLabel}
          sub={marketAttractivenessScore != null ? `${marketAttractivenessScore}/100 composite` : 'Awaiting market signals'}
          icon={<TrendingUp className="w-4 h-4" />}
          color={marketAttractivenessScore != null ? classColor(marketAttractivenessLabel) : 'text-muted-foreground'}
          bg={marketAttractivenessScore != null ? classBg(marketAttractivenessLabel) : 'bg-muted border-border'}
          tooltip="Composite attractiveness from available market signals — not a financial forecast."
        />
        <KpiCard
          title="Market Risk"
          value={marketRiskClass}
          sub={`${marketRiskScore.toFixed(0)}/100 risk gauge`}
          icon={<ShieldCheck className="w-4 h-4" />}
          color={classColor(marketRiskClass)}
          bg={classBg(marketRiskClass)}
          tooltip="Higher values indicate more challenging entry conditions from available signals."
        />
        <KpiCard
          title="Advertising Pressure"
          value={apiOk ? (api_data.classification ?? '—') : '—'}
          sub={apiOk ? `${apiScore!.toFixed(0)}/100` : '—'}
          icon={<Megaphone className="w-4 h-4" />}
          color={apiOk ? classColor(api_data.classification ?? '') : 'text-muted-foreground'}
          bg={apiOk ? classBg(api_data.classification ?? '') : 'bg-muted border-border'}
          tooltip="Cost to acquire visibility through advertising signals."
        />
        <KpiCard
          title="Entry Difficulty"
          value={eciOk ? (eci_data.classification ?? '—') : '—'}
          sub={eciOk ? `${eciScore!.toFixed(0)}/100` : '—'}
          icon={<DoorOpen className="w-4 h-4" />}
          color={eciOk ? classColor(eci_data.classification ?? '') : 'text-muted-foreground'}
          bg={eciOk ? classBg(eci_data.classification ?? '') : 'bg-muted border-border'}
          tooltip="Difficulty gaining initial traction from CPR, sponsorship, and competition signals."
        />
        <KpiCard
          title="Competition Cost"
          value={competitionCostLabel}
          sub={eciOk ? 'Visibility cost vs competitors' : '—'}
          icon={<TrendingDown className="w-4 h-4" />}
          color={eciOk ? classColor(competitionCostLabel) : 'text-muted-foreground'}
          bg={eciOk ? classBg(competitionCostLabel) : 'bg-muted border-border'}
          tooltip="Relative cost to compete for visibility from entry-cost signals."
        />
        <KpiCard
          title="Market Accessibility"
          value={accessibilityLabel}
          sub={eciOk ? 'Ease of market entry' : '—'}
          icon={<Landmark className="w-4 h-4" />}
          color={eciOk ? classColor(accessibilityLabel) : 'text-muted-foreground'}
          bg={eciOk ? classBg(accessibilityLabel) : 'bg-muted border-border'}
          tooltip="How accessible the market appears from competition and entry signals."
        />
      </div>

      <Card className="border-border/50 shadow-sm glass">
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Executive Brief</CardTitle>
          </div>
          <CardDescription>What the signals show, why it matters, and where to focus entry effort</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {insightPanels.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={cn('rounded-xl border p-5 space-y-3 glass shadow-sm hover:shadow-md transition-all', p.border)}
              >
                <div className="flex justify-between items-center">
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border', p.badge)}>
                    {p.category}
                  </span>
                  <span className={cn('w-2 h-2 rounded-full shadow-sm', p.dot)} />
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed font-medium">{p.text}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground/60 leading-relaxed border-t border-border/50 pt-4 mt-6">
            Assessment uses demand, competition, visibility, CPR, and sponsorship signals only.
            Financial forecasts, margin estimates, and return projections are not included.
          </p>
        </CardContent>
      </Card>

      {availableMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {availableMetrics.map((cfg) => (
            <MetricDetail
              key={cfg.title}
              title={cfg.title}
              description={cfg.description}
              score={Number(cfg.data.score ?? 0)}
              classification={cfg.displayClass}
              insight={safeInsight(cfg.data, cfg.fallbackInsight)}
              icon={cfg.icon}
              invertColor={cfg.invert}
            />
          ))}
        </div>
      )}

      {attractivenessMatrix?.quadrant && (
        <div className="glass rounded-xl border border-border/50 p-1">
          <AttractivenessMatrix data={attractivenessMatrix} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-sm">
          <CardHeader className="pb-3 border-b border-emerald-500/10">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">Opportunities</CardTitle>
            </div>
            <CardDescription className="text-emerald-600/70 dark:text-emerald-400/70">Supported by calculated market signals</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <BulletList
              items={opportunities}
              variant="opportunity"
              emptyMessage="No favorable opportunity signals identified from available data."
            />
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5 shadow-sm">
          <CardHeader className="pb-3 border-b border-red-500/10">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <CardTitle className="text-base text-red-700 dark:text-red-400">Risks</CardTitle>
            </div>
            <CardDescription className="text-red-600/70 dark:text-red-400/70">Only risks backed by available metrics</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <BulletList
              items={risks}
              variant="risk"
              emptyMessage={noRisksMessage}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/30 bg-primary/5 shadow-md">
        <CardContent className="p-8 flex gap-5 items-start">
          <div className="p-3 bg-primary/20 rounded-xl">
            <Landmark className="w-8 h-8 text-primary flex-shrink-0" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-primary font-sans uppercase tracking-widest">Market Entry Verdict</h3>
            <p className="text-foreground mt-2 text-base leading-relaxed font-medium">
              {entryVerdict ?? 'Upload datasets to generate a market entry verdict from available signals.'}
            </p>
            {narrative && (
              <p className="text-sm text-muted-foreground/80 mt-4 leading-relaxed border-t border-primary/20 pt-4">
                {narrative}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

    </motion.div>
  );
}
