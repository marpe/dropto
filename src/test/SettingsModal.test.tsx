import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../components/SettingsModal';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { AppSettings } from '../types/transfer';

function renderSettings(settings: AppSettings = DEFAULT_SETTINGS) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const onThemeChange = vi.fn();
  render(
    <SettingsModal
      onClose={onClose}
      settings={settings}
      onSave={onSave}
      themePreference="system"
      onThemeChange={onThemeChange}
    />
  );
  const save = () => fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
  return { onSave, onClose, onThemeChange, save };
}

describe('SettingsModal relay servers', () => {
  it('saves a TURN relay server with its credentials', () => {
    const { onSave, save } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /add relay server/i }));
    fireEvent.change(screen.getByPlaceholderText('turn:relay.example.com:3478'), {
      target: { value: 'turn:relay.example.com:3478' },
    });
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 's3cret' } });
    save();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        customStunTurn: [{ urls: 'turn:relay.example.com:3478', username: 'alice', credential: 's3cret' }],
      })
    );
  });

  it('removes a relay server', () => {
    const { onSave, save } = renderSettings({ ...DEFAULT_SETTINGS, customStunTurn: [{ urls: 'stun:stun.example.com' }] });

    fireEvent.click(screen.getByRole('button', { name: /remove relay server/i }));
    save();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ customStunTurn: [] }));
  });

  it('ignores relay rows left blank', () => {
    const { onSave, save } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /add relay server/i }));
    save();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ customStunTurn: [] }));
  });

  it('refuses to save a relay URL without a stun:, turn: or turns: scheme', () => {
    const { onSave, save } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /add relay server/i }));
    fireEvent.change(screen.getByPlaceholderText('turn:relay.example.com:3478'), {
      target: { value: 'relay.example.com' },
    });
    save();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/must start with stun:, turn: or turns:/i)).toBeDefined();
  });

  it('closes as soon as the settings are saved', () => {
    const { onSave, onClose, save } = renderSettings();

    save();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('applies a theme choice straight away, without saving', () => {
    const { onThemeChange, onSave } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(onThemeChange).toHaveBeenCalledWith('dark');
    expect(onSave).not.toHaveBeenCalled();
  });
});
