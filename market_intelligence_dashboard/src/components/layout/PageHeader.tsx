import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '../ui/Badge';
import { ShieldCheck } from 'lucide-react';

interface PageHeaderProps {
  badge: string;
  title: string;
  description?: string;
  kpiSummary?: React.ReactNode;
}

export function PageHeader({ badge, title, description, kpiSummary }: PageHeaderProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col gap-4 border-b border-border/40 pb-8 mb-8"
    >
      <div className="flex items-center justify-between gap-4">
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 w-fit font-mono text-[10px] tracking-widest uppercase rounded-sm px-2.5 py-1">
          {badge}
        </Badge>
        
        <div className="flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-sm border border-success/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          SYSTEM READY
        </div>
      </div>

      <div className="space-y-2 max-w-4xl">
        <h1 className="text-page-title">{title}</h1>
        {description && (
          <p className="text-body text-muted-foreground max-w-3xl leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {kpiSummary && (
        <div className="mt-4">
          {kpiSummary}
        </div>
      )}
    </motion.div>
  );
}
