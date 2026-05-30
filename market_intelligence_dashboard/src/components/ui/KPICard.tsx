import React from 'react';
import { Card, CardContent } from './Card';
import { cn } from '../../utils/cn';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

interface KPICardProps {
  title: string;
  value: string | number;
  trend?: number; // percentage change
  trendLabel?: string;
  subtitle?: string;
  subtitleClassName?: string;
  icon: React.ReactNode;
  status?: 'success' | 'warning' | 'danger' | 'neutral';
  loading?: boolean;
  trendIsPercent?: boolean;
}

export function KPICard({
  title,
  value,
  trend,
  trendLabel,
  subtitle,
  subtitleClassName,
  icon,
  status = 'neutral',
  loading,
  trendIsPercent = true,
}: KPICardProps) {
  const statusColors = {
    success: 'text-success bg-success/10 border-success/20',
    warning: 'text-warning bg-warning/10 border-warning/20',
    danger: 'text-danger bg-danger/10 border-danger/20',
    neutral: 'text-primary bg-primary/10 border-primary/20',
  };

  const TrendIcon = !trend ? Minus : trend > 0 ? TrendingUp : TrendingDown;
  const trendColor = !trend ? 'text-muted-foreground' : trend > 0 ? 'text-success' : 'text-danger';

  return (
    <Card className="hover-card-anim relative overflow-hidden group">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            
            {loading ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
            ) : (
              <motion.h3 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl font-bold tracking-tight"
              >
                {value}
              </motion.h3>
            )}

            {!loading && subtitle && (
              <p className={cn('text-sm font-semibold', subtitleClassName)}>{subtitle}</p>
            )}

            {!loading && trend !== undefined && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-2 mt-2"
              >
                <div className={cn("flex items-center text-xs font-medium", trendColor)}>
                  <TrendIcon className="w-3 h-3 mr-1" />
                  {Math.abs(trend).toFixed(1)}{trendIsPercent ? '%' : ''}
                </div>
                {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
              </motion.div>
            )}
          </div>
          
          <div className={cn("p-3 rounded-xl border transition-colors group-hover:scale-110", statusColors[status])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
