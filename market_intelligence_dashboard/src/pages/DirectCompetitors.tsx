import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Target, Users } from 'lucide-react';
import { formatCurrency } from '../utils/cn';

import { PageHeader } from '../components/layout/PageHeader';
import { PageSection } from '../components/layout/PageSection';
import { ExecutiveNarrative } from '../components/intelligence/ExecutiveNarrative';
import { DashboardSkeleton } from '../components/ui/Skeletons';

export default function DirectCompetitors() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['direct-competitors'],
    queryFn: () => api.getDirectCompetitors(15, 17.5),
  });

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

  const results = data?.data?.results || {};
  const items = (results.direct_competitors || []).flatMap((r: any) => r.top_competitors || []);
  const top_items = items.slice(0, 10);

  const narrative = top_items.length > 0 
    ? `The top direct competitor is ${top_items[0].title || top_items[0].brand || 'N/A'}, scoring ${Number(top_items[0].similarity_score || 0).toFixed(1)}/100 for market similarity. Tracking these peers is critical for pricing strategy and listing optimization.`
    : `No highly similar competitive products could be identified based on current market data.`;

  return (
    <div className="space-y-4">
      <ExecutiveNarrative content={narrative} />

      <PageSection title="Top 10 Similar Products" icon={Users}>
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
                <Card key={idx} className="overflow-hidden border-l-4 bg-card" style={{borderLeftColor: 'hsl(var(--primary))'}}>
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
                        <span className="font-bold uppercase text-[10px] tracking-widest text-primary mr-2">Why?</span> 
                        <span className="text-foreground/80 font-medium">
                          {item.reason || "High similarity based on functional category and pricing overlap."}
                        </span>
                      </div>
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
    </div>
  );
}
