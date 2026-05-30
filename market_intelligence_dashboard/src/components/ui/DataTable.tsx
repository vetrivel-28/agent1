import React, { ReactNode, useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  header: ReactNode | string;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  title?: ReactNode | string;
  description?: ReactNode | string;
  keyExtractor?: (item: T, index: number) => string;
  emptyState?: ReactNode;
  pageSize?: number;
}

export function DataTable<T>({ 
  data, 
  columns, 
  title, 
  description, 
  keyExtractor = (item, index) => String(index),
  emptyState = <div className="text-center py-8 text-muted-foreground text-sm">No data available</div>,
  pageSize
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = pageSize ? Math.ceil(data.length / pageSize) : 1;
  const startIndex = pageSize ? (currentPage - 1) * pageSize : 0;
  const endIndex = pageSize ? startIndex + pageSize : data.length;
  const currentData = pageSize ? data.slice(startIndex, endIndex) : data;

  return (
    <Card className="flex flex-col overflow-hidden border-border/50 bg-card/50 glass-card">
      {(title || description) && (
        <div className="px-6 py-5 border-b border-border/50 bg-background/50">
          {title && <h3 className="text-lg font-semibold tracking-tight">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className={`px-6 py-4 font-medium tracking-wider whitespace-nowrap ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {currentData.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {emptyState}
                </td>
              </tr>
            ) : (
              currentData.map((item, rowIndex) => (
                <tr 
                  key={keyExtractor(item, startIndex + rowIndex)} 
                  className="hover:bg-muted/30 transition-colors duration-150 group"
                >
                  {columns.map((col, colIndex) => (
                    <td key={colIndex} className={`px-6 py-4 whitespace-nowrap ${col.className || ''}`}>
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
        <div className="flex items-center justify-between px-6 py-3 border-t border-border/50 bg-background/50 text-sm">
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
