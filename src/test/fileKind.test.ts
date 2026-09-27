import { describe, it, expect } from 'vitest';
import { getFileKind } from '../utils/fileKind';

describe('getFileKind', () => {
  it.each([
    ['holiday.JPG', 'image'],
    ['clip.mkv', 'video'],
    ['song.flac', 'audio'],
    ['backup.tar.gz', 'archive'],
    ['report.pdf', 'pdf'],
    ['letter.docx', 'document'],
    ['budget.xlsx', 'spreadsheet'],
    ['deck.pptx', 'presentation'],
    ['main.tsx', 'code'],
    ['config.yaml', 'data'],
    ['notes.md', 'text'],
    ['Inter.woff2', 'font'],
    ['setup.exe', 'executable'],
    ['id_ed25519.pem', 'key'],
  ])('recognises %s by its extension', (name, kind) => {
    expect(getFileKind(name, 'application/octet-stream')).toBe(kind);
  });

  it('falls back to the MIME type when the name has no known extension', () => {
    expect(getFileKind('screenshot', 'image/png')).toBe('image');
    expect(getFileKind('recording', 'audio/webm')).toBe('audio');
  });

  it('treats unknown files as other', () => {
    expect(getFileKind('README', 'application/octet-stream')).toBe('other');
    expect(getFileKind('.env.local', '')).toBe('other');
  });
});
