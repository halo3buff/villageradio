// Shared id-uniquifying logic for the content manifests. Broadcast entries, photos, and work
// projects all derive a human-readable base id (from a filename / key / title) then need the
// same collision-suffix scheme — keep it in one place (matches the seed's `inter-1b` convention).

/**
 * Return `base` if it isn't already taken, else append a suffix: `b`, `c`, … through `z`, then
 * `-2`, `-3`, … . Deterministic and pure.
 */
export function uniqueSuffix(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let c = 'b'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
    const candidate = base + String.fromCharCode(c);
    if (!set.has(candidate)) return candidate;
  }
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
