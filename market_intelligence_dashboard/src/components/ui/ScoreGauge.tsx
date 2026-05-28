import { motion } from 'framer-motion';

interface ScoreGaugeProps {
  score: number;
  label: string;
  size?: number;
}

export function ScoreGauge({ score, label, size = 160 }: ScoreGaugeProps) {
  const strokeWidth = size * 0.1;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  let color = '#ef4444'; // danger
  if (score >= 60) color = '#f59e0b'; // warning
  if (score >= 80) color = '#10b981'; // success

  return (
    <div className="relative flex flex-col items-center justify-center font-sans">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="text-muted"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <motion.circle
          className="transition-all duration-1000 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={color}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-bold tracking-tight" style={{ color }}>{score.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{label}</span>
      </div>
    </div>
  );
}
