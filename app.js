/* 손으로 부르는 광주 — 아카이브(가로 트랙) / 지도 / 소개 3개 뷰 구조 */

const trackEl = document.getElementById('track');
const rulerStripEl = document.getElementById('ruler-strip');
const overlayEl = document.getElementById('overlay');
const detailEl = document.getElementById('detail');
const closeBtn = document.getElementById('ov-close');

// 장소 고유 색 — 카드 그라디언트, 지도 마커, 눈금자 라벨에 함께 쓴다
const PALETTE = [
  '#FF5A36', '#4FA3FF', '#FFC53D', '#9B7BFF', '#59C48C',
  '#FF7BAE', '#3DD6C6', '#C4E04A', '#E86BFF', '#FF9F45',
  '#5ED1FF', '#FFE066', '#B388FF', '#7FE0A0', '#FF6B6B',
  '#4DD0C4', '#F4A261', '#A3E635', '#F472B6', '#60A5FA',
];
const placeColor = (i) => PALETTE[i % PALETTE.length];

const revealedSensitive = new Set();
const markersById = new Map();
let placesData = [];
let map = null;
let activeMarker = null;
let lastFocused = null;

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 뷰 전환 ---------- */
function setView(name) {
  document.body.dataset.view = name;
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('on', v.id === `view-${name}`);
  });
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.classList.toggle('on', b.dataset.nav === name);
  });
  if (name === 'map') initMap();
}
document.querySelectorAll('[data-nav]').forEach((b) => {
  b.addEventListener('click', () => setView(b.dataset.nav));
});

/* ---------- 기록 오버레이 ---------- */
function openOverlay(place) {
  lastFocused = document.activeElement;
  overlayEl.hidden = false;
  renderPlace(place);
  closeBtn.focus();
}
function closeOverlay() {
  const playing = document.getElementById('sign-video');
  if (playing) playing.pause();
  overlayEl.hidden = true;
  detailEl.innerHTML = '';
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
closeBtn.addEventListener('click', closeOverlay);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (typeof storyIsOpen === 'function' && storyIsOpen()) { closeStory(); return; }
  if (typeof regionListEl !== 'undefined' && regionListEl && !regionListEl.hidden) { toggleRegionMenu(false); regionMenuBtn.focus(); return; }
  if (!overlayEl.hidden) closeOverlay();
  else if (typeof closePanel === 'function' && isPanelOpen()) closePanel();
});

// FIXME: replace with the real video once footage is edited.
// Fill video_youtube_id in data/places.json with a YouTube "unlisted" video ID.
function videoBoxHtml(place) {
  // 직접 올린 수어 영상 (정면/측면 등 여러 각도). data/places.json 의 videos 배열 참고.
  if (place.videos && place.videos.length) {
    const first = place.videos[0];
    const tabs = place.videos.length > 1
      ? `<div class="angles" role="group" aria-label="촬영 각도">${place.videos
          .map((v, i) => `<button type="button" class="angle${i === 0 ? ' on' : ''}" data-angle="${i}" aria-pressed="${i === 0}">${v.label}</button>`)
          .join('')}</div>`
      : '';
    return `<div class="video-box has-video"${first.ratio ? ` style="--ar:${first.ratio}"` : ''}><video id="sign-video" src="${first.src}" ${first.poster ? `poster="${first.poster}"` : ''} autoplay muted loop playsinline controls preload="auto" aria-label="${place.name} 수어 영상 (${first.label})"></video></div>${tabs}`;
  }
  if (place.video_youtube_id) {
    return `<div class="video-box"><iframe src="https://www.youtube.com/embed/${place.video_youtube_id}" title="${place.name} 수어 영상" allowfullscreen></iframe></div>`;
  }
  return `<div class="video-box"><span class="placeholder">SIGN — COMING SOON<br>수어 영상 촬영 예정</span></div>`;
}

/* ---------- 수어 표현 구성 (places.json 의 sign_parts) ---------- */
// 자음 한 글자(ㄱ, ㅊ 등)는 지화로 표시한다
const isJamo = (part) => /^[ㄱ-ㅎ]$/.test(part);

function signPartsHtml(place) {
  const parts = place.sign_parts || [];
  if (!parts.length) return '';
  const chips = parts
    .map((part) =>
      isJamo(part)
        ? `<span class="part jamo" title="지화(손가락 글자)">${part}<small>지화</small></span>`
        : `<span class="part">${part}</span>`
    )
    .join('<span class="plus" aria-hidden="true">+</span>');
  const more = place.sign_parts_note
    ? '<span class="plus" aria-hidden="true">+</span><span class="part pending">…</span>'
    : '';
  const note = place.sign_parts_note ? `<p class="parts-note">${place.sign_parts_note}</p>` : '';
  return `
    <p class="section-label">수어 표현 구성</p>
    <div class="parts" aria-label="${place.name} 수어 표현 구성: ${parts.join(' 더하기 ')}">${chips}${more}</div>
    ${note}`;
}

/* 소개 화면의 수어 표현 구성 목록 — 행을 누르면 해당 기록이 열린다 */
function buildSignIndex(places) {
  const listEl = document.getElementById('sign-index');
  if (!listEl) return;
  const rows = places.filter((p) => p.sign_parts && p.sign_parts.length);
  if (!rows.length) {
    listEl.closest('.sign-index-wrap').hidden = true;
    return;
  }
  listEl.innerHTML = '';
  rows.forEach((place) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'sign-row';
    row.style.setProperty('--c', place._color);
    const formula = place.sign_parts.join(' + ') + (place.sign_parts_note ? ' + …' : '');
    row.innerHTML = `<span class="sr-name"><i aria-hidden="true"></i>${place.name}</span><span class="sr-parts">${formula}</span>`;
    row.addEventListener('click', () => openOverlay(place));
    listEl.appendChild(row);
  });
}

/* ---------- 장소 기억: 팀 수첩 메모 카드 (places.json 의 memories) ---------- */
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 인터뷰 장소 기억(memory_entries): 제목·부제·장소·참여자·본문(문단)·기억의 한마디.
// 메모 카드와 같은 .memo.has-more 구조라 펼치기/접기 위임 처리를 그대로 쓴다.
function storyEntriesHtml(place) {
  const entries = place.memory_entries || [];
  if (!entries.length) return '';
  const items = entries
    .map((e, i) => {
      const n = e.narrator || {};
      const who = [n.name, n.identity, n.origin, n.years].filter(Boolean).map(esc).join(' · ');
      const paras = String(e.text || '')
        .split(/\n\s*\n/)
        .map((t) => `<p>${esc(t.trim())}</p>`)
        .join('');
      const open = entries.length === 1; // 하나뿐이면 바로 읽을 수 있게 펼쳐 둔다
      return `
      <article class="memo has-more story${open ? ' open' : ''}" role="button" tabindex="0" aria-expanded="${open}">
        <header class="memo-head"><span class="memo-spot">${String(i + 1).padStart(2, '0')} · ${esc(e.location)}</span><span class="story-who">인터뷰 · ${esc(n.name || '')}</span></header>
        <h4 class="story-title">${esc(e.title)}</h4>
        ${e.subtitle ? `<p class="story-sub">${esc(e.subtitle)}</p>` : ''}
        <div class="memo-more">
          <p class="story-narrator">인터뷰 참여자 — ${who}</p>
          <div class="story-text">${paras}</div>
          ${e.quote ? `<blockquote class="story-quote">“${esc(e.quote)}”</blockquote>` : ''}
          ${(e.tags || []).length ? `<p class="story-tags">${e.tags.map((t) => `#${esc(t)}`).join(' ')}</p>` : ''}
        </div>
      </article>`;
    })
    .join('');
  return `<div class="stories">${items}</div>`;
}

