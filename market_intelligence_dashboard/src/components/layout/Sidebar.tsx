import { NavLink } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { 
  LayoutDashboard, 
  UploadCloud, 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Crosshair, 
  Zap, 
  Search, 
  MousePointerClick, 
  PieChart, 
  FileText,
  Target,
  Users,
  TrendingDown,
  ShieldAlert,
  LinkIcon,
  PackagePlus
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard Overview', href: '/', icon: LayoutDashboard },
  { name: 'Dataset Upload', href: '/upload', icon: UploadCloud },
  { name: 'Demand Intelligence', href: '/demand-strength', icon: Activity },
  { name: 'Sales Momentum', href: '/sales-momentum', icon: TrendingUp },
  { name: 'Revenue Momentum', href: '/revenue-momentum', icon: DollarSign },
  { name: 'BSR Efficiency', href: '/bsr-efficiency', icon: Crosshair },
  { name: 'Demand Velocity', href: '/demand-velocity', icon: Zap },
  { name: 'Search Intelligence', href: '/search-momentum', icon: Search },
  { name: 'Intent Efficiency', href: '/search-intent-efficiency', icon: MousePointerClick },
  { name: 'Market Structure', href: '/market-concentration', icon: PieChart },
  { name: 'Whitespace Opportunities', href: '/whitespace-opportunities', icon: Target },
  { name: 'Direct Competitors', href: '/direct-competitors', icon: Users },
  { name: 'Price Elasticity', href: '/price-elasticity', icon: TrendingDown },
  { name: 'Substitute Intelligence', href: '/substitute-intelligence', icon: ShieldAlert },
  { name: 'Complement Intelligence', href: '/complement-intelligence', icon: LinkIcon },
  { name: 'Bundle Opportunities', href: '/bundle-opportunities', icon: PackagePlus },
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
