import { useEffect, useRef, useState } from 'react';
import { collectDroppedFiles } from '../utils/droppedFiles';

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));
}

/**
 * Lets files be dropped (or pasted) anywhere on the page. `onFiles` is null while files can't be added;
 * drops are still swallowed then, because the browser's default is to open the file and lose the session.
 */
export function usePageFileDrop(onFiles: ((files: File[]) => void) | null) {
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
      collectDroppedFiles(event.dataTransfer)
        .then((files) => {
          if (files.length > 0) {
            addFiles(files);
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
