/**
 * Safe numeric parsing to handle empty strings, nulls, and non-numeric values
 * without throwing errors or returning NaN/Infinity.
 */
export const safeNumber = (value: any, fallback = 0): number => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Safe text rendering to prevent rendering "null" or "undefined" as strings.
 */
export const safeText = (value: any, fallback = "N/A"): string => {
  return value === null || value === undefined || value === "" ? fallback : String(value);
};

/**
 * Safe array parser to guarantee array methods (like .map, .length) don't crash.
 */
export const safeArray = <T>(value: any): T[] => {
  return Array.isArray(value) ? value : [];
};

/**
 * Format generic/broad buckets to professional language
 */
export const formatGenericLabel = (label: string | null | undefined): string => {
  if (!label) return label || '';
  const lower = label.toLowerCase().trim();
  if (['generic', 'other', 'unknown', 'misc', 'unclassified'].includes(lower)) {
    return 'Broad Demand Bucket — Needs Refinement';
  }
  return label;
};

/**
 * Handle confidence display logic
 */
export const formatConfidence = (confidence: number | undefined) => {
  if (confidence === undefined || confidence === null) return null;
  if (confidence >= 80) return { label: 'High', class: 'text-emerald-600', isDirectional: false };
  if (confidence >= 50) return { label: 'Medium', class: 'text-amber-600', isDirectional: false };
  return { label: 'Low', class: 'text-red-600', isDirectional: true };
};
