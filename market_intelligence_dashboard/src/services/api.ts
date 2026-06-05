import axios from 'axios';

export const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
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

  uploadDatasets: async (formData: FormData) => {
    const response = await apiClient.post('/upload-datasets', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  getDemandStrength: async (topN = 10) => {
    const response = await apiClient.post(`/demand-strength?top_n=${topN}`, undefined, {
      timeout: 90_000,
    });
    return response.data;
  },
  
  getRevenueMomentum: async (topN = 10) => {
    const response = await apiClient.post(`/revenue-momentum?top_n=${topN}`);
    return response.data;
  },
  
  getBsrEfficiency: async (topN = 10) => {
    const response = await apiClient.post(`/bsr-efficiency?top_n=${topN}`);
    return response.data;
  },
  
  getDemandVelocity: async (topN = 10) => {
    const response = await apiClient.post(`/demand-velocity?top_n=${topN}`);
    return response.data;
  },
  
  getSearchIntentEfficiency: async (topN = 10) => {
    const response = await apiClient.post(`/search-intent-efficiency?top_n=${topN}`);
    return response.data;
  },
  
  getMarketConcentration: async (topN = 10) => {
    const response = await apiClient.post(`/market-concentration?top_n=${topN}`);
    return response.data;
  },
  
  getMarketReport: async (topN = 10) => {
    const response = await apiClient.get(`/market-report?top_n=${topN}`);
    return response.data;
  },

  getAnalysisSnapshot: async () => {
    const response = await apiClient.get('/analysis-snapshot');
    return response.data;
  },

  getWhitespaceOpportunities: async (topN = 15) => {
    const response = await apiClient.post(`/whitespace-opportunities?top_n=${topN}`);
    return response.data;
  },

  getRevenueOpportunitySegmentKeywords: async (segment: string) => {
    const response = await apiClient.get(`/revenue-opportunity/segments/${encodeURIComponent(segment)}/keywords`);
    return response.data;
  },

  getDirectCompetitors: async (topN = 15, priceTolerancePct = 17.5) => {
    const response = await apiClient.post(`/direct-competitors?top_n=${topN}&price_tolerance_pct=${priceTolerancePct}`);
    return response.data;
  },

  getPriceElasticity: async (nBuckets = 5) => {
    const response = await apiClient.post(`/price-elasticity?n_buckets=${nBuckets}`);
    return response.data;
  },

  getSubstituteIntelligence: async (topN = 10) => {
    const response = await apiClient.post(`/substitute-intelligence?top_n=${topN}`);
    return response.data;
  },

  getComplementIntelligence: async (topN = 10) => {
    const response = await apiClient.post(`/complement-intelligence?top_n=${topN}`);
    return response.data;
  },

  getBundleOpportunities: async (topN = 10) => {
    const response = await apiClient.post(`/bundle-opportunities?top_n=${topN}`);
    return response.data;
  },

  getFinanceIntelligence: async () => {
    const response = await apiClient.post('/finance-intelligence');
    return response.data;
  },

  getProcessingStatus: async () => {
    const response = await apiClient.get('/processing-status');
    return response.data;
  },

  downloadMarketReportPdf: async (topN = 10, reportMode = 'executive', includeCharts = true) => {
    const response = await apiClient.get(`/market-report/pdf?top_n=${topN}&report_mode=${reportMode}&include_charts=${includeCharts}`, {
      responseType: 'blob',
    });
    return response.data;
  },
};
