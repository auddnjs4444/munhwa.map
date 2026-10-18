#!/usr/bin/env python3
"""OSM XML (API 0.6 map call) -> GeoJSON for the city3d prototype. stdlib only.
usage: python3 -I convert.py OUT_DIR STATS_JSON in1.osm [in2.osm ...]
"""
import sys, json, re, math
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

OUT_DIR, STATS_PATH, *INPUTS = sys.argv[1:]
BBOX = (126.9080, 35.1435, 126.9260, 35.1555)  # minlon, minlat, maxlon, maxlat

# ---------- parse & merge ----------
nodes, ways, rels = {}, {}, {}
for path in INPUTS:
    root = ET.parse(path).getroot()
    for e in root:
        if e.tag == 'node':
            nodes[e.get('id')] = (round(float(e.get('lon')), 6), round(float(e.get('lat')), 6),
                                  {t.get('k'): t.get('v') for t in e.findall('tag')})
        elif e.tag == 'way':
            ways[e.get('id')] = ([n.get('ref') for n in e.findall('nd')],
                                 {t.get('k'): t.get('v') for t in e.findall('tag')})
        elif e.tag == 'relation':
            rels[e.get('id')] = ([(m.get('type'), m.get('ref'), m.get('role') or '') for m in e.findall('member')],
                                 {t.get('k'): t.get('v') for t in e.findall('tag')})
problems = []

# ---------- geometry helpers ----------
def way_coords(nids):
    out = []
    for n in nids:
        if n in nodes:
            out.append([nodes[n][0], nodes[n][1]])
        else:
            return None
    return out

def is_closed(nids):
    return len(nids) >= 4 and nids[0] == nids[-1]

def signed_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a / 2.0

def orient(ring, ccw=True):
    a = signed_area(ring)
    if (a < 0 and ccw) or (a > 0 and not ccw):
        return list(reversed(ring))
    return ring

def point_in_ring(pt, ring):
    x, y = pt; inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]; x2, y2 = ring[i + 1]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xi > x:
                inside = not inside
    return inside

def assemble_rings(nid_lists, ctx):
    segs = [list(w) for w in nid_lists if len(w) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]; segs.pop(i); changed = True; break
                if s[-1] == cur[-1]:
                    cur += list(reversed(s))[1:]; segs.pop(i); changed = True; break
                if s[-1] == cur[0]:
                    cur = s[:-1] + cur; segs.pop(i); changed = True; break
                if s[0] == cur[0]:
                    cur = list(reversed(s))[:-1] + cur; segs.pop(i); changed = True; break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur)
        else:
            problems.append(f'{ctx}: unclosed ring ({len(cur)} nodes) dropped')
    return rings

def multipolygon_geom(rid):
    members, tags = rels[rid]
    outers, inners = [], []
    for (t, ref, role) in members:
        if t != 'way':
            continue
        if ref not in ways:
            problems.append(f'relation/{rid}: member way/{ref} missing from download')
            continue
        (inners if role == 'inner' else outers).append(ways[ref][0])
    o_rings = [way_coords(r) for r in assemble_rings(outers, f'relation/{rid} outer')]
    i_rings = [way_coords(r) for r in assemble_rings(inners, f'relation/{rid} inner')]
    o_rings = [r for r in o_rings if r]; i_rings = [r for r in i_rings if r]
    if not o_rings:
        return None
    polys = [[orient(r, True)] for r in o_rings]
    for ir in i_rings:
        for p in polys:
            if point_in_ring(ir[0], p[0]):
                p.append(orient(ir, False)); break
        else:
            problems.append(f'relation/{rid}: inner ring not inside any outer; dropped')
    if len(polys) == 1:
        return {'type': 'Polygon', 'coordinates': polys[0]}
    return {'type': 'MultiPolygon', 'coordinates': polys}

def way_polygon(wid):
    nids, tags = ways[wid]
    if not is_closed(nids):
        return None
    c = way_coords(nids)
    if not c:
        problems.append(f'way/{wid}: missing nodes'); return None
    return {'type': 'Polygon', 'coordinates': [orient(c, True)]}

def way_line(wid):
    c = way_coords(ways[wid][0])
    if not c or len(c) < 2:
        problems.append(f'way/{wid}: missing nodes'); return None
    return {'type': 'LineString', 'coordinates': c}

