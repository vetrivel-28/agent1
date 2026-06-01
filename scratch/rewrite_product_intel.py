import os

pages_dir = r"c:\Users\annie\agent1\market_intelligence_dashboard\src\pages"

template = """import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { isEngineOk, getEngineErrorMessage } from '../utils/analysisStatus';
import { AlertCircle, Loader2, Target } from 'lucide-react';
import { formatCurrency } from '../utils/cn';

export default function __FILENAME__() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['__QUERY_KEY__'],
    queryFn: () => {
      if ('__QUERY_KEY__' === 'direct-competitors') return api.getDirectCompetitors(15, 17.5);
      if ('__QUERY_KEY__' === 'substitute-intelligence') return api.getSubstituteIntelligence(10);
      if ('__QUERY_KEY__' === 'complement-intelligence') return api.getComplementIntelligence(10);
      return api.getBundleOpportunities(10);
    }(),
  });

  if (isLoading) {
    return (
      <div className="flex py-20 items-center justify-center flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Loading __TITLE__...</p>
      </div>
    );
  }

  if (isError || !isEngineOk(data)) {
    return (
      <Card className="border-danger/20 bg-danger/5 mt-4">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <AlertCircle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-xl font-bold mb-2 font-serif text-danger">__TITLE__ Unavailable</h2>
          <p className="text-danger/80 max-w-lg">{getEngineErrorMessage(data, 'Insufficient data to compute __TITLE__.')}</p>
        </CardContent>
      </Card>
    );
  }

  const results = data?.data?.results || {};
  __DATAPATH_FN__
  const top5 = items.slice(0, 5);

  if (top5.length === 0) {
    return (
      <Card className="mt-4 border-dashed">
        <CardContent className="p-10 flex flex-col items-center text-center text-muted-foreground">
          <Target className="w-10 h-10 mb-3 opacity-20" />
          <p>__EMPTY_TEXT__</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">__TITLE__</h2>
        <p className="text-muted-foreground">__DESCRIPTION__</p>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {top5.map((item: any, idx: number) => {
          const score = Number(item.__SCORE_KEY__) || 0;
          let titleText = item.title || item.reference_title || item.brand || item.asin || 'Unknown Product';
          if (item.complement_product) titleText = item.complement_product.title || item.complement_product.asin || titleText;
          if (item.primary_product && '__QUERY_KEY__' === 'bundle-opportunities') {
             titleText = (item.primary_product.title || item.primary_product.asin) + " + " + (item.complement_product.title || item.complement_product.asin);
          }
          
          return (
            <Card key={idx} className="overflow-hidden border-l-4" style={{borderLeftColor: 'hsl(var(--primary))'}}>
              <CardContent className="p-5 flex flex-col md:flex-row items-start gap-4">
                <div className="flex items-center justify-center bg-primary/10 text-primary font-bold text-xl rounded-full w-12 h-12 shrink-0">
                  #{idx + 1}
                </div>
                
                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-lg leading-tight line-clamp-2">{titleText}</h3>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {item.brand && item.brand !== 'N/A' && <Badge variant="outline" className="text-[10px]">{item.brand}</Badge>}
                    {item.category && item.category !== 'N/A' && <span className="uppercase text-[10px] font-mono">{item.category}</span>}
                    {item.asin && <span className="font-mono text-xs">{item.asin}</span>}
                    {item.price ? <span className="font-mono font-medium text-foreground">{formatCurrency(item.price)}</span> : null}
                  </div>
                  
                  <div className="mt-3 p-3 bg-muted/30 rounded-md text-sm border border-border/50">
                    <span className="font-semibold text-foreground mr-1">Why?</span> 
                    __REASON_TEXT__
                  </div>
                </div>
                
                <div className="flex flex-col items-end justify-center shrink-0 min-w-[100px]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Score</p>
                  <p className="text-3xl font-black font-mono text-primary">{score.toFixed(1)}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
"""

def write_component(filename, title, description, queryKey, dataPathFn, scoreKey, reasonTextFn, emptyText):
    content = template.replace("__FILENAME__", filename.replace('.tsx', ''))
    content = content.replace("__TITLE__", title)
    content = content.replace("__DESCRIPTION__", description)
    content = content.replace("__QUERY_KEY__", queryKey)
    content = content.replace("__DATAPATH_FN__", dataPathFn)
    content = content.replace("__SCORE_KEY__", scoreKey)
    content = content.replace("__REASON_TEXT__", reasonTextFn)
    content = content.replace("__EMPTY_TEXT__", emptyText)
    
    with open(os.path.join(pages_dir, filename), "w", encoding="utf-8") as f:
        f.write(content)

# 1. Direct Competitors
write_component(
    "DirectCompetitors.tsx",
    "Top 5 Direct Competitors",
    "Identify direct market competitors by category, subcategory, and price.",
    "direct-competitors",
    "const items = (results.direct_competitors || []).flatMap((r: any) => r.top_competitors || []);",
    "similarity_score",
    "This product is identified as a direct competitor due to matching taxonomy (category/subcategory) and pricing vector. It commands a high similarity score indicating a direct threat to market share.",
    "No direct competitors found."
)

# 2. Substitute Intelligence
write_component(
    "SubstituteIntelligence.tsx",
    "Top 5 Substitute Threats",
    "Identifies substitute products stealing demand from the target market.",
    "substitute-intelligence",
    "const items = results.substitute_products || [];",
    "similarity_score",
    "This product operates in a different but related category and fulfills the same underlying customer need. The high fuzzy keyword overlap suggests it can act as a substitute.",
    "No substitute threats found."
)

# 3. Complement Intelligence
write_component(
    "ComplementIntelligence.tsx",
    "Top 5 Complement Products",
    "Identifies complementary ecosystem products and cross-sell opportunities.",
    "complement-intelligence",
    "const items = results.complement_products || [];",
    "complement_strength",
    "This product frequently accompanies your market's main items. The high complement strength indicates strong potential for cross-selling and ecosystem synergy.",
    "No complement products found."
)

# 4. Bundle Opportunities
write_component(
    "BundleOpportunities.tsx",
    "Top 5 Bundle Opportunities",
    "Identifies high-potential bundle combinations using complement relationships.",
    "bundle-opportunities",
    "const items = results.bundle_opportunities || [];",
    "bundle_score",
    "This pairing demonstrates high demand overlap and complement strength. Bundling these items can increase average order value and capture adjacent market demand.",
    "No bundle opportunities found."
)

print("Updated 4 Product Intelligence files.")
