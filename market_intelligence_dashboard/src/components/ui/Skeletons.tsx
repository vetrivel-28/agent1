import React from 'react';
import { motion } from 'framer-motion';

export function CardSkeleton() {
  return (
    <div className="bg-card border border-border/40 rounded-xl p-6 space-y-4">
      <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
      <div className="h-8 w-1/2 bg-muted animate-pulse rounded" />
      <div className="h-3 w-2/3 bg-muted/60 animate-pulse rounded" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
      <div className="h-12 bg-muted/50 animate-pulse border-b border-border/40" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 border-b border-border/20">
          <div className="h-4 w-1/4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-1/4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-1/4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-1/4 bg-muted animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-card border border-border/40 rounded-xl p-6 flex flex-col items-center justify-center h-80 space-y-4">
      <div className="w-full flex justify-between items-end h-full px-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div 
            key={i} 
            className="w-full bg-muted animate-pulse rounded-t-sm" 
            style={{ height: `${Math.max(20, Math.random() * 100)}%` }} 
          />
        ))}
      </div>
      <div className="h-3 w-1/2 bg-muted/60 animate-pulse rounded mt-4" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in p-8 w-full max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-3 border-b border-border/40 pb-6">
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="h-10 w-96 bg-muted animate-pulse rounded" />
        <div className="h-4 w-1/2 bg-muted/60 animate-pulse rounded" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <ChartSkeleton />
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
