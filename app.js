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
  if (e.key === 'Escape' && !overlayEl.hidden) closeOverlay();
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

function memoriesHtml(place) {
  const memos = place.memories || [];
  if (!memos.length) {
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
  return `<div class="memos">${cards}</div>${extra}`;
}

// 펼치기/접기 — detail 영역은 매번 innerHTML로 새로 그려지므로 위임으로 한 번만 건다
function toggleMemo(memo) {
  const open = memo.classList.toggle('open');
  memo.setAttribute('aria-expanded', String(open));
}
detailEl.addEventListener('click', (e) => {
  const memo = e.target.closest('.memo.has-more');
  if (memo && detailEl.contains(memo)) toggleMemo(memo);
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

  // 키 없이 쓸 수 있는 OSM 표준 타일. 채도는 CSS 필터(.leaflet-tile-pane)로 종이 톤에 맞춘다.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // 동구 16개 지역 경계를 먼저 올리고, 경계로 대체되지 않는 장소만 핀으로 남긴다.
  // 경계 파일을 못 읽으면 임의 경계를 그리지 않고 안내문 + 이전처럼 전체 핀으로 돌아간다.
  loadRegions().then((ok) => {
    const covered = ok ? new Set(Object.values(REGION_PLACE).filter(Boolean)) : new Set();
    placesData.filter((p) => !covered.has(p.id)).forEach(addPin);
    const bounds = ok
      ? regions.reduce((b, r) => (b ? b.extend(r.bounds) : L.latLngBounds(r.bounds)), null)
      : L.latLngBounds(placesData.map((p) => [p.lat, p.lng]));
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: ok ? [40, 40] : [70, 70], maxZoom: 14, animate: false });
    }
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
    openOverlay(place);
  });
  markersById.set(place.id, marker);
}

/* ---------- 동구 16개 지역 경계 (data/gwangju_donggu_sign_16.geojson) ---------- */
const REGION_GEOJSON = 'data/gwangju_donggu_sign_16.geojson?v=20261015';
const REGION_COUNT = 16;

// GeoJSON feature.properties.id → places.json id. 이름이 아니라 ID로 고정 연결한다.
// 산수동(donggu_06)은 아직 장소 데이터가 없어 null — 경계만 그리고 '영상 준비 중'으로 연다.
const REGION_PLACE = {
  donggu_01: 'gyerim-dong',
  donggu_02: 'gung-dong',
  donggu_03: 'geumnam-ro',
  donggu_04: 'daein-dong',
  donggu_05: 'dongmyeong-dong',
  donggu_06: null,
  donggu_07: 'seoseok-dong',
  donggu_08: 'sotae-dong',
  donggu_09: 'unrim-dong',
  donggu_10: 'wollam-dong',
  donggu_11: 'jisan-dong',
  donggu_12: 'jiwon-dong',
  donggu_13: 'chungjang-ro',
  donggu_14: 'hak-dong',
  donggu_15: 'seonam-dong',
  donggu_16: 'hagun-dong',
};

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
function regionStyle(r) {
  const state = r.id === selectedRegionId ? 'selected' : hoveredIds.includes(r.id) ? 'hover' : 'base';
  const s = {
    className: 'region',
    color: r.color,
    weight: 1,
    opacity: 0.55,
    fillColor: r.color,
    fillOpacity: 0.1,
    dashArray: r.type === '행정동' ? '4 5' : null,
    lineJoin: 'round',
  };
  if (state === 'hover') Object.assign(s, { weight: 1.5, opacity: 0.95, fillOpacity: 0.26 });
  if (state === 'selected') Object.assign(s, { weight: 2, opacity: 1, fillOpacity: 0.34 });
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
}

/* --- 지역 열기: 장소가 있으면 기존 오버레이, 없으면 '영상 준비 중' --- */
function openRegion(r) {
  if (r.place) {
    openOverlay(r.place);
    return;
  }
  lastFocused = document.activeElement;
  overlayEl.hidden = false;
  detailEl.style.setProperty('--kc', r.color);
  detailEl.innerHTML = `
    <p class="ov-kicker">동구 ${esc(r.type)} — 수어 지명 기록</p>
    <h2>${esc(r.name)}</h2>
    <div class="video-box"><span class="placeholder">SIGN — COMING SOON<br>영상 준비 중</span></div>
    <p class="section-label">장소 기억</p>
    <p class="section-text">(아직 수집되지 않음)</p>`;
  closeBtn.focus();
}

