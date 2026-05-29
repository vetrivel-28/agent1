import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlertCircle, Loader2, FileText, Zap, ShieldAlert, Target, CheckCircle2, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';


export default function MarketReport() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-report'],
    queryFn: () => api.getMarketReport(10),
  });
  const [isDownloading, setIsDownloading] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data || data.status !== 'success') {
    return (
      <Card className="border-danger/50 bg-danger/5 mt-10">
        <CardContent className="p-8 flex flex-col items-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold text-danger mb-2">Analysis Failed</h2>
          <p className="text-danger/80">Make sure all necessary datasets are populated.</p>
        </CardContent>
      </Card>
    );
  }

  const opportunities = data.results?.opportunity_signals?.signals || [];
  const risks = data.results?.risk_signals?.signals || [];
  const verdict = data.results?.final_market_verdict?.verdict || 'Analysis Pending';

  const downloadPdf = async () => {
    setIsDownloading(true);
    try {
      const blob = await api.downloadMarketReportPdf(10);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'market_intelligence_report.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-end border-b pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            Market Intelligence Report
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">Autonomous synthesis of market signals.</p>
        </div>
        <div className="text-right text-sm text-muted-foreground hidden md:block">
          <p>Generated: {new Date().toLocaleDateString()}</p>
          <p className="font-mono mt-1">ID: MRKT-DETERMINISTIC</p>
        </div>
      </div>

      <div className="p-8 rounded-2xl bg-primary text-primary-foreground shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-sm font-bold tracking-widest uppercase mb-4 opacity-80 flex items-center gap-2">
            <Target className="w-4 h-4" /> Final Verdict
          </h2>
          <p className="text-3xl md:text-4xl font-bold leading-tight">
            {verdict}
          </p>
        </div>
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-1/4 translate-y-1/4">
          <Target className="w-64 h-64" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b pb-2">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-bold">Market Health</h3>
          </div>
          <div className="prose prose-sm dark:prose-invert">
            <ul className="space-y-4 list-none p-0">
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <span><strong className="block text-foreground">Demand Status</strong> 
                  The market demand score is currently validating at standard levels.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <span><strong className="block text-foreground">Revenue Flow</strong> 
                  Sustained monetization across established cohorts.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-2 border-b pb-2">
            <Zap className="w-5 h-5 text-warning" />
            <h3 className="text-xl font-bold">Opportunity Signals</h3>
          </div>
          <ul className="space-y-3">
            {opportunities.map((sig: string, i: number) => (
              <li key={i} className="flex gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
                <Zap className="w-5 h-5 text-warning shrink-0" />
                <span className="text-sm">{sig}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-6 pt-4 border-t">
        <div className="flex items-center gap-2 border-b pb-2">
          <ShieldAlert className="w-5 h-5 text-danger" />
          <h3 className="text-xl font-bold">Risk Factors & Exposure</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {risks.map((risk: string, i: number) => (
            <div key={i} className="flex gap-3 p-4 rounded-xl bg-danger/5 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{risk}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center pt-10 gap-4">
        <Button onClick={downloadPdf} disabled={isDownloading} className="min-w-[200px]">
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download Report PDF
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
