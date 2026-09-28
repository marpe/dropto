import React from 'react';
import type { RefObject } from 'react';
import { UploadCloud } from 'lucide-react';
import { IconBadge } from './ui/IconBadge';
import { FilePickerButtons } from './FilePickerButtons';

// Line breaks may only fall between facts, never inside one
const FACTS = ['Files or whole folders, any size', 'No account', 'Nothing stored', 'Straight from your device to theirs'];

interface FileDropZoneProps {
  onAddFiles: (files: File[]) => void;
  /** Lets other controls (e.g. the approval dialog) open the file picker */
  fileInputRef: RefObject<HTMLInputElement | null>;
}

/** The empty landing state; once files are queued, the list itself offers File / Folder. */
export const FileDropZone: React.FC<FileDropZoneProps> = ({ onAddFiles, fileInputRef }) => (
  // Dropping is handled page-wide (usePageFileDrop); this is the visible invitation plus the pickers
  <div
    data-testid="drop-zone"
    className="group border-2 border-dashed text-center transition-colors border-border-2 hover:border-brand-500/60 bg-surface-1 p-8 -mx-4 border-x-0 sm:mx-0 sm:border-x-2 sm:rounded-3xl"
  >
    <IconBadge
      icon={UploadCloud}
      className="mx-auto mb-4 motion-safe:group-hover:scale-110 transition-transform"
      iconClassName="motion-safe:animate-float"
    />
    <h1 className="text-lg font-bold text-text-1 mb-1">Drop files to send</h1>
    <p className="text-xs text-text-4 mb-6 max-w-xl mx-auto">
      {FACTS.map((fact, index) => (
        <React.Fragment key={fact}>
          {index > 0 && ' · '}
          <span className="whitespace-nowrap">{fact}</span>
        </React.Fragment>
      ))}
    </p>
    <div className="flex flex-wrap items-center justify-center gap-3">
      <FilePickerButtons onAddFiles={onAddFiles} fileInputRef={fileInputRef} />
    </div>
  </div>
);
