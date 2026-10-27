'use client';

import { useEffect, useMemo, useState } from 'react';
import { BackLink } from '@/components/BackLink';
import { advise, bearingKm, waterGap, type Day } from '@/lib/farm';
import { INK, PAPER, SCREEN } from './plateKit';

/**
 * Harvest Watch — for a farmer's own village: the week's weather read for picking,
 * spraying, frost and watering; fires the satellites saw nearby; the nearest
 * settlements and outposts; and who to call. Arabic first, English under it, plain
 * HTML so it works on a cheap phone. Weather comes straight from Open-Meteo for the
 * village's position; a shared location only picks the nearest village and stays here.
 */

type Place = [en: string, ar: string, lon: number, lat: number, rank: number, gov: string, gaza: 0 | 1,
  site: string, siteType: string, siteKm: number | null, outposts3: number];
type FirePt = { lat: number; lon: number; t: number; frp: number };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const AR = "'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif";
const NEAR_KM = 10;
const STORE = 'vlg-farm-village';
const DIRS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
const DIRS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const TYPE_AR: Record<string, string> = { Settlement: 'مستوطنة', Outpost: 'بؤرة استيطانية', Farm: 'بؤرة رعوية (مزرعة)', Tourism: 'موقع استيطاني سياحي', Other: 'موقع استيطاني' };

const weekday = (d: string) => new Intl.DateTimeFormat('ar', { weekday: 'long', timeZone: 'UTC' }).format(new Date(d));
const stamp = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hebron', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t * 1000));