function memoriesHtml(place) {
  const memos = place.memories || [];
  const stories = storyEntriesHtml(place);
  if (!memos.length) {
    if (stories) return stories + (place.memory_text ? `<p class="section-text">${esc(place.memory_text)}</p>` : '');
    return `<p class="section-text">${esc(place.memory_text) || '(아직 수집되지 않음)'}</p>`;
  }
  const cards = memos
    .map((m, i) => {
      const more = m.story || m.note;
      const detail = more
        ? `<div class="memo-more">${m.story ? `<p class="memo-story">${esc(m.story)}</p>` : ''}${m.note ? `<p class="memo-note">${esc(m.note)}</p>` : ''}</div>`
        : '';
      return `
      <article class="memo${more ? ' has-more' : ''}" data-by="${esc(m.by)}" style="--d:${(i * 0.12).toFixed(2)}s"${more ? ' role="button" tabindex="0" aria-expanded="false"' : ''}>
        <header class="memo-head"><span class="memo-spot">${esc(m.spot)}</span><span class="memo-by">${esc(m.by)} · ${esc(m.years)}</span></header>
        <p class="memo-hand">${esc(m.hand)}</p>
        <p class="memo-src">팀 수첩에서 · ${esc(m.by)}님 · 광주 ${esc(m.years)}년</p>
        ${detail}
      </article>`;
    })
    .join('');
  const extra = place.memory_text ? `<p class="section-text">${esc(place.memory_text)}</p>` : '';
  return `<div class="memos">${cards}</div>${stories}${extra}`;
}

// 펼치기/접기 — detail 영역은 매번 innerHTML로 새로 그려지므로 위임으로 한 번만 건다
function toggleMemo(memo) {
  const open = memo.classList.toggle('open');
  memo.setAttribute('aria-expanded', String(open));
}
detailEl.addEventListener('click', (e) => {
  const memo = e.target.closest('.memo.has-more');
  if (!memo || !detailEl.contains(memo)) return;
  if (memo.classList.contains('story') && memo.classList.contains('open') && e.target.closest('.memo-more')) return; // 펼친 본문 클릭은 접지 않음
  toggleMemo(memo);
});
detailEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const memo = e.target.closest('.memo.has-more');
  if (memo && e.target === memo) {
    e.preventDefault();
    toggleMemo(memo);
  }
});

function renderPlace(place) {
  // 5·18 등 민감한 지점은 자문 확보 여부와 무관하게 항상 안내 문구를 먼저 보여준다.
  // 이 게이트 로직은 임의로 지우지 말 것 — 윤리 원칙(사업제안서 XI장) 참고.
  if (place.sensitive && !revealedSensitive.has(place.id)) {
    detailEl.innerHTML = `
      <div class="sensitive-gate">
        <p class="section-text">${place.sensitive_notice || '이 지점은 역사적으로 민감한 기록을 담고 있습니다. 계속 보시겠어요?'}</p>
        <button id="reveal-btn">기록 보기</button>
      </div>`;
    document.getElementById('reveal-btn').onclick = () => {
      revealedSensitive.add(place.id);
      renderPlace(place);
    };
    return;
  }

  const idx = placesData.indexOf(place) + 1;
  detailEl.style.setProperty('--kc', place._color || 'var(--muted)');
  detailEl.innerHTML = `
    <p class="ov-kicker">GSL®/${String(idx).padStart(2, '0')} — 수어 지명 기록</p>
    <h2>${place.name}</h2>
    ${videoBoxHtml(place)}
    ${signPartsHtml(place)}
    <p class="section-label">장소 기억</p>
    ${memoriesHtml(place)}
    <div class="tags">
      ${(place.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
    </div>`;

  // 정면/측면 전환
  const videoEl = document.getElementById('sign-video');
  // 플레이어 비율을 실제 영상 비율에 맞춘다 (9:16, 3:4 등 촬영본마다 다름)
  if (videoEl) {
    videoEl.addEventListener('loadedmetadata', () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        videoEl.parentElement.style.setProperty('--ar', videoEl.videoWidth / videoEl.videoHeight);
      }
    });
  }
  detailEl.querySelectorAll('.angle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = place.videos[Number(btn.dataset.angle)];
      detailEl.querySelectorAll('.angle').forEach((b) => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      videoEl.src = v.src;
      if (v.poster) videoEl.poster = v.poster;
      videoEl.setAttribute('aria-label', `${place.name} 수어 영상 (${v.label})`);
      videoEl.play().catch(() => {});
    });
  });
}

/* ---------- 아카이브 트랙 ---------- */
function mediaHtml(place, idx) {
  // 카드에는 영상 썸네일을 쓰지 않는다 — 장소 색 + 번호만 두고, 영상은 클릭 후 전체 화면으로.
  const hasVideo = !!((place.videos && place.videos.length) || place.video_youtube_id);
  return `<span class="ph${hasVideo ? ' ready' : ''}"><span>${hasVideo ? 'SIGN — PLAY' : 'SIGN — SOON'}</span><span class="no">${String(idx).padStart(2, '0')}</span></span>`;
}

function buildTrack(places) {
  places.forEach((place, i) => {
    const idx = i + 1;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'work';
    card.style.setProperty('--c', place._color || placeColor(i));
    card.innerHTML = `
      <span class="media">${mediaHtml(place, idx)}</span>
      <span class="cap"><span>${place.name}</span><span class="idx">GSL®/${String(idx).padStart(2, '0')}</span></span>`;
    card.addEventListener('click', () => openOverlay(place));
    trackEl.appendChild(card);
  });
}

/* 세로 휠 → 가로 스크롤 */
trackEl.addEventListener(
  'wheel',
  (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      trackEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  },
  { passive: false }
);

/* 마우스 드래그로 넘기기 (터치는 브라우저 기본 스크롤 사용) */
let dragging = false;
let dragStartX = 0;
let dragStartScroll = 0;
let dragMoved = false;
trackEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') return;
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartScroll = trackEl.scrollLeft;
  trackEl.classList.add('dragging');
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 4) dragMoved = true;
  trackEl.scrollLeft = dragStartScroll - dx;
});
window.addEventListener('pointerup', () => {
  dragging = false;
  trackEl.classList.remove('dragging');
});
/* 드래그였다면 카드 클릭으로 처리하지 않는다 */
trackEl.addEventListener('click', (e) => {
  if (dragMoved) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

/* ---------- 하단 눈금자: 장소 이름 라벨 + 틱, 트랙 스크롤에 비율 동기화 ---------- */
function buildRuler(places) {
  // 스트립이 화면보다 확실히 길어야 스크롤에 맞춰 움직일 여지가 생긴다
  const TICK_W = 14;
  const perPlace = Math.max(
    22,
    Math.ceil((window.innerWidth * 1.8) / TICK_W / Math.max(places.length, 1))
  );
  const strip = [];
  places.forEach((place) => {
    for (let t = 0; t < perPlace; t++) {
      strip.push(
        t === 0
          ? `<span class="tick major" style="--tc:${place._color}"><span class="lab">${place.name}</span></span>`
          : '<span class="tick"></span>'
      );
    }
  });
  strip.push('<span class="tick major"><span class="lab">GSL®/2026</span></span>');
  rulerStripEl.innerHTML = strip.join('');
}
function syncRuler() {
  const max = trackEl.scrollWidth - trackEl.clientWidth;
  if (max <= 0) return;
  const ratio = trackEl.scrollLeft / max;
  const stripMax = rulerStripEl.scrollWidth - window.innerWidth;
  rulerStripEl.style.transform = `translateX(${-ratio * Math.max(stripMax, 0)}px)`;
}
trackEl.addEventListener('scroll', syncRuler, { passive: true });
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (placesData.length) buildRuler(placesData);
    syncRuler();
  }, 150);
});

