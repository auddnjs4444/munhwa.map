/* ===== 3D 탐험 프로토타입 — 손으로 부르는 광주 =====
   MapLibre GL JS + OSM GeoJSON(건물·도로·물·녹지)을 직접 올려 양식화한 3D 도시를 그리고,
   핵심 스팟(충장로–금남로–5·18민주광장–ACC)을 고르면 카메라가 그곳으로 날아가 오른쪽 패널에 수어 영상과 장소 기억을 띄운다.
   본 사이트(app.js 등)와 코드·데이터를 공유하지 않는다. 기록 본문은 data/content.json(기존 데이터 원문)만 쓴다. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('noanim');
  const isSheet = () => matchMedia('(max-width: 767px)').matches;
  const V = 'v=2';
  const FILES = {
    spots: 'data/spots3d.json', content: 'data/content.json',
    buildings: 'data/buildings.geojson', roads: 'data/roads.geojson', water: 'data/water.geojson', green: 'data/green.geojson', acc: 'data/acc_area.geojson',
  };
  // 테스트용: 애니메이션 프레임이 멈춘 환경에서는 rAF를 타이머로 대신한다 (?rafshim=1)
  if (q.has('rafshim')) { window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16); window.cancelAnimationFrame = (id) => clearTimeout(id); }

  const panel = $('panel'), body = $('p-body'), notice = $('notice');
  let map = null, spotsDef = null, content = null, geo = {};
  let current = null; // 선택된 스팟 id
  const markers = new Map();
  const revealed = new Set(); // 5·18 민감 기록 열람 확인 (세션 한정)
  const bCentroid = new Map(); // 건물 id → [lng, lat]
  let lastFocus = null;

  /* ---------- 유틸 ---------- */
  const fetchJson = (u) => fetch(`${u}?${V}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u} HTTP ${r.status}`))));
  const M_LAT = 111320;
  const mLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
  const distM = (a, b) => Math.hypot((a[0] - b[0]) * mLng((a[1] + b[1]) / 2), (a[1] - b[1]) * M_LAT);
  function ringOf(geom) { return geom.type === 'Polygon' ? geom.coordinates[0] : geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : null; }
  function centroid(geom) { const ring = ringOf(geom); if (!ring || !ring.length) return null; let x = 0, y = 0; ring.forEach((p) => { x += p[0]; y += p[1]; }); return [x / ring.length, y / ring.length]; }
  function pointInRing(pt, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
  // 선을 따라 일정 간격으로 점을 찍고 좌우로 비켜 놓는다 (가로등·간판 자리) — 실제 시설 위치가 아니라 연출용
  function alongLine(coords, stepM, offsetM, fn) {
    let carry = 0, k = 0;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1], b = coords[i];
      const len = distM(a, b); if (!len) continue;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len; // 경도·위도 단위 방향 (미터 환산 전)
      const nx = -(b[1] - a[1]) * M_LAT, ny = (b[0] - a[0]) * mLng(a[1]); const nl = Math.hypot(nx, ny) || 1;
      for (let d = stepM - carry; d < len; d += stepM, k++) {
        const px = a[0] + ux * d, py = a[1] + uy * d;
        const ox = (nx / nl) * offsetM / mLng(py), oy = (ny / nl) * offsetM / M_LAT;
        fn([px + ox, py + oy], k, 1); fn([px - ox, py - oy], k, -1);
      }
      carry = (carry + len) % stepM;
    }
  }
  const squareAt = (c, sizeM) => { const dx = sizeM / 2 / mLng(c[1]), dy = sizeM / 2 / M_LAT; return [[[c[0] - dx, c[1] - dy], [c[0] + dx, c[1] - dy], [c[0] + dx, c[1] + dy], [c[0] - dx, c[1] + dy], [c[0] - dx, c[1] - dy]]]; };
  function showNotice(msg) { notice.innerHTML = msg; notice.hidden = false; }
  const spotById = (id) => spotsDef.spots.find((s) => s.id === id);
  const placed = () => spotsDef.spots.filter((s) => s.coords && s.camera);
  const sequence = () => spotsDef.sequence.map(spotById).filter(Boolean);

  /* ---------- 데이터 가공 ---------- */
  const DEFAULT_H = { apartments: 28, commercial: 16, office: 20, retail: 10, hotel: 24, school: 12, university: 14, public: 12, civic: 12, church: 11, hospital: 18, industrial: 8, house: 6, detached: 6, residential: 9, yes: 9 };
  function prepBuildings(fc) {
    const spots = placed();
    fc.features.forEach((f, i) => {
      const p = f.properties || (f.properties = {});
      p.id = i; // feature-state용 숫자 id
      const name = String(p.name || '');
      spots.forEach((s) => (s.landmark_names || []).forEach((n) => { if (name.includes(n)) p.lm = s.id; }));
      let h = Number(p.height_m);
      if (!(h > 0)) h = p.lm === 'square' ? 12 : p.lm === 'acc' ? 9 : DEFAULT_H[p.building] || DEFAULT_H.yes; // 옛 도청 3층, 전당 지상부는 낮게
      p.h = Math.min(h, 120);
      const c = centroid(f.geometry);
      if (c) bCentroid.set(i, c);
    });
    return fc;
  }
  function prepWater(fc) { fc.features.forEach((f) => { const p = f.properties || (f.properties = {}); p.fountain = /fountain/.test(String(p.kind || '')) ? 1 : 0; }); return fc; } // 분수대(OSM amenity=fountain)는 따로 칠한다
  function prepRoads(fc) {
    fc.features.forEach((f) => {
      const p = f.properties || (f.properties = {});
      const hw = p.highway || '';
      p.cls = /motorway|trunk|primary/.test(hw) ? 'major' : /secondary|tertiary/.test(hw) ? 'mid' : /pedestrian|footway|path|steps/.test(hw) ? 'ped' : 'minor';
      const n = String(p.name || '');
      if (!p.axis) { if (/^충장로/.test(n)) p.axis = 'chungjang'; else if (/^금남로/.test(n)) p.axis = 'geumnam'; }
      p.main = n === '충장로' || n === '금남로' ? 1 : 0;
    });
    return fc;
  }
  // 연출용 생성물: 금남로 가로등 점, 충장로 간판 상자, ACC 빛 상자 — 실제 시설 배치가 아님 (DATA.md 참조)
  function makeDressing() {
    const lamps = [], signs = [], lanterns = [];
    (geo.roads ? geo.roads.features : []).forEach((f) => {
      if (f.geometry.type !== 'LineString' || !f.properties.main) return;
      if (f.properties.axis === 'geumnam') alongLine(f.geometry.coordinates, 32, 13, (c) => lamps.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
      if (f.properties.axis === 'chungjang') alongLine(f.geometry.coordinates, 17, 7.5, (c, k, side) => {
        const v = (k * 7 + (side > 0 ? 3 : 0)) % 10; // 결정적 변주
        const color = v < 7 ? '#FFF1D2' : v === 7 ? '#FF6B6E' : v === 8 ? '#4C95FF' : '#FFD23F';
        signs.push({ type: 'Feature', properties: { color, base: 2.4 + (k % 3) * 0.5, h: 1.3 + (k % 4) * 0.45 }, geometry: { type: 'Polygon', coordinates: squareAt(c, 1.3) } });
      });
    });
    if (geo.acc) {
      const ring = ringOf(geo.acc.features[0].geometry);
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const dx = 24 / mLng(y0), dy = 24 / M_LAT; let k = 0;
      for (let y = y0 + dy / 2; y < y1; y += dy) for (let x = x0 + dx / 2; x < x1; x += dx, k++) {
        const pt = [x + ((k % 3) - 1) * dx * 0.18, y + ((k % 5) - 2) * dy * 0.12];
        if (pointInRing(pt, ring) && k % 7 !== 3) lanterns.push({ type: 'Feature', properties: { s: 0.7 + (k % 4) * 0.12 }, geometry: { type: 'Point', coordinates: pt } });
      }
    }
    const fc = (features) => ({ type: 'FeatureCollection', features });
    return { lamps: fc(lamps), signs: fc(signs), lanterns: fc(lanterns) };
  }

  /* ---------- 스타일 (아트디렉션: 늦은 블루아워, 따뜻한 어두운 땅, 금빛 포인트) ---------- */
  const C = {
    ground: '#15130F', green: '#1E2A1C', plaza: '#C9A062', water: '#1F3340', waterEdge: '#2E5566',
    roadMajor: '#3A342B', roadMid: '#332E26', roadMinor: '#2A2621', roadPed: '#4A3F2E', curb: 'rgba(240, 197, 118, 0.18)', axisCore: 'rgba(240, 197, 118, 0.42)',
    bBase: '#262119', bTop: '#3B3528', bTall: '#4D4535', bTallTop: '#5C5547',
    lit: '#8A6E42', litTall: '#AE905C',
    acc: '#8C6A34', accPlane: '#1A2419', fountain: '#8FD3E8', accEdge: 'rgba(240, 197, 118, 0.25)', lantern: '#FFE2A3', office: '#B8AD93', jeonil: '#A08A5E', lamp: 'rgba(240, 197, 118, 0.6)',
  };
  function buildingColor() {
    const byH = ['interpolate', ['linear'], ['get', 'h'], 4, C.bBase, 14, C.bTop, 40, C.bTall, 90, C.bTallTop];
    const lm = ['match', ['get', 'lm'], 'acc', C.acc, 'square', C.office, 'jeonil', C.jeonil, byH];
    const base = ['case', ['has', 'lm'], lm, byH];
    const lit = ['interpolate', ['linear'], ['get', 'h'], 4, C.lit, 40, C.litTall];
    // 선택 스팟 주변은 feature-state lit(0~1)만큼 금빛으로 밝아진다 — 빛 웅덩이처럼 멀어질수록 옅게
    return ['interpolate', ['linear'], ['coalesce', ['feature-state', 'lit'], 0], 0, base, 1, lit];
  }
  function bboxPolygon() {
    const [w, s, e, n] = [126.78, 35.04, 127.06, 35.26]; // 지평선까지 이어지는 땅
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] };
  }
  function buildStyle(dress) {
    const src = (data, extra = {}) => ({ type: 'geojson', data, buffer: 64, tolerance: 0.3, ...extra });
    const empty = { type: 'FeatureCollection', features: [] };
    const zw = (a, b, c) => ['interpolate', ['exponential', 1.5], ['zoom'], 14, a, 17, b, 19, c];
    return {
      version: 8,
      light: { anchor: 'viewport', color: '#FFD9A8', intensity: 0.45, position: [1.15, 210, 32] },
      sources: {
        ground: src(bboxPolygon()),
        green: src(geo.green || empty),
        water: src(geo.water || empty),
        roads: src(geo.roads || empty),
        acc: src(geo.acc || empty),
        buildings: src(geo.buildings || empty, { tolerance: 0.2, promoteId: 'id' }),
        lamps: src(dress.lamps), signs: src(dress.signs), lanterns: src(dress.lanterns),
      },
      layers: [
        { id: 'ground', type: 'fill', source: 'ground', paint: { 'fill-color': C.ground } },
        { id: 'green', type: 'fill', source: 'green', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'kind'], 'highway=pedestrian area']], paint: { 'fill-color': C.green, 'fill-opacity': 0.95 } },
        { id: 'acc-plane', type: 'fill', source: 'acc', paint: { 'fill-color': C.accPlane, 'fill-opacity': 0.95 } },
        { id: 'acc-edge', type: 'line', source: 'acc', paint: { 'line-color': C.accEdge, 'line-width': zw(0.6, 1.6, 3), 'line-blur': 0.6 } },
        { id: 'plaza', type: 'fill', source: 'green', filter: ['==', ['get', 'kind'], 'highway=pedestrian area'], paint: { 'fill-color': C.plaza, 'fill-opacity': 0.32 } },
        { id: 'water', type: 'fill', source: 'water', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'fountain'], 1]], paint: { 'fill-color': C.water } },
        { id: 'fountain', type: 'fill', source: 'water', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'fountain'], 1]], paint: { 'fill-color': C.fountain, 'fill-opacity': 0.7 } },
        { id: 'fountain-glow', type: 'line', source: 'water', filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'fountain'], 1]], paint: { 'line-color': C.fountain, 'line-width': zw(2, 6, 12), 'line-blur': 4, 'line-opacity': 0.45 } },
        { id: 'water-line', type: 'line', source: 'water', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': C.waterEdge, 'line-width': zw(1, 2.4, 5), 'line-opacity': 0.6, 'line-blur': 1 } },
        { id: 'road-minor', type: 'line', source: 'roads', filter: ['==', ['get', 'cls'], 'minor'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadMinor, 'line-width': zw(0.8, 4, 9) } },
        { id: 'road-ped', type: 'line', source: 'roads', filter: ['==', ['get', 'cls'], 'ped'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadPed, 'line-width': zw(0.6, 3, 7) } },
        { id: 'road-mid', type: 'line', source: 'roads', filter: ['==', ['get', 'cls'], 'mid'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadMid, 'line-width': zw(1.6, 7, 16) } },
        { id: 'road-major', type: 'line', source: 'roads', filter: ['==', ['get', 'cls'], 'major'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadMajor, 'line-width': zw(2.4, 11, 26) } },
        // 핵심 축(충장로·금남로 본선): 연석을 따라 옅은 금빛 + 가운데 가는 금선
        { id: 'axis-curb', type: 'line', source: 'roads', filter: ['==', ['get', 'main'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.curb, 'line-width': zw(5, 20, 44), 'line-blur': 5 } },
        { id: 'axis-core', type: 'line', source: 'roads', filter: ['==', ['get', 'main'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.axisCore, 'line-width': zw(0.8, 2, 4) } },
        { id: 'lamps', type: 'circle', source: 'lamps', minzoom: 15.5, paint: { 'circle-color': C.lamp, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 1.2, 18, 3.2], 'circle-blur': 0.5 } },
        { id: 'lanterns', type: 'circle', source: 'lanterns', minzoom: 14.5, paint: { 'circle-color': C.lantern, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14.5, 1.6, 17, 5, 19, 9], 'circle-blur': 0.55, 'circle-opacity': ['*', 0.85, ['get', 's']] } },
        { id: 'buildings', type: 'fill-extrusion', source: 'buildings', paint: {
          'fill-extrusion-color': buildingColor(),
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.97,
          'fill-extrusion-vertical-gradient': true,
        } },
        // 충장로 간판: 작은 발광 상자들 (가까이서만)
        { id: 'signs', type: 'fill-extrusion', source: 'signs', minzoom: 15.8, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['+', ['get', 'base'], ['get', 'h']], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': false } },
      ],
    };
  }

  /* ---------- 지도 ---------- */
  function initMap() {
    const ov = spotsDef.overview;
    const fromHash = applyHashLater();
    const start = REDUCED || fromHash ? ov : spotsDef.intro_from;
    map = new maplibregl.Map({
      container: 'map', style: buildStyle(makeDressing()), center: start.center, zoom: start.zoom, pitch: start.pitch, bearing: start.bearing,
      maxPitch: 76, minZoom: 12.5, maxZoom: 19, antialias: true, attributionControl: false, hash: false,
      maxBounds: [[126.86, 35.09], [126.98, 35.21]],
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    map.on('load', () => {
      trySky();
      buildMarkers();
      map.on('click', 'buildings', (e) => { const f = e.features && e.features[0]; const id = f && nearestSpotOf(f.id); if (id) selectSpot(id); });
      map.on('mousemove', 'buildings', (e) => { const f = e.features && e.features[0]; map.getCanvas().style.cursor = f && nearestSpotOf(f.id) ? 'pointer' : ''; });
      map.on('mouseleave', 'buildings', () => { map.getCanvas().style.cursor = ''; });
      if (fromHash) { selectSpot(fromHash, { instant: true }); return; }
      if (!REDUCED) setTimeout(() => map.flyTo({ ...ov, duration: 3600, essential: true, curve: 1.25 }), 400); // 높은 곳에서 내려오며 시작
    });
    map.on('error', (e) => { const msg = e && e.error && e.error.message; console.warn('map error', msg); if (msg && /style|layer|filter|expression/i.test(msg)) showNotice(`지도 스타일 오류: ${esc(msg)}`); });
  }
  function trySky() {
    // MapLibre 4.x의 sky(하늘·안개) — 지원되지 않으면 CSS 하늘만 쓴다
    if (typeof map.setSky !== 'function') return;
    try { map.setSky({ 'sky-color': '#0B1426', 'horizon-color': '#6B3F22', 'fog-color': '#15130F', 'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.75, 'fog-ground-blend': 0.6 }); } catch (e) { console.warn('sky unsupported', e); }
  }
  function applyHashLater() {
    const m = location.hash.match(/^#spot\/([\w-]+)/);
    const s = m && spotById(m[1]);
    return s && s.camera ? s.id : null;
  }
  function nearestSpotOf(fid) {
    const c = bCentroid.get(Number(fid)); if (!c) return null;
    let best = null, bd = Infinity;
    placed().forEach((s) => { if (!s.radius_m) return; const d = distM(c, s.coords); if (d <= s.radius_m && d < bd) { best = s.id; bd = d; } });
    return best;
  }
  function lightSpot(id) {
    map.removeFeatureState({ source: 'buildings' });
    const s = id && spotById(id);
    if (!s || !s.coords || !s.radius_m) return;
    bCentroid.forEach((c, fid) => {
      const d = distM(c, s.coords);
      if (d < s.radius_m) map.setFeatureState({ source: 'buildings', id: fid }, { lit: Math.pow(1 - d / s.radius_m, 0.65) });
    });
  }

  function buildMarkers() {
    placed().forEach((s) => {
      if (s.marker === false) return; // 조망용 카메라만 있는 스팟은 라벨을 두지 않는다
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'spot-marker'; el.setAttribute('aria-label', `${s.name} 열기`);
      el.innerHTML = `<div class="spot-label${s.optional ? ' pending' : ''}${s.label_tall ? ' tall' : ''}"><div class="tag"><span>${esc(s.short || s.name)}</span><small>${esc(s.optional ? 'VIEWPOINT' : s.no)}</small></div><div class="stem"></div><div class="dot"></div></div>`;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); selectSpot(s.id); });
      const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat(s.coords).addTo(map);
      markers.set(s.id, mk);
    });
    // 조망 시점 라벨은 가까이 갔을 때만 (멀리서는 핵심 스팟 라벨끼리 겹치지 않게)
    const syncZoomLabels = () => { const z = map.getZoom(); markers.forEach((mk, id) => { const s = spotById(id); mk.getElement().classList.toggle('zoom-hidden', !!s.optional && z < 16 && current !== id); }); };
    map.on('zoom', syncZoomLabels); syncZoomLabels();
  }
  function syncMarkers() {
    markers.forEach((mk, id) => { const lab = mk.getElement().querySelector('.spot-label'); lab.classList.toggle('is-on', id === current); lab.classList.toggle('is-dim', !!current && id !== current); });
  }

  /* ---------- 카메라 ---------- */
  function cameraPadding() {
    return isSheet()
      ? { top: 96, bottom: Math.round(innerHeight * 0.46) + 16, left: 12, right: 12 }
      : { top: 80, bottom: 90, left: 40, right: Math.round(panel.getBoundingClientRect().width || 0) + 30 };
  }
  function flyToSpot(s, instant) {
    const cam = { ...s.camera, padding: cameraPadding() };
    if (instant || REDUCED) { map.jumpTo(cam); return; }
    const far = map.getZoom() < 15.8 || distM(map.getCenter().toArray(), s.camera.center) > 700;
    map.flyTo({ ...cam, duration: far ? 3000 : 2400, curve: far ? 1.4 : 1.1, speed: 0.9, essential: true });
  }
  function flyOverview() {
    const cam = { ...spotsDef.overview, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
    if (REDUCED) map.jumpTo(cam); else map.flyTo({ ...cam, duration: 2600, curve: 1.2, essential: true });
  }

  /* ---------- 선택 ---------- */
  function selectSpot(id, { instant = false } = {}) {
    const s = spotById(id);
    if (!s) return;
    toggleExplore(false);
    const wasOpen = isPanelOpen();
    current = id;
    renderPanel(s);
    openPanel();
    syncNav(); syncMarkers();
    if (map.getSource('buildings')) lightSpot(s.camera ? id : null);
    setHash(id);
    if (!s.camera) return; // 위치 미확정 스팟: 패널만 열고 카메라는 그대로
    if (!wasOpen && !instant && !REDUCED) setTimeout(() => flyToSpot(s), 120); else flyToSpot(s, instant);
  }
  function closeAll({ keepHash = false } = {}) {
    if (!isPanelOpen()) return;
    stopVideo();
    panel.classList.remove('on', 'expanded');
    document.body.classList.remove('panel-open');
    current = null;
    syncNav(); syncMarkers();
    if (map.getSource('buildings')) lightSpot(null);
    if (!keepHash) setHash(null);
    setTimeout(() => { panel.hidden = true; }, REDUCED ? 0 : 360);
    flyOverview();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function step(dir) {
    const seq = sequence().filter((s) => s.camera);
    const i = seq.findIndex((s) => s.id === current);
    const next = seq[(i + dir + seq.length) % seq.length];
    if (next) selectSpot(next.id);
  }
  function setHash(id) {
    const next = id ? `#spot/${id}` : '';
    if (location.hash === next) return;
    history.replaceState(null, '', next || location.pathname + location.search);
  }
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#spot\/([\w-]+)/);
    if (m && spotById(m[1])) { if (current !== m[1]) selectSpot(m[1]); }
    else if (isPanelOpen()) closeAll({ keepHash: true });
  });

  /* ---------- 패널 ---------- */
  const isPanelOpen = () => !panel.hidden && panel.classList.contains('on');
  function openPanel() {
    if (isPanelOpen()) { panel.scrollTop = 0; return; }
    lastFocus = document.activeElement;
    panel.hidden = false;
    panel.classList.remove('expanded');
    void panel.offsetWidth;
    panel.classList.add('on');
    document.body.classList.add('panel-open');
    panel.scrollTop = 0;
    panel.focus({ preventScroll: true });
  }
  function stopVideo() { const v = $('pv'); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } }
  const contentFor = (id) => ((content && content.spots) || []).find((c) => c.id === id) || null;
  const rel = (p) => (!p ? '' : /^https?:/.test(p) ? p : `../../${p}`);

  function videoHtml(s, c) {
    const v = c && c.video;
    if (v && v.src) {
      return `<div class="pv" style="--ar:${Number(v.ratio) || 0.75}"><video id="pv" playsinline preload="metadata" ${v.poster ? `poster="${esc(rel(v.poster))}"` : ''} src="${esc(rel(v.src))}" aria-label="${esc(s.name)} 수어 영상${v.label ? ` (${esc(v.label)})` : ''}"></video><button type="button" class="pv-play" id="pv-play">수어 영상 보기<i aria-hidden="true"></i></button><p class="pv-err" id="pv-err" hidden role="alert"></p></div>`;
    }
    return `<div class="pv none"><span>SIGN — COMING SOON<b>세로형 수어 영상 자리</b>영상 준비 중</span></div>`;
  }
  function memoriesHtml(c) {
    if (!c) return '';
    const memos = (c.memories || []).map((m) => `<div class="memo"><b>${esc(m.spot || '')}</b><p>${esc(m.hand || m.text || '')}</p><small>${esc([m.by ? `${m.by}님` : '', m.years ? `광주 ${m.years}년` : ''].filter(Boolean).join(' · '))}</small></div>`).join('');
    const stories = (c.stories || []).map((st) => `<article class="story"><div class="who">${esc(st.narrator_line || '')}</div><h4>${esc(st.title || '')}</h4>${st.subtitle ? `<p class="sub">${esc(st.subtitle)}</p>` : ''}${st.quote ? `<blockquote>${esc(st.quote)}</blockquote>` : ''}</article>`).join('');
    return memos + stories;
  }
  function renderPanel(s) {
    stopVideo();
    const c = contentFor(s.id);
    const seq = sequence();
    const pos = seq.findIndex((x) => x.id === s.id);
    $('p-idx').textContent = pos >= 0 ? `${String(pos + 1).padStart(2, '0')} / ${String(seq.length).padStart(2, '0')}` : 'VIEWPOINT';
    $('p-kicker').textContent = s.kicker || (c && c.kicker) || '';
    const nameEl = $('p-name'); nameEl.textContent = s.name; nameEl.classList.toggle('long', s.name.length >= 7);
    $('p-en').textContent = s.en || (c && c.en) || '';
    const gated = c && c.sensitive && c.sensitive.gated && !revealed.has(s.id);
    const coordFact = s.coord_status === 'verified' ? 'OSM 검증' : s.coord_status === 'provisional' ? '검증 전 추정' : '위치 미확정';
    const nRec = c ? (c.memories || []).length + (c.stories || []).length : 0;
    const vidFact = c && c.video && c.video.src ? '세로 · 무음' : '준비 중';
    let html = '';
    if (gated) {
      html = `<div class="gate"><p>${esc(c.sensitive.notice || '이 지점은 역사적으로 민감한 기록을 담고 있습니다. 계속 보시겠어요?')}</p><button type="button" id="p-reveal">기록 보기</button></div>`;
    } else {
      html = `${videoHtml(s, c)}
        <dl class="facts"><div><dt>수어 영상</dt><dd>${vidFact}</dd></div><div><dt>장소 기억</dt><dd>${nRec}건</dd></div><div><dt>위치</dt><dd>${coordFact}</dd></div></dl>`;
      const mem = memoriesHtml(c);
      html += `<p class="sec">장소 기억</p>${mem || `<p class="pending">${esc((c && c.placeholder) || '기록 준비 중 — 인터뷰가 모이면 이곳에 장소 기억이 실립니다.')}</p>`}`;
      if (c && (c.related_spots || []).length) html += `<p class="sec">함께 보는 장소</p><ul class="related">${c.related_spots.map((r) => `<li><span>${esc(r.name)}</span><small>${esc(r.address || '')}</small></li>`).join('')}</ul>`;
      if (c && (c.tags || []).length) html += `<div class="tags">${c.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;
      if (s.note) html += `<p class="pending" style="margin-top:20px">${esc(s.note)}</p>`;
    }
    body.innerHTML = html;
    const v = $('pv'), play = $('pv-play'), err = $('pv-err');
    if (v && play) {
      play.addEventListener('click', () => { v.controls = true; v.play().catch(() => {}); });
      v.addEventListener('playing', () => { play.hidden = true; });
      v.addEventListener('pause', () => { play.hidden = false; });
      v.addEventListener('error', () => { play.hidden = true; err.textContent = '영상을 불러오지 못했습니다.'; err.hidden = false; });
    }
    $('p-reveal')?.addEventListener('click', () => { revealed.add(s.id); renderPanel(s); });
    const nextBtn = $('p-next-btn');
    const seqCam = seq.filter((x) => x.camera);
    const i = seqCam.findIndex((x) => x.id === s.id);
    if (seqCam.length > 1 && i >= 0) {
      const next = seqCam[(i + 1) % seqCam.length];
      nextBtn.hidden = false;
      nextBtn.textContent = i === seqCam.length - 1 ? `처음으로: ${next.short || next.name} →` : `다음: ${next.short || next.name} →`;
      nextBtn.onclick = () => selectSpot(next.id);
    } else if (seqCam.length) {
      nextBtn.hidden = false; nextBtn.textContent = `축으로 돌아가기: ${seqCam[0].short || seqCam[0].name} →`; nextBtn.onclick = () => selectSpot(seqCam[0].id);
    } else nextBtn.hidden = true;
  }

  /* ---------- 내비게이션 UI ---------- */
  function buildNav() {
    const nav = $('spot-nav');
    nav.innerHTML = sequence().map((s) => `<button type="button" data-spot="${s.id}" class="${s.camera ? '' : 'pending'}" title="${esc(s.camera ? s.name : s.name + ' — 위치 검증 중')}"><small>${esc(s.no)}</small>${esc(s.short || s.name)}</button>`).join('');
    nav.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectSpot(b.dataset.spot)));
    const list = $('explore-list');
    list.innerHTML = spotsDef.spots.map((s) => {
      const c = contentFor(s.id);
      const has = !!(c && c.video && c.video.src);
      return `<button type="button" class="em-item${s.camera ? '' : ' pending'}" data-spot="${s.id}"><small>${esc(s.no)}</small><span>${esc(s.name)}${s.camera ? '' : ' · 위치 검증 중'}</span><i class="${has ? 'has' : 'no'}" title="${has ? '수어 영상 있음' : '영상 준비 중'}"></i></button>`;
    }).join('');
    list.querySelectorAll('.em-item').forEach((b) => b.addEventListener('click', () => selectSpot(b.dataset.spot)));
    $('explore-note').textContent = '금빛 점은 수어 영상이 있는 장소. 충장로 → 금남로 → 5·18민주광장 → ACC 순서로 이어집니다. + 표시는 조망 시점.';
  }
  function syncNav() { document.querySelectorAll('.spot-nav button, .em-item').forEach((b) => b.classList.toggle('on', b.dataset.spot === current)); }
  function toggleExplore(force) {
    const menu = $('explore-menu'), btn = $('explore-btn');
    const open = force ?? menu.hidden;
    if (!open && menu.hidden) return;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('on', open);
    if (open) menu.querySelector('.em-item.on, .em-item')?.focus();
  }
  function bindUi() {
    $('explore-btn').addEventListener('click', () => toggleExplore());
    $('explore-close').addEventListener('click', () => { toggleExplore(false); $('explore-btn').focus(); });
    document.addEventListener('pointerdown', (e) => { const m = $('explore-menu'); if (m.hidden) return; if (m.contains(e.target) || $('explore-btn').contains(e.target)) return; toggleExplore(false); });
    $('p-close').addEventListener('click', () => closeAll());
    $('p-prev').addEventListener('click', () => step(-1));
    $('p-next').addEventListener('click', () => step(1));
    const handle = $('sheet-handle');
    const toggleSheet = (force) => { const on = panel.classList.toggle('expanded', force); handle.setAttribute('aria-expanded', String(on)); handle.setAttribute('aria-label', on ? '시트 접기' : '시트 펼치기'); };
    handle.addEventListener('click', () => toggleSheet());
    let dragY = null;
    handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; });
    window.addEventListener('pointerup', (e) => { if (dragY === null) return; const dy = e.clientY - dragY; dragY = null; if (dy < -40) toggleSheet(true); else if (dy > 40) toggleSheet(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!$('explore-menu').hidden) { toggleExplore(false); $('explore-btn').focus(); } else if (isPanelOpen()) closeAll(); return; }
      if (!isPanelOpen() || (e.target instanceof Element && e.target.closest('input, textarea, video'))) return;
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
    });
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (map && current) { const s = spotById(current); if (s && s.camera) map.easeTo({ ...s.camera, padding: cameraPadding(), duration: REDUCED ? 0 : 600 }); } }, 200); });
  }

  /* ---------- 시작 ---------- */
  async function boot() {
    const keys = Object.keys(FILES);
    const results = await Promise.allSettled(keys.map((k) => fetchJson(FILES[k])));
    const missing = [];
    results.forEach((r, i) => { if (r.status === 'fulfilled') geo[keys[i]] = r.value; else missing.push(keys[i]); });
    spotsDef = geo.spots; content = geo.content || null; delete geo.spots; delete geo.content;
    if (!spotsDef) { showNotice('스팟 정의(data/spots3d.json)를 불러오지 못했습니다. 로컬 서버로 열어주세요.'); return; }
    if (geo.buildings) prepBuildings(geo.buildings);
    if (geo.roads) prepRoads(geo.roads);
    if (geo.water) prepWater(geo.water);
    const geoMissing = missing.filter((k) => ['buildings', 'roads', 'water', 'green'].includes(k));
    if (geoMissing.length) showNotice(`지리 데이터가 없습니다: ${geoMissing.join(', ')} — data/DATA.md를 참고해 OSM 데이터를 만든 뒤 다시 열어주세요.`);
    if (!content) showNotice('기록 콘텐츠(data/content.json)가 없어 자리표시자만 보입니다.');
    buildNav();
    bindUi();
    initMap();
  }
  window.__city3d = { get map() { return map; }, selectSpot, closeAll, step, spots: () => spotsDef, flyOverview, lightSpot };
  boot();
})();
