import React from 'react';
import { Database, Search, Package, Users } from 'lucide-react';

interface EvidencePanelProps {
  keywords?: number;
  products?: number;
  brands?: number;
  topItems?: string[];
  type?: 'demand' | 'product' | 'brand';
}

export function EvidencePanel({ keywords, products, brands, topItems, type = 'demand' }: EvidencePanelProps) {
  return (
    <div className="bg-muted/30 border border-border/50 rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evidence Base</span>
      </div>
      
      <div className="grid grid-cols-3 gap-2 mb-4">
        {keywords !== undefined && (
          <div className="bg-background rounded-md p-2 flex flex-col items-center justify-center border border-border/40">
            <Search className="w-3 h-3 text-blue-500 mb-1" />
            <span className="text-sm font-black">{keywords.toLocaleString()}</span>
            <span className="text-[9px] uppercase text-muted-foreground">Keywords</span>
          </div>
        )}
        {products !== undefined && (
          <div className="bg-background rounded-md p-2 flex flex-col items-center justify-center border border-border/40">
            <Package className="w-3 h-3 text-emerald-500 mb-1" />
            <span className="text-sm font-black">{products.toLocaleString()}</span>
            <span className="text-[9px] uppercase text-muted-foreground">Products</span>
          </div>
        )}
        {brands !== undefined && (
          <div className="bg-background rounded-md p-2 flex flex-col items-center justify-center border border-border/40">
            <Users className="w-3 h-3 text-purple-500 mb-1" />
            <span className="text-sm font-black">{brands.toLocaleString()}</span>
            <span className="text-[9px] uppercase text-muted-foreground">Brands</span>
          </div>
        )}
      </div>

      {topItems && topItems.length > 0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">
            Top Supporting Evidence
          </span>
          <div className="flex flex-wrap gap-2">
            {topItems.map((item, i) => (
              <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded border border-primary/20 font-medium">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
