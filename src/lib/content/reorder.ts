// Generic, pure array-reordering helpers shared by the broadcast / photo / work editors.
// All return a new array (no mutation) and no-op on out-of-range indices, so the client
// editors can stay thin shells over unit-testable logic (node env, no jsdom).

/** Relocate the item at `from` to `to`. Returns a new array; no-op if either index is bad. */
export function moveTo<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items.slice();
  next.splice(to, 0, moved);
  return next;
}

/** Swap the item at `index` with the one above it. No-op at the top. Returns a new array. */
export function moveUp<T>(items: T[], index: number): T[] {
  if (index <= 0 || index >= items.length) return items.slice();
  return moveTo(items, index, index - 1);
}

/** Swap the item at `index` with the one below it. No-op at the bottom. Returns a new array. */
export function moveDown<T>(items: T[], index: number): T[] {
  if (index < 0 || index >= items.length - 1) return items.slice();
  return moveTo(items, index, index + 1);
}

/**
 * Reassign each item's `order` to its array position. Photos/work persist an explicit `order`
 * field (unlike broadcast, whose order IS the array order), so call this after a reorder/add/
 * remove before validating and publishing. Returns a new array; inputs are untouched.
 */
export function reindexOrder<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, i) => ({ ...item, order: i }));
}
