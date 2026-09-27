/** Pickers and the share sheet reject with AbortError when the user simply closes them. */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}
