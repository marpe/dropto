/** The files a transfer actually covers: the chosen indices, or all of them when nothing was chosen. */
export function pickFiles<T>(files: T[], fileIndices: number[] | null): T[] {
  return fileIndices ? fileIndices.flatMap((index) => (index < files.length ? [files[index]] : [])) : files;
}
