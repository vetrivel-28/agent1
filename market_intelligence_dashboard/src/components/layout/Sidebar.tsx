import { NavLink } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { 
  LayoutDashboard, 
  UploadCloud, 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Crosshair, 
  Search, 
  MousePointerClick, 
  FileText,
  Target,
  Users,
  TrendingDown,
  ShieldAlert,
  LinkIcon,
  PackagePlus,
  BarChart4,
  Landmark
} from 'lucide-react';

const navigation = [
  { name: 'Data Upload', href: '/upload', icon: UploadCloud },
  { name: 'Dashboard Overview', href: '/', icon: LayoutDashboard },
  { name: 'Demand Intelligence', href: '/demand-strength', icon: Activity },
  { name: 'Sales Momentum', href: '/sales-momentum', icon: TrendingUp },
  { name: 'Market Structure', href: '/market-structure', icon: BarChart4 },
  { name: 'Revenue Growth', href: '/revenue-momentum', icon: DollarSign },
  { name: 'BSR Efficiency', href: '/bsr-efficiency', icon: Crosshair },
  { name: 'Search Momentum', href: '/search-momentum', icon: Search },
  { name: 'Inbound Efficiency Index', href: '/search-intent-efficiency', icon: MousePointerClick },
  { name: 'White Space Opportunities', href: '/whitespace-opportunities', icon: Target },
  { name: 'Competitive Landscape', href: '/direct-competitors', icon: Users },
  { name: 'Substitute Analysis', href: '/substitute-intelligence', icon: ShieldAlert },
  { name: 'Complement Analysis', href: '/complement-intelligence', icon: LinkIcon },
  { name: 'Bundle Opportunity Insights', href: '/bundle-opportunities', icon: PackagePlus },
  { name: 'Price Intelligence', href: '/price-elasticity', icon: TrendingDown },
  { name: 'Finance Intelligence', href: '/finance-intelligence', icon: Landmark },
  { name: 'Market Report', href: '/market-report', icon: FileText },
];

export function Sidebar() {
  return (
    <div className="flex h-full w-64 flex-col border-r bg-card glass">
      <div className="flex h-16 shrink-0 items-center px-6">
        <h1 className="text-lg font-bold tracking-tight text-gradient-primary flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          ProfitStory
        </h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">EX</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Executive View</span>
            <span className="text-xs text-muted-foreground">Market Intelligence</span>
          </div>
        </div>
      </div>
    </div>
  );
}
