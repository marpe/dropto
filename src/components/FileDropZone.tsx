import React, { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { UploadCloud, FolderUp, FileUp } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '../utils/cn';

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
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        'group border-2 border-dashed rounded-3xl text-center transition-[transform,border-color,background-color,box-shadow]',
        isCompact ? 'p-5' : 'p-8',
        isDragging
          ? 'border-brand-500 bg-brand-500/10 motion-safe:scale-[1.01] shadow-xl shadow-brand-500/10'
          : 'border-zinc-200 dark:border-zinc-800 hover:border-brand-500/60 bg-white dark:bg-supabase-surface'
      )}
    >
      {!isCompact && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 flex items-center justify-center shadow-inner motion-safe:group-hover:scale-110 transition-transform">
            <UploadCloud className="w-8 h-8 motion-safe:animate-float" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">Drag & Drop files or directories here</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto">
            Up to 10GB+ per file. Direct WebRTC streaming with zero cloud storage.
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
        <Button size={isCompact ? 'sm' : 'md'} onClick={() => fileInputRef.current?.click()}>
          <FileUp className="w-4 h-4" />
          <span>Select Files</span>
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
        <Button variant="secondary" size={isCompact ? 'sm' : 'md'} onClick={() => folderInputRef.current?.click()}>
          <FolderUp className="w-4 h-4" />
          <span>Select Folder</span>
        </Button>
        {isCompact && <span className="text-xs text-zinc-500 dark:text-zinc-400">or drop more here</span>}
      </div>
    </div>
  );
};
