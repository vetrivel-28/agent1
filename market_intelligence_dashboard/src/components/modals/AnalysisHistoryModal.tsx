import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, X, Calendar, Database, Eye } from 'lucide-react';
import { historyStorage } from '../../services/historyStorage';
import type { AnalysisHistoryEntry } from '../../services/historyStorage';
import { Button } from '../ui/Button';

interface AnalysisHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AnalysisHistoryModal({ isOpen, onClose }: AnalysisHistoryModalProps) {
  const history = historyStorage.getHistory();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative z-50 w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0 bg-slate-50">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Analysis History
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No analysis history found on this device.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((entry) => (
                    <div key={entry.id} className="bg-background border border-border/60 rounded-xl p-4 hover:border-primary/30 transition-colors group">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-foreground text-lg">{entry.datasetName}</h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(entry.runDate).toLocaleString()}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => alert("Historical caching is limited to snapshot data. Re-upload datasets for full deep-dive capability.")}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Snapshot
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/30">
                        <div className="bg-muted/40 p-2 rounded-lg text-center">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Keywords</p>
                          <p className="font-mono font-bold text-sm">{entry.keywords.toLocaleString()}</p>
                        </div>
                        <div className="bg-muted/40 p-2 rounded-lg text-center">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Products</p>
                          <p className="font-mono font-bold text-sm">{entry.products.toLocaleString()}</p>
                        </div>
                        <div className="bg-muted/40 p-2 rounded-lg text-center">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Brands</p>
                          <p className="font-mono font-bold text-sm">{entry.brands.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
