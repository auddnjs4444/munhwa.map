/* ---------- 장소 둘러보기: 거점 3곳 + 주변 장소 탐색 ----------
   app.js의 지도·패널(openPanel/closePanel/renderPanel)·해시를 그대로 쓰고, 지도 화면을
   '장소 둘러보기'(기본)와 '지명 수어'(기존 동 경계·목록·영상) 두 보기로 나눈다.
   데이터: data/spots.json (좌표 precision이 poi/building인 곳만 핀, 나머지는 '위치 확인 중'). */
const SPOTS_URL = 'data/spots.json?v=20261015';
let spotsData = null;
let mapMode = 'spots'; // 'spots' | 'signs'
const hubMarkers = new Map();
let nearbyMarkers = [];
let spotState = null; // { hub, level: 'hub'|'list'|'place', place }
const spotsPane = () => map.getPane('spots') || map.createPane('spots');

const hasPin = (x) => !!(x.geo && x.geo.lat && x.geo.lng && ['poi', 'building', 'street'].includes(x.geo.precision));
const hubById = (id) => spotsData.hubs.find((h) => h.id === id);
const placeById = (id) => spotsData.places.find((p) => p.id === id);
const hubNearby = (hub) => hub.nearby.map(placeById).filter(Boolean);

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
    fitHubs(false);
  } else {
    spotState = null;
    hubMarkers.forEach((m) => m.getElement()?.classList.remove('on'));
    if (!location.hash.startsWith('#map/')) setHash(null);
    map.invalidateSize();
  }
}

/* ---------- 마커 ---------- */
function hubIcon(hub) {
  const approx = hub.geo.precision === 'street';
  return L.divIcon({
    className: 'hub-wrap',
    html: `<div class="hub${approx ? ' approx' : ''}"><i aria-hidden="true"></i><span class="hub-name">${esc(hub.name)}</span>${approx ? '<small>위치 확인 중</small>' : ''}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
function buildHubMarkers() {
  spotsPane().style.zIndex = 640;
  spotsData.hubs.forEach((hub) => {
    if (!hasPin(hub)) return;
    const m = L.marker([hub.geo.lat, hub.geo.lng], { icon: hubIcon(hub), pane: 'spots', title: hub.name, riseOnHover: true });
    m.on('click', () => openHub(hub));
    m.addTo(map);
    hubMarkers.set(hub.id, m);
  });
}
function clearNearby() {
  nearbyMarkers.forEach((m) => map.removeLayer(m));
  nearbyMarkers = [];
  document.body.classList.remove('nearby-open');
}
function showNearby(hub) {
  clearNearby();
  hubNearby(hub).forEach((p) => {
    if (!hasPin(p)) return;
    const m = L.marker([p.geo.lat, p.geo.lng], {
      icon: L.divIcon({ className: 'nb-wrap', html: `<div class="nb" data-id="${esc(p.id)}"><i aria-hidden="true"></i><span>${esc(p.name)}</span></div>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
      pane: 'spots',
      title: p.name,
    });
    m.on('click', () => openNearbyPlace(hub, p));
    m.addTo(map);
    m._spotId = p.id;
    nearbyMarkers.push(m);
  });
  document.body.classList.add('nearby-open');
}
function markSelected() {
  hubMarkers.forEach((m, id) => m.getElement()?.querySelector('.hub')?.classList.toggle('on', !!spotState && spotState.hub.id === id));
  nearbyMarkers.forEach((m) => m.getElement()?.querySelector('.nb')?.classList.toggle('on', !!spotState && spotState.level === 'place' && spotState.place.id === m._spotId));
}

