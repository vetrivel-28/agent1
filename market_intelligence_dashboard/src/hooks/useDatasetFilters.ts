import { useState, useMemo } from 'react';

export type FilterType = 'search' | 'select' | 'multi-select' | 'range';

export interface FilterConfig<T> {
  id: string;
  label: string;
  type: FilterType;
  getValue: (row: T) => any;
  options?: string[]; // Auto-generated if omitted for select/multi-select
  hidden?: boolean;
}

export function useDatasetFilters<T>(dataset: T[] = [], configs: FilterConfig<T>[]) {
  const safeDataset = dataset ?? [];
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

  const setFilter = (id: string, value: any) => {
    setActiveFilters(prev => {
      const next = { ...prev, [id]: value };
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete next[id];
      }
      return next;
    });
  };

  const clearFilter = (id: string) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clearAll = () => setActiveFilters({});

  // Auto-generate options for 'select' and 'multi-select'
  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    configs.forEach(config => {
      if ((config.type === 'select' || config.type === 'multi-select') && !config.hidden) {
        if (config.options) {
          options[config.id] = config.options;
        } else {
          const uniqueValues = new Set<string>();
          safeDataset.forEach(row => {
            const val = config.getValue(row);
            if (val !== null && val !== undefined && val !== '') {
              uniqueValues.add(String(val));
            }
          });
          options[config.id] = Array.from(uniqueValues).sort();
        }
      }
    });
    return options;
  }, [safeDataset, configs]);

  // Apply filters
  const filteredData = useMemo(() => {
    if (Object.keys(activeFilters).length === 0) return safeDataset;

    return safeDataset.filter(row => {
      return configs.every(config => {
        const filterVal = activeFilters[config.id];
        if (filterVal === undefined) return true; // not active

        const rowVal = config.getValue(row);
        
        if (config.type === 'search') {
          if (!rowVal) return false;
          return String(rowVal).toLowerCase().includes(String(filterVal).toLowerCase());
        }
        
        if (config.type === 'select') {
          return String(rowVal) === String(filterVal);
        }
        
        if (config.type === 'multi-select') {
          if (!Array.isArray(filterVal)) return true;
          return filterVal.includes(String(rowVal));
        }
        
        if (config.type === 'range') {
          const { min, max } = filterVal as { min?: number; max?: number };
          const numVal = Number(rowVal);
          if (isNaN(numVal)) return false;
          if (min !== undefined && min !== null && numVal < min) return false;
          if (max !== undefined && max !== null && numVal > max) return false;
          return true;
        }
        
        return true;
      });
    });
  }, [safeDataset, configs, activeFilters]);

  return {
    filteredData,
    activeFilters,
    setFilter,
    clearFilter,
    clearAll,
    filterOptions
  };
}
