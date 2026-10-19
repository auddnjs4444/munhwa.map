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
  if (typeof syncNav === 'function') syncNav(); // 지도 화면은 보기(장소/지명 수어)에 따라 '탐험' 또는 '지명 수어'가 켜진다
}
document.querySelectorAll('[data-nav]').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.nav === 'signs') { if (typeof goSigns === 'function') goSigns(); return; } // 지명 수어: 지도 화면 + 동구 전체 보기(#map)
    setView(b.dataset.nav);
  });
});
// '탐험' 링크: 같은 탭에서 거리 보기를 보던 상태(#explore 또는 #place/…)가 있으면 거기로 돌아간다 (첫 화면을 다시 보이지 않는다)
try {
  const lastExplore = sessionStorage.getItem('cine:last');
  if (lastExplore && /^#(explore|place\/[\w-]+)$/.test(lastExplore)) document.querySelectorAll('[data-nav-explore]').forEach((a) => { a.href = `explore.html${lastExplore}`; });
} catch (e) { /* 저장소를 못 쓰면 기본 링크(explore.html#explore) */ }

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

let tileLayer = null;
/* 지명 수어 보기(전시 지도): 타일을 걷어 경계만 남기고, 줌을 0.1 단위로 풀어 동구 전체가 빈틈없이 들어오게 한다. 장소 둘러보기로 돌아오면 원래대로 */
function applySignsMap(on) {
  if (!map) return;
  if (tileLayer) {
    if (on && map.hasLayer(tileLayer)) map.removeLayer(tileLayer);
    if (!on && !map.hasLayer(tileLayer)) tileLayer.addTo(map);
  }
  map.options.zoomSnap = on ? 0.1 : 1;
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
  tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });
  if (mapMode !== 'signs') tileLayer.addTo(map); // 지명 수어 보기에서는 타일 없이 경계만

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
    // 경계 밖 핀(무등산·양림동·5·18민주광장)을 주소(#map/<id>)로 열 때: 핀은 지역보다 늦게 만들어지므로 여기서 한 번 더 적용한다
    if (location.hash.startsWith('#map/')) { const id = (location.hash.slice(5).match(/^[\w-]+/) || [])[0]; if (id && markersById.has(id)) applyHash(); }
    else if (location.hash === '#map') fitDistrict();
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
  // 지명 수어 v2: 속성은 기본 모양만 두고(행정동은 점선), 호버·선택 색은 CSS 클래스(.hov/.sel)가 입힌다 → 채움·선이 부드럽게 전환된다
  return {
    className: 'region',
    color: 'rgba(236, 232, 222, 0.5)',
    weight: 1,
    opacity: 1,
    fillColor: '#F4F3EF',
    fillOpacity: 0.1,
    dashArray: r.type === '행정동' ? '4 5' : null,
    lineJoin: 'round',
  };
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
    if (!r) return;
    // 상태는 클래스로만 바꾼다. 지도가 아직 첫 화면을 잡기 전이면 path가 없으므로 추가되는 순간 현재 상태를 입힌다
    r.layer.eachLayer((l) => {
      const apply = () => {
        if (!l._path) return;
        void l._path.getBoundingClientRect(); // 방금 옮겨진 요소도 '이전 스타일'을 갖게 해 전환이 재생되게 한다
        l._path.classList.toggle('sel', r.id === selectedRegionId);
        l._path.classList.toggle('hov', hoveredIds.includes(r.id));
      };
      if (l._path) apply(); else l.once('add', apply);
    });
  });
}
function setHovered(ids) {
  const prev = hoveredIds;
  hoveredIds = ids;
  restyle([...new Set([...prev, ...ids])]);
  map.getContainer().classList.toggle('has-hit', ids.length > 0);
  regionListEl.querySelectorAll('.region-btn').forEach((b) => b.classList.toggle('hover', ids.includes(b.dataset.region)));
}
function setSelectedRegion(id) {
  const prev = selectedRegionId;
  selectedRegionId = id;
  // 먼저 쌓는 순서를 바꾸고(요소를 옮기면 진행 중인 전환이 끊긴다) 그 다음에 상태 클래스를 바꿔 전환이 재생되게 한다
  restackRegions();
  if (id) regionById.get(id).layer.bringToFront();
  restyle([prev, id].filter(Boolean));
  regionListEl.querySelectorAll('.region-btn').forEach((b) => {
    const on = b.dataset.region === id;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  updateCinematic();
  if (syncRegionLabels) syncRegionLabels();
}

/* ---------- 지명 수어 연출 (C-1 CINEMATIC): 선택 지역 스포트라이트 + 큰 지명 ----------
   지도 좌표에 고정한 레이어라 확대·이동에 같이 움직인다. 선택을 풀거나 장소 둘러보기로 바꾸면 걷어낸다. */
let shadeLayer = null;
let bigNameMarker = null;
const regionNo = (r) => String(regions.indexOf(r) + 1).padStart(2, '0');

function clearCinematic() {
  if (!map) return;
  [shadeLayer, bigNameMarker].forEach((l) => l && map.removeLayer(l));
  shadeLayer = bigNameMarker = null;
}
function updateCinematic() {
  // v2: 선택 지역은 금색 채움과 동 이름 강조로 보여준다 (바깥 그늘·큰 지명 없음)
  clearCinematic();
  if (syncRegionLabels) syncRegionLabels();
}
/* 보이는 지도 영역: 왼쪽 동 목록(데스크톱)·오른쪽 패널(데스크톱)·아래 시트(모바일)를 뺀 사각형 */
function visibleMapRect() {
  const sheet = isSheetMode();
  const size = map.getSize();
  const pw = !sheet && isPanelOpen() ? panelEl.getBoundingClientRect().width : 0;
  const ph = sheet && isPanelOpen() ? panelEl.getBoundingClientRect().height : 0;
  const listVisible = !sheet && mapMode === 'signs' && regionListEl && getComputedStyle(regionListEl).display !== 'none';
  const lw = listVisible ? regionListEl.getBoundingClientRect().right : 0;
  const shown = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const bottomOf = (el) => (shown(el) ? el.getBoundingClientRect().bottom : 0);
  const top = Math.max(bottomOf(document.querySelector('.map-modes')), bottomOf(regionMenuBtn), 40) + 16;
  const pillsEl = document.querySelector('.pills');
  const pillsH = !ph && shown(pillsEl) ? size.y - pillsEl.getBoundingClientRect().top + 10 : 0;
  return { x0: lw + 24, y0: top, x1: size.x - pw - 24, y1: size.y - Math.max(ph + 16, pillsH, 24), size };
}
/* 카메라: 선택 지역과 이웃의 윤곽이 함께 보이도록 지역 상자를 넉넉히 키운 뒤 보이는 영역 가운데에 놓는다 (정수 줌 11–14) */
function frameRegion(r, animate) {
  const vis = visibleMapRect();
  const visW = Math.max(120, vis.x1 - vis.x0);
  const visH = Math.max(120, vis.y1 - vis.y0);
  const b = r.bounds.pad(0.6);
  const nw = map.project(b.getNorthWest(), 14);
  const se = map.project(b.getSouthEast(), 14);
  const fit = Math.min(visW / Math.max(1, se.x - nw.x), visH / Math.max(1, se.y - nw.y));
  const zoom = Math.max(11, Math.min(14.5, Math.round((14 + Math.log2(fit)) * 10) / 10)); // 0.1 줌 단위 (지명 수어 보기는 zoomSnap 0.1)
  const shift = L.point(vis.size.x / 2 - (vis.x0 + vis.x1) / 2, vis.size.y / 2 - (vis.y0 + vis.y1) / 2);
  const center = map.unproject(map.project(b.getCenter(), zoom).add(shift), zoom);
  if (animate) map.flyTo(center, zoom, { duration: 1.0 });
  else map.setView(center, zoom, { animate: false });
}
/* 동구 16개 동 전체가 보이는 구도 (지명 수어 보기의 시작 화면, 주소 #map) */
function fitDistrict(animate = false) {
  if (!map || !regions.length) return;
  const vis = visibleMapRect();
  const bounds = regions.reduce((bb, r) => bb.extend(r.bounds), L.latLngBounds(regions[0].bounds.getSouthWest(), regions[0].bounds.getNorthEast()));
  map.fitBounds(bounds, { paddingTopLeft: [vis.x0, vis.y0], paddingBottomRight: [vis.size.x - vis.x1, vis.size.y - vis.y1], maxZoom: 14.5, animate });
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
    r.labelMinZoom = r.area >= median ? 12 : 13;
  });
  // 선택한 지역의 이름은 줌과 상관없이 항상, 금색 채움 위에 진하게 보여준다
  syncRegionLabels = () => {
    const z = map.getZoom();
    regions.forEach((r) => {
      const sel = r.id === selectedRegionId;
      const show = sel || z >= r.labelMinZoom;
      if (show && !map.hasLayer(r.label)) r.label.addTo(map);
      if (!show && map.hasLayer(r.label)) map.removeLayer(r.label);
      const el = map.hasLayer(r.label) ? r.label.getElement() : null;
      if (el) el.classList.toggle('on', sel);
    });
    collideLabels();
  };
  map.on('zoomend', syncRegionLabels);
  syncRegionLabels();
}
// 라벨 겹침 정리: 선택 지역 → 넓은 지역 순으로 자리를 잡고, 이미 놓인 라벨과 겹치거나 지역 폭보다 훨씬 넓은 라벨은 숨긴다
function collideLabels() {
  if (!map) return;
  const placed = [];
  const order = regions.slice().sort((a, b) => (b.id === selectedRegionId) - (a.id === selectedRegionId) || b.area - a.area);
  order.forEach((r) => {
    if (!map.hasLayer(r.label)) return;
    const el = r.label.getElement();
    if (!el) return;
    el.style.visibility = 'visible';
    const rect = el.getBoundingClientRect();
    const box = { l: rect.left - 6, t: rect.top - 3, r: rect.right + 6, b: rect.bottom + 3 };
    const sel = r.id === selectedRegionId;
    const bw = Math.abs(map.latLngToContainerPoint(r.bounds.getNorthEast()).x - map.latLngToContainerPoint(r.bounds.getSouthWest()).x);
    const tooWide = !sel && rect.width > bw * 1.6;
    const hit = placed.some((p) => !(box.r < p.l || box.l > p.r || box.b < p.t || box.t > p.b));
    if (tooWide || hit) el.style.visibility = 'hidden';
    else placed.push(box);
  });
}