def ring_centroid(ring):
    a = signed_area(ring)
    if abs(a) < 1e-14:
        xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys), 0.0
    cx = cy = 0.0
    for i in range(len(ring) - 1):
        f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
        cx += (ring[i][0] + ring[i + 1][0]) * f
        cy += (ring[i][1] + ring[i + 1][1]) * f
    return cx / (6 * a), cy / (6 * a), abs(a)

def geom_centroid(g):
    if g['type'] == 'Point':
        return g['coordinates']
    if g['type'] == 'Polygon':
        x, y, _ = ring_centroid(g['coordinates'][0]); return [round(x, 6), round(y, 6)]
    if g['type'] == 'MultiPolygon':
        sx = sy = sa = 0.0
        for p in g['coordinates']:
            x, y, a = ring_centroid(p[0]); sx += x * a; sy += y * a; sa += a
        return [round(sx / sa, 6), round(sy / sa, 6)]
    if g['type'] == 'LineString':
        c = g['coordinates']; return c[len(c) // 2]

def in_bbox_geom(g):
    def any_pt(coords):
        return any(BBOX[0] <= x <= BBOX[2] and BBOX[1] <= y <= BBOX[3] for x, y in coords)
    if g['type'] == 'Point': return any_pt([g['coordinates']])
    if g['type'] == 'LineString': return any_pt(g['coordinates'])
    if g['type'] == 'Polygon': return any_pt(g['coordinates'][0])
    if g['type'] == 'MultiPolygon': return any(any_pt(p[0]) for p in g['coordinates'])
    return True

def feat(geom, props):
    return {'type': 'Feature', 'geometry': geom, 'properties': props}

def num(s):
    if s is None: return None
    m = re.search(r'-?\d+(?:[.,]\d+)?', s)
    return float(m.group().replace(',', '.')) if m else None

# ---------- which relation member ways are "consumed" by a multipolygon ----------
mp_member_ways = set()
for rid, (members, tags) in rels.items():
    if tags.get('type') == 'multipolygon':
        for t, ref, role in members:
            if t == 'way': mp_member_ways.add(ref)

# ---------- iterate "area-like" objects: closed ways + multipolygon relations ----------
def area_objects():
    for wid, (nids, tags) in ways.items():
        if is_closed(nids) and tags:
            yield ('way', wid, tags, lambda w=wid: way_polygon(w))
    for rid, (members, tags) in rels.items():
        if tags.get('type') == 'multipolygon':
            yield ('relation', rid, tags, lambda r=rid: multipolygon_geom(r))

# ---------- 1. buildings ----------
buildings = []
hs = Counter()
for otype, oid, tags, mk in area_objects():
    b = tags.get('building')
    if not b or b == 'no':
        continue
    g = mk()
    if not g: continue
    levels = num(tags.get('building:levels'))
    h = num(tags.get('height'))
    if h is not None:
        height_m, src = round(h, 1), 'height'
    elif levels is not None:
        height_m, src = round(levels * 3.3, 1), 'levels'
    else:
        height_m, src = None, 'none'
    hs[src] += 1
    buildings.append(feat(g, {
        'name': tags.get('name'), 'building': b, 'levels': levels, 'height_m': height_m,
        'height_source': src, 'osm_id': f'{otype}/{oid}'}))

# ---------- 2. roads ----------
ROAD_ALWAYS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
               'living_street', 'pedestrian', 'motorway_link', 'trunk_link', 'primary_link',
               'secondary_link', 'tertiary_link'}
ROAD_IF_NAMED = {'footway', 'service', 'cycleway', 'path', 'steps'}
AXIS = [('chungjang', re.compile(r'^충장로(\d가)?$')), ('geumnam', re.compile(r'^금남로(\d가)?$'))]
roads = []
axis_count = Counter()
for wid, (nids, tags) in ways.items():
    hw = tags.get('highway')
    if not hw: continue
    name = tags.get('name')
    if hw in ROAD_ALWAYS:
        if hw == 'pedestrian' and tags.get('area') == 'yes': continue  # pedestrian area -> green
        if wid in mp_member_ways and not name: continue             # bare member of a pedestrian multipolygon
    elif hw in ROAD_IF_NAMED:
        if not name: continue
    else:
        continue
    g = way_line(wid)
    if not g: continue
    axis = None
    if name:
        for key, rx in AXIS:
            if rx.match(name): axis = key
    if axis: axis_count[axis] += 1
    roads.append(feat(g, {'highway': hw, 'name': name, 'osm_id': f'way/{wid}',
                          'oneway': tags.get('oneway'), 'layer': tags.get('layer'),
                          'tunnel': tags.get('tunnel'), 'bridge': tags.get('bridge'), 'axis': axis}))