/* ---------- 지도 (지도 뷰를 처음 열 때 초기화) ---------- */
function setActiveMarker(marker) {
  const prevEl = activeMarker && activeMarker.getElement();
  if (prevEl) prevEl.querySelector('.pin').classList.remove('pin--active');
  activeMarker = marker;
  const el = marker && marker.getElement();
  if (el) el.querySelector('.pin').classList.add('pin--active');
}

function initMap() {
  if (map) {
    map.invalidateSize();
    return;
  }
  map = L.map('map', { scrollWheelZoom: true, zoomControl: false });
  // 좌상단은 콤마 내비가 차지하므로 줌 컨트롤은 우하단에 둔다
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // 지명 수어(C-1): 선택 지역 밖을 덮는 그늘은 타일 위·경계 아래, 사진 카드·큰 지명은 마커 위에 그린다
  map.createPane('shade').style.zIndex = 350;
  map.createPane('art').style.zIndex = 650;

  // 키 없이 쓸 수 있는 OSM 표준 타일. 채도는 CSS 필터(.leaflet-tile-pane)로 종이 톤에 맞춘다.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // 동구 16개 지역 경계를 먼저 올리고, 경계로 대체되지 않는 장소만 핀으로 남긴다.
  // 경계 파일을 못 읽으면 임의 경계를 그리지 않고 안내문 + 이전처럼 전체 핀으로 돌아간다.
  loadRegions().then((ok) => {
    const covered = ok ? new Set(regions.flatMap((r) => r.records.map((pl) => pl.id))) : new Set();
    placesData.filter((p) => !covered.has(p.id)).forEach(addPin);
    // L.latLngBounds(기존 bounds)는 같은 객체를 돌려주므로 복사본을 만들어 합친다 (원본 지역 bounds를 건드리지 않게)
    const bounds = ok
      ? regions.reduce((b, r) => b.extend(r.bounds), L.latLngBounds(regions[0].bounds.getSouthWest(), regions[0].bounds.getNorthEast()))
      : L.latLngBounds(placesData.map((p) => [p.lat, p.lng]));
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: ok ? [40, 40] : [70, 70], maxZoom: 14, animate: false });
    }
    initSpots();
  });
}

function addPin(place) {
  const pinIcon = L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin" style="--c:${place._color}"></div>`,
    iconSize: [15, 15],
    iconAnchor: [8, 8],
  });
  const marker = L.marker([place.lat, place.lng], {
    icon: pinIcon,
    title: place.name,
  }).addTo(map);
  marker.bindTooltip(place.name, { direction: 'top', offset: [0, -10], className: 'place-tip' });
  marker.on('click', () => {
    setActiveMarker(marker);
    if (typeof openPlacePanel === 'function' && panelEl) openPlacePanel(place);
    else openOverlay(place);
  });
  markersById.set(place.id, marker);
}

/* ---------- 동구 16개 지역 경계 (data/gwangju_donggu_sign_16.geojson) ---------- */
const REGION_GEOJSON = 'data/gwangju_donggu_sign_16.geojson?v=20261015';
const REGION_COUNT = 16;

// 경계 ↔ 기록 연결은 data/dong-records.json 에서 읽는다 (코드 수정 없이 데이터만 고치면 됨)
const regions = []; // { id, name, type, place, color, geom, bounds, area, layer }
const regionById = new Map();
let hoveredIds = [];
let selectedRegionId = null;
let chooserPopup = null;
const regionListEl = document.getElementById('region-list');
const regionTipEl = document.getElementById('region-tip');
const mapErrorEl = document.getElementById('map-error');

function showMapError(msg) {
  mapErrorEl.innerHTML = `${esc(msg)}<br><code>${esc(REGION_GEOJSON.split('?')[0])}</code>`;
  mapErrorEl.hidden = false;
}

/* --- 점-다각형 포함 판정 (Polygon 구멍, MultiPolygon 모두 처리) --- */
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygon(lng, lat, rings) {
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(lng, lat, rings[k])) return false;
  return true;
}
function pointInGeometry(lng, lat, geom) {
  if (geom.type === 'Polygon') return pointInPolygon(lng, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((poly) => pointInPolygon(lng, lat, poly));
  return false;
}
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) / 2;
}
function geometryArea(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.reduce((sum, rings) => sum + ringArea(rings[0]), 0);
}
// 클릭/호버 지점을 포함하는 모든 지역 (작은 지역부터). 겹치는 법정동·행정동이 모두 잡힌다.
function regionsAt(latlng) {
  return regions
    .filter((r) => r.bounds.contains(latlng) && pointInGeometry(latlng.lng, latlng.lat, r.geom))
    .sort((a, b) => a.area - b.area);
}

