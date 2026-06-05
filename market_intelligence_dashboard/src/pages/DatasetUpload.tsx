import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { UploadCloud, File as FileIcon, X, CheckCircle, AlertCircle, Loader2, Database, BarChart3, AlertTriangle, Bug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { Modal } from '../components/ui/Modal';
import { AnalysisProgressModal } from '../components/modals/AnalysisProgressModal';
import type { AnalysisStatus } from '../components/modals/AnalysisProgressModal';
import { historyStorage } from '../services/historyStorage';
import { PageHeader } from '../components/layout/PageHeader';
import { formatGenericLabel } from '../utils/formatters';


type DetectedFile = {
  file: File;
  type: 'blackbox' | 'magnet' | 'classification' | 'unknown';
  rows: number;
  columns: number;
  confidence: number;
  matchedSchema: string[];
  missingColumns: string[];
  debugReason: string;
  duplicateHeaders: string[];
};

export default function DatasetUpload() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedDatasets, setDetectedDatasets] = useState<DetectedFile[]>([]);
  
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    details?: any;
  }>({ type: 'idle', message: '' });

  const [analysisStarted, setAnalysisStarted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: statusData } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  const handleRemoveActiveDataset = async (datasetType: string) => {
    try {
      await api.removeDataset(datasetType);
      queryClient.invalidateQueries({ queryKey: ['status'] });
    } catch (err: any) {
      console.error('Failed to remove dataset', err);
      alert('Failed to remove dataset: ' + (err.message || 'Unknown error'));
    }
  };

  const handleReplaceClick = (type: string) => {
    // We can just trigger the main dropzone since our logic handles replacing automatically
    // by only picking the latest uploaded file of a type.
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const mutation = useMutation({
    mutationFn: (formData: FormData) => api.uploadDatasets(formData),
    onSuccess: async (data) => {
      try {
        // Health check before proceeding
        try {
          await api.getHealth();
        } catch (healthErr: any) {
          console.error('[Upload] Backend health check failed:', healthErr);
          setUploadStatus({
            type: 'error',
            message: 'Backend is not reachable. Check that the API server is running at http://localhost:8000',
            details: { healthCheckFailed: true, originalError: healthErr }
          });
          return;
        }

        // We no longer require category selection on upload.
        // The backend automatically defaults to the full dataset.
        await api.startAnalysis();
        setAnalysisStarted(true);
        setUploadStatus({
          type: 'success',
          message: 'Datasets uploaded successfully. Analysis started.',
          details: data,
        });
        queryClient.prefetchQuery({ queryKey: ['detect-categories'], queryFn: api.detectCategories });
        
        const blackboxRows = detectedDatasets.find(d => d.type === 'blackbox')?.rows || 0;
        const magnetRows = detectedDatasets.find(d => d.type === 'magnet')?.rows || 0;
        
        historyStorage.saveEntry({
          runDate: Date.now(),
          datasetName: detectedDatasets[0]?.file.name || 'Analysis Package',
          keywords: magnetRows,
          products: blackboxRows,
          brands: 0,
        });

      } catch (err: any) {
        console.error('[Upload] Category detection error:', err);
        
        // Detect CORS or network errors
        if (!err.response) {
          // Network error - no response received
          const isCors = err.message?.includes('Network Error') || 
                        err.message?.includes('CORS') ||
                        err.code === 'ERR_NETWORK';
          
          if (isCors) {
            setUploadStatus({
              type: 'error',
              message: 'Backend connection failed. Check API server and CORS settings.',
              details: {
                error_type: 'cors_or_network',
                message: 'Frontend could not reach backend. Ensure API is running at http://localhost:8000 and CORS is configured.',
                original_error: err.message
              }
            });
            return;
          }
          
          setUploadStatus({
            type: 'error',
            message: 'Network error: Unable to connect to backend API.',
            details: err
          });
          return;
        }
        
        // Backend returned error response
        const backendMessage = err.response?.data?.message || err.message;
        setUploadStatus({
          type: 'error',
          message: `Category detection failed: ${backendMessage}`,
          details: err.response?.data
        });
      }
    },
    onError: (error: any) => {
      console.error('[Upload] Upload mutation error:', error);
      
      // Check for CORS/network errors
      if (!error.response) {
        setUploadStatus({
          type: 'error',
          message: 'Backend connection failed. Check that API server is running at http://localhost:8000',
          details: { network_error: true, message: error.message }
        });
        return;
      }
      
      // Extract error details
      const errList = error.response?.data?.errors;
      const firstErr = Array.isArray(errList) && errList[0];
      
      if (firstErr) {
        const dataset = firstErr.dataset;
        const message = firstErr.message;
        const missingCols = firstErr.missing_columns;
        const detectedCols = firstErr.detected_columns;
        
        if (missingCols && missingCols.length > 0) {
          setUploadStatus({
            type: 'error',
            message: `CSV schema validation failed for ${dataset || 'dataset'}`,
            details: {
              dataset: dataset,
              message: message,
              missing_columns: missingCols,
              detected_columns: detectedCols,
              expected_format: `${dataset || 'Dataset'} requires columns: ${missingCols.join(', ')}`
            }
          });
          return;
        }
      }
      
      const firstMsg = firstErr?.message || error.response?.data?.message;
      setUploadStatus({
        type: 'error',
        message: firstMsg || error.response?.data?.detail?.[0]?.msg || error.message || 'Upload validation failed.',
        details: error.response?.data
      });
    }
  });


  const handleModalClose = () => {
    if (uploadStatus.type === 'success') {
      queryClient.invalidateQueries();
      navigate('/overview');
      setTimeout(() => setDetectedDatasets([]), 500);
    }
    setUploadStatus({ type: 'idle', message: '' });
  };

  useEffect(() => {
    if (uploadStatus.type === 'success' && analysisStarted) {
      const timer = setTimeout(() => {
        handleModalClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [uploadStatus.type, analysisStarted]);

  const getModalStatus = (): AnalysisStatus => {
    if (mutation.isPending) return 'analyzing';
    if (uploadStatus.type === 'success' && analysisStarted) return 'success';
    if (uploadStatus.type === 'error') return 'error';
    return 'idle';
  };


  const parseCSV = (file: File): Promise<DetectedFile> => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          const rawHeaders: string[] = results.meta.fields || [];

          // ── Normalise duplicate headers ───────────────────────────────
          // PapaParse renames duplicates internally (e.g. "Search Volume_1")
          // but we want deterministic names and a transparent audit trail.
          const seenCounts: Record<string, number> = {};
          const normalisedHeaders: string[] = [];
          const duplicateHeaders: string[] = [];

          for (const h of rawHeaders) {
            const key = h.trim();
            if (seenCounts[key] == null) {
              seenCounts[key] = 0;
              normalisedHeaders.push(key);
            } else {
              seenCounts[key]++;
              const renamed = `${key}_${seenCounts[key] + 1}`;
              normalisedHeaders.push(renamed);
              if (!duplicateHeaders.includes(key)) duplicateHeaders.push(key);
            }
          }

          if (duplicateHeaders.length > 0) {
            console.warn(
              `[DatasetUpload] Duplicate headers in "${results.meta.fields ? 'file' : 'unknown'}":`,
              duplicateHeaders,
              '— renamed to avoid silent ambiguity.'
            );
          }

          const headers = normalisedHeaders;
          const headerStr = headers.map(h => h.toLowerCase().trim());
          const rows = results.data.length;
          const columns = headers.length;
          
          const blackboxKeys = ['parent level revenue', 'parent level sales', 'bsr', 'brand', 'asin', 'review count'];
          const magnetKeys = ['search volume', 'keyword phrase', 'magnet iq score', 'cpr', 'search intent', 'search volume history', 'search volume trend'];
          const classKeys = ['classification', 'category', 'keyword'];

          const bbMatches = blackboxKeys.filter(k => headerStr.includes(k));
          const magMatches = magnetKeys.filter(k => headerStr.includes(k));
          const clsMatches = classKeys.filter(k => headerStr.includes(k));

          const bbScore = bbMatches.length / blackboxKeys.length;
          const magScore = magMatches.length / magnetKeys.length;
          const clsScore = clsMatches.length / classKeys.length;

          let type: DetectedFile['type'] = 'unknown';
          let confidence = 0;
          let matchedSchema: string[] = [];
          let missingColumns: string[] = [];
          let debugReason = "No matching schema score > 0.15";

          const maxScore = Math.max(bbScore, magScore, clsScore);
          
          if (maxScore > 0.15) {
            if (maxScore === bbScore) {
              type = 'blackbox';
              confidence = Math.round(bbScore * 100);
              matchedSchema = bbMatches;
              missingColumns = blackboxKeys.filter(k => !headerStr.includes(k));
              debugReason = `Matched ${bbMatches.length}/${blackboxKeys.length} BlackBox columns.`;
            } else if (maxScore === magScore) {
              type = 'magnet';
              confidence = Math.round(magScore * 100);
              matchedSchema = magMatches;
              missingColumns = magnetKeys.filter(k => !headerStr.includes(k));
              debugReason = `Matched ${magMatches.length}/${magnetKeys.length} Magnet columns.`;
            } else if (maxScore === clsScore) {
              type = 'classification';
              confidence = Math.round(clsScore * 100);
              matchedSchema = clsMatches;
              missingColumns = classKeys.filter(k => !headerStr.includes(k));
              debugReason = `Matched ${clsMatches.length}/${classKeys.length} Classification columns.`;
            }
          }

          resolve({ file, type, rows, columns, confidence, matchedSchema, missingColumns, debugReason, duplicateHeaders });
        },
        error: (err) => {
          resolve({ file, type: 'unknown', rows: 0, columns: 0, confidence: 0, matchedSchema: [], missingColumns: [], debugReason: err.message, duplicateHeaders: [] });
        }
      });
    });
  };

  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setUploadStatus({ type: 'idle', message: '' });
    
    let allCsvs: File[] = [];

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const [filename, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir && filename.toLowerCase().endsWith('.csv')) {
              const blob = await zipEntry.async('blob');
              allCsvs.push(new File([blob], filename, { type: 'text/csv' }));
            }
          }
        } catch (err) {
          console.error("Failed to parse zip", err);
        }
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        allCsvs.push(file);
      }
    }

    const detected = await Promise.all(allCsvs.map(f => parseCSV(f)));
    
    // De-duplicate: Keep only the highest confidence for each type (or all if unknown)
    const uniqueDetected: DetectedFile[] = [];
    const seenTypes = new Set<string>();
    
    detected.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).forEach(d => {
      if (d.type !== 'unknown' && !seenTypes.has(d.type)) {
        seenTypes.add(d.type);
        uniqueDetected.push(d);
      } else if (d.type === 'unknown') {
        uniqueDetected.push(d);
      }
    });

    setDetectedDatasets(uniqueDetected);
    setIsProcessing(false);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = () => {
    const blackbox = detectedDatasets.find(d => d.type === 'blackbox')?.file;
    const magnet = detectedDatasets.find(d => d.type === 'magnet')?.file;
    const classification = detectedDatasets.find(d => d.type === 'classification')?.file;

    if (!blackbox && !magnet && !classification) return;

    const formData = new FormData();
    if (blackbox) formData.append('blackbox', blackbox);
    if (magnet) formData.append('magnet', magnet);
    if (classification) formData.append('keyword_classification', classification);

    mutation.mutate(formData);
  };

  const removeDataset = (fileToRemove: File) => {
    setDetectedDatasets(prev => prev.filter(d => d.file !== fileToRemove));
  };

  const hasBlackbox = detectedDatasets.some(d => d.type === 'blackbox');
  const hasMagnet = detectedDatasets.some(d => d.type === 'magnet');
  const hasClassification = detectedDatasets.some(d => d.type === 'classification');
  
  const isValid = hasBlackbox && hasMagnet;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto"
    >
      <PageHeader 
        badge="Data Ingestion"
        title="Dataset Upload"
        description="Upload your Market Intelligence Package. The system will automatically detect and schema-map your Blackbox and Magnet files."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Intelligence Package</CardTitle>
              <CardDescription>Drag & drop a ZIP file or multiple CSVs directly here.</CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                className={`
                  border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200
                  ${isDragging ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
                  ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
                `}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".csv,.zip"
                  multiple
                  onChange={handleFileSelect}
                />
                
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-4 text-primary">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <div>
                      <p className="font-semibold text-lg">Analyzing Schemas...</p>
                      <p className="text-sm text-muted-foreground">Auto-detecting BlackBox & Magnet structures</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-primary/10 text-primary rounded-full">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg text-foreground">Click or drag files here</p>
                      <p className="text-sm text-muted-foreground mt-1">Supported: .zip or multiple .csv files</p>
                    </div>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {detectedDatasets.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 pt-6 border-t"
                  >
                    <h3 className="font-semibold mb-4">Detected Datasets: {detectedDatasets.length}</h3>
                    <div className="space-y-3">
                      {detectedDatasets.map((d, i) => (
                        <div key={i} className="flex flex-col border rounded-lg bg-card overflow-hidden">
                          <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-md ${d.type !== 'unknown' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                <FileIcon className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-medium flex items-center gap-2">
                                  {d.type === 'blackbox' && 'BlackBox Products Dataset'}
                                  {d.type === 'magnet' && 'Magnet Keyword Dataset'}
                                  {d.type === 'classification' && 'Keyword Classification Dataset'}
                                  {d.type === 'unknown' && 'Unknown Dataset Format'}
                                  {d.type !== 'unknown' ? <CheckCircle className="w-4 h-4 text-success" /> : <AlertTriangle className="w-4 h-4 text-danger" />}
                                </p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-[400px]">
                                  {d.file.name}
                                </p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-danger" onClick={() => removeDataset(d.file)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="bg-muted/30 p-3 text-xs font-mono border-t border-border/50">
                            <div className="flex items-center gap-2 mb-2 font-bold text-muted-foreground">
                              <Bug className="w-3 h-3" /> Detection Debug Panel
                            </div>
                            <div className="grid grid-cols-[150px_1fr] gap-1">
                              <span className="text-muted-foreground">Matched Type:</span>
                              <span className={d.type !== 'unknown' ? 'text-success font-semibold' : 'text-danger font-semibold'}>{d.type.toUpperCase()}</span>
                              <span className="text-muted-foreground">Confidence:</span>
                              <span>{d.confidence}%</span>
                              <span className="text-muted-foreground">Reason:</span>
                              <span>{d.debugReason}</span>
                              <span className="text-muted-foreground">Required Found:</span>
                              <span className="text-success">{d.matchedSchema.join(', ') || 'None'}</span>
                              <span className="text-muted-foreground">Missing Columns:</span>
                              <span className="text-danger opacity-70">{d.missingColumns.join(', ') || 'None'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Active Datasets Panel */}
          {statusData?.data?.datasets_loaded && Object.values(statusData.data.datasets_loaded).some(v => v) && (
            <Card>
              <CardHeader>
                <CardTitle>Active Datasets</CardTitle>
                <CardDescription>Datasets currently loaded in the analysis engine.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {['blackbox', 'magnet', 'keyword_classification'].map((type) => {
                  const isActive = statusData.data.datasets_loaded[type];
                  if (!isActive) return null;
                  
                  const meta = statusData.data.metadata?.[type] || {};
                  
                  return (
                    <div key={type} className="flex flex-col border rounded-lg bg-card overflow-hidden">
                      <div className="flex items-center justify-between p-3 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-success/10 text-success">
                            <Database className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              {type === 'blackbox' && 'BlackBox Products Dataset'}
                              {type === 'magnet' && 'Magnet Keyword Dataset'}
                              {type === 'keyword_classification' && 'Keyword Classification Dataset'}
                              <CheckCircle className="w-4 h-4 text-success" />
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {meta.filename || 'Original filename unavailable'} • {meta.rows?.toLocaleString() || 0} rows
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleReplaceClick(type)}>
                            Replace
                          </Button>
                          <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10 hover:text-danger border-danger/20" onClick={() => handleRemoveActiveDataset(type)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Dataset Validation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    {hasBlackbox || statusData?.data?.datasets_loaded?.blackbox ? <CheckCircle className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-danger" />}
                    <span className="font-medium">BlackBox Schema Detected</span>
                  </div>
                  {hasBlackbox || statusData?.data?.datasets_loaded?.blackbox ? (
                    <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">Valid</span>
                  ) : (
                    <span className="text-xs text-danger font-medium">Missing BlackBox Dataset</span>
                  )}
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    {hasMagnet || statusData?.data?.datasets_loaded?.magnet ? <CheckCircle className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-danger" />}
                    <span className="font-medium">Magnet Schema Detected</span>
                  </div>
                  {hasMagnet || statusData?.data?.datasets_loaded?.magnet ? (
                     <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">Valid</span>
                  ) : (
                     <span className="text-xs text-danger font-medium">Missing Magnet Dataset</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    {hasClassification || statusData?.data?.datasets_loaded?.keyword_classification ? <CheckCircle className="w-5 h-5 text-success" /> : <CheckCircle className="w-5 h-5 text-muted-foreground" />}
                    <span className="font-medium text-muted-foreground">Classification Schema Detected</span>
                  </div>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full font-medium">Optional</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t flex flex-col gap-4">
                <Button 
                  size="lg" 
                  onClick={handleUpload}
                  disabled={!isValid || mutation.isPending}
                  className="w-full text-base"
                >
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Upload & Validate
                </Button>
                {!isValid && detectedDatasets.length > 0 && (
                  <p className="text-xs text-center text-danger font-medium">
                    ⚠ Cannot upload. Required datasets are missing.
                  </p>
                )}
                {isValid && (
                  <p className="text-xs text-center text-muted-foreground">
                    After upload, you will select the BlackBox market category before calculations begin.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Database className="w-4 h-4" /> Dataset Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
               {detectedDatasets.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8 opacity-70">
                  Waiting for files...
                </div>
              ) : (
                <div className="space-y-6">
                  {detectedDatasets.filter(d => d.type === 'blackbox').map((d, i) => (
                    <div key={i} className="space-y-1 bg-muted/20 p-3 rounded-lg border">
                      <h4 className="font-semibold text-sm text-primary">BlackBox Products</h4>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Filename:</span> {d.file.name}
                      </div>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Rows:</span> {d.rows.toLocaleString()}
                      </div>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Columns:</span> {d.columns}
                      </div>
                    </div>
                  ))}

                  {detectedDatasets.filter(d => d.type === 'magnet').map((d, i) => (
                    <div key={i} className="space-y-1 bg-muted/20 p-3 rounded-lg border">
                      <h4 className="font-semibold text-sm text-primary">Magnet Keywords</h4>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Filename:</span> {d.file.name}
                      </div>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Rows:</span> {d.rows.toLocaleString()}
                      </div>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Columns:</span> {d.columns}
                      </div>
                    </div>
                  ))}
                  
                  {detectedDatasets.filter(d => d.type === 'classification').map((d, i) => (
                    <div key={i} className="space-y-1 bg-muted/20 p-3 rounded-lg border">
                      <h4 className="font-semibold text-sm text-primary">Keyword Classification</h4>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Filename:</span> {d.file.name}
                      </div>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Rows:</span> {d.rows.toLocaleString()}
                      </div>
                      <div className="text-sm text-foreground">
                        <span className="text-muted-foreground">Columns:</span> {d.columns}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>




      <AnalysisProgressModal
        status={getModalStatus()}
        errorMessage={uploadStatus.message}
        onRetry={handleUpload}
        onClose={handleModalClose}
      />
    </motion.div>
  );
}