const card: React.CSSProperties = { background: PAPER, color: INK, border: `1px solid ${INK}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 };
const head: React.CSSProperties = { background: SCREEN, color: '#e6e6e6', margin: '-14px -16px 4px', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 };
const en: React.CSSProperties = { fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em', opacity: 0.8, direction: 'ltr', unicodeBidi: 'isolate' };

function H({ ar, children }: { ar: string; children: string }) {
  return <div style={head}><b style={{ fontSize: 17 }}>{ar}</b><span style={{ ...en, opacity: 1 }}>{children}</span></div>;
}

function Chip({ ok, ar, children }: { ok: boolean | 'warn'; ar: string; children: string }) {
  const bg = ok === 'warn' ? '#7a2a10' : ok ? INK : 'transparent';
  return (
    <span style={{ border: `1px solid ${ok === 'warn' ? '#7a2a10' : INK}`, background: bg, color: ok ? PAPER : INK, padding: '1px 6px', fontSize: 13, whiteSpace: 'nowrap' }}>
      {ar} <span style={{ ...en, fontSize: 9, opacity: 0.85 }}>{children}</span>
    </span>
  );
}

export function FarmWatch({ fires }: { fires: FirePt[] }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [key, setKey] = useState('');
  const [days, setDays] = useState<Day[] | null | 'error'>(null);
  const [locating, setLocating] = useState<'' | 'busy' | 'denied'>('');

  useEffect(() => {
    fetch('/map/places.json').then(r => r.json()).then(setPlaces).catch(() => setPlaces([]));
    try { setKey(localStorage.getItem(STORE) ?? ''); } catch { /* private mode */ }
  }, []);

  const place = places?.find(p => `${p[0]}|${p[5]}` === key) ?? null;
  const choose = (k: string) => {
    setKey(k);
    try { localStorage.setItem(STORE, k); } catch { /* private mode */ }
  };

  useEffect(() => {
    if (!place) return;
    setDays(null);
    const q = new URLSearchParams({
      latitude: String(place[3]), longitude: String(place[2]), timezone: 'Asia/Hebron', forecast_days: '7',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration',
    });
    let live = true;
    fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then(r => r.json()).then(j => {
      if (!live) return;
      const d = j.daily;
      setDays(d.time.map((date: string, i: number) => ({
        date, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_sum[i] ?? 0,
        chance: d.precipitation_probability_max[i] ?? 0, wind: d.wind_speed_10m_max[i], et0: d.et0_fao_evapotranspiration[i] ?? 0,
      })));
    }).catch(() => live && setDays('error'));
    return () => { live = false; };
  }, [place]);

  const locate = () => {
    if (!navigator.geolocation || !places) return setLocating('denied');
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(pos => {
      const { longitude: lon, latitude: lat } = pos.coords;
      let best = places[0], bd = Infinity;
      for (const p of places) { const d = bearingKm(lon, lat, p[2], p[3]).km; if (d < bd) { bd = d; best = p; } }
      choose(`${best[0]}|${best[5]}`);
      setLocating('');
    }, () => setLocating('denied'), { timeout: 15000, maximumAge: 600000 });
  };

  const near = useMemo(() => place
    ? fires.map(f => ({ ...f, ...bearingKm(place[2], place[3], f.lon, f.lat) })).filter(f => f.km <= NEAR_KM).sort((a, b) => b.t - a.t)
    : [], [place, fires]);
  const groups = useMemo(() => {
    const g = new Map<string, Place[]>();
    for (const p of places ?? []) g.set(p[5], [...(g.get(p[5]) ?? []), p]);
    return [...g];
  }, [places]);

  return (
    <main dir="rtl" lang="ar" style={{
      position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', background: 'var(--vlg-bg, #fff)',
      color: 'var(--vlg-fg, #000)', fontFamily: AR, fontSize: 15, lineHeight: 1.6,
    }}>
      <BackLink href="/" style={{ position: 'fixed', top: 24, left: 24, fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', textDecoration: 'none', direction: 'ltr' }}>
        BACK
      </BackLink>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '64px 16px 120px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 28 }}>مراقبة الموسم <span style={{ ...en, fontSize: 13 }}>HARVEST WATCH</span></h1>
          <p style={{ margin: '4px 0 0' }}>الطقس، والحرائق القريبة، والمستوطنات المجاورة، وأين تجد المساعدة — لقريتك.</p>
          <p style={{ ...en, margin: 0 }}>Weather, nearby fires, neighbouring settlements and where to get help, for your village.</p>
        </header>

        <section style={card}>
          <H ar="قريتك">YOUR VILLAGE</H>
          <select value={key} onChange={e => choose(e.target.value)} aria-label="اختر قريتك — choose your village"
            style={{ fontFamily: AR, fontSize: 16, padding: '8px', background: '#fff', color: INK, border: `1px solid ${INK}`, width: '100%' }}>
            <option value="">{places ? 'اختر قريتك — Choose your village' : '...'}</option>
            {groups.map(([gov, ps]) => (
              <optgroup key={gov} label={gov}>
                {ps.map(p => <option key={`${p[0]}|${p[5]}`} value={`${p[0]}|${p[5]}`}>{p[1]} — {p[0]}</option>)}
              </optgroup>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={locate} disabled={!places || locating === 'busy'}
              style={{ fontFamily: AR, fontSize: 15, padding: '6px 14px', background: INK, color: PAPER, border: 'none', cursor: 'pointer' }}>
              {locating === 'busy' ? '...' : 'استخدم موقعي'} <span style={{ ...en, fontSize: 10 }}>USE MY LOCATION</span>
            </button>
            <span style={{ fontSize: 13 }}>
              {locating === 'denied' ? 'تعذّر تحديد الموقع — اختر من القائمة.' : 'موقعك يبقى على هاتفك ولا يُرسل لأحد.'}
              <span style={{ ...en, display: 'block', fontSize: 10 }}>
                {locating === 'denied' ? 'Could not get your location; pick from the list.' : 'Your location stays on your phone; it is never sent anywhere.'}
              </span>
            </span>
          </div>
        </section>

        {place && (
          <>
            <section style={card}>
              <H ar="الطقس — ٧ أيام">WEATHER — 7 DAYS</H>
              {days === null && <span>...</span>}
              {days === 'error' && <span>تعذّر تحميل الطقس. <span style={en}>Weather unavailable.</span></span>}
              {Array.isArray(days) && (
                <>
                  {days.map((d, i) => {
                    const a = advise(d, days[i + 1]);
                    return (
                      <div key={d.date} style={{ borderTop: i ? `1px dashed ${INK}` : 'none', paddingTop: i ? 8 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <b>{i === 0 ? 'اليوم' : weekday(d.date)}</b>
                          <span style={{ ...en, fontSize: 12, opacity: 1 }}>
                            {Math.round(d.max)}° / {Math.round(d.min)}°  ·  RAIN {d.rain.toFixed(1)} MM ({d.chance}%)  ·  WIND {Math.round(d.wind)} KM/H
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {a.pick ? <Chip ok ar="مناسب للقطاف">GOOD FOR PICKING</Chip> : <Chip ok={false} ar="مطر أو رياح — أجّل القطاف">WET/WINDY — HOLD PICKING</Chip>}
                          {a.spray && <Chip ok ar="مناسب للرش">GOOD FOR SPRAYING</Chip>}
                          {a.frost && <Chip ok="warn" ar="خطر صقيع">FROST RISK</Chip>}
                          {a.heat && <Chip ok="warn" ar="حرّ شديد — اسقِ صباحاً">HEAT — WATER EARLY</Chip>}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 8 }}>
                    حاجة الري هذا الأسبوع: حوالي <b>{waterGap(days)}</b> ملم ({waterGap(days)} لتر لكل متر مربع) بعد احتساب المطر.
                    <span style={{ ...en, display: 'block' }}>Water need this week: about {waterGap(days)} mm ({waterGap(days)} litres per m²) after forecast rain.</span>
                  </div>
                </>
              )}
            </section>

            <section style={card}>
              <H ar="حرائق رصدتها الأقمار الصناعية">SATELLITE FIRES — 7 DAYS</H>
              {near.length ? (
                <>
                  <span>{near.length} رصد ضمن {NEAR_KM} كم من {place[1]}:</span>
                  {near.slice(0, 12).map(f => (
                    <div key={`${f.t}${f.lat}${f.lon}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{f.km.toFixed(1)} كم {DIRS[f.dir]}</span>
                      <span style={{ ...en, opacity: 1 }}>{stamp(f.t)} · {f.km.toFixed(1)} KM {DIRS_EN[f.dir]} · {Math.round(f.frp * 10) / 10} MW</span>
                    </div>
                  ))}
                </>
              ) : (
                <span>لا حرائق رُصدت ضمن {NEAR_KM} كم من {place[1]} خلال ٧ أيام. <span style={{ ...en, display: 'block' }}>No fires seen within {NEAR_KM} km in the past 7 days.</span></span>
              )}
              <span style={{ fontSize: 12.5 }}>
                في كل المنطقة: {fires.length} رصد. تمرّ الأقمار الصناعية عدة مرات يومياً وتظهر الحرائق بعد نحو ٣ ساعات؛ قد تفوتها الحرائق الصغيرة أو القصيرة، وقد يكون مصدر الحرارة حرق نفايات أو غيره.
                <span style={{ ...en, display: 'block', fontSize: 10 }}>
                  {fires.length} detections across Gaza and the West Bank. Satellites pass a few times a day and fires show ~3 h later; small or brief fires can be missed, and some heat is rubbish burning or industry. Times are local.
                </span>
              </span>
            </section>

            {!place[6] && place[9] != null && (
              <section style={card}>
                <H ar="المستوطنات القريبة">NEARBY SETTLEMENTS</H>
                <span>أقرب موقع استيطاني: <b style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{place[7]}</b> ({TYPE_AR[place[8]] ?? place[8]}) على بعد <b>{place[9]}</b> كم.</span>
                <span>بؤر استيطانية ومزارع رعوية ضمن ٣ كم: <b>{place[10]}</b></span>
                <span style={{ ...en }}>Nearest: {place[7]} ({place[8]}), {place[9]} km. Outposts and farm outposts within 3 km: {place[10]}. Peace Now survey, Nov 2024.</span>
                {(place[10] > 0 || place[9] < 3) && (
                  <div style={{ border: '1px solid #7a2a10', padding: '8px 10px', color: '#7a2a10' }}>
                    الأراضي القريبة من البؤر الاستيطانية تتعرّض لاعتداءات أكثر في موسم القطاف. لا تقطف وحدك، أخبر أحداً بمكانك ووقت عودتك، ونسّق مع منظمات المرافقة أدناه.
                    <span style={{ ...en, display: 'block', fontSize: 10 }}>Land near outposts sees more attacks at harvest. Don’t pick alone, tell someone where you are and when you’ll be back, and arrange accompaniment (below).</span>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        <section style={card}>
          <H ar="طوارئ ومساعدة">EMERGENCY & HELP</H>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 16 }}>
            <a href="tel:101" style={{ color: INK }}><b style={{ fontFamily: MONO }}>101</b> الإسعاف</a>
            <a href="tel:102" style={{ color: INK }}><b style={{ fontFamily: MONO }}>102</b> الدفاع المدني</a>
            <a href="tel:100" style={{ color: INK }}><b style={{ fontFamily: MONO }}>100</b> الشرطة</a>
          </div>
          <span style={en}>101 ambulance (Red Crescent) · 102 civil defence · 100 police</span>
          {[
            ['حاخامات من أجل حقوق الإنسان', 'مرافقة المزارعين أثناء القطاف', 'Rabbis for Human Rights — harvest accompaniment', 'https://www.rhr.org.il/eng'],
            ['حركة التضامن الدولية', 'متطوعون للحضور الحمائي', 'ISM — protective-presence volunteers', 'https://palsolidarity.org'],
            ['بتسيلم', 'توثيق الاعتداءات بالفيديو ونشرها', 'B’Tselem — documents attacks, collects video', 'https://www.btselem.org'],
            ['يش دين', 'مساعدة قانونية لتقديم الشكاوى', 'Yesh Din — legal aid to file complaints', 'https://www.yesh-din.org/en'],
            ['الحق', 'توثيق انتهاكات حقوق الإنسان', 'Al-Haq — documents rights violations', 'https://www.alhaq.org'],
          ].map(([name, what, eng, href]) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" style={{ color: INK, textDecoration: 'none', borderTop: `1px dashed ${INK}`, paddingTop: 6 }}>
              <b>{name}</b> — {what}
              <span style={{ ...en, display: 'block' }}>{eng} ↗</span>
            </a>
          ))}
        </section>

        <section style={card}>
          <H ar="إذا تعرّضت لاعتداء">IF YOU ARE ATTACKED</H>
          <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>سلامتك أولاً. صوّر من مسافة آمنة فقط. <span style={en}>Safety first; film only from a safe distance.</span></li>
            <li>صوّر الوجوه والمركبات ولوحات الأرقام والمكان، وقل الوقت والتاريخ بصوتك. <span style={en}>Film faces, vehicles, plates and the place; say the time and date aloud.</span></li>
            <li>أرسل نسخة فوراً لشخص تثق به أو لمنظمة توثيق — قد يُصادر الهاتف. <span style={en}>Send a copy straight away to someone you trust or a documentation group; phones get taken.</span></li>
            <li>لا تنشر وجوه المصابين دون إذنهم. <span style={en}>Don’t post the injured’s faces without their consent.</span></li>
          </ol>
        </section>

        <footer style={{ ...en, fontSize: 10 }}>
          SOURCES: OPEN-METEO (WEATHER) · NASA FIRMS VIIRS (FIRES) · PEACE NOW (SETTLEMENTS, 11.2024) · © OPENSTREETMAP CONTRIBUTORS (VILLAGES)
        </footer>
      </div>
    </main>
  );
}
