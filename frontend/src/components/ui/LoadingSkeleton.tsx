import React from 'react';

export interface LoadingSkeletonProps {
  count?: number;
  type?: 'table' | 'card' | 'text';
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  count = 3,
  type = 'table',
  className = '',
}) => {
  const items = Array.from({ length: count });

  if (type === 'card') {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {items.map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-goswift-grey-muted p-5 animate-pulse space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 bg-slate-200 rounded w-24" />
              <div className="w-8 h-8 rounded-lg bg-slate-200" />
            </div>
            <div className="h-7 bg-slate-200 rounded w-16" />
            <div className="h-3 bg-slate-100 rounded w-32" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((_, i) => (
        <div
          key={i}
          className="h-10 bg-slate-100 rounded-lg animate-pulse w-full border border-slate-200/40"
        />
      ))}
    </div>
  );
};
