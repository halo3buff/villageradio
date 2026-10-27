import { loadPlaces, type Place } from './places';

/**
 * Field reports from WAFA, the Palestinian news agency, as it posts them to its public
 * Telegram channel (read from Telegram's public web preview, no account): raids, arrests,
 * settler attacks, demolitions, shootings, strikes and killings, usually minutes after
 * they happen. Each post is sorted by keyword into what happened and placed at the
 * village or Gaza neighbourhood it names (public/map/places.json). Posts that aren't
 * incident reports (statements, weather) are left out.
 */

const CHANNEL = 'https://t.me/s/WAFAgency';
const UA = 'vlgfm.live radar console (+https://vlgfm.live)';
const KEEP_H = 72;          // hours of reports held
const POLL = 60_000;        // the channel's newest page, at most once a minute
const BACKFILL = 8;         // older pages read on a cold start (20 posts each)

export type Tag = 'KILLED' | 'STRIKE' | 'SETTLERS' | 'DEMOLITION' | 'ARSON' | 'SHOOTING' | 'INJURED' | 'ARREST' | 'RAID';
export type Incident = {
  id: number; t: number;               // post id; unix seconds
  tags: Tag[];                         // most serious first
  text: string;                        // the report, Arabic, trimmed
  place: { en: string; ar: string; lon: number; lat: number } | null;
  gaza: boolean;
  url?: string;                        // the full article on wafa.ps
};

// most serious first; the first that matches leads the line
const TAGS: [Tag, RegExp][] = [
  ['KILLED', /استشهد|شهيد|شهداء|استشهاد|ارتقى|ارتقاء|مقتل/],
  ['STRIKE', /قصف|غار[ةه]|غارات|طائر[ةه] مسير|مسير[ةه] اسرائيليه|المدفعي|صاروخ/],
  ['SETTLERS', /مستعمر|مستوطن/],
  ['DEMOLITION', /هدم|تهدم|يهدم|جرف|تجريف/],
  ['ARSON', /احرق|احراق|حريق|اضرم/],
  ['SHOOTING', /الرصاص الحي|اطلق\S* النار|اطلاق النار|رصاص/],
  ['INJURED', /اصاب|اصيب|مصاب|جريح|جرحي/],
  ['ARREST', /اعتقل|اعتقال|تعتقل|يعتقل|احتجز|احتجاز/],
  ['RAID', /اقتحم|اقتحام|تقتحم|يقتحم|داهم|مداهم|تمركز|جابت|توغل/],
];

