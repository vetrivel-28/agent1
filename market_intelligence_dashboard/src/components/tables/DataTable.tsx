import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

export interface Column<T> {
  header: string;
  accessorKey: keyof T | string;
  cell?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  searchable?: boolean;
  rowClassName?: (row: T, index: number) => string;
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
}

export function DataTable<T>({ columns, data, pageSize = 10, searchable = true, rowClassName, rowKey, onRowClick }: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Sorting
  const sortedData = React.useMemo(() => {
    const sortableItems = [...data];
    if (sortConfig !== null) {
      sortableItems.sort((a: any, b: any) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        // Stable deterministic tie-breaker using serialized row snapshot.
        const aTie = JSON.stringify(a);
        const bTie = JSON.stringify(b);
        return aTie.localeCompare(bTie);
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  // Filtering
  const filteredData = React.useMemo(() => {
    if (!searchTerm) return sortedData;
    const lowercasedSearch = searchTerm.toLowerCase();
    
    return sortedData.filter((item: any) => {
      return Object.values(item).some(val => 
        String(val).toLowerCase().includes(lowercasedSearch)
      );
    });
  }, [sortedData, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = filteredData.slice(startIndex, startIndex + pageSize);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="relative max-w-sm">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="w-4 h-4 text-muted-foreground" />
          </div>
          <Input
            type="text"
            className="pl-9"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                {columns.map((col, i) => (
                  <th 
                    key={i} 
                    className={cn(
                      "px-4 py-3 font-medium", 
                      col.sortable !== false ? "cursor-pointer hover:bg-muted" : ""
                    )}
                    onClick={() => col.sortable !== false && requestSort(col.accessorKey as string)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable !== false && (
                        <div className="flex flex-col">
                          <ChevronUp className={cn("w-3 h-3 -mb-1", sortConfig?.key === col.accessorKey && sortConfig.direction === 'asc' ? "text-primary" : "text-muted-foreground/30")} />
                          <ChevronDown className={cn("w-3 h-3", sortConfig?.key === col.accessorKey && sortConfig.direction === 'desc' ? "text-primary" : "text-muted-foreground/30")} />
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.length > 0 ? (
                paginatedData.map((row, i) => (
                  <tr
                    key={rowKey ? rowKey(row, i) : String(i)}
                    className={cn(
                      "border-b last:border-b-0 hover:bg-muted/50 transition-colors",
                      onRowClick ? "cursor-pointer" : "",
                      rowClassName ? rowClassName(row, i) : ""
                    )}
                    onClick={() => onRowClick?.(row, i)}
                  >
                    {columns.map((col, j) => (
                      <td key={j} className="px-4 py-3">
                        {col.cell ? col.cell(row) : String((row as any)[col.accessorKey] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                    No data found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(startIndex + pageSize, filteredData.length)} of {filteredData.length} entries
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <span className="text-sm font-medium px-2">Page {currentPage} of {totalPages}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
