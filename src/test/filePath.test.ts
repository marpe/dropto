import { describe, it, expect } from 'vitest';
import { displayPath, fileExtension } from '../utils/filePath';

describe('displayPath', () => {
  it('prefers the path inside a shared folder over the bare name', () => {
    expect(displayPath({ name: 'a.txt', relativePath: 'docs/a.txt' })).toBe('docs/a.txt');
    expect(displayPath({ name: 'a.txt' })).toBe('a.txt');
  });
});

describe('fileExtension', () => {
  it.each([
    ['report.pdf', 'pdf'],
    ['archive.tar.gz', 'gz'],
    ['Photo.JPG', 'jpg'],
    ['README', ''],
    ['.env', ''],
    ['trailing.', ''],
    ['notes.from-the-meeting', ''],
  ])('%s → "%s"', (name, expected) => {
    expect(fileExtension(name)).toBe(expected);
  });
});
