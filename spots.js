/* ---------- 장소 둘러보기: 거점 3곳 + 주변 장소 탐색 ----------
   app.js의 지도·패널(openPanel/closePanel/renderPanel)·해시를 그대로 쓰고, 지도 화면을
   '장소 둘러보기'(기본)와 '지명 수어'(기존 동 경계·목록·영상) 두 보기로 나눈다.
   데이터: data/spots.json (좌표 precision이 poi/building인 곳만 핀, 나머지는 '위치 확인 중').
   레이아웃 전제: 데스크톱은 패널이 열리면 #map 컨테이너 자체가 줄어든다(패널 폭을 다시 보정하지 않음),
   모바일은 시트가 지도 위를 덮는다(시트 높이만큼만 보정). */
const SPOTS_URL = 'data/spots.json?v=20261016';
let spotsData = null;
let mapMode = 'spots'; // 'spots' | 'signs'
const hubMarkers = new Map();
let nearbyMarkers = [];
let spotState = null; // { hub, level: 'hub'|'list'|'place', place }
let hoverId = null; // 호버·키보드 포커스 중인 장소 id (지도 마커 ↔ 목록 행 동기화)
let labelRaf = null;
const spotsPane = () => map.getPane('spots') || map.createPane('spots');
const spotAnim = () => !prefersReducedMotion() && !document.documentElement.classList.contains('noanim');

const hasPin = (x) => !!(x.geo && x.geo.lat && x.geo.lng && ['poi', 'building'].includes(x.geo.precision));
const hubById = (id) => spotsData.hubs.find((h) => h.id === id);
const placeById = (id) => spotsData.places.find((p) => p.id === id);
const hubNearby = (hub) => hub.nearby.map(placeById).filter(Boolean);
const nearbyNo = (hub, p) => hub.nearby.indexOf(p.id) + 1; // 거점별 고정 번호 (식별용, 순위·순서 아님)

