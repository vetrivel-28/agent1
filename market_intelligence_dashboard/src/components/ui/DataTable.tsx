import React, { type ReactNode, useState, useMemo } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  header: ReactNode | string;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => ReactNode;
  className?: string;
  forceShow?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  title?: ReactNode | string;
  description?: ReactNode | string;
  keyExtractor?: (item: T, index: number) => string;
  emptyState?: ReactNode;
  pageSize?: number;
  onRowClick?: (item: T, index: number) => void;
  hideEmptyColumns?: boolean;
}

export function DataTable<T>({ 
  data, 
  columns, 
  title, 
  description, 
  keyExtractor = (item, index) => String(index),
  emptyState = <div className="text-center py-8 text-muted-foreground text-sm">No actionable data available.</div>,
  pageSize,
  onRowClick,
  hideEmptyColumns = true,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);

  // Dynamically filter out empty/dash-only columns
  const activeColumns = useMemo(() => {
    if (!hideEmptyColumns || data.length === 0) return columns;
    return columns.filter(col => {
      if (col.forceShow || !col.accessorKey) return true;
      let validCount = 0;
      for (const item of data) {
        const val = item[col.accessorKey];
        if (
          val !== undefined && 
          val !== null && 
          val !== '' && 
          val !== '-' && 
          val !== '—' && 
          val !== '0' && 
          val !== 0 && 
          val !== 'N/A'
        ) {
          validCount++;
        }
      }
      return validCount > 0;
    });
  }, [columns, data, hideEmptyColumns]);

  const totalPages = pageSize ? Math.ceil(data.length / pageSize) : 1;
  const startIndex = pageSize ? (currentPage - 1) * pageSize : 0;
  const endIndex = pageSize ? startIndex + pageSize : data.length;
  const currentData = pageSize ? data.slice(startIndex, endIndex) : data;

  return (
    <Card className="flex flex-col overflow-hidden border-border/50 bg-card shadow-sm">
      {(title || description) && (
        <div className="px-6 py-5 border-b border-border/50 bg-muted/10">
          {title && <h3 className="text-lg font-semibold tracking-tight">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              {activeColumns.map((col, i) => (
                <th key={i} className={`px-6 py-4 font-bold tracking-wider whitespace-nowrap ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {currentData.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length}>
                  {emptyState}
                </td>
              </tr>
            ) : (
              currentData.map((item, rowIndex) => (
                <tr 
                  key={keyExtractor(item, startIndex + rowIndex)} 
                  className={`hover:bg-muted/40 transition-colors duration-200 group${onRowClick ? ' cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(item, startIndex + rowIndex) : undefined}
                >
                  {activeColumns.map((col, colIndex) => (
                    <td key={colIndex} className={`px-6 py-3 whitespace-nowrap ${col.className || ''}`}>
                      {col.cell 
                        ? col.cell(item, rowIndex) 
                        : col.accessorKey 
                          ? (item[col.accessorKey] as ReactNode) 
                          : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageSize && totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border/50 bg-muted/10 text-sm">
          <p className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{startIndex + 1}</span> to <span className="font-medium text-foreground">{Math.min(endIndex, data.length)}</span> of <span className="font-medium text-foreground">{data.length}</span> entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <span className="text-muted-foreground px-2">Page {currentPage} of {totalPages}</span>
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
    </Card>
  );
}