/* --- 스타일: 장소 색을 아주 옅게, 행정동은 점선 --- */
const MAP_HOVER = '#D5AD6A';
const MAP_SELECTED = '#F0C576';
function regionStyle(r) {
  const state = r.id === selectedRegionId ? 'selected' : hoveredIds.includes(r.id) ? 'hover' : 'base';
  const s = {
    className: 'region',
    color: 'rgba(244,243,239,0.45)',
    weight: 1,
    opacity: 1,
    fillColor: '#F4F3EF',
    fillOpacity: 0.035,
    dashArray: r.type === '행정동' ? '4 5' : null,
    lineJoin: 'round',
  };
  if (state === 'hover') Object.assign(s, { color: MAP_HOVER, weight: 2, fillColor: MAP_HOVER, fillOpacity: 0.14 });
  if (state === 'selected') Object.assign(s, { color: MAP_SELECTED, weight: 2.5, fillColor: MAP_SELECTED, fillOpacity: 0.18 });
  return s;
}
// 큰 지역부터 올려 작은 지역이 항상 위에 보이게 한다 (클릭 판정은 좌표 기준이라 순서와 무관)
function restackRegions() {
  regions
    .slice()
    .sort((a, b) => b.area - a.area)
    .forEach((r) => r.layer.bringToFront());
}
function restyle(ids) {
  ids.forEach((id) => {
    const r = regionById.get(id);
    if (r) r.layer.setStyle(regionStyle(r));
  });
}
function setHovered(ids) {
  const prev = hoveredIds;
  hoveredIds = ids;
  restyle([...new Set([...prev, ...ids])]);
  map.getContainer().classList.toggle('has-hit', ids.length > 0);
}
function setSelectedRegion(id) {
  const prev = selectedRegionId;
  selectedRegionId = id;
  restyle([prev, id].filter(Boolean));
  restackRegions();
  if (id) regionById.get(id).layer.bringToFront();
  regionListEl.querySelectorAll('.region-btn').forEach((b) => {
    const on = b.dataset.region === id;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  updateCinematic();
  if (syncRegionLabels) syncRegionLabels();
}

/* ---------- 지명 수어 연출 (C-1 CINEMATIC): 선택 지역 스포트라이트 + 사진 카드 + 큰 지명 ----------
   지도 좌표에 고정한 레이어라 확대·이동에 같이 움직인다. 선택을 풀거나 장소 둘러보기로 바꾸면 걷어낸다. */
const ART_PHOTO_SIZE = [320, 220];
let shadeLayer = null;
let artMarker = null;
let bigNameMarker = null;
const regionNo = (r) => String(regions.indexOf(r) + 1).padStart(2, '0');

function clearCinematic() {
  if (!map) return;
  [shadeLayer, artMarker, bigNameMarker].forEach((l) => l && map.removeLayer(l));
  shadeLayer = artMarker = bigNameMarker = null;
}
function updateCinematic() {
  clearCinematic();
  const r = selectedRegionId ? regionById.get(selectedRegionId) : null;
  if (!r || !map || mapMode !== 'signs') return;
  // 1) 선택 지역 밖을 어둡게: 세계를 덮는 다각형에 선택 지역을 구멍으로 뚫는다
  const world = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
  const holes = (r.geom.type === 'Polygon' ? [r.geom.coordinates] : r.geom.coordinates).map((poly) => poly[0].map(([x, y]) => [y, x]));
  shadeLayer = L.polygon([world, ...holes], { pane: 'shade', interactive: false, stroke: false, fillColor: '#040404', fillOpacity: 0.62, className: 'cine-shade' }).addTo(map);
  // 2) 사진 카드(데스크톱): 실제 사진(places.json의 photo)이 있을 때만 이미지, 없으면 '준비 중' 카드. 지시선 끝이 지역 중심을 가리킨다.
  //    모바일은 시트 위 공간이 좁아 카드를 지도에 올리지 않고, 사진이 있으면 시트 안(영상 위)에 보여준다.
  if (!isSheetMode()) {
    const photoPlace = r.records.find((pl) => pl.photo);
    // 패널을 뺀 지도 폭이 좁은 데스크톱(노트북)에서는 카드를 조금 줄인다
    const panelW = Math.min(560, Math.max(400, window.innerWidth * 0.36));
    const [w, h] = ART_PHOTO_SIZE.map((v) => Math.round(v * (window.innerWidth - panelW < 760 ? 0.7 : 1)));
    const img = photoPlace ? `<img src="${esc(photoPlace.photo)}" alt="${esc(r.name)} 풍경">` : '';
    const card = `
      <figure class="art-card${img ? '' : ' ph'}" style="--w:${w}px;--h:${h}px">
        <div class="art-img">${img}<div class="art-ph"><span>PHOTO — COMING SOON</span><b>풍경 사진 준비 중</b></div></div>
        <figcaption><span class="art-no">PL. ${regionNo(r)}</span><span>${esc(r.name)} · ${esc(r.type)}</span></figcaption>
        <i class="art-leader" aria-hidden="true"></i><i class="art-dot" aria-hidden="true"></i>
      </figure>`;
    artMarker = L.marker(r.centroid, { pane: 'art', interactive: false, keyboard: false, icon: L.divIcon({ className: 'art-wrap', html: card, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
    const imgEl = artMarker.getElement()?.querySelector('img');
    if (imgEl) imgEl.addEventListener('error', () => imgEl.closest('.art-card')?.classList.add('ph'));
  }
  // 3) 큰 지명: 지역 남쪽 경계 아래
  bigNameMarker = L.marker([r.bounds.getSouth(), r.centroid[1]], { pane: 'art', interactive: false, keyboard: false, icon: L.divIcon({ className: 'bigname-wrap', html: `<div class="bigname"><span>${esc(r.name)}</span><small>${esc(r.en)}</small></div>`, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
}
/* 카메라: 패널·시트가 가리지 않는 영역 안에 '지역 + (데스크톱) 사진 카드 + 큰 지명'이 모두 들어가는 가장 큰 줌을 고른다.
   카드·지명은 줌과 무관한 픽셀 크기이므로 실제 DOM 상자를 재서 합치고, 안 들어가면 카드를 빼고, 그래도 안 되면 지역만 맞춘다. */
function overlayBox(el, anchorLatLng) {
  // 지도 컨테이너 좌표계에서 앵커(지역 중심 등)를 원점으로 한 요소의 상자 (줌이 바뀌어도 같은 픽셀 오프셋)
  if (!el) return null;
  const mb = map.getContainer().getBoundingClientRect();
  const a = map.latLngToContainerPoint(anchorLatLng);
  const b = el.getBoundingClientRect();
  return { l: b.left - mb.left - a.x, t: b.top - mb.top - a.y, r: b.right - mb.left - a.x, b: b.bottom - mb.top - a.y };
}
function frameRegion(r, animate) {
  const sheet = isSheetMode();
  const size = map.getSize();
  const pw = sheet ? 0 : panelEl.getBoundingClientRect().width;
  const ph = sheet ? panelEl.getBoundingClientRect().height : 0;
  // 보이는 영역: 위는 '지역 선택' 버튼 아래, 오른쪽(데스크톱)은 패널, 아래(모바일)는 시트를 뺀 만큼
  const vis = { x0: 16, y0: sheet ? 116 : 112, x1: size.x - pw - 16, y1: size.y - ph - 16 };
  const visW = vis.x1 - vis.x0;
  const visH = vis.y1 - vis.y0;
  const cardBox = overlayBox(artMarker && artMarker.getElement()?.querySelector('.art-card'), r.centroid);
  if (cardBox) cardBox.t -= 20; // 등장 애니메이션 중에 재면 최종 위치보다 조금 아래이므로 여유를 둔다
  const nameAnchor = [r.bounds.getSouth(), r.centroid[1]];
  const nameBox = overlayBox(bigNameMarker && bigNameMarker.getElement()?.querySelector('.bigname'), nameAnchor);
  const attempt = (useCard) => {
    let zoom = Math.min(15, map.getBoundsZoom(r.bounds, false, L.point(40, 40)));
    for (; zoom >= 10; zoom--) {
      const nw = map.project(r.bounds.getNorthWest(), zoom);
      const se = map.project(r.bounds.getSouthEast(), zoom);
      const c = map.project(r.centroid, zoom);
      const n = map.project(nameAnchor, zoom);
      let l = nw.x - 24, t = nw.y - 24, rt = se.x + 24, b = se.y + 24;
      if (useCard && cardBox) { l = Math.min(l, c.x + cardBox.l); t = Math.min(t, c.y + cardBox.t); rt = Math.max(rt, c.x + cardBox.r); }
      if (nameBox) { l = Math.min(l, n.x + nameBox.l); rt = Math.max(rt, n.x + nameBox.r); b = Math.max(b, n.y + nameBox.b); }
      if (rt - l <= visW && b - t <= visH) {
        // 합친 상자의 중심을 보이는 영역의 중심에 놓는다 (지도 컨테이너 중심에서 패널·시트만큼 비켜난 자리)
        const shift = L.point(size.x / 2 - (vis.x0 + vis.x1) / 2, size.y / 2 - (vis.y0 + vis.y1) / 2);
        return { zoom, center: map.unproject(L.point((l + rt) / 2, (t + b) / 2).add(shift), zoom) };
      }
    }
    return null;
  };
  const fit = attempt(true) || attempt(false);
  if (fit) {
    if (animate) map.flyTo(fit.center, fit.zoom, { duration: 0.9 });
    else map.setView(fit.center, fit.zoom, { animate: false });
    return;
  }
  // 아주 좁은 화면: 지역만이라도 보이게
  map.fitBounds(r.bounds, { paddingTopLeft: [16, vis.y0], paddingBottomRight: [pw + 16, ph + 16], maxZoom: 15, animate });
}

/* --- 지역 열기: 장소가 있으면 기존 오버레이, 없으면 '영상 준비 중' --- */
// 지역을 열면 전체 화면 오버레이 대신 지도 옆 패널에 기록을 보여준다 (지도는 계속 보인다)
function selectRegion(r) {
  toggleRegionMenu(false);
  setSelectedRegion(r.id);
  openRegionPanel(r);
}

/* --- 겹치는 지역 선택 팝업 --- */
function openChooser(hits, latlng) {
  const html = `
    <div class="chooser" role="group" aria-label="겹치는 지역 선택">
      <p class="chooser-cap">이 위치는 ${hits.length}개 지역에 속합니다</p>
      ${hits
        .map(
          (r) =>
            `<button type="button" class="chooser-btn" data-region="${r.id}"><i aria-hidden="true"></i>${esc(r.name)} 수어 보기<small>${esc(r.type)}</small></button>`
        )
        .join('')}
    </div>`;
  chooserPopup = L.popup({
    className: 'region-chooser',
    closeButton: false,
    autoPan: true,
    offset: [0, -6],
    maxWidth: 280,
  })
    .setLatLng(latlng)
    .setContent(html)
    .openOn(map);
  const el = chooserPopup.getElement();
  el.querySelectorAll('.chooser-btn').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const r = regionById.get(b.dataset.region);
      map.closePopup();
      if (r) selectRegion(r);
    });
  });
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      map.closePopup();
      map.getContainer().focus();
    }
  });
  el.querySelector('.chooser-btn').focus();
}

/* --- 동 이름 레이블: 넓은 지역은 줌 13부터, 좁은 지역은 15부터 (겹침 방지) --- */
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (!a) return ring[0];
  return [cx / (3 * a), cy / (3 * a)];
}
let syncRegionLabels = null;
function buildRegionLabels() {
  const areas = regions.map((r) => r.area).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)];
  regions.forEach((r) => {
    r.label = L.tooltip({ permanent: true, direction: 'center', className: 'dong-label', interactive: false, opacity: 1 })
      .setLatLng(r.centroid)
      .setContent(r.name);
    r.labelMinZoom = r.area >= median ? 13 : 15;
  });
  // 선택한 지역은 지도 위 큰 지명이 대신하므로 작은 레이블을 숨긴다
  syncRegionLabels = () => {
    const z = map.getZoom();
    regions.forEach((r) => {
      const show = z >= r.labelMinZoom && r.id !== selectedRegionId;
      if (show && !map.hasLayer(r.label)) r.label.addTo(map);
      if (!show && map.hasLayer(r.label)) map.removeLayer(r.label);
    });
  };
  map.on('zoomend', syncRegionLabels);
  syncRegionLabels();
}

