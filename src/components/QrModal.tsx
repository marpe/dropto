import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Check, Copy } from 'lucide-react';

interface QrModalProps {
  url: string;
  roomCode: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QrModal: React.FC<QrModalProps> = ({ url, roomCode, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-all hover:scale-105"
        >
          {copied ? <Check className="w-4 h-4 text-brand-500" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Link Copied!' : 'Copy Share Link'}</span>
        </button>
      </div>
    </div>
  );
};
