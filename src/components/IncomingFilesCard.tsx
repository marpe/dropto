import React, { useState } from 'react';
import { AlertTriangle, HardDriveDownload, Pause, Play, Unplug, XCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Card } from './ui/Card';
import { BottomBar } from './ui/BottomBar';
import { Checkbox } from './ui/Checkbox';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Notice } from './ui/Notice';
import { FILE_PROGRESS_COLUMN } from './FileProgressCell';
import { FileTable, FileTableRow } from './FileTable';
import type { FinishedFile, ManifestFile, TransferManifest } from '../types/transfer';
import { getOfferedFileProgress } from '../utils/transferProgress';
import type { ActiveDownload, FileProgress } from '../utils/transferProgress';
import { FileTotals } from './FileTotals';
import { cn } from '../utils/cn';
import { supportsSaveFilePicker } from '../utils/fileSystemAccess';
import { toggleInSet } from '../utils/sets';

interface IncomingFilesCardProps {
  manifest: TransferManifest;
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
  /** Once the sender has left: done with this list */
  onDone?: () => void;
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
        <Checkbox checked={isSelected} onChange={onToggle} />
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
  onStartSaving,
  download = null,
  finishedFiles = {},
  hasSenderLeft = false,
  onTogglePause,
  onCancel,
  onDone,
}) => {
  const [isPreparingSave, setIsPreparingSave] = useState(false);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const canStreamToDisk = supportsSaveFilePicker();
  // Unticked files are remembered (not ticked ones) so files the sender adds later arrive ticked
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set());

  const isSelectable = manifest.files.length > 1 && !download;
  const selectedIndices = manifest.files.flatMap((file, index) => (excludedIds.has(file.id) ? [] : [index]));
  const progress = getOfferedFileProgress(manifest.files, download, finishedFiles);
  const selectedBytes = selectedIndices.reduce((sum, index) => sum + manifest.files[index].size, 0);
  const isEverythingSelected = selectedIndices.length === manifest.files.length;

  const toggle = (fileId: string) => setExcludedIds((current) => toggleInSet(current, fileId));

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
          headerLead={
            <Checkbox
              aria-label="Select all"
              checked={isEverythingSelected}
              isIndeterminate={selectedIndices.length > 0 && !isEverythingSelected}
              onChange={() => setExcludedIds(isEverythingSelected ? new Set(manifest.files.map((file) => file.id)) : new Set())}
            />
          }
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

        {/* Like the sender's list: totals under it */}
        <div className="pt-3 border-t border-border-1">
          <FileTotals count={selectedIndices.length} ofCount={manifest.files.length} totalBytes={selectedBytes} />
        </div>

        {hasSenderLeft && (
          <Notice tone="warning" icon={Unplug} className="mt-3">
            The sender disconnected.
          </Notice>
        )}

        {/* Only Chromium can stream to disk; elsewhere files are buffered in RAM */}
        {!canStreamToDisk && (
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
          <Button data-testid="stop-download" variant="danger" size="lg" onClick={() => setIsConfirmingStop(true)}>
            <XCircle className="w-5 h-5" />
            <span>Stop</span>
          </Button>
        </BottomBar>
      ) : hasSenderLeft ? (
        <BottomBar>
          <Button data-testid="done" variant="secondary" size="lg" onClick={onDone}>
            Done
          </Button>
        </BottomBar>
      ) : (
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

      {/* Stopping disconnects from the sender, so the list goes with it */}
      {isConfirmingStop && download && (
        <ConfirmDialog
          title="Stop download?"
          confirmLabel="Stop"
          tone="danger"
          onConfirm={() => {
            setIsConfirmingStop(false);
            onCancel?.();
          }}
          onCancel={() => setIsConfirmingStop(false)}
        >
          <p>Files not finished yet are not saved, and you disconnect from the sender.</p>
        </ConfirmDialog>
      )}
    </>
  );
};
