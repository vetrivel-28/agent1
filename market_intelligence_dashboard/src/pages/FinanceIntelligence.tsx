import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { AttractivenessMatrix } from '../components/charts/AttractivenessMatrix';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Megaphone, DoorOpen, Landmark,
  TrendingUp, TrendingDown, Lightbulb, Info, ShieldCheck,
  DollarSign, Check, X, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EvidenceBlock = {
  source_dataset?: string;
  source_columns?: string[];
  formula?: string;
  component_scores?: Record<string, number>;
  weights?: Record<string, number>;
  source_values?: Record<string, number | string>;
  calculation_steps?: string[];
  final_value?: number | string;
  interpretation?: string;
  missing_columns?: string[];
};

type MetricBlock = {
  status?: string;
  score?: number | null;
  classification?: string;
  risk?: string;
  mini_insight?: string;
  capital_requirement?: string;
  formula_used?: string;
  columns_used?: string[];
  missing_columns?: string[];
  component_scores?: Record<string, number>;
  evidence?: Record<string, { column: string; avg_value: number; normalized_score: number; weight: number; interpretation: string }>;
  // Entry metric sub-blocks (from API)
  entry_difficulty?: {
    score: number;
    classification: string;
    components: Array<{component: string; score: number; weight: number}>;
    components_missing?: string[];
    data_confidence?: number;
    confidence_label?: string;
    low_score_note?: string;
    formula?: string;
  };
  entry_cost_index?: {
    score: number;
    classification: string;
    components: Array<{component: string; score: number; weight: number}>;
    components_missing?: string[];
    data_confidence?: number;
    confidence_label?: string;
    low_score_note?: string;
    formula?: string;
  };
  // Confidence fields (directly on MetricBlock when flattened)
  data_confidence?: number;
  confidence_label?: string;
  low_score_note?: string;
};

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
  const low = ['Low', 'Easy', 'Light', 'Accessible', 'Attractive', 'Highly Attractive', 'Favourable', 'Low observed pressure'];
  const high = ['High', 'Difficult', 'Heavy', 'Challenging', 'Less Attractive', 'Unattractive', 'Severe pressure'];
  if (low.some((l) => cls?.includes(l))) return 'text-emerald-500';
  if (high.some((h) => cls?.includes(h))) return 'text-red-500';
  return 'text-yellow-500';
}

