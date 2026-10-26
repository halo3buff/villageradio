/** ADS-B contacts for the airspace scope. */

export const AIR_BOX = { w: 33.9, e: 36.0, s: 30.9, n: 33.4 };   // matches scripts/build-map.py

/** How often the server takes a fresh fix: adsb.lol's keyless allowance is 500 calls a day.
 *  With a feed that allows more (airplanes.live, 1/s once approved), drop this to 5000. */
export const FIX_EVERY = 180_000;

export type Aircraft = {
  hex: string; flight: string; type: string; reg: string;
  lat: number; lon: number; alt: number | null; gs: number; track: number;
  mil: boolean;
};

type Raw = {
  hex: string; flight?: string; t?: string; r?: string; lat?: number; lon?: number;
  alt_baro?: number | 'ground'; gs?: number; track?: number; true_heading?: number; dbFlags?: number;
};

/** readsb's records → the scope's contacts: positioned, inside the box. dbFlags bit 0 = military. */
export function aircraft(raw: Raw[], box = AIR_BOX): Aircraft[] {
  return raw
    .filter(a => a.lat != null && a.lon != null && a.lat > box.s && a.lat < box.n && a.lon > box.w && a.lon < box.e)
    .map(a => ({
      hex: a.hex,
      flight: (a.flight ?? '').trim(),
      type: a.t ?? '',
      reg: a.r ?? '',
      lat: a.lat!, lon: a.lon!,
      alt: typeof a.alt_baro === 'number' ? a.alt_baro : a.alt_baro === 'ground' ? 0 : null,
      gs: a.gs ?? 0,
      track: a.track ?? a.true_heading ?? 0,
      mil: ((a.dbFlags ?? 0) & 1) === 1,
    }));
}
