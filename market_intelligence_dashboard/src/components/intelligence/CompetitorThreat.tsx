import React from 'react';
import { Shield, ShieldAlert, Zap, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';

interface CompetitorThreatProps {
  competitors: Array<{
    name: string;
    share: number;
    momentum: number; // e.g. growth %
    keywordCoverage: number; // %
  }>;
}

export function CompetitorThreat({ competitors }: CompetitorThreatProps) {
  if (!competitors || competitors.length === 0) return null;

  const getThreatLevel = (share: number, momentum: number) => {
    const score = share + (momentum * 0.5);
    if (score > 30) return { level: 'Very High', color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', icon: ShieldAlert };
    if (score > 15) return { level: 'High', color: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', icon: Zap };
    if (score > 5) return { level: 'Moderate', color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', icon: Shield };
    return { level: 'Low', color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', icon: Shield };
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="bg-muted/10 border-b border-border/30">
        <CardTitle className="text-card-title flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-primary" />
          Competitor Threat Matrix
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {competitors.map((comp, idx) => {
            const threat = getThreatLevel(comp.share, comp.momentum);
            const Icon = threat.icon;
            
            return (
              <div key={idx} className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors`}>
                <div className="flex items-center gap-3 w-1/3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${threat.bg}`}>
                    <Icon className={`w-4 h-4 ${threat.text}`} />
                  </div>
                  <span className="font-bold text-foreground truncate">{comp.name}</span>
                </div>
                
                <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block mb-0.5">Market Share</span>
                    <span className="font-mono font-bold">{comp.share}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block mb-0.5">Momentum</span>
                    <div className="flex items-center gap-1 font-mono font-bold text-emerald-600">
                      <TrendingUp className="w-3 h-3" /> {comp.momentum}%
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block mb-0.5">Coverage</span>
                    <span className="font-mono font-bold">{comp.keywordCoverage}%</span>
                  </div>
                </div>

                <div className="w-32 shrink-0 text-right">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-current/20 ${threat.text} ${threat.bg}`}>
                    {threat.level} Threat
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
