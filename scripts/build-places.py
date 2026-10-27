"""
Build public/map/places.json — Palestinian cities, towns and villages with English and
Arabic names, for naming where a fire was seen and for the farm page's village list.

Input: HOT's OSM export of populated places (© OpenStreetMap contributors, ODbL), unzipped:
  https://production-raw-data-api.s3.amazonaws.com/ISO3/PSE/populated_places/hotosm_pse_populated_places_osm_geojson.zip
and public/map/geo.json (built first by build-map.py) to drop Israeli settlements, which OSM
also tags as villages.

  pip install shapely
  python scripts/build-places.py <populated_places.geojson>

Rows: [english, arabic, lon, lat, rank (0 city, 1 town, 2 village, 3 hamlet), governorate, region (0 WB, 1 Gaza),
       nearest settlement/outpost name, its type, km to it, outposts + farm outposts within 3 km,
       other Arabic spellings, strict (1 = also an everyday word: only matched after بلدة/قرية/حي…)]
"""
import json, math, os, sys
from shapely.geometry import shape

RANK = {'city': 0, 'town': 1, 'village': 2, 'suburb': 2, 'hamlet': 3}
ARABIC = lambda t: next((x.strip() for x in (t or '').split('|') if any('ء' <= ch <= 'ي' for ch in x)), None)
root = os.path.join(os.path.dirname(__file__), '..', 'public', 'map')
geo = json.load(open(os.path.join(root, 'geo.json'), encoding='utf-8'))
sites = [s['c'] for s in geo['sites']]
TYPES = geo['types']

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
built = unary_union([Polygon(r).buffer(0.003) for s in geo['sites'] for r in s['p'] if len(r) > 2])   # footprints + ~300 m

norm = lambda t: ''.join(ch for ch in t.lower() if ch.isalnum())
site_names = {norm(s['n']) for s in geo['sites']}

def near_site(lon, lat, km=0.6):
    k = math.cos(math.radians(lat))
    return built.contains(Point(lon, lat)) or any(((lon - x) * k) ** 2 + (lat - y) ** 2 < (km / 111) ** 2 for x, y in sites)

rows, seen = [], {}
for f in json.load(open(sys.argv[1], encoding='utf-8'))['features']:
    p = f['properties']
    rank = RANK.get(p.get('place'))
    en, ar = p.get('name_en') or p.get('name_latin'), ARABIC(p.get('name_ar')) or ARABIC(p.get('name'))   # many carry Arabic only in name
    if rank is None or not en or not ar or any(ch in en for ch in '@`'):   # '@`': OSM's machine transliteration, unreadable
        continue
    c = shape(f['geometry']).representative_point()
    if norm(en) in site_names or near_site(c.x, c.y):
        continue
    if (en, p.get('adm2_name')) in seen:   # OSM lists some twice, spelled two ways: keep both spellings
        seen[(en, p.get('adm2_name'))].add(ar)
        continue
    seen[(en, p.get('adm2_name'))] = {ar}
    rows.append([en, ar, round(c.x, 4), round(c.y, 4), rank, p.get('adm2_name') or '',
                 1 if p.get('adm1_name') == 'Gaza Strip' else 0])

