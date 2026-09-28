import React from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { useCloseModal } from './closeModal';

type ConfirmActionsProps = Pick<ConfirmDialogProps, 'confirmLabel' | 'onConfirm' | 'tone'>;

/** Both actions let the dialog animate out first; Cancel then runs the Modal's onClose (onCancel) */
const ConfirmActions: React.FC<ConfirmActionsProps> = ({ confirmLabel, onConfirm, tone }) => {
  const close = useCloseModal();
  return (
    <>
      <Button variant="ghost" onClick={() => close()}>
        Cancel
      </Button>
      <Button data-testid="confirm" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(onConfirm)}>
        {confirmLabel}
      </Button>
    </>
  );
};

interface ConfirmDialogProps {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** `danger` for actions that interrupt or discard something */
  tone?: 'primary' | 'danger';
}

/**
 * An in-app confirmation (never window.confirm), per Material: a short question as the title, and two
 * actions, Cancel and a verb that names what happens.
 */
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
    footer={<ConfirmActions confirmLabel={confirmLabel} onConfirm={onConfirm} tone={tone} />}
  >
    <div className="text-sm text-text-3 space-y-2">{children}</div>
  </Modal>
);