/* ---------- 보기 전환 ---------- */
function setMapMode(mode) {
  if (mode === mapMode && document.body.dataset.mapMode) return;
  mapMode = mode;
  document.body.dataset.mapMode = mode;
  document.querySelectorAll('[data-map-mode]').forEach((b) => {
    const on = b.dataset.mapMode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (isPanelOpen()) closePanel({ keepHash: true });
  clearNearby();
  if (mode === 'spots') {
    setSelectedRegion(null);
    if (!location.hash.startsWith('#spot/')) setHash(null);
    map.invalidateSize({ pan: false });
    fitHubs();
  } else {
    spotState = null;
    hoverId = null;
    markSelected();
    if (!location.hash.startsWith('#map/')) setHash(null);
    map.invalidateSize({ pan: false });
  }
}

/* ---------- 마커 ---------- */
function bindMarkerHover(m, id) {
  m.on('mouseover', () => setHover(id));
  m.on('mouseout', () => setHover(null));
  const el = m.getElement();
  if (el) {
    el.addEventListener('focus', () => setHover(id));
    el.addEventListener('blur', () => setHover(null));
  }
}
function buildHubMarkers() {
  spotsPane().style.zIndex = 640;
  spotsData.hubs.forEach((hub) => {
    if (!hasPin(hub)) return;
    const m = L.marker([hub.geo.lat, hub.geo.lng], {
      icon: L.divIcon({ className: 'hub-wrap', html: `<div class="hub" data-id="${esc(hub.id)}"><i aria-hidden="true"></i><span class="hub-name">${esc(hub.name)}</span></div>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
      pane: 'spots',
      title: hub.name,
      riseOnHover: true,
    });
    m.on('click', () => openHub(hub));
    m.addTo(map);
    bindMarkerHover(m, hub.id);
    hubMarkers.set(hub.id, m);
  });
}
function clearNearby() {
  nearbyMarkers.forEach((m) => map.removeLayer(m));
  nearbyMarkers = [];
  document.body.classList.remove('nearby-open');
  layoutLabels();
}
function showNearby(hub) {
  clearNearby();
  hubNearby(hub).forEach((p) => {
    if (!hasPin(p)) return;
    const no = nearbyNo(hub, p);
    const m = L.marker([p.geo.lat, p.geo.lng], {
      icon: L.divIcon({ className: 'nb-wrap', html: `<div class="nb" data-id="${esc(p.id)}"><i aria-hidden="true">${no}</i><span class="nb-name">${esc(p.name)}</span></div>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
      pane: 'spots',
      title: `${no}. ${p.name}`,
      riseOnHover: true,
    });
    m.on('click', () => {
      openNearbyPlace(hub, p);
      // 같은 자리에 겹친 핀이 있으면 한 단계 확대해 각각 고를 수 있게 한다
      const here = map.latLngToContainerPoint(m.getLatLng());
      const crowded = nearbyMarkers.some((o) => o !== m && here.distanceTo(map.latLngToContainerPoint(o.getLatLng())) < 22);
      if (crowded && map.getZoom() < 18) centerOn(m.getLatLng(), map.getZoom() + 1);
    });
    m.addTo(map);
    m._spotId = p.id;
    bindMarkerHover(m, p.id);
    nearbyMarkers.push(m);
  });
  document.body.classList.add('nearby-open');
  layoutLabels();
}
function markSelected() {
  const selId = spotState ? (spotState.level === 'place' ? spotState.place.id : spotState.hub.id) : null;
  hubMarkers.forEach((m, id) => {
    const el = m.getElement()?.querySelector('.hub');
    if (!el) return;
    el.classList.toggle('on', !!spotState && spotState.hub.id === id);
    m.setZIndexOffset(spotState && spotState.hub.id === id ? 500 : 0);
  });
  nearbyMarkers.forEach((m) => {
    const el = m.getElement()?.querySelector('.nb');
    if (!el) return;
    el.classList.toggle('on', m._spotId === selId);
    m.setZIndexOffset(m._spotId === selId ? 600 : 0);
  });
  layoutLabels();
}
function setHover(id) {
  if (hoverId === id) return;
  hoverId = id;
  hubMarkers.forEach((m, hid) => m.getElement()?.querySelector('.hub')?.classList.toggle('hover', hid === id));
  nearbyMarkers.forEach((m) => m.getElement()?.querySelector('.nb')?.classList.toggle('hover', m._spotId === id));
  panelBodyEl.querySelectorAll('.sp-row').forEach((b) => b.classList.toggle('hover', b.dataset.place === id));
  layoutLabels();
}

/* ---------- 라벨 배치: 겹치지 않는 자리(우/좌/상/하)를 고르고, 자리가 없으면 숨긴다 (거점·선택·호버는 항상 표시) ---------- */
function layoutLabels() {
  if (labelRaf) cancelAnimationFrame(labelRaf);
  labelRaf = requestAnimationFrame(doLayoutLabels);
}
function doLayoutLabels() {
  labelRaf = null;
  if (!map || mapMode !== 'spots') return;
  const size = map.getSize();
  const compactHubs = document.body.classList.contains('nearby-open');
  const items = [];
  hubMarkers.forEach((m, id) => {
    const el = m.getElement()?.querySelector('.hub');
    if (!el) return;
    items.push({ id, kind: 'hub', el, label: el.querySelector('.hub-name'), pt: map.latLngToContainerPoint(m.getLatLng()), r: compactHubs ? 11 : 18, off: compactHubs ? 18 : 26 });
  });
  nearbyMarkers.forEach((m) => {
    const el = m.getElement()?.querySelector('.nb');
    if (!el) return;
    items.push({ id: m._spotId, kind: 'nb', el, label: el.querySelector('.nb-name'), pt: map.latLngToContainerPoint(m.getLatLng()), r: 12, off: 18 });
  });
  const selId = spotState ? (spotState.level === 'place' ? spotState.place.id : spotState.hub.id) : null;
  const prio = (it) => (it.id === selId ? 0 : it.id === hoverId ? 1 : it.kind === 'hub' ? 2 : 3);
  items.sort((a, b) => prio(a) - prio(b));
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const dots = items.map((it) => ({ x: it.pt.x - it.r, y: it.pt.y - it.r, w: it.r * 2, h: it.r * 2 }));
  const placed = [];
  items.forEach((it, i) => {
    const lw = it.label.offsetWidth, lh = it.label.offsetHeight;
    const c = {
      right: { x: it.pt.x + it.off, y: it.pt.y - lh / 2 },
      left: { x: it.pt.x - it.off - lw, y: it.pt.y - lh / 2 },
      top: { x: it.pt.x - lw / 2, y: it.pt.y - it.off - lh },
      bottom: { x: it.pt.x - lw / 2, y: it.pt.y + it.off },
    };
    let chosen = null, best = null, bestScore = Infinity;
    for (const k of ['right', 'left', 'top', 'bottom']) {
      const box = { x: c[k].x, y: c[k].y, w: lw, h: lh };
      const inside = box.x >= 6 && box.y >= 6 && box.x + box.w <= size.x - 6 && box.y + box.h <= size.y - 6;
      let score = inside ? 0 : 100;
      dots.forEach((d, j) => { if (j !== i && hit(box, d)) score += 10; });
      placed.forEach((p) => { if (hit(box, p)) score += 10; });
      if (score < bestScore) { bestScore = score; best = k; }
      if (score === 0) { chosen = k; break; }
    }
    const mustShow = it.kind === 'hub' || it.id === selId || it.id === hoverId;
    const k = chosen || (mustShow ? best : null);
    it.el.classList.remove('pl-right', 'pl-left', 'pl-top', 'pl-bottom');
    if (k) {
      it.el.classList.add('pl-' + k, 'show');
      placed.push({ x: c[k].x, y: c[k].y, w: lw, h: lh });
    } else {
      it.el.classList.remove('show');
    }
  });
}

/* ---------- 카메라 ----------
   보이는 지도 영역 = 컨테이너 전체(데스크톱: 패널만큼 이미 줄어 있음) − 모바일 시트 높이 − 상단 도구 높이 */
const sheetHeight = () => (isSheetMode() && isPanelOpen() ? panelEl.getBoundingClientRect().height : 0);
function visibleInset() {
  return { top: isSheetMode() ? 64 : 84, right: 24, bottom: sheetHeight() + 24, left: 24 };
}
// 패널이 새로 열릴 때는 컨테이너 전환(.32s)이 끝난 실제 크기를 기준으로 계산한다
function whenPanelSettled(wasOpen, fn) {
  if (wasOpen) { requestAnimationFrame(fn); return; }
  setTimeout(() => { map.invalidateSize({ pan: false }); fn(); }, spotAnim() ? 380 : 0);
}
function centerOn(latlng, zoom) {
  const ins = visibleInset();
  const size = map.getSize();
  const target = L.point((size.x + ins.left - ins.right) / 2, (size.y + ins.top - ins.bottom) / 2);
  const offset = L.point(size.x / 2, size.y / 2).subtract(target);
  const z = zoom ?? map.getZoom();
  const center = map.unproject(map.project(latlng, z).add(offset), z);
  if (spotAnim()) map.flyTo(center, z, { duration: 0.7 });
  else map.setView(center, z, { animate: false });
}
function fitPts(pts, pad, maxZoom) {
  const b = L.latLngBounds(pts);
  const opts = { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], maxZoom };
  if (spotAnim()) map.flyToBounds(b, { ...opts, duration: 0.8 });
  else map.fitBounds(b, { ...opts, animate: false });
}
function fitHubs() {
  const pts = spotsData.hubs.filter(hasPin).map((h) => [h.geo.lat, h.geo.lng]);
  if (!pts.length) return;
  // 이름 라벨(최대 ~150px)이 좌우 어느 쪽에 붙어도 잘리지 않을 여백
  const side = isSheetMode() ? 90 : 170;
  fitPts(pts, { top: isSheetMode() ? 150 : 120, left: side, right: side, bottom: isSheetMode() ? 120 : 130 }, 15);
}
function fitNearby(hub) {
  const pts = [[hub.geo.lat, hub.geo.lng], ...hubNearby(hub).filter(hasPin).map((p) => [p.geo.lat, p.geo.lng])];
  const ins = visibleInset();
  fitPts(pts, { top: ins.top + 24, left: 70, right: 70, bottom: ins.bottom + 24 }, 17);
}
function pointVisible(latlng) {
  const pt = map.latLngToContainerPoint(latlng);
  const ins = visibleInset();
  const size = map.getSize();
  return pt.x > ins.left + 40 && pt.x < size.x - ins.right - 40 && pt.y > ins.top + 30 && pt.y < size.y - ins.bottom - 30;
}

/* ---------- 열기 ---------- */
function openHub(hub, { fromHash = false } = {}) {
  const wasOpen = isPanelOpen();
  spotState = { hub, level: 'hub', place: null };
  clearNearby();
  markSelected();
  openPanel({ kind: 'spot' }, 0, { fromHash: true });
  if (!fromHash) setHash(`spot/${hub.id}`);
  if (hasPin(hub)) whenPanelSettled(wasOpen, () => centerOn([hub.geo.lat, hub.geo.lng], Math.max(map.getZoom(), 16)));
}
function openNearbyList(hub, { fromHash = false } = {}) {
  const wasOpen = isPanelOpen();
  spotState = { hub, level: 'list', place: null };
  showNearby(hub);
  markSelected();
  openPanel({ kind: 'spot' }, 0, { fromHash: true });
  if (!fromHash) setHash(`spot/${hub.id}/nearby`);
  whenPanelSettled(wasOpen, () => fitNearby(hub));
}
function openNearbyPlace(hub, place, { fromHash = false } = {}) {
  const wasOpen = isPanelOpen();
  spotState = { hub, level: 'place', place };
  if (!nearbyMarkers.length) showNearby(hub);
  markSelected();
  openPanel({ kind: 'spot' }, 0, { fromHash: true });
  if (!fromHash) setHash(`spot/${hub.id}/${place.id}`);
  if (hasPin(place)) whenPanelSettled(wasOpen, () => { if (!pointVisible([place.geo.lat, place.geo.lng])) centerOn([place.geo.lat, place.geo.lng]); });
}
function showAllHubs() {
  spotState = null;
  clearNearby();
  markSelected();
  if (isPanelOpen()) closePanel({ keepHash: true });
  setHash(null);
  setTimeout(() => { map.invalidateSize({ pan: false }); fitHubs(); }, spotAnim() ? 380 : 0);
}
// 패널의 이전/다음: 거점 단계에선 거점끼리, 주변 단계에선 그 거점의 주변 장소끼리
function stepSpot(dir) {
  if (!spotState) return;
  if (spotState.level === 'hub') {
    const hubs = spotsData.hubs;
    openHub(hubs[(hubs.indexOf(spotState.hub) + dir + hubs.length) % hubs.length]);
  } else {
    const list = hubNearby(spotState.hub);
    const i = spotState.level === 'place' ? list.indexOf(spotState.place) : dir > 0 ? -1 : 0;
    openNearbyPlace(spotState.hub, list[(i + dir + list.length) % list.length]);
  }
}

/* ---------- 패널 내용 ---------- */
function photoHtml(x) {
  if (!x.photo) return ''; // 사진이 없으면 영역 자체를 생략한다
  return `<figure class="sp-photo"><img src="${esc(x.photo)}" alt="${esc(x.name)} 사진" loading="lazy" onerror="this.closest('figure').remove()"></figure>`;
}
function renderSpotPanel() {
  const { hub, level, place } = spotState;
  panelEl.style.setProperty('--kc', '#71E3C1');
  panelEl.dataset.spotLevel = level;
  panelNameEl.classList.remove('mid', 'long');
  panelEnEl.textContent = '';
  const total = hubNearby(hub).length;
  if (level === 'hub') {
    panelNameEl.textContent = hub.name;
    panelSubEl.textContent = '여행의 시작점';
  } else if (level === 'list') {
    panelNameEl.textContent = `${hub.short} 주변`;
    panelSubEl.textContent = `${hub.name} · 주변 장소 ${total}곳`;
  } else {
    panelNameEl.textContent = place.name;
    panelSubEl.textContent = `${hub.short} 주변 · ${nearbyNo(hub, place)}번`;
  }
  document.getElementById('dp-prev').setAttribute('aria-label', level === 'hub' ? '이전 거점' : '이전 주변 장소');
  document.getElementById('dp-next').setAttribute('aria-label', level === 'hub' ? '다음 거점' : '다음 주변 장소');

  let html = '';
  if (level === 'hub') {
    html = `
      ${photoHtml(hub)}
      ${hub.intro ? `<p class="sp-intro">${esc(hub.intro)}</p>` : ''}
      ${hub.pending_note ? `<p class="sp-pending">${esc(hub.pending_note)}</p>` : ''}
      <div class="sp-field"><span class="sp-k">주소</span><p>${esc(hub.address)}</p></div>
      ${hub.contact ? `<section class="sp-card" aria-label="확인한 소통 정보"><h4>확인한 소통 정보</h4><p>${esc(hub.contact.text)}</p><small>확인일 ${esc(hub.contact.checked_on)}</small></section>` : ''}
      ${hub.geo.precision === 'street' ? `<div class="sp-field"><span class="sp-k">지도 위치</span><p class="muted">도로명 기준 근사치예요. 정확한 지점을 확인하고 있어요.</p></div>` : ''}
      ${hub.explore ? `<div class="sp-actions"><button type="button" class="sp-primary" id="sp-explore">주변 둘러보기<span>· ${total}곳</span></button></div>` : ''}
      <div class="sp-secondary">
        <button type="button" class="sp-link" id="sp-all">전체 거점 보기</button>
        ${hub.sign_place && placesData.some((p) => p.id === hub.sign_place) ? `<button type="button" class="sp-link" id="sp-sign" data-place="${esc(hub.sign_place)}">이 동네 지명 수어 보기 ›</button>` : ''}
      </div>`;
  } else if (level === 'list') {
    const items = hubNearby(hub)
      .map((p) => `<li><button type="button" class="sp-row${hasPin(p) ? '' : ' nopin'}" data-place="${esc(p.id)}"><span class="sp-no" aria-hidden="true">${nearbyNo(hub, p)}</span><span class="sp-row-text"><span class="sp-row-name">${esc(p.name)}</span><span class="sp-row-addr">${esc(p.address || '')}${hasPin(p) ? '' : ' · 위치 확인 중'}</span></span></button></li>`)
      .join('');
    html = `
      <p class="sp-context">${esc(hub.name)}을(를) 기준으로 연결한 장소예요. 번호는 지도 핀의 번호와 같고, 순위나 이동 순서가 아니에요.</p>
      <ol class="sp-list" aria-label="${esc(hub.short)} 주변 장소">${items}</ol>
      <div class="sp-secondary">
        <button type="button" class="sp-link" id="sp-back-hub">‹ ${esc(hub.short)} 상세로</button>
        <button type="button" class="sp-link" id="sp-all">전체 거점 보기</button>
      </div>`;
  } else {
    html = `
      ${photoHtml(place)}
      ${place.address ? `<div class="sp-field"><span class="sp-k">주소</span><p>${esc(place.address)}</p></div>` : ''}
      ${hasPin(place) ? '' : `<div class="sp-field"><span class="sp-k">지도 위치</span><p class="muted">위치 확인 중 — 핀은 확인 후 표시돼요.</p></div>`}
      ${(place.related || []).map((r) => `<div class="sp-field"><span class="sp-k">함께 소개할 곳</span><p>${esc(r.name)}</p><p class="muted">${esc(r.note || '')}</p></div>`).join('')}
      <div class="sp-actions"><button type="button" class="sp-outline" id="sp-back-list">‹ ${esc(hub.short)} 주변 목록</button></div>
      <div class="sp-secondary">
        <button type="button" class="sp-link" id="sp-back-hub">${esc(hub.short)} 상세로</button>
        <button type="button" class="sp-link" id="sp-all">전체 거점 보기</button>
      </div>`;
  }
  panelBodyEl.innerHTML = html;
  document.getElementById('sp-explore')?.addEventListener('click', () => openNearbyList(hub));
  document.querySelectorAll('#sp-all').forEach((b) => b.addEventListener('click', showAllHubs));
  document.getElementById('sp-back-hub')?.addEventListener('click', () => openHub(hub));
  document.getElementById('sp-back-list')?.addEventListener('click', () => openNearbyList(hub));
  document.getElementById('sp-sign')?.addEventListener('click', (e) => {
    const pl = placesData.find((p) => p.id === e.currentTarget.dataset.place);
    const region = regions.find((r) => r.records.includes(pl));
    setMapMode('signs');
    if (region) selectRegion(region);
  });
  panelBodyEl.querySelectorAll('.sp-row').forEach((b) => {
    const p = placeById(b.dataset.place);
    b.addEventListener('click', () => openNearbyPlace(hub, p));
    b.addEventListener('mouseenter', () => setHover(p.id));
    b.addEventListener('mouseleave', () => setHover(null));
    b.addEventListener('focus', () => setHover(p.id));
    b.addEventListener('blur', () => setHover(null));
  });
}

/* ---------- 해시 ---------- */
function applySpotHash() {
  const m = location.hash.match(/^#spot\/([\w-]+)(?:\/([\w-]+))?/);
  if (!m || !spotsData) return false;
  const hub = hubById(m[1]);
  if (!hub) return false;
  if (document.body.dataset.view !== 'map') setView('map');
  setMapMode('spots');
  if (!m[2]) openHub(hub, { fromHash: true });
  else if (m[2] === 'nearby') openNearbyList(hub, { fromHash: true });
  else {
    const p = placeById(m[2]);
    if (p && hub.nearby.includes(p.id)) openNearbyPlace(hub, p, { fromHash: true });
    else openHub(hub, { fromHash: true });
  }
  return true;
}

/* ---------- 초기화 (initMap → loadRegions 이후) ---------- */
function initSpots() {
  return fetch(SPOTS_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d) => {
      spotsData = d;
      // Leaflet 기본 접두 표기의 국기 이모지는 빼고 출처 링크만 남긴다 (출처 표기는 유지)
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      buildHubMarkers();
      map.on('zoomend moveend', layoutLabels);
      document.querySelectorAll('[data-map-mode]').forEach((b) => b.addEventListener('click', () => setMapMode(b.dataset.mapMode)));
      document.getElementById('spots-all')?.addEventListener('click', showAllHubs);
      if (location.hash.startsWith('#map/')) setMapMode('signs');
      else {
        setMapMode('spots');
        let restored = false;
        try { restored = applySpotHash(); } catch (e) { console.error('거점 해시 복원 실패:', e); }
        if (!restored) fitHubs();
      }
    })
    .catch((err) => {
      console.error('거점 데이터 로드 실패:', err);
      showMapError('거점 데이터(data/spots.json)를 불러오지 못해 지명 수어 보기로 엽니다.');
      setMapMode('signs');
    });
}