/* ---------- 카메라: 패널(데스크톱 오른쪽 / 모바일 아래 시트)을 뺀 영역의 가운데로 ---------- */
function panelInset() {
  if (isSheetMode()) return { x: 0, y: Math.round(innerHeight * 0.54) };
  return { x: Math.round(Math.min(Math.max(400, innerWidth * 0.36), 560)), y: 0 };
}
function flyToSpot(latlng, zoom) {
  const ins = panelInset();
  const z = zoom ?? Math.max(map.getZoom(), 16);
  const pt = map.project(latlng, z).add([ins.x / 2, -ins.y / 2]);
  map.flyTo(map.unproject(pt, z), z, { animate: !prefersReducedMotion(), duration: 0.8 });
}
function fitHubs(withPanel) {
  const pts = spotsData.hubs.filter(hasPin).map((h) => [h.geo.lat, h.geo.lng]);
  if (!pts.length) return;
  const ins = withPanel ? panelInset() : { x: 0, y: 0 };
  map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [60, 90], paddingBottomRight: [60 + ins.x, 110 + ins.y], animate: !prefersReducedMotion(), maxZoom: 15 });
}
function fitNearby(hub) {
  const pts = [[hub.geo.lat, hub.geo.lng], ...hubNearby(hub).filter(hasPin).map((p) => [p.geo.lat, p.geo.lng])];
  const ins = panelInset();
  map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [70, 100], paddingBottomRight: [70 + ins.x, 90 + ins.y], animate: !prefersReducedMotion(), duration: 0.8, maxZoom: 16 });
}

