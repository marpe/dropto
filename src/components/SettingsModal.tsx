import React, { useState } from 'react';
import { X, Check, Server, Volume2 } from 'lucide-react';
import type { AppSettings } from '../types/transfer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#181818] p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-[#3ECF8E]" />
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
              <Volume2 className="w-3.5 h-3.5 text-[#3ECF8E]" /> General
            </h4>
            <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Audio Chimes on Completion
              </span>
              <input
                type="checkbox"
                checked={form.enableAudioAlerts}
                onChange={(e) => setForm({ ...form, enableAudioAlerts: e.target.checked })}
                className="w-4 h-4 rounded text-[#3ECF8E] focus:ring-[#3ECF8E] accent-[#3ECF8E]"
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
                className="w-4 h-4 rounded text-[#3ECF8E] focus:ring-[#3ECF8E] accent-[#3ECF8E]"
              />
            </label>
          </div>

          {/* Custom Signaling */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-[#3ECF8E]" /> Signaling Server
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
                className="w-4 h-4 rounded text-[#3ECF8E] focus:ring-[#3ECF8E] accent-[#3ECF8E]"
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
                    className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-[#3ECF8E] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-500 dark:text-zinc-400 mb-1">Port</label>
                    <input
                      type="number"
                      value={form.signalingPort}
                      onChange={(e) => setForm({ ...form, signalingPort: parseInt(e.target.value) || 9000 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-[#3ECF8E] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-500 dark:text-zinc-400 mb-1">Path</label>
                    <input
                      type="text"
                      value={form.signalingPath}
                      onChange={(e) => setForm({ ...form, signalingPath: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-[#3ECF8E] focus:outline-none"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.signalingSecure}
                    onChange={(e) => setForm({ ...form, signalingSecure: e.target.checked })}
                    className="rounded text-[#3ECF8E] accent-[#3ECF8E]"
                  />
                  <span className="text-zinc-700 dark:text-zinc-300">Secure (SSL/WSS)</span>
                </label>
              </div>
            )}
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
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-xl bg-[#3ECF8E] hover:bg-[#24b47e] text-[#121212] shadow-lg shadow-[#3ECF8E]/25 transition-all hover:scale-105"
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
