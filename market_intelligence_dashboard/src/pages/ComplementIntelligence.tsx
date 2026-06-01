import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Loader2, Target } from 'lucide-react';
import { formatCurrency } from '../utils/cn';

export default function ComplementIntelligence() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['complement-intelligence'],
    queryFn: () => api.getComplementIntelligence(10),
  });

  if (isLoading) {
    return (
      <div className="flex py-20 items-center justify-center flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Loading Top 5 Complement Products...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-4">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">Top 5 Complement Products Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(data, 'Insufficient data to compute Top 5 Complement Products.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data?.data?.results || {};
  const items = results.complement_products || [];
  const top5 = items.slice(0, 5);

  if (top5.length === 0) {
    return (
      <Card className="mt-4 border-dashed">
        <CardContent className="p-10 flex flex-col items-center text-center text-muted-foreground">
          <Target className="w-10 h-10 mb-3 opacity-20" />
          <p>No complement products found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Top 5 Complement Products</h2>
        <p className="text-muted-foreground">Identifies complementary ecosystem products and cross-sell opportunities.</p>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {top5.map((item: any, idx: number) => {
          const score = Number(item.complement_strength) || 0;
          let titleText = item.title || item.reference_title || item.brand || item.asin || 'Unknown Product';
          if (item.complement_product) titleText = item.complement_product.title || item.complement_product.asin || titleText;
          if (item.primary_product) {
             titleText = (item.primary_product.title || item.primary_product.asin) + " + " + (item.complement_product.title || item.complement_product.asin);
          }
          
          return (
            <Card key={idx} className="overflow-hidden border-l-4" style={{borderLeftColor: 'hsl(var(--primary))'}}>
              <CardContent className="p-5 flex flex-col md:flex-row items-start gap-4">
                <div className="flex items-center justify-center bg-primary/10 text-primary font-bold text-xl rounded-full w-12 h-12 shrink-0">
                  #{idx + 1}
                </div>
                
                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-lg leading-tight line-clamp-2">{titleText}</h3>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {item.brand && item.brand !== 'N/A' && <Badge variant="outline" className="text-[10px]">{item.brand}</Badge>}
                    {item.category && item.category !== 'N/A' && <span className="uppercase text-[10px] font-mono">{item.category}</span>}
                    {item.asin && <span className="font-mono text-xs">{item.asin}</span>}
                    {item.price ? <span className="font-mono font-medium text-foreground">{formatCurrency(item.price)}</span> : null}
                  </div>
                  
                  <div className="mt-3 p-3 bg-muted/30 rounded-md text-sm border border-border/50">
                    <span className="font-semibold text-foreground mr-1">Why?</span> 
                    {item.reason || "This product frequently accompanies your market's main items. The high complement strength indicates strong potential for cross-selling and ecosystem synergy."}
                  </div>
                </div>
                
                <div className="flex flex-col items-end justify-center shrink-0 min-w-[100px]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Score</p>
                  <p className="text-3xl font-black font-mono text-primary">{score.toFixed(1)}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
