import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface DataCoverageBannerProps {
  coveragePercent: number;
  metricName: string; // e.g. "keywords mapped to themes", "revenue assigned to clusters"
  showThreshold?: number; // default 80
}

export function DataCoverageBanner({ coveragePercent, metricName, showThreshold = 80 }: DataCoverageBannerProps) {
  const [isVisible, setIsVisible] = React.useState(true);

  if (coveragePercent >= showThreshold || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-6"
      >
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-warning-foreground mb-1">Partial Data Coverage Detected</h4>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Only <strong className="text-foreground">{coveragePercent}%</strong> of {metricName}. 
              Analysis confidence may be reduced for long-tail segments. For deeper intelligence, upload a larger dataset.
            </p>
          </div>
          <button 
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-warning/20 rounded-md text-warning/70 hover:text-warning transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
