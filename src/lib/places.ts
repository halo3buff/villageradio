import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** public/map/places.json (scripts/build-places.py): Palestinian cities, towns, villages and
 *  Gaza neighbourhoods, read once per server instance. */
export type Place = [en: string, ar: string, lon: number, lat: number, rank: number, gov: string, gaza: 0 | 1,
  site?: string, siteType?: string, siteKm?: number | null, outposts3?: number];

let places: Promise<Place[]> | null = null;
export const loadPlaces = () => (places ??= readFile(path.join(process.cwd(), 'public', 'map', 'places.json'), 'utf8')
  .then(s => JSON.parse(s) as Place[]));
