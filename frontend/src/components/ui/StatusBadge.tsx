import React from 'react';

export type StatusType =
  | 'NEW'
  | 'QUALIFIED'
  | 'CONTACTED'
  | 'FOLLOW_UP'
  | 'WALKTHROUGH_SCHEDULED'
  | 'DISQUALIFIED'
  | 'LOST'
  | 'ARCHIVED'
  | 'UNQUALIFIED'
  | 'CONVERTED'
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'ABANDONED'
  | 'HOT'
  | 'WARM'
  | 'COLD'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUCCESS'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'NOT_CONFIGURED'
  | 'NOT_IMPLEMENTED'
  | 'PENDING'
  | 'FAILED'
  | string;

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md';
}

const statusStyles: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  QUALIFIED: { bg: 'bg-purple-50', text: 'text-purple-800', dot: 'bg-purple-600', border: 'border-purple-300' },
  CONVERTED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  SUCCESS: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  CONNECTED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  DISCONNECTED: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', border: 'border-rose-200' },
  NOT_CONFIGURED: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' },
  NOT_IMPLEMENTED: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' },
  ACTIVE: { bg: 'bg-indigo-50', text: 'text-goswift-primary', dot: 'bg-goswift-primary', border: 'border-indigo-200' },
  HOT: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', border: 'border-rose-200' },
  WARM: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  COLD: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' },
  NEW: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  CONTACTED: { bg: 'bg-cyan-50', text: 'text-cyan-800', dot: 'bg-cyan-600', border: 'border-cyan-300' },
  FOLLOW_UP: { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-600', border: 'border-amber-300' },
  WALKTHROUGH_SCHEDULED: { bg: 'bg-indigo-50', text: 'text-indigo-800', dot: 'bg-indigo-600', border: 'border-indigo-300' },
  DISQUALIFIED: { bg: 'bg-rose-50', text: 'text-rose-800', dot: 'bg-rose-600', border: 'border-rose-300' },
  LOST: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500', border: 'border-slate-300' },
  ARCHIVED: { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-500', border: 'border-neutral-300' },
  IN_PROGRESS: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500', border: 'border-sky-200' },
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  ABANDONED: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', border: 'border-rose-200' },
  EXPIRED: { bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-500', border: 'border-orange-200' },
  FAILED: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', border: 'border-rose-200' },
  UNQUALIFIED: { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-400', border: 'border-zinc-200' },
  INACTIVE: { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-400', border: 'border-zinc-200' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, size = 'sm' }) => {
  const normalizedKey = status.toUpperCase();
  const config = statusStyles[normalizedKey] || {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    dot: 'bg-gray-400',
    border: 'border-gray-200',
  };

  const displayText = label || status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bg} ${config.text} ${config.border} ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span className="capitalize">{displayText.toLowerCase()}</span>
    </span>
  );
};