// fly: 지역 목록에서 고른 경우 — 먼저 해당 지역으로 이동한 뒤 오버레이를 연다
function selectRegion(r, { fly = false } = {}) {
  setSelectedRegion(r.id);
  if (!fly) {
    openRegion(r);
    return;
  }
  const fit = { padding: [60, 60], maxZoom: 15 };
  if (prefersReducedMotion()) {
    map.fitBounds(r.bounds, { ...fit, animate: false });
    openRegion(r);
    return;
  }
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    map.off('moveend', open);
    openRegion(r);
  };
  map.once('moveend', open);
  setTimeout(open, 1200); // moveend가 오지 않는 경우의 안전장치
  map.flyToBounds(r.bounds, { ...fit, duration: 0.7 });
}

/* --- 겹치는 지역 선택 팝업 --- */
function openChooser(hits, latlng) {
  const html = `
    <div class="chooser" role="group" aria-label="겹치는 지역 선택">
      <p class="chooser-cap">이 위치는 ${hits.length}개 지역에 속합니다</p>
      ${hits
        .map(
          (r) =>
            `<button type="button" class="chooser-btn" data-region="${r.id}" style="--c:${r.color}"><i aria-hidden="true"></i>${esc(r.name)} 수어 보기<small>${esc(r.type)}</small></button>`
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

/* --- 보조 탐색: 16개 지역 목록 (키보드 선택 가능) --- */
function buildRegionList() {
  regionListEl.innerHTML = '<p class="rl-cap">동구 16 — 지역 선택</p>';
  regions
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .forEach((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'region-btn';
      b.dataset.region = r.id;
      b.style.setProperty('--c', r.color);
      b.setAttribute('aria-pressed', 'false');
      const hasVideo = !!(r.place && ((r.place.videos && r.place.videos.length) || r.place.video_youtube_id));
      b.innerHTML = `<i aria-hidden="true"></i><span>${esc(r.name)}</span>${hasVideo ? '' : '<small>준비 중</small>'}`;
      b.addEventListener('click', () => selectRegion(r, { fly: true }));
      regionListEl.appendChild(b);
    });
  regionListEl.hidden = false;
}

/* --- 호버/클릭: 레이어가 아니라 지도 좌표 기준으로 판정 (겹침·가림 없음) --- */
function bindRegionEvents() {
  const canHover = window.matchMedia('(hover: hover)').matches;
  let raf = null;

  if (canHover) {
    map.on('mousemove', (e) => {
      if (chooserPopup) return;
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

function loadRegions() {
  return fetch(REGION_GEOJSON)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((geo) => {
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
        if (!(id in REGION_PLACE)) throw new Error(`연결 정보가 없는 지역 ID: ${id}`);
        const placeId = REGION_PLACE[id];
        const place = placeId ? placeById.get(placeId) || null : null;
        if (placeId && !place) throw new Error(`places.json에 없는 장소: ${placeId}`);
        const layer = L.geoJSON(f, { interactive: false, style: () => ({}) });
        const r = {
          id,
          name: props.name || place?.name || id,
          type: props.boundary_type || '',
          place,
          color: place ? place._color : '#8B8A85',
          geom: f.geometry,
          bounds: layer.getBounds(),
          area: geometryArea(f.geometry),
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
      buildRegionList();
      bindRegionEvents();
      mapErrorEl.hidden = true;
      return true;
    })
    .catch((err) => {
      console.error('경계 데이터 로드 실패:', err);
      showMapError(`동구 지역 경계를 불러오지 못했습니다 (${err.message}). 경계 없이 장소 핀만 표시합니다.`);
      return false;
    });
}

/* ---------- 데이터 로드 ---------- */
fetch('data/places.json?v=20261014b')
  .then((res) => res.json())
  .then((places) => {
    placesData = places;
    places.forEach((p, i) => { p._color = placeColor(i); });
    buildTrack(places);
    buildRuler(places);
    buildSignIndex(places);
    syncRuler();
    document.getElementById('loader').classList.add('done');
  })
  .catch((err) => {
    trackEl.innerHTML =
      '<p style="font-size:14px;color:var(--muted)">data/places.json을 불러오지 못했습니다. 로컬 서버로 열어주세요 (예: python3 -m http.server).</p>';
    console.error(err);
    document.getElementById('loader').classList.add('done');
  });
