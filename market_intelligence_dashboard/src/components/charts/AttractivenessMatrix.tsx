import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

export type AttractivenessMatrixData = {
  finance_health?: number;
  demand_strength?: number;
  threshold?: number;
  quadrant?: string;
  launch_recommendation?: string;
  x_axis?: string;
  y_axis?: string;
};

const QUADRANTS = [
  { key: 'Difficult Economics', demandHigh: true, financeHigh: false },
  { key: 'Launch Candidate', demandHigh: true, financeHigh: true },
  { key: 'Avoid', demandHigh: false, financeHigh: false },
  { key: 'Niche Opportunity', demandHigh: false, financeHigh: true },
] as const;

export function AttractivenessMatrix({ data }: { data: AttractivenessMatrixData }) {
  if (!data?.quadrant) {
    return null;
  }

  const active = data.quadrant;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Economic Attractiveness Matrix</CardTitle>
        <CardDescription>
          {data.y_axis || 'Demand Strength'} (Y) vs {data.x_axis || 'Finance Health'} (X) — threshold {data.threshold ?? 50}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto">
          {QUADRANTS.map((q) => (
            <div
              key={q.key}
              className={cn(
                'p-4 rounded-lg border min-h-[100px] flex flex-col justify-center text-center transition-colors',
                active === q.key
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-muted/50 bg-muted/20 opacity-70'
              )}
            >
              <p className="text-xs text-muted-foreground mb-1">
                {q.demandHigh ? 'High Demand' : 'Low Demand'} · {q.financeHigh ? 'High Finance' : 'Low Finance'}
              </p>
              <p className="font-semibold text-sm">{q.key}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-4 mt-6 text-sm">
          <span>Demand: <strong>{data.demand_strength?.toFixed(1) ?? '—'}</strong></span>
          <span>Finance: <strong>{data.finance_health?.toFixed(1) ?? '—'}</strong></span>
          <Badge variant="outline">{active}</Badge>
        </div>
        {data.launch_recommendation && (
          <p className="text-sm text-muted-foreground mt-4 text-center max-w-lg mx-auto">
            {data.launch_recommendation}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
