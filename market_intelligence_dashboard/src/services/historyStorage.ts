export interface AnalysisHistoryEntry {
  id: string;
  runDate: number;
  datasetName: string;
  keywords: number;
  products: number;
  brands: number;
  snapshotData?: any; // The dashboard snapshot for quick reference
}

const STORAGE_KEY = 'mi_analysis_history';

export const historyStorage = {
  saveEntry: (entry: Omit<AnalysisHistoryEntry, 'id'>) => {
    try {
      const history = historyStorage.getHistory();
      const newEntry = { ...entry, id: Date.now().toString() };
      const updated = [newEntry, ...history].slice(0, 10); // Keep last 10
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage quota exceeded or unavailable.", e);
    }
  },

  getHistory: (): AnalysisHistoryEntry[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  clearHistory: () => {
    localStorage.removeItem(STORAGE_KEY);
  }
};
