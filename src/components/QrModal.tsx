import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Check, Copy } from 'lucide-react';
import { Button } from './ui/Button';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface QrModalProps {
  url: string;
  roomCode: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QrModal: React.FC<QrModalProps> = ({ url, roomCode, isOpen, onClose }) => {
  const [copied, copy] = useCopyToClipboard();

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-supabase-surface p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 text-center">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
          Scan to Connect
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
          Scan with your phone camera to transfer files instantly
        </p>

        <div className="p-4 bg-white rounded-2xl inline-block shadow-inner border border-zinc-200/80 mb-5">
          <QRCodeSVG value={url} size={200} level="M" fgColor="#121212" />
        </div>

        <div className="mb-4">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">Room Code</span>
          <span className="font-mono text-2xl font-black tracking-widest text-brand-500">
            {roomCode}
          </span>
        </div>

        <Button variant="secondary" onClick={() => copy(url)} className="w-full">
          {copied ? <Check className="w-4 h-4 text-brand-500" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Link Copied!' : 'Copy Share Link'}</span>
        </Button>
      </div>
    </div>
  );
};
