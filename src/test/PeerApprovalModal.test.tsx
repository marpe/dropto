import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeerApprovalModal } from '../components/PeerApprovalModal';

function renderModal(fileCount: number) {
  const onApprove = vi.fn();
  const onSelectFiles = vi.fn();
  render(
    <PeerApprovalModal
      peerId="receiver-1"
      fileCount={fileCount}
      totalBytes={fileCount * 1024}
      onApprove={onApprove}
      onReject={() => {}}
      onSelectFiles={onSelectFiles}
    />
  );
  return { onApprove, onSelectFiles };
}

describe('PeerApprovalModal', () => {
  it('asks the sender to add files before a receiver can be accepted', () => {
    const { onApprove } = renderModal(0);

    const accept = screen.getByRole('button', { name: /accept/i });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/nothing is queued/i)).toBeDefined();

    fireEvent.click(accept);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('lets the sender pick files without leaving the request', () => {
    const { onSelectFiles } = renderModal(0);

    fireEvent.click(screen.getByTestId('add-files'));

    expect(onSelectFiles).toHaveBeenCalledTimes(1);
  });

  it('lets the sender accept once files are queued', () => {
    const { onApprove } = renderModal(2);

    fireEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/add files/i)).toBeNull();
  });
});
