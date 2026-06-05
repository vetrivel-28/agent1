import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from './Card';
import { MetricExplainer } from './MetricExplainer';
import { MousePointerClick } from 'lucide-react';
import { formatConfidence } from '../../utils/formatters';

interface KPICardProps {
  label: string;
  value: string | number;
  implication?: string;
  confidence?: number;
  icon?: React.ElementType;
  colorClass?: string; // e.g. "blue-500", "primary"
  scope?: 'Global' | 'Filtered';
  onClick?: () => void;
}

export function KPICard({ label, value, implication, confidence, icon: Icon, colorClass = "primary", scope, onClick }: KPICardProps) {
  const conf = formatConfidence(confidence);
  
  // Guard against raw formula text in the implication
  let cleanImplication = implication;
  if (implication && (implication.includes('SUM(') || implication.includes(' / '))) {
    cleanImplication = "Metric calculation available in evidence details.";
  }

  return (
    <MetricExplainer metricId={label}>
      <motion.div 
        whileHover={onClick ? { y: -3 } : {}} 
        className="h-full group" 
        onClick={onClick}
      >
        <Card className={`border-border/50 bg-card hover:border-primary/40 transition-all duration-300 h-full flex flex-col shadow-sm hover:shadow-md ${onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2' : ''}`}>
          <CardContent className="p-5 flex flex-col h-full">
            
            {/* Header: Icon + Label */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {Icon && (
                  <div className="p-1.5 bg-primary/10 rounded-md">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                )}
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</h3>
              </div>
              {onClick && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-medium text-primary flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full">
                    <MousePointerClick className="w-3 h-3" /> Evidence
                  </span>
                </div>
              )}
            </div>
            
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
                {scope && (
                  <span className="text-[9px] uppercase tracking-wider font-bold bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded-sm">
                    {scope}
                  </span>
                )}
              </div>
              {cleanImplication && (
                <p className="text-xs text-muted-foreground mt-2 font-medium leading-relaxed max-w-[90%]">
                  {cleanImplication}
                </p>
              )}
            </div>

            {/* Confidence Footer */}
            {confidence !== undefined && conf && (
              <div className="mt-auto pt-3 border-t border-border/40 w-full flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Confidence
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm bg-muted/50 ${conf.class}`}>
                  {conf.label} {conf.isDirectional ? '(Directional)' : `${confidence}%`}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </MetricExplainer>
  );
}
