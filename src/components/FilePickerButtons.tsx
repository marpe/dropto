import React, { useRef } from 'react';
import type { RefObject } from 'react';
import { File, Folder } from 'lucide-react';
import { Button } from './ui/Button';
import type { AddFiles } from '../types/transfer';
import { pickFilesWithHandles, pickFolderWithHandles, supportsHandlePersistence } from '../utils/fileHandles';

interface FilePickerButtonsProps {
  onAddFiles: AddFiles;
  /** Lets other controls (e.g. the approval dialog) open the file picker */
  fileInputRef: RefObject<HTMLInputElement | null>;
  size?: 'sm' | 'md';
}

function addFromInput(event: React.ChangeEvent<HTMLInputElement>, onAddFiles: AddFiles) {
  if (event.target.files && event.target.files.length > 0) {
    onAddFiles(Array.from(event.target.files));
  }
  // Picking the same file again after removing it must fire another change event
  event.target.value = '';
}

/**
 * Chromium's own pickers hand back file handles, which are kept so a reload can read the same files again;
 * elsewhere the plain file inputs are used.
 */
async function addPicked(pick: typeof pickFilesWithHandles, onAddFiles: AddFiles) {
  try {
    const picked = await pick();
    if (picked.length > 0) {
      onAddFiles(picked);
    }
  } catch (err) {
    console.error('Could not open the file picker:', err);
  }
}

/** "File" and "Folder": the two ways to pick what to send, next to dropping anywhere on the page. */
export const FilePickerButtons: React.FC<FilePickerButtonsProps> = ({ onAddFiles, fileInputRef, size = 'md' }) => {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const canKeepFiles = supportsHandlePersistence();
  const pickFiles = () => (canKeepFiles ? void addPicked(pickFilesWithHandles, onAddFiles) : fileInputRef.current?.click());
  const pickFolder = () =>
    canKeepFiles ? void addPicked(pickFolderWithHandles, onAddFiles) : folderInputRef.current?.click();

  return (
    <>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => addFromInput(e, onAddFiles)} />
      <Button data-testid="pick-files" variant="secondary" size={size} onClick={pickFiles}>
        <File className="w-4 h-4" />
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
      <Button data-testid="pick-folder" variant="secondary" size={size} onClick={pickFolder}>
        <Folder className="w-4 h-4" />
        <span>Folder</span>
      </Button>
    </>
  );
};