/* --- 지역 선택 메뉴: '지역 선택 +' 버튼으로 여는 16개 지역 격자 (경계 파일 순서 = PL. 번호, 키보드 선택 가능) --- */
const regionMenuBtn = document.getElementById('region-menu-btn');
function buildRegionList() {
  regionListEl.innerHTML = `<div class="rl-head"><span>광주 동구 <em>${regions.length}</em></span><button type="button" class="rl-close" id="region-menu-close">닫기 ✕</button></div><div class="rl-grid"></div>`;
  const grid = regionListEl.querySelector('.rl-grid');
  regions.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'region-btn';
    b.dataset.region = r.id;
    b.setAttribute('aria-pressed', 'false');
    const hasVideo = r.records.some((pl) => (pl.videos && pl.videos.length) || pl.video_youtube_id);
    b.innerHTML = `<small>${regionNo(r)}</small><span>${esc(r.name)}</span><i class="${hasVideo ? 'has' : 'no'}" aria-hidden="true"></i><em class="sr-only">${hasVideo ? '수어 영상 있음' : '영상 준비 중'}</em><b class="chev" aria-hidden="true">›</b>`;
    b.addEventListener('click', () => selectRegion(r));
    b.addEventListener('mouseenter', () => { if (mapMode === 'signs' && !isSheetMode()) setHovered([r.id]); });
    b.addEventListener('mouseleave', () => { if (hoveredIds.includes(r.id)) setHovered([]); });
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
  // 'spot/…'는 장소 둘러보기 해시, '#…'는 그대로(#map 동구 전체, #spots 거점 전체), 그 외는 지명 수어 해시
  const next = id ? (String(id).startsWith('#') ? String(id) : String(id).startsWith('spot/') ? `#${id}` : `#map/${id}`) : '';
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
  else if (location.hash === '#map') { if (mapMode !== 'signs') setMapMode('signs'); if (isPanelOpen()) closePanel({ keepHash: true }); fitDistrict(!prefersReducedMotion()); } // 지명 수어 보기 시작 화면(동구 전체)
  else if (location.hash === '#spots') { if (mapMode !== 'spots') setMapMode('spots'); else if (typeof showAllHubs === 'function') showAllHubs(); } // 탐험 · 위치 보기 시작 화면(거점 전체)
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
    panelEl.classList.remove('expanded', 'peek');
    void panelEl.offsetWidth; // hidden 해제 직후 리플로우 → 슬라이드 전환이 실제로 재생된다
    panelEl.classList.add('on');
    // 데스크톱은 지도 컨테이너가 줄어들므로 전환이 끝난 뒤 크기를 다시 재고 위치를 맞춘다
    setTimeout(() => {
      map.invalidateSize({ pan: false });
      ensureItemVisible(it);
    }, prefersReducedMotion() ? 0 : 340);
    panelEl.focus({ preventScroll: true });
  } else {
    panelEl.classList.remove('peek'); // 접힌 시트에서 다른 기록을 고르면 영상이 보이는 높이로
    ensureItemVisible(it);
    panelEl.scrollTop = 0;
  }
}

