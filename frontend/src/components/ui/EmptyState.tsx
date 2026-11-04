import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items found',
  description = 'There are no records to display matching your current view or query.',
  icon: Icon = Inbox,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-goswift-grey-light border border-goswift-grey-muted flex items-center justify-center text-goswift-grey-subtle mb-4 shadow-2xs">
        <Icon className="w-6 h-6 text-goswift-primary" />
      </div>
      <h3 className="text-base font-semibold text-goswift-navy mb-1">{title}</h3>
      <p className="text-sm text-goswift-grey-subtle max-w-sm mb-5">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
