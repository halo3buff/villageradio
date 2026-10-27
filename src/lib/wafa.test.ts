import { describe, expect, it } from 'vitest';
import { toAlerts } from './alerts';
import type { Place } from './places';
import { locate, parsePage, tagsOf } from './wafa';

const P = (en: string, ar: string, rank: number, gaza: 0 | 1 = 0): Place => [en, ar, 35, 32, rank, 'X', gaza];
const places = [P('Hebron', 'الخليل', 0), P('Dura', 'دورا', 1), P('As Samu\'', 'السموع‎', 2), P('Gaza', 'غزة', 0, 1), P('Noa', 'نوع', 2)];

describe('wafa', () => {
  it('sorts reports by what happened, most serious first, and skips non-incidents', () => {
    expect(tagsOf('الاحتلال يعتقل مواطنين عقب هجوم للمستعمرين في دورا')).toEqual(['SETTLERS', 'ARREST']);
    expect(tagsOf('ارتفع عدد المصابين إلى ثلاثة، جراء اقتحام قوات الاحتلال مخيم قلنديا')).toEqual(['INJURED', 'RAID']);
    expect(tagsOf('هدمت قوات الاحتلال منزل المواطن')).toEqual(['DEMOLITION']);
    expect(tagsOf('حذرت دائرة الأرصاد الجوية من عدم الاستقرار الجوي')).toEqual([]);
  });

  it('places a report at the smallest place it names, with prefixes, not inside other words', () => {
    expect(locate('هجوم للمستعمرين في دورا جنوب غرب الخليل', places).place?.[0]).toBe('Dura');
    expect(locate('سرقة ثمار الزيتون شرقي بلدة السموع، جنوب الخليل', places).place?.[0]).toBe('As Samu\'');
    expect(locate('اقتحمت قوات الاحتلال مدينة الخليل', places).place?.[0]).toBe('Hebron');
    expect(locate('بالخليل', places).place?.[0]).toBe('Hebron');
    expect(locate('أنواع من القنابل', places).place).toBeNull();     // نوع inside a word
  });

  it('marks "Gaza Strip" as Gaza without placing it at Gaza City', () => {
    expect(locate('غارة على قطاع غزة', places)).toEqual({ place: null, gaza: true });
    expect(locate('الحرب على غزة', places)).toEqual({ place: null, gaza: true });
    expect(locate('قصف مدينة غزة', places).place?.[0]).toBe('Gaza');
  });

  it('reads posts from the channel preview', () => {
    const html = `<div data-post="WAFAgency/7" x><div class="tgme_widget_message_text js-message_text" dir="auto">هدم<br/>منزل التفاصيل: https://www.wafa.ps/news/1</div><time datetime="2026-10-26T21:57:35+00:00"></time>`
      + `<div data-post="WAFAgency/8"><time datetime="2026-10-26T22:00:00+00:00"></time>`;
    expect(parsePage(html)).toEqual([{ id: 7, t: Date.parse('2026-10-26T21:57:35Z') / 1000, text: 'هدم منزل', url: 'https://www.wafa.ps/news/1' }]);
  });
});

describe('alerts', () => {
  it('groups by threat, drops drills and places cities', () => {
    const table = { 'נחל עוז': { en: 'Nachal Oz', lat: 31.47, lng: 34.5 } };
    const out = toAlerts([
      { id: 1, alerts: [{ time: 10, cities: ['נחל עוז', 'unknown'], threat: 0, isDrill: false }, { time: 9, cities: ['נחל עוז'], threat: 0, isDrill: false }] },
      { id: 2, alerts: [{ time: 20, cities: ['נחל עוז'], threat: 5, isDrill: true }] },
    ], table);
    expect(out).toEqual([{ id: '1-0', t: 9, threat: 'ROCKETS', cities: [{ en: 'Nachal Oz', lat: 31.47, lon: 34.5 }] }]);
  });
});
