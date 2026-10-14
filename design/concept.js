/* 디자인 시안 공용 로직 — 기존 app.js를 건드리지 않고 같은 데이터(GeoJSON, places, dong-records)로
   지도·경계·선택·패널·영상을 렌더링한다. 시안(C-1/C-2)별 차이는 window.CONCEPT 설정과 각 HTML의 CSS가 담당. */
(() => {
  const C = Object.assign(
    {
      id: 'c1',
      tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      spotlight: true,        // 선택 지역 밖을 어둡게 (C-1)
      hatch: false,           // 선택 지역 빗금 채움 (C-2)
      labelsAlways: false,    // 모든 동 이름 상시 표시 (C-2)
      photoSize: [320, 220],  // 지도 위 사진 카드 크기
      bigNameOnMap: true,     // 지도 위 큰 지명 (C-1)
      selectZoomMax: 15,
      base: { color: 'rgba(244,243,239,0.35)', weight: 1, fill: '#F4F3EF', fillOpacity: 0.03 },
      hover: { color: '#D5AD6A', weight: 1.5, fillOpacity: 0.12 },
      selected: { color: '#F0C576', weight: 2.2, fillOpacity: 0.14 },
    },
    window.CONCEPT || {}
  );
  const q = new URLSearchParams(location.search);
  const NOANIM = q.has('noanim') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (NOANIM) document.documentElement.classList.add('noanim');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isSheet = () => matchMedia('(max-width: 767px)').matches;

  const $ = (id) => document.getElementById(id);
  const panel = $('panel'), body = $('panel-body'), nameEl = $('p-name'), enEl = $('p-en');
  const menu = $('menu'), menuBtn = $('menu-btn');

  /* ---------- 지도 ---------- */
  const map = L.map('map', { zoomControl: false, scrollWheelZoom: true, attributionControl: true });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer(C.tiles, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  map.createPane('shade'); map.getPane('shade').style.zIndex = 350;
  map.createPane('regions'); map.getPane('regions').style.zIndex = 400;
  map.createPane('art'); map.getPane('art').style.zIndex = 650;

  const regions = []; let selected = null, hovered = null, records = {}, placesEn = {}, places = [];
  let shadeLayer = null, photoMarker = null, nameMarker = null;

  function pointInRing(lng, lat, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
  function pip(lng, lat, g) { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.some((r) => pointInRing(lng, lat, r[0]) && !r.slice(1).some((h) => pointInRing(lng, lat, h))); }
  function area(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return Math.abs(a) / 2; }
  function centroid(ring) { let a = 0, x = 0, y = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f; } return a ? [y / (3 * a), x / (3 * a)] : [ring[0][1], ring[0][0]]; }
  const outer = (g) => (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]);

  function style(r) {
    const s = r === selected ? C.selected : r === hovered ? C.hover : C.base;
    return { className: 'rg' + (r === selected ? ' rg-sel' : ''), color: s.color, weight: s.weight, opacity: 1, fillColor: s.fill || s.color, fillOpacity: s.fillOpacity, dashArray: r.type === '행정동' ? '4 5' : null, lineJoin: 'round' };
  }
  // Leaflet의 setStyle은 className을 갱신하지 않으므로 선택 클래스(빗금 채움용)는 직접 토글한다
  const restyle = () => regions.forEach((r) => { r.layer.setStyle(style(r)); r.layer.getLayers()[0]?.getElement()?.classList.toggle('rg-sel', r === selected); });
  const at = (ll) => regions.filter((r) => r.bounds.contains(ll) && pip(ll.lng, ll.lat, r.geom)).sort((a, b) => a.area - b.area);

  /* ---------- 선택 지역 밖을 어둡게 (C-1) : 세계를 덮는 폴리곤에 선택 지역을 구멍으로 ---------- */
  function updateShade() {
    if (shadeLayer) { map.removeLayer(shadeLayer); shadeLayer = null; }
    if (!C.spotlight || !selected) return;
    const world = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
    const holes = (selected.geom.type === 'Polygon' ? [selected.geom.coordinates] : selected.geom.coordinates).map((p) => p[0].map(([x, y]) => [y, x]));
    shadeLayer = L.polygon([world, ...holes], { pane: 'shade', interactive: false, stroke: false, fillColor: '#040404', fillOpacity: 0.62, className: 'shade' }).addTo(map);
  }

  /* ---------- 지도 위 사진 카드 + 큰 지명 (지리 좌표에 고정 → 확대·이동에 동기화) ---------- */
  function updateArt() {
    [photoMarker, nameMarker].forEach((m) => m && map.removeLayer(m));
    photoMarker = nameMarker = null;
    if (!selected) return;
    const r = selected, pl = r.place;
    const [w, h] = isSheet() ? [Math.round(C.photoSize[0] * 0.62), Math.round(C.photoSize[1] * 0.62)] : C.photoSize;
    const photo = pl && pl.photo
      ? `<img src="../${esc(pl.photo)}" alt="${esc(r.name)} 풍경" onerror="this.parentNode.classList.add('failed')">`
      : '';
    const html = `
      <div class="art-card${photo ? '' : ' ph'}" style="--w:${w}px;--h:${h}px">
        <div class="art-img">${photo}<div class="art-ph">시안용 이미지 영역<br><b>${esc(r.name)} 실제 풍경 사진 자리</b><br><small>실제 촬영 사진으로 교체 예정</small></div></div>
        <figcaption><span class="art-no">PL. ${String(regions.indexOf(r) + 1).padStart(2, '0')}</span><span>${esc(r.name)} · ${esc(r.type)}</span></figcaption>
        <i class="art-leader" aria-hidden="true"></i><i class="art-dot" aria-hidden="true"></i>
      </div>`;
    // 카드는 지역 북서쪽 모서리 근처에, 지시선 끝(dot)이 지역 중심을 가리킨다
    photoMarker = L.marker(r.centroid, { pane: 'art', interactive: false, icon: L.divIcon({ className: 'art-wrap', html, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
    if (C.bigNameOnMap) {
      const south = r.bounds.getSouth();
      nameMarker = L.marker([south, r.centroid[1]], { pane: 'art', interactive: false, icon: L.divIcon({ className: 'bigname-wrap', html: `<div class="bigname"><span>${esc(r.name)}</span><small>${esc(r.en)}</small></div>`, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
    }
  }

  /* ---------- 카메라: 패널이 가리지 않는 영역 안에서 선택 지역이 크게 보이도록 ---------- */
  function focus(r, animate = !NOANIM) {
    const pw = isSheet() ? 0 : panel.getBoundingClientRect().width;
    const ph = isSheet() ? panel.getBoundingClientRect().height : 0;
    // 모바일은 위쪽을 넉넉히 비워 사진 카드가 상단 버튼과 겹치지 않게 한다
    map.flyToBounds(r.bounds, { paddingTopLeft: [isSheet() ? 24 : 80, isSheet() ? 210 : 110], paddingBottomRight: [pw + (isSheet() ? 24 : 80), ph + (isSheet() ? 30 : 140)], maxZoom: C.selectZoomMax, animate, duration: 0.9 });
  }

  /* ---------- 패널 ---------- */
  function stopVideo() { const v = $('pv'); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } }
  function openPanel(r) {
    stopVideo();
    const pl = r.place;
    nameEl.textContent = r.name; enEl.textContent = r.en;
    $('p-idx').textContent = String(regions.indexOf(r) + 1).padStart(2, '0');
    const parts = (pl?.sign_parts || []).map((p) => `<span class="part${/^[ㄱ-ㅎ]$/.test(p) ? ' jamo' : ''}">${esc(p)}</span>`).join('<i>+</i>');
    const memos = (pl?.memories || []).map((m) => `<div class="memo"><b>${esc(m.spot)}</b><p>${esc(m.hand)}</p><small>${esc(m.by)}님 · 광주 ${esc(m.years)}년</small></div>`).join('');
    const video = pl?.videos?.length
      ? `<div class="vwrap" style="--ar:${pl.videos[0].ratio || 0.75}"><video id="pv" playsinline preload="metadata" poster="../${esc(pl.videos[0].poster)}" src="../${esc(pl.videos[0].src)}" aria-label="${esc(r.name)} 수어 영상"></video><button type="button" class="play" id="play">수어 영상 보기<i></i></button></div>`
      : `<div class="vwrap none"><span>SIGN — COMING SOON<br>영상 준비 중</span></div>`;
    body.innerHTML = `
      ${video}
      <dl class="meta"><div><dt>기록</dt><dd>GSL® / ${String(places.indexOf(pl) + 1).padStart(2, '0')}</dd></div><div><dt>경계</dt><dd>${esc(r.type)} · ${esc(r.codes.join(', '))}</dd></div><div><dt>영상</dt><dd>${pl?.videos?.length ? '세로 3:4 · 무음' : '준비 중'}</dd></div></dl>
      ${parts ? `<h3>수어 표현 구성</h3><div class="parts">${parts}</div>` : ''}
      <h3>농인의 기억</h3>${memos || '<p class="pending">기록 준비 중</p>'}
      ${(pl?.tags || []).length ? `<div class="tags">${pl.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`;
    const v = $('pv'), play = $('play');
    if (v && play) { play.addEventListener('click', () => { v.controls = true; v.play().catch(() => {}); }); v.addEventListener('playing', () => (play.hidden = true)); v.addEventListener('pause', () => (play.hidden = false)); }
    document.body.classList.add('panel-open');
    panel.hidden = false; void panel.offsetWidth; panel.classList.add('on');
    panel.scrollTop = 0;
  }
  function closePanel() { stopVideo(); panel.classList.remove('on'); document.body.classList.remove('panel-open'); select(null); setTimeout(() => { panel.hidden = true; map.invalidateSize(); }, NOANIM ? 0 : 320); }

  function select(r, { fly = true } = {}) {
    selected = r; restyle(); updateShade(); updateArt();
    menu.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === r?.id));
    if (!r) return;
    r.layer.bringToFront();
    openPanel(r);
    setTimeout(() => { map.invalidateSize(); focus(r); }, NOANIM ? 0 : 60);
  }
  const step = (d) => selected && select(regions[(regions.indexOf(selected) + d + regions.length) % regions.length]);
  $('p-prev').addEventListener('click', () => step(-1)); $('p-next').addEventListener('click', () => step(1)); $('p-close').addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!menu.hidden) toggleMenu(false); else if (!panel.hidden) closePanel(); } });

  /* ---------- 지역 선택 메뉴 (기본 숨김) ---------- */
  function toggleMenu(force) { const on = force ?? menu.hidden; menu.hidden = !on; menuBtn.setAttribute('aria-expanded', String(on)); if (on) menu.querySelector('button')?.focus(); }
  menuBtn.addEventListener('click', () => toggleMenu());
  $('menu-close')?.addEventListener('click', () => toggleMenu(false));

  /* ---------- 이벤트: 좌표 기준 판정 (겹침 처리는 본 구현과 동일 원리, 시안에선 가장 작은 지역) ---------- */
  map.on('mousemove', (e) => { const h = at(e.latlng)[0] || null; if (h !== hovered) { hovered = h; restyle(); map.getContainer().classList.toggle('hit', !!h); } const tip = $('tip'); if (h) { tip.textContent = h.name; tip.style.transform = `translate(${e.containerPoint.x + 14}px, ${e.containerPoint.y + 14}px)`; tip.hidden = false; } else tip.hidden = true; });
  map.on('click', (e) => { const h = at(e.latlng)[0]; if (h) select(h); });
  map.on('zoomend', () => regions.forEach((r) => { const show = C.labelsAlways ? map.getZoom() >= 12 : map.getZoom() >= (r.area > 0.0002 ? 13 : 15); if (show && !map.hasLayer(r.label)) r.label.addTo(map); if (!show && map.hasLayer(r.label)) map.removeLayer(r.label); }));

  /* ---------- 데이터 ---------- */
  Promise.all(['../data/gwangju_donggu_sign_16.geojson', '../data/places.json', '../data/dong-records.json'].map((u) => fetch(u).then((r) => r.json()))).then(([geo, pls, rec]) => {
    places = pls; records = rec.regions; placesEn = rec.places_en || {};
    const byId = new Map(pls.map((p) => [p.id, p]));
    geo.features.forEach((f) => {
      const p = f.properties, e = records[p.id] || {}, place = byId.get((e.records || [])[0]) || null;
      const layer = L.geoJSON(f, { pane: 'regions', interactive: false, style: () => ({}) });
      const r = { id: p.id, name: p.name, en: e.en || '', type: p.boundary_type, codes: p.component_codes || [], geom: f.geometry, bounds: layer.getBounds(), area: area(outer(f.geometry)), centroid: centroid(outer(f.geometry)), place, layer };
      r.label = L.tooltip({ permanent: true, direction: 'center', className: 'dlabel', interactive: false, opacity: 1 }).setLatLng(r.centroid).setContent(C.labelsAlways ? `<b>${String(geo.features.indexOf(f) + 1).padStart(2, '0')}</b>${esc(r.name)}` : esc(r.name));
      regions.push(r);
    });
    regions.slice().sort((a, b) => b.area - a.area).forEach((r) => { r.layer.setStyle(style(r)); r.layer.addTo(map); });
    map.fire('zoomend');
    // 메뉴
    regions.forEach((r, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.id = r.id; b.innerHTML = `<small>${String(i + 1).padStart(2, '0')}</small><span>${esc(r.name)}</span><i class="${r.place?.videos?.length ? 'has' : 'no'}" title="${r.place?.videos?.length ? '수어 영상 있음' : '영상 준비 중'}"></i>`; b.addEventListener('click', () => { toggleMenu(false); select(r); }); menu.querySelector('.menu-grid').appendChild(b); });
    // 초기 화면: 동구 16개 경계가 모두 들어오는 범위
    const all = regions.reduce((b, r) => b.extend(r.bounds), L.latLngBounds(regions[0].bounds.getSouthWest(), regions[0].bounds.getNorthEast()));
    map.fitBounds(all, { padding: [60, 60], animate: false });
    // 시안 조건: 계림동 선택 상태
    const target = regions.find((r) => r.name === (q.get('dong') || '계림동'));
    setTimeout(() => select(target), NOANIM ? 50 : 700);
    // C-2: 선택 지역 빗금 패턴을 Leaflet SVG에 심는다
    if (C.hatch) { const svg = map.getPane('regions').querySelector('svg'); if (svg) { const d = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); d.innerHTML = '<pattern id="hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#1A1612" stroke-width="1" stroke-opacity="0.55"/></pattern>'; svg.prepend(d); } }
    window.__concept = { map, regions, select };
  }).catch((err) => { console.error(err); document.getElementById('err').hidden = false; document.getElementById('err').textContent = '경계·기록 데이터를 불러오지 못했습니다: ' + err.message; });
})();
