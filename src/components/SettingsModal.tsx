import React, { useState } from 'react';
import { X, Check, Server, Volume2, Plus, Radio } from 'lucide-react';
import type { AppSettings, IceServerConfig } from '../types/transfer';
import { IceServerRow } from './IceServerRow';

interface SettingsModalProps {
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

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

/** Mounted fresh on each open, so unsaved edits are discarded on cancel. */
export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, settings, onSave }) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [showRelayErrors, setShowRelayErrors] = useState(false);

  const updateRelay = (index: number, server: IceServerConfig) => {
    setForm({ ...form, customStunTurn: form.customStunTurn.map((s, i) => (i === index ? server : s)) });
  };

  const removeRelay = (index: number) => {
    setForm({ ...form, customStunTurn: form.customStunTurn.filter((_, i) => i !== index) });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.customStunTurn.some(relayError)) {
      setShowRelayErrors(true);
      return;
    }
    onSave({ ...form, customStunTurn: cleanRelayServers(form.customStunTurn) });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-supabase-surface p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-brand-500" />
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              Transfer & Network Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 pt-4">
          {/* Preferences */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-brand-500" /> General
            </h4>
            <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Audio Chimes on Completion
              </span>
              <input
                type="checkbox"
                checked={form.enableAudioAlerts}
                onChange={(e) => setForm({ ...form, enableAudioAlerts: e.target.checked })}
                className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 accent-brand-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors">
              <div>
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block">
                  Screen Wake Lock
                </span>
                <span className="text-xs text-zinc-400">
                  Prevents device sleep during 10GB transfers
                </span>
              </div>
              <input
                type="checkbox"
                checked={form.enableWakeLock}
                onChange={(e) => setForm({ ...form, enableWakeLock: e.target.checked })}
                className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 accent-brand-500"
              />
            </label>
          </div>

          {/* Custom Signaling */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-brand-500" /> Signaling Server
            </h4>
            <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors">
              <div>
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block">
                  Use Custom PeerServer
                </span>
                <span className="text-xs text-zinc-400">
                  Default is free public 0.peerjs.com
                </span>
              </div>
              <input
                type="checkbox"
                checked={form.useCustomSignaling}
                onChange={(e) => setForm({ ...form, useCustomSignaling: e.target.checked })}
                className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500 accent-brand-500"
              />
            </label>

            {form.useCustomSignaling && (
              <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900/80 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs">
                <div>
                  <label className="block text-zinc-500 dark:text-zinc-400 mb-1">Host</label>
                  <input
                    type="text"
                    placeholder="my-peer-server.com"
                    value={form.signalingHost}
                    onChange={(e) => setForm({ ...form, signalingHost: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-500 dark:text-zinc-400 mb-1">Port</label>
                    <input
                      type="number"
                      value={form.signalingPort}
                      onChange={(e) => setForm({ ...form, signalingPort: parseInt(e.target.value) || 9000 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-500 dark:text-zinc-400 mb-1">Path</label>
                    <input
                      type="text"
                      value={form.signalingPath}
                      onChange={(e) => setForm({ ...form, signalingPath: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.signalingSecure}
                    onChange={(e) => setForm({ ...form, signalingSecure: e.target.checked })}
                    className="rounded text-brand-500 accent-brand-500"
                  />
                  <span className="text-zinc-700 dark:text-zinc-300">Secure (SSL/WSS)</span>
                </label>
              </div>
            )}
          </div>

          {/* TURN/STUN relays */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-brand-500" /> Relay Servers (TURN/STUN)
            </h4>
            <p className="text-xs text-zinc-400">
              Needed when either device is behind a strict firewall or corporate NAT. Public Google STUN servers
              are always included.
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
            <button
              type="button"
              onClick={() => setForm({ ...form, customStunTurn: [...form.customStunTurn, { urls: '' }] })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add relay server
            </button>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-xl bg-brand-500 hover:bg-brand-600 text-supabase-bg shadow-lg shadow-brand-500/25 transition-all hover:scale-105"
            >
              {saved ? <Check className="w-4 h-4" /> : null}
              <span>{saved ? 'Saved!' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
