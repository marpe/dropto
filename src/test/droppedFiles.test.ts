import { describe, it, expect } from 'vitest';
import { collectDroppedFiles } from '../utils/droppedFiles';

interface FakeEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (onSuccess: (file: File) => void) => void;
  createReader?: () => { readEntries: (onSuccess: (entries: FakeEntry[]) => void) => void };
}

function fileEntry(name: string): FakeEntry {
  return { isFile: true, isDirectory: false, name, file: (onSuccess) => onSuccess(new File([name], name)) };
}

/** Browsers hand out directory listings in batches; an empty batch ends the listing. */
function directoryEntry(name: string, children: FakeEntry[], batchSize = 1): FakeEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (onSuccess) => {
          const batch = children.slice(offset, offset + batchSize);
          offset += batchSize;
          onSuccess(batch);
        },
      };
    },
  };
}

function dataTransferWith(entries: FakeEntry[]) {
  return {
    files: [] as unknown as FileList,
    items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })),
  } as unknown as DataTransfer;
}

describe('collectDroppedFiles', () => {
  it('walks dropped folders and keeps each file’s path inside them', async () => {
    const dropped = dataTransferWith([
      fileEntry('notes.txt'),
      directoryEntry('photos', [fileEntry('a.jpg'), directoryEntry('raw', [fileEntry('b.cr2')]), fileEntry('c.jpg')]),
    ]);

    const files = await collectDroppedFiles(dropped);

    expect(files.map((file) => file.webkitRelativePath || file.name)).toEqual([
      'notes.txt',
      'photos/a.jpg',
      'photos/raw/b.cr2',
      'photos/c.jpg',
    ]);
  });

  it('falls back to the plain file list when the browser has no entry API', async () => {
    const plain = new File(['x'], 'plain.txt');
    const dropped = { files: [plain], items: undefined } as unknown as DataTransfer;

    expect(await collectDroppedFiles(dropped)).toEqual([plain]);
  });
});
