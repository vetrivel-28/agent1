import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { UploadCloud, File, X, CheckCircle, AlertCircle, Loader2, Database } from 'lucide-react';
import { motion } from 'framer-motion';

type FileState = File | null;

export default function DatasetUpload() {
  const queryClient = useQueryClient();
  const [blackbox, setBlackbox] = useState<FileState>(null);
  const [magnet, setMagnet] = useState<FileState>(null);
  const [classification, setClassification] = useState<FileState>(null);

  const [uploadStatus, setUploadStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    details?: any;
  }>({ type: 'idle', message: '' });

  const blackboxRef = useRef<HTMLInputElement>(null);
  const magnetRef = useRef<HTMLInputElement>(null);
  const classRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (formData: FormData) => api.uploadDatasets(formData),
    onSuccess: (data) => {
      setUploadStatus({
        type: 'success',
        message: 'Datasets uploaded successfully.',
        details: data
      });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      
      // Reset files on success after a short delay
      setTimeout(() => {
        setBlackbox(null);
        setMagnet(null);
        setClassification(null);
      }, 3000);
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

  const handleUpload = () => {
    if (!blackbox && !magnet && !classification) return;

    const formData = new FormData();
    if (blackbox) formData.append('blackbox', blackbox);
    if (magnet) formData.append('magnet', magnet);
    if (classification) formData.append('keyword_classification', classification);

    mutation.mutate(formData);
  };

  const FileDropzone = ({ 
    file, 
    setFile, 
    label, 
    inputRef 
  }: { 
    file: FileState, 
    setFile: (f: FileState) => void, 
    label: string, 
    inputRef: React.RefObject<HTMLInputElement | null> 
  }) => {
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        setFile(e.dataTransfer.files[0]);
      }
    };

    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
        </label>
        <div 
          className={`
            border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors
            ${file ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
          `}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input 
            type="file" 
            ref={inputRef} 
            className="hidden" 
            accept=".csv"
            onChange={(e) => e.target.files && setFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-success/20 text-success rounded-full">
                <File className="w-6 h-6" />
              </div>
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2 text-danger hover:text-danger hover:bg-danger/10"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
              >
                <X className="w-4 h-4 mr-1" /> Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="p-3 bg-muted rounded-full">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="font-medium text-sm text-foreground">Click or drag CSV here</p>
              <p className="text-xs">Max file size: 50MB</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-5xl mx-auto"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dataset Upload</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Upload CSV files — dataset type is detected from column headers, not file names.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Input Sources</CardTitle>
            <CardDescription>Upload one or more datasets. Existing data will be overwritten.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FileDropzone file={blackbox} setFile={setBlackbox} label="BlackBox Products CSV *" inputRef={blackboxRef} />
              <FileDropzone file={magnet} setFile={setMagnet} label="Magnet Keyword CSV" inputRef={magnetRef} />
            </div>
            
            <div className="border-t pt-6">
              <FileDropzone file={classification} setFile={setClassification} label="Keyword Classification CSV (Optional)" inputRef={classRef} />
            </div>

            <div className="flex justify-end pt-4">
              <Button 
                size="lg" 
                onClick={handleUpload}
                disabled={(!blackbox && !magnet && !classification) || mutation.isPending}
                className="w-full sm:w-auto"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processing upload...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-5 h-5 mr-2" />
                    Upload & Process Datasets
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Status</CardTitle>
            </CardHeader>
            <CardContent>
              {uploadStatus.type === 'idle' && (
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <Database className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Ready for datasets</p>
                </div>
              )}
              
              {uploadStatus.type === 'success' && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-4 bg-success/10 border border-success/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-success mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-success">{uploadStatus.message}</h4>
                      {uploadStatus.details?.rows_loaded && (
                        <div className="mt-2 space-y-1 text-sm text-foreground/80">
                          {Object.entries(uploadStatus.details.rows_loaded).map(([key, amount]: any) => (
                            <div key={key} className="flex justify-between">
                              <span className="capitalize">{key.replace('_', ' ')}</span>
                              <span className="font-mono bg-background px-1 rounded">{amount} rows</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {uploadStatus.type === 'error' && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-4 bg-danger/10 border border-danger/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-danger">Validation Failed</h4>
                      <p className="text-sm text-danger/80 mt-1">{uploadStatus.message}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-sm">Requirements</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• BlackBox datasets are required for most analyses (e.g. Sales Momentum, Market Concentration).</p>
              <p>• Magnet datasets are required for Search-specific insights.</p>
              <p>• Ensure both datasets are from the exact same market niche for accurate correlation.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
