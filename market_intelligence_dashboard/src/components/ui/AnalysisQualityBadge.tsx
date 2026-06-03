import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, ShieldHalf, X, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

export function AnalysisQualityBadge() {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: statusResp } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  if (!statusResp?.data?.metadata) return null;

  const md = statusResp.data.metadata;
  const hasBlackbox = !!md.blackbox;
  const hasMagnet = !!md.magnet;
  const hasClassification = !!md.keyword_classification;

  const magnetRows = md.magnet?.rows || 0;
  const blackboxRows = md.blackbox?.rows || 0;

  // Calculate score heuristic
  let score = 0;
  if (hasBlackbox) score += 35;
  if (hasMagnet) score += 35;
  if (hasClassification) score += 15;
  if (magnetRows > 5000) score += 5;
  if (blackboxRows > 1000) score += 10;

  let quality = 'Low';
  let icon = <ShieldAlert className="w-4 h-4 text-rose-500" />;
  let color = 'text-rose-700 bg-rose-50 border-rose-200';
  let iconLg = <ShieldAlert className="w-10 h-10 text-rose-500" />;

  if (score >= 90) {
    quality = 'Excellent';
    icon = <ShieldCheck className="w-4 h-4 text-emerald-500" />;
    color = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    iconLg = <ShieldCheck className="w-10 h-10 text-emerald-500" />;
  } else if (score >= 70) {
    quality = 'Good';
    icon = <Shield className="w-4 h-4 text-blue-500" />;
    color = 'text-blue-700 bg-blue-50 border-blue-200';
    iconLg = <Shield className="w-10 h-10 text-blue-500" />;
  } else if (score >= 40) {
    quality = 'Moderate';
    icon = <ShieldHalf className="w-4 h-4 text-amber-500" />;
    color = 'text-amber-700 bg-amber-50 border-amber-200';
    iconLg = <ShieldHalf className="w-10 h-10 text-amber-500" />;
  }

  return (
    <>
      <div 
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer hover:shadow-sm transition-all ${color}`}
      >
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">Quality: {quality}</span>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-50 w-full max-w-sm bg-card border border-border shadow-2xl rounded-2xl overflow-hidden p-6"
            >
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center mb-6 mt-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${color.replace('text-', 'bg-').replace('50', '100/50').split(' ')[1]}`}>
                  {iconLg}
                </div>
                <h2 className="text-2xl font-black mb-1">Analysis Quality</h2>
                <p className={`text-lg font-bold ${color.split(' ')[0]}`}>{score}% ({quality})</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className={`w-5 h-5 shrink-0 ${hasBlackbox ? 'text-success' : 'text-muted-foreground opacity-30'}`} />
                  <div>
                    <p className={`text-sm font-bold ${hasBlackbox ? 'text-foreground' : 'text-muted-foreground'}`}>Product Dataset (BlackBox)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{hasBlackbox ? `${blackboxRows.toLocaleString()} rows verified` : 'Missing'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className={`w-5 h-5 shrink-0 ${hasMagnet ? 'text-success' : 'text-muted-foreground opacity-30'}`} />
                  <div>
                    <p className={`text-sm font-bold ${hasMagnet ? 'text-foreground' : 'text-muted-foreground'}`}>Keyword Dataset (Magnet)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{hasMagnet ? `${magnetRows.toLocaleString()} rows verified` : 'Missing'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className={`w-5 h-5 shrink-0 ${hasClassification ? 'text-success' : 'text-muted-foreground opacity-30'}`} />
                  <div>
                    <p className={`text-sm font-bold ${hasClassification ? 'text-foreground' : 'text-muted-foreground'}`}>Classification Dataset</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{hasClassification ? 'Verified' : 'Missing (Optional)'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 bg-muted/40 rounded-xl">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>Why this matters:</strong> Higher quality scores indicate deeper data coverage, resulting in higher confidence for the strategic opportunities generated by the intelligence engine.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