# ---------- 3. water ----------
water = []
for wid, (nids, tags) in ways.items():
    ww = tags.get('waterway')
    if ww in ('river', 'stream', 'canal', 'drain', 'ditch'):
        g = way_line(wid)
        if g: water.append(feat(g, {'kind': f'waterway={ww}', 'name': tags.get('name'), 'osm_id': f'way/{wid}'}))
for otype, oid, tags, mk in area_objects():
    kind = None
    if tags.get('natural') == 'water':
        kind = 'natural=water' + (f' water={tags["water"]}' if tags.get('water') else '') + (' amenity=fountain' if tags.get('amenity') == 'fountain' else '')
    elif tags.get('waterway') == 'riverbank': kind = 'waterway=riverbank'
    elif tags.get('landuse') in ('reservoir', 'basin'): kind = f'landuse={tags["landuse"]}'
    if not kind: continue
    g = mk()
    if g: water.append(feat(g, {'kind': kind, 'name': tags.get('name'), 'osm_id': f'{otype}/{oid}'}))

# ---------- 4. green / open space polygons ----------
green = []
def green_kind(tags):
    if tags.get('leisure') in ('park', 'garden', 'playground', 'pitch'): return f'leisure={tags["leisure"]}'
    if tags.get('landuse') in ('grass', 'village_green', 'recreation_ground', 'forest', 'meadow'): return f'landuse={tags["landuse"]}'
    if tags.get('natural') in ('wood', 'scrub', 'grassland'): return f'natural={tags["natural"]}'
    if tags.get('amenity') == 'marketplace': return 'amenity=marketplace'
    if tags.get('place') == 'square': return 'place=square'
    if tags.get('highway') == 'pedestrian': return 'highway=pedestrian area'
    if tags.get('man_made') == 'pier': return 'man_made=pier'
    return None
for otype, oid, tags, mk in area_objects():
    if otype == 'way' and tags.get('highway') == 'pedestrian' and tags.get('area') != 'yes':
        continue  # closed pedestrian loop street, not an area
    k = green_kind(tags)
    if not k or tags.get('building'): continue
    g = mk()
    if g: green.append(feat(g, {'kind': k, 'name': tags.get('name'), 'osm_id': f'{otype}/{oid}'}))

