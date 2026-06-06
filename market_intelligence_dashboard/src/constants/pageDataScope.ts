/**
 * Frontend mirror of app/utils/page_scope_registry.py
 * Single source of truth for per-page data scope declarations.
 */

export type ScopeLevel = 'global' | 'filtered' | 'blended' | 'none';

export interface PageScopeDefinition {
  pageId: string;
  page: string;
  route: string;
  keywordScope: ScopeLevel;
  productScope: ScopeLevel;
  categoryDependency: boolean;
  subcategoryDependency: boolean;
  methodology: string;
  engines: string[];
}

export const PAGE_DATA_SCOPE: Record<string, PageScopeDefinition> = {
  dashboard_overview: {
    pageId: 'dashboard_overview',
    page: 'Dashboard Overview',
    route: '/overview',
    keywordScope: 'global',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'Keyword KPIs from full Magnet; concentration/revenue from scoped BlackBox.',
    engines: ['demand', 'hhi', 'finance'],
  },
  demand_strength: {
    pageId: 'demand_strength',
    page: 'Demand Intelligence',
    route: '/demand-strength',
    keywordScope: 'global',
    productScope: 'none',
    categoryDependency: false,
    subcategoryDependency: false,
    methodology: 'All demand metrics computed exclusively from Magnet + KC. BlackBox unused.',
    engines: ['demand'],
  },
  market_structure: {
    pageId: 'market_structure',
    page: 'Market Structure',
    route: '/market-structure',
    keywordScope: 'none',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'HHI, brand share, saturation from scoped BlackBox only.',
    engines: ['hhi'],
  },
  revenue_momentum: {
    pageId: 'revenue_momentum',
    page: 'Revenue Growth',
    route: '/revenue-momentum',
    keywordScope: 'none',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'Brand revenue momentum from scoped BlackBox.',
    engines: ['revenue_momentum'],
  },
  inbound_efficiency: {
    pageId: 'inbound_efficiency',
    page: 'Inbound Efficiency Index',
    route: '/search-intent-efficiency',
    keywordScope: 'global',
    productScope: 'none',
    categoryDependency: false,
    subcategoryDependency: false,
    methodology: 'SIEI: RPS = Keyword Sales / Search Volume on full Magnet. No BlackBox in formulas.',
    engines: ['siei'],
  },
  finance_intelligence: {
    pageId: 'finance_intelligence',
    page: 'Market Entry Intelligence',
    route: '/finance-intelligence',
    keywordScope: 'global',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'Blended: Magnet for ad pressure/entry cost; BlackBox for margin/premium/capital.',
    engines: ['finance'],
  },
  demand_velocity: {
    pageId: 'demand_velocity',
    page: 'Demand Velocity',
    route: '/demand-velocity',
    keywordScope: 'global',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'Blended: mean of Magnet search/YoY trends + scoped BlackBox sales/revenue trends.',
    engines: ['demand_velocity'],
  },
  whitespace: {
    pageId: 'whitespace',
    page: 'White Space Opportunities',
    route: '/whitespace-opportunities',
    keywordScope: 'global',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'Segments from full Magnet; optional product overlap from scoped BlackBox.',
    engines: ['whitespace'],
  },
  consumer_adoption: {
    pageId: 'consumer_adoption',
    page: 'Consumer Adoption Simulator',
    route: '/consumer-adoption',
    keywordScope: 'global',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'MarketDNA from scoped engine cache: Magnet engines global, product engines filtered.',
    engines: ['demand', 'siei', 'hhi', 'revenue_momentum', 'bsr_efficiency'],
  },
  product_intelligence: {
    pageId: 'product_intelligence',
    page: 'Product Intelligence',
    route: '/product-intelligence',
    keywordScope: 'global',
    productScope: 'filtered',
    categoryDependency: true,
    subcategoryDependency: true,
    methodology: 'KC filtered to Magnet; competitive graphs from scoped BlackBox.',
    engines: ['direct_competitors', 'substitute', 'complement', 'bundle'],
  },
};

export function getPageScope(pageId: string): PageScopeDefinition | undefined {
  return PAGE_DATA_SCOPE[pageId];
}
