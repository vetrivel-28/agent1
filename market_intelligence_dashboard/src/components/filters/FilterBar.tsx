import React, { useState, useEffect } from 'react';
import type { FilterConfig } from '../../hooks/useDatasetFilters';
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

interface FilterBarProps<T> {
  configs: FilterConfig<T>[];
  activeFilters: Record<string, any>;
  setFilter: (id: string, value: any) => void;
  clearFilter: (id: string) => void;
  clearAll: () => void;
  filterOptions: Record<string, string[]>;
  totalRecords: number;
  filteredRecords: number;
}

export function FilterBar<T>({
  configs,
  activeFilters,
  setFilter,
  clearFilter,
  clearAll,
  filterOptions,
  totalRecords,
  filteredRecords,
}: FilterBarProps<T>) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  // Find the primary search config
  const searchConfig = configs.find(c => c.type === 'search');
  
  // Debounce search
  useEffect(() => {
    if (!searchConfig) return;
    const t = setTimeout(() => {
      setFilter(searchConfig.id, searchVal);
    }, 300);
    return () => clearTimeout(t);
  }, [searchVal, searchConfig, setFilter]); // added setFilter to fix lint

  // Sync external search clears
  useEffect(() => {
    if (searchConfig && !activeFilters[searchConfig.id]) {
      setSearchVal('');
    }
  }, [activeFilters, searchConfig]);

  const activeCount = Object.keys(activeFilters).length;

  return (
    <div className="w-full space-y-4 mb-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        {/* Search */}
        {searchConfig && (
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={`Search ${searchConfig.label.toLowerCase()}...`}
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchVal && (
              <button 
                onClick={() => setSearchVal('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Primary Selects (up to 3) */}
        <div className="flex flex-wrap gap-2 flex-1 justify-start">
          {configs.filter(c => (c.type === 'select' || c.type === 'multi-select') && !c.hidden).slice(0, 3).map(config => (
            <select
              key={config.id}
              value={activeFilters[config.id] || ''}
              onChange={e => setFilter(config.id, e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer min-w-[140px]"
            >
              <option value="">{config.label} (All)</option>
              {(filterOptions[config.id] || []).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ))}
        </div>

        {/* Advanced Filters Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors",
              isAdvancedOpen ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters {activeCount > 0 && `(${activeCount})`}
          </button>
        </div>
      </div>

      {/* Advanced Filters Drawer */}
      {isAdvancedOpen && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {configs.filter(c => !c.hidden && c.type !== 'search').map(config => {
            
            if (config.type === 'select' || config.type === 'multi-select') {
              return (
                <div key={config.id} className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">{config.label}</label>
                  <select
                    value={activeFilters[config.id] || ''}
                    onChange={e => setFilter(config.id, e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                  >
                    <option value="">All {config.label}s</option>
                    {(filterOptions[config.id] || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              );
            }

            if (config.type === 'range') {
              const val = activeFilters[config.id] as { min?: number, max?: number } || {};
              return (
                <div key={config.id} className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">{config.label} Range</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={val.min ?? ''}
                      onChange={e => setFilter(config.id, { ...val, min: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="text-muted-foreground">-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={val.max ?? ''}
                      onChange={e => setFilter(config.id, { ...val, max: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              );
            }
            
            return null;
          })}
        </div>
      )}

      {/* Active Filter Chips & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {Object.entries(activeFilters).map(([id, value]) => {
            const config = configs.find(c => c.id === id);
            if (!config) return null;
            
            let displayValue = '';
            if (config.type === 'range') {
              const r = value as { min?: number, max?: number };
              if (r.min !== undefined && r.max !== undefined) displayValue = `${r.min} - ${r.max}`;
              else if (r.min !== undefined) displayValue = `>= ${r.min}`;
              else if (r.max !== undefined) displayValue = `<= ${r.max}`;
            } else {
              displayValue = String(value);
            }

            return (
              <Badge key={id} variant="outline" className="bg-primary/5 border-primary/20 text-primary flex items-center gap-1.5 py-1 px-2.5">
                <span className="font-semibold">{config.label}:</span>
                <span>{displayValue}</span>
                <button 
                  onClick={() => clearFilter(id)}
                  className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            );
          })}
          
          {activeCount > 0 && (
            <button 
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground font-medium underline underline-offset-2 ml-2"
            >
              Clear All
            </button>
          )}
        </div>
        
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap bg-muted/50 px-3 py-1.5 rounded-full">
          Showing <span className="text-foreground font-bold">{filteredRecords.toLocaleString()}</span> of <span className="font-bold">{totalRecords.toLocaleString()}</span> records
        </div>
      </div>

      {filteredRecords === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-center mt-4">
          <p className="font-medium">No records match the selected filters.</p>
          <button onClick={clearAll} className="mt-2 text-sm underline hover:text-amber-900">
            Clear filters to view all records
          </button>
        </div>
      )}
    </div>
  );
}
