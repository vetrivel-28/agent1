import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import {
  LayoutDashboard,
  UploadCloud,
  Activity,
  DollarSign,
  Crosshair,
  MousePointerClick,
  FileText,
  Target,
  TrendingDown,
  BarChart4,
  Landmark,
  Package,
  ChevronRight,
  LineChart,
  Lightbulb,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

const topStandalone: NavItem[] = [
  { name: 'Data Upload', href: '/upload', icon: UploadCloud },
  { name: 'Dashboard Overview', href: '/overview', icon: LayoutDashboard },
];

const marketIntelligenceItems: NavItem[] = [
  { name: 'Demand Intelligence', href: '/demand-strength', icon: Activity },
  { name: 'Market Structure', href: '/market-structure', icon: BarChart4 },
  { name: 'Revenue Growth', href: '/revenue-momentum', icon: DollarSign },
  // { name: 'BSR Efficiency', href: '/bsr-efficiency', icon: Crosshair },
  { name: 'Inbound Efficiency Index', href: '/search-intent-efficiency', icon: MousePointerClick },
];

const opportunityIntelligenceItems: NavItem[] = [
  { name: 'White Space Opportunities', href: '/whitespace-opportunities', icon: Target },
  { name: 'Market Entry Intelligence', href: '/finance-intelligence', icon: Landmark },
];



const pricingIntelligenceItems: NavItem[] = [
  { name: 'Price Intelligence', href: '/price-elasticity', icon: TrendingDown },
];

const bottomStandalone: NavItem[] = [
  { name: 'Market Report', href: '/market-report', icon: FileText },
];

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            className={cn(
              'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
            )}
            aria-hidden="true"
          />
          {item.name}
        </>
      )}
    </NavLink>
  );
}

type NavGroupProps = {
  name: string;
  icon: LucideIcon;
  items: NavItem[];
};

function NavGroup({ name, icon: Icon, items }: NavGroupProps) {
  const location = useLocation();
  const onChildRoute = items.some(
    (item) => location.pathname === item.href || location.pathname.endsWith(item.href)
  );
  const [expanded, setExpanded] = useState(onChildRoute);

  useEffect(() => {
    if (onChildRoute) {
      setExpanded(true);
    }
  }, [onChildRoute]);

  return (
    <div className="space-y-1 pt-1">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className={cn(
          'w-full group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
          onChildRoute
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <ChevronRight
          className={cn(
            'mr-1 h-4 w-4 flex-shrink-0 transition-transform duration-200 ease-in-out',
            onChildRoute ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        />
        <Icon
          className={cn(
            'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
            onChildRoute ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
          )}
          aria-hidden="true"
        />
        <span className="truncate">{name}</span>
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-4 border-l border-border pl-2 space-y-1 pb-1 pt-0.5">
            {items.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center rounded-md py-2 pr-3 pl-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={cn(
                        'mr-3 h-4 w-4 flex-shrink-0 transition-colors',
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.name}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <div className="space-y-1">
          {topStandalone.map((item) => (
            <NavItemLink key={item.name} item={item} />
          ))}
        </div>
        
        <NavGroup name="Market Intelligence" icon={LineChart} items={marketIntelligenceItems} />
        <NavGroup name="Opportunity Intelligence" icon={Lightbulb} items={opportunityIntelligenceItems} />
        <NavItemLink item={{ name: 'Product Intelligence', href: '/product-intelligence', icon: Package }} />
        <NavGroup name="Pricing Intelligence" icon={Tags} items={pricingIntelligenceItems} />

        <div className="space-y-1 pt-2">
          {bottomStandalone.map((item) => (
            <NavItemLink key={item.name} item={item} />
          ))}
          <NavItemLink item={{ name: 'Consumer Adoption Simulator', href: '/consumer-adoption', icon: Users }} />
        </div>
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

