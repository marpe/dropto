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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Transfer & Network Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 pt-4">
          {/* Preferences */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> General
            </h4>
            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Audio Chimes on Completion
              </span>
              <input
                type="checkbox"
                checked={form.enableAudioAlerts}
                onChange={(e) => setForm({ ...form, enableAudioAlerts: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                  Screen Wake Lock
                </span>
                <span className="text-xs text-slate-400">
                  Prevents device sleep during 10GB transfers
                </span>
              </div>
              <input
                type="checkbox"
                checked={form.enableWakeLock}
                onChange={(e) => setForm({ ...form, enableWakeLock: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>

          {/* Custom Signaling */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> Signaling Server
            </h4>
            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
              <div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block">
                  Use Custom PeerServer
                </span>
                <span className="text-xs text-slate-400">
                  Default is free public 0.peerjs.com
                </span>
              </div>
              <input
                type="checkbox"
                checked={form.useCustomSignaling}
                onChange={(e) => setForm({ ...form, useCustomSignaling: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            {form.useCustomSignaling && (
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Host</label>
                  <input
                    type="text"
                    placeholder="my-peer-server.com"
                    value={form.signalingHost}
                    onChange={(e) => setForm({ ...form, signalingHost: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1">Port</label>
                    <input
                      type="number"
                      value={form.signalingPort}
                      onChange={(e) => setForm({ ...form, signalingPort: parseInt(e.target.value) || 9000 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1">Path</label>
                    <input
                      type="text"
                      value={form.signalingPath}
                      onChange={(e) => setForm({ ...form, signalingPath: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.signalingSecure}
                    onChange={(e) => setForm({ ...form, signalingSecure: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-slate-700 dark:text-slate-300">Secure (SSL/WSS)</span>
                </label>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
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
