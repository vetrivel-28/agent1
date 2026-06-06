import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import { ShieldCheck, Database, Clock, Box, Hash } from 'lucide-react';
import { motion } from 'framer-motion';

export function DataTrustPanel() {
  const location = useLocation();
  const { data: statusResp } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });

  // Hide on the upload page and consumer adoption simulator
  if (location.pathname === '/upload' || location.pathname === '/' || location.pathname === '/consumer-adoption') return null;
  if (!statusResp?.data?.metadata) return null;

  const metadata = statusResp.data.metadata;
  const magnetRows = metadata.magnet?.rows || 0;
  const blackboxRows = metadata.blackbox?.rows || 0;
  
  const timestamp = Math.max(metadata.magnet?.timestamp || 0, metadata.blackbox?.timestamp || 0);
  const date = timestamp > 0 ? new Date(timestamp * 1000).toLocaleString() : new Date().toLocaleString();

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-slate-50/80 backdrop-blur-md border border-border/60 rounded-xl py-3 px-5 mb-6 flex flex-wrap items-center justify-between gap-4 text-sm shadow-sm"
    >
      <div className="flex items-center gap-2 text-primary font-medium">
        <ShieldCheck className="w-5 h-5 text-emerald-600" />
        <span className="text-emerald-800 font-bold tracking-tight">Verified Enterprise Intelligence</span>
      </div>

      <div className="flex items-center gap-6 text-muted-foreground flex-wrap">
        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-md border shadow-sm">
          <Hash className="w-4 h-4 text-primary" />
          <span><strong className="text-foreground">{magnetRows.toLocaleString()}</strong> Keywords Analyzed</span>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-md border shadow-sm">
          <Box className="w-4 h-4 text-primary" />
          <span><strong className="text-foreground">{blackboxRows.toLocaleString()}</strong> Products Analyzed</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-medium">
        <div className="flex items-center gap-1.5 bg-background border px-2 py-1 rounded-md text-foreground">
          <Database className="w-3 h-3 text-primary" />
          <span>Sources: Magnet, BlackBox</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Generated: {date}</span>
        </div>
      </div>
    </motion.div>
  );
}