/** Arabic folded for matching: no diacritics or tatweel, one alef, ى→ي, ة→ه. */
export const fold = (s: string) => s
  .replace(/[ً-ٰٟـ‎‏]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

export function tagsOf(text: string): Tag[] {
  const f = fold(text);
  return TAGS.filter(([, re]) => re.test(f)).map(([t]) => t);
}

const LETTER = 'ء-ي';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "in the village of …": what a strict name (also an everyday word) must follow to count
const MARKER = '(?:و|ب|ل|ف)?(?:حي|بلده|قريه|مخيم|مدينه|خربه|تجمع|منطقه)\\s+';
/** One pattern per place, every spelling, with و/ب/ل/ف in front (ل + ال is written لل). */
const patterns = new WeakMap<Place[], [Place, RegExp][]>();
function compile(places: Place[]) {
  let ps = patterns.get(places);
  if (ps) return ps;
  ps = places.flatMap(p => {
    const names = [p[1], ...(p[11] ?? [])].map(n => fold(n).trim()).filter(n => n.length >= 3);
    const alts = names.map(n => (n.startsWith('ال') ? `(?:(?:و|ب|ف|وب)?ال|و?لل)${esc(n.slice(2))}` : `(?:و|ب|ل|ف|وب|ول)?${esc(n)}`));
    return alts.length ? [[p, new RegExp(`(^|[^${LETTER}])${p[12] ? MARKER : ''}(?:${alts.join('|')})(?=$|[^${LETTER}])`)] as [Place, RegExp]] : [];
  });
  patterns.set(places, ps);
  return ps;
}

/** The place a report is about: the earliest-named village or neighbourhood, a city only when
 *  nothing smaller is named. Plain "Gaza" usually means the Strip, so it marks the report as
 *  Gaza's without placing it; only "Gaza City" places it at the city. Names that are also
 *  everyday words (الزيتون, olives) count only after a place word (حي الزيتون). */
export function locate(text: string, places: Place[]): { place: Place | null; gaza: boolean } {
  let f = fold(text);
  const city = f.search(/مدينه غزه/);
  f = f.replace(/مدينه غزه/g, ' ');
  const strip = city >= 0 || /غزه/.test(f);
  f = f.replace(/غزه/g, ' ');
  const hits: { p: Place; at: number; len: number }[] = [];
  const gazaCity = places.find(p => p[6] === 1 && p[4] === 0 && fold(p[1]) === 'غزه');
  if (city >= 0 && gazaCity) hits.push({ p: gazaCity, at: city, len: 9 });
  for (const [p, re] of compile(places)) {
    const m = re.exec(f);
    if (m) hits.push({ p, at: m.index, len: m[0].length });
  }
  const small = hits.filter(h => h.p[4] > 0);
  const best = (small.length ? small : hits).sort((a, b) => a.at - b.at || b.len - a.len)[0];
  return { place: best?.p ?? null, gaza: strip || best?.p[6] === 1 };
}

/** Telegram's web preview → posts: id, time, text. */
export function parsePage(html: string): { id: number; t: number; text: string; url?: string }[] {
  return html.split('data-post="').slice(1).flatMap(c => {
    const id = Number(c.slice(0, c.indexOf('"')).split('/')[1]);
    const body = c.match(/js-message_text[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    const url = body.match(/https:\/\/www\.wafa\.ps\/news\/\d+/)?.[0];
    const time = c.match(/<time datetime="([^"]+)"/)?.[1];
    const text = body.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&[a-z#0-9]+;/g, ' ')
      .replace(/التفاصيل:?\s*https?:\S+/g, '').replace(/https?:\S+/g, '').replace(/\s+/g, ' ').trim();
    return id && time && text ? [{ id, t: Date.parse(time) / 1000, text, ...(url && { url }) }] : [];
  });
}

/** A WAFA article's headline and lede, which name the place a caption often leaves out. */
async function article(url: string) {
  const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': UA } });
  if (!r.ok) return '';
  const h = await r.text();
  return `${h.match(/<title>([^<]*)/)?.[1] ?? ''} ${h.match(/og:description" content="([^"]*)/)?.[1] ?? ''}`;
}

async function page(before?: number) {
  const r = await fetch(before ? `${CHANNEL}?before=${before}` : CHANNEL, { cache: 'no-store', headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`wafa ${r.status}`);
  return parsePage(await r.text());
}

const held = new Map<number, Incident>();
const looked = new Set<number>();   // posts whose article has been read
const LOOKUPS = 12;                 // article reads per round; a cold start's backlog clears over the next rounds
let lastPoll = 0, filled = false;
let inflight: Promise<void> | null = null;
const at = (p: Place) => ({ en: p[0], ar: p[1], lon: p[2], lat: p[3] });

async function refresh() {
  const places = await loadPlaces();
  const add = (posts: Awaited<ReturnType<typeof page>>) => {
    for (const p of posts) {
      if (held.has(p.id)) continue;
      const tags = tagsOf(p.text);
      if (!tags.length) continue;
      const { place, gaza } = locate(p.text, places);
      held.set(p.id, { id: p.id, t: p.t, tags, text: p.text.slice(0, 280), gaza, place: place && at(place), ...(p.url && { url: p.url }) });
    }
  };
  let posts = await page();
  add(posts);
  // a cold start reads back until KEEP_H hours are covered
  for (let i = 0; !filled && i < BACKFILL && posts.length; i++) {
    const oldest = Math.min(...posts.map(p => p.id));
    if (posts.some(p => p.t < Date.now() / 1000 - KEEP_H * 3600)) break;
    posts = await page(oldest);
    add(posts);
  }
  filled = true;
  // posts that don't name the place: the article's headline and lede usually do; newest first
  const todo = [...held.values()].filter(x => !x.place && x.url && !looked.has(x.id)).sort((a, b) => b.t - a.t).slice(0, LOOKUPS);
  await Promise.all(todo.map(async x => {
    looked.add(x.id);
    const more = locate(await article(x.url!).catch(() => ''), places);
    if (more.place) x.place = at(more.place);
    x.gaza ||= more.gaza;
  }));
  lastPoll = Date.now();
  for (const [id, x] of held) if (x.t < Date.now() / 1000 - KEEP_H * 3600) { held.delete(id); looked.delete(id); }
}

// ponytail: per-instance memory; reports seen by one instance only reach its viewers after its own poll.
/** The past KEEP_H hours of incident reports, oldest first; what's held if the channel is unreachable. */
export async function getIncidents(): Promise<Incident[]> {
  if (Date.now() - lastPoll >= POLL) {
    inflight ??= refresh().catch(e => { console.error('wafa', e); lastPoll = Date.now() - POLL / 2; }).finally(() => { inflight = null; });
    if (!filled) await inflight;
  }
  return [...held.values()].sort((a, b) => a.t - b.t);
}
