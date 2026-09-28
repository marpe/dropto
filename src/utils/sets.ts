/** A copy of `set` with `item` removed if it was there, or added if it was not. */
export function toggleInSet<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(item)) {
    next.add(item);
  }
  return next;
}
