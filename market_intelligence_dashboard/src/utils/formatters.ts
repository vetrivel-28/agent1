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
