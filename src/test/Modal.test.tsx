import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../components/ui/Modal';
import { useCloseModal } from '../components/ui/closeModal';

function pressEscape(dialog: HTMLElement) {
  // Browsers turn Escape (and light dismiss) into a cancelable `cancel` event on the dialog
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
}

/** jsdom has no Web Animations: pretend close() started an exit transition that settles with `finished` */
function stubExitAnimation(finished: Promise<unknown>) {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [{ finished }],
  });
}

describe('Modal', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations');
    vi.useRealTimers();
  });

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

  it('lets the exit animation play before telling the parent it closed', async () => {
    let endAnimation = () => {};
    const finished = new Promise<void>((resolve) => {
      endAnimation = resolve;
    });
    stubExitAnimation(finished);
    const onClose = vi.fn();
    render(
      <Modal title="Share" onClose={onClose}>
        Body
      </Modal>
    );

    fireEvent.click(screen.getByTitle('Close'));
    fireEvent.click(screen.getByTitle('Close'));
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    endAnimation();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('still closes when the exit animation never reports back', () => {
    vi.useFakeTimers();
    stubExitAnimation(new Promise(() => {}));
    const onClose = vi.fn();
    render(
      <Modal title="Share" onClose={onClose}>
        Body
      </Modal>
    );

    pressEscape(screen.getByRole('dialog', { hidden: true }));
    vi.advanceTimersByTime(1000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs a footer action after closing, instead of onClose', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const StopButton = () => {
      const close = useCloseModal();
      return (
        <button type="button" onClick={() => close(onConfirm)}>
          Stop
        </button>
      );
    };
    render(
      <Modal title="Stop?" onClose={onClose} footer={<StopButton />}>
        Body
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stop', hidden: true }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers no way out when the dialog requires a choice', () => {
    render(<Modal title="Decide">Body</Modal>);
    const dialog = screen.getByRole('dialog', { hidden: true });

    pressEscape(dialog);

    expect(screen.queryByTitle('Close')).toBeNull();
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
