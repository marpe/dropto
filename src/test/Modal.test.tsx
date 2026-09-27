import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../components/ui/Modal';

function pressEscape(dialog: HTMLElement) {
  // Browsers turn Escape (and light dismiss) into a cancelable `cancel` event on the dialog
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
}

describe('Modal', () => {
  it('shows a header with the title, the body and a footer', () => {
    render(
      <Modal title="Settings" footer={<button type="button">Save</button>} onClose={() => {}}>
        Body
      </Modal>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(screen.getByText('Body')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });

  it('closes from the close button, Escape, or a click outside', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Share" onClose={onClose}>
        Body
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { hidden: true });

    fireEvent.click(screen.getByTitle('Close'));
    pressEscape(dialog);
    fireEvent.click(dialog);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('ignores clicks inside the dialog', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Share" onClose={onClose}>
        <p>Body</p>
      </Modal>
    );

    fireEvent.click(screen.getByText('Body'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps unsaved changes: no closing by Escape or clicking outside, only explicitly', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Settings" onClose={onClose} isDirty>
        Body
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { hidden: true });

    pressEscape(dialog);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no way out when the dialog requires a choice', () => {
    render(<Modal title="Decide">Body</Modal>);
    const dialog = screen.getByRole('dialog', { hidden: true });

    pressEscape(dialog);

    expect(screen.queryByTitle('Close')).toBeNull();
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
