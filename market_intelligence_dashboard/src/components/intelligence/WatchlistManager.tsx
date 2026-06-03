import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookmarkPlus, Bookmark, Trash2, Tag, Users, Package } from 'lucide-react';
import { Button } from '../ui/Button';

export interface WatchlistItem {
  id: string;
  type: 'keyword' | 'brand' | 'segment';
  name: string;
  addedAt: number;
}

const WATCHLIST_KEY = 'mi_executive_watchlist';

export function WatchlistManager() {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {}
  }, []);

  const saveItems = (newItems: WatchlistItem[]) => {
    setItems(newItems);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newItems));
  };

  const removeItem = (id: string) => {
    saveItems(items.filter(item => item.id !== id));
  };

  const getIcon = (type: string) => {
    if (type === 'keyword') return <Tag className="w-3 h-3" />;
    if (type === 'brand') return <Users className="w-3 h-3" />;
    return <Package className="w-3 h-3" />;
  };

  if (items.length === 0) return null;

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden mt-6">
      <div className="bg-muted/10 border-b border-border/30 px-4 py-3 flex items-center gap-2">
        <Bookmark className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Tracked Opportunities</h3>
      </div>
      <div className="p-2 flex flex-wrap gap-2">
        {items.map(item => (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            key={item.id} 
            className="flex items-center gap-2 bg-background border border-border/60 px-3 py-1.5 rounded-md text-xs font-medium group hover:border-primary/40 transition-colors"
          >
            <span className="text-muted-foreground">{getIcon(item.type)}</span>
            <span>{item.name}</span>
            <button 
              onClick={() => removeItem(item.id)}
              className="ml-1 text-muted-foreground/50 hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Helper hook for adding items from anywhere
export function useWatchlist() {
  const addItem = (type: 'keyword' | 'brand' | 'segment', name: string) => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      const items: WatchlistItem[] = stored ? JSON.parse(stored) : [];
      if (!items.find(i => i.name === name && i.type === type)) {
        const newItems = [...items, { id: Date.now().toString(), type, name, addedAt: Date.now() }];
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newItems));
        // Dispatch custom event to trigger re-render in the manager
        window.dispatchEvent(new Event('watchlist_updated'));
      }
    } catch {}
  };
  return { addItem };
}

export function WatchlistAddButton({ type, name, className = "" }: { type: 'keyword' | 'brand' | 'segment', name: string, className?: string }) {
  const { addItem } = useWatchlist();
  const [added, setAdded] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(type, name);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleAdd}
      className={`h-7 text-[10px] px-2 gap-1 ${added ? 'bg-success/10 text-success border-success/30' : 'text-muted-foreground'} ${className}`}
    >
      {added ? <Bookmark className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
      {added ? 'Tracked' : 'Track'}
    </Button>
  );
}