/* ---------- 열기 ---------- */
function openHub(hub, { fromHash = false } = {}) {
  spotState = { hub, level: 'hub', place: null };
  clearNearby();
  markSelected();
  openPanel({ kind: 'spot' }, 0, { fromHash: true });
  if (!fromHash) setHash(`spot/${hub.id}`);
  if (hasPin(hub)) flyToSpot([hub.geo.lat, hub.geo.lng], Math.max(map.getZoom(), 16));
}
function openNearbyList(hub, { fromHash = false } = {}) {
  spotState = { hub, level: 'list', place: null };
  showNearby(hub);
  markSelected();
  openPanel({ kind: 'spot' }, 0, { fromHash: true });
  if (!fromHash) setHash(`spot/${hub.id}/nearby`);
  fitNearby(hub);
}
function openNearbyPlace(hub, place, { fromHash = false } = {}) {
  spotState = { hub, level: 'place', place };
  if (!nearbyMarkers.length) showNearby(hub);
  markSelected();
  openPanel({ kind: 'spot' }, 0, { fromHash: true });
  if (!fromHash) setHash(`spot/${hub.id}/${place.id}`);
  if (hasPin(place)) {
    const pt = map.latLngToContainerPoint([place.geo.lat, place.geo.lng]);
    const ins = panelInset();
    const size = map.getSize();
    const visible = pt.x > 40 && pt.x < size.x - ins.x - 40 && pt.y > 90 && pt.y < size.y - ins.y - 40;
    if (!visible) flyToSpot([place.geo.lat, place.geo.lng], map.getZoom());
  }
}
function showAllHubs() {
  spotState = null;
  clearNearby();
  markSelected();
  if (isPanelOpen()) closePanel({ keepHash: true });
  setHash(null);
  setTimeout(() => fitHubs(false), prefersReducedMotion() ? 0 : 60);
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
  const subj = level === 'place' ? place : hub; // 목록 단계는 거점 이름을 제목으로
  panelNameEl.textContent = subj.name;
  panelNameEl.classList.toggle('mid', subj.name.length >= 4 && subj.name.length <= 6);
  panelNameEl.classList.toggle('long', subj.name.length >= 7);
  panelEnEl.textContent = '';
  panelSubEl.textContent = level === 'hub' ? '거점 · 장소 둘러보기' : `${hub.short} 주변`;
  document.getElementById('dp-prev').setAttribute('aria-label', level === 'hub' ? '이전 거점' : '이전 주변 장소');
  document.getElementById('dp-next').setAttribute('aria-label', level === 'hub' ? '다음 거점' : '다음 주변 장소');

  let html = '';
  if (level === 'hub') {
    html = `
      ${photoHtml(hub)}
      ${hub.intro ? `<p class="sp-intro">${esc(hub.intro)}</p>` : ''}
      ${hub.pending_note ? `<p class="sp-pending">${esc(hub.pending_note)}</p>` : ''}
      <dl class="sp-meta">
        <div><dt>주소</dt><dd>${esc(hub.address)}</dd></div>
        ${hub.contact ? `<div><dt>확인한 소통 정보</dt><dd>${esc(hub.contact.text)}<small>확인일 ${esc(hub.contact.checked_on)}</small></dd></div>` : ''}
        ${hub.geo.precision === 'street' ? `<div><dt>지도 위치</dt><dd>도로명 기준 근사치예요. 정확한 지점을 확인하고 있어요.</dd></div>` : ''}
      </dl>
      <div class="sp-actions">
        ${hub.explore ? `<button type="button" class="sp-btn primary" id="sp-explore">주변 둘러보기 <small>${hubNearby(hub).length}곳</small></button>` : ''}
        <button type="button" class="sp-btn" id="sp-all">전체 거점 보기</button>
        ${hub.sign_place && placesData.some((p) => p.id === hub.sign_place) ? `<button type="button" class="sp-btn ghost" id="sp-sign" data-place="${esc(hub.sign_place)}">이 동네 지명 수어 보기 ›</button>` : ''}
      </div>`;
  } else if (level === 'list') {
    const items = hubNearby(hub)
      .map((p) => `<li><button type="button" class="sp-row" data-place="${esc(p.id)}"><span class="sp-row-name">${esc(p.name)}</span><span class="sp-row-addr">${esc(p.address || p.address_note || '')}</span>${hasPin(p) ? '' : '<span class="sp-row-tag">위치 확인 중</span>'}</button></li>`)
      .join('');
    html = `
      <p class="sp-context">${esc(hub.name)} 주변 장소 ${hubNearby(hub).length}곳 · 지도의 작은 핀과 같은 목록이에요</p>
      <ul class="sp-list">${items}</ul>
      <div class="sp-actions">
        <button type="button" class="sp-btn" id="sp-back-hub">‹ ${esc(hub.short)} 상세로</button>
        <button type="button" class="sp-btn ghost" id="sp-all">전체 거점 보기</button>
      </div>`;
  } else {
    html = `
      ${photoHtml(place)}
      <dl class="sp-meta">
        ${place.address ? `<div><dt>주소</dt><dd>${esc(place.address)}</dd></div>` : ''}
        ${place.address_note ? `<div><dt>주소</dt><dd class="muted">${esc(place.address_note)}</dd></div>` : ''}
        ${hasPin(place) ? '' : `<div><dt>지도 위치</dt><dd class="muted">위치 확인 중 — 핀은 확인 후 표시돼요.</dd></div>`}
        ${(place.related || []).map((r) => `<div><dt>함께 소개할 곳</dt><dd>${esc(r.name)}<small>${esc(r.note || '')}</small></dd></div>`).join('')}
      </dl>
      <div class="sp-actions">
        <button type="button" class="sp-btn" id="sp-back-list">‹ ${esc(hub.short)} 주변 목록</button>
        <button type="button" class="sp-btn ghost" id="sp-back-hub">${esc(hub.short)} 상세로</button>
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
  panelBodyEl.querySelectorAll('.sp-row').forEach((b) => b.addEventListener('click', () => openNearbyPlace(hub, placeById(b.dataset.place))));
  panelBodyEl.querySelectorAll('.sp-row').forEach((b) => b.classList.toggle('on', level === 'place' && b.dataset.place === place?.id));
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
      buildHubMarkers();
      document.querySelectorAll('[data-map-mode]').forEach((b) => b.addEventListener('click', () => setMapMode(b.dataset.mapMode)));
      document.getElementById('spots-all')?.addEventListener('click', showAllHubs);
      if (location.hash.startsWith('#map/')) setMapMode('signs');
      else {
        setMapMode('spots');
        let restored = false;
        try { restored = applySpotHash(); } catch (e) { console.error('거점 해시 복원 실패:', e); }
        if (!restored) fitHubs(false);
      }
    })
    .catch((err) => {
      console.error('거점 데이터 로드 실패:', err);
      showMapError('거점 데이터(data/spots.json)를 불러오지 못해 지명 수어 보기로 엽니다.');
      setMapMode('signs');
    });
}
