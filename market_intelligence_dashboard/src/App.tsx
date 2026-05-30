import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const DashboardOverview = lazy(() => import('./pages/DashboardOverview'));
const DatasetUpload = lazy(() => import('./pages/DatasetUpload'));
const DemandStrength = lazy(() => import('./pages/DemandStrength'));
const SalesMomentum = lazy(() => import('./pages/SalesMomentum'));
const RevenueMomentum = lazy(() => import('./pages/RevenueMomentum'));
const BsrEfficiency = lazy(() => import('./pages/BsrEfficiency'));
const IntentEfficiency = lazy(() => import('./pages/IntentEfficiency'));
const MarketConcentration = lazy(() => import('./pages/MarketConcentration'));
const MarketReport = lazy(() => import('./pages/MarketReport'));
const WhitespaceOpportunities = lazy(() => import('./pages/WhitespaceOpportunities'));
const DirectCompetitors = lazy(() => import('./pages/DirectCompetitors'));
const PriceElasticity = lazy(() => import('./pages/PriceElasticity'));
const SubstituteIntelligence = lazy(() => import('./pages/SubstituteIntelligence'));
const ComplementIntelligence = lazy(() => import('./pages/ComplementIntelligence'));
const BundleOpportunities = lazy(() => import('./pages/BundleOpportunities'));
const FinanceIntelligence = lazy(() => import('./pages/FinanceIntelligence'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/upload" replace />} />
              <Route path="upload" element={<DatasetUpload />} />
              <Route path="overview" element={<DashboardOverview />} />
              <Route path="demand-strength" element={<DemandStrength />} />
              <Route path="sales-momentum" element={<SalesMomentum />} />
              <Route path="revenue-momentum" element={<RevenueMomentum />} />
              <Route path="bsr-efficiency" element={<BsrEfficiency />} />
              <Route path="search-intent-efficiency" element={<IntentEfficiency />} />
              <Route path="market-structure" element={<MarketConcentration />} />
              <Route path="whitespace-opportunities" element={<WhitespaceOpportunities />} />
              <Route path="direct-competitors" element={<DirectCompetitors />} />
              <Route path="substitute-intelligence" element={<SubstituteIntelligence />} />
              <Route path="complement-intelligence" element={<ComplementIntelligence />} />
              <Route path="bundle-opportunities" element={<BundleOpportunities />} />
              <Route path="price-elasticity" element={<PriceElasticity />} />
              <Route path="finance-intelligence" element={<FinanceIntelligence />} />
              <Route path="market-report" element={<MarketReport />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
