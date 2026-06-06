import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Database, Calculator, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';

// ---------------------------------------------------------------------------
// Unified Evidence object type
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
  confidence_score?: number;
  source_page?: string;
  data_scope?: {
    keyword_intelligence?: { description?: string; filtering?: string };
    product_intelligence?: { description?: string; filtering?: string };
  };
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
  /** Filter scope metrics */
  active_filters?: Record<string, any>;
  filtered_row_count?: number;
  total_row_count?: number;
  calculation_scope?: 'Global' | 'Filtered';
  category_scope?: string[];
  keyword_scope?: Record<string, any>;
  /** Full-width tables below the split */
  detail_tables?: Array<{
    title: string;
    columns: string[];
    rows: Array<Record<string, string | number>>;
    view_all_count?: number;
  }>;
}

interface EvidenceDrawerProps {
  evidence: EvidenceData | null;
  isOpen: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border/40 pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-foreground/70 border border-border/40">
      {label}
    </span>
  );
}

function CountsGrid({ counts }: { counts: Record<string, string | number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
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

export function EvidenceDrawer({ evidence, isOpen, onClose }: EvidenceDrawerProps) {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    enabled: isOpen,
  });

  if (!evidence || !isOpen) {
    return null;
  }
  
  const hasTopRecords = evidence.top_records && evidence.top_records.length > 0;
  const topRecordKeys = hasTopRecords ? Object.keys(evidence.top_records![0]) : [];
  const cScope = statusData?.data?.category_scope;
  const hasProductData = evidence.source_datasets?.some(d => d.toLowerCase().includes('blackbox'));
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
      />
      
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-4xl bg-background shadow-2xl z-[101] flex flex-col border-l border-border/50"
      >
        <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border/50 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-section-title text-foreground">
              {evidence.title || 'Evidence Detail'}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 text-xs font-medium text-muted-foreground flex-wrap">
              <Database className="w-3.5 h-3.5" />
              <span>Evidence Audit Trail</span>
              {evidence.source_page && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border/50">
                  {evidence.source_page}
                </span>
              )}
              {evidence.confidence_score != null && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                  Confidence: {evidence.confidence_score}%
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5 text-foreground/70" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Side: Business Narrative */}
            <div className="space-y-8">
              <div className="p-6 bg-card rounded-xl border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 font-bold">Displayed Value</p>
                <p className="text-3xl font-bold text-foreground tracking-tight">{evidence.displayed_value}</p>
                
                {evidence.confidence_note && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-semibold">
                      <Info className="w-3.5 h-3.5" />
                      {evidence.confidence_note}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Scope Proof Block */}
              {(cScope || evidence.keyword_scope || evidence.data_scope) && (
                <div className="p-4 bg-muted/30 rounded-xl border border-border/50 text-sm">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    <Database className="w-3.5 h-3.5" /> Calculation Scope
                  </h4>
                  
                  {/* Category Scope */}
                  {evidence.data_scope && (
                    <div className="space-y-2 mb-4 pb-4 border-b border-border/50">
                      {evidence.data_scope.keyword_intelligence?.description && (
                        <div className="text-xs">
                          <span className="text-muted-foreground block">Keywords</span>
                          <span className="font-medium">{evidence.data_scope.keyword_intelligence.description}</span>
                        </div>
                      )}
                      {evidence.data_scope.product_intelligence?.description && (
                        <div className="text-xs">
                          <span className="text-muted-foreground block">Products</span>
                          <span className="font-medium">{evidence.data_scope.product_intelligence.description}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {cScope && (
                    <div className="space-y-2 mb-4 pb-4 border-b border-border/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category Scope</p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mode</span>
                        <span className="font-semibold text-foreground">
                          {cScope.mode === 'all' ? 'All Categories' : 'Selected Categories'}
                        </span>
                      </div>
                      {cScope.mode === 'selected' && cScope.selected_categories && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Selected</span>
                          <span className="font-semibold text-foreground text-right max-w-[200px] truncate" title={cScope.selected_categories.join(', ')}>
                            {cScope.selected_categories.join(', ')}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Rows (BlackBox)</span>
                        <span className="font-mono text-muted-foreground">{cScope.blackbox_rows_total?.toLocaleString() ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground font-medium">Active Scoped Rows</span>
                        <span className="font-mono font-bold text-emerald-500">{cScope.blackbox_rows_active?.toLocaleString() ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Excluded Rows</span>
                        <span className="font-mono text-xs text-muted-foreground">{cScope.blackbox_rows_excluded?.toLocaleString() ?? 0}</span>
                      </div>
                    </div>
                  )}

                  {/* Keyword Scope */}
                  {evidence.keyword_scope && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Keyword Scope</p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Magnet Keywords</span>
                        <span className="font-mono text-muted-foreground">{evidence.keyword_scope.totalKeywordCount?.toLocaleString() ?? 0}</span>
                      </div>
                      {evidence.keyword_scope.mode === 'category_mapped' ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-foreground font-medium">Category-Mapped Keywords</span>
                            <span className="font-mono font-bold text-emerald-500">{evidence.keyword_scope.matchedKeywordCount?.toLocaleString() ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground text-xs">Excluded Keywords</span>
                            <span className="font-mono text-xs text-muted-foreground">{evidence.keyword_scope.excludedKeywordCount?.toLocaleString() ?? 0}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-foreground font-medium">Active Keywords</span>
                          <span className="font-mono font-bold text-emerald-500">{evidence.keyword_scope.matchedKeywordCount?.toLocaleString() ?? evidence.keyword_scope.totalKeywordCount?.toLocaleString() ?? 0}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Mapping Confidence</span>
                        <span className="font-mono text-xs text-muted-foreground">{evidence.keyword_scope.mappingConfidence?.toFixed(1) ?? 0}%</span>
                      </div>
                      {evidence.keyword_scope.mappingMethod && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-xs">Mapping Method</span>
                          <span className="text-xs text-right max-w-[220px]">{evidence.keyword_scope.mappingMethod}</span>
                        </div>
                      )}
                      {evidence.keyword_scope.topScopedPhrases && (
                        <div className="pt-2 mt-2 border-t border-border/30">
                          <span className="text-xs text-muted-foreground block mb-1">Top Scoped Product Phrases:</span>
                          <div className="flex flex-wrap gap-1">
                            {evidence.keyword_scope.topScopedPhrases.map((phrase: string, i: number) => (
                              <span key={i} className="text-[10px] bg-muted/50 border border-border/50 px-1.5 py-0.5 rounded text-foreground/80">{phrase}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {evidence.keyword_scope.topMatchedKeywords?.length > 0 && (
                        <div className="pt-2 mt-2 border-t border-border/30">
                          <span className="text-xs text-muted-foreground block mb-1">Top Matched Keywords:</span>
                          <div className="flex flex-wrap gap-1">
                            {evidence.keyword_scope.topMatchedKeywords.slice(0, 8).map((kw: string, i: number) => (
                              <span key={i} className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-foreground/80">{kw}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-6">
                {(evidence.business_summary || evidence.business_meaning) && (
                  <Section title="Business Meaning">
                    {evidence.business_summary && (
                      <p className="text-body leading-relaxed">{evidence.business_summary}</p>
                    )}
                    {evidence.business_meaning && (
                      <p className="text-body leading-relaxed">{evidence.business_meaning}</p>
                    )}
                  </Section>
                )}
                
                {evidence.classification_reason && (
                  <Section title="Classification Detail">
                    <p className="text-body leading-relaxed text-muted-foreground">{evidence.classification_reason}</p>
                  </Section>
                )}

                {(evidence.recommendation || evidence.suggested_action) && (
                  <Section title="Strategic Action">
                    {evidence.recommendation && (
                      <p className="text-body font-semibold text-primary">{evidence.recommendation}</p>
                    )}
                    {evidence.suggested_action && (
                      <p className="text-body leading-relaxed">{evidence.suggested_action}</p>
                    )}
                  </Section>
                )}
              </div>
            </div>
            
            {/* Right Side: Data Evidence & Mechanics */}
            <div className="space-y-6 lg:pl-8 lg:border-l lg:border-border/40">
              
              <Section title="Source Intelligence">
                <div className="bg-muted/20 p-4 rounded-lg border border-border/40 space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Datasets</p>
                    <div className="flex flex-wrap gap-1.5">
                      {evidence.source_datasets.length > 0 
                        ? evidence.source_datasets.map((d, i) => <Chip key={i} label={d} />)
                        : <span className="text-xs text-foreground/50">N/A</span>}
                    </div>
                  </div>
                  
                  {evidence.dataset_session_id && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Session ID</p>
                      <p className="text-xs font-mono bg-background px-2 py-1 rounded border border-border/40 inline-block">{evidence.dataset_session_id}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/40">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Rows Processed</p>
                      <p className="text-sm font-semibold">{evidence.source_row_count.toLocaleString()}</p>
                    </div>
                    {evidence.source_columns.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Columns Used</p>
                        <div className="flex flex-wrap gap-1">
                          {evidence.source_columns.slice(0, 3).map((c, i) => <Chip key={i} label={c} />)}
                          {evidence.source_columns.length > 3 && <Chip label={`+${evidence.source_columns.length - 3}`} />}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {hasProductData && cScope && (
                    <div className="pt-2 border-t border-border/40 mt-2 space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 font-medium">Calculation Scope</p>
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold",
                          cScope.mode === 'all' || !cScope.selected_categories?.length ? "bg-primary/10 text-primary" : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                        )}>
                          {cScope.mode === 'all' || !cScope.selected_categories?.length 
                            ? "All Categories" 
                            : cScope.selected_categories.length > 1 
                              ? `Selected Categories: ${cScope.selected_categories.length}`
                              : `Selected Category: ${cScope.selected_categories[0]}`}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-0.5 font-medium">Category Column</p>
                          <p className="font-mono">{cScope.category_column || 'None'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5 font-medium">Excluded Rows</p>
                          <p className="font-mono text-danger">{cScope.blackbox_rows_excluded?.toLocaleString() || 0}</p>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 font-medium">Active Scoped Rows</p>
                        <p className="text-sm font-semibold text-emerald-500">
                          {cScope.blackbox_rows_active?.toLocaleString() || 0} <span className="text-muted-foreground text-xs font-normal">of {cScope.blackbox_rows_total?.toLocaleString() || 0} total</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {evidence.active_filters && Object.keys(evidence.active_filters).length > 0 && (
                    <div className="pt-2 border-t border-border/40 mt-2">
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium">Active Filters</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(evidence.active_filters).map(([k, v]) => (
                          <Chip key={k} label={`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`} />
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {evidence.counts && <CountsGrid counts={evidence.counts} />}
                </div>
              </Section>
              
              {(evidence.formula || (evidence.calculation_steps && evidence.calculation_steps.length > 0)) && (
                <Section title="Calculation Mechanics">
                  <div className="space-y-3">
                    {evidence.formula && (
                      <div className="bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-2 text-blue-700 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider">
                          <Calculator className="w-3.5 h-3.5" /> Formula
                        </div>
                        <p className="font-mono text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {evidence.formula}
                        </p>
                      </div>
                    )}
                    
                    {evidence.calculation_steps && evidence.calculation_steps.length > 0 && (
                      <ol className="list-decimal list-inside space-y-1.5 text-xs text-foreground/80 font-mono mt-3">
                        {evidence.calculation_steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                </Section>
              )}

              {evidence.missing_fields && evidence.missing_fields.length > 0 && (
                <Section title="Data Exclusion / Missing">
                  <ul className="text-xs text-danger/80 space-y-1 bg-danger/5 border border-danger/20 p-3 rounded-lg">
                    {evidence.missing_fields.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-danger"></span> 
                        {f}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          </div>
          
          {/* Full Width Sections below split */}
          <div className="mt-8 space-y-8 border-t border-border/50 pt-8">
            {hasTopRecords && (
              <Section title={`Top Contributing Records (${evidence.top_records!.length} shown)`}>
                <div className="overflow-x-auto rounded-lg border border-border/50 shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border/50">
                        {topRecordKeys.map((k) => (
                          <th key={k} className="px-4 py-2.5 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">
                            {k.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {evidence.top_records!.map((row, i) => (
                        <tr key={i} className="bg-card hover:bg-muted/30 transition-colors">
                          {topRecordKeys.map((k) => (
                            <td key={k} className="px-4 py-2 text-foreground/90 font-mono">
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
                <div className="overflow-x-auto rounded-lg border border-border/50 shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border/50">
                        {tbl.columns.map((c) => (
                          <th key={c} className="px-4 py-2.5 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {tbl.rows.map((row, i) => (
                        <tr key={i} className="bg-card hover:bg-muted/30 transition-colors">
                          {tbl.columns.map((c) => (
                            <td key={c} className="px-4 py-2 text-foreground/90">
                              {String(row[c] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {tbl.view_all_count != null && tbl.view_all_count > tbl.rows.length && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center justify-end">
                    View all ({tbl.view_all_count} total) — expand in dataset export
                  </p>
                )}
              </Section>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Export the type so other files can import `EvidenceData` from `EvidenceDrawer`
export default EvidenceDrawer;
