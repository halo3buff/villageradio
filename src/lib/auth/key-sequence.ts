/**
 * Advances a key-sequence matcher by one keypress. Returns the new position; when it equals
 * `sequence.length` the sequence is complete. A wrong key resets to 0 — unless it matches the
 * first key, in which case it restarts at 1 (so a fresh attempt isn't swallowed). Pure + testable.
 */
export function advance(pos: number, key: string, sequence: readonly string[]): number {
  if (key === sequence[pos]) return pos + 1;
  if (key === sequence[0]) return 1;
  return 0;
}
