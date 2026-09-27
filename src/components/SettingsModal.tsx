import React, { useState } from 'react';
import { Server, Volume2, Plus, Radio, Palette, Monitor, Sun, Moon, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { TextInput } from './ui/TextInput';
import { SegmentedControl } from './ui/SegmentedControl';
import type { SegmentOption } from './ui/SegmentedControl';
import { AboutInfo } from './AboutInfo';
import type { ThemePreference } from '../hooks/useTheme';
import type { AppSettings, IceServerConfig } from '../types/transfer';
import { IceServerRow } from './IceServerRow';

interface SettingsModalProps {
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  themePreference: ThemePreference;
  /** Applied immediately (not part of the saved draft) so the choice can be previewed */
  onThemeChange: (preference: ThemePreference) => void;
}

const THEME_OPTIONS: SegmentOption<ThemePreference>[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const RELAY_URL = /^(stun|turns?):\S+$/i;

function relayUrl(server: IceServerConfig): string {
  return (Array.isArray(server.urls) ? server.urls.join(',') : server.urls).trim();
}

function relayError(server: IceServerConfig): string | null {
  const url = relayUrl(server);
  return url && !RELAY_URL.test(url) ? 'Must start with stun:, turn: or turns:' : null;
}

/** Drops blank rows and empty credentials so they are not passed to RTCPeerConnection. */
function cleanRelayServers(servers: IceServerConfig[]): IceServerConfig[] {
  return servers
    .filter((server) => relayUrl(server))
    .map((server) => ({
      urls: relayUrl(server),
      ...(server.username?.trim() && { username: server.username.trim() }),
      ...(server.credential && { credential: server.credential }),
    }));
}

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ icon: Icon, title, children }) => (
  <section className="space-y-3">
    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-brand-500" /> {title}
    </h4>
    {children}
  </section>
);

interface SettingToggleProps {
  label: string;
  description?: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
}

const SettingToggle: React.FC<SettingToggleProps> = ({ label, description, isChecked, onChange }) => (
  <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors">
    <div className="min-w-0">
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block">{label}</span>
      {description && <span className="text-xs text-zinc-400">{description}</span>}
    </div>
    <input
      type="checkbox"
      checked={isChecked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 shrink-0 rounded accent-brand-500"
    />
  </label>
);

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
}

const LabeledField: React.FC<LabeledFieldProps> = ({ label, children }) => (
  <label className="block">
    <span className="block text-zinc-500 dark:text-zinc-400 mb-1">{label}</span>
    {children}
  </label>
);

/** Mounted fresh on each open, so unsaved edits are discarded on cancel. */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  settings,
  onSave,
  themePreference,
  onThemeChange,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [showRelayErrors, setShowRelayErrors] = useState(false);

  const update = (changes: Partial<AppSettings>) => setForm({ ...form, ...changes });

  const updateRelay = (index: number, server: IceServerConfig) => {
    update({ customStunTurn: form.customStunTurn.map((s, i) => (i === index ? server : s)) });
  };

  const removeRelay = (index: number) => {
    update({ customStunTurn: form.customStunTurn.filter((_, i) => i !== index) });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.customStunTurn.some(relayError)) {
      setShowRelayErrors(true);
      return;
    }
    onSave({ ...form, customStunTurn: cleanRelayServers(form.customStunTurn) });
    onClose();
  };

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center gap-2 pb-4 pr-10 border-b border-zinc-100 dark:border-zinc-800">
        <Server className="w-5 h-5 text-brand-500" />
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Transfer & Network Settings</h3>
      </div>

      <form onSubmit={handleSave} className="space-y-5 pt-4">
        <SettingsSection icon={Palette} title="Appearance">
          <SegmentedControl options={THEME_OPTIONS} value={themePreference} onChange={onThemeChange} className="w-full" />
        </SettingsSection>

        <SettingsSection icon={Volume2} title="General">
          <SettingToggle
            label="Audio Chimes on Completion"
            isChecked={form.enableAudioAlerts}
            onChange={(enableAudioAlerts) => update({ enableAudioAlerts })}
          />
          <SettingToggle
            label="Screen Wake Lock"
            description="Prevents device sleep during 10GB transfers"
            isChecked={form.enableWakeLock}
            onChange={(enableWakeLock) => update({ enableWakeLock })}
          />
        </SettingsSection>

        <SettingsSection icon={Server} title="Signaling Server">
          <SettingToggle
            label="Use Custom PeerServer"
            description="Default is free public 0.peerjs.com"
            isChecked={form.useCustomSignaling}
            onChange={(useCustomSignaling) => update({ useCustomSignaling })}
          />

          {form.useCustomSignaling && (
            <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900/80 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs">
              <LabeledField label="Host">
                <TextInput
                  placeholder="my-peer-server.com"
                  autoComplete="off"
                  spellCheck={false}
                  value={form.signalingHost}
                  onChange={(e) => update({ signalingHost: e.target.value })}
                />
              </LabeledField>
              <div className="grid grid-cols-2 gap-2">
                <LabeledField label="Port">
                  <TextInput
                    type="number"
                    value={form.signalingPort}
                    onChange={(e) => update({ signalingPort: parseInt(e.target.value) || 9000 })}
                  />
                </LabeledField>
                <LabeledField label="Path">
                  <TextInput
                    autoComplete="off"
                    spellCheck={false}
                    value={form.signalingPath}
                    onChange={(e) => update({ signalingPath: e.target.value })}
                  />
                </LabeledField>
              </div>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.signalingSecure}
                  onChange={(e) => update({ signalingSecure: e.target.checked })}
                  className="rounded accent-brand-500"
                />
                <span className="text-zinc-700 dark:text-zinc-300">Secure (SSL/WSS)</span>
              </label>
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon={Radio} title="Relay Servers (TURN/STUN)">
          <p className="text-xs text-zinc-400">
            Needed when either device is behind a strict firewall or corporate NAT. Public Google STUN servers are
            always included.
          </p>
          {form.customStunTurn.map((server, index) => (
            <IceServerRow
              key={index}
              server={server}
              error={showRelayErrors ? relayError(server) : null}
              onChange={(next) => updateRelay(index, next)}
              onRemove={() => removeRelay(index)}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ customStunTurn: [...form.customStunTurn, { urls: '' }] })}
            className="text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 dark:hover:bg-brand-500/10"
          >
            <Plus className="w-3.5 h-3.5" />
            Add relay server
          </Button>
        </SettingsSection>

        <SettingsSection icon={Info} title="About">
          <AboutInfo />
        </SettingsSection>

        <div className="pt-2 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
};
