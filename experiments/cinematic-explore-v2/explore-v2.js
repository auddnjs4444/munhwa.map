/* ===== 시네마틱 탐험 v2 (B안) — 실제 광주 사진 두 장으로 만든 장면 전환: 도심 조망 → (내려가기) → 충장로 거리 → 캔모아 선택 → 기존 장소 기억 =====
   사진 위에 핀을 찍지 않는다(촬영점·방향 미확정). 장소 선택은 하단 탐색 메뉴. 좌표·주소·기록은 본 사이트 데이터 그대로. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('noanim');
  const isSheet = () => matchMedia('(max-width: 767px)').matches;
  const T_DESCEND = REDUCED ? 650 : 2150; // CSS --t-descend와 맞춘다
  const T_ASCEND = REDUCED ? 650 : 1700;

  // 사진 (사용 허락을 받은 블로그 사진, 709px 캡처본 — 원본 확보 전)
  const PHOTOS = {
    city: { src: '../../assets/explore/overlook-mountains.jpg', focus: '50% 50%', focusM: '52% 50%', credit: '도심 조망 사진: 광주 도심과 무등산 — 사용 허락을 받은 사진, 해질녘 톤으로 보정' },
    street: { src: '../../assets/explore/chungjang-night.jpg', focus: '50% 55%', focusM: '58% 50%', credit: '거리 사진: 충장로 거리 풍경 — 사용 허락을 받은 사진. 선택한 장소 자체의 사진이 아니라 충장로 거리 사진입니다' },
  };
  // 장소: 좌표·주소는 본 사이트 데이터에서 읽고, 이 화면에서는 캔모아만 열린다
  const PLACES = [
    { id: 'canmore', name: '충장로 캔모아', short: '캔모아', en: 'CHUNGJANG-RO · CANMORE', sub: '충장로, 수어로 마음껏 이야기하던 곳', from: 'hub:canmore', street: true, ready: true, thumb: '../../assets/explore/chungjang-night.jpg', link: '../../explore.html#place/canmore' },
    { id: 'chungu', name: '충우 앞', short: '충우 앞', street: true, link: '../../explore.html#place/chungu' },
    { id: 'palace-bakery', name: '궁전제과', short: '궁전제과', from: 'place:palace-bakery', street: true, link: '../../explore.html#place/palace-bakery' },
    { id: 'geumnam-park', name: '금남로공원', short: '금남로공원', from: 'place:geumnam-park', link: '../../explore.html#place/geumnam-park' },
    { id: 'square', name: '5·18민주광장', short: '5·18민주광장', link: '../../explore.html#place/518-democracy-square' },
    { id: 'acc', name: '국립아시아문화전당', short: 'ACC', from: 'place:acc', thumb: '../../assets/explore/acc-night.jpg', link: '../../explore.html#place/acc' },
  ];
  const TITLES = {
    overview: { eyebrow: 'CINEMATIC EXPLORE · 광주 동구', name: '광주 동구', hint: '충장로에서 시작합니다. 아래에서 장소를 고르면 거리로 내려갑니다.' },
    street: { eyebrow: 'CHUNGJANG-RO · 거리 탐험', name: '충장로', hint: '농인들이 만나고 약속하던 거리. 장소를 고르면 기억으로 이어집니다.' },
  };

  let scene = 'loading', current = null, timer = null;
  const placeById = (id) => PLACES.find((p) => p.id === id);
  const setScene = (s) => { scene = s; document.body.dataset.scene = s; };
  const notice = (msg) => { const n = $('notice'); n.textContent = msg; n.hidden = false; clearTimeout(notice.t); notice.t = setTimeout(() => { n.hidden = true; }, 2600); };

  /* ---------- 데이터 ---------- */
  async function loadSpots() {
    try {
      const spots = await fetch('../../data/spots.json?v=20261021').then((r) => (r.ok ? r.json() : null));
      if (!spots) return;
      PLACES.forEach((p) => {
        if (!p.from) return;
        const [kind, id] = p.from.split(':');
        const s = kind === 'hub' ? spots.hubs.find((h) => h.id === id) : spots.places.find((x) => x.id === id);
        if (s) { p.addr = s.address; p.verified = ['poi', 'building'].includes(s.geo && s.geo.precision); }
      });
    } catch (e) { /* 주소 없이도 동작 */ }
  }
  function loadPhoto(img, spec) {
    img.style.setProperty('--focus', spec.focus); img.style.setProperty('--focus-m', spec.focusM || spec.focus);
    return new Promise((resolve) => { if (img.complete && img.naturalWidth && img.getAttribute('src') === spec.src) return resolve(true); img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = spec.src; });
  }

  /* ---------- 커서 시차 (사진을 찢지 않는 범위) ---------- */
  if (!REDUCED) {
    let raf = null;
    document.addEventListener('mousemove', (e) => {
      if (isSheet() || scene === 'descend' || scene === 'ascend') return;
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { $('plx-city').style.transform = `translate(${(-x * 16).toFixed(1)}px, ${(-y * 9).toFixed(1)}px)`; $('plx-street').style.transform = `translate(${(-x * 10).toFixed(1)}px, ${(-y * 6).toFixed(1)}px)`; });
    });
  }

  /* ---------- 장면 ---------- */
  function setTitle(key) { const t = TITLES[key]; $('t-eyebrow').textContent = t.eyebrow; $('t-name').textContent = t.name; $('t-hint').textContent = t.hint; }
  function goOverview({ instant = false } = {}) {
    clearTimeout(timer); current = null; hideCard(); syncChips();
    $('credit').textContent = PHOTOS.city.credit; $('up').hidden = true;
    if (instant || scene === 'loading') { setTitle('overview'); setScene('overview'); buildStrip('overview'); setHash(''); return; }
    $('caption').textContent = '도심 조망으로'; setScene('ascend'); $('layer-street').setAttribute('aria-hidden', 'true');
    timer = setTimeout(() => { setTitle('overview'); buildStrip('overview'); setScene('overview'); setHash(''); }, T_ASCEND);
  }
  // 도심 조망 → 충장로 거리 (사진이 다른 시점이므로 3D 비행이 아니라 밀어 들어가기 + 흐림 + 레터박스 + 디졸브)
  function descend(targetId, { instant = false } = {}) {
    clearTimeout(timer);
    const p = targetId ? placeById(targetId) : null;
    const arrive = () => {
      setTitle('street'); buildStrip('street'); $('credit').textContent = PHOTOS.street.credit; $('up').hidden = false;
      $('layer-street').setAttribute('aria-hidden', 'false');
      setScene('street'); setHash('street');
      if (p && p.ready) timer = setTimeout(() => showPlace(p.id), instant ? 0 : 500); else syncChips();
    };
    if (instant || scene === 'loading') { arrive(); return; }
    $('caption').textContent = '충장로로 내려갑니다'; hideCard(); setScene('descend');
    timer = setTimeout(arrive, T_DESCEND);
  }
  function showPlace(id) {
    const p = placeById(id); if (!p || !p.ready) return;
    current = id; syncChips();
    $('c-en').textContent = p.en || ''; $('c-name').textContent = p.short; $('c-sub').textContent = p.sub || '';
    $('c-addr').textContent = p.addr ? `${p.addr}${p.verified ? ' · 위치 확인됨' : ''}` : '';
    $('c-link').href = p.link; $('card').hidden = false;
    setScene('place'); setHash(`place/${id}`);
  }
  function hideCard() { $('card').hidden = true; if (scene === 'place') { current = null; syncChips(); setScene('street'); setHash('street'); } }
  function choose(id) {
    const p = placeById(id); if (!p) return;
    toggleMenu(false);
    if (!p.ready) { notice(`${p.name}: 다음 단계에서 엽니다 (이번 장면은 충장로·캔모아까지).`); return; }
    if (scene === 'overview') descend(id);
    else if (scene === 'street' || scene === 'place') showPlace(id);
  }
  function setHash(h) { const next = h ? `#${h}` : ''; if (location.hash === next) return; history.replaceState(null, '', next || location.pathname + location.search); }

  /* ---------- 탐색 UI ---------- */
  function chip(p, i) {
    return `<button type="button" class="chip${p.ready ? '' : ' pending'}${p.id === current ? ' on' : ''}" data-place="${esc(p.id)}" aria-pressed="${p.id === current}" title="${esc(p.ready ? p.name : p.name + ' — 다음 단계')}"><span class="thumb">${p.thumb && p.ready ? `<img src="${esc(p.thumb)}" alt="">` : String(i + 1).padStart(2, '0')}</span>${esc(p.short)}</button>`;
  }
  function buildStrip(kind) {
    const list = kind === 'street' ? PLACES.filter((p) => p.street) : PLACES;
    $('strip').innerHTML = list.map((p) => chip(p, PLACES.indexOf(p))).join('');
    $('strip').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => choose(b.dataset.place)));
  }
  function syncChips() { document.querySelectorAll('[data-place]').forEach((b) => { const on = b.dataset.place === current; b.classList.toggle('on', on); if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(on)); }); }
  function buildMenu() {
    $('region-list').innerHTML = PLACES.map((p, i) => `<button type="button" class="rm-item${p.ready ? '' : ' pending'}" data-place="${esc(p.id)}"><small>${String(i + 1).padStart(2, '0')}</small><span>${esc(p.name)}</span><em>${p.ready ? '거리 · 기억' : '다음 단계'}</em></button>`).join('');
    $('region-list').querySelectorAll('.rm-item').forEach((b) => b.addEventListener('click', () => choose(b.dataset.place)));
  }
  function toggleMenu(force) { const m = $('region-menu'), b = $('region-btn'); const open = force ?? m.hidden; if (!open && m.hidden) return; m.hidden = !open; b.setAttribute('aria-expanded', String(open)); }
  function bindUi() {
    $('region-btn').addEventListener('click', () => toggleMenu());
    $('region-close').addEventListener('click', () => toggleMenu(false));
    document.addEventListener('pointerdown', (e) => { const m = $('region-menu'); if (m.hidden || m.contains(e.target) || $('region-btn').contains(e.target)) return; toggleMenu(false); });
    $('c-back').addEventListener('click', () => hideCard());
    $('up').addEventListener('click', () => goOverview());
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!$('region-menu').hidden) toggleMenu(false); else if (scene === 'place') hideCard(); else if (scene === 'street') goOverview(); });
    window.addEventListener('hashchange', () => applyHash());
  }
  function applyHash({ instant = false } = {}) {
    const m = location.hash.match(/^#place\/([\w-]+)/);
    if (m && placeById(m[1])) { if (scene === 'overview' || scene === 'loading') descend(m[1], { instant }); else showPlace(m[1]); }
    else if (location.hash === '#street') { if (scene !== 'street') descend(null, { instant }); }
    else if (scene !== 'overview') goOverview({ instant });
  }

  /* ---------- 시작: 두 사진을 먼저 받아 빈 화면 없이 ---------- */
  async function boot() {
    buildMenu(); bindUi();
    const [ok1, ok2] = await Promise.all([loadPhoto($('photo-city'), PHOTOS.city), loadPhoto($('photo-street'), PHOTOS.street), loadSpots()]);
    if (!ok1 || !ok2) { notice('사진을 불러오지 못했습니다 (assets/explore).'); }
    setTitle('overview'); buildStrip('overview'); $('credit').textContent = PHOTOS.city.credit;
    setScene('overview');
    if (location.hash) applyHash({ instant: true });
  }
  window.__cx = { descend, showPlace, hideCard, goOverview, choose, scene: () => scene };
  boot();
})();
