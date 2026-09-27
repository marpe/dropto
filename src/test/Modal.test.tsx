import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../components/ui/Modal';

describe('Modal', () => {
  it('closes with the close button or Escape when dismissable', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}>Body</Modal>);

    fireEvent.click(screen.getByTitle('Close'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('offers no way out when the dialog requires a choice', () => {
    render(<Modal>Decide</Modal>);

    expect(screen.queryByTitle('Close')).toBeNull();
  });
});
