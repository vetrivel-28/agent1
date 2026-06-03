import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Info } from 'lucide-react';

interface ChartContainerProps {
  title: string;
  description?: string;
  yAxisLabel: string;
  xAxisLabel: string;
  businessExplanation: string;
  children: React.ReactNode;
}

export function ChartContainer({ title, description, yAxisLabel, xAxisLabel, businessExplanation, children }: ChartContainerProps) {
  return (
    <Card className="border-border/40 shadow-sm overflow-hidden flex flex-col">
      <CardHeader className="bg-muted/10 border-b border-border/30 pb-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <CardTitle className="text-card-title flex items-center gap-2">
              {title}
            </CardTitle>
            {description && (
              <p className="text-helper mt-1 max-w-lg">{description}</p>
            )}
          </div>
          
          <div className="flex items-start gap-2 bg-primary/5 p-3 rounded-lg border border-primary/10 max-w-sm shrink-0">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold uppercase text-primary mb-0.5 tracking-wider">Business Interpretation</p>
              <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                {businessExplanation}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 relative flex-1 min-h-[350px]">
        {/* Y-Axis Label */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 origin-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{yAxisLabel}</span>
        </div>
        
        {/* Chart Area */}
        <div className="w-full h-full pl-6 pb-6">
          {children}
        </div>
        
        {/* X-Axis Label */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{xAxisLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}
