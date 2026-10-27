"""
Build public/map/places.json — Palestinian cities, towns and villages with English and
Arabic names, for naming where a fire was seen and for the farm page's village list.

Input: HOT's OSM export of populated places (© OpenStreetMap contributors, ODbL), unzipped:
  https://production-raw-data-api.s3.amazonaws.com/ISO3/PSE/populated_places/hotosm_pse_populated_places_osm_geojson.zip
and public/map/geo.json (built first by build-map.py) to drop Israeli settlements, which OSM
also tags as villages.

  pip install shapely
  python scripts/build-places.py <populated_places.geojson>

Rows: [english, arabic, lon, lat, rank (0 city, 1 town, 2 village), governorate, region (0 WB, 1 Gaza),
       nearest settlement/outpost name, its type, km to it, outposts + farm outposts within 3 km]
"""
import json, math, os, sys
from shapely.geometry import shape

RANK = {'city': 0, 'town': 1, 'village': 2}
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

rows, seen = [], set()
for f in json.load(open(sys.argv[1], encoding='utf-8'))['features']:
    p = f['properties']
    rank = RANK.get(p.get('place'))
    en, ar = p.get('name_en') or p.get('name_latin'), p.get('name_ar')
    if rank is None or not en or not ar:
        continue
    c = shape(f['geometry']).representative_point()
    if norm(en) in site_names or near_site(c.x, c.y) or (en, p.get('adm2_name')) in seen:   # OSM lists a few twice, spelled two ways
        continue
    seen.add((en, p.get('adm2_name')))
    rows.append([en, ar, round(c.x, 4), round(c.y, 4), rank, p.get('adm2_name') or '',
                 1 if p.get('adm1_name') == 'Gaza Strip' else 0])

# OSM's export misses most of Gaza's towns; these are added by hand (positions to ~1 km)
GAZA = [
    ('Rafah', 'رفح', 34.251, 31.297, 0, 'Rafah'), ('Khan Younis', 'خان يونس', 34.306, 31.346, 0, 'Khan Younis'),
    ('Bani Suheila', 'بني سهيلا', 34.326, 31.343, 1, 'Khan Younis'), ('Abasan al-Kabira', 'عبسان الكبيرة', 34.345, 31.321, 1, 'Khan Younis'),
    ("Khuza'a", 'خزاعة', 34.361, 31.308, 2, 'Khan Younis'), ('Maghazi', 'المغازي', 34.382, 31.422, 1, 'Deir Al-Balah'),
    ('Beit Lahia', 'بيت لاهيا', 34.495, 31.546, 1, 'North Gaza'), ('Beit Hanoun', 'بيت حانون', 34.535, 31.539, 1, 'North Gaza'),
    ('Shati', 'الشاطئ', 34.447, 31.532, 1, 'Gaza'),
]
rows += [[en, ar, lon, lat, rank, gov, 1] for en, ar, lon, lat, rank, gov in GAZA]
rows = [r for r in rows if r[5]]   # no governorate: outside Palestine

def km(lon, lat, c):
    k = math.cos(math.radians(lat))
    return math.hypot((c[0] - lon) * k, c[1] - lat) * 111

for r in rows:
    ds = sorted(((km(r[2], r[3], s['c']), s) for s in geo['sites'] if s['t'] not in (3, 6) and not r[6]), key=lambda x: x[0])   # not industrial or planned; none for Gaza
    d, s = ds[0] if ds else (None, None)
    r += [s['n'] if s else '', TYPES[s['t']] if s else '', round(d, 1) if s else None,
          sum(1 for x, y in ds if x <= 3 and y['t'] in (1, 2))]
rows.sort(key=lambda r: (r[6], r[5], r[0]))
json.dump(rows, open(os.path.join(root, 'places.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'places;', sum(r[6] for r in rows), 'in Gaza')
