import React from 'react';
import { Modal } from './Modal';
import { cn } from '../../utils/cn';

// ---------------------------------------------------------------------------
// Evidence object type — used across all pages
// ---------------------------------------------------------------------------
export interface EvidenceData {
  title: string;
  displayed_value: string | number;
  source_datasets: string[];
  source_columns: string[];
  source_row_count: number;
  formula: string | null;
  calculation_steps?: string[];
  top_records?: Array<Record<string, string | number | null>>;
  aggregation_method?: string;
  thresholds?: {
    high: string;
    medium: string;
    low: string;
  };
  classification_reason?: string;
  confidence_note?: string;
  data_quality_notes?: string[];
  llm_used?: boolean;
  /** Left panel: plain-English explanation */
  business_summary?: string;
  business_meaning?: string;
  suggested_action?: string;
  recommendation?: string;
  /** Right panel: structured counts and metadata */
  counts?: Record<string, string | number>;
  dataset_session_id?: string;
  missing_fields?: string[];
  /** Full-width tables below the split */
  detail_tables?: Array<{
    title: string;
    columns: string[];
    rows: Array<Record<string, string | number>>;
    view_all_count?: number;
  }>;
}

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: EvidenceData | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/40 pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-md bg-muted text-xs font-mono text-foreground/70 border border-border/40">
      {label}
    </span>
  );
}