function classBg(cls: string): string {
  const low = ['Low', 'Easy', 'Light', 'Accessible', 'Attractive', 'Highly Attractive', 'Favourable', 'Low observed pressure'];
  const high = ['High', 'Difficult', 'Heavy', 'Challenging', 'Less Attractive', 'Unattractive', 'Severe pressure'];
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

function sanitizeText(text: string): string {
  return text
    .replace(/\bexcellent economics\b/gi, 'favorable')
    .replace(/\bprofitab\w*\b/gi, 'entry')
    .replace(/\bmargin(s)?\b/gi, 'positioning')
    .replace(/\beconomics\b/gi, 'market conditions')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function metricOk(block: MetricBlock | undefined): boolean {
  return block?.status === 'success' && block.score != null;
}

// ---------------------------------------------------------------------------
// Evidence Drawer
// ---------------------------------------------------------------------------
function EvidenceDrawer({ title, metric, onClose }: { title: string; metric: MetricBlock; onClose: () => void }) {
  const score = metric.score != null ? Number(metric.score) : null;
  const components = metric.component_scores || {};
  const evidence = metric.evidence || {};
  const missing = metric.missing_columns || [];
  const formula = metric.formula_used || '';
  const cols = metric.columns_used || [];

  // For entry metrics, extract sub-components
  const entryDifficulty = metric.entry_difficulty;
  const entryCostIndex = metric.entry_cost_index;

  // Confidence — prefer sub-block value, fall back to top-level
  const confidence = metric.data_confidence ?? entryDifficulty?.data_confidence ?? entryCostIndex?.data_confidence;
  const confidenceLabel = metric.confidence_label ?? entryDifficulty?.confidence_label ?? entryCostIndex?.confidence_label;
  const lowScoreNote = metric.low_score_note ?? entryDifficulty?.low_score_note ?? entryCostIndex?.low_score_note;
  // Formula from sub-block if top-level not set
  const subFormula = entryDifficulty?.formula ?? entryCostIndex?.formula;
  const displayFormula = formula || subFormula || '';

  const confColor = confidenceLabel === 'High' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
    : confidenceLabel === 'Medium' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
    : 'bg-red-500/10 text-red-600 border-red-500/30';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-lg font-bold">{title} — Evidence</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {score != null && (
            <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-black font-mono">{score.toFixed(0)}</span>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Final Score / 100</p>
                    <p className={cn('text-sm font-semibold', classColor(metric.classification ?? ''))}>{metric.classification}</p>
                  </div>
                </div>
                {confidenceLabel && (
                  <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border', confColor)}>
                    {confidenceLabel} confidence{confidence != null ? ` (${confidence.toFixed(0)}%)` : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">
                Note: {title.match(/Difficulty|Pressure|Risk|Cost|Barrier/i) ? 'For this metric, a lower score is better (represents less resistance or cost).' : 'For this metric, a higher score is better (represents stronger opportunity or health).'}
              </p>
            </div>
          )}

          {/* Guardrail: low score explanation */}
          {lowScoreNote && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">Score Explanation</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{lowScoreNote}</p>
            </div>
          )}

          {displayFormula && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Formula</p>
              <p className="text-sm text-foreground/80 leading-relaxed bg-muted/20 rounded-lg p-3 font-mono whitespace-pre-line">{displayFormula}</p>
            </div>
          )}

          {cols.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Source Columns Used</p>
              <div className="flex flex-wrap gap-2">
                {cols.map((c, i) => <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{c}</span>)}
              </div>
            </div>
          )}

          {Object.keys(evidence).length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Component Breakdown</p>
              <div className="space-y-2">
                {Object.entries(evidence).map(([key, ev]) => (
                  <div key={key} className="flex justify-between items-start p-3 border border-border rounded-lg">
                    <div>
                      <p className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">{ev.interpretation}</p>
                      <p className="text-xs text-muted-foreground">Column: {ev.column} · Weight: {(ev.weight * 100).toFixed(0)}%</p>
                    </div>
                    <span className="text-sm font-mono font-bold">{ev.normalized_score.toFixed(1)}/100</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entry metrics sub-breakdown */}
          {entryDifficulty && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Entry Difficulty Components
                {entryDifficulty.data_confidence != null && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    ({entryDifficulty.components.length} of 5 signals available — {entryDifficulty.data_confidence.toFixed(0)}% data coverage)
                  </span>
                )}
              </p>
              <div className="space-y-2">
                {entryDifficulty.components.map((c, i) => (
                  <div key={i} className="flex justify-between items-center p-2 border border-border rounded-lg">
                    <span className="text-sm">{c.component} <span className="text-xs text-muted-foreground">({(c.weight * 100).toFixed(0)}%)</span></span>
                    <span className="text-sm font-mono font-bold">{c.score.toFixed(1)}/100</span>
                  </div>
                ))}
                {(entryDifficulty.components_missing ?? []).length > 0 && (
                  <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                    Missing signals: {(entryDifficulty.components_missing ?? []).join(', ')} — weights re-normalised across available signals.
                  </div>
                )}
              </div>
            </div>
          )}

          {entryCostIndex && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Entry Cost Index Components
                {entryCostIndex.data_confidence != null && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    ({entryCostIndex.components.length} of 5 signals available — {entryCostIndex.data_confidence.toFixed(0)}% data coverage)
                  </span>
                )}
              </p>
              <div className="space-y-2">
                {entryCostIndex.components.map((c, i) => (
                  <div key={i} className="flex justify-between items-center p-2 border border-border rounded-lg">
                    <span className="text-sm">{c.component} <span className="text-xs text-muted-foreground">({(c.weight * 100).toFixed(0)}%)</span></span>
                    <span className="text-sm font-mono font-bold">{c.score.toFixed(1)}/100</span>
                  </div>
                ))}
                {(entryCostIndex.components_missing ?? []).length > 0 && (
                  <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                    Missing signals: {(entryCostIndex.components_missing ?? []).join(', ')} — weights re-normalised across available signals.
                  </div>
                )}
              </div>
            </div>
          )}

          {missing.length > 0 && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400 mb-1">Missing Columns</p>
              <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80">{missing.join(', ')}</p>
              <p className="text-xs text-muted-foreground mt-1">These columns were not found. Score uses only available signals with re-normalized weights.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix Evidence Drawer
// ---------------------------------------------------------------------------
function MatrixExplanationDrawer({
  data, onClose
}: {
  data: { demand_strength: number; finance_health: number; quadrant: string; threshold: number; launch_recommendation: string };
  onClose: () => void;
}) {
  const threshold = data.threshold ?? 50;
  const highDemand = data.demand_strength >= threshold;
  const highFinance = data.finance_health >= threshold;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-lg font-bold">Why "{data.quadrant}"?</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className={cn('p-4 rounded-xl border', highDemand ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Demand Strength</p>
              <p className="text-2xl font-black font-mono mt-1">{data.demand_strength.toFixed(1)}</p>
              <p className={cn('text-xs font-semibold mt-1', highDemand ? 'text-emerald-500' : 'text-red-500')}>
                {highDemand ? `≥ ${threshold} threshold → High` : `< ${threshold} threshold → Low`}
              </p>
            </div>
            <div className={cn('p-4 rounded-xl border', highFinance ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Market Health</p>
              <p className="text-2xl font-black font-mono mt-1">{data.finance_health.toFixed(1)}</p>
              <p className={cn('text-xs font-semibold mt-1', highFinance ? 'text-emerald-500' : 'text-red-500')}>
                {highFinance ? `≥ ${threshold} threshold → Strong` : `< ${threshold} threshold → Weak`}
              </p>
            </div>
          </div>
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <p className="text-sm font-semibold text-primary mb-1">Classification Logic</p>
            <p className="text-sm text-foreground/80">
              {highDemand && highFinance && "Both Demand Strength and Market Health are above threshold → Launch Candidate"}
              {highDemand && !highFinance && "Demand is strong but Market Health is below threshold → Difficult Economics"}
              {!highDemand && highFinance && "Market Health is strong but Demand Strength is below threshold → Niche Opportunity"}
              {!highDemand && !highFinance && "Both Demand Strength and Market Health are below threshold → Avoid"}
            </p>
          </div>
          <div className="p-3 bg-muted/30 rounded-xl">
            <p className="text-xs text-muted-foreground font-mono">Threshold: {threshold} | Demand: {data.demand_strength.toFixed(1)} | Market Health: {data.finance_health.toFixed(1)}</p>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{data.launch_recommendation}</p>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clickable KPI card
// ---------------------------------------------------------------------------
interface KpiProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  bg?: string;
  tooltip?: string;
  onClick?: () => void;
  clickable?: boolean;
}

function KpiCard({ title, value, sub, icon, color = 'text-primary', bg = 'bg-primary/10 border-primary/20', tooltip, onClick, clickable }: KpiProps) {
  return (
    <Card
      className={cn('hover-card-anim', clickable && 'cursor-pointer hover:border-primary/50 transition-colors')}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {tooltip && !clickable && (
              <div className="relative group/tip inline-flex">
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block w-60">
                  <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground shadow-lg">{tooltip}</div>
                </div>
              </div>
            )}
            {clickable && <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
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

function BulletList({ items, variant, emptyMessage }: { items: string[]; variant: 'opportunity' | 'risk'; emptyMessage: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {variant === 'opportunity'
            ? <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            : <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-2" />}
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
  const [evidenceFor, setEvidenceFor] = useState<{ title: string; metric: MetricBlock } | null>(null);
  const [showMatrixExplanation, setShowMatrixExplanation] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-intelligence'],
    queryFn: () => api.getFinanceIntelligence(),
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Evaluating Market Economics...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Market Entry Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-lg">
            {getEngineErrorMessage(data, 'Upload Magnet and BlackBox datasets to generate market entry signals.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const results = data.data?.results || {};

  // Metric blocks — handle both `entry_metrics` and `entry_cost` keys for compatibility
  const api_data = (results.advertising_pressure || {}) as MetricBlock;
  const pvs_data = (results.premium_viability || {}) as MetricBlock;
  const eci_raw = (results.entry_metrics || results.entry_cost || {}) as MetricBlock;

  // Flatten entry difficulty and entry cost index to top-level MetricBlock for easy display
  const entry_difficulty_data: MetricBlock = eci_raw.entry_difficulty
    ? {
        status: eci_raw.status,
        score: eci_raw.entry_difficulty.score,
        classification: eci_raw.entry_difficulty.classification,
        // formula_used intentionally left blank — entry_difficulty.formula carries it
        columns_used: (eci_raw.entry_difficulty.components || []).map((c: any) => c.component),
        missing_columns: eci_raw.entry_difficulty.components_missing,
        entry_difficulty: eci_raw.entry_difficulty,
        data_confidence: eci_raw.entry_difficulty.data_confidence,
        confidence_label: eci_raw.entry_difficulty.confidence_label,
        low_score_note: eci_raw.entry_difficulty.low_score_note,
        mini_insight: eci_raw.mini_insight,
      }
    : { status: 'insufficient_data' };

  const entry_cost_data: MetricBlock = eci_raw.entry_cost_index
    ? {
        status: eci_raw.status,
        score: eci_raw.entry_cost_index.score,
        classification: eci_raw.entry_cost_index.classification,
        columns_used: (eci_raw.entry_cost_index.components || []).map((c: any) => c.component),
        missing_columns: eci_raw.entry_cost_index.components_missing,
        entry_cost_index: eci_raw.entry_cost_index,
        data_confidence: eci_raw.entry_cost_index.data_confidence,
        confidence_label: eci_raw.entry_cost_index.confidence_label,
        low_score_note: eci_raw.entry_cost_index.low_score_note,
        mini_insight: eci_raw.mini_insight,
      }
    : { status: 'insufficient_data' };

  if (pvs_data && pvs_data.status === 'success') {
    pvs_data.formula_used = "Top Quartile Revenue Share = revenue from top 25% priced products / total product revenue × 100.\nBottom Quartile Revenue Share = revenue from bottom 25% priced products / total product revenue × 100.\nPremium Advantage = Top Quartile Revenue Share - Bottom Quartile Revenue Share.\nClassification: below -10% = Low-price market, -10% to +10% = Balanced, above +10% = Premium-friendly.";
  }

  const apiOk = metricOk(api_data);
  const pvsOk = metricOk(pvs_data);
  const edOk = metricOk(entry_difficulty_data);
  const eciOk = metricOk(entry_cost_data);

  const apiScore = apiOk ? Number(api_data.score) : null;
  const pvsScore = pvsOk ? Number(pvs_data.score) : null;
  const edScore = edOk ? Number(entry_difficulty_data.score) : null;
  const eciScore = eciOk ? Number(entry_cost_data.score) : null;

  // Finance health / market attractiveness
  const financeHealthBlock = results.finance_health || {};
  const healthOk = financeHealthBlock.status === 'success';
  const marketAttractivenessScore: number | null = healthOk ? Number(financeHealthBlock.finance_health ?? 0) : null;
  const marketAttractivenessLabel = marketAttractivenessScore == null ? '—'
    : marketAttractivenessScore >= 75 ? 'Highly Attractive'
    : marketAttractivenessScore >= 60 ? 'Attractive'
    : marketAttractivenessScore >= 40 ? 'Mixed / Selective'
    : 'Weak / Unattractive';

  // Market attractiveness evidence block for drawer
  const maEvidenceBlock: MetricBlock = {
    status: healthOk ? 'success' : 'insufficient_data',
    score: marketAttractivenessScore,
    classification: marketAttractivenessLabel,
    formula_used: (
      "Market Attractiveness = 0.25×(100 − Advertising Pressure) + 0.20×Price Positioning Potential + " +
      "0.25×(100 − Margin Compression) + 0.15×Capital Efficiency + 0.15×(100 − Entry Difficulty). " +
      "Components are inverted where higher score = more difficulty. Missing components excluded with weight re-normalization."
    ),
    columns_used: Object.values(results).flatMap((v: any) => (v && v.columns_used) ? v.columns_used : []),
    component_scores: {
      ...(apiOk ? { 'Advertising Pressure (inverted)': 100 - apiScore! } : {}),
      ...(pvsOk ? { 'Price Positioning Potential': pvsScore! } : {}),
      ...(edOk ? { 'Entry Difficulty (inverted)': 100 - edScore! } : {}),
    },
    evidence: {},
  };

  // Market risk — independent if we have signals, otherwise 100 - attractiveness
  const marketRiskScore = Number(results.economic_risk_gauge ?? (marketAttractivenessScore != null ? 100 - marketAttractivenessScore : 50));
  const marketRiskLabel = marketRiskScore <= 33 ? 'Low' : marketRiskScore <= 66 ? 'Moderate' : 'High';
  const riskIsInverse = !results.economic_risk_gauge || !healthOk;

  const marketRiskEvidenceBlock: MetricBlock = {
    status: 'success',
    score: marketRiskScore,
    classification: marketRiskLabel,
    formula_used: riskIsInverse
      ? "Market Risk = 100 − Market Attractiveness. This is an inverse proxy, not an independent risk calculation. Upload more data for independent risk signals."
      : "Market Risk = composite of competition, advertising pressure, entry difficulty, and demand weakness signals.",
    component_scores: riskIsInverse
      ? { 'Market Attractiveness (inverted)': marketAttractivenessScore != null ? 100 - marketAttractivenessScore : 50 }
      : {},
  };

  // Accessibility and competition cost from entry difficulty
  const marketAccessibilityScore = edOk ? 100 - edScore! : null;
  const accessibilityLabel = !edOk ? 'Unavailable'
    : marketAccessibilityScore! >= 66 ? 'Accessible'
    : marketAccessibilityScore! >= 33 ? 'Moderately Accessible'
    : 'Difficult';

  const competitionCostLabel = !eciOk ? 'Unavailable'
    : eciScore! <= 33 ? 'Low'
    : eciScore! <= 66 ? 'Moderate'
    : 'High';

  // Opportunities and risks — confidence-aware guardrails
  const edConfidenceLabel = entry_difficulty_data.confidence_label ?? 'Low';
  const eciConfidenceLabel = entry_cost_data.confidence_label ?? 'Low';
  const edHighConf = edConfidenceLabel === 'High' || edConfidenceLabel === 'Medium';
  const eciHighConf = eciConfidenceLabel === 'High' || eciConfidenceLabel === 'Medium';

  const opportunities: string[] = [];
  if (apiOk && api_data.classification === 'Low')
    opportunities.push(`Low advertising pressure (${apiScore!.toFixed(0)}/100) — ${api_data.mini_insight?.replace(/\.$/, '') ?? 'low cost to acquire visibility'}`);
  if (edOk && edScore! <= 33)
    opportunities.push(edHighConf
      ? `Entry difficulty is low (${edScore!.toFixed(0)}/100) — market is accessible to new entrants`
      : `Entry difficulty appears low (${edScore!.toFixed(0)}/100) — ${edConfidenceLabel.toLowerCase()} confidence based on available signals`
    );
  if (eciOk && eciScore! <= 33)
    opportunities.push(eciHighConf
      ? `Entry cost index is low (${eciScore!.toFixed(0)}/100) — competitive entry investment is manageable`
      : `Entry cost pressure appears low (${eciScore!.toFixed(0)}/100) — confidence limited due to missing cost data`
    );
  if (pvsOk && pvsScore! >= 60)
    opportunities.push(`Price positioning potential is ${pvs_data.classification} (${pvsScore!.toFixed(0)}/100) — supports premium pricing`);
  if (marketAttractivenessScore != null && marketAttractivenessScore >= 60)
    opportunities.push(`Market attractiveness score ${marketAttractivenessScore.toFixed(0)}/100 — favorable entry conditions`);

  const risks: string[] = [];
  if (apiOk && api_data.classification === 'High')
    risks.push(`High advertising pressure (${apiScore!.toFixed(0)}/100) — high cost to acquire visibility`);
  if (apiOk && api_data.classification === 'Medium' && apiScore! > 55)
    risks.push(`Moderate-to-high advertising pressure (${apiScore!.toFixed(0)}/100) — monitor keyword bid trends`);
  if (edOk && edScore! > 60)
    risks.push(`Entry difficulty is ${entry_difficulty_data.classification} (${edScore!.toFixed(0)}/100)`);
  if (eciOk && eciScore! > 60)
    risks.push(`Entry cost index is high (${eciScore!.toFixed(0)}/100) — significant investment needed to compete`);
  if (marketRiskScore > 60)
    risks.push(`Market risk gauge elevated (${marketRiskScore.toFixed(0)}/100)${riskIsInverse ? ' — inverse of market attractiveness' : ''}`);
  if ((edOk || eciOk) && (!edHighConf || !eciHighConf))
    risks.push(`Entry analysis has ${edHighConf ? '' : 'low entry difficulty '}${!edHighConf && !eciHighConf ? 'and ' : ''}${eciHighConf ? '' : 'low entry cost '}data coverage — upload datasets with Review Count, Sponsored ASINs, CPR, and H10 PPC Sugg. Bid for higher confidence`);  if (!apiOk && !edOk)
    risks.push('Risk cannot be fully assessed — key columns (H10 PPC Sugg. Bid, Sponsored ASINs, CPR) are missing from uploaded data.');

  // Executive brief panels — match actual metric values
  const keyFinding = apiOk && edOk
    ? `Advertising pressure is ${api_data.classification} (${apiScore!.toFixed(0)}/100) and entry difficulty is ${entry_difficulty_data.classification} (${edScore!.toFixed(0)}/100) — signals indicate ${marketAttractivenessLabel.toLowerCase()} entry conditions.`
    : apiOk
      ? `Advertising pressure is ${api_data.classification} (${apiScore!.toFixed(0)}/100). Entry difficulty data is incomplete — upload datasets with CPR, Sponsored ASINs, Review Count columns.`
      : edOk
        ? `Entry difficulty is ${entry_difficulty_data.classification} (${edScore!.toFixed(0)}/100). Advertising signals incomplete — upload Magnet with H10 PPC Sugg. Bid or Sponsored ASINs columns.`
        : 'Upload Magnet with H10 PPC Sugg. Bid, Sponsored ASINs, and CPR columns to generate market entry intelligence.';

  let highestBarrier = { name: '', score: 0 };
  if (edOk && entry_difficulty_data.entry_difficulty?.components) {
    entry_difficulty_data.entry_difficulty.components.forEach(c => {
      if (c.score > highestBarrier.score) highestBarrier = { name: c.component, score: c.score };
    });
  }
  if (eciOk && entry_cost_data.entry_cost_index?.components) {
    entry_cost_data.entry_cost_index.components.forEach(c => {
      if (c.score > highestBarrier.score) highestBarrier = { name: c.component, score: c.score };
    });
  }
  if (apiOk && apiScore! > highestBarrier.score) {
    highestBarrier = { name: 'Advertising Pressure', score: apiScore! };
  }
  const biggestBarrier = highestBarrier.score > 0
    ? `${highestBarrier.name} is the primary challenge (${highestBarrier.score.toFixed(0)}/100).`
    : risks.length > 0
      ? risks[0]
      : 'No dominant barrier identified from available signals.';

  const entryInvestment = apiOk
    ? `Entry investment requirement appears ${(api_data.capital_requirement ?? 'moderate').toLowerCase()} based on advertising pressure (${apiScore!.toFixed(0)}/100).`
    + (eciOk ? ` Entry cost index: ${eciScore!.toFixed(0)}/100 (${entry_cost_data.classification}).` : '')
    : eciOk
      ? `Entry cost index is ${entry_cost_data.classification} (${eciScore!.toFixed(0)}/100).`
      : 'Entry investment signals will appear when H10 PPC Sugg. Bid or CPR data is available.';

  const maInsight = marketAttractivenessScore == null
    ? 'Upload datasets to assess market attractiveness.'
    : marketAttractivenessScore >= 65
      ? `Available market signals indicate favorable entry conditions (attractiveness ${marketAttractivenessScore.toFixed(0)}/100).`
      : marketAttractivenessScore >= 40
        ? `Market conditions appear mixed with selective entry potential (attractiveness ${marketAttractivenessScore.toFixed(0)}/100).`
        : `Market conditions appear challenging for new entrants (attractiveness ${marketAttractivenessScore.toFixed(0)}/100).`;

  const insightPanels = [
    { category: 'Key Finding', text: keyFinding, border: 'border-l-4 border-l-purple-500 border-purple-500/30 bg-purple-500/5', badge: 'bg-purple-500/10 text-purple-500 border-purple-500/20', dot: 'bg-purple-500' },
    { category: 'Biggest Barrier', text: biggestBarrier, border: 'border-l-4 border-l-red-500 border-red-500/30 bg-red-500/5', badge: 'bg-red-500/10 text-red-500 border-red-500/20', dot: 'bg-red-500' },
    { category: 'Entry Investment', text: entryInvestment, border: 'border-l-4 border-l-amber-500 border-amber-500/30 bg-amber-500/5', badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dot: 'bg-amber-500' },
    { category: 'Market Attractiveness', text: maInsight, border: 'border-l-4 border-l-blue-500 border-blue-500/30 bg-blue-500/5', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20', dot: 'bg-blue-500' },
  ];

  const attractivenessMatrix = results.economic_attractiveness_matrix;
  const rawVerdict = results.economic_verdict || (healthOk ? mapHealthClass(String(financeHealthBlock.classification)) : null);
  const entryVerdict = rawVerdict ? sanitizeText(String(rawVerdict)) : null;
  const narrative = results.market_economics_narrative ? sanitizeText(String(results.market_economics_narrative)) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10">

      <AnimatePresence>
        {evidenceFor && (
          <EvidenceDrawer title={evidenceFor.title} metric={evidenceFor.metric} onClose={() => setEvidenceFor(null)} />
        )}
        {showMatrixExplanation && attractivenessMatrix?.quadrant && (
          <MatrixExplanationDrawer data={attractivenessMatrix} onClose={() => setShowMatrixExplanation(false)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="inline-flex items-center justify-center px-2 py-1 rounded border border-primary/20 bg-primary/10 text-primary text-[10px] font-mono tracking-widest uppercase mb-3">
            Investment Intelligence
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground">Market Entry Intelligence</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Evaluate barrier-to-entry economics and risk factors before allocating capital.
          </p>
        </div>
        <div className="text-right flex gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Attractiveness</p>
            <p className={cn('text-3xl font-black font-mono', marketAttractivenessScore && marketAttractivenessScore >= 60 ? 'text-emerald-500' : 'text-red-500')}>
              {marketAttractivenessScore?.toFixed(0) ?? '—'}
            </p>
          </div>

        </div>
      </div>

      {/* KPI Row — all clickable */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          title="Market Attractiveness"
          value={marketAttractivenessLabel}
          sub={marketAttractivenessScore != null ? `${marketAttractivenessScore.toFixed(0)}/100 composite` : 'Click for details'}
          icon={<TrendingUp className="w-4 h-4" />}
          color={marketAttractivenessScore != null ? classColor(marketAttractivenessLabel) : 'text-muted-foreground'}
          bg={marketAttractivenessScore != null ? classBg(marketAttractivenessLabel) : 'bg-muted border-border'}
          clickable onClick={() => setEvidenceFor({ title: 'Market Attractiveness', metric: maEvidenceBlock })}
        />

        <KpiCard
          title="Advertising Pressure"
          value={apiOk ? (api_data.classification ?? '—') : 'Unavailable'}
          sub={apiOk ? `${apiScore!.toFixed(0)}/100 · Click for evidence` : `Missing: ${(api_data.missing_columns ?? ['H10 PPC Sugg. Bid, Sponsored ASINs']).join(', ')}`}
          icon={<Megaphone className="w-4 h-4" />}
          color={apiOk ? classColor(api_data.classification ?? '') : 'text-muted-foreground'}
          bg={apiOk ? classBg(api_data.classification ?? '') : 'bg-muted border-border'}
          clickable onClick={() => setEvidenceFor({ title: 'Advertising Pressure', metric: api_data })}
        />
        <KpiCard
          title="Entry Difficulty"
          value={edOk ? (entry_difficulty_data.classification ?? '—') : 'Unavailable'}
          sub={edOk
            ? `${edScore!.toFixed(0)}/100 · ${edConfidenceLabel} confidence · Click for evidence`
            : 'Missing: Review Count, Sponsored ASINs, CPR, or PPC Bid'}
          icon={<DoorOpen className="w-4 h-4" />}
          color={edOk ? classColor(entry_difficulty_data.classification ?? '') : 'text-muted-foreground'}
          bg={edOk ? classBg(entry_difficulty_data.classification ?? '') : 'bg-muted border-border'}
          clickable onClick={() => setEvidenceFor({ title: 'Entry Difficulty', metric: entry_difficulty_data })}
        />
        <KpiCard
          title="Entry Cost Index"
          value={competitionCostLabel}
          sub={eciOk
            ? `${eciScore!.toFixed(0)}/100 · ${eciConfidenceLabel} confidence · Click for evidence`
            : 'Missing: CPR, PPC Bid, Sponsored ASINs'}
          icon={<TrendingDown className="w-4 h-4" />}
          color={eciOk ? classColor(competitionCostLabel) : 'text-muted-foreground'}
          bg={eciOk ? classBg(competitionCostLabel) : 'bg-muted border-border'}
          clickable onClick={() => setEvidenceFor({ title: 'Entry Cost Index', metric: entry_cost_data })}
        />
        <KpiCard
          title="Market Accessibility"
          value={accessibilityLabel}
          sub={edOk ? `Score: ${marketAccessibilityScore!.toFixed(0)}/100 · Click for evidence` : 'Awaiting entry difficulty signals'}
          icon={<Landmark className="w-4 h-4" />}
          color={edOk ? classColor(accessibilityLabel) : 'text-muted-foreground'}
          bg={edOk ? classBg(accessibilityLabel) : 'bg-muted border-border'}
          clickable onClick={() => setEvidenceFor({ title: 'Market Accessibility', metric: {...entry_difficulty_data, score: marketAccessibilityScore, classification: accessibilityLabel, formula_used: 'Market Accessibility = 100 - Entry Difficulty Index'} })}
        />
      </div>

      {/* Executive Brief */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Executive Brief</CardTitle>
          </div>
          <CardDescription>Generated from calculated metric values — no generic text</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {insightPanels.map((p, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className={cn('rounded-xl border p-5 space-y-3 shadow-sm', p.border)}>
                <div className="flex justify-between items-center">
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border', p.badge)}>{p.category}</span>
                  <span className={cn('w-2 h-2 rounded-full', p.dot)} />
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed font-medium">{p.text}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground/60 leading-relaxed border-t border-border/50 pt-4">
            Assessment uses demand, competition, visibility, CPR, and sponsorship signals only.
          </p>
        </CardContent>
      </Card>

      {/* Price Positioning Potential — clickable, shown only when available */}
      {pvsOk && (
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setEvidenceFor({ title: 'Price Positioning Potential', metric: pvs_data })}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className={cn('w-4 h-4', classColor(pvs_data.classification ?? ''))} />
                <CardTitle className="text-base">Price Positioning Potential</CardTitle>
                <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
              </div>
              <span className={cn('text-2xl font-black font-mono', classColor(pvs_data.classification ?? ''))}>{pvsScore!.toFixed(0)}/100</span>
            </div>
            <CardDescription>Click to see formula, source data, and calculation steps</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-muted rounded-full h-2 mb-3">
              <div className={cn('h-2 rounded-full', scoreColor(pvsScore!, false).replace('text-', 'bg-'))} style={{ width: `${pvsScore}%` }} />
            </div>
            <p className={cn('text-sm font-semibold mb-1', classColor(pvs_data.classification ?? ''))}>{pvs_data.classification}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{pvs_data.mini_insight ?? 'Price-band analysis from BlackBox product price distribution.'}</p>
          </CardContent>
        </Card>
      )}

      {/* Attractiveness Matrix — clickable quadrant */}
      {attractivenessMatrix?.quadrant && (
        <div className="rounded-xl border border-border/50 p-1 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setShowMatrixExplanation(true)}>
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <Info className="w-3 h-3 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">Click quadrant to see why it was selected</p>
          </div>
          <AttractivenessMatrix data={attractivenessMatrix} />
        </div>
      )}

      {/* Opportunities and Risks */}
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
            <BulletList items={opportunities} variant="opportunity"
              emptyMessage="No favorable opportunity signals identified from available data. Upload datasets with H10 PPC Sugg. Bid, Sponsored ASINs, and Competing Products columns." />
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
            <BulletList items={risks} variant="risk"
              emptyMessage={risks.length === 0 && (apiOk || edOk) ? 'No material risks identified from available market signals.' : 'Risk assessment requires more data. Upload Magnet with H10 PPC Sugg. Bid, Sponsored ASINs, CPR columns.'} />
          </CardContent>
        </Card>
      </div>

      {/* Market Entry Verdict */}
      <Card className="border-primary/30 bg-primary/5 shadow-md">
        <CardContent className="p-8 flex gap-5 items-start">
          <div className="p-3 bg-primary/20 rounded-xl">
            <Landmark className="w-8 h-8 text-primary flex-shrink-0" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-primary uppercase tracking-widest">Market Entry Verdict</h3>
            <p className="text-foreground mt-2 text-base leading-relaxed font-medium">
              {entryVerdict ?? 'Upload datasets to generate a market entry verdict from available signals.'}
            </p>
            {narrative && (
              <p className="text-sm text-muted-foreground/80 mt-4 leading-relaxed border-t border-primary/20 pt-4">{narrative}</p>
            )}
          </div>
        </CardContent>
      </Card>

    </motion.div>
  );
}
