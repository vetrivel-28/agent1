/** Shared helpers for engine response status and error display. */

export function isEngineOk(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const status = d.status as string | undefined;
  if (status === 'success') return true;
  if (status === 'insufficient_data') {
    const results = d.results as Record<string, unknown> | undefined;
    return !!results && Object.keys(results).length > 0;
  }
  return false;
}

export function getEngineErrorMessage(data: unknown, fallback = 'Analysis could not be completed.'): string {
  if (!data || typeof data !== 'object') return fallback;
  const d = data as Record<string, unknown>;
  const validation = d.validation as Record<string, unknown> | undefined;
  const missing = validation?.missing_columns as string[] | undefined;
  if (missing?.length) {
    return `Missing required columns: ${missing.join(', ')}`;
  }
  if (typeof d.summary === 'string' && d.summary) return d.summary;
  if (typeof d.message === 'string' && d.message) return d.message;
  if (typeof validation?.message === 'string') return validation.message as string;
  return fallback;
}
