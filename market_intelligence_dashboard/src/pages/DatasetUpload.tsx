import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { UploadCloud, File as FileIcon, X, CheckCircle, AlertCircle, Loader2, Database, BarChart3, AlertTriangle, Bug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { AnalysisProgressModal } from '../components/modals/AnalysisProgressModal';
import type { AnalysisStatus } from '../components/modals/AnalysisProgressModal';
import { historyStorage } from '../services/historyStorage';
import { PageHeader } from '../components/layout/PageHeader';

type DetectedFile = {
  file: File;
  type: 'blackbox' | 'magnet' | 'classification' | 'unknown';
  rows: number;
  columns: number;
  confidence: number;
  matchedSchema: string[];
  missingColumns: string[];
  debugReason: string;
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (formData: FormData) => api.uploadDatasets(formData),
    onSuccess: (data) => {
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
    },
    onError: (error: any) => {
      const errList = error.response?.data?.errors;
      const firstMsg = Array.isArray(errList) && errList[0]?.message
        ? errList[0].message
        : error.response?.data?.message;
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
    if (uploadStatus.type === 'success') {
      const timer = setTimeout(() => {
        handleModalClose();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [uploadStatus.type]);

  const getModalStatus = (): AnalysisStatus => {
    if (mutation.isPending) return 'analyzing';
    if (uploadStatus.type === 'success') return 'success';
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
          const headers = results.meta.fields || [];
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

          resolve({ file, type, rows, columns, confidence, matchedSchema, missingColumns, debugReason });
        },
        error: (err) => {
          resolve({ file, type: 'unknown', rows: 0, columns: 0, confidence: 0, matchedSchema: [], missingColumns: [], debugReason: err.message });
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

          <Card>
            <CardHeader>
              <CardTitle>Dataset Validation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    {hasBlackbox ? <CheckCircle className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-danger" />}
                    <span className="font-medium">BlackBox Schema Detected</span>
                  </div>
                  {hasBlackbox ? (
                    <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">Valid</span>
                  ) : (
                    <span className="text-xs text-danger font-medium">Missing BlackBox Dataset</span>
                  )}
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    {hasMagnet ? <CheckCircle className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-danger" />}
                    <span className="font-medium">Magnet Schema Detected</span>
                  </div>
                  {hasMagnet ? (
                     <span className="text-xs bg-success/10 text-success px-2 py-1 rounded-full font-medium">Valid</span>
                  ) : (
                     <span className="text-xs text-danger font-medium">Missing Magnet Dataset</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3">
                    {hasClassification ? <CheckCircle className="w-5 h-5 text-success" /> : <CheckCircle className="w-5 h-5 text-muted-foreground" />}
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
                  Start Analysis
                </Button>
                {!isValid && detectedDatasets.length > 0 && (
                  <p className="text-xs text-center text-danger font-medium">
                    ⚠ Cannot start analysis. Required datasets are missing.
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
