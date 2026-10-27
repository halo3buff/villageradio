/** Harvest Watch's rules of thumb: what a day's forecast means for picking, spraying and frost. */

export type Day = { date: string; max: number; min: number; rain: number; chance: number; wind: number; et0: number };
export type Advice = { pick: boolean; spray: boolean; frost: boolean; heat: boolean };

/** `next` is the day after, so a spray isn't washed off overnight. */
export function advise(d: Day, next?: Day): Advice {
  const wet = d.rain >= 0.5 || d.chance >= 40;
  return {
    pick: !wet && d.wind < 30,                                   // wet olives bruise and mould in the sack
    spray: !wet && d.wind < 15 && d.max < 30 && (!next || next.chance < 40),
    frost: d.min <= 2,
    heat: d.max >= 35,
  };
}

/** Water the crop loses this week beyond the rain forecast, in mm (a litre per square metre). */
export const waterGap = (days: Day[]) => Math.max(0, Math.round(days.reduce((a, d) => a + d.et0 - d.rain, 0)));

/** Distance in km and compass point from (lon0, lat0) to (lon, lat). */
export function bearingKm(lon0: number, lat0: number, lon: number, lat: number) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  const dx = (lon - lon0) * k, dy = lat - lat0;
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return { km: Math.hypot(dx, dy) * 111, dir: Math.round(deg / 45) % 8 };
}
