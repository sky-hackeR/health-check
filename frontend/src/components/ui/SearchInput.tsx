'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
  shortcutHint?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search records, emails, companies...',
  className = '',
  onClear,
  shortcutHint,
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="w-4 h-4 text-goswift-grey-subtle absolute left-3 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-14 py-2 text-sm bg-white border border-goswift-grey-muted rounded-lg text-goswift-navy placeholder:text-goswift-grey-subtle/70 focus:outline-hidden focus:ring-2 focus:ring-goswift-primary/20 focus:border-goswift-primary transition-all"
      />
      <div className="absolute right-2.5 flex items-center gap-1.5">
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange('');
              onClear?.();
            }}
            className="p-1 rounded-md text-goswift-grey-subtle hover:text-goswift-navy hover:bg-goswift-grey-light transition-colors"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : shortcutHint ? (
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium text-goswift-grey-subtle bg-goswift-grey-light border border-goswift-grey-muted rounded">
            {shortcutHint}
          </kbd>
        ) : null}
      </div>
    </div>
  );
};
