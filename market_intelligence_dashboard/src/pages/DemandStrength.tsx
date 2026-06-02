import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { formatNumber, cn } from '../utils/cn';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import {
  AlertCircle, Loader2, Target, Lightbulb, TrendingDown,
  TrendingUp, Rocket, Flame, Layers, AlertTriangle, ArrowUpRight
} from 'lucide-react';
import { motion } from 'framer-motion';

type KeywordRow = {
  keyword: string;
  search_volume: number;
  exact_search_volume?: number;
  variant_count?: number;
  contribution_pct: number;
};

type SegmentRow = {
  segment: string;
  demand_share: number;
  keyword_count: number;
  revenue_share: number;
  total_search_volume: number;
  demand_revenue_gap?: number;
  entry_difficulty?: string;
  competition_index?: number;
  keywords?: KeywordRow[];
  formula?: string;
  reconciliation?: {
    category_volume: number;
    keyword_count: number;
    unique_search_volume: number;
    family_overlap_removed: number;
  };
  verification?: {
    status?: string;
    message?: string;
  };
};

type SegmentInsight = {
  name?: string;
  demand_share?: number;
  revenue_share?: number;
  keyword_count?: number;
  gap?: number;
  insight?: string;
  entry_difficulty?: string;
  revenue_efficiency_ratio?: number;
};

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeEntryDifficulty(row: SegmentRow): string {
  if (row.entry_difficulty) return row.entry_difficulty;
  const ci = safeNum(row.competition_index);
  const kw = safeNum(row.keyword_count);
  const share = safeNum(row.demand_share);
  if (row.segment.toLowerCase() === 'other') return 'High';
  if (ci >= 15 || (share > 0 && kw / share >= 12)) return 'Hard';
  if (ci >= 6 || (share > 0 && kw / share >= 5)) return 'Moderate';
  return 'Easy';
}

function getHeatmapOpacity(share: number, maxShare: number) {
  const ratio = maxShare > 0 ? share / maxShare : 0;
  if (ratio > 0.8) return 'bg-primary/100 text-primary-foreground';
  if (ratio > 0.5) return 'bg-primary/80 text-primary-foreground';
  if (ratio > 0.3) return 'bg-primary/60 text-primary-foreground';
  if (ratio > 0.1) return 'bg-primary/40 text-foreground';
  return 'bg-primary/20 text-foreground';
}

