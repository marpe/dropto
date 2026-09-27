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
import { notificationService } from '../services/notifications';
import type { AppSettings, IceServerConfig } from '../types/transfer';
import { IceServerRow } from './IceServerRow';

interface SettingsModalProps {
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  themePreference: ThemePreference;
  /** Applied immediately (not part of the saved draft) so the choice can be previewed */
  onThemeChange: (preference: ThemePreference) => void;
  /** Resolves true when the browser allows notifications; injectable for tests */
  requestNotificationPermission?: () => Promise<boolean>;
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

// The footer's Save button lives outside the <form> and submits it through the native form attribute
const SETTINGS_FORM_ID = 'settings-form';

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ icon: Icon, title, children }) => (
  <section className="space-y-3">
    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-5 flex items-center gap-1.5">
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
  <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border-2 hover:bg-surface-2 cursor-pointer transition-colors">
    <div className="min-w-0">
      <span className="text-sm font-medium text-text-2 block">{label}</span>
      {description && <span className="text-xs text-text-5">{description}</span>}
    </div>
    <input
      type="checkbox"
      checked={isChecked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 shrink-0 rounded-sm accent-brand-500"
    />
  </label>
);

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
}

const LabeledField: React.FC<LabeledFieldProps> = ({ label, children }) => (
  <label className="block">
    <span className="block text-text-4 mb-1">{label}</span>
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
  requestNotificationPermission = () => notificationService.requestPermission(),
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [showRelayErrors, setShowRelayErrors] = useState(false);
  const [isNotificationBlocked, setIsNotificationBlocked] = useState(false);
  // Theme changes apply instantly and are not part of the draft
  const isDirty = JSON.stringify(form) !== JSON.stringify(settings);

  const update = (changes: Partial<AppSettings>) => setForm({ ...form, ...changes });

  const toggleNotifications = async (isEnabling: boolean) => {
    if (!isEnabling) {
      update({ enableNotifications: false });
      return;
    }
    const isAllowed = await requestNotificationPermission();
    setIsNotificationBlocked(!isAllowed);
    setForm((current) => ({ ...current, enableNotifications: isAllowed }));
  };

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
    <Modal
      title="Settings"
      icon={Server}
      onClose={onClose}
      isDirty={isDirty}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={SETTINGS_FORM_ID}>
            Save
          </Button>
        </>
      }
    >
      <form id={SETTINGS_FORM_ID} onSubmit={handleSave} className="space-y-5">
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
          <SettingToggle
            label="Notify When Done"
            description={
              isNotificationBlocked
                ? 'Notifications are blocked for this site; allow them in your browser settings.'
                : 'A system notification if this tab is in the background'
            }
            isChecked={form.enableNotifications}
            onChange={toggleNotifications}
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
            <div className="space-y-2 p-3 bg-surface-2 rounded-xl border border-border-2 text-xs">
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
                  className="rounded-sm accent-brand-500"
                />
                <span className="text-text-3">Secure (SSL/WSS)</span>
              </label>
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon={Radio} title="Relay Servers (TURN/STUN)">
          <p className="text-xs text-text-5">
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
            className="text-brand-500 hover:bg-brand-500/10"
          >
            <Plus className="w-3.5 h-3.5" />
            Add relay server
          </Button>
        </SettingsSection>

        <SettingsSection icon={Info} title="About">
          <AboutInfo />
        </SettingsSection>

      </form>
    </Modal>
  );
};
