import React, { useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { IconButton } from './ui/IconButton';
import { ProgressBar } from './ui/ProgressBar';
import { FILE_PROGRESS_COLUMN } from './FileProgressCell';
import { FileTable, FileTableRow } from './FileTable';
import { PeerIdentity } from './PeerIdentity';
import type { Presence } from './ui/StatusDot';
import { useNow } from '../hooks/useNow';
import type { SenderReceiver } from '../types/sharing';
import { cn } from '../utils/cn';
import { formatBytes, formatElapsed, formatSpeed } from '../utils/format';
import { describePeer } from '../utils/deviceInfo';
import { getSentFiles } from '../utils/transferProgress';

interface ReceiverRowProps {
  receiver: SenderReceiver;
  /** Place in line (1 = next) while queued */
  queuePosition: number | null;
  onStop: () => void;
  onDismiss: () => void;
  onTogglePause: () => void;
}

/** Whether they are still there; the dot says it, so the text only says what they are doing */
function presenceOf(receiver: SenderReceiver): Presence {
  if (receiver.hasLeft) {
    return 'gone';
  }
  return receiver.stage === 'failed' ? 'failed' : 'connected';
}

/** What they are doing, in a few words: downloading, in line, idle since their last download (or arrival), failed */
function describeActivity(receiver: SenderReceiver, queuePosition: number | null, nowMs: number): string | null {
  if (receiver.hasLeft) {
    return null;
  }
  if (receiver.idleSinceMs !== null) {
    return `Idle for ${formatElapsed(receiver.idleSinceMs, nowMs)}`;
  }
  switch (receiver.stage) {
    case 'queued':
      return queuePosition === 1 ? 'Next in line' : `In line · #${queuePosition ?? '?'}`;
    case 'transferring': {
      if (receiver.isPaused) {
        return 'Paused';
      }
      const metrics = receiver.metrics;
      return metrics ? `${Math.floor(metrics.overallPercent)}% · ${formatSpeed(metrics.currentSpeed)}` : 'Starting…';
    }
    case 'failed':
      // Why is spelled out on its own line, where a long reason has room to wrap
      return 'Failed';
    default:
      return null;
  }
}

const STOP_TITLES = {
  queued: { button: 'Remove from line', dialog: 'Remove from the line?' },
  transferring: { button: 'Stop download', dialog: 'Stop this download?' },
  idle: { button: 'Disconnect', dialog: 'Disconnect?' },
} as const;

/** One person on the link: where they are, the files sent to them, and a way to stop them. */
export const ReceiverRow: React.FC<ReceiverRowProps> = ({ receiver, queuePosition, onStop, onDismiss, onTogglePause }) => {
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const nowMs = useNow(1000, receiver.idleSinceMs !== null);
  const { name, meta } = describePeer(receiver.details);
  // Still connected after a download counts as idle, and can be disconnected; only the gone can be dismissed
  const isGone = receiver.hasLeft || receiver.stage === 'failed';
  const stopTitles = STOP_TITLES[receiver.stage === 'queued' || receiver.stage === 'transferring' ? receiver.stage : 'idle'];
  const sent = getSentFiles(receiver);
  const activity = describeActivity(receiver, queuePosition, nowMs);
  const bytesSent = receiver.bytesSent + (receiver.stage === 'transferring' ? (receiver.metrics?.bytesTransferred ?? 0) : 0);
  const downloadPercent =
    receiver.stage === 'transferring'
      ? (receiver.metrics?.overallPercent ?? 0)
      : receiver.stage === 'queued'
        ? 0
        : receiver.stage === 'completed'
          ? 100
          : null;

  return (
    <li data-testid="receiver-row" data-stage={receiver.stage} className="py-2.5 space-y-2 transition-[opacity,transform] duration-300 starting:opacity-0 starting:translate-y-1">
      <div className="flex items-start gap-2">
        <PeerIdentity
          details={receiver.details}
          presence={presenceOf(receiver)}
          detail={bytesSent > 0 && <span data-testid="bytes-sent">{formatBytes(bytesSent)} sent</span>}
          status={
            activity && (
              <span
                className={cn('shrink-0 text-xs tabular-nums', receiver.stage === 'failed' ? 'text-text-danger-1' : 'text-text-4')}
              >
                {activity}
              </span>
            )
          }
        />
        {receiver.stage === 'transferring' && (
          <IconButton title={receiver.isPaused ? 'Resume' : 'Pause'} size="sm" onClick={onTogglePause}>
            {receiver.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </IconButton>
        )}
        {isGone ? (
          <IconButton title="Remove from list" size="sm" onClick={onDismiss}>
            <X className="w-4 h-4" />
          </IconButton>
        ) : (
          <IconButton title={stopTitles.button} size="sm" onClick={() => setIsConfirmingStop(true)}>
            <X className="w-4 h-4" />
          </IconButton>
        )}
      </div>

      {receiver.stage === 'failed' && receiver.error && (
        <p data-testid="receiver-error" className="pl-6 text-xs text-text-danger-1 break-words">
          {receiver.error}
        </p>
      )}

      {/* The whole download at a glance, over the per-file bars below: empty while it waits for a slot, full once
          done, and back to empty when the next download starts */}
      {downloadPercent !== null && (
        <div data-testid="download-progress" data-percent={Math.floor(downloadPercent)}>
          <ProgressBar percent={downloadPercent} variant="subtle" />
        </div>
      )}

      {sent.files.length > 0 && (
        <FileTable
          files={sent.files}
          trailClassName={FILE_PROGRESS_COLUMN}
          renderRow={(file, index) => <FileTableRow key={file.id} file={file} progress={sent.progress[index]} />}
        />
      )}

      {isConfirmingStop && (
        <ConfirmDialog
          title={stopTitles.dialog}
          confirmLabel={receiver.stage === 'transferring' ? 'Stop' : 'Disconnect'}
          tone="danger"
          onConfirm={() => {
            setIsConfirmingStop(false);
            onStop();
          }}
          onCancel={() => setIsConfirmingStop(false)}
        >
          <p>
            {name}
            {meta && ` (${meta})`} will be disconnected. They can reconnect with the link.
          </p>
        </ConfirmDialog>
      )}
    </li>
  );
};
