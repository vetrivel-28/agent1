import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Server, Database, AlertCircle, CheckCircle2 } from 'lucide-react';

export function Topbar() {
  const { data: health, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 30000, // Check every 30s
  });

  const isHealthy = health?.status === 'ok';
  
  // Count loaded datasets
  const datasets = health?.datasets_loaded || {};
  const loadedCount = Object.values(datasets).filter(Boolean).length;
  const missingCount = Object.values(datasets).length - loadedCount;

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-background/80 px-6 backdrop-blur-xl">
      <div className="flex flex-1 items-center gap-4">
        <h2 className="text-lg font-semibold capitalize">
          {/* We'll handle page title dynamically elsewhere or keep it generic here */}
          Market Overview
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {isLoading ? (
          <Badge variant="outline" className="animate-pulse">Checking status...</Badge>
        ) : isError ? (
          <Badge variant="danger" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            Backend Offline
          </Badge>
        ) : (
          <>
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
  );
}
