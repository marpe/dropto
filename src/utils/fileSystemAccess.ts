// @env browser

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

/** File System Access pickers: Chromium only, so they are feature-detected and not in lib.dom yet. */
type FileSystemAccessWindow = Window & {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
};

export function supportsSaveFilePicker(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Only call after the matching `supports…()` check. */
export function fileSystemAccess(): FileSystemAccessWindow {
  return window as unknown as FileSystemAccessWindow;
}

export type { SaveFilePickerOptions };
