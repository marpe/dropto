import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { cn } from '../../utils/cn';

type ModalSize = 'sm' | 'md';

interface ModalProps {
  children: React.ReactNode;
  /** Adds a close button and Escape to dismiss; omit it when the dialog requires an explicit choice */
  onClose?: () => void;
  size?: ModalSize;
  className?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
};

export const Modal: React.FC<ModalProps> = ({ children, onClose, size = 'sm', className }) => {
  useEffect(() => {
    if (!onClose) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div
        className={cn(
          'relative w-full max-h-[90vh] overflow-y-auto overscroll-contain rounded-2xl bg-surface-1 p-6 shadow-2xl border border-border-2',
          sizeClasses[size],
          className
        )}
      >
        {onClose && (
          <IconButton title="Close" size="sm" onClick={onClose} className="absolute right-4 top-4">
            <X className="w-5 h-5" />
          </IconButton>
        )}
        {children}
      </div>
    </div>
  );
};
