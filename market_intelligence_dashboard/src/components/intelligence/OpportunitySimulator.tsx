import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Target, TrendingUp, Package } from 'lucide-react';
import { formatNumber } from '../../utils/cn';

interface OpportunitySimulatorProps {
  totalRevenue: number;
  averagePrice: number;
}

export function OpportunitySimulator({ totalRevenue, averagePrice }: OpportunitySimulatorProps) {
  const [captureRate, setCaptureRate] = useState<number>(3); // Default 3%

  const rates = [1, 3, 5, 10];
  const capturedRevenue = totalRevenue * (captureRate / 100);
  const unitsSold = averagePrice > 0 ? Math.round(capturedRevenue / averagePrice) : 0;

  return (
    <Card className="border-border/40 overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-border/30 pb-4">
        <CardTitle className="text-card-title flex items-center gap-2 text-primary">
          <Target className="w-5 h-5" />
          Interactive Opportunity Simulator
        </CardTitle>
        <p className="text-helper mt-1 text-muted-foreground">
          Model potential business impact based on estimated market capture percentage against total verified demand.
        </p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Controls */}
          <div className="w-full md:w-1/3 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 block">
                Target Market Capture
              </label>
              <div className="flex flex-wrap gap-2">
                {rates.map(rate => (
                  <button
                    key={rate}
                    onClick={() => setCaptureRate(rate)}
                    className={`flex-1 min-w-[60px] py-2 px-3 rounded-lg border text-sm font-bold transition-all ${
                      captureRate === rate 
                        ? 'bg-primary text-primary-foreground border-primary shadow-md scale-105'
                        : 'bg-background hover:bg-muted border-border/60 text-foreground/80'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
            
            <div className="p-3 bg-muted/40 rounded-lg border border-border/40">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Total Market:</span>
                <span className="font-mono">${formatNumber(totalRevenue)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                <span>Avg Price:</span>
                <span className="font-mono">${averagePrice.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="w-full md:w-2/3 grid grid-cols-2 gap-4">
            <motion.div 
              key={`rev-${captureRate}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col justify-center"
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Estimated Revenue</span>
              </div>
              <span className="text-3xl font-black text-emerald-800">
                ${formatNumber(capturedRevenue)}
              </span>
            </motion.div>

            <motion.div 
              key={`units-${captureRate}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col justify-center"
            >
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Estimated Units</span>
              </div>
              <span className="text-3xl font-black text-blue-800">
                {formatNumber(unitsSold)}
              </span>
            </motion.div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
