import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkBar } from '../components/LinkBar';
import { createInitialSenderState } from '../hooks/senderState';
import { DEFAULT_SIMULTANEOUS } from '../utils/sharingLimits';
import type { SharingOptions } from '../types/sharing';

type LinkBarProps = ComponentProps<typeof LinkBar>;

const defaultOptions = (): SharingOptions => createInitialSenderState().options;

function renderLinkBar(overrides: Partial<LinkBarProps> = {}) {
  const props: LinkBarProps = {
    roomCode: 'DW-ABC234',
    shareUrl: 'https://example.test/?room=DW-ABC234#key=link-key',
    roomNotice: null,
    options: defaultOptions(),
    onUpdateSharing: vi.fn(),
    onStopSharing: vi.fn(),
    connectedCount: 0,
    ...overrides,
  };
  render(<LinkBar {...props} />);
  return props;
}

const openSettings = () => fireEvent.click(screen.getByTestId('open-link-settings'));

const withPin = (pin: string): SharingOptions => ({ ...defaultOptions(), pin });

describe('LinkBar', () => {
  it('puts the link where the Share button was, with Copy and a menu of the other tools joined to it', () => {
    renderLinkBar();

    expect(screen.getByTestId('link-bar')).toBeDefined();
    expect(screen.getByTitle('Copy link')).toBeDefined();
    expect(screen.getByTitle('Link options')).toBeDefined();
    const items = screen.getAllByRole('menuitem', { hidden: true }).map((item) => item.textContent);
    expect(items).toEqual(['Settings', 'QR code', 'Stop sharing']);
  });

  describe('sharing settings', () => {
    it('raises the number of simultaneous downloads from the default', () => {
      const { onUpdateSharing } = renderLinkBar();
      openSettings();
      expect(screen.getByRole('status', { name: /simultaneous downloads/i }).textContent).toBe(String(DEFAULT_SIMULTANEOUS));

      fireEvent.click(screen.getByTitle('More'));

      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ maxSimultaneous: DEFAULT_SIMULTANEOUS + 1 }), 'new');
    });

    it('suggests a random PIN as soon as one is required', () => {
      const { onUpdateSharing } = renderLinkBar();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: expect.stringMatching(/^\d{4}$/) }), 'new');
    });

    it('applies a typed PIN when the field is left or Enter is pressed, not on every keystroke', () => {
      const { onUpdateSharing } = renderLinkBar({ options: withPin('1234') });
      openSettings();
      const pinField = screen.getByTestId('pin-input');

      fireEvent.change(pinField, { target: { value: '56' } });
      expect(onUpdateSharing).not.toHaveBeenCalled();
      fireEvent.change(pinField, { target: { value: '5678' } });
      fireEvent.keyDown(pinField, { key: 'Enter' });

      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: '5678' }), 'new');
    });

    it('keeps the current PIN when the field is left empty', () => {
      const { onUpdateSharing } = renderLinkBar({ options: withPin('1234') });
      openSettings();
      const pinField = screen.getByTestId('pin-input') as HTMLInputElement;

      fireEvent.change(pinField, { target: { value: '' } });
      fireEvent.blur(pinField);

      expect(onUpdateSharing).not.toHaveBeenCalled();
      expect(pinField.value).toBe('1234');
    });

    it('shows the PIN in the settings so it can be passed on', () => {
      renderLinkBar({ options: withPin('2468') });
      openSettings();

      expect((screen.getByTestId('pin-input') as HTMLInputElement).value).toBe('2468');
    });

    it('asks whether a lower download limit should stop everyone now', () => {
      const { onUpdateSharing } = renderLinkBar({ options: { ...defaultOptions(), maxSimultaneous: 2 }, connectedCount: 2 });
      openSettings();
      fireEvent.click(screen.getByTitle('Fewer'));

      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ maxSimultaneous: 1 }), 'new');
      expect(screen.getByRole('heading', { name: 'Stop current downloads?' })).toBeDefined();
      expect(screen.getByText(/2 people are still connected/i)).toBeDefined();
    });
  });

  describe('changing how files are shared after the link is out', () => {
    const renderWithSomeoneConnected = (overrides: Partial<LinkBarProps> = {}) => renderLinkBar({ connectedCount: 1, ...overrides });

    it('applies a change at once when nobody is connected', () => {
      const { onUpdateSharing } = renderLinkBar();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));

      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ requireApproval: true }), 'new');
    });

    it('applies a stricter setting to new connections, then asks whether to stop the current download', () => {
      const { onUpdateSharing } = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: expect.stringMatching(/^\d{4}$/) }), 'new');
      expect(screen.getByRole('heading', { name: 'Stop current downloads?' })).toBeDefined();
      expect(screen.getByText(/new connections need a pin\. someone is still connected/i)).toBeDefined();
    });

    it('stops the current download too when asked', () => {
      const { onUpdateSharing } = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));
      fireEvent.click(screen.getByTestId('confirm'));

      expect(onUpdateSharing).toHaveBeenLastCalledWith(expect.objectContaining({ requireApproval: true }), 'now');
    });

    it('lets the current download go on when the question is dismissed', () => {
      const { onUpdateSharing } = renderWithSomeoneConnected();

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require connection approval/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onUpdateSharing).toHaveBeenCalledTimes(1);
      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ requireApproval: true }), 'new');
      expect(screen.queryByRole('heading', { name: 'Stop current downloads?' })).toBeNull();
    });

    it('applies without asking when the change only loosens things', () => {
      const { onUpdateSharing } = renderWithSomeoneConnected({ options: withPin('1234') });

      openSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: /require a pin/i }));

      expect(onUpdateSharing).toHaveBeenCalledWith(expect.objectContaining({ pin: '' }), 'new');
      expect(screen.queryByTestId('confirm')).toBeNull();
    });
  });

  describe('stopping the share', () => {
    it('stops straight away when nobody is connected', () => {
      const { onStopSharing } = renderLinkBar();

      fireEvent.click(screen.getByTestId('stop-sharing'));

      expect(onStopSharing).toHaveBeenCalledTimes(1);
    });

    it('asks first when it would stop someone’s download', () => {
      const { onStopSharing } = renderLinkBar({ connectedCount: 1 });

      fireEvent.click(screen.getByTestId('stop-sharing'));
      expect(onStopSharing).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm'));

      expect(onStopSharing).toHaveBeenCalledTimes(1);
    });
  });
});
