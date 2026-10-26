"""
Build public/map/geo.json — the radar console's map layers — from open GIS data.

Inputs (download and unpack first; neither is fetched at runtime):
  pn/   Peace Now's layers map package (a 7z archive), unpacked:
        https://www.arcgis.com/sharing/rest/content/items/e3848dc0a04c44cc9ad9f7db228cd3a3/data
  geo/  OCHA COD-AB admin boundaries (pse_admin1.geojson), unpacked from
        https://data.humdata.org/dataset/cod-ab-pse
        and Natural Earth 10m land (ne_10m_land.geojson v5.1.2) saved as land.geojson

  pip install "pyshp<3" pyproj shapely
  python scripts/build-map.py <pn dir> <geo dir>
"""
import json, os, sys
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape, box, mapping
from shapely.ops import transform, unary_union

pn, geo = sys.argv[1], sys.argv[2]
LAYERS = os.path.join(pn, 'commondata', 'general_layers_to_share')
AIR_BOX = box(33.9, 30.9, 36.0, 33.4)   # the airspace view: Gaza, the West Bank, Israel, the coast

def reader(path):
    r = shapefile.Reader(path, encoding='utf-8', encodingErrors='replace')
    to84 = Transformer.from_crs(CRS.from_wkt(open(path[:-4] + '.prj').read()), 'EPSG:4326', always_xy=True).transform
    return r, to84

def coords(g, tol):
    """Simplified geometry → list of rings / lines, as [lon, lat] to ~100 m (a map unit is ~400 m)."""
    g = g.simplify(tol, preserve_topology=True)
    out = []
    def add(seq): out.append([[round(x, 3), round(y, 3)] for x, y in seq])
    for part in getattr(g, 'geoms', [g]):
        if part.geom_type == 'Polygon':
            add(part.exterior.coords)
            for hole in part.interiors: add(hole.coords)
        elif part.geom_type == 'LineString':
            add(part.coords)
    return [r for r in out if len(r) > 1]

def layer(name, tol, keep=lambda rec: True):
    r, to84 = reader(os.path.join(LAYERS, name + '.shp'))
    rings = []
    for sr in r.iterShapeRecords():
        if sr.shape.points and keep(sr.record):
            rings += coords(transform(to84, shape(sr.shape.__geo_interface__)), tol)
    return rings

out = {
    'areaA': layer('Areas A B 1995', 0.001, lambda rec: rec['TYPE4_3'] == 'a'),
    'areaB': layer('Areas A B 1995', 0.001, lambda rec: rec['TYPE4_3'] == 'b'),
    'barrier': layer('Barrier Built and Planned line', 0.001),
}

# the land settlements' councils govern, far wider than what's built: merged into one shape
r, to84 = reader(os.path.join(LAYERS, 'Settlement_Jurisdiction_160124.shp'))
out['juris'] = coords(unary_union([transform(to84, shape(x.shape.__geo_interface__)).buffer(0)
                                   for x in r.iterShapeRecords() if x.shape.points]), 0.0015)

# settlements, outposts, farms… one entry each: name, type, year founded, centre, and a
# footprint for settlements and industrial zones (outposts and farms draw as points)
def year(v):
    v = int(v or 0)
    return (v % 10000 if v > 9999 else v) or None   # a few are stored as a date, DDMMYYYY

TYPES = ['Settlement', 'Outpost', 'Farm', 'Industrial Area', 'Tourism', 'Other', 'Planned']
sites = []
r, to84 = reader(os.path.join(pn, 'commondata', 'settlements', 'Settlements_and_outposts_14112024.shp'))
for sr in (x for x in r.iterShapeRecords() if x.shape.points):
    rec, g = sr.record, transform(to84, shape(sr.shape.__geo_interface__))
    c, t = g.centroid, TYPES.index(rec['Type'])
    sites.append({'n': rec['NameEng'].strip(), 't': t, 'y': year(rec['Time']),
                  'c': [round(c.x, 3), round(c.y, 3)], 'p': coords(g, 0.0006) if t in (0, 3) else []})
r, to84 = reader(os.path.join(LAYERS, 'Settlements in East Jerusalem.shp'))
for sr in (x for x in r.iterShapeRecords() if x.shape.points):
    rec, g = sr.record, transform(to84, shape(sr.shape.__geo_interface__))
    c = g.centroid
    t = 3 if 'Industrial' in rec['Name'] else 0
    sites.append({'n': rec['Name'].strip(), 't': t, 'y': None, 'ej': 1,
                  'c': [round(c.x, 3), round(c.y, 3)], 'p': coords(g, 0.0006) if t in (0, 3) else []})
out['types'] = TYPES
out['sites'] = sites

adm = json.load(open(os.path.join(geo, 'pse_admin1.geojson'), encoding='utf-8'))
for f in adm['features']:
    name = json.dumps(f['properties'])
    key = 'gaza' if 'Gaza' in name else 'wb'
    out[key] = coords(shape(f['geometry']), 0.0006)

# shares of the West Bank, by area: Area C is what Oslo left under full Israeli control
from shapely.geometry import Polygon
wb = unary_union([shape(f['geometry']) for f in adm['features'] if 'West Bank' in json.dumps(f['properties'])])
polys = lambda rings: unary_union([Polygon(r).buffer(0) for r in rings if len(r) > 3])
ab = polys(out['areaA'] + out['areaB']).intersection(wb)
out['stats'] = {'areaC': round(100 * (1 - ab.area / wb.area)), 'juris': round(100 * polys(out['juris']).intersection(wb).area / wb.area)}

land = json.load(open(os.path.join(geo, 'land.geojson'), encoding='utf-8'))
out['coast'] = []
for f in land['features']:
    g = shape(f['geometry'])
    if g.intersects(AIR_BOX):
        out['coast'] += coords(g.boundary.intersection(AIR_BOX), 0.002)

dest = os.path.join(os.path.dirname(__file__), '..', 'public', 'map', 'geo.json')
json.dump(out, open(dest, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print({k: len(v) for k, v in out.items()}, os.path.getsize(dest) // 1024, 'KB')
