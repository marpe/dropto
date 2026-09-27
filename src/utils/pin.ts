/** A random 4-digit PIN, so senders are not tempted to reuse 1234. */
export function generatePin(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  // 2^32 is not a multiple of 10,000; the resulting bias (under one in 400,000) does not matter here
  return String(value % 10_000).padStart(4, '0');
}
