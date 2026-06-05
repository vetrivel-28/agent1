import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Target, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../utils/cn';

// Unified Layouts
import { PageSection } from '../components/layout/PageSection';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { EvidenceDrawer, type EvidenceData } from '../components/ui/EvidenceDrawer';
import { formatGenericLabel } from '../utils/formatters';
import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';
import { FilterBar } from '../components/filters/FilterBar';


export default function SubstituteIntelligence() {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const categoryKey = statusData?.data?.category_scope?.selected_categories?.join('|') || 'all';
  const categoryScope = statusData?.data?.category_scope || {};

  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceData | null>(null);
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['substitute-intelligence', categoryKey],
    queryFn: () => api.getSubstituteIntelligence(10, categoryScope),
  });

  const results = data?.data?.results || {};
  const items = results.substitute_products || [];
  
  const filterConfigs: FilterConfig<any>[] = [
    { id: 'brand', label: 'Brand', type: 'search', getValue: r => r.brand },
    { id: 'classification', label: 'Product Type / Classification', type: 'select', getValue: r => r.category || 'Product' },
    { id: 'price_band', label: 'Price Band', type: 'select', getValue: r => r.price ? (r.price > 50 ? 'Premium' : 'Standard') : 'Unknown' },
    { id: 'category_scope', label: 'Category Scope', type: 'select', getValue: r => 'Filtered BlackBox' },
  ];

  const {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  } = useDatasetFilters<any>(items, filterConfigs);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-4">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">Top 10 Alternative Products Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(data, 'Insufficient data to compute Top 10 Alternative Products.')}</p>
        </CardContent>
      </Card>
    );
  }

  

  const top_items = filteredData.slice(0, 10);

  const createSubstituteEvidence = (item: any, rank: number, filterContext?: any): EvidenceData => {
    const reasonArray = Array.isArray(item.reason) ? item.reason : [];
    const reasonText = Array.isArray(item.reason) 
      ? reasonArray.map((r: any) => `${r.label}: ${r.value}`).join('; ')
      : (item.reason || 'Use-case similarity based on keyword classification and customer intent');
    
    // Extract metadata from reason array
    const metadata: Record<string, string> = {};
    reasonArray.forEach((r: any) => {
      metadata[r.label] = r.value;
    });

    return {
      title: `Substitute Product #${rank}: ${item.title || item.concept || 'Unknown'}`,
      displayed_value: item.title || item.concept || 'Unknown Concept',
      source_datasets: metadata['Source Dataset'] ? [metadata['Source Dataset']] : ['Magnet', 'BlackBox'],
      source_columns: metadata['Source Columns']?.split(',').map((c: string) => c.trim()) || ['keyword', 'search_intent', 'category', 'subcategory'],
      source_row_count: parseInt(metadata['Supporting Keywords']?.split(' ')[0]) || 0,
      active_filters: filterContext?.active_filters,
      filtered_row_count: filterContext?.filtered_row_count,
      total_row_count: filterContext?.total_row_count,
      calculation_scope: filterContext ? 'Filtered' : 'Global',
      formula: 'Substitute products identified through keyword classification overlap and use-case similarity scoring',
      calculation_steps: [
        'Analyze keyword classifications across dataset',
        'Identify shared customer problems/jobs-to-be-done',
        'Score use-case similarity between product concepts',
        'Filter for products solving the same problem differently',
        'Rank by classification overlap and intent match'
      ],
      top_records: reasonArray.length > 0 ? reasonArray.map((r: any) => ({
        field: r.label,
        value: r.value
      })) : undefined,
      classification_reason: reasonText,
      confidence_note: metadata['LLM Used'] === 'true' || metadata['LLM Used'] === 'Yes'
        ? 'Generated using LLM analysis of uploaded dataset context (keywords, categories, use cases). Not hardcoded.'
        : 'Based on keyword classification and category similarity from uploaded datasets',
      llm_used: metadata['LLM Used'] === 'true' || metadata['LLM Used'] === 'Yes' || false,
      data_quality_notes: !metadata['Supporting Keywords'] ? ['Limited dataset context — upload more keyword and product data for richer substitute recommendations'] : undefined
    };
  };

  if (top_items.length === 0) {
    return (
      <Card className="mt-4 border-dashed">
        <CardContent className="p-10 flex flex-col items-center text-center text-muted-foreground">
          <Target className="w-10 h-10 mb-3 opacity-20" />
          <p>No substitute products found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar 
        configs={filterConfigs}
        activeFilters={activeFilters}
        setFilter={setFilter}
        clearFilter={clearFilter}
        clearAll={clearAll}
        filterOptions={filterOptions}
        totalRecords={items.length}
        filteredRecords={filteredData.length}
      />
      <PageSection title="Substitute Products">
        <div className="grid grid-cols-1 gap-4">
        {top_items.map((item: any, idx: number) => {
          let titleText = item.title || item.concept || 'Unknown Concept';
          
          return (
            <Card 
              key={idx} 
              className="overflow-hidden border-l-4 cursor-pointer hover:border-primary/70 hover:shadow-md transition-all" 
              style={{borderLeftColor: 'hsl(var(--primary))'}}
              onClick={() => setSelectedEvidence(createSubstituteEvidence(item, idx + 1, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: items.length }))}
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
                      <span className="font-bold text-foreground mr-1">Use-Case Similarity:</span> 
                      <span className="text-muted-foreground">{item.reason || "Keyword classification and customer intent overlap from uploaded dataset"}</span>
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

      <EvidenceDrawer
        isOpen={!!selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        evidence={selectedEvidence}
      />
    </div>
  );
}
