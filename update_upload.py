# -*- coding: utf-8 -*-
import re
file_path = "market_intelligence_dashboard/src/pages/DatasetUpload.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add a state for category selection modal
modal_state_decl = """  const [uploadStatus, setUploadStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    details?: any;
  }>({ type: 'idle', message: '' });

  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    categories: any[];
    columnName: string;
    isSetting: boolean;
  }>({ isOpen: false, categories: [], columnName: '', isSetting: false });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
"""
content = re.sub(
    r"  const \[uploadStatus, setUploadStatus\].*?}>.*?;\n",
    modal_state_decl,
    content,
    flags=re.DOTALL
)

# Update mutation onSuccess to check categories
mutation_success_old = """    onSuccess: (data) => {
      setUploadStatus({
        type: 'success',
        message: 'Datasets uploaded successfully.',
        details: data
      });
      
      const blackboxRows = detectedDatasets.find(d => d.type === 'blackbox')?.rows || 0;
      const magnetRows = detectedDatasets.find(d => d.type === 'magnet')?.rows || 0;
      
      historyStorage.saveEntry({
        runDate: Date.now(),
        datasetName: detectedDatasets[0]?.file.name || 'Analysis Package',
        keywords: magnetRows,
        products: blackboxRows,
        brands: 0,
      });
      // Navigation is now handled by the modal success effect
    },"""

mutation_success_new = """    onSuccess: async (data) => {
      try {
        const catRes = await api.detectCategories();
        if (catRes.has_categories && catRes.categories && catRes.categories.length > 0) {
          setCategoryModal({
            isOpen: true,
            categories: catRes.categories,
            columnName: catRes.column,
            isSetting: false
          });
          
          if (catRes.categories.length === 1) {
            setSelectedCategories([catRes.categories[0].category]);
          }
          
        } else {
          // No categories found, proceed as normal
          setUploadStatus({
            type: 'success',
            message: 'Datasets uploaded successfully. No category filtering needed.',
            details: data
          });
        }
        
        const blackboxRows = detectedDatasets.find(d => d.type === 'blackbox')?.rows || 0;
        const magnetRows = detectedDatasets.find(d => d.type === 'magnet')?.rows || 0;
        
        historyStorage.saveEntry({
          runDate: Date.now(),
          datasetName: detectedDatasets[0]?.file.name || 'Analysis Package',
          keywords: magnetRows,
          products: blackboxRows,
          brands: 0,
        });
      } catch (err) {
        setUploadStatus({
          type: 'error',
          message: 'Failed to detect categories after upload.',
          details: err
        });
      }
    },"""
content = content.replace(mutation_success_old, mutation_success_new)

# Add confirm category handler
confirm_cat = """  const handleConfirmCategory = async () => {
    if (selectedCategories.length === 0) return;
    setCategoryModal(prev => ({ ...prev, isSetting: true }));
    try {
      await api.setCategory(selectedCategories);
      setCategoryModal(prev => ({ ...prev, isOpen: false, isSetting: false }));
      setUploadStatus({
        type: 'success',
        message: 'Categories applied successfully.',
      });
    } catch (err) {
      setCategoryModal(prev => ({ ...prev, isSetting: false }));
      setUploadStatus({
        type: 'error',
        message: 'Failed to set categories.',
        details: err
      });
    }
  };
"""

content = content.replace("  const handleModalClose = () => {", confirm_cat + "\n  const handleModalClose = () => {")

# Render modal
modal_jsx = """
      {categoryModal.isOpen && (
        <Modal
          isOpen={categoryModal.isOpen}
          onClose={() => {}}
          title="Select Market Category"
          description={Your BlackBox dataset contains multiple product categories. Select the category you want to analyze before calculations begin. Detected from: }
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
            {categoryModal.categories.map((c, i) => {
              const isSelected = selectedCategories.includes(c.category);
              return (
                <div 
                  key={i} 
                  className={p-4 border rounded-xl cursor-pointer transition-all }
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCategories(prev => prev.filter(x => x !== c.category));
                    } else {
                      setSelectedCategories(prev => [...prev, c.category]);
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-foreground text-lg">{c.category}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {c.product_count} products | {c.revenue > 0 ? $ : ${c.units_sold} units}
                      </p>
                    </div>
                    <div className={w-5 h-5 rounded-sm border flex items-center justify-center }>
                      {isSelected && <CheckCircle className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                  </div>
                  {c.sample_products && c.sample_products.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Sample Products</p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside truncate">
                        {c.sample_products.map((p: string, idx: number) => (
                          <li key={idx} className="truncate">{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => {
              setCategoryModal(prev => ({ ...prev, isOpen: false }));
              setUploadStatus({ type: 'idle', message: '' });
              setDetectedDatasets([]);
            }}>Cancel Upload</Button>
            <Button 
              disabled={selectedCategories.length === 0 || categoryModal.isSetting}
              onClick={handleConfirmCategory}
            >
              {categoryModal.isSetting ? 'Applying...' : 'Start Analysis'}
            </Button>
          </div>
        </Modal>
      )}
"""
content = content.replace("      <AnalysisProgressModal", modal_jsx + "\n      <AnalysisProgressModal")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
