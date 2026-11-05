'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
}) => {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const iconConfig = {
    danger: {
      icon: AlertTriangle,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      btn: 'bg-rose-600 hover:bg-rose-700 text-white',
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      btn: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    primary: {
      icon: CheckCircle,
      color: 'text-goswift-primary',
      bg: 'bg-indigo-50',
      btn: 'bg-goswift-primary hover:bg-goswift-primary-hover text-white font-semibold shadow-xs',
    },
  }[variant];

  const Icon = iconConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-goswift-navy/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-goswift-grey-muted p-6 shadow-xl animate-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-goswift-grey-subtle hover:text-goswift-navy p-1 rounded-lg hover:bg-goswift-grey-light transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconConfig.bg} ${iconConfig.color}`}>
            <Icon className="w-6 h-6" />
          </div>

          <div className="flex-1 pr-4">
            <h3 className="text-lg font-bold text-goswift-navy mb-1.5">{title}</h3>
            <p className="text-sm text-goswift-grey-subtle leading-relaxed mb-6">{description}</p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-goswift-navy bg-white border border-goswift-grey-muted rounded-lg hover:bg-goswift-grey-light transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-2xs ${iconConfig.btn}`}
              >
                {isLoading ? 'Processing...' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