function closePanel({ keepHash = false } = {}) {
  if (panelEl.hidden) return;
  stopPanelVideo();
  panelEl.classList.remove('on', 'expanded', 'peek');
  viewMapEl.classList.remove('dpanel-open');
  document.body.classList.remove('dpanel-open');
  setSelectedRegion(null);
  setActiveMarker(null);
  if (!keepHash) setHash(typeof modeHomeHash === 'function' ? modeHomeHash() : null); // 패널만 닫아도 보기 주소(#map/#spots)는 남겨, 새로고침해도 첫 화면으로 튀지 않게
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
  // 손글씨 한 줄: 데이터의 sign_parts 그대로 (문장을 지어내지 않는다). 유래 설명이 없으면 '아직 없음'으로 둔다
  const parts = (place.sign_parts || []).filter(Boolean);
  const gloss = parts.length ? `<p class="dp-gloss" aria-label="수어 표현 구성: ${esc(parts.join(', '))}">${parts.map(esc).join('<span aria-hidden="true"> · </span>')}</p>` : '';
  return `
    ${gloss}
    ${panelVideoHtml(place)}
    <dl class="dp-facts">
      <div><dt>기록</dt><dd>GSL® / ${String(idx).padStart(2, '0')}</dd></div>
      <div><dt>경계</dt><dd>${esc(boundaryFact)}</dd></div>
      <div><dt>영상</dt><dd>${esc(videoFact)}</dd></div>
    </dl>
    ${parts.length ? `<div class="dp-sign">${signPartsHtml(place)}</div>` : ''}
    <div class="dp-origin"><p class="section-label">이름의 유래</p>
    ${origin ? `<p class="section-text">${esc(origin)}</p>` : `<p class="section-text pending">수어 이름의 유래는 인터뷰를 거쳐 기록합니다. 아직 확인된 설명이 없습니다.</p>`}</div>
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
  // 시트 3단계: peek(접힘: 핸들·이름만) ↔ open(영상이 다 보이는 높이) ↔ expanded(거의 전체). 접힘은 지명 수어 보기에서만
  const sheetState = () => (panelEl.classList.contains('expanded') ? 'expanded' : panelEl.classList.contains('peek') ? 'peek' : 'open');
  const setSheet = (state) => {
    panelEl.classList.toggle('expanded', state === 'expanded');
    panelEl.classList.toggle('peek', state === 'peek');
    handle.setAttribute('aria-expanded', String(state === 'expanded'));
    handle.setAttribute('aria-label', state === 'expanded' ? '시트 접기' : state === 'peek' ? '시트 열기' : '시트 펼치기');
  };
  const canPeek = () => mapMode === 'signs';
  handle.addEventListener('click', () => { const s = sheetState(); setSheet(s === 'peek' ? 'open' : s === 'open' ? 'expanded' : 'open'); });
  let dragY = null;
  handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; });
  window.addEventListener('pointerup', (e) => {
    if (dragY === null) return;
    const dy = e.clientY - dragY;
    dragY = null;
    if (dy < -40) setSheet(sheetState() === 'peek' ? 'open' : 'expanded');
    else if (dy > 40) setSheet(sheetState() === 'expanded' ? 'open' : canPeek() ? 'peek' : 'open');
  });
  window.__setSheet = setSheet; // 테스트용
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
      map.whenReady(() => { restyle(regions.map((r) => r.id)); if (syncRegionLabels) syncRegionLabels(); });
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
fetch('data/places.json?v=20261021')
  .then((res) => res.json())
  .then((places) => {
    placesData = places;
    places.forEach((p, i) => { p._color = placeColor(i); });
    buildTrack(places);
    buildRuler(places);
    buildSignIndex(places);
    if (location.hash.startsWith('#map') || location.hash.startsWith('#spot')) setView('map'); // #map, #map/…, #spots, #spot/…
    else { const v = new URLSearchParams(location.search).get('view'); if (v && v !== 'archive' && document.getElementById(`view-${v}`)) setView(v); } // explore.html에서 ?view=map|about 으로 들어올 때
    syncRuler();
    document.getElementById('loader').classList.add('done');
  })
  .catch((err) => {
    trackEl.innerHTML =
      '<p style="font-size:14px;color:var(--muted)">data/places.json을 불러오지 못했습니다. 로컬 서버로 열어주세요 (예: python3 -m http.server).</p>';
    console.error(err);
    document.getElementById('loader').classList.add('done');
  });
