import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Target, Layers } from 'lucide-react';
import { formatCurrency } from '../utils/cn';

// Unified Layouts
import { PageSection } from '../components/layout/PageSection';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { EvidenceModal, type EvidenceData } from '../components/ui/EvidenceModal';

export default function BundleOpportunities() {
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceData | null>(null);
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bundle-opportunities'],
    queryFn: () => api.getBundleOpportunities(10),
  });

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-4">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">Top 10 Bundle Concepts Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(data, 'Insufficient data to compute Top 10 Bundle Concepts.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data?.data?.results || {};
  const items = results.bundle_opportunities || [];
  const top_items = items.slice(0, 10);

  const createOpportunityEvidence = (item: any, rank: number): EvidenceData => {
    const reasonArray = Array.isArray(item.reason) ? item.reason : [];
    const reasonText = Array.isArray(item.reason) 
      ? reasonArray.map((r: any) => `${r.label}: ${r.value}`).join('; ')
      : (item.reason || 'Product opportunity based on dataset gaps, customer intent, and keyword demand');
    
    // Extract metadata from reason array
    const metadata: Record<string, string> = {};
    reasonArray.forEach((r: any) => {
      metadata[r.label] = r.value;
    });

    return {
      title: `Product Opportunity #${rank}: ${item.title || item.concept || 'Unknown'}`,
      displayed_value: item.title || item.concept || 'Unknown Concept',
      source_datasets: metadata['Source Dataset'] ? [metadata['Source Dataset']] : ['Magnet', 'BlackBox'],
      source_columns: metadata['Source Columns']?.split(',').map((c: string) => c.trim()) || ['keyword', 'search_volume', 'keyword_sales', 'category', 'use_case'],
      source_row_count: parseInt(metadata['Supporting Keywords']?.split(' ')[0]) || parseInt(metadata['Demand Signal']?.split(' ')[0]) || 0,
      formula: 'Product opportunities identified through dataset gap analysis, keyword demand signals, revenue opportunity, and customer intent patterns',
      calculation_steps: [
        'Analyze keyword demand and search volume patterns',
        'Identify gaps in current product coverage',
        'Score revenue opportunity from keyword sales data',
        'Assess competition intensity for opportunity keywords',
        'Apply LLM concept generation using dataset context if needed',
        'Rank by opportunity strength and supporting evidence'
      ],
      top_records: reasonArray.length > 0 ? reasonArray.map((r: any) => ({
        field: r.label,
        value: r.value
      })) : undefined,
      classification_reason: reasonText,
      confidence_note: metadata['LLM Used'] === 'true' || metadata['LLM Used'] === 'Yes'
        ? 'Generated using LLM analysis of uploaded dataset context (keywords, demand signals, gaps, customer intent). LLM input fields from actual dataset, not hardcoded concepts.'
        : 'Based on keyword demand analysis, gap identification, and revenue opportunity from uploaded datasets',
      llm_used: metadata['LLM Used'] === 'true' || metadata['LLM Used'] === 'Yes' || false,
      data_quality_notes: !metadata['Demand Signal'] && !metadata['Supporting Keywords']
        ? ['Limited dataset context — upload keyword data with search volume and keyword sales for richer opportunity identification']
        : undefined
    };
  };

  if (top_items.length === 0) {
    return (
      <Card className="mt-4 border-dashed">
        <CardContent className="p-10 flex flex-col items-center text-center text-muted-foreground">
          <Target className="w-10 h-10 mb-3 opacity-20" />
          <p>No product opportunities found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageSection title="Product Opportunities">
        <div className="grid grid-cols-1 gap-4">
        {top_items.map((item: any, idx: number) => {
          let titleText = item.title || item.concept || 'Unknown Concept';
          
          return (
            <Card 
              key={idx} 
              className="overflow-hidden border-l-4 cursor-pointer hover:border-primary/70 hover:shadow-md transition-all" 
              style={{borderLeftColor: 'hsl(var(--primary))'}}
              onClick={() => setSelectedEvidence(createOpportunityEvidence(item, idx + 1))}
            >
              <CardContent className="p-5 flex flex-col gap-3">
                <h3 className="font-bold text-xl leading-tight text-primary">{titleText}</h3>
                
                <div className="p-4 bg-muted/30 rounded-md text-sm border border-border/50 space-y-2">
                  {Array.isArray(item.reason) ? (
                    item.reason.map((r: any, i: number) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="font-bold text-foreground shrink-0 min-w-[140px]">{r.label}:</span>
                        <span className="text-muted-foreground">{r.value}</span>
                      </div>
                    ))
                  ) : (
                    <div>
                      <span className="font-bold text-foreground mr-1">Opportunity Reason:</span> 
                      <span className="text-muted-foreground">{item.reason || "Dataset gap analysis, keyword demand, and revenue opportunity signals"}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic">Click card to see full evidence</p>
              </CardContent>
            </Card>
          );
        })}
        </div>
      </PageSection>

      <EvidenceModal
        isOpen={!!selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        evidence={selectedEvidence}
      />
    </div>
  );
}