# ---------- 5. landmarks ----------
TARGETS = [
    ('국립아시아문화전당 (ACC)', 'way', '248192696', 'OSM way tagged tourism=attraction area=yes name=국립아시아문화전당 (site outline); point = outline centroid'),
    ('5·18민주광장', 'relation', '19102230', 'OSM multipolygon highway=pedestrian name=5.18민주광장 addr 금남로 245; point = area centroid'),
    ('옛 전남도청 (구 전라남도청 본관)', 'way', '535847782', 'OSM building name=구 전라남도청 alt_name:ko=구 전남도청 tourism=museum; point = building centroid'),
    ('구 전남도청 별관', 'way', '648180665', 'OSM building name=구.전남도청 별관; centroid'),
    ('국립아시아문화전당 상무관', 'way', '485779127', 'OSM building name=국립아시아문화전당 상무관; centroid'),
    ('국립아시아문화전당 방문자센터', 'way', '648180663', 'OSM building tourism=information name=국립아시아문화전당 방문자센터; centroid'),
    ('전일빌딩245', 'way', '471090813', 'OSM building building:levels=10 historic=yes name=전일빌딩245; centroid'),
    ('금남로공원', 'way', '452261523', 'OSM leisure=park name=금남로공원; centroid'),
    ('5·18민주화운동기록관', 'way', '478278294', 'OSM building tourism=museum name=5.18 광주민주화운동기록관 building:levels=6; centroid'),
    ('광주YMCA', 'way', '452258370', 'OSM building=commercial name=광주YMCA; centroid'),
    ('광주우체국 (충장로 우체국, "충우")', 'node', '368876980', 'OSM amenity=post_office node name=광주우체국 name:en=Gwangju Post Office on 충장로2가 (OSM has no object literally named 충장로우체국; surrounding buildings carry addr:street=충장로 91-96)'),
    ('광주우체국 ? (북쪽 건물, 미확인)', 'way', '1388027647', 'UNVERIFIED: OSM building amenity=post_office name=광주우체국 but located ~740 m north (35.1541,126.9143), far from 충장로; probably a different branch or mis-named - not the 충우'),
    ('문화전당역 (지하철)', 'node', '9252650065', 'OSM railway=station name=문화전당 name:en=Asia Culture Center'),
    ('궁전제과', 'node', '4475060012', 'OSM amenity=cafe name=궁전제과 (project spots.json place palace-bakery)'),
    ('캔모아', 'node', '11391900255', 'OSM amenity=cafe name=캔모아 (project spots.json hub canmore)'),
    ('금남로4가역 (지하철)', 'node', None, 'name match railway=station 금남로4가'),
]
landmarks = []
for label, otype, oid, how in TARGETS:
    g = None; tags = {}
    if otype == 'node' and oid is None:
        for nid, (lon, lat, t) in nodes.items():
            if t.get('railway') == 'station' and t.get('name') == '금남로4가':
                oid = nid; break
        if oid is None: problems.append(f'landmark {label}: not found'); continue
    if otype == 'way':
        if oid not in ways: problems.append(f'landmark {label}: way/{oid} missing'); continue
        tags = ways[oid][1]; g = way_polygon(oid) or way_line(oid)
    elif otype == 'relation':
        if oid not in rels: problems.append(f'landmark {label}: relation/{oid} missing'); continue
        tags = rels[oid][1]; g = multipolygon_geom(oid)
    else:
        if oid not in nodes: problems.append(f'landmark {label}: node/{oid} missing'); continue
        lon, lat, tags = nodes[oid]; g = {'type': 'Point', 'coordinates': [lon, lat]}
    if not g: problems.append(f'landmark {label}: no geometry'); continue
    c = geom_centroid(g)
    landmarks.append(feat({'type': 'Point', 'coordinates': c}, {
        'name': label, 'name_osm': tags.get('name'), 'name_en': tags.get('name:en'),
        'lon': c[0], 'lat': c[1], 'osm_id': f'{otype}/{oid}',
        'geometry_source': 'node' if otype == 'node' else 'centroid of ' + g['type'],
        'verified': not how.startswith('UNVERIFIED'),
        'verified_by': how}))

# ---------- write ----------
def write(name, feats):
    fc = {'type': 'FeatureCollection',
          'name': name,
          'attribution': '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
          'bbox': list(BBOX), 'features': feats}
    with open(f'{OUT_DIR}/{name}.geojson', 'w', encoding='utf-8') as f:
        json.dump(fc, f, ensure_ascii=False, separators=(',', ':'))
    return len(feats)

counts = {
    'buildings': write('buildings', buildings), 'roads': write('roads', roads),
    'water': write('water', water), 'green': write('green', green), 'landmarks': write('landmarks', landmarks)}
stats = {
    'input_counts': {'nodes': len(nodes), 'ways': len(ways), 'relations': len(rels)},
    'files': counts, 'height_stats': dict(hs), 'axis_counts': dict(axis_count),
    'road_highway_counts': dict(Counter(f['properties']['highway'] for f in roads)),
    'building_type_counts': dict(Counter(f['properties']['building'] for f in buildings)),
    'green_kinds': dict(Counter(f['properties']['kind'] for f in green)),
    'water_kinds': dict(Counter(f['properties']['kind'] for f in water)),
    'buildings_named': sum(1 for f in buildings if f['properties']['name']),
    'buildings_out_of_bbox_outer': sum(1 for f in buildings if not in_bbox_geom(f['geometry'])),
    'problems': problems,
}
with open(STATS_PATH, 'w', encoding='utf-8') as f:
    json.dump(stats, f, ensure_ascii=False, indent=1)
print(json.dumps(stats, ensure_ascii=False, indent=1))