export default function DemandStrength() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['demand-intelligence'],
    queryFn: () => api.getDemandStrength(50),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [selectedSegment, setSelectedSegment] = useState<SegmentRow | null>(null);
  const [keywordSearch, setKeywordSearch] = useState('');

  const filteredKeywords = useMemo(() => {
    if (!selectedSegment?.keywords) return [];
    const search = keywordSearch.trim().toLowerCase();
    return selectedSegment.keywords.filter((kw) =>
      kw.keyword.toLowerCase().includes(search)
    );
  }, [selectedSegment, keywordSearch]);

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3 theme-demand">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Analyzing demand themes…</p>
      </div>
    );
  }

  if (isError || !data || !isEngineOk(data)) {
    const timeoutMsg = error instanceof Error && error.message.includes('timeout')
      ? 'The analysis took too long. Try uploading a smaller keyword file.'
      : getEngineErrorMessage(data, 'Upload Magnet (keywords) and/or BlackBox (products) with Search Volume.');
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10 theme-demand">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Demand Intelligence Unavailable</h2>
          <p className="text-danger/80 max-w-md">{timeoutMsg}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data.data?.results || {};

  const distribution: SegmentRow[] = Array.isArray(results.demand_distribution)
    ? results.demand_distribution.map((row: any) => ({
        segment: String(row.segment || 'Other'),
        demand_share: safeNum(row.demand_share),
        keyword_count: safeNum(row.keyword_count),
        revenue_share: safeNum(row.revenue_share),
        total_search_volume: safeNum(row.total_search_volume),
        demand_revenue_gap: safeNum(row.demand_revenue_gap),
        entry_difficulty: row.entry_difficulty,
        competition_index: safeNum(row.competition_index),
        keywords: Array.isArray(row.keywords)
          ? row.keywords.map((kw: any) => ({
              keyword: String(kw.keyword || ''),
              search_volume: safeNum(kw.search_volume),
              exact_search_volume: kw.exact_search_volume !== undefined ? safeNum(kw.exact_search_volume) : undefined,
              variant_count: kw.variant_count !== undefined ? safeNum(kw.variant_count) : undefined,
              contribution_pct: safeNum(kw.contribution_pct),
            }))
          : [],
        formula: row.formula,
        reconciliation: row.reconciliation,
        verification: row.verification,
      }))
    : [];



  const keywordColumns: ColumnDef<KeywordRow>[] = [
    { header: 'Keyword', accessorKey: 'keyword' },
    { header: 'Exact Volume', cell: (item) => item.exact_search_volume !== undefined ? formatNumber(item.exact_search_volume) : '—', className: 'text-right text-muted-foreground' },
    { header: 'Aggregated Volume', cell: (item) => formatNumber(item.search_volume), className: 'text-right font-medium text-primary' },
    { header: 'Variants', cell: (item) => item.variant_count !== undefined ? item.variant_count : '—', className: 'text-right' },
    { header: 'Contribution %', cell: (item) => `${safeNum(item.contribution_pct).toFixed(1)}%`, className: 'text-right' },
  ];

  const exportSegmentCsv = (segment: SegmentRow) => {
    if (!segment?.keywords?.length) return;
    const csvRows = [
      'segment,keyword,search_volume',
      ...segment.keywords.map((kw) =>
        `${JSON.stringify(segment.segment)},${JSON.stringify(kw.keyword)},${kw.search_volume}`
      ),
    ];
    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `segment-${segment.segment.replace(/\s+/g, '_').toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const maxShare = Math.max(...distribution.map(d => d.demand_share), 0);

  const insights = results.executive_insights || {};
  const topSegment = results.top_demand_segment as SegmentInsight | undefined;
  const recommendedEntry = results.recommended_entry_segment;

  const clusterColumns: ColumnDef<SegmentRow>[] = [
    { header: 'Segment Theme', cell: (r) => <span className="font-semibold text-foreground/90">{r.segment || '—'}</span> },
    { header: 'Search Intent %', cell: (r) => <Badge variant="outline">{safeNum(r.demand_share).toFixed(1)}%</Badge> },
    { header: 'Revenue Share', cell: (r) => <span className="font-medium">{safeNum(r.revenue_share).toFixed(1)}%</span> },
    { header: 'Volume', cell: (r) => formatNumber(safeNum(r.total_search_volume)), className: 'text-muted-foreground' },
    {
      header: 'Conversion Gap',
      cell: (r) => {
        const gap = safeNum(r.demand_revenue_gap);
        if (gap > 0) return <span className="text-success font-medium flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> +{gap.toFixed(1)}% (Over-monetizing)</span>;
        if (gap < 0) return <span className="text-danger font-medium flex items-center"><TrendingDown className="w-3 h-3 mr-1"/> {gap.toFixed(1)}% (Under-monetizing)</span>;
        return <span className="text-muted-foreground">Balanced</span>;
      },
    },
    {
      header: 'Friction',
      cell: (r) => {
        const level = computeEntryDifficulty(r);
        return <span className={`text-xs font-bold uppercase tracking-wider ${level === 'Hard' ? 'text-danger' : level === 'Easy' ? 'text-success' : 'text-warning'}`}>{level}</span>;
      },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10 theme-demand">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30 mb-3 border-none">Buyer Intent Analysis</Badge>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Demand Intelligence</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Map consumer behavior, identify concentrated demand clusters, and expose under-monetized search intents.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">Concentration Score</p>
          <p className="text-3xl font-black text-primary">{safeNum(results.demand_concentration_score).toFixed(1)}</p>
        </div>
      </div>

      {/* Tier 1: Major Insight Blocks (Asymmetrical Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Opportunity Card */}
        <Card className="lg:col-span-2 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10"><Target className="w-32 h-32 text-primary" /></div>
          <CardContent className="p-8 relative z-10 flex flex-col h-full justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Dominant Demand Cluster</p>
              <h2 className="text-4xl font-black mb-4">{topSegment?.name || 'N/A'}</h2>
              <p className="text-lg text-foreground/80 leading-relaxed max-w-xl">
                This segment commands <strong className="text-foreground">{safeNum(topSegment?.demand_share).toFixed(1)}%</strong> of all consumer search intent in the category. 
                {insights?.what && ` ${insights.what}`}
              </p>
            </div>
            {insights?.action && (
              <div className="mt-8 flex items-start gap-3 bg-background/50 backdrop-blur-sm p-4 rounded-xl border border-primary/10">
                <Lightbulb className="w-6 h-6 text-warning shrink-0" />
                <p className="text-sm font-medium leading-relaxed">{insights.action}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommended Entry Card */}
        {recommendedEntry?.name ? (
          <Card className="bg-card glass-card hover:-translate-y-1 transition-transform border-border/50">
            <CardContent className="p-6 flex flex-col h-full">
              <div className="flex justify-between items-start mb-6">
                <div className="p-2 bg-primary/10 text-primary rounded-lg"><Rocket className="w-6 h-6" /></div>
                <Badge variant="outline" className="font-mono">{safeNum(recommendedEntry.entry_score).toFixed(0)}/100 Score</Badge>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Recommended Entry</p>
              <h3 className="text-2xl font-bold mb-4">{recommendedEntry.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-auto border-t border-border/50 pt-4">
                {recommendedEntry.reason || 'Balanced demand, strong monetization, and manageable competition.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card glass-card border-border/50 flex items-center justify-center p-6 text-center">
            <div>
              <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No clear entry segment recommended based on current data.</p>
            </div>
          </Card>
        )}
      </div>

      {/* Tier 2: The Demand Heatmap */}
      <section className="space-y-4 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Flame className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-tight">Demand Heatmap</h2>
        </div>
        <Card className="p-6 bg-card/50 glass border-border/50">
          <div className="flex flex-wrap gap-3">
            {distribution.filter(d => d.segment.toLowerCase() !== 'other').map((d, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedSegment(d)}
                className={cn(
                  "p-4 rounded-xl flex flex-col justify-between transition-all hover:scale-[1.02] cursor-pointer shadow-sm border border-black/5 dark:border-white/5",
                  getHeatmapOpacity(d.demand_share, maxShare),
                  selectedSegment?.segment === d.segment && 'ring-2 ring-primary/70'
                )}
                style={{ 
                  flexBasis: `max(200px, ${Math.max(15, (d.demand_share / maxShare) * 40)}%)`,
                  flexGrow: d.demand_share > 5 ? 1 : 0
                }}
              >
                <div className="flex justify-between items-start gap-4 mb-4">
                  <span className="font-bold text-lg leading-tight">{d.segment}</span>
                  <ArrowUpRight className="w-4 h-4 opacity-50 shrink-0" />
                </div>
                <div className="flex justify-between items-end mt-auto">
                  <div>
                    <p className="text-xs font-medium opacity-80 uppercase tracking-wider mb-0.5">Share</p>
                    <p className="font-bold text-xl">{d.demand_share.toFixed(1)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium opacity-80 uppercase tracking-wider mb-0.5">Vol</p>
                    <p className="font-semibold text-sm">{formatNumber(d.total_search_volume)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {selectedSegment ? (
          <section className="space-y-4 pt-4">
            <div className="flex flex-col gap-4">
              <Card className="border border-border/50 bg-card/70 glass-card">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Heatmap Audit</p>
                      <h2 className="text-2xl font-bold">{selectedSegment.segment}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Volume: <span className="font-semibold">{formatNumber(selectedSegment.total_search_volume)}</span> · Keywords: <span className="font-semibold">{selectedSegment.keyword_count}</span> · Share: <span className="font-semibold">{selectedSegment.demand_share.toFixed(1)}%</span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="rounded-full bg-muted/10 px-4 py-2 text-sm text-foreground/80">
                        Verification: <span className={cn(
                          selectedSegment.verification?.status === 'passed' ? 'text-success' : 'text-danger',
                          'font-semibold'
                        )}>{selectedSegment.verification?.status || 'unknown'}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => exportSegmentCsv(selectedSegment)}>
                        Export Segment CSV
                      </Button>
                    </div>
                  </div>
                  {selectedSegment.verification?.message && (
                    <p className="mt-4 text-sm text-muted-foreground">{selectedSegment.verification.message}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border/50 bg-card/70 glass-card">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Top Contributors</p>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {selectedSegment.keywords?.slice(0, 4).map((keyword, index) => (
                          <div key={index} className="rounded-2xl bg-background/80 p-4 border border-border/50">
                            <p className="text-sm font-semibold text-foreground">{keyword.keyword}</p>
                            <p className="text-xs text-primary font-medium mt-1">{formatNumber(keyword.search_volume)} (Aggregated)</p>
                            {keyword.exact_search_volume !== undefined && (
                              <p className="text-xs text-muted-foreground">{formatNumber(keyword.exact_search_volume)} (Exact)</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">{keyword.contribution_pct.toFixed(1)}% segment contribution</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <label htmlFor="keyword-filter" className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Search keyword</label>
                      <input
                        id="keyword-filter"
                        type="search"
                        value={keywordSearch}
                        onChange={(event) => setKeywordSearch(event.target.value)}
                        placeholder="Filter segment keywords"
                        className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/50 bg-card/70 glass-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Keyword Audit Table</p>
                      <p className="text-sm text-muted-foreground">Showing {filteredKeywords.length} of {selectedSegment.keywords?.length ?? 0} keywords</p>
                    </div>
                  </div>
                  
                  {/* View Evidence / Aggregation Formula & Reconciliation */}
                  <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 h-full">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-bold text-primary mb-1">View Evidence: Category Formula</h4>
                          {selectedSegment.formula && (
                            <div className="mb-2 inline-block rounded bg-primary/10 px-2 py-1 text-xs font-mono text-primary font-bold">
                              {selectedSegment.formula}
                            </div>
                          )}
                          <p className="text-sm text-foreground/80 leading-relaxed">
                            <strong>Category Volume = Sum(Unique Search Volumes of Matched Keywords).</strong> This category aggregates ALL keywords containing the formula conditions. The volume displayed is a pure Category-level metric calculated from exactly matched keyword rows, preventing any overlapping family aggregation.
                          </p>
                        </div>
                      </div>
                    </div>

                    {selectedSegment.reconciliation && (
                      <div className="p-4 rounded-xl bg-card border border-border/50 h-full flex flex-col justify-center">
                        <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Volume Reconciliation Audit</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Category Volume</span>
                            <span className="font-bold text-foreground">{formatNumber(selectedSegment.reconciliation.category_volume)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Keyword Count</span>
                            <span className="font-medium text-foreground">{selectedSegment.reconciliation.keyword_count}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Unique Search Volume</span>
                            <span className="font-medium text-success">{formatNumber(selectedSegment.reconciliation.unique_search_volume)}</span>
                          </div>
                          <div className="flex justify-between text-sm border-t border-border/50 pt-3">
                            <span className="text-muted-foreground">Family Overlap Removed</span>
                            <span className="font-medium text-danger">-{formatNumber(selectedSegment.reconciliation.family_overlap_removed)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <DataTable
                    data={filteredKeywords}
                    columns={keywordColumns}
                    pageSize={15}
                  />
                </CardContent>
              </Card>
            </div>
          </section>
        ) : null}

      </section>

      {/* Tier 3: Category Theme Cards (Undervalued vs Over-monetized) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <Card className="border-l-4 border-l-danger bg-gradient-to-r from-danger/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="p-3 rounded-full bg-danger/10 text-danger shrink-0 h-fit"><TrendingDown className="w-6 h-6" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-danger mb-1">Most Undervalued Theme</p>
                <h3 className="text-xl font-bold mb-2">{insights?.most_undervalued_segment?.name || 'None detected'}</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {insights?.most_undervalued_segment?.insight || 'No segments show a significant negative gap between demand share and revenue capture.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-success bg-gradient-to-r from-success/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="p-3 rounded-full bg-success/10 text-success shrink-0 h-fit"><TrendingUp className="w-6 h-6" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-success mb-1">Best Monetized Theme</p>
                <h3 className="text-xl font-bold mb-2">{insights?.best_monetized_segment?.name || 'None detected'}</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {insights?.best_monetized_segment?.insight || 'No segments show a significant positive gap between demand share and revenue capture.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier 4: Detailed Table */}
      <section className="pt-8">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight text-muted-foreground">Demand Opportunity Database</h2>
        </div>
        <DataTable 
          data={distribution} 
          columns={clusterColumns} 
          keyExtractor={(r) => r.segment}
        />
      </section>

    </motion.div>
  );
}
