import React from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** `danger` for actions that interrupt or discard something */
  tone?: 'primary' | 'danger';
}

/** An in-app "are you sure" (never window.confirm): Back dismisses, the confirm button acts. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  tone = 'primary',
}) => (
  <Modal
    title={title}
    onClose={onCancel}
    footer={
      <>
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button data-testid="confirm" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="text-sm text-text-3 space-y-2">{children}</div>
  </Modal>
);
