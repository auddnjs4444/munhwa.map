/* ===== 3D 도시 탐험 v2 — 실사 항공영상(지오레퍼런스) + 지형 + OSM 건물·도로를 MapLibre로 그리고 블루아워로 보정한다 =====
   실제 3D: 지형(DEM), 카메라(기울기·회전·flyTo), 건물 윤곽 부피(OSM 평면도 + 높이 추정), 도로 조명선(OSM 도로 중심선).
   사진 기반: 항공영상 타일(위성·항공 실사, 바닥 텍스처), 거리 장면(실제 충장로 사진, 2.5D 시차), 핀 썸네일.
   사진 위에 핀을 찍지 않는다 — 핀은 좌표가 확인된 장소에만. 첫 장면: 충장로·캔모아. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('noanim');
  const isSheet = () => matchMedia('(max-width: 767px)').matches;

  /* ---------- 영상·지형 소스 (출처·조건은 README) ---------- */
  const VWORLD_KEY = q.get('vworld'); // 브이월드 키가 있으면 ?vworld=KEY 로 국토지리정보원 항공영상 사용
  const IMAGERY = VWORLD_KEY
    ? { tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(VWORLD_KEY)}/Satellite/{z}/{y}/{x}.jpeg`], tileSize: 256, maxzoom: 19, attribution: '항공영상 © 국토지리정보원 브이월드' }
    : { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community' };
  const DEM = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Terrain: Mapzen Terrain Tiles (AWS Open Data; SRTM, NASA)' };

  /* ---------- 장소 (좌표는 본 사이트 데이터 또는 OSM 검증값만) ---------- */
  const PLACES = [
    { id: 'canmore', name: '충장로 캔모아', short: '캔모아', en: 'CHUNGJANG-RO · CANMORE', from: 'spots:hub:canmore', thumb: '../../assets/explore/chungjang-night.jpg', link: '../../explore.html#place/canmore', sub: '충장로, 수어로 마음껏 이야기하던 곳', ready: true, cam: { zoom: 17.45, pitch: 62, bearing: 42 } },
    { id: 'chungu', name: '충우 앞', short: '충우 앞', en: 'CHUNGJANG-RO · POST OFFICE', geo: { lat: 35.1475911, lng: 126.9172187 }, source: 'OSM node/368876980 광주우체국', link: '../../explore.html#place/chungu' },
    { id: 'palace-bakery', name: '궁전제과', short: '궁전제과', from: 'spots:place:palace-bakery', link: '../../explore.html#place/palace-bakery' },
    { id: 'geumnam-park', name: '금남로공원', short: '금남로공원', from: 'spots:place:geumnam-park', link: '../../explore.html#place/geumnam-park' },
    { id: 'square', name: '5·18민주광장', short: '5·18민주광장', from: 'places:518-democracy-square', link: '../../explore.html#place/518-democracy-square' },
    { id: 'acc', name: '국립아시아문화전당', short: 'ACC', from: 'spots:place:acc', thumb: '../../assets/explore/acc-night.jpg', link: '../../explore.html#place/acc' },
  ];
  const STREET = { src: '../../assets/explore/chungjang-night.jpg', credit: '거리 사진: 충장로 거리 풍경 (사용 허락을 받은 사진) — 선택한 장소 자체의 사진이 아니라 충장로 거리 사진입니다' };

  /* ---------- 카메라 ---------- */
  const OVERVIEW = { center: [126.9172, 35.1481], zoom: 15.05, pitch: 60, bearing: 96 }; // 충장로·금남로 일대를 가운데 두고 무등산 쪽(동)을 바라본다
  const INTRO = { center: [126.9172, 35.1481], zoom: 12.9, pitch: 46, bearing: 96 };

  let map = null, places = [], current = null, orbitRaf = null, interacted = false;
  const placeById = (id) => places.find((p) => p.id === id);
  const setState = (s) => { document.body.dataset.state = s; };

  function notice(msg) { const n = $('notice'); n.textContent = msg; n.hidden = false; }

  /* ---------- 데이터 ---------- */
  async function loadJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); }
  function resolvePlaces(spots, dongs) {
    return PLACES.map((p) => {
      let geo = p.geo || null, source = p.source || '';
      if (p.from) {
        const [kind, a, b] = p.from.split(':');
        if (kind === 'spots' && a === 'hub') { const h = spots.hubs.find((x) => x.id === b); if (h) { geo = { lat: h.geo.lat, lng: h.geo.lng }; source = `spots.json 거점 ${b} (${h.geo.precision})`; p.addr = h.address; } }
        if (kind === 'spots' && a === 'place') { const s = spots.places.find((x) => x.id === b); if (s) { geo = { lat: s.geo.lat, lng: s.geo.lng }; source = `spots.json 장소 ${b} (${s.geo.precision})`; p.addr = s.address; } }
        if (kind === 'places') { const d = dongs.find((x) => x.id === a); if (d) { geo = { lat: d.lat, lng: d.lng }; source = `places.json ${a}`; } }
      }
      return { ...p, geo, source };
    }).filter((p) => p.geo && Number.isFinite(p.geo.lat) && Number.isFinite(p.geo.lng));
  }

  /* 건물 높이: OSM height/levels가 있으면 그 값, 없으면 용도별 단순 추정 (부피감만, 질감은 항공영상이 맡는다) */
  const DEFAULT_H = { apartments: 28, commercial: 16, office: 20, retail: 10, hotel: 24, school: 12, university: 14, public: 12, civic: 12, church: 11, hospital: 18, industrial: 8, house: 6, detached: 6, residential: 9, yes: 9 };
  function prepBuildings(gj) {
    gj.features.forEach((f) => {
      const p = f.properties || (f.properties = {});
      let h = parseFloat(p.height); if (!(h > 0)) { const lv = parseFloat(p['building:levels']); if (lv > 0) h = lv * 3.2; }
      if (!(h > 0)) h = DEFAULT_H[p.building] || DEFAULT_H.yes;
      p.h = h;
    });
    return gj;
  }
  function prepRoads(gj) {
    gj.features.forEach((f) => { const p = f.properties || (f.properties = {}); const hw = p.highway || ''; p.cls = /primary|trunk/.test(hw) ? 3 : /secondary|tertiary/.test(hw) ? 2 : /pedestrian|living_street|residential|unclassified/.test(hw) ? 1 : 0; });
    return gj;
  }

  /* ---------- 지도 ---------- */
  function buildStyle(buildings, roads, water, green) {
    return {
      version: 8,
      sources: {
        imagery: { type: 'raster', ...IMAGERY },
        dem: DEM,
        buildings: { type: 'geojson', data: buildings },
        roads: { type: 'geojson', data: roads },
        water: { type: 'geojson', data: water },
        green: { type: 'geojson', data: green },
        world: { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } } },
      },
      terrain: { source: 'dem', exaggeration: 1.25 },
      sky: { 'sky-color': '#0b1a3e', 'horizon-color': '#b8623a', 'fog-color': '#1c2140', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.75, 'fog-ground-blend': 0.55, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 0.6] },
      light: { anchor: 'map', color: '#ffd4a0', intensity: 0.32, position: [1.3, 215, 45] },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0a1226' } },
        // 실사 항공영상: 낮 사진을 어둡고 차게 — 색은 남기되 밝기를 낮춘다
        { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-saturation': -0.35, 'raster-contrast': 0.22, 'raster-brightness-max': 0.58, 'raster-brightness-min': 0.02, 'raster-hue-rotate': 0, 'raster-fade-duration': 300 } },
        // 블루아워 틴트: 전체를 남색으로 한 번 덮는다 (사진 위에 그리는 것이 아니라 색보정)
        { id: 'tint', type: 'fill', source: 'world', paint: { 'fill-color': '#0d1b45', 'fill-opacity': 0.3 } },
        { id: 'water', type: 'fill', source: 'water', paint: { 'fill-color': '#0f1d3f', 'fill-opacity': 0.18 } },
        { id: 'green', type: 'fill', source: 'green', paint: { 'fill-color': '#0a1a1c', 'fill-opacity': 0.16 } },
        // 도로 조명선: OSM 도로 중심선을 따라 따뜻한 빛 (실제 가로등 위치가 아니라 도로를 따르는 연출)
        { id: 'road-glow', type: 'line', source: 'roads', filter: ['>=', ['get', 'cls'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffb15c', 'line-blur': 6, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, ['*', ['get', 'cls'], 1.6], 17, ['*', ['get', 'cls'], 6]], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 16, 0.5, 18, 0.34] } },
        { id: 'road-core', type: 'line', source: 'roads', filter: ['>=', ['get', 'cls'], 2], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffd9a3', 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 0.4, 17, 1.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.35, 17, 0.55] } },
        // 건물 부피: 반투명 유리처럼 — 지붕 질감(항공영상)은 비치고, 벽은 카메라가 움직일 때 시차를 만든다
        { id: 'buildings', type: 'fill-extrusion', source: 'buildings', minzoom: 14.5, paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'h'], 6, '#202c4c', 20, '#2b3b63', 40, '#3a4d7c'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.5, 0.45, 17.5, 0.62], 'fill-extrusion-vertical-gradient': true } },
      ],
    };
  }

  async function boot() {
    let spots, dongs, buildings, roads, water, green;
    try {
      [spots, dongs, buildings, roads, water, green] = await Promise.all([
        loadJson('../../data/spots.json?v=20261021'), loadJson('../../data/places.json?v=20261021'),
        loadJson('data/buildings.geojson'), loadJson('data/roads.geojson'), loadJson('data/water.geojson'), loadJson('data/green.geojson'),
      ]);
    } catch (e) { notice(`데이터를 불러오지 못했습니다: ${e.message}`); return; }
    places = resolvePlaces(spots, dongs);
    prepBuildings(buildings); prepRoads(roads);

    map = new maplibregl.Map({
      container: 'map', style: buildStyle(buildings, roads, water, green),
      ...(REDUCED ? OVERVIEW : INTRO), maxPitch: 70, minZoom: 11, maxZoom: 18.5,
      attributionControl: true, preserveDrawingBuffer: true, antialias: true, fadeDuration: 300,
    });
    map.on('error', (e) => { const m = e && e.error && e.error.message; if (m && !/tile/i.test(m)) notice(`지도 오류: ${m}`); });
    map.on('load', () => {
      try { map.setTerrain({ source: 'dem', exaggeration: 1.25 }); } catch (e) { console.warn('terrain', e); }
      addMarkers(); buildChips(); buildMenu(); bindUi();
      setState('overview');
      $('credit').textContent = `${IMAGERY.attribution} · 지형 Mapzen/AWS · 건물·도로 © OpenStreetMap contributors · 낮 영상을 블루아워 톤으로 보정`;
      if (!REDUCED) setTimeout(() => map.flyTo({ ...OVERVIEW, duration: 4200, curve: 1.3, essential: true }), 500); // 높은 곳에서 내려오며 시작
      const m = location.hash.match(/^#go\/([\w-]+)/);
      if (m && placeById(m[1])) setTimeout(() => select(m[1]), REDUCED ? 0 : 900);
    });
    ['dragstart', 'wheel', 'touchstart', 'mousedown'].forEach((ev) => map.on(ev, () => { interacted = true; stopOrbit(); }));
  }

  /* ---------- 핀 ---------- */
  const markers = new Map();
  function addMarkers() {
    places.forEach((p) => {
      const el = document.createElement('div'); el.className = 'pin-wrap';
      const btn = document.createElement('button'); btn.type = 'button';
      btn.className = `pin${p.ready ? ' hero' : ' pending'}`; btn.dataset.place = p.id;
      btn.title = p.ready ? `${p.name} — 카메라 이동` : `${p.name} — 다음 단계`;
      btn.innerHTML = p.thumb && p.ready ? `<i><img src="${esc(p.thumb)}" alt=""></i><span>${esc(p.short)}</span>` : `<i aria-hidden="true"></i><span>${esc(p.short)}</span>`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (p.ready) select(p.id); else notice(`${p.name}: 좌표는 확인됐지만 이번 장면은 캔모아까지입니다.`); });
      el.appendChild(btn);
      const stem = document.createElement('span'); stem.className = 'pin-stem'; el.appendChild(stem);
      const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -26] }).setLngLat([p.geo.lng, p.geo.lat]).addTo(map);
      markers.set(p.id, mk);
    });
    map.on('move', collidePins); map.on('moveend', collidePins); collidePins();
  }
  // 핀 겹침: 캔모아를 먼저 놓고, 겹치는 핀은 이름을 숨겨 점만 남긴다 (화면이 움직일 때마다)
  let pinRaf = null;
  function collidePins() {
    if (pinRaf) return;
    pinRaf = requestAnimationFrame(() => {
      pinRaf = null;
      const list = places.map((p) => ({ p, el: markers.get(p.id) && markers.get(p.id).getElement().querySelector('.pin') })).filter((x) => x.el);
      const order = list.slice().sort((a, b) => (b.p.ready ? 1 : 0) - (a.p.ready ? 1 : 0));
      const placed = [];
      const box = (el, pad) => { const r = el.getBoundingClientRect(); return { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad }; };
      order.forEach(({ el }) => {
        el.classList.remove('min');
        let b = box(el, 6);
        const hit = placed.some((q) => !(b.r < q.l || b.l > q.r || b.b < q.t || b.t > q.b));
        if (hit) { el.classList.add('min'); b = box(el, 4); }
        placed.push(b);
      });
    });
  }
  function syncSelection() {
    document.querySelectorAll('[data-place]').forEach((b) => { const on = b.dataset.place === current; b.classList.toggle('on', on); if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(on)); });
  }

  /* ---------- 칩·메뉴 ---------- */
  function buildChips() {
    $('chips').innerHTML = places.map((p, i) => `<button type="button" class="chip${p.ready ? '' : ' pending'}" data-place="${esc(p.id)}" aria-pressed="false"><span class="thumb">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : String(i + 1).padStart(2, '0')}</span>${esc(p.short)}</button>`).join('');
    $('chips').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { const p = placeById(b.dataset.place); if (p.ready) select(p.id); else notice(`${p.name}: 이번 장면은 캔모아까지입니다.`); }));
  }
  function buildMenu() {
    $('region-list').innerHTML = places.map((p, i) => `<button type="button" class="rm-item${p.ready ? '' : ' pending'}" data-place="${esc(p.id)}"><small>${String(i + 1).padStart(2, '0')}</small><span>${esc(p.name)}</span><em>${p.ready ? '3D 장면' : '다음 단계'}</em></button>`).join('');
    $('region-list').querySelectorAll('.rm-item').forEach((b) => b.addEventListener('click', () => { toggleMenu(false); const p = placeById(b.dataset.place); if (p.ready) select(p.id); else notice(`${p.name}: 이번 장면은 캔모아까지입니다.`); }));
  }
  function toggleMenu(force) { const m = $('region-menu'), b = $('region-btn'); const open = force ?? m.hidden; m.hidden = !open; b.setAttribute('aria-expanded', String(open)); }

  /* ---------- 선택: 카메라 접근 → 카드 ---------- */
  function select(id) {
    const p = placeById(id); if (!p || !p.ready) return;
    current = id; syncSelection(); hideStreet();
    setState('place');
    $('card').hidden = true;
    const cam = { center: [p.geo.lng, p.geo.lat], ...(p.cam || { zoom: 17, pitch: 64, bearing: 30 }) };
    history.replaceState(null, '', `#go/${id}`);
    const done = () => { showCard(p); if (!REDUCED) startOrbit(); };
    if (REDUCED) { map.jumpTo(cam); done(); return; }
    stopOrbit();
    map.once('moveend', done);
    map.flyTo({ ...cam, duration: 4600, curve: 1.35, speed: 0.8, essential: true });
  }
  function showCard(p) {
    $('card-thumb').innerHTML = p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '';
    $('card-en').textContent = p.en || ''; $('card-name').textContent = p.short; $('card-sub').textContent = p.sub || '';
    $('card-addr').textContent = p.addr ? `${p.addr} · 위치 확인됨` : '위치 확인됨';
    $('card-link').href = p.link; $('card').hidden = false;
  }
  function overview() {
    current = null; syncSelection(); stopOrbit(); hideStreet(); $('card').hidden = true; setState('overview');
    history.replaceState(null, '', location.pathname + location.search);
    if (REDUCED) map.jumpTo(OVERVIEW); else map.flyTo({ ...OVERVIEW, duration: 3200, curve: 1.3, essential: true });
  }
  // 도착 뒤 아주 느린 회전 (사용자가 지도를 만지면 멈춘다)
  function startOrbit() {
    stopOrbit(); interacted = false;
    const t0 = performance.now(); const b0 = map.getBearing();
    const tick = (t) => { if (interacted) return; const s = (t - t0) / 1000; if (s > 14) return; map.setBearing(b0 + s * 0.55); orbitRaf = requestAnimationFrame(tick); };
    orbitRaf = requestAnimationFrame(tick);
  }
  function stopOrbit() { if (orbitRaf) cancelAnimationFrame(orbitRaf); orbitRaf = null; }

  /* ---------- 거리 장면 (실제 사진, 2.5D 시차) ---------- */
  function showStreet() {
    const img = $('scene-img'); if (img.getAttribute('src') !== STREET.src) img.src = STREET.src;
    $('scene-credit').textContent = STREET.credit; $('scene').classList.add('on'); $('scene').setAttribute('aria-hidden', 'false'); setState('street'); stopOrbit();
  }
  function hideStreet() { $('scene').classList.remove('on'); $('scene').setAttribute('aria-hidden', 'true'); if (document.body.dataset.state === 'street') setState(current ? 'place' : 'overview'); }
  if (!REDUCED) {
    let raf = null;
    document.addEventListener('mousemove', (e) => { if (!$('scene').classList.contains('on') || isSheet()) return; const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5; if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { $('scene-plx').style.transform = `translate(${(-x * 14).toFixed(1)}px, ${(-y * 8).toFixed(1)}px)`; }); });
  }

  /* ---------- UI ---------- */
  function bindUi() {
    $('region-btn').addEventListener('click', () => toggleMenu());
    $('region-close').addEventListener('click', () => toggleMenu(false));
    document.addEventListener('pointerdown', (e) => { const m = $('region-menu'); if (m.hidden || m.contains(e.target) || $('region-btn').contains(e.target)) return; toggleMenu(false); });
    $('card-street').addEventListener('click', showStreet);
    $('card-overview').addEventListener('click', overview);
    $('scene-back').addEventListener('click', () => { hideStreet(); });
    $('ctrl-in').addEventListener('click', () => { interacted = true; stopOrbit(); map.zoomTo(map.getZoom() + 0.8, { duration: 600 }); });
    $('ctrl-out').addEventListener('click', () => { interacted = true; stopOrbit(); map.zoomTo(map.getZoom() - 0.8, { duration: 600 }); });
    $('ctrl-north').addEventListener('click', () => overview());
    $('ctrl-2d').addEventListener('click', () => { interacted = true; stopOrbit(); const flat = map.getPitch() > 5; map.easeTo({ pitch: flat ? 0 : (current ? 66 : 62), bearing: flat ? 0 : (current ? placeById(current).cam.bearing : OVERVIEW.bearing), duration: 900 }); $('ctrl-2d').setAttribute('aria-pressed', String(flat)); $('ctrl-2d').textContent = flat ? '3D' : '2D'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('region-menu').hidden) toggleMenu(false); else if ($('scene').classList.contains('on')) hideStreet(); else if (current) overview(); } });
    window.addEventListener('hashchange', () => { const m = location.hash.match(/^#go\/([\w-]+)/); if (m && placeById(m[1]) && current !== m[1]) select(m[1]); else if (!m && current) overview(); });
  }

  window.__v2 = { select, overview, showStreet, hideStreet, places: () => places, map: () => map, stopOrbit };
  boot();
})();
