import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { historyStorage } from '../../services/historyStorage';
import { Card, CardContent } from '../ui/Card';

interface TrendComparisonProps {
  currentKeywords: number;
  currentProducts: number;
  currentBrands: number;
}

export function TrendComparison({ currentKeywords, currentProducts, currentBrands }: TrendComparisonProps) {
  const history = historyStorage.getHistory();
  
  // We need at least one previous run to compare against
  if (history.length < 2) return null;

  // history[0] is usually the current run (if it was just saved), so compare with history[1]
  // Or if history[0] doesn't match current, compare with history[0]
  const previous = history.find(h => h.keywords !== currentKeywords || h.products !== currentProducts) || history[1];
  
  if (!previous) return null;

  const calculateDelta = (current: number, prev: number) => {
    if (!prev) return 0;
    return ((current - prev) / prev) * 100;
  };

  const kwDelta = calculateDelta(currentKeywords, previous.keywords);
  const prodDelta = calculateDelta(currentProducts, previous.products);
  const brandDelta = calculateDelta(currentBrands, previous.brands);

  const renderDelta = (delta: number) => {
    if (Math.abs(delta) < 0.1) {
      return <div className="flex items-center gap-1 text-muted-foreground"><Minus className="w-3 h-3" /> <span className="font-mono text-xs">Baseline</span></div>;
    }
    const isPositive = delta > 0;
    return (
      <div className={`flex items-center gap-1 font-mono text-xs font-bold ${isPositive ? 'text-success' : 'text-danger'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isPositive ? '+' : ''}{delta.toFixed(1)}%
      </div>
    );
  };

  return (
    <Card className="border-border/40 mb-6 bg-muted/5">
      <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Trend vs Previous Run</span>
          <span className="text-[10px] text-muted-foreground/60">({new Date(previous.runDate).toLocaleDateString()})</span>
        </div>
        
        <div className="flex items-center gap-6 divide-x divide-border/40">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Demand Vol</span>
            {renderDelta(kwDelta)}
          </div>
          <div className="flex items-center gap-3 pl-6">
            <span className="text-xs text-muted-foreground">Supply Vol</span>
            {renderDelta(prodDelta)}
          </div>
          <div className="flex items-center gap-3 pl-6">
            <span className="text-xs text-muted-foreground">Competition</span>
            {renderDelta(brandDelta)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
