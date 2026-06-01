/** Shared helpers for engine response status and error display. */

export function isEngineOk(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const res = response as Record<string, unknown>;
  
  if (res.success !== undefined) {
    if (res.success === false) return false;
    const d = res.data as Record<string, unknown> | undefined;
    if (!d) return false;
    
    const status = d.status as string | undefined;
    if (status === 'success') return true;
    if (status === 'unavailable') return false;
    if (status === 'insufficient_data') {
      const results = d.results as Record<string, unknown> | undefined;
      return !!results && Object.keys(results).length > 0;
    }
    return false;
  }
  
  // Legacy
  const status = res.status as string | undefined;
  if (status === 'success') return true;
  if (status === 'unavailable') return false;
  return false;
}

export function getEngineErrorMessage(response: unknown, fallback = 'Analysis could not be completed.'): string {
  if (!response || typeof response !== 'object') return fallback;
  const res = response as Record<string, unknown>;
  
  const d = res.data ? (res.data as Record<string, unknown>) : res;
  
  const validation = d.validation as Record<string, unknown> | undefined;
  const missing = validation?.missing_columns as string[] | undefined;
  if (missing?.length) {
    return `Missing required columns: ${missing.join(', ')}`;
  }
  
  if (typeof res.message === 'string' && res.message) return res.message;
  if (typeof d.summary === 'string' && d.summary) return d.summary;
  if (typeof d.message === 'string' && d.message) return d.message;
  if (typeof validation?.message === 'string') return validation.message as string;
  return fallback;
}
