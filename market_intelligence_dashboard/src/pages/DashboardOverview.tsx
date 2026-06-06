import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatNumber } from '../utils/cn';
import { Link } from 'react-router-dom';
import {
  Zap, Database, ArrowRight, AlertTriangle, Lightbulb,
  Info, Key, Package, DollarSign, Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';

import { DashboardSkeleton } from '../components/ui/Skeletons';
import { RecommendedActions } from '../components/intelligence/RecommendedActions';
import { EvidenceDrawer, type EvidenceData } from '../components/ui/EvidenceDrawer';
import { DataScopeIndicator } from '../components/ui/DataScopeIndicator';
import { RevenueAtRisk } from '../components/intelligence/RevenueAtRisk';

import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { KPICard } from '../components/ui/KPICard';
import { scopeQueryKeys } from '../hooks/useCategoryScope';

interface MarketInsight {
  title: string;
  description?: string;
  business_summary?: string;
  suggested_action?: string;
  why_recommended?: string;
  usefulness_score?: number;
  confidence?: number;
  evidence?: EvidenceData;
}

function InsightCard({
  insight,
  onOpenEvidence,
}: {
  insight: MarketInsight;
  onOpenEvidence: (evidence: EvidenceData) => void;
}) {
  const summary = insight.description || insight.business_summary || '';
  const action = insight.suggested_action || insight.why_recommended || '';
  const confidencePct = insight.confidence != null
    ? Math.round(Number(insight.confidence) * 10)
    : insight.evidence?.confidence_score;

  return (
    <div
      className="p-4 bg-card border border-border/40 rounded-xl hover-card-anim cursor-pointer group"
      onClick={() => insight.evidence && onOpenEvidence(insight.evidence)}
    >
      <div className="flex items-start gap-3">
        <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-body font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
            {insight.title}
            <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </h4>
          {summary && <p className="text-sm font-medium mt-1">{summary}</p>}
          {action && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-semibold text-foreground/80">Why: </span>
              {action}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {insight.usefulness_score != null && (
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden w-[100px]">
                  <div className="h-full bg-blue-500/50" style={{ width: `${insight.usefulness_score}%` }} />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Score: {insight.usefulness_score}/100
                </span>
              </div>
            )}
            {confidencePct != null && (
              <Badge variant="outline" className="text-[10px]">
                Confidence: {confidencePct}%
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardOverview() {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const { categoryScope, categoryKey, keywordScopeKey, datasetSessionId } = scopeQueryKeys(statusData);

  const [evidence, setEvidence] = useState<EvidenceData | null>(null);

  const { data: reportResp, isLoading, isError, error } = useQuery({
    queryKey: ['overview', datasetSessionId, categoryKey, keywordScopeKey],
    queryFn: () => api.getMarketReport(10, categoryScope),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const hasBlackbox = statusData?.data?.datasets?.blackbox;

  if (!hasBlackbox && !isLoading && statusData) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[70vh] text-center max-w-lg mx-auto space-y-8">
        <div className="relative">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <Database className="w-12 h-12 text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-warning/20 rounded-full flex items-center justify-center">
            <Zap className="w-4 h-4 text-warning" />
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-page-title">No Data Available</h2>
          <p className="text-body text-muted-foreground">
            Upload your market datasets to extract strategic evidence.
          </p>
        </div>
        <Link to="/upload">
          <Button size="lg" className="group px-8 py-3 font-semibold">
            Upload Datasets
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </motion.div>
    );
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  let errorMsg = getEngineErrorMessage(reportResp, 'Failed to generate market report.');
  let errorTitle = 'Analysis Unavailable';

  if (isError && error instanceof Error) {
    if (error.message.includes('404')) {
      errorTitle = 'Endpoint Not Found';
      errorMsg = 'The requested API endpoint does not exist (404).';
    } else if (error.message.includes('500')) {
      errorTitle = 'Server Error';
      errorMsg = 'The backend server encountered an internal error (500).';
    } else if (error.message.includes('Network Error')) {
      errorTitle = 'Network Failure';
      errorMsg = 'Failed to connect to the backend server. Please check your network connection.';
    } else {
      errorTitle = 'API Error';
      errorMsg = error.message;
    }
  }

  if (isError || (reportResp && !isEngineOk(reportResp))) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center min-h-[60vh]">
        <Card className="border-danger/30 bg-danger/5 max-w-lg">
          <CardContent className="p-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mb-5">
              <AlertTriangle className="w-8 h-8 text-danger" />
            </div>
            <h2 className="text-xl font-bold text-danger mb-2">{errorTitle}</h2>
            <p className="text-danger/70 mb-6 text-sm leading-relaxed whitespace-pre-wrap">
              {errorMsg}
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}
              className="border-danger/30 text-danger hover:bg-danger/10">
              Retry Analysis
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const results = reportResp?.data?.results || {};
  const snapshot = results.market_snapshot || {};
  const insights: MarketInsight[] = results.key_insights || [];
  const opportunities = results.opportunity_summary || [];
  const audit = results.data_audit || {};
  const dataScope = results.data_scope || {};
  const keywordScope = dataScope.keyword_intelligence;
  const productScope = dataScope.product_intelligence;
  const revenueVuln = results.revenue_vulnerability || {};
  const scopeMeta = results.scope || {};

  const compositeScore = results.report_metadata?.final_market_score;
  const confidenceBadge = compositeScore != null
    ? `Market score: ${compositeScore}/100`
    : 'Dataset-driven analysis';

  let parsedRev = 0;
  if (typeof snapshot.total_revenue === 'string') {
    parsedRev = parseFloat(snapshot.total_revenue.replace(/[^0-9.-]+/g, '')) || 0;
  } else if (typeof snapshot.total_revenue === 'number') {
    parsedRev = snapshot.total_revenue;
  }
  const scaledRev = parsedRev < 1000 ? parsedRev * 1000000 : parsedRev;

  const vulnPct = Number(revenueVuln.dependency_percentage) || 0;
  const vulnReason = revenueVuln.reason as string | undefined;
  const vulnEvidence = revenueVuln.evidence as EvidenceData | undefined;

  return (
    <>
      <EvidenceDrawer
        isOpen={!!evidence}
        onClose={() => setEvidence(null)}
        evidence={evidence}
      />

      <div className="pb-16 max-w-[1400px] mx-auto px-6 print-only">

        <PageHeader
          badge="Market Report"
          title="Market Intelligence Overview"
          description="Executive briefing with keyword-wide demand signals and category-scoped product competitive metrics. Each section states its data universe."
          kpiSummary={
            <div className="flex gap-2 flex-wrap mt-2">
              <Badge variant="outline" className="text-[10px] bg-background">{confidenceBadge}</Badge>
              {keywordScope?.row_count > 0 && productScope?.row_count > 0 && (
                <Badge variant="outline" className="text-[10px] bg-background">
                  Keywords + products scoped separately
                </Badge>
              )}
            </div>
          }
        />

        <PageSection title="1. Executive KPI Summary">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <DataScopeIndicator scope={keywordScope} variant="keyword" />
            <DataScopeIndicator scope={productScope} variant="product" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <KPICard
              label="Total Revenue"
              value={snapshot.total_revenue || 'N/A'}
              implication="Total monthly revenue from category-scoped products."
              icon={DollarSign}
              confidence={96}
              onClick={() => setEvidence(snapshot.evidence_objects?.total_revenue || {
                title: 'Evidence Unavailable',
                displayed_value: snapshot.total_revenue,
                business_summary: productScope?.description || 'Missing detailed evidence.',
                source_datasets: [], source_columns: [], source_row_count: 0, formula: null,
              })}
            />
            <KPICard
              label="Total Products"
              value={snapshot.total_products || 'N/A'}
              implication="Active ASINs in the selected product scope."
              icon={Package}
              confidence={99}
              onClick={() => setEvidence(snapshot.evidence_objects?.total_products || {
                title: 'Evidence Unavailable',
                displayed_value: snapshot.total_products,
                business_summary: productScope?.description || 'Missing detailed evidence.',
                source_datasets: [], source_columns: [], source_row_count: 0, formula: null,
              })}
            />
            <KPICard
              label="Total Brands"
              value={snapshot.total_brands || 'N/A'}
              implication="Unique brands in the selected product scope."
              icon={Users}
              confidence={99}
              onClick={() => setEvidence(snapshot.evidence_objects?.total_brands || {
                title: 'Evidence Unavailable',
                displayed_value: snapshot.total_brands,
                business_summary: productScope?.description || 'Missing detailed evidence.',
                source_datasets: [], source_columns: [], source_row_count: 0, formula: null,
              })}
            />
            <KPICard
              label="Demand Keywords"
              value={snapshot.total_keywords || 'N/A'}
              implication="Full Magnet keyword universe (not category-filtered)."
              icon={Key}
              confidence={85}
              onClick={() => setEvidence(snapshot.evidence_objects?.total_keywords || {
                title: 'Evidence Unavailable',
                displayed_value: snapshot.total_keywords,
                business_summary: keywordScope?.description || 'Missing detailed evidence.',
                source_datasets: [], source_columns: [], source_row_count: 0, formula: null,
              })}
            />
          </div>
        </PageSection>

        <PageSection title="2. Market Structure (Product Intelligence)">
          <DataScopeIndicator scope={productScope} variant="product" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard
              label="Top 3 Brand Share"
              value={snapshot.top_3_share || 'N/A'}
              implication={snapshot.top_3_share && parseFloat(snapshot.top_3_share) > 60
                ? 'Highly concentrated market — dominated by few players.'
                : 'Moderate concentration — room for competition.'}
              confidence={91}
              onClick={() => setEvidence(snapshot.evidence_objects?.top_3_share || {
                title: 'Evidence Unavailable',
                displayed_value: snapshot.top_3_share,
                business_summary: productScope?.description || 'Missing detailed evidence.',
                source_datasets: [], source_columns: [], source_row_count: 0, formula: null,
              })}
            />
            <KPICard
              label="Market Leader"
              value={snapshot.market_leader || 'N/A'}
              implication={[
                snapshot.market_leader_share ? `Controls ${snapshot.market_leader_share} of scoped market.` : '',
                snapshot.market_leader_revenue ? `Revenue: ${snapshot.market_leader_revenue}` : '',
              ].filter(Boolean).join(' ')}
              confidence={93}
              onClick={() => setEvidence(snapshot.evidence_objects?.market_leader || {
                title: 'Evidence Unavailable',
                displayed_value: snapshot.market_leader,
                business_summary: productScope?.description || 'Missing detailed evidence.',
                source_datasets: [], source_columns: [], source_row_count: 0, formula: null,
              })}
            />
            <KPICard
              label="HHI Score"
              value={snapshot.hhi_score || 'N/A'}
              implication={snapshot.hhi_score && parseFloat(snapshot.hhi_score) > 2500
                ? 'High market concentration. Low fragmentation.'
                : 'Competitive landscape with healthy fragmentation.'}
              confidence={88}
              onClick={() => setEvidence(snapshot.evidence_objects?.hhi_score || {
                title: 'Evidence Unavailable',
                displayed_value: snapshot.hhi_score,
                business_summary: productScope?.description || 'Missing detailed evidence.',
                source_datasets: [], source_columns: [], source_row_count: 0, formula: null,
              })}
            />
          </div>
        </PageSection>

        <PageSection title="3. Revenue Vulnerability Risk">
          <DataScopeIndicator
            scope={{
              description: 'Keyword demand concentration applied to scoped product revenue',
              filtering: `${keywordScope?.filtering || ''} · ${productScope?.filtering || ''}`,
            }}
            variant="neutral"
          />
          {scaledRev > 0 && vulnPct >= 15 && vulnReason ? (
            <div
              className="cursor-pointer"
              onClick={() => vulnEvidence && setEvidence(vulnEvidence)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && vulnEvidence && setEvidence(vulnEvidence)}
            >
              <RevenueAtRisk
                totalRevenue={scaledRev}
                dependencyPercentage={vulnPct}
                reason={vulnReason}
              />
            </div>
          ) : (
            <Card className="border-border/30 bg-muted/30">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                {scaledRev > 0
                  ? 'Keyword demand is sufficiently distributed — no elevated revenue vulnerability detected for the current scope.'
                  : 'Insufficient revenue data for vulnerability assessment.'}
              </CardContent>
            </Card>
          )}
        </PageSection>

        <PageSection title="4. Key Market Insights">
          <DataScopeIndicator
            scope={{
              description: 'Insights derived from calculated engine outputs (product scope + global keyword demand)',
              filtering: 'Each insight includes evidence with source metrics and formulas',
            }}
            variant="neutral"
          />
          <div className="space-y-3">
            {insights.length > 0 ? (
              insights.map((insight, idx) => (
                <InsightCard key={idx} insight={insight} onOpenEvidence={setEvidence} />
              ))
            ) : (
              <Card className="border-border/30 bg-muted/30">
                <CardContent className="p-6 text-center text-muted-foreground text-sm">
                  No validated market insights yet. Run analysis engines after uploading Keyword and Product datasets.
                </CardContent>
              </Card>
            )}
          </div>
        </PageSection>

        <PageSection title="5. Priority Business Actions">
          <DataScopeIndicator scope={productScope} variant="product" />
          <RecommendedActions opportunities={opportunities || []} onOpenEvidence={setEvidence} />
          {(!opportunities || opportunities.length === 0) && (
            <Card className="border-border/30 bg-muted/30 mt-4">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No actionable opportunities identified from the current product scope and engine outputs.
              </CardContent>
            </Card>
          )}
        </PageSection>

        <div className="pt-8 mt-8 border-t border-border/40 pb-16">
          <div className="flex flex-wrap gap-x-8 gap-y-4 items-center justify-center text-sm text-muted-foreground font-mono">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" /> Data Audit:
            </div>
            <div title={audit.product_scope}>{formatNumber(audit.products_analyzed || 0)} Products (scoped)</div>
            <div>•</div>
            <div>{formatNumber(audit.brands_analyzed || 0)} Brands</div>
            <div>•</div>
            <div title={audit.keyword_scope}>{formatNumber(audit.keywords_analyzed || 0)} Keywords (full universe)</div>
            {scopeMeta.mode === 'selected' && scopeMeta.selected_categories?.length > 0 && (
              <>
                <div>•</div>
                <div className="text-primary">Category: {scopeMeta.selected_categories.join(', ')}</div>
              </>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
