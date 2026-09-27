import React from 'react';
import { X } from 'lucide-react';
import type { IceServerConfig } from '../types/transfer';

interface IceServerRowProps {
  server: IceServerConfig;
  error: string | null;
  onChange: (server: IceServerConfig) => void;
  onRemove: () => void;
}

const inputClass =
  'w-full min-w-0 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-brand-500 focus:outline-none';

export const IceServerRow: React.FC<IceServerRowProps> = ({ server, error, onChange, onRemove }) => {
  const urls = Array.isArray(server.urls) ? server.urls.join(', ') : server.urls;

  return (
    <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900/80 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs">
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="turn:relay.example.com:3478"
          value={urls}
          onChange={(e) => onChange({ ...server, urls: e.target.value })}
          className={`${inputClass} font-mono`}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove relay server"
          className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-red-500">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Username"
          value={server.username ?? ''}
          onChange={(e) => onChange({ ...server, username: e.target.value })}
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="off"
          placeholder="Password"
          value={server.credential ?? ''}
          onChange={(e) => onChange({ ...server, credential: e.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
};
