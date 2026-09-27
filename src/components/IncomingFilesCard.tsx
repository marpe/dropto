import React, { useState } from 'react';
import { DownloadCloud, ShieldCheck, AlertTriangle, HardDriveDownload } from 'lucide-react';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Card } from './ui/Card';
import { IconBadge } from './ui/IconBadge';
import { FileTypeIcon } from './ui/FileTypeIcon';
import { LinkButton } from './ui/LinkButton';
import type { ManifestFile, TransferManifest } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { displayPath } from '../utils/filePath';
import { cn } from '../utils/cn';

interface IncomingFilesCardProps {
  manifest: TransferManifest;
  isNativeFSA: boolean;
  /** Called with the ticked manifest indices, or undefined when every file is wanted */
  onStartSaving: (fileIndices?: number[]) => void | Promise<void>;
}

interface IncomingFileRowProps {
  file: ManifestFile;
  isSelectable: boolean;
  isSelected: boolean;
  onToggle: () => void;
}

const IncomingFileRow: React.FC<IncomingFileRowProps> = ({ file, isSelectable, isSelected, onToggle }) => (
  <li className="transition-[opacity,transform] duration-300 starting:opacity-0 starting:translate-y-1 [content-visibility:auto] [contain-intrinsic-size:auto_2.5rem]">
    <label
      className={cn(
        'flex items-center gap-3 text-xs p-2.5 rounded-xl bg-surface-1 border border-border-1 transition-[border-color,opacity]',
        isSelectable && 'cursor-pointer hover:border-brand-500/30',
        !isSelected && 'opacity-50'
      )}
    >
      {isSelectable && (
        <input type="checkbox" checked={isSelected} onChange={onToggle} className="w-4 h-4 shrink-0 accent-brand-500" />
      )}
      <FileTypeIcon name={file.name} mimeType={file.type} />
      <span className="flex-1 min-w-0 font-semibold text-text-2 truncate">{displayPath(file)}</span>
      <span className="font-mono text-text-4 shrink-0">{formatBytes(file.size)}</span>
    </label>
  </li>
);

/** The sender's offer: what is coming, which of it to take, and the button that opens the save picker. */
export const IncomingFilesCard: React.FC<IncomingFilesCardProps> = ({ manifest, isNativeFSA, onStartSaving }) => {
  const [isPreparingSave, setIsPreparingSave] = useState(false);
  // Unticked files are remembered (not ticked ones) so files the sender adds later arrive ticked
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set());

  const isSelectable = manifest.files.length > 1;
  const selectedIndices = manifest.files.flatMap((file, index) => (excludedIds.has(file.id) ? [] : [index]));
  const selectedBytes = selectedIndices.reduce((sum, index) => sum + manifest.files[index].size, 0);
  const isEverythingSelected = selectedIndices.length === manifest.files.length;
  const isMultiFile = selectedIndices.length > 1;

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
    <Card data-testid="incoming-files">
      <div className="flex items-center gap-3 mb-6">
        <IconBadge icon={DownloadCloud} size="md" iconClassName="motion-safe:animate-float" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-text-1">Incoming files</h3>
          <p className="text-xs text-text-4 tabular-nums">
            {isEverythingSelected
              ? `${manifest.files.length} ${isMultiFile ? 'files' : 'file'}`
              : `${selectedIndices.length} of ${manifest.files.length} files`}{' '}
            · {formatBytes(selectedBytes)}
          </p>
        </div>
        {isSelectable && (
          <LinkButton
            onClick={() => setExcludedIds(isEverythingSelected ? new Set(manifest.files.map((file) => file.id)) : new Set())}
            className="text-xs shrink-0"
          >
            {isEverythingSelected ? 'Select none' : 'Select all'}
          </LinkButton>
        )}
      </div>

      <ul className="p-3 bg-surface-2 rounded-2xl border border-border-2 mb-6 max-h-56 overflow-y-auto overscroll-contain space-y-2 scroll-fade [--scroll-fade-color:var(--color-surface-2)]">
        {manifest.files.map((file) => (
          <IncomingFileRow
            key={file.id}
            file={file}
            isSelectable={isSelectable}
            isSelected={!excludedIds.has(file.id)}
            onToggle={() => toggle(file.id)}
          />
        ))}
      </ul>

      <Button
        data-testid="start-download"
        size="lg"
        onClick={handleStartSaveClick}
        disabled={isPreparingSave || selectedIndices.length === 0}
        className="w-full rounded-2xl shadow-xl disabled:opacity-75"
      >
        {isPreparingSave ? (
          <>
            <Spinner className="w-5 h-5" />
            <span>{isMultiFile ? 'Opening folder picker…' : 'Opening save dialog…'}</span>
          </>
        ) : (
          <>
            <HardDriveDownload className="w-5 h-5" />
            <span>{isMultiFile ? 'Choose a folder and download' : 'Choose where to save and download'}</span>
          </>
        )}
      </Button>

      {/* Only Chromium can stream to disk; elsewhere files are buffered in RAM */}
      <p
        data-testid="storage-note"
        className={cn(
          'flex items-start justify-center gap-1.5 mt-3 text-xs text-center',
          isNativeFSA ? 'text-text-5' : 'text-text-warning-1'
        )}
      >
        {isNativeFSA ? (
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
        )}
        {isNativeFSA
          ? 'Saves straight to disk, so any size works.'
          : 'Files are held in memory until they finish in this browser; for anything over about 1 GB, use Chrome or Edge.'}
      </p>
    </Card>
  );
};
