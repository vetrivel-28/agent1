import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertTriangle, Circle } from 'lucide-react';
import { Button } from '../ui/Button';

export type AnalysisStatus = 'idle' | 'analyzing' | 'success' | 'error';

interface AnalysisProgressModalProps {
  status: AnalysisStatus;
  errorMessage?: string;
  onRetry?: () => void;
  onClose?: () => void;
}

const ROTATING_MESSAGES = [
  "Validating datasets...",
  "Detecting market structure...",
  "Identifying revenue opportunities...",
  "Calculating competitive barriers...",
  "Building executive insights...",
  "Generating report..."
];

const CHECKLIST_STEPS = [
  "Dataset Validation",
  "Schema Detection",
  "Data Quality Assessment",
  "Market Structure Analysis",
  "Demand Intelligence",
  "Opportunity Intelligence",
  "Product Intelligence",
  "Pricing Intelligence",
  "Report Generation"
];

export function AnalysisProgressModal({
  status,
  errorMessage,
  onRetry,
  onClose
}: AnalysisProgressModalProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    if (status !== 'analyzing') return;
    const msgInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % ROTATING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(msgInterval);
  }, [status]);

  useEffect(() => {
    if (status !== 'analyzing') return;
    // Simulate steps progress over ~8 seconds (backend is fast but we want to show all steps)
    const totalTime = 8000;
    const stepTime = totalTime / CHECKLIST_STEPS.length;
    
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => Math.min(prev + 1, CHECKLIST_STEPS.length - 1));
    }, stepTime);

    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + (100 / (totalTime / 100)), 99));
    }, 100);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, [status]);

  useEffect(() => {
    if (status === 'analyzing') {
      setMessageIndex(0);
      setCurrentStep(0);
      setProgress(0);
    } else if (status === 'success') {
      setCurrentStep(CHECKLIST_STEPS.length);
      setProgress(100);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'idle') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [status]);

  // Improve Error States with detailed error type detection
  const parseError = (err: string | undefined) => {
    if (!err) return { 
      title: "Analysis Failed", 
      reason: "Unable to complete analysis. Please try again.", 
      fix: "Check your network connection or dataset formatting." 
    };
    
    // CORS or network error
    if (err.includes("Backend connection failed") || err.includes("CORS") || err.includes("not reachable")) {
      return {
        title: "Backend Connection Failed",
        reason: "Frontend could not connect to the API server. This is not a CSV issue.",
        fix: "1. Ensure backend is running: python -m uvicorn app.main:app --reload\n2. Check backend is accessible at http://localhost:8000\n3. Verify CORS is configured to allow localhost:5173"
      };
    }
    
    // Schema validation error
    if (err.includes("CSV schema validation failed") || err.includes("Missing required column")) {
      return {
        title: "CSV Schema Validation Failed",
        reason: err,
        fix: "Review the missing columns listed above. Ensure your CSV headers exactly match the expected format for that dataset type (BlackBox, Magnet, or Classification)."
      };
    }
    
    // Dataset not loaded on backend
    if (err.includes("not loaded on backend") || err.includes("dataset not loaded")) {
      return {
        title: "Backend State Issue",
        reason: "Dataset was uploaded but backend reports it's not loaded. This may be a backend cache or state issue.",
        fix: "1. Restart the backend server\n2. Clear backend cache\n3. Try uploading again"
      };
    }
    
    // Missing datasets
    if (err.includes("missing") || err.toLowerCase().includes("not uploaded")) {
      return {
        title: "Missing Required Datasets",
        reason: "The analysis engine requires specific datasets that were not found.",
        fix: "Ensure you upload both Magnet and BlackBox CSV files."
      };
    }
    
    // Insufficient data diversity
    if (err.toLowerCase().includes("diversity") || err.toLowerCase().includes("insufficient")) {
       return {
        title: "Insufficient Data Diversity",
        reason: "The uploaded keywords do not provide enough variance for clustering.",
        fix: "Upload a larger, more diverse Magnet keyword dataset."
      };
    }
    
    // Generic fallback
    return {
      title: "Analysis Processing Error",
      reason: err,
      fix: "Check backend logs for detailed error information. Verify CSV schemas match expected formats."
    };
  };

  const parsedError = parseError(errorMessage);

  return (
    <AnimatePresence>
      {status !== 'idle' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative z-50 w-full max-w-lg bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col items-center p-8"
          >
            {status === 'analyzing' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col w-full"
              >
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2 tracking-tight">Generating Intelligence</h2>
                  
                  <div className="h-6 overflow-hidden relative w-full flex justify-center mt-1">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={messageIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="text-sm font-medium text-primary absolute"
                      >
                        {ROTATING_MESSAGES[messageIndex]}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-3 mb-8 w-full px-4">
                  {CHECKLIST_STEPS.map((step, idx) => {
                    const isCompleted = idx < currentStep;
                    const isCurrent = idx === currentStep;
                    const isPending = idx > currentStep;
                    
                    return (
                      <div key={step} className={`flex items-center gap-3 transition-opacity duration-300 ${isPending ? 'opacity-40' : 'opacity-100'}`}>
                        {isCompleted ? (
                          <Check className="w-5 h-5 text-success shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                        )}
                        <span className={`text-sm font-medium ${isCurrent ? 'text-foreground font-bold' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="w-full bg-muted rounded-full h-2 mb-2 overflow-hidden">
                  <motion.div 
                    className="bg-primary h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "linear", duration: 0.1 }}
                  />
                </div>
                <div className="flex justify-between w-full text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  <span>{Math.round(progress)}% Complete</span>
                  <span>Est. Time: &lt; 1 min</span>
                </div>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center py-8"
              >
                <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-6">
                  <Check className="w-10 h-10 text-success" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Analysis Complete</h2>
                <p className="text-muted-foreground">Market intelligence generated successfully.</p>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center w-full py-4"
              >
                <div className="w-20 h-20 rounded-full bg-danger/10 flex items-center justify-center mb-6">
                  <AlertTriangle className="w-10 h-10 text-danger" />
                </div>
                <h2 className="text-2xl font-bold mb-2 text-danger">{parsedError.title}</h2>
                
                <div className="bg-danger/5 border border-danger/10 rounded-lg p-4 w-full text-left mb-8 space-y-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-danger/70 mb-1">Reason</p>
                    <p className="text-sm font-medium text-foreground whitespace-pre-line">{parsedError.reason}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary/70 mb-1">Suggested Action</p>
                    <p className="text-sm font-medium text-foreground whitespace-pre-line">{parsedError.fix}</p>
                  </div>
                </div>

                <div className="flex gap-3 w-full">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
                  <Button className="flex-1" onClick={onRetry}>Retry Analysis</Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
