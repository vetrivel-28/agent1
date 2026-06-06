/**
 * InsightModal — centered popup that replaces the right-side EvidenceDrawer
 * on the Consumer Adoption Simulator page.
 *
 * Shows business-readable information: title, plain-English explanation,
 * formula, actual calculation, dashboard signals, and recommended action.
 * Never shows rows_processed, internal debug traces, or raw engine dumps.
 */

import { useEffect } from 'react';
import { X, Info, TrendingUp, AlertCircle, CheckCircle2, BarChart2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

export interface ModalSection {
  heading: string;
  body: string | string[];
  type?: 'normal' | 'formula' | 'table' | 'insight' | 'warning';
}

export interface InsightModalData {
  title: string;
  subtitle?: string;
  value?: string;          // e.g. "54.6%"
  valueMeaning?: string;   // e.g. "High Adoption"
  sections: ModalSection[];
}

interface InsightModalProps {
  data: InsightModalData | null;
  onClose: () => void;
}

export function InsightModal({ data, onClose }: InsightModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      {data && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden pointer-events-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between p-5 pb-4 border-b border-border/60 shrink-0">
                <div className="flex-1 min-w-0 pr-4">
                  <h2 className="text-base font-bold text-foreground leading-tight">{data.title}</h2>
                  {data.subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">{data.subtitle}</p>
                  )}
                </div>
                {data.value && (
                  <div className="text-right shrink-0 mr-3">
                    <p className="text-2xl font-black font-mono text-primary">{data.value}</p>
                    {data.valueMeaning && (
                      <p className="text-[10px] text-muted-foreground">{data.valueMeaning}</p>
                    )}
                  </div>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body — scrollable */}
              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {data.sections.map((sec, i) => (
                  <ModalSectionBlock key={i} section={sec} />
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ModalSectionBlock({ section }: { section: ModalSection }) {
  const Icon =
    section.type === 'formula' ? BarChart2 :
    section.type === 'insight' ? TrendingUp :
    section.type === 'warning' ? AlertCircle :
    section.type === 'table' ? Info :
    CheckCircle2;

  const iconColor =
    section.type === 'formula' ? 'text-primary' :
    section.type === 'insight' ? 'text-emerald-500' :
    section.type === 'warning' ? 'text-amber-500' :
    'text-muted-foreground';

  const bgColor =
    section.type === 'formula' ? 'bg-primary/5 border-primary/20' :
    section.type === 'insight' ? 'bg-emerald-500/5 border-emerald-500/20' :
    section.type === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
    'bg-muted/20 border-border/40';

  const lines = Array.isArray(section.body) ? section.body : [section.body];

  return (
    <div className={cn('rounded-xl border p-4', bgColor)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', iconColor)} />
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/70">{section.heading}</h3>
      </div>
      {section.type === 'formula' ? (
        <div className="space-y-1">
          {lines.map((line, i) => (
            <p key={i} className="text-xs font-mono text-primary/90 leading-relaxed">{line}</p>
          ))}
        </div>
      ) : section.type === 'table' ? (
        <div className="space-y-1">
          {lines.map((line, i) => (
            <p key={i} className={cn('text-xs leading-relaxed',
              line.startsWith('→') ? 'font-bold text-foreground' : 'text-foreground/80'
            )}>{line}</p>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {lines.map((line, i) => (
            <p key={i} className="text-xs text-foreground/80 leading-relaxed">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
