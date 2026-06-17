import axios from 'axios';
import { enrichCategoryScope, type CategoryScopePayload } from '../hooks/useCategoryScope';

// In dev, Vite proxies /api → http://localhost:8000, so a relative baseURL works.
// In production (built assets served from same origin), this also works.
// This avoids CORS preflight issues entirely.
export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  getHealth: async () => {
    const response = await apiClient.get('/health');
    return response.data;
  },
  
  getStatus: async () => {
    const response = await apiClient.get('/status');
    return response.data;
  },
  
  detectCategories: async () => {
    const response = await apiClient.get('/detect-categories');
    return response.data;
  },

  setCategory: async (categories: string[]) => {
    const response = await apiClient.post('/set-category', { categories });
    return response.data;
  },

  startAnalysis: async (options?: { useFullBlackbox?: boolean }) => {
    const response = await apiClient.post('/start-analysis', {
      use_full_blackbox: options?.useFullBlackbox ?? false,
    });
    return response.data;
  },

  uploadDatasets: async (formData: FormData) => {
    const response = await apiClient.post('/upload-datasets', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  removeDataset: async (datasetType: string) => {
    const response = await apiClient.post(`/remove-dataset/${datasetType}`);
    return response.data;
  },
  
  getDemandStrength: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/demand-strength?top_n=${topN}`, enrichCategoryScope(scope), {
      timeout: 90_000,
    });
    return response.data;
  },
  
  getRevenueMomentum: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/revenue-momentum?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },
  
  getBsrEfficiency: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/bsr-efficiency?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },
  
  getDemandVelocity: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/demand-velocity?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },
  
  getSearchIntentEfficiency: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/search-intent-efficiency?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },
  
  getMarketConcentration: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/market-concentration?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },
  
  getMarketReport: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/market-report?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },

  getAnalysisSnapshot: async () => {
    const response = await apiClient.get('/analysis-snapshot');
    return response.data;
  },

  getWhitespaceOpportunities: async ({ topN = 15, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/whitespace-opportunities?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },

  getRevenueOpportunitySegmentKeywords: async (segment: string) => {
    const response = await apiClient.get(`/revenue-opportunity/segments/${encodeURIComponent(segment)}/keywords`);
    return response.data;
  },

  getDirectCompetitors: async ({ topN = 15, priceTolerancePct = 17.5, scope = {} }: { topN?: number; priceTolerancePct?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/direct-competitors?top_n=${topN}&price_tolerance_pct=${priceTolerancePct}`, enrichCategoryScope(scope));
    return response.data;
  },

  getPriceElasticity: async ({ nBuckets = 5, scope = {} }: { nBuckets?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/price-elasticity?n_buckets=${nBuckets}`, enrichCategoryScope(scope));
    return response.data;
  },

  getSubstituteIntelligence: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/substitute-intelligence?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },

  getComplementIntelligence: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/complement-intelligence?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },

  getBundleOpportunities: async ({ topN = 10, scope = {} }: { topN?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/bundle-opportunities?top_n=${topN}`, enrichCategoryScope(scope));
    return response.data;
  },

  getFinanceIntelligence: async ({ scope = {} }: { scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post('/finance-intelligence', enrichCategoryScope(scope));
    return response.data;
  },

  getProcessingStatus: async () => {
    const response = await apiClient.get('/processing-status');
    return response.data;
  },

  downloadMarketReportPdf: async ({ topN = 10, reportMode = 'executive', includeCharts = true, scope = {} }: { topN?: number; reportMode?: string; includeCharts?: boolean; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(`/market-report/pdf?top_n=${topN}&report_mode=${reportMode}&include_charts=${includeCharts}`, enrichCategoryScope(scope), {
      responseType: 'blob',
    });
    return response.data;
  },

  runConsumerAdoptionSimulator: async ({ populationSize = 1000, scope = {} }: { populationSize?: number; scope?: CategoryScopePayload } = {}) => {
    const response = await apiClient.post(
      `/consumer-adoption-simulator?population_size=${populationSize}`,
      enrichCategoryScope(scope),
      { timeout: 120_000 },
    );
    return response.data;
  },
};