/* --- 지역 선택 메뉴: '지역 선택 +' 버튼으로 여는 16개 지역 격자 (경계 파일 순서 = PL. 번호, 키보드 선택 가능) --- */
const regionMenuBtn = document.getElementById('region-menu-btn');
function buildRegionList() {
  regionListEl.innerHTML = `<div class="rl-head"><span>EXPLORE PLACES — 동구 16</span><button type="button" class="rl-close" id="region-menu-close">닫기 ✕</button></div><div class="rl-grid"></div>`;
  const grid = regionListEl.querySelector('.rl-grid');
  regions.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'region-btn';
    b.dataset.region = r.id;
    b.setAttribute('aria-pressed', 'false');
    const hasVideo = r.records.some((pl) => (pl.videos && pl.videos.length) || pl.video_youtube_id);
    b.innerHTML = `<small>${regionNo(r)}</small><span>${esc(r.name)}</span><i class="${hasVideo ? 'has' : 'no'}" aria-hidden="true"></i><em class="sr-only">${hasVideo ? '수어 영상 있음' : '영상 준비 중'}</em>`;
    b.addEventListener('click', () => selectRegion(r));
    grid.appendChild(b);
  });
  regionListEl.querySelector('#region-menu-close').addEventListener('click', () => { toggleRegionMenu(false); regionMenuBtn.focus(); });
  regionMenuBtn.hidden = false;
}
function toggleRegionMenu(force) {
  if (!regionMenuBtn) return;
  const open = force ?? regionListEl.hidden;
  if (!open && regionListEl.hidden) return;
  regionListEl.hidden = !open;
  regionMenuBtn.setAttribute('aria-expanded', String(open));
  regionMenuBtn.classList.toggle('on', open);
  if (open) regionListEl.querySelector('.region-btn.on, .region-btn')?.focus();
}
if (regionMenuBtn) {
  regionMenuBtn.addEventListener('click', () => toggleRegionMenu());
  // 메뉴 밖을 누르면 닫힌다
  document.addEventListener('pointerdown', (e) => {
    if (regionListEl.hidden) return;
    if (regionListEl.contains(e.target) || regionMenuBtn.contains(e.target)) return;
    toggleRegionMenu(false);
  });
}

/* --- 호버/클릭: 레이어가 아니라 지도 좌표 기준으로 판정 (겹침·가림 없음) --- */
function bindRegionEvents() {
  const canHover = window.matchMedia('(hover: hover)').matches;
  let raf = null;

  if (canHover) {
    map.on('mousemove', (e) => {
      if (chooserPopup || mapMode !== 'signs') return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const hits = regionsAt(e.latlng);
        const ids = hits.map((r) => r.id);
        if (ids.join() !== hoveredIds.join()) setHovered(ids);
        if (hits.length) {
          regionTipEl.innerHTML = hits
            .map((r) => `<b>${esc(r.name)}</b><small>${esc(r.type)}</small>`)
            .join('<span class="tip-sep">·</span>');
          regionTipEl.style.transform = `translate(${e.containerPoint.x + 14}px, ${e.containerPoint.y + 14}px)`;
          regionTipEl.hidden = false;
        } else {
          regionTipEl.hidden = true;
        }
      });
    });
    map.on('mouseout', () => {
      setHovered([]);
      regionTipEl.hidden = true;
    });
  }

  map.on('click', (e) => {
    if (mapMode !== 'signs') return;
    if (chooserPopup) {
      map.closePopup();
      return;
    }
    const hits = regionsAt(e.latlng);
    if (!hits.length) return;
    regionTipEl.hidden = true;
    if (hits.length === 1) selectRegion(hits[0]);
    else openChooser(hits, e.latlng);
  });
  map.on('popupclose', () => {
    chooserPopup = null;
  });
}

/* ---------- 상세 패널: 데스크톱 오른쪽 / 모바일 바텀시트 ----------
   항목(item)은 { kind:'region', region } 또는 { kind:'place', place } (경계 밖 핀 장소).
   이전/다음은 경계 파일 순서(16개) 뒤에 핀 장소가 이어지는 순서로 돈다. */
const panelEl = document.getElementById('dpanel');
const panelBodyEl = document.getElementById('dpanel-body');
const panelNameEl = document.getElementById('dp-name');
const panelEnEl = document.getElementById('dp-en');
const panelSubEl = document.getElementById('dp-sub');
const viewMapEl = document.getElementById('view-map');
let placesEn = {};
let panelItem = null;
let panelRecordIdx = 0; // 기록이 여러 개인 지역에서 null이면 목록 화면
let panelLastFocus = null;
let panelHideTimer = null;

