import React from 'react';
import { motion } from 'framer-motion';
import { AlertOctagon, TrendingDown, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';

interface RevenueAtRiskProps {
  totalRevenue: number;
  dependencyPercentage: number;
  reason: string;
}

export function RevenueAtRisk({ totalRevenue, dependencyPercentage, reason }: RevenueAtRiskProps) {
  const riskAmount = totalRevenue * (dependencyPercentage / 100);
  
  // Format to standard localized currency
  const formattedRisk = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(riskAmount);

  return (
    <Card className="border-rose-500/30 bg-rose-500/5 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <ShieldAlert className="w-32 h-32 text-rose-500" />
      </div>
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <AlertOctagon className="w-5 h-5 text-rose-600" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-rose-700">Revenue At Risk</h3>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-end gap-6">
          <div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-6 h-6 text-rose-600" />
              <span className="text-4xl font-black text-rose-700 tracking-tight">{formattedRisk}</span>
            </div>
            <span className="text-xs font-bold text-rose-700/70 uppercase tracking-widest block mt-1">/ month estimated</span>
          </div>
          
          <div className="flex-1 bg-white/60 dark:bg-black/20 p-4 rounded-xl border border-rose-500/20 backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">Vulnerability Reason</span>
            <p className="text-sm text-foreground/90 font-medium leading-relaxed">
              {reason}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
