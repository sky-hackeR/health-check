import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  timeframe?: string;
  icon: LucideIcon;
  iconBgColor?: string;
  iconTextColor?: string;
  badgeText?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  trend = 'neutral',
  timeframe = 'vs. last month',
  icon: Icon,
  iconBgColor = 'bg-indigo-50',
  iconTextColor = 'text-goswift-primary',
  badgeText,
}) => {
  return (
    <div className="bg-white rounded-xl border border-goswift-grey-muted p-5 shadow-xs hover:shadow-sm transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-goswift-grey-subtle truncate">{title}</span>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBgColor} ${iconTextColor}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl sm:text-3xl font-bold text-goswift-navy tracking-tight">{value}</div>
        {badgeText && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-goswift-grey-light text-goswift-grey-subtle border border-goswift-grey-muted">
            {badgeText}
          </span>
        )}
      </div>

      {change && (
        <div className="flex items-center gap-1.5 mt-3 text-xs">
          <span
            className={`inline-flex items-center gap-0.5 font-semibold ${
              trend === 'up'
                ? 'text-emerald-600'
                : trend === 'down'
                ? 'text-rose-600'
                : 'text-goswift-grey-subtle'
            }`}
          >
            {trend === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
            {trend === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
            {trend === 'neutral' && <Minus className="w-3.5 h-3.5" />}
            {change}
          </span>
          <span className="text-goswift-grey-subtle">{timeframe}</span>
        </div>
      )}
    </div>
  );
};