const isSheetMode = () => window.matchMedia('(max-width: 767px)').matches;
const isPanelOpen = () => !panelEl.hidden && panelEl.classList.contains('on');
const pinPlaces = () => placesData.filter((pl) => markersById.has(pl.id));
const navItems = () => [
  ...regions.map((region) => ({ kind: 'region', region })),
  ...pinPlaces().map((place) => ({ kind: 'place', place })),
];
const sameItem = (a, b) => a && b && a.kind === b.kind && (a.region || a.place) === (b.region || b.place);
const itemRecords = (it) => (it.kind === 'region' ? it.region.records : it.kind === 'spot' ? [] : [it.place]);
const itemName = (it) => (it.kind === 'region' ? it.region.name : it.kind === 'spot' ? (spotState?.place || spotState?.hub)?.name || '' : it.place.name);
const itemEn = (it) => (it.kind === 'region' ? it.region.en : it.kind === 'spot' ? '' : placesEn[it.place.id] || '');
const itemId = (it) => (it.kind === 'region' ? it.region.id : it.kind === 'spot' ? spotState?.hub.id : it.place.id);
const itemBounds = (it) => {
  if (it.kind === 'region') return it.region.bounds;
  if (it.kind === 'spot') { const s = spotState?.place || spotState?.hub; return L.latLngBounds([[s.geo.lat || 0, s.geo.lng || 0]]); }
  return L.latLngBounds([[it.place.lat, it.place.lng]]);
};

function stopPanelVideo() {
  const v = document.getElementById('panel-video');
  if (!v) return;
  v.pause();
  v.removeAttribute('src');
  v.load();
}

/* 선택 항목이 패널에 가려지지 않은 지도 영역에 있을 때만 그대로 두고, 아니면 보이게 맞춘다 */
function itemInView(it) {
  const size = map.getSize();
  const h = isSheetMode() ? size.y - panelEl.getBoundingClientRect().height : size.y;
  // 지명 수어(데스크톱)는 지도가 반투명 패널 아래까지 이어지므로 패널에 가린 폭을 뺀다
  size.x = !isSheetMode() && mapMode === 'signs' ? size.x - panelEl.getBoundingClientRect().width : size.x;
  const b = itemBounds(it);
  const nw = map.latLngToContainerPoint(b.getNorthWest());
  const se = map.latLngToContainerPoint(b.getSouthEast());
  const pad = it.kind === 'place' ? 24 : 0;
  return nw.x - pad >= 0 && nw.y - pad >= 0 && se.x + pad <= size.x && se.y + pad <= h;
}
function ensureItemVisible(it) {
  if (it.kind === 'spot') return; // 거점·주변 장소는 spots.js가 카메라를 맡는다
  const animate = !prefersReducedMotion();
  if (it.kind === 'region' && mapMode === 'signs') { frameRegion(it.region, animate); return; } // 지명 수어: 항상 연출 구도로
  if (itemInView(it)) return;
  if (it.kind === 'place') {
    if (!isSheetMode() && mapMode === 'signs') {
      // 패널에 가리지 않는 영역의 가운데로
      const size = map.getSize();
      const target = L.point((size.x - panelEl.getBoundingClientRect().width) / 2, size.y / 2);
      map.panBy(map.latLngToContainerPoint([it.place.lat, it.place.lng]).subtract(target), { animate });
    } else map.panTo([it.place.lat, it.place.lng], { animate });
    return;
  }
  const opts = { padding: [40, 40], maxZoom: Math.max(map.getZoom(), 13), animate };
  if (isSheetMode()) opts.paddingBottomRight = [40, panelEl.getBoundingClientRect().height + 40];
  map.fitBounds(it.region.bounds, opts);
}

