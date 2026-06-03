import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Target, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../utils/cn';

// Unified Layouts
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { DashboardSkeleton } from '../components/ui/Skeletons';

export default function SubstituteIntelligence() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['substitute-intelligence'],
    queryFn: () => api.getSubstituteIntelligence(10),
  });

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

  const results = data?.data?.results || {};
  const items = results.substitute_products || [];
  const top_items = items.slice(0, 10);

  if (top_items.length === 0) {
    return (
      <Card className="mt-4 border-dashed">
        <CardContent className="p-10 flex flex-col items-center text-center text-muted-foreground">
          <Target className="w-10 h-10 mb-3 opacity-20" />
          <p>No alternative products found.</p>
        </CardContent>
      </Card>
    );
  }

  const narrative = top_items.length > 0
    ? `We identified ${top_items.length} potential alternative products based on LLM-inferred relationships and use cases. Note: These are derived from functional similarity rather than hard sales data.`
    : `No alternative products could be confidently inferred from the current dataset.`;

  return (
    <div className="space-y-4">
      <ExecutiveNarrative content={narrative} />

      <PageSection title="Top 10 LLM-Inferred Alternative Products" icon={ShieldAlert}>
        <div className="grid grid-cols-1 gap-4">
        {top_items.map((item: any, idx: number) => {
          let titleText = item.title || item.concept || 'Unknown Concept';
          
          return (
            <Card key={idx} className="overflow-hidden border-l-4" style={{borderLeftColor: 'hsl(var(--primary))'}}>
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
                      <span className="font-bold text-foreground mr-1">Concept Evidence:</span> 
                      <span className="text-muted-foreground">{item.reason || "Not enough evidence from available data."}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        </div>
      </PageSection>
    </div>
  );
}