# OSM's export misses most of Gaza's towns; these are added by hand (positions to ~1 km)
GAZA = [
    ('Rafah', 'رفح', 34.251, 31.297, 0, 'Rafah'), ('Khan Younis', 'خان يونس', 34.306, 31.346, 0, 'Khan Younis'),
    ('Bani Suheila', 'بني سهيلا', 34.326, 31.343, 1, 'Khan Younis'), ('Abasan al-Kabira', 'عبسان الكبيرة', 34.345, 31.321, 1, 'Khan Younis'),
    ("Khuza'a", 'خزاعة', 34.361, 31.308, 2, 'Khan Younis'), ('Maghazi', 'المغازي', 34.382, 31.422, 1, 'Deir Al-Balah'),
    ('Beit Lahia', 'بيت لاهيا', 34.495, 31.546, 1, 'North Gaza'), ('Beit Hanoun', 'بيت حانون', 34.535, 31.539, 1, 'North Gaza'),
    ('Shati', 'الشاطئ', 34.447, 31.532, 1, 'Gaza'),
    # everyday words too (olives, apples, stairs, sand…): strict, matched only as حي الزيتون etc.
    ('Zeitoun', 'الزيتون', 34.452, 31.493, 2, 'Gaza'), ('Tuffah', 'التفاح', 34.475, 31.511, 2, 'Gaza'),
    ('Daraj', 'الدرج', 34.466, 31.509, 2, 'Gaza'), ('Rimal', 'الرمال', 34.447, 31.519, 2, 'Gaza'),
    ('Nasr', 'النصر', 34.455, 31.527, 2, 'Gaza'), ('Sabra', 'الصبرة', 34.455, 31.501, 2, 'Gaza'),
    ('Shujaiya', 'الشجاعية', 34.482, 31.502, 2, 'Gaza'), ('Tel al-Hawa', 'تل الهوى', 34.432, 31.505, 2, 'Gaza'),
    ('Sheikh Radwan', 'الشيخ رضوان', 34.457, 31.530, 2, 'Gaza'), ('Sheikh Ajlin', 'الشيخ عجلين', 34.422, 31.493, 2, 'Gaza'),
    ('Jabalia Camp', 'مخيم جباليا', 34.493, 31.533, 2, 'North Gaza'), ('Beit Lahia', 'بيت لاهيا', 34.495, 31.546, 1, 'North Gaza'),
    ('Nuseirat Camp', 'مخيم النصيرات', 34.395, 31.447, 2, 'Deir Al-Balah'), ('Bureij Camp', 'مخيم البريج', 34.403, 31.442, 2, 'Deir Al-Balah'),
    ('Wadi Gaza', 'وادي غزة', 34.405, 31.465, 2, 'Deir Al-Balah'), ('Khan Younis Camp', 'مخيم خان يونس', 34.296, 31.350, 2, 'Khan Younis'),
    ('Tal as-Sultan', 'تل السلطان', 34.240, 31.316, 2, 'Rafah'), ('Shaboura', 'الشابورة', 34.253, 31.290, 2, 'Rafah'),
    ('Bani Suheila', 'بني سهيلا', 34.326, 31.343, 1, 'Khan Younis'),
]
rows += [[en, ar, lon, lat, rank, gov, 1] for en, ar, lon, lat, rank, gov in GAZA]
# Bedouin communities beside settlements, which the settlement filter above drops
rows += [['Khan al-Ahmar', 'الخان الأحمر', 35.355, 31.808, 3, 'Jerusalem', 0]]
# names that are also everyday words, first names or places abroad (hill, Salem, Sidon, Muscat, vine,
# rail, butter, goat…), plus Gaza's word-named neighbourhoods: matched only after a place word
AMBIGUOUS = {'Tell', 'Salim', 'Muscat', 'Seida', 'Sika', 'Karma', 'Zibdah', '`nz@', 'Noa', 'Saffa', "'Aba", 'Kafa', 'Mirka',
             'Zeitoun', 'Tuffah', 'Daraj', 'Rimal', 'Nasr', 'Sabra'}
DROP = {'City Center'}
# how WAFA spells some places OSM spells otherwise
ALIASES = {'Jerusalem': ['القدس', 'الأقصى'], 'Deir Istiya': ['دير استيا'], 'Beit Hanina Al-Balad': ['بيت حنينا'], 'Um Safa': ['أم صفا']}
rows = [r for r in {(r[0], r[5]): r for r in rows if r[0] not in DROP}.values() if r[5]]   # one per name and governorate; none outside Palestine

def km(lon, lat, c):
    k = math.cos(math.radians(lat))
    return math.hypot((c[0] - lon) * k, c[1] - lat) * 111

for r in rows:
    ds = sorted(((km(r[2], r[3], s['c']), s) for s in geo['sites'] if s['t'] not in (3, 6) and not r[6]), key=lambda x: x[0])   # not industrial or planned; none for Gaza
    d, s = ds[0] if ds else (None, None)
    r += [s['n'] if s else '', TYPES[s['t']] if s else '', round(d, 1) if s else None,
          sum(1 for x, y in ds if x <= 3 and y['t'] in (1, 2))]
    aka = sorted((seen.get((r[0], r[5]), set()) | set(ALIASES.get(r[0], []))) - {r[1]})
    one_word = ' ' not in r[1].strip().removeprefix('ال')
    r += [aka, 1 if r[0] in AMBIGUOUS or (r[4] == 3 and one_word) else 0]   # one-word hamlet names are often plain words
rows.sort(key=lambda r: (r[6], r[5], r[0]))
json.dump(rows, open(os.path.join(root, 'places.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'places;', sum(r[6] for r in rows), 'in Gaza')