function setHash(id) {
  // 'spot/…'는 장소 둘러보기 해시, 그 외는 지명 수어 해시
  const next = id ? (String(id).startsWith('spot/') ? `#${id}` : `#map/${id}`) : '';
  if (location.hash === next) return;
  history.replaceState(null, '', next || location.pathname + location.search);
}
function applyHash() {
  const m = location.hash.match(/^#map\/([\w-]+)/);
  if (!m || !regions.length) return;
  if (mapMode !== 'signs') setMapMode('signs');
  const id = m[1];
  const region =
    regions.find((x) => x.id === id) || regions.find((x) => x.records.some((pl) => pl.id === id));
  const pin = !region && pinPlaces().find((pl) => pl.id === id);
  if (!region && !pin) return;
  if (document.body.dataset.view !== 'map') setView('map');
  if (region) {
    const idx = region.records.findIndex((pl) => pl.id === id);
    setSelectedRegion(region.id);
    openPanel({ kind: 'region', region }, idx >= 0 ? idx : region.records.length === 1 ? 0 : null, { fromHash: true });
  } else {
    setActiveMarker(markersById.get(pin.id));
    openPanel({ kind: 'place', place: pin }, 0, { fromHash: true });
  }
}
window.addEventListener('hashchange', () => {
  if (!regions.length) return;
  if (location.hash.startsWith('#spot/')) {
    // 장소 기억 화면이 열린 채 뒤로 가기 → 화면만 닫고 지도·패널은 그대로
    if (typeof storyIsOpen === 'function' && storyIsOpen() && !/\/story$/.test(location.hash)) { closeStory({ fromHistory: true }); return; }
    applySpotHash();
    return;
  }
  if (location.hash.startsWith('#map/')) { if (mapMode !== 'signs') setMapMode('signs'); applyHash(); }
  else if (isPanelOpen()) closePanel({ keepHash: true });
});

function openRegionPanel(r, recordIdx = r.records.length === 1 ? 0 : null, opts) {
  setActiveMarker(null);
  openPanel({ kind: 'region', region: r }, recordIdx, opts);
}
function openPlacePanel(place) {
  setSelectedRegion(null);
  openPanel({ kind: 'place', place }, 0);
}

function openPanel(it, recordIdx, { fromHash = false } = {}) {
  const wasOpen = isPanelOpen();
  clearTimeout(panelHideTimer);
  stopPanelVideo();
  // 닫을 때 돌아갈 곳: 처음 연 시점의 포커스. 목록 버튼으로 바꿔 열었으면 그 버튼으로 갱신
  if (!wasOpen || document.activeElement?.classList.contains('region-btn')) {
    panelLastFocus = document.activeElement;
  }
  panelItem = it;
  panelRecordIdx = recordIdx;
  renderPanel();
  const record = recordIdx !== null ? itemRecords(it)[recordIdx] : null;
  if (!fromHash) setHash(record ? record.id : itemId(it));

  panelEl.hidden = false;
  viewMapEl.classList.add('dpanel-open');
  document.body.classList.add('dpanel-open');
  if (!wasOpen) {
    panelEl.classList.remove('expanded');
    void panelEl.offsetWidth; // hidden 해제 직후 리플로우 → 슬라이드 전환이 실제로 재생된다
    panelEl.classList.add('on');
    // 데스크톱은 지도 컨테이너가 줄어들므로 전환이 끝난 뒤 크기를 다시 재고 위치를 맞춘다
    setTimeout(() => {
      map.invalidateSize({ pan: false });
      ensureItemVisible(it);
    }, prefersReducedMotion() ? 0 : 340);
    panelEl.focus({ preventScroll: true });
  } else {
    ensureItemVisible(it);
    panelEl.scrollTop = 0;
  }
}

function closePanel({ keepHash = false } = {}) {
  if (panelEl.hidden) return;
  stopPanelVideo();
  panelEl.classList.remove('on', 'expanded');
  viewMapEl.classList.remove('dpanel-open');
  document.body.classList.remove('dpanel-open');
  setSelectedRegion(null);
  setActiveMarker(null);
  if (!keepHash) setHash(null);
  if (panelItem && panelItem.kind === 'spot' && typeof markSelected === 'function') { spotState = null; markSelected(); }
  panelItem = null;
  panelHideTimer = setTimeout(() => {
    panelEl.hidden = true;
    map.invalidateSize({ pan: false }); // 사용자가 보던 중심·줌은 그대로 둔다
  }, prefersReducedMotion() ? 0 : 340);
  if (panelLastFocus && panelLastFocus.focus && document.contains(panelLastFocus)) panelLastFocus.focus();
  else map.getContainer().focus();
}

function stepItem(dir) {
  if (!panelItem) return;
  if (panelItem.kind === 'spot') { stepSpot(dir); return; }
  const items = navItems();
  const i = items.findIndex((x) => sameItem(x, panelItem));
  const next = items[(i + dir + items.length) % items.length];
  if (next.kind === 'region') selectRegion(next.region);
  else {
    setActiveMarker(markersById.get(next.place.id));
    openPlacePanel(next.place);
  }
}

/* --- 패널 내용 --- */
function panelVideoHtml(place) {
  const vids = place.videos || [];
  if (vids.length) {
    const first = vids[0];
    const angles =
      vids.length > 1
        ? `<div class="angles" role="group" aria-label="촬영 각도">${vids
            .map((v, i) => `<button type="button" class="angle${i === 0 ? ' on' : ''}" data-angle="${i}" aria-pressed="${i === 0}">${esc(v.label)}</button>`)
            .join('')}</div>`
        : '';
    return `
      <div class="pv" style="--ar:${Number(first.ratio) || 0.75}">
        <video id="panel-video" preload="metadata" playsinline ${first.poster ? `poster="${esc(first.poster)}"` : ''} src="${esc(first.src)}" aria-label="${esc(place.name)} 수어 영상 (${esc(first.label)})"></video>
        <button type="button" class="pv-play" id="panel-play" aria-label="${esc(place.name)} 수어 영상 재생">수어 영상 보기<span class="pv-ico" aria-hidden="true"></span></button>
        <p class="pv-err" id="panel-verr" hidden role="alert"></p>
      </div>${angles}`;
  }
  if (place.video_youtube_id) {
    return `<div class="pv pv-yt"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(place.video_youtube_id)}" title="${esc(place.name)} 수어 영상" allowfullscreen></iframe></div>`;
  }
  return `<div class="pv pv-none"><span>SIGN — COMING SOON<br>영상 준비 중</span></div>`;
}

// "[예시] …" 자리표시 문구는 기록으로 치지 않는다
const realText = (t) => (t && !String(t).trim().startsWith('[예시]') ? String(t).trim() : '');

function panelRecordHtml(place) {
  // 5·18 등 민감한 기록은 오버레이와 같은 정책: 세션에서 열람을 확인하기 전까지 안내 문구만 보여준다
  if (place.sensitive && !revealedSensitive.has(place.id)) {
    return `
      <div class="sensitive-gate">
        <p class="section-text">${esc(place.sensitive_notice || '이 지점은 역사적으로 민감한 기록을 담고 있습니다. 계속 보시겠어요?')}</p>
        <button type="button" id="panel-reveal">기록 보기</button>
      </div>`;
  }
  const idx = placesData.indexOf(place) + 1;
  const origin = realText(place.origin_text);
  const reg = panelItem && panelItem.kind === 'region' ? panelItem.region : null;
  const vid = (place.videos || [])[0];
  const videoFact = vid ? `${Number(vid.ratio) && Number(vid.ratio) < 1 ? '세로 3:4' : '가로'} · 무음` : place.video_youtube_id ? '유튜브' : '준비 중';
  const boundaryFact = reg ? [reg.type, ...(reg.codes || [])].filter(Boolean).join(' · ') : '경계 밖 · 핀';
  // 모바일 시트: 지도 위 사진 카드 대신 실제 사진이 있을 때만 영상 위에 보여준다
  const photo = place.photo && isSheetMode() ? `<figure class="dp-photo"><img src="${esc(place.photo)}" alt="${esc(place.name)} 풍경" loading="lazy"></figure>` : '';
  return `
    ${photo}${panelVideoHtml(place)}
    <dl class="dp-facts">
      <div><dt>기록</dt><dd>GSL® / ${String(idx).padStart(2, '0')}</dd></div>
      <div><dt>경계</dt><dd>${esc(boundaryFact)}</dd></div>
      <div><dt>영상</dt><dd>${esc(videoFact)}</dd></div>
    </dl>
    ${signPartsHtml(place)}
    ${origin ? `<p class="section-label">이름의 유래</p><p class="section-text">${esc(origin)}</p>` : ''}
    ${(place.tags || []).length ? `<div class="tags">${place.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}`;
}

function renderPanel() {
  const it = panelItem;
  if (it.kind === 'spot') { renderSpotPanel(); return; }
  const records = itemRecords(it);
  panelNameEl.textContent = itemName(it);
  panelEnEl.textContent = itemEn(it);
  panelSubEl.textContent = it.kind === 'region' ? '광주 동구 수어 지명 기록' : '광주 수어 지명 기록';
  document.getElementById('dp-idx').textContent = it.kind === 'region' ? `PL. ${regionNo(it.region)}` : '';
  // 긴 지명도 한 줄에 들어가도록 글자 수에 따라 제목 크기를 낮춘다
  const len = itemName(it).length;
  panelNameEl.classList.toggle('mid', len >= 4 && len <= 5);
  panelNameEl.classList.toggle('long', len >= 6);
  const items = navItems();
  const i = items.findIndex((x) => sameItem(x, it));
  const prev = items[(i - 1 + items.length) % items.length];
  const next = items[(i + 1) % items.length];
  document.getElementById('dp-prev').setAttribute('aria-label', `이전 기록: ${itemName(prev)}`);
  document.getElementById('dp-next').setAttribute('aria-label', `다음 기록: ${itemName(next)}`);

  let html = '';
  if (!records.length) {
    html = `<p class="dp-empty">아직 수집된 수어 기록이 없습니다.</p>
            <p class="dp-meta">${esc(it.region.type)} 경계 · 기록이 모이면 이곳에 영상과 장소 기억이 실립니다.</p>`;
  } else if (panelRecordIdx === null) {
    html = `<p class="section-label">이 지역의 기록 ${records.length}개</p>
      <div class="dp-list">${records
        .map((pl, k) => `<button type="button" class="dp-rec" data-rec="${k}"><span>${esc(pl.name)}</span><small>${(pl.videos && pl.videos.length) || pl.video_youtube_id ? '영상' : '기록'}</small></button>`)
        .join('')}</div>`;
  } else {
    html = panelRecordHtml(records[panelRecordIdx]);
    if (records.length > 1) html = `<button type="button" class="dp-back" id="dp-back">‹ 이 지역의 다른 기록</button>` + html;
  }
  panelBodyEl.innerHTML = html;

  // 영상: 큰 재생 버튼 → 재생. 자동 재생은 하지 않는다.
  const v = document.getElementById('panel-video');
  const play = document.getElementById('panel-play');
  const err = document.getElementById('panel-verr');
  if (v && play) {
    const showPlay = (on) => { play.hidden = !on; };
    play.addEventListener('click', () => {
      v.controls = true;
      v.play().catch(() => {});
    });
    v.addEventListener('playing', () => showPlay(false));
    v.addEventListener('pause', () => showPlay(true));
    v.addEventListener('ended', () => showPlay(true));
    v.addEventListener('error', () => {
      showPlay(false);
      err.textContent = `영상을 불러오지 못했습니다 (${v.currentSrc ? v.currentSrc.split('/').pop() : '파일 없음'}).`;
      err.hidden = false;
    });
    panelBodyEl.querySelectorAll('.angle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pl = records[panelRecordIdx];
        const vid = pl.videos[Number(btn.dataset.angle)];
        panelBodyEl.querySelectorAll('.angle').forEach((b) => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        v.pause();
        if (vid.poster) v.poster = vid.poster;
        v.src = vid.src;
        v.setAttribute('aria-label', `${pl.name} 수어 영상 (${vid.label})`);
        err.hidden = true;
        showPlay(true);
      });
    });
  }
  document.getElementById('panel-reveal')?.addEventListener('click', () => {
    revealedSensitive.add(records[panelRecordIdx].id);
    renderPanel();
  });
  document.getElementById('dp-back')?.addEventListener('click', () => {
    panelRecordIdx = null;
    stopPanelVideo();
    renderPanel();
    setHash(itemId(it));
  });
  panelBodyEl.querySelectorAll('.dp-rec').forEach((b) => {
    b.addEventListener('click', () => {
      panelRecordIdx = Number(b.dataset.rec);
      renderPanel();
      setHash(records[panelRecordIdx].id);
    });
  });
}

function bindPanel() {
  if (panelEl.dataset.bound) return;
  panelEl.dataset.bound = '1';
  document.getElementById('dp-close').addEventListener('click', () => closePanel());
  document.getElementById('dp-prev').addEventListener('click', () => stepItem(-1));
  document.getElementById('dp-next').addEventListener('click', () => stepItem(1));
  // 모바일 시트: 핸들을 누르거나 위/아래로 끌면 펼침/접힘
  const handle = document.getElementById('dp-handle');
  const toggleSheet = (force) => {
    const on = panelEl.classList.toggle('expanded', force);
    handle.setAttribute('aria-expanded', String(on));
    handle.setAttribute('aria-label', on ? '시트 접기' : '시트 펼치기');
  };
  handle.addEventListener('click', () => toggleSheet());
  let dragY = null;
  handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; });
  window.addEventListener('pointerup', (e) => {
    if (dragY === null) return;
    const dy = e.clientY - dragY;
    dragY = null;
    if (dy < -40) toggleSheet(true);
    else if (dy > 40) toggleSheet(false);
  });
  // 메모 카드 펼치기 (오버레이와 같은 위임 방식)
  panelBodyEl.addEventListener('click', (e) => {
    const memo = e.target.closest('.memo.has-more');
    if (memo) toggleMemo(memo);
  });
  panelBodyEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const memo = e.target.closest('.memo.has-more');
    if (memo && e.target === memo) {
      e.preventDefault();
      toggleMemo(memo);
    }
  });
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (map) { map.invalidateSize({ pan: false }); updateCinematic(); } }, 150);
  });
}

const DONG_RECORDS = 'data/dong-records.json?v=20261015';
let dongRecords = {}; // 경계 id → { name, en, records: [placeId...] }

function loadRegions() {
  const geoReq = fetch(REGION_GEOJSON).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  // 연결표가 없으면 경계는 그리되 기록 없음으로 처리하고, 콘솔과 안내문으로 알린다
  const recReq = fetch(DONG_RECORDS)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((d) => {
      placesEn = (d && d.places_en) || {};
      return d && d.regions ? d.regions : {};
    })
    .catch((err) => {
      console.error('지역-기록 연결표 로드 실패:', err);
      showMapError('지역과 기록의 연결표(data/dong-records.json)를 불러오지 못해 경계만 표시합니다.');
      return null;
    });
  return Promise.all([geoReq, recReq])
    .then(([geo, rec]) => {
      dongRecords = rec || {};
      if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
        throw new Error('FeatureCollection 형식이 아닙니다');
      }
      const feats = geo.features.filter((f) => f.geometry && ['Polygon', 'MultiPolygon'].includes(f.geometry.type));
      if (feats.length !== REGION_COUNT) {
        throw new Error(`지역 수가 ${REGION_COUNT}개가 아닙니다 (${feats.length}개)`);
      }
      const placeById = new Map(placesData.map((p) => [p.id, p]));
      feats.forEach((f, i) => {
        const props = f.properties || {};
        const id = props.id || `feature_${i}`;
        const entry = dongRecords[id];
        if (rec && !entry) console.warn(`dong-records.json에 항목이 없는 지역: ${id} (${props.name}) — 기록 없음으로 표시`);
        // 연결표의 기록 id 중 places.json에 실제로 있는 것만 쓴다. 없는 id는 다른 기록으로 대체하지 않는다.
        const records = (entry?.records || []).map((pid) => {
          const pl = placeById.get(pid);
          if (!pl) console.error(`dong-records.json의 기록 id가 places.json에 없습니다: ${pid} (${props.name})`);
          return pl || null;
        }).filter(Boolean);
        const place = records[0] || null;
        const layer = L.geoJSON(f, { interactive: false, style: () => ({}) });
        const outer = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
        const [clng, clat] = ringCentroid(outer);
        const r = {
          id,
          name: props.name || entry?.name || id,
          en: entry?.en || '',
          type: props.boundary_type || '',
          codes: props.component_codes || [],
          records,
          place,
          color: place ? place._color : '#8B8A85',
          geom: f.geometry,
          bounds: layer.getBounds(),
          area: geometryArea(f.geometry),
          centroid: [clat, clng], // [lat, lng] — 사진 카드·지시선·레이블 기준점
          layer,
        };
        regions.push(r);
        regionById.set(id, r);
      });
      // 큰 지역을 먼저 올려 작은 지역이 위에 그려지도록 한다 (클릭 판정은 좌표 기준이라 순서와 무관)
      regions.forEach((r) => {
        r.layer.setStyle(regionStyle(r));
        r.layer.addTo(map);
      });
      restackRegions();
      buildRegionLabels();
      buildRegionList();
      bindRegionEvents();
      bindPanel();
      if (rec) mapErrorEl.hidden = true;
      if (location.hash.startsWith('#map/')) applyHash();
      return true;
    })
    .catch((err) => {
      console.error('경계 데이터 로드 실패:', err);
      showMapError(`동구 지역 경계를 불러오지 못했습니다 (${err.message}). 경계 없이 장소 핀만 표시합니다.`);
      return false;
    });
}

/* ---------- 데이터 로드 ---------- */
fetch('data/places.json?v=20261015a')
  .then((res) => res.json())
  .then((places) => {
    placesData = places;
    places.forEach((p, i) => { p._color = placeColor(i); });
    buildTrack(places);
    buildRuler(places);
    buildSignIndex(places);
    if (location.hash.startsWith('#map/') || location.hash.startsWith('#spot/')) setView('map');
    syncRuler();
    document.getElementById('loader').classList.add('done');
  })
  .catch((err) => {
    trackEl.innerHTML =
      '<p style="font-size:14px;color:var(--muted)">data/places.json을 불러오지 못했습니다. 로컬 서버로 열어주세요 (예: python3 -m http.server).</p>';
    console.error(err);
    document.getElementById('loader').classList.add('done');
  });
