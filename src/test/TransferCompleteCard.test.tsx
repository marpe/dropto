import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransferCompleteCard } from '../components/TransferCompleteCard';
import { fireCelebration } from '../services/confetti';

// canvas-confetti needs a real canvas; only whether it fires matters here
vi.mock('../services/confetti', () => ({
  fireCelebration: vi.fn(),
}));

describe('TransferCompleteCard', () => {
  beforeEach(() => {
    vi.mocked(fireCelebration).mockClear();
  });

  it('celebrates when every file passed verification', () => {
    render(
      <TransferCompleteCard
        successTitle="Transfer Complete!"
        successDescription="All files verified."
        actionLabel="Send More Files"
        onAction={() => {}}
        corruptedFiles={[]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Transfer Complete!' })).toBeDefined();
    expect(fireCelebration).toHaveBeenCalledTimes(1);
  });

  it('lists corrupted files and does not celebrate when verification failed', () => {
    const onAction = vi.fn();
    render(
      <TransferCompleteCard
        successTitle="Transfer Complete!"
        successDescription="All files verified."
        actionLabel="Send More Files"
        onAction={onAction}
        corruptedFiles={['album/a.bin', 'b.bin']}
      />
    );

    expect(screen.queryByRole('heading', { name: 'Transfer Complete!' })).toBeNull();
    expect(screen.queryByText('All files verified.')).toBeNull();
    expect(screen.getByText('album/a.bin')).toBeDefined();
    expect(screen.getByText('b.bin')).toBeDefined();
    expect(fireCelebration).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send More Files' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
