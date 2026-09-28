import { useEffect, useRef, useState } from 'react';
import type { AddFiles, IncomingFile } from '../types/transfer';
import { collectDroppedFiles } from '../utils/droppedFiles';
import { handlesFromDrop } from '../utils/fileHandles';

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Pairs dropped files with the handles Chromium gives for what was dropped, so they can be read again after a
 * reload. Only files dropped as themselves have one; files inside a dropped folder go without.
 */
function withDropHandles(files: File[], handles: (FileSystemHandle | null)[]): IncomingFile[] {
  const byName = new Map(
    handles.flatMap((handle) => (handle?.kind === 'file' ? [[handle.name, handle as FileSystemFileHandle] as const] : []))
  );
  return files.map((file) => ({ file, handle: file.webkitRelativePath ? undefined : byName.get(file.name) }));
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));
}

/**
 * Lets files be dropped (or pasted) anywhere on the page. `onFiles` is null while files can't be added;
 * drops are still swallowed then, because the browser's default is to open the file and lose the session.
 */
export function usePageFileDrop(onFiles: AddFiles | null) {
  const [isDragging, setIsDragging] = useState(false);
  const onFilesRef = useRef(onFiles);
  // dragenter/dragleave fire for every child element crossed; only the outermost pair matters
  const dragDepthRef = useRef(0);

  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current++;
      setIsDragging(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (carriesFiles(event)) {
        event.preventDefault();
      }
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) {
        return;
      }
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    };
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      const addFiles = onFilesRef.current;
      if (!addFiles || !event.dataTransfer) {
        return;
      }
      // Both read the drop synchronously before their first await; the DataTransfer is emptied afterwards
      const collecting = collectDroppedFiles(event.dataTransfer);
      const takingHandles = event.dataTransfer.items ? handlesFromDrop(event.dataTransfer.items) : Promise.resolve([]);
      Promise.all([collecting, takingHandles])
        .then(([files, handles]) => {
          if (files.length > 0) {
            addFiles(withDropHandles(files, handles));
          }
        })
        .catch((err) => console.error('Could not read the dropped files:', err));
    };
    const handlePaste = (event: ClipboardEvent) => {
      const addFiles = onFilesRef.current;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!addFiles || files.length === 0 || isTextField(event.target)) {
        return;
      }
      event.preventDefault();
      addFiles(files);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  return { isDraggingFiles: isDragging && onFiles !== null };
}
