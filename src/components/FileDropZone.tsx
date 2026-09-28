import React from 'react';
import type { RefObject } from 'react';
import { UploadCloud } from 'lucide-react';
import { FilePickerButtons } from './FilePickerButtons';
import type { AddFiles } from '../types/transfer';

interface FileDropZoneProps {
  onAddFiles: AddFiles;
  /** Lets other controls (e.g. the approval dialog) open the file picker */
  fileInputRef: RefObject<HTMLInputElement | null>;
}

/** The empty landing state; once files are queued, the list itself offers File / Folder. */
export const FileDropZone: React.FC<FileDropZoneProps> = ({ onAddFiles, fileInputRef }) => (
  // Dropping is handled page-wide (usePageFileDrop); this is the visible invitation plus the pickers
  // A plain empty state on a phone (nothing to drag there); a dashed drop target inside the panel on desktop
  <div
    data-testid="drop-zone"
    className="group text-center bg-surface-1 border-y border-border-1 px-4 py-10 sm:my-5 sm:py-10 sm:border-2 sm:border-dashed sm:border-border-2 sm:rounded-xl sm:hover:border-brand-500/60 sm:transition-colors"
  >
    <UploadCloud className="mx-auto mb-3 w-10 h-10 text-brand-500" strokeWidth={1.5} />
    <h2 className="text-lg sm:text-base font-semibold text-text-1 mb-6">Drop files to send</h2>
    <div className="flex flex-wrap items-center justify-center gap-3">
      <FilePickerButtons onAddFiles={onAddFiles} fileInputRef={fileInputRef} />
    </div>
  </div>
);
