import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { 
  Users, ShieldAlert, LinkIcon, PackagePlus, ArrowRight
} from 'lucide-react';
import DirectCompetitors from './DirectCompetitors';
import SubstituteIntelligence from './SubstituteIntelligence';
import ComplementIntelligence from './ComplementIntelligence';
import BundleOpportunities from './BundleOpportunities';
import { cn } from '../utils/cn';

const tabs = [
  { id: 'competitors', label: 'Direct Competitors', icon: Users, component: DirectCompetitors },
  { id: 'substitutes', label: 'Substitute Threats', icon: ShieldAlert, component: SubstituteIntelligence },
  { id: 'complements', label: 'Complement Products', icon: LinkIcon, component: ComplementIntelligence },
  { id: 'bundles', label: 'Bundle Opportunities', icon: PackagePlus, component: BundleOpportunities },
];

export default function ProductIntelligence() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || DirectCompetitors;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Product Intelligence</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
            Complete ecosystem analysis: competitors, substitutes, complements, and bundle opportunities.
          </p>
        </div>
      </div>

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
      <div className="pt-2">
        <ActiveComponent />
      </div>

    </motion.div>
  );
}
