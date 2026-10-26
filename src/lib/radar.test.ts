import { describe, expect, it } from 'vitest';
import { contacts, netTraffic } from './radar';

describe('netTraffic', () => {
  it('compares each point with the same time on earlier days and prints drops and recoveries', () => {
    const n = 4 * 96 + 3;
    const ts = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 9e5).toISOString().replace('.000', ''));
    const vs = Array.from({ length: n }, (_, i) => (i === 4 * 96 + 1 ? 0.3 : 1));
    const r = netTraffic(ts, vs);
    expect(r.lines.map(l => l.text)).toEqual([
      '26.01.05 00:15Z PS NET TRAFFIC DROP 30% OF USUAL',
      '26.01.05 00:30Z PS NET TRAFFIC BACK 100% OF USUAL',
    ]);
    expect(r.now).toEqual({ pct: 1, at: ts.at(-1) });
  });
});

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

