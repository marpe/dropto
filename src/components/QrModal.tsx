import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface QrModalProps {
  url: string;
  roomCode: string;
  onClose: () => void;
}

export const QrModal: React.FC<QrModalProps> = ({ url, roomCode, onClose }) => {
  const [copied, copy] = useCopyToClipboard();

  return (
    <Modal
      title="Scan to Connect"
      onClose={onClose}
      bodyClassName="text-center"
      footer={
        <Button variant="secondary" onClick={() => copy(url)} className="w-full">
          {copied ? <Check className="w-4 h-4 text-brand-500" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied' : 'Copy Link'}</span>
        </Button>
      }
    >
      <p className="text-xs text-text-4 mb-5">
        Scan with a phone camera to open the link and receive the files
      </p>

      {/* QR codes need dark modules on white in both themes to scan reliably */}
      <div className="p-4 bg-white rounded-2xl inline-block shadow-inner border border-border-2 mb-5">
        <QRCodeSVG value={url} size={200} level="M" fgColor="#121212" />
      </div>

      <div>
        <span className="text-2xs uppercase font-bold tracking-wider text-text-5 block mb-1">Room Code</span>
        <span className="font-mono text-2xl font-black tracking-widest text-brand-500">{roomCode}</span>
      </div>
    </Modal>
  );
};
