import React, { useState } from 'react';
import { AlertTriangle, HardDriveDownload, Pause, Play, Unplug, XCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Card } from './ui/Card';
import { BottomBar } from './ui/BottomBar';
import { LinkButton } from './ui/LinkButton';
import { Notice } from './ui/Notice';
import { FILE_PROGRESS_COLUMN } from './FileProgressCell';
import { FileTable, FileTableRow } from './FileTable';
import type { FinishedFile, ManifestFile, TransferManifest } from '../types/transfer';
import { getOfferedFileProgress } from '../utils/transferProgress';
import type { ActiveDownload, FileProgress } from '../utils/transferProgress';
import { FileTotals } from './FileTotals';
import { cn } from '../utils/cn';

interface IncomingFilesCardProps {
  manifest: TransferManifest;
  isNativeFSA: boolean;
  /** Called with the ticked manifest indices, or undefined when every file is wanted */
  onStartSaving: (fileIndices?: number[]) => void | Promise<void>;
  /** The download under way; null while choosing */
  download?: (ActiveDownload & { isPaused: boolean }) | null;
  /** Files downloaded earlier on this connection, by id */
  finishedFiles?: Record<string, FinishedFile>;
  /** The sender went away after a finished download, so nothing more can be downloaded */
  hasSenderLeft?: boolean;
  onTogglePause?: () => void;
  onCancel?: () => void;
}

interface IncomingFileRowProps {
  file: ManifestFile;
  /** Checkboxes show while choosing among several files */
  isSelectable: boolean;
  isSelected: boolean;
  /** In the running download, or downloaded earlier; null otherwise */
  progress: FileProgress | null;
  isDimmed: boolean;
  onToggle: () => void;
}

const IncomingFileRow: React.FC<IncomingFileRowProps> = ({ file, isSelectable, isSelected, progress, isDimmed, onToggle }) => (
  <FileTableRow
    file={file}
    progress={progress}
    isLabel={isSelectable}
    className={cn(isDimmed && 'opacity-50')}
    lead={
      isSelectable && (
        <input type="checkbox" checked={isSelected} onChange={onToggle} className="w-4 h-4 shrink-0 accent-brand-500" />
      )
    }
  />
);

/**
 * The sender's offer: what is coming and which of it to take. The download runs in the same list, each file
 * showing its progress, and afterwards more (or the same files again) can be downloaded from it.
 */
export const IncomingFilesCard: React.FC<IncomingFilesCardProps> = ({
  manifest,
  isNativeFSA,
  onStartSaving,
  download = null,
  finishedFiles = {},
  hasSenderLeft = false,
  onTogglePause,
  onCancel,
}) => {
  const [isPreparingSave, setIsPreparingSave] = useState(false);
  // Unticked files are remembered (not ticked ones) so files the sender adds later arrive ticked
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set());

  const isSelectable = manifest.files.length > 1 && !download;
  const selectedIndices = manifest.files.flatMap((file, index) => (excludedIds.has(file.id) ? [] : [index]));
  const progress = getOfferedFileProgress(manifest.files, download, finishedFiles);
  const selectedBytes = selectedIndices.reduce((sum, index) => sum + manifest.files[index].size, 0);
  const isEverythingSelected = selectedIndices.length === manifest.files.length;

  const toggle = (fileId: string) => {
    setExcludedIds((current) => {
      const next = new Set(current);
      if (!next.delete(fileId)) {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleStartSaveClick = async () => {
    setIsPreparingSave(true);
    try {
      await onStartSaving(isEverythingSelected ? undefined : selectedIndices);
    } finally {
      setIsPreparingSave(false);
    }
  };

  return (
    <>
    <Card data-testid="incoming-files" padding="sm">
      <FileTable
        files={manifest.files}
        hasLead={isSelectable}
        trailClassName={progress.some(Boolean) ? FILE_PROGRESS_COLUMN : undefined}
        renderRow={(file, index) => (
          <IncomingFileRow
            key={file.id}
            file={file}
            isSelectable={isSelectable}
            isSelected={!excludedIds.has(file.id)}
            progress={progress[index]}
            // During a download, files outside it (and not downloaded before) fade back
            isDimmed={download ? progress[index] === null : excludedIds.has(file.id)}
            onToggle={() => toggle(file.id)}
          />
        )}
      />

      {/* Like the sender's list: totals under it, with the list's own controls on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border-1">
        <FileTotals count={selectedIndices.length} ofCount={manifest.files.length} totalBytes={selectedBytes} />
        {isSelectable && (
          <LinkButton
            onClick={() => setExcludedIds(isEverythingSelected ? new Set(manifest.files.map((file) => file.id)) : new Set())}
            className="text-xs shrink-0"
          >
            {isEverythingSelected ? 'Select none' : 'Select all'}
          </LinkButton>
        )}
      </div>

      {hasSenderLeft && (
        <Notice tone="warning" icon={Unplug} className="mt-3">
          The sender disconnected.
        </Notice>
      )}

      {/* Only Chromium can stream to disk; elsewhere files are buffered in RAM */}
      {!isNativeFSA && (
        <p data-testid="storage-note" className="flex items-start justify-center gap-1.5 mt-3 text-xs text-center text-text-warning-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          This browser keeps files in memory. For over 1 GB, use Chrome or Edge.
        </p>
      )}
    </Card>
    {download ? (
      <BottomBar>
        <Button variant="secondary" size="lg" onClick={onTogglePause}>
          {download.isPaused ? <Play className="w-5 h-5 text-brand-500" /> : <Pause className="w-5 h-5" />}
          <span>{download.isPaused ? 'Resume' : 'Pause'}</span>
        </Button>
        <Button variant="danger" size="lg" onClick={onCancel}>
          <XCircle className="w-5 h-5" />
          <span>Cancel</span>
        </Button>
      </BottomBar>
    ) : !hasSenderLeft && (
    <BottomBar>
      <Button
        data-testid="start-download"
        size="lg"
        onClick={handleStartSaveClick}
        disabled={isPreparingSave || selectedIndices.length === 0}
      >
        {isPreparingSave ? <Spinner className="w-5 h-5" /> : <HardDriveDownload className="w-5 h-5" />}
        <span>Download</span>
      </Button>
    </BottomBar>
    )}
    </>
  );
};
