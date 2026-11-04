'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';

export type DateRangeOption =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_quarter'
  | 'year_to_date'
  | 'all_time';

export interface DateRangeFilterProps {
  value: DateRangeOption;
  onChange: (value: DateRangeOption) => void;
  className?: string;
}

const options: { id: DateRangeOption; label: string; period: string }[] = [
  { id: 'today', label: 'Today', period: 'Last 24 hours' },
  { id: 'last_7_days', label: 'Last 7 Days', period: 'Previous 7 days' },
  { id: 'last_30_days', label: 'Last 30 Days', period: 'Standard monthly view' },
  { id: 'this_quarter', label: 'This Quarter', period: 'Current financial Q' },
  { id: 'year_to_date', label: 'Year to Date', period: 'Jan 1 to today' },
  { id: 'all_time', label: 'All Time', period: 'Full historical archive' },
];

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((opt) => opt.id === value) || options[2];

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-goswift-grey-muted rounded-lg text-goswift-navy hover:bg-goswift-grey-light hover:border-slate-300 transition-colors shadow-2xs"
      >
        <Calendar className="w-4 h-4 text-goswift-primary" />
        <span>{selected.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-goswift-grey-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 origin-top-right rounded-xl bg-white border border-goswift-grey-muted shadow-lg ring-1 ring-black/5 focus:outline-hidden py-1 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-goswift-grey-muted/60 text-xs font-semibold text-goswift-grey-subtle uppercase tracking-wider">
            Select Date Range
          </div>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between hover:bg-goswift-grey-light transition-colors ${
                value === option.id ? 'bg-indigo-50/70 font-semibold text-goswift-primary' : 'text-goswift-navy'
              }`}
            >
              <div>
                <p className="text-sm">{option.label}</p>
                <p className="text-[11px] text-goswift-grey-subtle font-normal">{option.period}</p>
              </div>
              {value === option.id && <Check className="w-4 h-4 text-goswift-primary shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
