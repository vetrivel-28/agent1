import os
import re
import glob

pages_dir = r"c:\Users\annie\agent1\market_intelligence_dashboard\src\pages"

for file_path in glob.glob(os.path.join(pages_dir, "*.tsx")):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replacements for data.results
    content = content.replace("data.results", "data.data?.results")
    content = content.replace("reportResp?.results", "reportResp?.data?.results")
    content = content.replace("whitespaceData.results", "whitespaceData.data?.results")
    content = content.replace("bundleData.results", "bundleData.data?.results")
    content = content.replace("complementData.results", "complementData.data?.results")
    content = content.replace("substituteData.results", "substituteData.data?.results")
    content = content.replace("directCompData.results", "directCompData.data?.results")

    # In case there are missing data checks like `data.status`, we don't strictly need to replace since analysisStatus handles it, but let's check.
    content = content.replace("data.status ===", "data.data?.status ===")
    content = content.replace("data.status !==", "data.data?.status !==")
    content = content.replace("data?.status", "data?.data?.status")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Updated data.results across all pages.")

# Also update analysisStatus.ts
utils_file = r"c:\Users\annie\agent1\market_intelligence_dashboard\src\utils\analysisStatus.ts"
with open(utils_file, "r", encoding="utf-8") as f:
    utils_content = f.read()

new_utils_content = """/** Shared helpers for engine response status and error display. */

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
"""

with open(utils_file, "w", encoding="utf-8") as f:
    f.write(new_utils_content)

print("Updated analysisStatus.ts")
