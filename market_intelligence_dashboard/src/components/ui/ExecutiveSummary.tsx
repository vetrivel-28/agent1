import React from 'react';
import { motion } from 'framer-motion';
import { Target, DollarSign, Users, TrendingUp } from 'lucide-react';
import { AnalysisQualityBadge } from './AnalysisQualityBadge';

interface ExecutiveSummaryProps {
  totalRevenue: string;
  totalBrands: string;
  concentrationLevel: string;
  topOpportunityTitle: string;
}

export function ExecutiveSummary({
  totalRevenue,
  totalBrands,
  concentrationLevel,
  topOpportunityTitle
}: ExecutiveSummaryProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-40 w-full bg-background/90 backdrop-blur-xl border-b border-border shadow-sm py-3 px-6 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
    >
      <div className="flex items-center gap-6 divide-x divide-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market Size</p>
            <p className="text-sm font-black">{totalRevenue || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-6">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Brand Count</p>
            <p className="text-sm font-black">{totalBrands || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-6">
          <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Concentration</p>
            <p className="text-sm font-black">{concentrationLevel || 'Moderate'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-6">
          <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Top Opportunity</p>
            <p className="text-sm font-black text-purple-700 truncate max-w-[200px]">{topOpportunityTitle || 'N/A'}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center shrink-0">
        <AnalysisQualityBadge />
      </div>
    </motion.div>
  );
}
