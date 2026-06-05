import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Target, Users } from 'lucide-react';
import { formatCurrency } from '../utils/cn';

import { PageSection } from '../components/layout/PageSection';
import { DashboardSkeleton } from '../components/ui/Skeletons';
import { EvidenceDrawer, type EvidenceData } from '../components/ui/EvidenceDrawer';
import { formatGenericLabel } from '../utils/formatters';
import { useDatasetFilters, type FilterConfig } from '../hooks/useDatasetFilters';
import { FilterBar } from '../components/filters/FilterBar';


export default function DirectCompetitors() {
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const categoryKey = statusData?.data?.category_scope?.selected_categories?.join('|') || 'all';
  const categoryScope = statusData?.data?.category_scope || {};

  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceData | null>(null);
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['direct-competitors', categoryKey],
    queryFn: () => api.getDirectCompetitors(15, 17.5, categoryScope),
  });

  const results = data?.data?.results || {};
  const items = (results.direct_competitors || []).flatMap((r: any) => r.top_competitors || []);
  
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
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">Top 10 Similar Products Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(data, 'Insufficient data to compute Top 10 Similar Products.')}</p>
        </CardContent>
      </Card>
    );
  }

  

  const top_items = filteredData.slice(0, 10);

  const createProductEvidence = (item: any, rank: number, filterContext?: any): EvidenceData => {
    const score = Number(item.similarity_score) || 0;
    return {
      title: `Direct Product #${rank}: ${item.title || item.brand || 'Unknown'}`,
      displayed_value: `Similarity: ${score.toFixed(1)}/100`,
      source_datasets: ['BlackBox'],
      source_columns: ['Title', 'Brand', 'ASIN', 'Category', 'Subcategory', 'Price', 'Revenue', 'Sales', 'Review Count'],
      source_row_count: 1,
      active_filters: filterContext?.active_filters,
      filtered_row_count: filterContext?.filtered_row_count,
      total_row_count: filterContext?.total_row_count,
      calculation_scope: filterContext ? 'Filtered' : 'Global',
      formula: 'Similarity score based on category overlap, functional use case, price band proximity, and keyword classification match',
      calculation_steps: [
        'Match product title against category and subcategory patterns',
        'Compare functional use case and customer intent',
        'Evaluate price band proximity',
        'Score keyword classification overlap',
        'Compute weighted composite similarity (0-100)'
      ],
      top_records: [{
        title: item.title || item.reference_title || 'Unknown Product',
        brand: item.brand || 'N/A',
        asin: item.asin || 'N/A',
        category: item.category || 'N/A',
        subcategory: item.subcategory || 'N/A',
        price: item.price ? formatCurrency(item.price) : 'N/A',
        similarity_score: score.toFixed(1),
      }],
      classification_reason: item.reason || 'High similarity based on functional category and pricing overlap',
      confidence_note: 'Direct products identified from BlackBox dataset using category, brand, price, and functional similarity matching',
      llm_used: false
    };
  };

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
      <PageSection title="Direct Products">
        {top_items.length === 0 ? (
          <Card className="mt-4 border-dashed border-border/50 bg-card">
            <CardContent className="p-10 flex flex-col items-center text-center text-muted-foreground">
              <Target className="w-10 h-10 mb-3 opacity-20" />
              <p>No similar products found in the current dataset.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {top_items.map((item: any, idx: number) => {
              const score = Number(item.similarity_score) || 0;
              let titleText = item.title || item.reference_title || 'Unknown Product';
              
              return (
                <Card 
                  key={idx} 
                  className="overflow-hidden border-l-4 bg-card cursor-pointer hover:border-primary/70 hover:shadow-md transition-all" 
                  style={{borderLeftColor: 'hsl(var(--primary))'}}
                  onClick={() => setSelectedEvidence(createProductEvidence(item, idx + 1, { active_filters: activeFilters, filtered_row_count: filteredData.length, total_row_count: items.length }))}
                >
                  <CardContent className="p-5 flex flex-col md:flex-row items-start gap-4">
                    <div className="flex items-center justify-center bg-primary/10 text-primary font-bold text-xl rounded-full w-12 h-12 shrink-0">
                      #{idx + 1}
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <h3 className="font-bold text-lg leading-tight line-clamp-2 text-foreground/90">{titleText}</h3>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        {item.brand && item.brand !== 'N/A' && item.brand !== '' && <Badge variant="outline" className="text-[10px]">{item.brand}</Badge>}
                        {item.asin && <span className="font-mono text-xs border border-border/50 bg-muted/30 rounded-sm px-1.5 py-0.5">{item.asin}</span>}
                        {item.price ? <span className="font-mono font-bold text-foreground">{formatCurrency(item.price)}</span> : null}
                      </div>
                      
                      <div className="mt-3 p-3 bg-muted/20 rounded-md text-sm border border-border/40">
                        <span className="font-bold uppercase text-[10px] tracking-widest text-primary mr-2">Why Direct Product:</span> 
                        <span className="text-foreground/80 font-medium">
                          {item.reason || "High similarity based on functional category and pricing overlap"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground italic">Click card to see full evidence</p>
                    </div>
                    
                    <div className="flex flex-col items-end justify-center shrink-0 min-w-[100px] p-2 bg-muted/10 rounded-lg border border-border/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Similarity</p>
                      <p className="text-3xl font-black font-mono text-primary">{score.toFixed(1)}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageSection>

      <EvidenceDrawer
        isOpen={!!selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        evidence={selectedEvidence}
      />
    </div>
  );
}
