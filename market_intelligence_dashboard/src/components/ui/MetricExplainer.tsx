import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, Calculator, Database, Lightbulb } from 'lucide-react';

interface MetricExplanation {
  title: string;
  definition: string;
  formula: string;
  inputs: string[];
  datasets: string[];
  interpretation: string;
}

const METRIC_DICTIONARY: Record<string, MetricExplanation> = {
  "HHI": {
    title: "Herfindahl-Hirschman Index (HHI)",
    definition: "A globally recognized measure of market concentration and competition.",
    formula: "Sum of the squares of the market shares of all brands in the dataset.",
    inputs: ["Brand Revenue", "Total Market Revenue"],
    datasets: ["BlackBox Dataset"],
    interpretation: "A low HHI (< 1500) indicates a highly fragmented, competitive market. A high HHI (> 2500) indicates a monopolistic or consolidated market."
  },
  "Concentration Score": {
    title: "Market Concentration Score",
    definition: "A normalized metric representing how much revenue is controlled by the top players.",
    formula: "(Revenue of Top 3 Brands / Total Revenue) * 100",
    inputs: ["Top 3 Brand Revenue", "Total Market Revenue"],
    datasets: ["BlackBox Dataset"],
    interpretation: "A high score implies that breaking into the market requires significant capital, whereas a low score suggests an even playing field."
  },
  "Demand Score": {
    title: "Demand Strength Score",
    definition: "An aggregate indicator of consumer search velocity and volume.",
    formula: "Log(Search Volume) normalized against Category Max + Search Trend Growth",
    inputs: ["Search Volume", "Search Volume Trend (90-day)"],
    datasets: ["Magnet Dataset"],
    interpretation: "High demand scores indicate robust consumer interest. Ideal for validating new product launches."
  },
  "Opportunity Score": {
    title: "Whitespace Opportunity Score",
    definition: "A composite metric highlighting high demand combined with low competition.",
    formula: "Norm(Search Volume) * (1 - Norm(Title Density))",
    inputs: ["Search Volume", "Title Density", "Competing Products"],
    datasets: ["Magnet Dataset"],
    interpretation: "Higher scores indicate 'whitespace'—gaps in the market where consumers are searching for specific features but few optimized products exist."
  },
  "Revenue Share": {
    title: "Revenue Share Percentage",
    definition: "The proportion of total market revenue captured by a specific entity or segment.",
    formula: "(Segment Revenue / Total Market Revenue) * 100",
    inputs: ["ASIN Revenue", "Market Revenue"],
    datasets: ["BlackBox Dataset"],
    interpretation: "Helps identify which product types or brands dominate consumer spending."
  },
  "Efficiency Lift": {
    title: "Conversion Efficiency Lift",
    definition: "The relative over-performance of conversion share compared to click share.",
    formula: "(Conversion Share / Click Share) - 1",
    inputs: ["ABA Total Click Share", "ABA Total Conv. Share"],
    datasets: ["Magnet Dataset"],
    interpretation: "A positive lift means the keyword converts traffic highly efficiently. A negative lift suggests a traffic trap."
  },
  "Momentum Score": {
    title: "Revenue Momentum Score",
    definition: "A directional indicator of short-to-medium term sales acceleration.",
    formula: "Base Sales * (1 + 90-Day Trend Modifier)",
    inputs: ["Sales Trend (90 days)", "Price Trend (90 days)"],
    datasets: ["BlackBox Dataset"],
    interpretation: "Identifies breakout niches or decaying categories before they become obvious."
  }
};

interface MetricExplainerProps {
  metricId: string;
  children: React.ReactNode;
}

export function MetricExplainer({ metricId, children }: MetricExplainerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const data = METRIC_DICTIONARY[metricId];

  // If metric not in dictionary, render normally without click action
  if (!data) return <>{children}</>;

  return (
    <>
      <div 
        className="group relative cursor-pointer hover:ring-2 hover:ring-primary/20 hover:bg-slate-50 transition-all rounded-xl"
        onClick={() => setIsOpen(true)}
      >
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Info className="w-4 h-4 text-primary" />
        </div>
        {children}
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
              className="relative z-50 w-full max-w-lg bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0 bg-slate-50">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-primary" />
                  {data.title}
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" /> What it means
                  </h3>
                  <p className="text-foreground font-medium leading-relaxed">{data.definition}</p>
                </div>

                <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> How it is calculated
                  </h3>
                  <code className="text-sm text-primary font-mono block mb-3 p-2 bg-primary/5 rounded-md border border-primary/10">
                    {data.formula}
                  </code>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {data.inputs.map(input => (
                      <span key={input} className="text-xs bg-background border px-2 py-1 rounded-md text-muted-foreground">
                        Input: {input}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" /> Data Sources
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {data.datasets.map(ds => (
                      <span key={ds} className="text-xs bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-2 py-1 rounded-md font-medium">
                        {ds}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" /> Business Interpretation
                  </h3>
                  <p className="text-foreground text-sm font-medium leading-relaxed">{data.interpretation}</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
