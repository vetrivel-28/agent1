import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function growthLabelFromScore(score: number): string {
  const v = clampScore(score);
  if (v >= 80) return 'Explosive Growth';
  if (v >= 60) return 'Strong Growth';
  if (v >= 40) return 'Moderate Growth';
  if (v >= 20) return 'Stable';
  return 'Weak/Declining';
}

export function adaptiveDomain(values: number[], qLow = 0.05, qHigh = 0.95): [number, number] {
  const valid = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (valid.length === 0) return [0, 100];
  const lowIdx = Math.floor((valid.length - 1) * qLow);
  const highIdx = Math.floor((valid.length - 1) * qHigh);
  const low = valid[lowIdx];
  const high = valid[highIdx];
  if (low === high) {
    const pad = Math.max(Math.abs(low) * 0.1, 1);
    return [low - pad, high + pad];
  }
  return [low, high];
}
