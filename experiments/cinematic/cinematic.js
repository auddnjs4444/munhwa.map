/* ===== Cinematic Gwangju — 캔모아 중심 장소 탐험 (experiment) =====
   상태 2개: intro(첫 화면: 무등산·도심 항공사진 + 소개) → place(장소 선택: 실제 거리 사진 + 손글씨 한 줄 + 큰 지명 + 오른쪽 황금 패널).
   '광주 탐험하기' → 충장로 → 캔모아(거점)가 먼저 열리고, 패널의 '함께 둘러볼 장소'에서 가까운 장소/더 둘러볼 곳으로 이동한다.
   데이터는 본 사이트 원본(data/spots.json · places.json · memory-stories.json)을 그대로 읽는다. 복사본 없음, 창작 문장 없음.
   사진 위에 위치 핀을 찍지 않는다. 거리는 좌표가 확인된 곳만 '직선거리'로 표시하고 도보 시간은 표시하지 않는다. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('noanim');
  const isSheet = () => matchMedia('(max-width: 767px)').matches;

  const DATA_V = '20261019';
  const SRC = { spots: `../../data/spots.json?v=${DATA_V}`, places: `../../data/places.json?v=${DATA_V}`, stories: `../../data/memory-stories.json?v=${DATA_V}` };
  const HUB_ID = 'canmore';   // 탐험 거점
  const NEAR_M = 450;         // '가까운 장소' 기준: 거점에서 직선 450 m 이내 (실제 위치가 확인된 곳만)

  // 배경·장면 사진. 저장소에는 넣지 않는다(게시 권한 미확인) — README 참고.
  const HERO = { src: 'assets/overlook-mountains.jpg', grade: 'bluehour', focus: '50% 50%', focusM: '52% 50%', glow: ['44%', '66%'], credit: '배경 사진: 광주 도심과 무등산 방향 조망 — 참고 사진 08 (내부 시안용, 촬영점·방향 미확정, 낮 사진을 블루아워 톤으로 보정)' };
  const SCENES = {
    chungjang: { src: 'assets/chungjang-night.jpg', grade: 'night', focus: '50% 55%', focusM: '58% 50%', glow: ['46%', '58%'], credit: '장면 사진: 충장로 거리 풍경 — 참고 사진 01 (내부 시안용). 선택한 장소 자체의 사진이 아니라 충장로 거리 사진입니다', thumb: 'assets/chungjang-night.jpg' },
    acc: { src: 'assets/acc-night.jpg', grade: 'night', focus: '50% 62%', focusM: '46% 60%', glow: ['50%', '58%'], credit: '장면 사진: 국립아시아문화전당 일대, 해질녘 — 참고 사진 03 (내부 시안용, 촬영 방향 미확정)', thumb: 'assets/acc-night.jpg' },
  };
  const NO_SCENE_CREDIT = '배경: 광주 도심 조망(참고 사진 08) — 이 장소의 사진은 아직 없어 도시 풍경을 배경으로 둡니다';

  // 표시용 보조 정보(기록이 아님): 영문 표기, 어느 장면 사진을 쓰는지, 데이터 파일에 좌표가 없는 곳의 확인된 좌표(출처 명시), 제목 줄임.
  const PRESENT = {
    canmore: { en: 'CHUNGJANG-RO · CANMORE', scene: 'chungjang', sub: '충장로, 수어로 마음껏 이야기하던 곳' },
    'memory:충우 앞': { id: 'chungu', en: 'CHUNGJANG-RO · GWANGJU POST OFFICE', scene: 'chungjang', geo: { lat: 35.1475911, lng: 126.9172187, precision: 'poi', source: 'OSM node/368876980 amenity=post_office 광주우체국(충장로2가) — 충장로 우체국, 이른바 충우' } },
    'palace-bakery': { en: 'CHUNGJANG-RO · GUNGJEON BAKERY', scene: 'chungjang', short: '궁전제과' },
    'geumnam-park': { en: 'GEUMNAM-RO 3GA · PARK', note: "기존에 '금남로 나비정원'이라 부르던 곳입니다(사용자 확인). 빛으로 만든 나비 미디어아트 '금남나비정원'이 있는 공원으로 소개되며(여행 정보 사이트 기준, 공식 자료 재확인 필요), 야경 장면은 사진 게시 권한을 확인한 뒤 넣습니다.", verify: '좌표 검증: spots.json 지점과 OSM 공원 폴리곤(way/452261523) 중심이 25 m 차이' },
    '518-democracy-square': { en: '5·18 DEMOCRACY SQUARE', address: '광주광역시 동구 · 옛 전남도청 앞', geo: { lat: 35.14748, lng: 126.91964, precision: 'poi', source: 'OSM relation/19102230(광장) 중심 — 본 사이트 places.json 지점(5·18기록관 부근)과 약 387 m 차이' } },
    acc: { en: 'ASIA CULTURE CENTER', scene: 'acc', short: 'ACC' },
    'memory:전일빌딩 · 금남로 · 충장로': { id: 'geumnam-street', en: 'GEUMNAM-RO · JEONIL BUILDING', scene: 'chungjang', short: '금남로 · 전일빌딩' },
    hosijeong: { en: 'DONGMYEONG-DONG · HOSIJEONG' },
    '518-archives': { short: '5·18기록관' },
    zip: { short: '여행자의 집' },
  };
  const PRIORITY = ['canmore', 'chungu', 'palace-bakery', 'geumnam-park', '518-democracy-square', 'acc']; // 하단 메뉴·지역 선택 순서

  const stage = $('stage'), hero = $('hero'), heroImg = $('hero-img'), scene = $('scene'), sceneImg = $('scene-img'), panel = $('panel'), body = $('p-body');
  let ITEMS = [], ORDER = [], current = null, view = 'place', lastFocus = null, hideTimer = null, sceneTimer = null, currentScene = null;
  const revealed = new Set();

  const itemById = (id) => ITEMS.find((s) => s.id === id);
  const setState = (st) => { document.body.dataset.state = st; };
  const state = () => document.body.dataset.state;
  const toRad = (d) => (d * Math.PI) / 180;
  const haversine = (a, b) => { const R = 6371000, p1 = toRad(a.lat), p2 = toRad(b.lat), dp = p2 - p1, dl = toRad(b.lng - a.lng); const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const verifiedGeo = (g) => !!g && ['poi', 'building'].includes(g.precision) && Number.isFinite(g.lat) && Number.isFinite(g.lng);
  const shortAddr = (a) => String(a || '').replace(/^광주광역시\s*/, '');
  const slug = (s) => String(s).replace(/[^\w가-힣]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const distText = (m) => (m == null ? null : `직선 약 ${Math.round(m / 10) * 10} m`);

  /* ---------- 데이터 → 탐험 항목 ---------- */
  function buildModel(spots, places, stories) {
    const hub = spots.hubs.find((h) => h.id === HUB_ID);
    const placeById = Object.fromEntries(spots.places.map((p) => [p.id, p]));
    const dongById = Object.fromEntries(places.map((d) => [d.id, d]));
    const entries = []; places.forEach((d) => (d.memory_entries || []).forEach((e) => entries.push({ dong: d, e })));
    const firstWord = (name) => String(name || '').split(' ')[0];
    const matchEntry = (e, name) => { const k = firstWord(name); return k.length >= 2 && ((e.location || '').includes(k) || (e.alias || '').includes(k)); };
    const used = new Set();
    const items = [];
    const hubGeo = hub.geo;

    // 1) 거점 캔모아 — 장소 기억 원고(memory-stories) + 수첩 메모(places.json memories 중 캔모아 메모)
    const hubStory = stories[hub.id] ? [{ type: 'story', ...stories[hub.id] }] : [];
    const hubMemos = ((dongById[hub.sign_place] || {}).memories || []).filter((m) => (m.spot || '').includes(hub.short)).map((m) => ({ type: 'memo', ...m }));
    items.push({ id: hub.id, kind: 'hub', hubId: hub.id, name: hub.short, full: hub.name, address: hub.address, geo: hub.geo, dist: 0, group: 'hub', scene: PRESENT.canmore.scene, en: PRESENT.canmore.en, sub: PRESENT.canmore.sub, intro: hub.intro, introNote: hub.intro_note, records: [...hubStory, ...hubMemos], siteHash: `#spot/${hub.id}`, storyHash: stories[hub.id] ? `#spot/${hub.id}/story` : null, mapHash: hub.sign_place ? `#map/${hub.sign_place}` : null });

    // 2) 주변 장소 — spots.json 거점의 nearby 그대로(번호 유지). 거리로 가까운 장소/더 둘러볼 곳 구분
    const addNearby = (h, p, i) => {
      if (items.some((x) => x.id === p.id)) return;
      const pr = PRESENT[p.id] || {};
      const geo = pr.geo || p.geo || null;
      const dist = verifiedGeo(geo) ? haversine(hubGeo, geo) : null;
      const recs = entries.filter((x) => matchEntry(x.e, p.name)).map((x) => { used.add(x.e); return { type: 'entry', dongId: x.dong.id, dongName: x.dong.name, ...x.e }; });
      items.push({ id: p.id, kind: 'nearby', hubId: h.id, hubShort: h.short, no: i + 1, name: pr.short || p.name, full: p.name, address: p.address, geo, dist, group: dist != null && dist <= NEAR_M ? 'near' : 'far', scene: pr.scene || null, en: pr.en || (h.id === HUB_ID ? 'CHUNGJANG-RO · NEARBY' : `${h.short.toUpperCase()} · NEARBY`), note: pr.note, verify: pr.verify, sub: recs[0] ? recs[0].subtitle : null, records: recs, siteHash: `#spot/${h.id}/${p.id}`, mapHash: recs[0] ? `#map/${recs[0].dongId}` : null });
    };
    hub.nearby.forEach((id, i) => placeById[id] && addNearby(hub, placeById[id], i));

    // 3) 다른 탐험 거점(동명동 호시정)과 그 주변 — 확인된 데이터만, 모두 '더 둘러볼 곳'
    spots.hubs.filter((h) => h.id !== HUB_ID && h.explore).forEach((h) => {
      const pr = PRESENT[h.id] || {};
      items.push({ id: h.id, kind: 'hub2', hubId: h.id, name: h.short, full: h.name, address: h.address, geo: h.geo, dist: verifiedGeo(h.geo) ? haversine(hubGeo, h.geo) : null, group: 'far', scene: null, en: pr.en || '', intro: h.intro, introNote: h.intro_note, records: stories[h.id] ? [{ type: 'story', ...stories[h.id] }] : [], siteHash: `#spot/${h.id}`, mapHash: h.sign_place ? `#map/${h.sign_place}` : null });
      h.nearby.forEach((id, i) => placeById[id] && addNearby(h, placeById[id], i));
    });

    // 4) 장소 기억만 있는 곳(places.json memory_entries 중 spots 장소와 연결되지 않은 것): 충우 앞, 전일빌딩·금남로
    entries.filter((x) => !used.has(x.e)).forEach((x) => {
      const key = x.e.alias || x.e.location; const pr = PRESENT[`memory:${key}`] || {};
      const geo = pr.geo || null; const dist = verifiedGeo(geo) ? haversine(hubGeo, geo) : null;
      items.push({ id: pr.id || slug(key), kind: 'memory', name: pr.short || x.e.alias || x.e.location, full: x.e.location, address: x.e.location, geo, dist, group: dist != null && dist <= NEAR_M ? 'near' : 'far', scene: pr.scene || (/충장로/.test(x.e.location) ? 'chungjang' : null), en: pr.en || '', sub: x.e.subtitle || null, records: [{ type: 'entry', dongId: x.dong.id, dongName: x.dong.name, ...x.e }], mapHash: `#map/${x.dong.id}` });
    });

    // 5) 5·18민주광장 — 지명 수어 지점(민감 기록 열람 확인 유지). 기록은 없으면 '준비 중'
    const sq = dongById['518-democracy-square'];
    if (sq) { const pr = PRESENT[sq.id] || {}; const geo = pr.geo || null; items.push({ id: sq.id, kind: 'landmark', name: sq.name, full: sq.name, address: pr.address || '', geo, dist: verifiedGeo(geo) ? haversine(hubGeo, geo) : null, group: 'far', scene: null, en: pr.en || '', sensitive: !!sq.sensitive, notice: sq.sensitive_notice, records: [], mapHash: `#map/${sq.id}`, tags: sq.tags || [] }); }

    ITEMS = items;
    const byDist = (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9);
    ORDER = [items[0], ...items.filter((x) => x.group === 'near').sort(byDist), ...items.filter((x) => x.group === 'far').sort(byDist)];
  }

  /* ---------- 사진 ---------- */
  function applyPhoto(wrap, img, spec) {
    wrap.classList.remove('grade-bluehour', 'grade-night');
    wrap.classList.add(`grade-${spec.grade}`);
    img.style.setProperty('--focus', spec.focus || '50% 50%');
    img.style.setProperty('--focus-m', spec.focusM || spec.focus || '50% 50%');
    return new Promise((resolve) => { if (img.getAttribute('src') === spec.src && img.complete && img.naturalWidth) return resolve(true); img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = spec.src; });
  }
  async function loadHero() {
    const ok = await applyPhoto(hero, heroImg, HERO);
    if (!ok) { $('no-photo').hidden = false; $('credit').textContent = ''; return; }
    $('credit').textContent = HERO.credit;
    stage.style.setProperty('--gx', HERO.glow[0]); stage.style.setProperty('--gy', HERO.glow[1]);
    if (!REDUCED) hero.classList.add('drift');
  }
  function showScene(key) {
    const spec = SCENES[key];
    if (!spec) { hideScene(); return; }
    clearTimeout(sceneTimer);
    if (currentScene === key && scene.classList.contains('on')) { $('credit').textContent = spec.credit; return; }
    currentScene = key;
    stage.style.setProperty('--gx', spec.glow[0]); stage.style.setProperty('--gy', spec.glow[1]);
    applyPhoto(scene, sceneImg, spec).then((ok) => { if (!ok || currentScene !== key) return; sceneTimer = setTimeout(() => { scene.classList.add('on'); $('credit').textContent = spec.credit; }, REDUCED ? 0 : 450); });
  }
  function hideScene(credit) { clearTimeout(sceneTimer); currentScene = null; scene.classList.remove('on'); stage.style.setProperty('--gx', HERO.glow[0]); stage.style.setProperty('--gy', HERO.glow[1]); $('credit').textContent = credit || HERO.credit; }
  if (!REDUCED) { // 커서를 따라 아주 약하게 (사진을 찢지 않는 범위)
    let raf = null;
    stage.addEventListener('mousemove', (e) => {
      if (isSheet()) return;
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { $('hero-plx').style.transform = `translate(${(-x * 14).toFixed(1)}px, ${(-y * 8).toFixed(1)}px)`; $('scene-plx').style.transform = `translate(${(-x * 8).toFixed(1)}px, ${(-y * 5).toFixed(1)}px)`; });
    });
    stage.addEventListener('mouseleave', () => { $('hero-plx').style.transform = ''; $('scene-plx').style.transform = ''; });
  }

  /* ---------- 상태 전환 ---------- */
  function goIntro() {
    if (isPanelOpen()) closePanelOnly();
    current = null; view = 'place'; hideScene(); syncMenus(); setState('intro'); setHash(null);
    $('explore-btn').focus({ preventScroll: true });
  }
  function updateTitle(item) {
    const memo = item.records.find((r) => r.type === 'memo');
    let hand = '';
    if (memo) hand = `${esc(memo.hand)}<small>${esc([memo.spot, memo.by ? `${memo.by}님` : '', memo.years ? `광주 ${memo.years}년` : ''].filter(Boolean).join(' · '))}</small>`;
    else if (item.sub && item.id !== HUB_ID) hand = esc(item.sub);
    $('hand').innerHTML = hand;
    const t = $('place-title'); t.textContent = item.name;
    const n = item.name.length; t.style.fontSize = n <= 4 ? '' : n <= 7 ? '80px' : '58px';
    $('eyebrow').textContent = item.id === HUB_ID ? '탐험 거점 · 충장로' : item.dist != null ? `캔모아에서 ${distText(item.dist)}` : '지점 미확정 · 거리 표시 안 함';
  }
  function select(id, { instant = false } = {}) {
    const item = itemById(id);
    if (!item) return;
    toggleExplore(false);
    const wasOpen = isPanelOpen();
    current = id; view = 'place';
    setState('place');
    if (item.scene) showScene(item.scene); else hideScene(NO_SCENE_CREDIT);
    updateTitle(item);
    renderPanel(item);
    syncMenus();
    setHash(id);
    setTimeout(openPanel, wasOpen || instant || REDUCED ? 0 : 320);
  }
  function closePanelOnly() {
    stopVideo();
    panel.classList.remove('on', 'expanded');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { panel.hidden = true; }, REDUCED ? 0 : 700);
  }
  function step(dir) {
    const i = ORDER.findIndex((s) => s.id === current);
    select(ORDER[(i + dir + ORDER.length) % ORDER.length].id);
  }
  function setHash(v) {
    const next = v === null ? '' : `#place/${v}`;
    if (location.hash === next) return;
    history.replaceState(null, '', next || location.pathname + location.search);
  }
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#place\/([\w-]+)/);
    if (m && itemById(m[1])) { if (current !== m[1]) select(m[1]); }
    else if (state() !== 'intro') goIntro();
  });

  /* ---------- 패널 ---------- */
  const isPanelOpen = () => !panel.hidden && panel.classList.contains('on');
  function openPanel() {
    clearTimeout(hideTimer);
    if (isPanelOpen()) { panel.scrollTop = 0; return; }
    lastFocus = document.activeElement;
    panel.hidden = false; panel.classList.remove('expanded');
    void panel.offsetWidth;
    panel.classList.add('on'); panel.scrollTop = 0; panel.focus({ preventScroll: true });
  }
  function stopVideo() { const v = $('pv'); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } }
  const paras = (t) => String(t || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  function recordHtml(r, item) {
    if (r.type === 'story') {
      const em = new Set(r.emphasis || []);
      const ps = (r.paragraphs || []).map((p, i) => `<p class="para${em.has(i + 1) ? ' em' : ''}">${esc(p)}</p>`);
      const head = ps.slice(0, 3).join(''), rest = ps.slice(3).join('');
      return `<article class="story"><div class="who">장소 기억 원고 · ${esc(r.subtitle || '')}</div><h4>${esc(r.title || '')}</h4><div class="text">${head}${rest ? `<div class="rest" hidden>${rest}</div><button type="button" class="more" data-more>이야기 전체 읽기 (${ps.length}문단)</button>` : ''}</div>${item.storyHash ? `<p class="src"><a href="../../${esc(item.storyHash)}">본 사이트 장소 기억 전체 화면 →</a></p>` : ''}</article>`;
    }
    if (r.type === 'entry') {
      const n = r.narrator || {};
      const who = [n.name, n.identity, n.origin, n.years].filter(Boolean).join(' · ');
      const ps = paras(r.text).map((p) => `<p class="para${r.quote && p === r.quote ? ' em' : ''}">${esc(p)}</p>`);
      const head = ps.slice(0, 2).join(''), rest = ps.slice(2).join('');
      return `<article class="story"><div class="who">${esc(who || '인터뷰')}${r.location ? ` · ${esc(r.location)}` : ''}</div><h4>${esc(r.title || '')}</h4>${r.subtitle ? `<p class="sub">${esc(r.subtitle)}</p>` : ''}<div class="text">${head}${rest ? `<div class="rest" hidden>${rest}</div><button type="button" class="more" data-more>인터뷰 전체 읽기 (${ps.length}문단)</button>` : ''}</div>${r.quote ? `<blockquote>${esc(r.quote)}</blockquote>` : ''}<p class="src">출처: 본 사이트 지명 수어 「${esc(r.dongName || '')}」 장소 기억 (places.json memory_entries)</p></article>`;
    }
    if (r.type === 'memo') return `<div class="memo"><b>${esc(r.spot || '')}</b><p>${esc(r.hand || '')}</p><small>${esc([r.by ? `${r.by}님` : '', r.years ? `광주 ${r.years}년` : '', '팀 수첩 메모'].filter(Boolean).join(' · '))}</small></div>`;
    return '';
  }
  function geoLabel(item) {
    if (item.id === HUB_ID) return ['위치 확인됨', 'KAKAO MAP · OSM'];
    if (verifiedGeo(item.geo)) return ['위치 확인됨', item.geo.precision === 'poi' ? 'POI · 좌표 확인' : 'BUILDING · 좌표 확인'];
    return ['위치 확인 중', 'UNVERIFIED'];
  }
  function renderPanel(item) {
    stopVideo();
    $('p-en').textContent = item.en || '';
    $('p-name').textContent = item.name;
    $('p-sub').textContent = item.sub || (item.full && item.full !== item.name ? item.full : '') || shortAddr(item.address);
    $('p-home').hidden = item.id === HUB_ID;
    if (view === 'list') { renderList(item); return; }
    const gated = item.sensitive && !revealed.has(item.id);
    let html = '';
    if (gated) {
      html = `<div class="gate"><p>${esc(item.notice || '이 지점은 민감한 기록을 담고 있습니다. 계속 보시겠어요?')}</p><button type="button" id="p-reveal">기록 보기</button><button type="button" class="btn-ghost" id="p-gate-back">캔모아로 돌아가기</button></div>`;
    } else {
      const [g1, g2] = geoLabel(item);
      const d1 = item.id === HUB_ID ? '탐험 거점' : item.dist != null ? distText(item.dist) : '거리 표시 없음';
      const d2 = item.id === HUB_ID ? 'START · 충장로' : item.dist != null ? 'FROM CANMORE · 직선거리' : '지점 미확정';
      html += `<dl class="facts"><div><dt>${esc(d1)}</dt><dd>${esc(d2)}</dd></div><div><dt>${esc(g1)}</dt><dd>${esc(g2)}</dd></div></dl>`;
      if (item.address) html += `<p class="addr">${esc(shortAddr(item.address))}${item.kind === 'nearby' && item.no ? ` · ${esc(item.hubShort || '')} 주변 ${item.no}번` : ''}</p>`;
      if (item.intro) html += `<p class="intro-line">${esc(item.intro)}${item.introNote ? ` <small>(${esc(item.introNote)})</small>` : ''}</p>`;
      if (item.note) html += `<p class="note">${esc(item.note)}</p>`;
      if (item.verify) html += `<p class="verify">${esc(item.verify)}</p>`;
      html += `<p class="sec">농인의 장소 기억</p>`;
      html += item.records.length ? item.records.map((r) => recordHtml(r, item)).join('') : `<p class="pending">기록 준비 중 — 이 장소의 인터뷰 기록은 아직 없습니다. 확인된 기록이 들어오면 여기에 원문 그대로 채워집니다.</p>`;
      html += `<div class="actions"><button type="button" class="btn-primary" id="p-list">함께 둘러볼 장소 →</button>${item.id !== HUB_ID ? `<button type="button" class="btn-ghost" id="p-home2">캔모아로 돌아가기</button>` : ''}</div>`;
      const links = [];
      if (item.siteHash) links.push(`<a href="../../${esc(item.siteHash)}">본 사이트에서 이 장소 보기 →</a>`);
      if (item.mapHash) links.push(`<a href="../../${esc(item.mapHash)}">지명 수어 지도에서 보기 →</a>`);
      if (links.length) html += `<div class="links">${links.join('')}</div>`;
      const tags = [...new Set([...(item.tags || []), ...item.records.flatMap((r) => r.tags || [])])];
      if (tags.length) html += `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;
      if (!item.scene) html += `<p class="scene-note">${esc(NO_SCENE_CREDIT)}</p>`;
    }
    body.innerHTML = html;
    $('p-reveal')?.addEventListener('click', () => { revealed.add(item.id); renderPanel(item); });
    $('p-gate-back')?.addEventListener('click', () => select(HUB_ID));
    $('p-list')?.addEventListener('click', () => openList());
    $('p-home2')?.addEventListener('click', () => select(HUB_ID));
    body.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => { const rest = b.previousElementSibling; rest.hidden = false; b.remove(); }));
  }
  function openList() {
    if (!current) select(HUB_ID, { instant: true });
    view = 'list'; renderPanel(itemById(current)); panel.scrollTop = 0;
    if (isSheet()) { panel.classList.add('expanded'); $('sheet-handle').setAttribute('aria-expanded', 'true'); }
    body.querySelector('.row')?.focus({ preventScroll: true });
  }
  function closeList() { view = 'place'; renderPanel(itemById(current)); panel.scrollTop = 0; $('p-list')?.focus({ preventScroll: true }); }
  function rowHtml(x) {
    const meta = [x.id === HUB_ID ? '탐험 거점' : x.dist != null ? distText(x.dist) : '지점 미확정'];
    if (x.records.length) meta.push(`기억 ${x.records.length}`);
    if (x.sensitive) meta.push('열람 확인');
    const area = x.kind === 'hub2' ? `동명동 · 탐험 거점 · ${shortAddr(x.address).replace(/^동구\s*/, '')}` : x.hubId && x.hubId !== HUB_ID ? `동명동 · ${x.hubShort || ''} 거점 주변 · ${shortAddr(x.address).replace(/^동구\s*/, '')}` : shortAddr(x.address).replace(/^동구\s*/, '');
    return `<button type="button" class="row${x.id === current ? ' on' : ''}" data-spot="${esc(x.id)}" aria-pressed="${x.id === current}"><span class="row-name">${esc(x.name)}</span><span class="row-meta">${esc(meta.join(' · '))}</span><span class="row-area">${esc(area)}</span></button>`;
  }
  function renderList(item) {
    const near = ORDER.filter((x) => x.group === 'near'), far = ORDER.filter((x) => x.group === 'far');
    body.innerHTML = `<div class="list-head"><button type="button" class="btn-ghost" id="p-list-back">← 돌아가기</button><span>현재 장소: ${esc(item.name)}</span></div>
      <p class="sec">탐험 거점</p><div class="grp">${rowHtml(ORDER[0])}</div>
      <p class="sec">가까운 장소 <small>캔모아에서 직선 ${NEAR_M} m 이내 · 위치 확인된 곳</small></p><div class="grp">${near.map(rowHtml).join('')}</div>
      <p class="sec">더 둘러볼 곳 <small>충장로 바깥 · 거리순</small></p><div class="grp">${far.map(rowHtml).join('')}</div>
      <p class="list-note">거리는 좌표가 확인된 곳만 직선거리로 표시합니다. 도보 경로·소요 시간은 확인된 자료가 없어 표시하지 않습니다. 실제 위치는 각 장소의 '본 사이트에서 보기'에서 지도로 확인합니다.</p>`;
    $('p-list-back').addEventListener('click', closeList);
    body.querySelectorAll('.row').forEach((b) => b.addEventListener('click', () => select(b.dataset.spot)));
  }

  /* ---------- 메뉴 ---------- */
  function chipHtml(x) {
    const th = x.scene && SCENES[x.scene] && (x.id === HUB_ID || x.scene !== itemById(HUB_ID).scene) ? SCENES[x.scene].thumb : null; // 같은 거리 사진을 여러 칩에 반복하지 않는다
    return `<button type="button" class="spot-btn" data-spot="${esc(x.id)}" aria-pressed="false" title="${esc(x.full || x.name)}">${th ? `<span class="thumb"><img src="${esc(th)}" alt="" onerror="this.parentNode.className='thumb empty';this.parentNode.textContent=''"></span>` : `<span class="thumb empty">${x.id === HUB_ID ? '●' : ''}</span>`}${esc(x.name)}</button>`;
  }
  function buildMenus() {
    const pri = PRIORITY.map(itemById).filter(Boolean);
    $('spot-menu').innerHTML = pri.map(chipHtml).join('');
    $('explore-list').innerHTML = pri.map((x) => `<button type="button" class="em-item" data-spot="${esc(x.id)}" aria-pressed="false"><small>${esc(x.id === HUB_ID ? '거점' : x.dist != null ? distText(x.dist).replace('직선 약 ', '') : '—')}</small><span>${esc(x.name)}</span><em>${esc(x.records.length ? `기억 ${x.records.length}` : x.sensitive ? '열람 확인' : '기록 준비 중')}</em></button>`).join('') + `<button type="button" class="em-item em-all" id="em-all"><small>+</small><span>함께 둘러볼 장소 전체</span><em>${ITEMS.length}곳</em></button>`;
    document.querySelectorAll('[data-spot]').forEach((b) => b.addEventListener('click', () => select(b.dataset.spot)));
    $('em-all').addEventListener('click', () => { toggleExplore(false); openList(); });
  }
  function syncMenus() { document.querySelectorAll('[data-spot]').forEach((b) => { const on = b.dataset.spot === current; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
  function toggleExplore(force) {
    const menu = $('explore-menu'), btn = $('explore-btn');
    const open = force ?? menu.hidden;
    if (!open && menu.hidden) return;
    menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('on', open);
    if (open) (menu.querySelector('.em-item.on') || menu.querySelector('.em-item'))?.focus();
  }
  function bindUi() {
    $('cta').addEventListener('click', () => select(HUB_ID));
    $('brand').addEventListener('click', (e) => { e.preventDefault(); toggleExplore(false); goIntro(); });
    $('explore-btn').addEventListener('click', () => toggleExplore());
    $('explore-close').addEventListener('click', () => { toggleExplore(false); $('explore-btn').focus(); });
    document.addEventListener('pointerdown', (e) => { const m = $('explore-menu'); if (m.hidden) return; if (m.contains(e.target) || $('explore-btn').contains(e.target)) return; toggleExplore(false); });
    $('p-close').addEventListener('click', () => goIntro());
    $('p-home').addEventListener('click', () => select(HUB_ID));
    $('p-prev').addEventListener('click', () => step(-1));
    $('p-next').addEventListener('click', () => step(1));
    const handle = $('sheet-handle');
    const toggleSheet = (force) => { const on = panel.classList.toggle('expanded', force); handle.setAttribute('aria-expanded', String(on)); handle.setAttribute('aria-label', on ? '시트 접기' : '시트 펼치기'); };
    handle.addEventListener('click', () => toggleSheet());
    let dragY = null;
    handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; });
    window.addEventListener('pointerup', (e) => { if (dragY === null) return; const dy = e.clientY - dragY; dragY = null; if (dy < -40) toggleSheet(true); else if (dy > 40) toggleSheet(false); });
    window.addEventListener('pointercancel', () => { dragY = null; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!$('explore-menu').hidden) { toggleExplore(false); $('explore-btn').focus(); } else if (view === 'list' && isPanelOpen()) closeList(); else if (state() === 'place') goIntro(); return; }
      if (!isPanelOpen() || view === 'list' || (e.target instanceof Element && e.target.closest('input, textarea, video'))) return;
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
    });
  }

  /* ---------- 시작 ---------- */
  async function boot() {
    let spots = null, places = null, stories = null;
    try {
      [spots, places, stories] = await Promise.all(Object.values(SRC).map((u) => fetch(u).then((r) => (r.ok ? r.json() : null))));
    } catch (e) { /* 아래에서 안내 */ }
    if (!spots || !places || !stories) { $('no-data').hidden = false; return; }
    buildModel(spots, places, stories);
    buildMenus(); bindUi();
    await loadHero();
    const m = location.hash.match(/^#place\/([\w-]+)/);
    if (m && itemById(m[1])) select(m[1], { instant: true });
    else if (location.hash) setHash(null);
  }
  window.__cine = { select, goHome: () => select(HUB_ID), goIntro, openList, closeList, step, items: () => ITEMS, order: () => ORDER };
  boot();
})();