function CountsGrid({ counts }: { counts: Record<string, string | number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([k, v]) => (
        <div key={k} className="p-2 rounded-md border border-border/40 bg-muted/20">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.replace(/_/g, ' ')}</p>
          <p className="text-sm font-semibold font-mono mt-0.5">
            {typeof v === 'number' ? v.toLocaleString() : String(v)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function EvidenceModal({ isOpen, onClose, evidence }: EvidenceModalProps) {
  if (!evidence) return null;

  const hasTopRecords = evidence.top_records && evidence.top_records.length > 0;
  const topRecordKeys = hasTopRecords ? Object.keys(evidence.top_records![0]) : [];
  const hasSplit = !!(evidence.business_summary || evidence.counts);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={evidence.title}
      maxWidth={hasSplit ? 'max-w-5xl' : 'max-w-2xl'}
    >
      <div className="space-y-6 text-sm">

        {hasSplit ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: explanation */}
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg border border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Displayed Value</p>
                <p className="text-2xl font-bold text-foreground">{evidence.displayed_value}</p>
              </div>
              {evidence.business_summary && (
                <Section title="Summary">
                  <p className="text-foreground/80 leading-relaxed">{evidence.business_summary}</p>
                </Section>
              )}
              {evidence.business_meaning && (
                <Section title="Business Meaning">
                  <p className="text-foreground/80 leading-relaxed">{evidence.business_meaning}</p>
                </Section>
              )}
              {evidence.recommendation && (
                <Section title="Recommendation">
                  <p className="font-semibold text-primary">{evidence.recommendation}</p>
                </Section>
              )}
              {evidence.suggested_action && (
                <Section title="Suggested Next Action">
                  <p className="text-foreground/70 leading-relaxed">{evidence.suggested_action}</p>
                </Section>
              )}
              {evidence.classification_reason && (
                <Section title="Classification">
                  <p className="text-xs text-muted-foreground leading-relaxed">{evidence.classification_reason}</p>
                </Section>
              )}
            </div>

            {/* Right: evidence + counts */}
            <div className="space-y-4">
              <Section title="Evidence + Counts">
                <div className="flex flex-wrap gap-1 mb-2">
                  {evidence.source_datasets.map((d, i) => <Chip key={i} label={d} />)}
                </div>
                {evidence.dataset_session_id && (
                  <p className="text-xs text-muted-foreground font-mono mb-2">
                    Session: {evidence.dataset_session_id}
                  </p>
                )}
                {evidence.source_columns.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Columns: {evidence.source_columns.join(', ')}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mb-2">
                  Rows used: {evidence.source_row_count.toLocaleString()}
                </p>
                {evidence.counts && <CountsGrid counts={evidence.counts} />}
              </Section>

              {evidence.formula && (
                <Section title="Formula">
                  <p className="font-mono text-xs bg-muted/50 rounded-md p-3 leading-relaxed whitespace-pre-wrap border border-border/40">
                    {evidence.formula}
                  </p>
                </Section>
              )}

              {evidence.calculation_steps && evidence.calculation_steps.length > 0 && (
                <Section title="Calculation Steps">
                  <ol className="space-y-1 list-decimal list-inside">
                    {evidence.calculation_steps.map((s, i) => (
                      <li key={i} className="text-foreground/80 leading-relaxed text-xs">{s}</li>
                    ))}
                  </ol>
                </Section>
              )}

              {evidence.missing_fields && evidence.missing_fields.length > 0 && (
                <Section title="Missing Fields">
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {evidence.missing_fields.map((f, i) => (
                      <li key={i}>⚠ {f}</li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-lg border border-border/40">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Displayed Value</p>
                <p className="text-2xl font-bold text-foreground">{evidence.displayed_value}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Source Datasets</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {evidence.source_datasets.map((d, i) => <Chip key={i} label={d} />)}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rows Used</p>
                <p className="font-semibold text-foreground">{evidence.source_row_count.toLocaleString()}</p>
              </div>
            </div>

            {evidence.source_columns.length > 0 && (
              <Section title="Source Columns">
                <div className="flex flex-wrap gap-1.5">
                  {evidence.source_columns.map((c, i) => <Chip key={i} label={c} />)}
                </div>
              </Section>
            )}

            {evidence.formula && (
              <Section title="Formula">
                <p className="font-mono text-xs bg-muted/50 rounded-md p-3 leading-relaxed whitespace-pre-wrap border border-border/40">
                  {evidence.formula}
                </p>
              </Section>
            )}

            {evidence.aggregation_method && (
              <Section title="Aggregation Method">
                <p className="text-foreground/80">{evidence.aggregation_method}</p>
              </Section>
            )}

            {evidence.calculation_steps && evidence.calculation_steps.length > 0 && (
              <Section title="Calculation Steps">
                <ol className="space-y-1.5 list-decimal list-inside">
                  {evidence.calculation_steps.map((s, i) => (
                    <li key={i} className="text-foreground/80 leading-relaxed">{s}</li>
                  ))}
                </ol>
              </Section>
            )}
          </>
        )}

        {evidence.thresholds && (
          <Section title="Classification Thresholds (This Dataset)">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-center">
                <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">High</p>
                <p className="text-xs mt-0.5 text-foreground/80">{evidence.thresholds.high}</p>
              </div>
              <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Medium</p>
                <p className="text-xs mt-0.5 text-foreground/80">{evidence.thresholds.medium}</p>
              </div>
              <div className="p-2 rounded-md bg-muted border border-border/40 text-center">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Low</p>
                <p className="text-xs mt-0.5 text-foreground/80">{evidence.thresholds.low}</p>
              </div>
            </div>
          </Section>
        )}

        {hasTopRecords && (
          <Section title={`Top Contributing Records (${evidence.top_records!.length} shown)`}>
            <div className="overflow-x-auto rounded-md border border-border/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/40">
                    {topRecordKeys.map((k) => (
                      <th key={k} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
                        {k.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evidence.top_records!.map((row, i) => (
                    <tr key={i} className={cn('border-b border-border/20', i % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                      {topRecordKeys.map((k) => (
                        <td key={k} className="px-3 py-2 text-foreground/80 font-mono">
                          {String(row[k] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {evidence.detail_tables?.map((tbl, ti) => (
          <Section key={ti} title={tbl.title}>
            <div className="overflow-x-auto rounded-md border border-border/40">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/40">
                    {tbl.columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase text-[10px]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tbl.rows.map((row, i) => (
                    <tr key={i} className={cn('border-b border-border/20', i % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                      {tbl.columns.map((c) => (
                        <td key={c} className="px-3 py-2 text-foreground/80">
                          {String(row[c] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tbl.view_all_count != null && tbl.view_all_count > tbl.rows.length && (
              <p className="text-xs text-muted-foreground mt-1">
                View all ({tbl.view_all_count} total) — expand in dataset export
              </p>
            )}
          </Section>
        ))}

        {(evidence.confidence_note || (evidence.data_quality_notes && evidence.data_quality_notes.length > 0)) && (
          <Section title="Data Quality">
            {evidence.confidence_note && (
              <p className="text-foreground/70 leading-relaxed">{evidence.confidence_note}</p>
            )}
            {evidence.data_quality_notes?.map((n, i) => (
              <p key={i} className="text-amber-700 dark:text-amber-400 text-xs mt-1">⚠ {n}</p>
            ))}
          </Section>
        )}

        {evidence.llm_used && (
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-md text-xs text-primary/80">
            This value was assisted by an AI language model. Treat as supplementary insight.
          </div>
        )}
      </div>
    </Modal>
  );
}
