'use client';

import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnKey: string) => void;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching your criteria at this time.',
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-goswift-grey-muted p-6">
        <LoadingSkeleton count={5} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-goswift-grey-muted p-8">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-goswift-grey-muted shadow-xs overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-goswift-grey-light/80 border-b border-goswift-grey-muted text-xs font-semibold text-goswift-grey-subtle uppercase tracking-wider">
              {columns.map((column) => {
                const isSorted = sortColumn === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-5 py-3.5 ${column.sortable ? 'cursor-pointer select-none hover:text-goswift-navy transition-colors' : ''} ${
                      column.className || ''
                    }`}
                    onClick={() => column.sortable && onSort?.(column.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{column.header}</span>
                      {column.sortable && (
                        <span className="text-goswift-grey-subtle/70">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-goswift-primary" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-goswift-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-goswift-grey-muted/60 text-goswift-navy">
            {data.map((item, index) => {
              const key = keyExtractor(item);
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(item)}
                  className={`group transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-indigo-50/30' : 'hover:bg-goswift-grey-light/50'
                  }`}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`px-5 py-3.5 ${column.className || ''}`}>
                      {column.render
                        ? column.render(item, index)
                        : // @ts-expect-error fallback property access
                          (item[column.key] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
