import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// We will create these pages later. For now, placeholders or simple imports.
import DashboardOverview from './pages/DashboardOverview';
import DatasetUpload from './pages/DatasetUpload';
import DemandStrength from './pages/DemandStrength';
import SalesMomentum from './pages/SalesMomentum';
import RevenueMomentum from './pages/RevenueMomentum';
import BsrEfficiency from './pages/BsrEfficiency';
import SearchMomentum from './pages/SearchMomentum';
import IntentEfficiency from './pages/IntentEfficiency';
import MarketConcentration from './pages/MarketConcentration';
import MarketReport from './pages/MarketReport';
import WhitespaceOpportunities from './pages/WhitespaceOpportunities';
import DirectCompetitors from './pages/DirectCompetitors';
import PriceElasticity from './pages/PriceElasticity';
import SubstituteIntelligence from './pages/SubstituteIntelligence';
import ComplementIntelligence from './pages/ComplementIntelligence';
import BundleOpportunities from './pages/BundleOpportunities';
import FinanceIntelligence from './pages/FinanceIntelligence';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route path="upload" element={<DatasetUpload />} />
            <Route index element={<DashboardOverview />} />
            <Route path="demand-strength" element={<DemandStrength />} />
            <Route path="sales-momentum" element={<SalesMomentum />} />
            <Route path="revenue-momentum" element={<RevenueMomentum />} />
            <Route path="bsr-efficiency" element={<BsrEfficiency />} />
            <Route path="search-momentum" element={<SearchMomentum />} />
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
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
