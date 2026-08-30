const map = L.map('map', { scrollWheelZoom: true }).setView([35.1595, 126.8526], 13);

// 키 없이 쓸 수 있는 OSM 표준 타일.
// (CARTO Positron은 2025년부터 API 키 없이 쓰면 타일에 워터마크가 찍혀서 교체함)
// 원색이 강한 타일이라 index.html의 .leaflet-tile-pane 필터로 종이 톤에 맞춰 눌러준다.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

const pinIcon = L.divIcon({
  className: 'pin-wrap',
  html: '<div class="pin"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
let activeMarker = null;

function setActiveMarker(marker) {
  const prevEl = activeMarker && activeMarker.getElement();
  if (prevEl) prevEl.querySelector('.pin').classList.remove('pin--active');
  activeMarker = marker;
  const el = marker && marker.getElement();
  if (el) el.querySelector('.pin').classList.add('pin--active');
}

const detailEl = document.getElementById('detail');
// 900px 미만에서는 지도 아래에 카드가 쌓이므로, 핀을 눌러도 카드가 화면 밖에 있을 수 있다.
const isStackedLayout = () => window.matchMedia('(max-width: 899px)').matches;
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealDetail() {
  if (!isStackedLayout()) return;
  const target = detailEl.closest('.col') || detailEl;
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}
const filterBarEl = document.getElementById('filter-bar');
const filterChipsEl = filterBarEl.querySelector('.inner') || filterBarEl;
const revealedSensitive = new Set();
const markersById = new Map();
const activeTags = new Set();
let currentPlaceId = null;

function renderEmpty() {
  detailEl.innerHTML = '<div class="card empty">지도에서 핀을 누르면 이곳에 기록이 열립니다.</div>';
}

// FIXME: replace with the real video once footage is edited.
// Fill video_youtube_id in data/places.json with a YouTube "unlisted" video ID.
function videoBoxHtml(place) {
  if (place.video_youtube_id) {
    return `<div class="video-box"><iframe src="https://www.youtube.com/embed/${place.video_youtube_id}" title="${place.name} 수어 영상" allowfullscreen></iframe></div>`;
  }
  return `<div class="video-box"><span class="placeholder">수어 영상 자리 (촬영 전)<br>data/places.json 의 video_youtube_id를 채워주세요</span></div>`;
}

function renderPlace(place) {
  // 5·18 등 민감한 지점은 자문 확보 여부와 무관하게 항상 안내 문구를 먼저 보여준다.
  // 이 게이트 로직은 임의로 지우지 말 것 — 윤리 원칙(사업제안서 XI장) 참고.
  if (place.sensitive && !revealedSensitive.has(place.id)) {
    detailEl.innerHTML = `
      <div class="card">
        <div class="sensitive-gate">
          <p class="section-text">${place.sensitive_notice || '이 지점은 역사적으로 민감한 기록을 담고 있습니다. 계속 보시겠어요?'}</p>
          <button id="reveal-btn">기록 보기</button>
        </div>
      </div>`;
    document.getElementById('reveal-btn').onclick = () => {
      revealedSensitive.add(place.id);
      renderPlace(place);
    };
    return;
  }

  detailEl.innerHTML = `
    <div class="card">
      <h2>${place.name}</h2>
      ${videoBoxHtml(place)}
      <p class="section-text">${place.origin_text || ''}</p>
      <p class="section-label">장소 기억</p>
      <p class="section-text">${place.memory_text || '(아직 수집되지 않음)'}</p>
      <div class="tags">
        ${(place.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>`;
}

// 태그 필터: 선택된 태그를 하나라도 가진 장소만 표시(OR). 선택이 없으면 전체 표시.
function applyFilters(places) {
  places.forEach((place) => {
    const marker = markersById.get(place.id);
    if (!marker) return;
    const visible =
      activeTags.size === 0 || (place.tags || []).some((t) => activeTags.has(t));
    if (visible) {
      marker.addTo(map);
    } else {
      marker.remove();
      if (currentPlaceId === place.id) {
        currentPlaceId = null;
        setActiveMarker(null);
        renderEmpty();
      }
    }
  });
}

function buildFilterBar(places) {
  const tags = [];
  places.forEach((place) => {
    (place.tags || []).forEach((tag) => {
      if (!tags.includes(tag)) tags.push(tag);
    });
  });
  if (tags.length === 0) return;

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'chip active';
  allChip.textContent = '전체';
  allChip.setAttribute('aria-pressed', 'true');
  filterChipsEl.appendChild(allChip);

  const tagChips = tags.map((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = tag;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      syncChips();
      applyFilters(places);
    });
    filterChipsEl.appendChild(chip);
    return { tag, chip };
  });

  allChip.addEventListener('click', () => {
    activeTags.clear();
    syncChips();
    applyFilters(places);
  });

  function syncChips() {
    const showingAll = activeTags.size === 0;
    allChip.classList.toggle('active', showingAll);
    allChip.setAttribute('aria-pressed', String(showingAll));
    tagChips.forEach(({ tag, chip }) => {
      const on = activeTags.has(tag);
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
  }

  filterBarEl.hidden = false;
}

fetch('data/places.json')
  .then((res) => res.json())
  .then((places) => {
    places.forEach((place) => {
      const marker = L.marker([place.lat, place.lng], {
        icon: pinIcon,
        title: place.name,
      }).addTo(map);
      marker.bindTooltip(place.name, { direction: 'top', offset: [0, -10], className: 'place-tip' });
      marker.on('click', () => {
        currentPlaceId = place.id;
        setActiveMarker(marker);
        renderPlace(place);
        revealDetail();
      });
      markersById.set(place.id, marker);
    });
    buildFilterBar(places);

    // 좁은 화면에서는 고정 setView로는 핀이 지도 밖으로 밀려난다. 처음 한 번 전체 핀에 맞춰준다.
    const bounds = L.latLngBounds(places.map((place) => [place.lat, place.lng]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
    }
  })
  .catch((err) => {
    detailEl.innerHTML =
      '<div class="card empty">data/places.json을 불러오지 못했습니다. 로컬 서버로 열어주세요 (예: python3 -m http.server).</div>';
    console.error(err);
  });
