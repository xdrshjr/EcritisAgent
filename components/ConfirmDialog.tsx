/**
 * ConfirmDialog Component
 * Generic, accessible confirmation dialog with Tailwind styling.
 * Used for destructive actions like deleting conversations.
 */

'use client';

import { X, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  };

  const confirmButtonClasses = isDestructive
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive'
    : 'bg-primary text-primary-foreground hover:bg-primary/90 border-border';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-[360px] max-w-[90%]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/60">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`w-4 h-4 ${
                isDestructive ? 'text-destructive' : 'text-yellow-500'
              }`}
            />
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
            aria-label={cancelLabel}
            tabIndex={0}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-border bg-muted/40 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
            aria-label={cancelLabel}
            tabIndex={0}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border shadow-sm transition-all ${confirmButtonClasses}`}
            aria-label={confirmLabel}
            tabIndex={0}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;








