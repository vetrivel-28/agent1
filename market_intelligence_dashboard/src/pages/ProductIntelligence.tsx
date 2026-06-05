import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { 
  Users, ShieldAlert, Zap, Layers
} from 'lucide-react';
import DirectCompetitors from './DirectCompetitors';
import SubstituteIntelligence from './SubstituteIntelligence';
import ComplementIntelligence from './ComplementIntelligence';
import BundleOpportunities from './BundleOpportunities';
import { cn } from '../utils/cn';
import { PageHeader } from '../components/layout/PageHeader';
import { formatGenericLabel } from '../utils/formatters';


const tabs = [
  { id: 'competitors', label: 'Direct Products', icon: Users, component: DirectCompetitors },
  { id: 'substitutes', label: 'Substitute Products', icon: ShieldAlert, component: SubstituteIntelligence },
  { id: 'complements', label: 'Complement Products', icon: Zap, component: ComplementIntelligence },
  { id: 'bundles', label: 'Product Opportunities', icon: Layers, component: BundleOpportunities },
];

export default function ProductIntelligence() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || DirectCompetitors;

  return (
    <div className="pb-16 max-w-[1400px] mx-auto px-6">
      
      <PageHeader 
        badge="Ecosystem Intelligence"
        title="Product Intelligence"
        description="Complete ecosystem analysis: competitors, substitutes, complements, and bundle opportunities."
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border/50 pb-px">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors",
                isActive 
                  ? "border-primary text-primary" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="pt-6">
        <ActiveComponent />
      </div>

    </div>
  );
}
