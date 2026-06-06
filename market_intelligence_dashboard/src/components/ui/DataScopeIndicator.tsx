import React from 'react';
import { Database } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface DataScopeSlice {
  description?: string;
  filtering?: string;
  row_count?: number;
  universe?: 'keyword' | 'product';
}

interface DataScopeIndicatorProps {
  scope?: DataScopeSlice | string;
  variant?: 'keyword' | 'product' | 'neutral';
  className?: string;
}

export function DataScopeIndicator({ scope, variant = 'neutral', className }: DataScopeIndicatorProps) {
  const text = typeof scope === 'string' ? scope : scope?.description;
  if (!text) return null;

  const tone =
    variant === 'keyword'
      ? 'border-blue-500/25 bg-blue-500/5 text-blue-900/90 dark:text-blue-100/90'
      : variant === 'product'
        ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-900/90 dark:text-emerald-100/90'
        : 'border-border/40 bg-muted/20 text-muted-foreground';

  const filtering = typeof scope === 'object' ? scope?.filtering : undefined;

  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs mb-4', tone, className)}>
      <Database className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
      <div>
        <p className="font-medium leading-snug">{text}</p>
        {filtering && (
          <p className="text-[10px] opacity-80 mt-0.5">{filtering}</p>
        )}
      </div>
    </div>
  );
}
