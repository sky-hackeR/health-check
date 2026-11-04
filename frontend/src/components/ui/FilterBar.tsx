'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SearchInput } from './SearchInput';

export interface FilterTabOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  tabs?: FilterTabOption[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children?: React.ReactNode;
  onResetFilters?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filter records...',
  tabs,
  activeTab,
  onTabChange,
  children,
  onResetFilters,
  hasActiveFilters,
  className = '',
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-goswift-grey-muted pb-px scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-goswift-primary text-goswift-primary font-semibold'
                    : 'border-transparent text-goswift-grey-subtle hover:text-goswift-navy hover:border-slate-300'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-indigo-50 text-goswift-primary'
                        : 'bg-goswift-grey-light text-goswift-grey-subtle'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {onSearchChange && typeof searchValue === 'string' && (
          <div className="w-full sm:w-80">
            <SearchInput
              value={searchValue}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {children}

          {hasActiveFilters && onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-goswift-grey-subtle hover:text-rose-600 bg-white border border-dashed border-goswift-grey-muted rounded-lg hover:border-rose-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
