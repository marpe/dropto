import React, { useRef } from 'react';
import type { RefObject } from 'react';
import { UploadCloud, FolderUp, FileUp } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { cn } from '../utils/cn';

// Line breaks may only fall between facts, never inside one
const FACTS = ['Files or whole folders, any size', 'No account', 'Nothing stored', 'Straight from your device to theirs'];

interface FileDropZoneProps {
  onAddFiles: (files: File[]) => void;
  /** Lets other controls (e.g. the approval dialog) open the file picker */
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** Shorter layout once files are queued, so the list stays in view */
  isCompact?: boolean;
}

function addFromInput(event: React.ChangeEvent<HTMLInputElement>, onAddFiles: (files: File[]) => void) {
  if (event.target.files && event.target.files.length > 0) {
    onAddFiles(Array.from(event.target.files));
  }
  // Picking the same file again after removing it must fire another change event
  event.target.value = '';
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onAddFiles, fileInputRef, isCompact = false }) => {
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Dropping is handled page-wide (usePageFileDrop); this is the visible invitation plus the pickers
  return (
    <div
      data-testid="drop-zone"
      className={cn(
        'group border-2 border-dashed rounded-3xl text-center transition-colors border-zinc-200 dark:border-zinc-800 hover:border-brand-500/60 bg-white dark:bg-supabase-surface',
        isCompact ? 'p-5' : 'p-8'
      )}
    >
      {!isCompact && (
        <>
          <IconBadge
            icon={UploadCloud}
            className="mx-auto mb-4 motion-safe:group-hover:scale-110 transition-transform"
            iconClassName="motion-safe:animate-float"
          />
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">Drop files to send</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 max-w-xl mx-auto">
            {FACTS.map((fact, index) => (
              <React.Fragment key={fact}>
                {index > 0 && ' · '}
                <span className="whitespace-nowrap">{fact}</span>
              </React.Fragment>
            ))}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFromInput(e, onAddFiles)}
        />
        <Button data-testid="pick-files" size={isCompact ? 'sm' : 'md'} onClick={() => fileInputRef.current?.click()}>
          <FileUp className="w-4 h-4" />
          <span>File</span>
        </Button>

        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error: non-standard attribute that enables folder picking
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={(e) => addFromInput(e, onAddFiles)}
        />
        <Button
          data-testid="pick-folder"
          variant="secondary"
          size={isCompact ? 'sm' : 'md'}
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderUp className="w-4 h-4" />
          <span>Folder</span>
        </Button>
        {isCompact && <span className="text-xs text-zinc-500 dark:text-zinc-400">or drop more anywhere</span>}
      </div>
    </div>
  );
};
