import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from './Card';
import { MetricExplainer } from './MetricExplainer';

interface KPICardProps {
  label: string;
  value: string | number;
  implication?: string;
  confidence?: number;
  icon?: React.ElementType;
  colorClass?: string; // e.g. "emerald-500", "primary"
  onClick?: () => void;
}

export function KPICard({ label, value, implication, confidence, icon: Icon, colorClass = "primary", onClick }: KPICardProps) {
  // Use CSS variables or Tailwind classes based on the colorClass string
  // If colorClass is "emerald-500", it needs to map to text-emerald-500 bg-emerald-500/10 etc.
  // For safety with Tailwind arbitrary strings, we will use inline style or map generic classes.
  
  // A generic fallback pattern using the primary theme
  return (
    <MetricExplainer metricId={label}>
      <motion.div whileHover={onClick ? { y: -2 } : {}} className="h-full" onClick={onClick}>
        <Card className={`border-border/50 bg-card hover:border-primary/40 transition-colors h-full flex flex-col ${onClick ? 'cursor-pointer ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2' : ''}`}>
          <CardContent className="p-6 flex flex-col h-full space-y-4">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
              )}
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</h3>
            </div>
            
            <div>
              <p className="text-metric-value">{value}</p>
              <p className="text-xs text-foreground/70 mt-2 font-medium leading-relaxed">
                {implication}
              </p>
            </div>

            {confidence !== undefined && (
              <div className="mt-auto pt-4 border-t border-border/40 w-full">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Confidence
                  </span>
                  <span className="text-[10px] font-bold text-primary">{confidence}%</span>
                </div>
                <div className="mt-1.5 w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${confidence}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </MetricExplainer>
  );
}
