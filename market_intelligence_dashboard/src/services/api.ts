import axios from 'axios';

export const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000/api/v1',
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
  
  uploadDatasets: async (formData: FormData) => {
    const response = await apiClient.post('/upload-datasets', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  getDemandStrength: async (topN = 10) => {
    const response = await apiClient.post(`/demand-strength?top_n=${topN}`);
    return response.data;
  },
  
  getSalesMomentum: async (topN = 10) => {
    const response = await apiClient.post(`/sales-momentum?top_n=${topN}`);
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
  
  getSearchMomentum: async (topN = 10) => {
    const response = await apiClient.post(`/search-momentum?top_n=${topN}`);
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
    const response = await apiClient.post(`/market-report?top_n=${topN}`);
    return response.data;
  },
};
