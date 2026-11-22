// The mixer's finished file, passed to the broadcast page's "Add to the lineup" on a client navigation.
let pending: File | null = null;

export const handMix = (f: File) => { pending = f; };
export function takeMix(): File | null {
  const f = pending;
  pending = null;
  return f;
}
