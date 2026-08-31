/* 손으로 부르는 광주 — 아카이브(가로 트랙) / 지도 / 소개 3개 뷰 구조 */

const trackEl = document.getElementById('track');
const rulerStripEl = document.getElementById('ruler-strip');
const overlayEl = document.getElementById('overlay');
const detailEl = document.getElementById('detail');
const closeBtn = document.getElementById('ov-close');

// 장소 고유 색 — 카드 그라디언트, 지도 마커, 눈금자 라벨에 함께 쓴다
const PALETTE = ['#FF5A36', '#4FA3FF', '#FFC53D', '#9B7BFF', '#59C48C', '#FF7BAE'];
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
  overlayEl.hidden = true;
  detailEl.innerHTML = '';
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
closeBtn.addEventListener('click', closeOverlay);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlayEl.hidden) closeOverlay();
});

// FIXME: replace with the real video once footage is edited.
// Fill video_youtube_id in data/places.json with a YouTube "unlisted" video ID.
function videoBoxHtml(place) {
  if (place.video_youtube_id) {
    return `<div class="video-box"><iframe src="https://www.youtube.com/embed/${place.video_youtube_id}" title="${place.name} 수어 영상" allowfullscreen></iframe></div>`;
  }
  return `<div class="video-box"><span class="placeholder">SIGN — COMING SOON<br>수어 영상 촬영 예정</span></div>`;
}

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
    <p class="section-label">수어 이름의 유래</p>
    <p class="section-text">${place.origin_text || '(아직 수집되지 않음)'}</p>
    <p class="section-label">장소 기억</p>
    <p class="section-text">${place.memory_text || '(아직 수집되지 않음)'}</p>
    <div class="tags">
      ${(place.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
    </div>`;
}

/* ---------- 아카이브 트랙 ---------- */
function mediaHtml(place, idx) {
  if (place.video_youtube_id) {
    return `<img src="https://i.ytimg.com/vi/${place.video_youtube_id}/hqdefault.jpg" alt="" loading="lazy">`;
  }
  // 영상·사진이 채워지기 전의 자리표시: 번호 + 안내
  return `<span class="ph"><span>SIGN — SOON</span><span class="no">${String(idx).padStart(2, '0')}</span></span>`;
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

  // 키 없이 쓸 수 있는 OSM 표준 타일. 채도는 CSS 필터(.leaflet-tile-pane)로 종이 톤에 맞춘다.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  placesData.forEach((place) => {
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
      openOverlay(place);
    });
    markersById.set(place.id, marker);
  });

  const bounds = L.latLngBounds(placesData.map((p) => [p.lat, p.lng]));
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14, animate: false });
  }
}

/* ---------- 데이터 로드 ---------- */
fetch('data/places.json')
  .then((res) => res.json())
  .then((places) => {
    placesData = places;
    places.forEach((p, i) => { p._color = placeColor(i); });
    buildTrack(places);
    buildRuler(places);
    syncRuler();
    document.getElementById('loader').classList.add('done');
  })
  .catch((err) => {
    trackEl.innerHTML =
      '<p style="font-size:14px;color:var(--muted)">data/places.json을 불러오지 못했습니다. 로컬 서버로 열어주세요 (예: python3 -m http.server).</p>';
    console.error(err);
    document.getElementById('loader').classList.add('done');
  });
