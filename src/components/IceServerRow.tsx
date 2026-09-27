import React from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { TextInput } from './ui/TextInput';
import type { IceServerConfig } from '../types/transfer';

interface IceServerRowProps {
  server: IceServerConfig;
  error: string | null;
  onChange: (server: IceServerConfig) => void;
  onRemove: () => void;
}

export const IceServerRow: React.FC<IceServerRowProps> = ({ server, error, onChange, onRemove }) => {
  const urls = Array.isArray(server.urls) ? server.urls.join(', ') : server.urls;

  return (
    <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-900/80 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs">
      <div className="flex items-center gap-2">
        <TextInput
          autoComplete="off"
          spellCheck={false}
          placeholder="turn:relay.example.com:3478"
          value={urls}
          onChange={(e) => onChange({ ...server, urls: e.target.value })}
          className="font-mono"
        />
        <IconButton
          title="Remove relay server"
          aria-label="Remove relay server"
          size="sm"
          onClick={onRemove}
          className="hover:text-red-500 dark:hover:text-red-400"
        >
          <X className="w-4 h-4" />
        </IconButton>
      </div>
      {error && <p className="text-red-500">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <TextInput
          autoComplete="off"
          spellCheck={false}
          placeholder="Username"
          value={server.username ?? ''}
          onChange={(e) => onChange({ ...server, username: e.target.value })}
        />
        <TextInput
          type="password"
          autoComplete="off"
          placeholder="Password"
          value={server.credential ?? ''}
          onChange={(e) => onChange({ ...server, credential: e.target.value })}
        />
      </div>
    </div>
  );
};
