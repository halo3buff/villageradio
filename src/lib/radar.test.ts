import { describe, expect, it } from 'vitest';
import { contacts, rebin, status } from './radar';

describe('contacts', () => {
  it('turns cumulative reports into per-report deltas, skipping fills and the out-of-window', () => {
    const rows = [
      { report_date: '2025-01-01', killed_cum: 1, settler_attacks_cum: 1 },
      { report_date: '2026-01-01', killed_cum: 2, settler_attacks_cum: 3 },
      { report_date: '2026-01-02', killed_cum: 2, settler_attacks_cum: 3, flash_source: 'fill' },
      { report_date: '2026-01-08', killed_cum: 4, settler_attacks_cum: 3, displaced_persons_cum: 7 },
      { report_date: '2026-01-09', killed_cum: 4, settler_attacks_cum: 3, displaced_persons_cum: 7 },
    ];
    expect(contacts(rows, '2026-01-10')).toEqual([
      { date: '2026-01-01', killed: 1, injured: 0, attacks: 2, displaced: 0 },
      // a series that first appears isn't counted as one big jump
      { date: '2026-01-08', killed: 2, injured: 0, attacks: 0, displaced: 0 },
    ]);
  });
});

describe('signal', () => {
  it('rebins into hourly means, leaving empty hours null', () => {
    expect(rebin({ from: 0, step: 1800, values: [2, 4, null, null, 6] }, 0, 3)).toEqual([3, null, 6]);
  });
  it('reads OUTAGE from IODA events, DEGRADED from a routing drop', () => {
    const r = { name: 'X', bgp: [100, 100, 100, 80], ping: [], outages: [] as { start: number; end: number; source: string }[] };
    expect(status(r, 1e6)).toBe('DEGRADED');
    expect(status({ ...r, bgp: [100, 100, 99] }, 1e6)).toBe('NOMINAL');
    expect(status({ ...r, outages: [{ start: 0, end: 1e6 - 60, source: 'bgp' }] }, 1e6)).toBe('OUTAGE');
  });
});
