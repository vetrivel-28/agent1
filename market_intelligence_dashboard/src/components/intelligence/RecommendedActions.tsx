import React from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, AlertCircle, ArrowRight, Activity, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface Opportunity {
  title?: string;
  type?: string;
  evidence?: string;
  why_recommended?: string;
  action_title?: string;
  priority?: string;
  difficulty?: string;
  priority_score?: number;
  difficulty_score?: number;
  impact?: string;
  evidence_obj?: any;
}

interface RecommendedActionsProps {
  opportunities: Opportunity[];
  onOpenEvidence?: (evidence: any) => void;
}

export function RecommendedActions({ opportunities, onOpenEvidence }: RecommendedActionsProps) {
  const validOpps = opportunities.filter(o => o.title && o.title !== 'N/A');

  if (validOpps.length === 0) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-slate-50 to-white shadow-sm overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/10 pb-4">
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
          <Target className="w-5 h-5" />
          Recommended Business Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {validOpps.map((opp, idx) => {
            const priority = opp.priority || 'Medium';
            const difficulty = opp.difficulty || 'Medium';
            const impact = opp.impact || 'N/A';
            const actionText = opp.action_title || `Investigate opportunity: ${opp.title}`;

            return (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="p-4 sm:p-6 hover:bg-slate-50 transition-colors group cursor-pointer"
                onClick={() => onOpenEvidence && onOpenEvidence(opp.evidence_obj)}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`
                        ${priority === 'High' ? 'border-rose-200 bg-rose-50 text-rose-700' : ''}
                        ${priority === 'Medium' ? 'border-amber-200 bg-amber-50 text-amber-700' : ''}
                        ${priority === 'Low' ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}
                      `}>
                        {priority} Priority
                      </Badge>
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">
                        Difficulty: {difficulty}
                      </Badge>
                      {opp.priority_score && (
                        <span className="text-xs text-muted-foreground font-mono ml-2">Score: {opp.priority_score}</span>
                      )}
                    </div>
                    
                    <div>
                      <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                        {actionText}
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </h4>
                      {(opp.why_recommended || opp.evidence) && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {opp.why_recommended && (
                            <span><span className="font-semibold text-foreground/80">Why: </span>{opp.why_recommended}</span>
                          )}
                          {!opp.why_recommended && opp.evidence}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1 bg-emerald-50 sm:bg-transparent p-3 sm:p-0 rounded-lg border sm:border-none border-emerald-100 shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Expected Impact
                    </span>
                    <span className="text-lg font-black text-emerald-700">{impact}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
