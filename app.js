const map = L.map('map', { scrollWheelZoom: true }).setView([35.1595, 126.8526], 13);

// 차분한 톤의 CARTO Positron 타일 (기본 OSM 타일보다 디자인에 잘 묻는다)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20,
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
const filterBarEl = document.getElementById('filter-bar');
const revealedSensitive = new Set();
const markersById = new Map();
const activeTags = new Set();
let currentPlaceId = null;

function renderEmpty() {
  detailEl.innerHTML = '<div class="card empty">지도에서 핀을 눌러보세요.</div>';
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
  filterBarEl.appendChild(allChip);

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
    filterBarEl.appendChild(chip);
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
      const marker = L.marker([place.lat, place.lng], { icon: pinIcon }).addTo(map);
      marker.bindTooltip(place.name, { direction: 'top', offset: [0, -10], className: 'place-tip' });
      marker.on('click', () => {
        currentPlaceId = place.id;
        setActiveMarker(marker);
        renderPlace(place);
      });
      markersById.set(place.id, marker);
    });
    buildFilterBar(places);
  })
  .catch((err) => {
    detailEl.innerHTML =
      '<div class="card empty">data/places.json을 불러오지 못했습니다. 로컬 서버로 열어주세요 (예: python3 -m http.server).</div>';
    console.error(err);
  });
