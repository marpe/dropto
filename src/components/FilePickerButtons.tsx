import React, { useRef } from 'react';
import type { RefObject } from 'react';
import { FileUp, FolderUp } from 'lucide-react';
import { Button } from './ui/Button';

interface FilePickerButtonsProps {
  onAddFiles: (files: File[]) => void;
  /** Lets other controls (e.g. the approval dialog) open the file picker */
  fileInputRef: RefObject<HTMLInputElement | null>;
  size?: 'sm' | 'md';
}

function addFromInput(event: React.ChangeEvent<HTMLInputElement>, onAddFiles: (files: File[]) => void) {
  if (event.target.files && event.target.files.length > 0) {
    onAddFiles(Array.from(event.target.files));
  }
  // Picking the same file again after removing it must fire another change event
  event.target.value = '';
}

/** "File" and "Folder": the two ways to pick what to send, next to dropping anywhere on the page. */
export const FilePickerButtons: React.FC<FilePickerButtonsProps> = ({ onAddFiles, fileInputRef, size = 'md' }) => {
  const folderInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => addFromInput(e, onAddFiles)} />
      <Button data-testid="pick-files" size={size} onClick={() => fileInputRef.current?.click()}>
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
      <Button data-testid="pick-folder" variant="secondary" size={size} onClick={() => folderInputRef.current?.click()}>
        <FolderUp className="w-4 h-4" />
        <span>Folder</span>
      </Button>
    </>
  );
};
