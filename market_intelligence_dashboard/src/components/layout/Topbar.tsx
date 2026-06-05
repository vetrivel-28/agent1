import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Server, Database, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function Topbar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    categories: any[];
    columnName: string;
    isSetting: boolean;
    error: string;
  }>({ isOpen: false, categories: [], columnName: '', isSetting: false, error: '' });
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: health, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 30000, // Check every 30s
  });

  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: 10000,
  });

  const healthData = health?.data || {};
  const isHealthy = health?.success === true && healthData?.status === 'ok';
  
  // Count loaded datasets explicitly to only 3
  const datasets = healthData?.datasets_loaded || {};
  const activeKeys = ['magnet', 'blackbox', 'keyword_classification'];
  const loadedCount = activeKeys.filter(k => datasets[k]).length;
  const missingCount = 3 - loadedCount;

  const { data: cachedCategories } = useQuery({
    queryKey: ['detect-categories'],
    queryFn: api.detectCategories,
    staleTime: 10 * 60 * 1000,
    enabled: !!statusData?.data?.datasets?.blackbox,
  });

  const handleOpenCategoryModal = () => {
    const catRes = cachedCategories;
    if (!catRes?.success && catRes?.data?.status === 'error') {
      alert(catRes?.message || 'Failed to detect categories');
      return;
    }
    const categories = catRes?.data?.categories || catRes?.categories || [];
    const col = catRes?.data?.column || catRes?.column || 'Category';
    const currentSelected = statusData?.data?.metadata?.blackbox?.selected_categories || [];

    setCategoryModal({
      isOpen: true,
      categories,
      columnName: col,
      isSetting: false,
      error: '',
    });
    setSelectedCategories(currentSelected);
    setCategorySearch('');
  };

  const handleConfirmCategory = async () => {
    // Close modal immediately for fast perceived performance
    setCategoryModal(prev => ({ ...prev, isOpen: false }));
    try {
      const res = await api.setCategory(selectedCategories);
      if (!res.success && res.data?.status === 'error') {
        throw new Error(res.message || res.data?.message || 'Failed to set category');
      }
      
      if (selectedCategories.length === 0) {
        setToastMessage("Dashboard recalculating for All Categories...");
      } else {
        setToastMessage(`Dashboard recalculating for ${selectedCategories.join(' + ')}...`);
      }
      setTimeout(() => setToastMessage(null), 5000);

      // Immediately refresh the status endpoint to broadcast the new categoryScope
      await queryClient.invalidateQueries({ queryKey: ['status'] });
      // Invalidate all other queries
      queryClient.invalidateQueries(); 
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to set categories.');
    }
  };

  const filteredCategories = categoryModal.categories.filter((c: any) =>
    c.category.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedCategories.length === categoryModal.categories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(categoryModal.categories.map((c: any) => c.category));
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-background/80 px-6 backdrop-blur-xl">
        <div className="flex flex-1 items-center gap-4">
          <h2 className="text-lg font-semibold capitalize">
            {/* We'll handle page title dynamically elsewhere or keep it generic here */}
            Market Overview
          </h2>
        </div>

        <div className="flex items-center gap-4">
          {toastMessage && (
            <div className="mr-4 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-medium animate-in fade-in zoom-in duration-300">
              {toastMessage}
            </div>
          )}
          {isLoading ? (
            <Badge variant="outline" className="animate-pulse">Checking status...</Badge>
          ) : isError ? (
            <Badge variant="danger" className="gap-1">
              <AlertCircle className="w-3 h-3" />
              Backend Offline
            </Badge>
          ) : (
            <>
              {statusData?.data?.datasets?.blackbox && (
                <div className="flex items-center gap-3 mr-4 border-r pr-4 border-border">
                  <div className="flex flex-col text-right">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Active Category</span>
                    <span className="text-sm font-bold text-foreground">
                      {statusData.data.category_scope?.mode === 'all' || !statusData.data.category_scope?.selected_categories?.length
                        ? 'All Categories'
                        : statusData.data.category_scope.selected_categories.length > 1
                          ? `${statusData.data.category_scope.selected_categories.length} Selected`
                          : statusData.data.category_scope.selected_categories[0]}
                    </span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-muted-foreground">Products</span>
                    <span className="text-[11px] font-mono text-emerald-500">
                      {statusData.data.category_scope?.blackbox_rows_active ?? 0} of {statusData.data.category_scope?.blackbox_rows_total ?? 0}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs ml-2"
                    onClick={handleOpenCategoryModal}
                    title="Changing category will recalculate all dashboard metrics"
                  >
                    Change Category
                  </Button>
                </div>
              )}
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
                <Database className="w-4 h-4" />
                <span>{loadedCount} Datasets Loaded</span>
              </div>
              
              {missingCount > 0 && (
                <Badge variant="warning" className="gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {missingCount} Missing
                </Badge>
              )}

              {isHealthy && missingCount === 0 && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  System Ready
                </Badge>
              )}
              
              <div className="h-4 w-px bg-border mx-2" />
              
              <Badge variant={isHealthy ? "success" : "danger"} className="gap-1 flex items-center">
                <Server className="w-3 h-3" />
                API Connect
              </Badge>
            </>
          )}
        </div>
      </header>

      {categoryModal.isOpen && (
        <Modal
          isOpen={categoryModal.isOpen}
          onClose={() => setCategoryModal(prev => ({ ...prev, isOpen: false }))}
          title="Change Market Category"
          maxWidth="max-w-2xl"
        >
          <p className="text-sm text-muted-foreground mb-4 px-1">
            Select one or more categories to narrow dashboard calculations. Leave all unchecked or choose <b>All Categories</b> to analyze the full dataset.
            Categories detected from: <span className="font-mono font-semibold">{categoryModal.columnName}</span>
          </p>
          
          <div className="flex flex-wrap items-center gap-3 mb-4 px-1">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search categories..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedCategories([])}>
              All Categories
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedCategories([])} className="text-muted-foreground">
              Clear Selection
            </Button>
            <span className="text-xs font-semibold text-muted-foreground">
              {selectedCategories.length} selected
            </span>
          </div>

          <div className="max-h-[50vh] overflow-y-auto border rounded-xl bg-card">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 font-semibold text-xs text-muted-foreground border-b sticky top-0 bg-card z-10">
              <div className="w-4"></div>
              <div>Category Name</div>
              <div className="text-center w-24">Sample Products</div>
              <div className="text-right w-20">Products</div>
              <div className="text-right w-24">Revenue</div>
            </div>
            {filteredCategories.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No categories match your search.</div>
            ) : (
              <div className="flex flex-col">
                {filteredCategories.map((c: any) => {
                  const isSelected = selectedCategories.includes(c.category);
                  return (
                    <label 
                      key={c.category} 
                      className={`
                        grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 items-center border-b last:border-0 cursor-pointer transition-colors
                        ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'}
                      `}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCategories(prev => [...prev, c.category]);
                          } else {
                            setSelectedCategories(prev => prev.filter(cat => cat !== c.category));
                          }
                        }}
                      />
                      <div className="text-sm font-medium">{c.category}</div>
                      <div className="text-sm text-center w-24 cursor-help" title={c.sample_products?.join('\n') || 'No samples'}>
                        <Badge variant="outline" className="text-[10px]">Hover to view</Badge>
                      </div>
                      <div className="text-sm text-right font-mono text-muted-foreground w-20">{c.product_count.toLocaleString()}</div>
                      <div className="text-sm text-right font-mono w-24">
                        ${(c.revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {categoryModal.error && (
            <div className="mt-4 p-3 bg-danger/10 text-danger text-sm rounded-lg border border-danger/20 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {categoryModal.error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-6 mt-4 border-t">
            <Button variant="outline" onClick={() => setCategoryModal(prev => ({ ...prev, isOpen: false }))}>Cancel</Button>
            <Button onClick={handleConfirmCategory}>
              {selectedCategories.length === 0 ? "Apply All Categories" : `Apply ${selectedCategories.length} Categories`}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
