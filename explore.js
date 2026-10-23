/* ===== 손으로 부르는 광주 — 첫 화면 · 거리 보기 (explore.html) =====
   상태: intro(첫 화면: 광주 동구 야경 + 소개 + 「광주 탐험하기」 → index.html#spots 실제 지도로) · place(장소 화면: 거리 사진 액자 또는
   캔모아 공간 탐험 + 오른쪽 황금 패널). 주소: (없음)=첫 화면, #place/<id>=장소, #place/<id>/story=장소 기억 편지. 옛 주소 #explore는 지도로 보낸다.
   장소 화면의 ✕·Esc는 지도(index.html#spots)로 돌아간다. 데이터는 본 사이트 원본(data/*.json)을 그대로 읽는다. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('noanim');
  if (q.has('noanim')) document.documentElement.classList.add('noanim'); // story.js(편지 화면)도 같은 스위치를 본다
  const isSheet = () => matchMedia('(max-width: 767px)').matches;

  const DATA_V = '20261104';
  const SRC = { spots: `data/spots.json?v=${DATA_V}`, places: `data/places.json?v=${DATA_V}`, stories: `data/memory-stories.json?v=${DATA_V}` };
  const SITE = 'index.html';  // 본 사이트(지명 수어 지도·장소 둘러보기·아카이브)
  const HUB_ID = 'canmore';   // 탐험 거점
  const NEAR_M = 450;         // '가까운 장소' 기준: 거점에서 직선 450 m 이내 (실제 위치가 확인된 곳만)

  // 배경·장면 사진 (assets/explore/, 사용 허락을 받은 사진)
  // 배경: 광주 동구 야경 연출 이미지(1625×968). 첫 화면과 첫 지도 화면이 같은 배경을 쓴다(색보정 없음). 종전 항공사진은 assets/explore/overlook-mountains.jpg에 그대로 둔다
  const HERO = { src: 'assets/explore/night-donggu.webp', grade: 'none', focus: '50% 50%', focusM: '46% 55%', glow: ['50%', '62%'], credit: '' }; // 배경 설명(연출 이미지·핀 위치)은 사이트가 아니라 발표 자료에서 밝힌다 (사용자 결정 2026-10-21)
  // 장소 화면 하단 썸네일 목록(순서 그대로). fx·fy는 사진 없는 장소의 썸네일을 야경 이미지에서 잘라낼 때 쓰는 비율 좌표일 뿐 지리 좌표가 아니다
  const MAP = {
    places: [
      { id: 'canmore', label: '충장로', fx: 0.248, fy: 0.472, thumb: 'assets/explore/canmore/swings-thumb.jpg' },
      { id: 'geumnam-street', label: '금남로', fx: 0.328, fy: 0.617 },
      { id: '518-democracy-square', label: '5·18민주광장', fx: 0.506, fy: 0.609 },
      { id: 'acc', label: 'ACC', fx: 0.670, fy: 0.531, thumb: 'assets/explore/acc-night.jpg' },
      { id: 'geumnam-park', label: '금남로공원', fx: 0.669, fy: 0.758 },
    ],
    thumbZoom: 7, imgRatio: 968 / 1625,
  };
  const SCENES = {
    chungjang: { src: 'assets/explore/chungjang-night.jpg', grade: 'night', focus: '50% 55%', focusM: '58% 50%', glow: ['46%', '58%'], credit: '장면 사진: 충장로 거리 풍경 — 선택한 장소 자체의 사진이 아니라 충장로 거리 사진입니다 (사용 허락을 받은 사진)', thumb: 'assets/explore/chungjang-night.jpg' },
    acc: { src: 'assets/explore/acc-night.jpg', grade: 'night', focus: '50% 62%', focusM: '46% 60%', glow: ['50%', '58%'], credit: '장면 사진: 국립아시아문화전당 일대, 해질녘 (사용 허락을 받은 사진)', thumb: 'assets/explore/acc-night.jpg' },
  };
  const NO_SCENE_CREDIT = '배경: 광주 도심 조망 — 이 장소의 사진은 아직 없어 도시 풍경을 배경으로 둡니다';
  // 캔모아 공간 탐험: 실내 사진 1(그네) → 그네 핫스팟 → 사진 2(마주 보는 그네 자리) + 장소 기억. 사진은 assets/explore/canmore/
  const CX = {
    img1: 'assets/explore/canmore/swings.jpg', img2: 'assets/explore/canmore/window.jpg',
    sign: 'assets/explore/canmore/sign.jpg', thumb: 'assets/explore/canmore/swings-thumb.jpg',
    pos1: [0.5, 0.7], pos2: [0.5, 0.5], // object-position(가로, 세로): 그네가 아래쪽이라 세로로 잘릴 때 아래를 남긴다
    hotspots: [ // 사진 1 원본(1179×1389) 기준 그네 좌석 중심 — 가로 비율, 세로 비율 (사진 분석으로 확인)
      { fx: 0.28, fy: 0.83, label: '앞쪽 그네' }, { fx: 0.59, fy: 0.575, label: '가운데 그네' }, { fx: 0.755, fy: 0.46, label: '안쪽 그네' },
    ],
    credit: '장면 사진: 캔모아 충장로점 실내와 간판 — 프로젝트 제공 사진',
    T_ZOOM: REDUCED ? 0 : 900, // 그네 쪽으로 확대 + 사진 2 크로스페이드 (explore.css 전환 시간과 맞춘다)
  };

  // 표시용 보조 정보(기록이 아님): 영문 표기, 어느 장면 사진을 쓰는지, 데이터 파일에 좌표가 없는 곳의 확인된 좌표(출처 명시), 제목 줄임.
  const PRESENT = {
    canmore: { en: 'CHUNGJANG-RO · CANMORE', scene: 'chungjang', sub: '충장로, 수어로 마음껏 이야기하던 곳' },
    'memory:충우 앞': { id: 'chungu', en: 'CHUNGJANG-RO · GWANGJU POST OFFICE', scene: 'chungjang', geo: { lat: 35.1475911, lng: 126.9172187, precision: 'poi', source: 'OSM node/368876980 amenity=post_office 광주우체국(충장로2가) — 충장로 우체국, 이른바 충우' } },
    'palace-bakery': { en: 'CHUNGJANG-RO · GUNGJEON BAKERY', scene: 'chungjang', short: '궁전제과' },
    'geumnam-park': { en: 'GEUMNAM-RO 3GA · PARK', note: "빛으로 만든 나비 미디어아트 '금남나비정원'이 있는 공원으로 소개됩니다(여행 정보 사이트 기준). 야경 장면은 사진이 준비되면 넣습니다.", verify: '좌표 검증: spots.json 지점과 OSM 공원 폴리곤(way/452261523) 중심이 25 m 차이' },
    '518-democracy-square': { en: '5·18 DEMOCRACY SQUARE', address: '광주광역시 동구 문화전당로 38 (광산동) · 옛 전남도청 앞 광장' },
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
  const siteLink = (hash) => `${SITE}${hash}`;

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
    items.push({ id: hub.id, kind: 'hub', hubId: hub.id, name: hub.short, full: hub.name, address: hub.address, geo: hub.geo, dist: 0, group: 'hub', scene: PRESENT.canmore.scene, en: PRESENT.canmore.en, sub: PRESENT.canmore.sub, intro: hub.intro, introNote: hub.intro_note, records: [...hubStory, ...hubMemos], thumb: CX.thumb, siteHash: `#spot/${hub.id}`, storyHash: stories[hub.id] ? `#spot/${hub.id}/story` : null, mapHash: hub.sign_place ? `#map/${hub.sign_place}` : null });

    // 2) 주변 장소 — spots.json 거점의 nearby 그대로(번호 유지). 거리로 가까운 장소/더 둘러볼 곳 구분
    const addNearby = (h, p, i) => {
      if (items.some((x) => x.id === p.id)) return;
      const pr = PRESENT[p.id] || {};
      const geo = pr.geo || p.geo || null;
      const dist = verifiedGeo(geo) ? haversine(hubGeo, geo) : null;
      const recs = entries.filter((x) => matchEntry(x.e, p.name)).map((x) => { used.add(x.e); return { type: 'entry', dongId: x.dong.id, dongName: x.dong.name, ...x.e }; });
      items.push({ id: p.id, kind: 'nearby', hubId: h.id, hubShort: h.short, no: i + 1, pick: !!p.deaf_pick, name: pr.short || p.name, full: p.name, address: p.address, geo, dist, group: dist != null && dist <= NEAR_M ? 'near' : 'far', scene: pr.scene || null, en: pr.en || (h.id === HUB_ID ? 'CHUNGJANG-RO · NEARBY' : `${h.short.toUpperCase()} · NEARBY`), note: pr.note, verify: pr.verify, sub: recs[0] ? recs[0].subtitle : null, records: recs, siteHash: `#spot/${h.id}/${p.id}`, mapHash: recs[0] ? `#map/${recs[0].dongId}` : null });
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

    // 5) 5·18민주광장 — 지명 수어 지점(민감 기록 열람 확인 유지). 좌표는 places.json(실제 광장 중심으로 보정됨). 기록이 없으면 '준비 중'
    const sq = dongById['518-democracy-square'];
    if (sq) { const pr = PRESENT[sq.id] || {}; const geo = Number.isFinite(sq.lat) && Number.isFinite(sq.lng) ? { lat: sq.lat, lng: sq.lng, precision: 'poi', source: 'places.json (OSM 광장 중심 기준)' } : null; items.push({ id: sq.id, kind: 'landmark', name: sq.name, full: sq.name, address: pr.address || '', geo, dist: verifiedGeo(geo) ? haversine(hubGeo, geo) : null, group: 'far', scene: null, en: pr.en || '', sensitive: !!sq.sensitive, notice: sq.sensitive_notice, records: [], mapHash: `#map/${sq.id}`, tags: sq.tags || [] }); }

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
  function showScene(key, { delay } = {}) {
    const spec = SCENES[key];
    if (!spec) { hideScene(); return; }
    clearTimeout(sceneTimer);
    if (currentScene === key && scene.classList.contains('on')) { $('credit').textContent = spec.credit; return; }
    if (currentScene && currentScene !== key) scene.classList.remove('on'); // 다른 거리 사진으로: 액자를 잠깐 비웠다가 새 사진으로
    currentScene = key;
    stage.style.setProperty('--gx', spec.glow[0]); stage.style.setProperty('--gy', spec.glow[1]);
    applyPhoto(scene, sceneImg, spec).then((ok) => {
      if (!ok || currentScene !== key) return;
      if (sceneImg.naturalWidth && sceneImg.naturalHeight) stage.style.setProperty('--ar', (sceneImg.naturalWidth / sceneImg.naturalHeight).toFixed(4)); // 액자는 원본 비율 그대로
      sceneTimer = setTimeout(() => { scene.classList.add('on'); $('credit').textContent = spec.credit; }, REDUCED ? 0 : (delay ?? 450));
    });
  }
  function hideScene(credit) { clearTimeout(sceneTimer); currentScene = null; scene.classList.remove('on'); stage.style.setProperty('--gx', HERO.glow[0]); stage.style.setProperty('--gy', HERO.glow[1]); $('credit').textContent = credit || HERO.credit; }
  if (!REDUCED) { // 커서를 따라 아주 약하게 (사진을 찢지 않는 범위)
    let raf = null;
    stage.addEventListener('mousemove', (e) => {
      if (isSheet()) return;
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { $('hero-plx').style.transform = `translate(${(-x * 14).toFixed(1)}px, ${(-y * 8).toFixed(1)}px)`; }); // 액자 속 거리 사진은 움직이지 않는다
    });
    stage.addEventListener('mouseleave', () => { $('hero-plx').style.transform = ''; });
  }

  /* ---------- 장소 기억 편지 화면 (story.js 재사용): 장소 화면 위에 겹쳐 열고, 닫으면 그 장소 화면으로 그대로 돌아온다 ---------- */
  const letterOpen = () => typeof storyIsOpen === 'function' && storyIsOpen();
  const ro = (name) => { const c = String(name || '').slice(-1).charCodeAt(0); if (!(c >= 0xac00 && c <= 0xd7a3)) return '로'; const jong = (c - 0xac00) % 28; return jong === 0 || jong === 8 ? '로' : '으로'; }; // 받침 없음·ㄹ → 로, 그 밖 → 으로
  function openLetter(id, trigger, { fromHash = false } = {}) {
    if (typeof openStory !== 'function' || typeof hasStory !== 'function' || !hasStory(id)) return;
    const it = itemById(id); const back = document.querySelector('#story .story-return');
    if (back) back.textContent = `${it ? it.name : '장소'}${ro(it ? it.name : '장소')} 돌아가기`;
    openStory(id, { trigger: trigger || null, fromHash });
  }

  /* ---------- 상태 전환 ---------- */
  function goIntro() {
    if (isPanelOpen()) closePanelOnly();
    current = null; view = 'place'; cxLeave(); hideScene(); $('scene-none').hidden = true; syncMenus();
    if (!REDUCED) hero.classList.add('drift');
    setState('intro'); setHash(null);
    $('explore-btn').focus({ preventScroll: true });
  }
  // 충장로 거리(탐험 시작 화면): 어두워진 도심 사진 위에 거리 사진 액자 + 「충장로」 + 장소 기억 원문 한 문단 + 하단 장소 칩
  // 지도로: 탐험의 실제 지도(index.html#spots, 캔모아 중심). 첫 화면의 「광주 탐험하기」, 장소 패널의 ✕, Esc가 모두 여기로 간다
  function goMap({ replace = false } = {}) { const url = `${SITE}#spots`; if (replace) location.replace(url); else location.assign(url); }
  // 탐험 보기 방식 전환: '위치 보기'는 본 사이트 지도에서 같은 장소를 연다 (장소 지도에 없는 곳은 지명 수어 지점 → 없으면 거점 전체)
  function syncToggle(item) { $('vt-map').href = siteLink(item && item.siteHash ? item.siteHash : '#spots'); } // 장소 지도에 없는 곳은 거점 전체로
  // 손글씨 한 줄: 한 글자씩(스태거) 나타난다. 길면 글자당 간격을 줄여 전체 2초 안팎에 끝낸다 (모션 줄이기: CSS에서 즉시 표시)
  function handHtml(text, small) {
    const chars = [...String(text || '')]; const step = Math.min(0.2, 2.0 / Math.max(chars.length, 1));
    return chars.map((c, i) => `<span class="ch" style="--d:${(i * step).toFixed(2)}s">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('') + (small ? `<small style="--d:${(chars.length * step + 0.2).toFixed(2)}s">${small}</small>` : '');
  }
  function updateTitle(item) {
    const memo = item.records.find((r) => r.type === 'memo');
    let hand = '';
    if (memo) hand = handHtml(memo.hand, esc([memo.spot, memo.by ? `${memo.by}님` : '', memo.years ? `광주 ${memo.years}년` : ''].filter(Boolean).join(' · ')));
    else if (item.sub && item.id !== HUB_ID) hand = esc(item.sub);
    $('hand').innerHTML = hand;
    const badge = $('title-badge'); if (item.id === HUB_ID) { if (badge.getAttribute('src') !== CX.sign) badge.src = CX.sign; badge.hidden = false; } else badge.hidden = true;
    const t = $('place-title'); t.textContent = item.name;
    const n = item.name.length; t.style.fontSize = n <= 4 ? '' : n <= 7 ? '80px' : '58px';
    $('eyebrow').textContent = item.id === HUB_ID ? '탐험 거점 · 충장로' : item.dist != null ? `캔모아에서 ${distText(item.dist)}` : '지점 미확정 · 거리 표시 안 함';
  }
  function select(id, { instant = false, fromHash = false } = {}) {
    const item = itemById(id);
    if (!item) return;
    toggleExplore(false);
    const wasOpen = isPanelOpen();
    current = id; view = 'place';
    hero.classList.remove('drift');
    setState('place');
    if (item.id === HUB_ID) cxEnter();
    else { cxLeave(); if (item.scene) { showScene(item.scene, { delay: instant || fromHash ? 0 : undefined }); $('scene-none').hidden = true; } else { hideScene(NO_SCENE_CREDIT); $('scene-none').hidden = false; } }
    updateTitle(item);
    renderPanel(item);
    syncMenus();
    setHash(id, { push: !fromHash }); // 장소 선택은 앞으로 가는 이동: 뒤로 가기로 이전 장소가 복원된다
    syncToggle(item);
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
  function setHash(v, { push = false } = {}) {
    const next = v === null ? '' : `#place/${v}`;
    if (location.hash === next) return;
    const url = next || location.pathname + location.search;
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
  }
  // 주소가 바뀌면(뒤로·앞으로 가기, 상단 '탐험' 링크) 그 화면으로. 전환 연출 없이 복원한다
  window.addEventListener('hashchange', () => {
    const ms = location.hash.match(/^#place\/([\w-]+)\/story$/);
    if (ms && itemById(ms[1])) { // 편지 화면 주소(앞으로 가기·직접 입력): 장소를 열고 그 위에 편지
      if (current !== ms[1] || state() !== 'place') select(ms[1], { fromHash: true });
      if (!letterOpen()) openLetter(ms[1], null, { fromHash: true });
      return;
    }
    if (letterOpen()) closeStory({ fromHistory: true }); // 편지가 열린 채 뒤로 가기 → 편지만 닫히고 장소 화면은 그대로
    const m = location.hash.match(/^#place\/([\w-]+)/);
    if (m && itemById(m[1])) { if (current !== m[1] || state() !== 'place') select(m[1], { fromHash: true }); }
    else if (location.hash === '#explore') goMap({ replace: true }); // 옛 주소(야경 지도 화면)는 실제 지도로
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
      return `<article class="story"><div class="who">장소 기억 원고 · ${esc(r.subtitle || '')}</div><h4>${esc(r.title || '')}</h4><div class="text">${head}${rest ? `<div class="rest" hidden>${rest}</div><button type="button" class="more" data-more>이야기 전체 읽기 (${ps.length}문단)</button>` : ''}</div>${item.storyHash ? `<p class="src"><button type="button" class="linkish" data-story="${esc(item.id)}">장소 기억 전체 화면으로 →</button></p>` : ''}</article>`;
    }
    if (r.type === 'entry') {
      const n = r.narrator || {};
      const who = [n.name, n.identity, n.origin, n.years].filter(Boolean).join(' · ');
      const ps = paras(r.text).map((p) => `<p class="para${r.quote && p === r.quote ? ' em' : ''}">${esc(p)}</p>`);
      const head = ps.slice(0, 2).join(''), rest = ps.slice(2).join('');
      return `<article class="story"><div class="who">${esc(who || '인터뷰')}${r.location ? ` · ${esc(r.location)}` : ''}</div><h4>${esc(r.title || '')}</h4>${r.subtitle ? `<p class="sub">${esc(r.subtitle)}</p>` : ''}<div class="text">${head}${rest ? `<div class="rest" hidden>${rest}</div><button type="button" class="more" data-more>인터뷰 전체 읽기 (${ps.length}문단)</button>` : ''}</div>${r.quote ? `<blockquote>${esc(r.quote)}</blockquote>` : ''}<p class="src">출처: 지명 수어 「${esc(r.dongName || '')}」 장소 기억</p></article>`;
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
      // 농인의 기억이 먼저, 장소 정보(거리·위치 확인·주소)는 그 아래
      if (item.intro) html += `<p class="intro-line">${esc(item.intro)}${item.introNote ? ` <small>(${esc(item.introNote)})</small>` : ''}</p>`;
      if (item.pick) html += `<p class="pick-badge">농인 추천 장소</p>`;
      html += `<p class="sec">농인의 장소 기억</p>`;
      html += item.records.length ? item.records.map((r) => recordHtml(r, item)).join('') : `<p class="pending">기록 준비 중 — 이 장소의 인터뷰 기록은 아직 없습니다. 확인된 기록이 들어오면 여기에 원문 그대로 채워집니다.</p>`;
      html += `<div class="actions"><button type="button" class="btn-primary" id="p-list">함께 둘러볼 장소 →</button>${item.id !== HUB_ID ? `<button type="button" class="btn-ghost" id="p-home2">캔모아로 돌아가기</button>` : ''}</div>`;
      html += `<p class="sec">장소 정보</p>`;
      html += `<dl class="facts"><div><dt>${esc(d1)}</dt><dd>${esc(d2)}</dd></div><div><dt>${esc(g1)}</dt><dd>${esc(g2)}</dd></div></dl>`;
      if (item.address) html += `<p class="addr">${esc(shortAddr(item.address))}${item.kind === 'nearby' && item.no ? ` · ${esc(item.hubShort || '')} 주변 ${item.no}번` : ''}</p>`;
      if (item.note) html += `<p class="note">${esc(item.note)}</p>`;
      if (item.verify) html += `<p class="verify">${esc(item.verify)}</p>`;
      const links = [];
      if (item.siteHash) links.push(`<a href="${esc(siteLink(item.siteHash))}">지도에서 이 장소 보기 →</a>`); // 지명 수어 지도 링크는 2026-10-22에 뺐다(메뉴에서 숨김)
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
    body.querySelectorAll('[data-story]').forEach((b) => b.addEventListener('click', () => openLetter(b.dataset.story, b)));
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
    if (x.pick) meta.unshift('농인 추천');
    if (x.records.length) meta.push(`기억 ${x.records.length}`);
    if (x.sensitive) meta.push('열람 확인');
    const addr = shortAddr(x.address).replace(/^동구\s*/, '');
    const area = x.kind === 'hub2' ? `동명동 · 탐험 거점 · ${addr}` : x.hubId && x.hubId !== HUB_ID ? `동명동 · ${x.hubShort || ''} 거점 주변 · ${addr}` : addr;
    return `<button type="button" class="row${x.id === current ? ' on' : ''}${x.pick ? ' pick' : ''}" data-spot="${esc(x.id)}" aria-pressed="${x.id === current}"><span class="row-name">${esc(x.name)}</span><span class="row-meta">${esc(meta.join(' · '))}</span><span class="row-area">${esc(area)}</span></button>`;
  }
  function renderList(item) {
    const near = ORDER.filter((x) => x.group === 'near'), far = ORDER.filter((x) => x.group === 'far');
    body.innerHTML = `<div class="list-head"><button type="button" class="btn-ghost" id="p-list-back">← 돌아가기</button><span>현재 장소: ${esc(item.name)}</span></div>
      <p class="sec">탐험 거점</p><div class="grp">${rowHtml(ORDER[0])}</div>
      <p class="sec">가까운 장소 <small>캔모아에서 직선 ${NEAR_M} m 이내 · 위치 확인된 곳</small></p><div class="grp">${near.map(rowHtml).join('')}</div>
      <p class="sec">더 둘러볼 곳 <small>충장로 바깥 · 거리순</small></p><div class="grp">${far.map(rowHtml).join('')}</div>
      <p class="list-note">거리는 좌표가 확인된 곳만 직선거리로 표시합니다. 도보 경로·소요 시간은 확인된 자료가 없어 표시하지 않습니다. 실제 위치는 각 장소의 '지도에서 이 장소 보기'에서 확인합니다.</p>`;
    $('p-list-back').addEventListener('click', closeList);
    body.querySelectorAll('.row').forEach((b) => b.addEventListener('click', () => select(b.dataset.spot)));
  }

  /* ---------- 캔모아 공간 탐험 ---------- */
  const cx = { on: false, state: 's1', timer: null, hs: [] };
  const cxEl = $('cx'), cxImg1 = $('cx-img1'), cxImg2 = $('cx-img2');
  // object-fit: cover로 그려진 사진의 실제 영역. 핫스팟은 원본 비율 좌표를 이 영역에 투영해 두므로 액자 크기·잘림이 바뀌어도 그네 위에 남는다
  function cxFitRect(img, pos) {
    const box = cxEl.getBoundingClientRect(); const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh || !box.width) return null;
    const sc = Math.max(box.width / nw, box.height / nh); const w = nw * sc, h = nh * sc;
    return { x: (box.width - w) * pos[0], y: (box.height - h) * pos[1], w, h };
  }
  function cxLayout() {
    const r = cxFitRect(cxImg1, CX.pos1); if (!r) return;
    cx.hs.forEach((b, i) => { const h = CX.hotspots[i]; b.style.left = `${(r.x + h.fx * r.w).toFixed(1)}px`; b.style.top = `${(r.y + h.fy * r.h).toFixed(1)}px`; });
    cxPlaceStory();
  }
  function cxPlaceStory() { // 이야기 패널: 데스크톱은 제목 열의 제목 아래. 모바일이거나 거기에 자리가 모자라 하단 칩과 겹치면 사진 아래쪽 겹침 모드
    const st = $('cx-story');
    if (isSheet()) { st.style.top = ''; cxEl.classList.add('story-over'); return; }
    cxEl.classList.remove('story-over');
    const t = $('title-block').getBoundingClientRect(), c = cxEl.getBoundingClientRect();
    if (!t.height || !c.height) return;
    const top = Math.round(t.bottom + 18 - c.top); st.style.top = `${top}px`;
    const limit = $('spot-menu').getBoundingClientRect().top - 8;
    if (!st.hidden && c.top + top + st.getBoundingClientRect().height > limit) cxEl.classList.add('story-over');
  }
  function cxBuild() {
    const wrap = $('cx-hotspots');
    wrap.innerHTML = CX.hotspots.map((h, i) => `<button type="button" class="cx-hs" data-i="${i}" aria-label="그네에 남은 기억 보기 — ${esc(h.label)}"><span class="cx-hs-ring" aria-hidden="true"></span><span class="cx-hs-dot" aria-hidden="true"></span><span class="cx-hs-tip" aria-hidden="true">그네에 남은 기억</span></button>`).join('');
    cx.hs = [...wrap.querySelectorAll('.cx-hs')];
    cx.hs.forEach((b) => b.addEventListener('click', () => cxGo(Number(b.dataset.i))));
    cxImg1.addEventListener('load', cxLayout);
    window.addEventListener('resize', () => { if (cx.on) cxLayout(); });
    $('cx-back').addEventListener('click', () => cxReset({ focus: true }));
    $('cx-more').addEventListener('click', cxReadMore);
    $('cx-story-link').addEventListener('click', (e) => openLetter(HUB_ID, e.currentTarget));
  }
  function cxSetState(st) { cx.state = st; cxEl.dataset.cx = st; cx.hs.forEach((b) => { b.disabled = st !== 's1'; b.tabIndex = st === 's1' ? 0 : -1; }); }
  function cxReset({ focus = false } = {}) {
    clearTimeout(cx.timer);
    cxImg1.style.transformOrigin = '';
    cx.hs.forEach((b) => b.classList.remove('hit'));
    $('cx-story').hidden = true;
    cxSetState('s1');
    $('cx-sr').textContent = '';
    if (focus) cx.hs[0]?.focus({ preventScroll: true });
  }
  function cxEnter() { // 캔모아 선택: 거리 사진 액자 대신 실내 사진 1에서 시작한다 (다시 골라도 처음 장면으로)
    hideScene(CX.credit); $('scene-none').hidden = true;
    if (cxImg1.getAttribute('src') !== CX.img1) cxImg1.src = CX.img1;
    if (cxImg2.getAttribute('src') !== CX.img2) cxImg2.src = CX.img2; // 미리 읽어 전환 때 깜빡이지 않게
    cxImg1.style.objectPosition = `${CX.pos1[0] * 100}% ${CX.pos1[1] * 100}%`;
    cxImg2.style.objectPosition = `${CX.pos2[0] * 100}% ${CX.pos2[1] * 100}%`;
    cxEl.hidden = false; cx.on = true; document.body.classList.add('cx-on');
    cxReset();
    requestAnimationFrame(cxLayout);
  }
  function cxLeave() { if (!cx.on) return; cx.on = false; cxEl.hidden = true; document.body.classList.remove('cx-on'); cxReset(); }
  function cxGo(i) { // 그네를 누르면: 그 그네 쪽으로 살짝 확대하며 사진 2로 크로스페이드, 끝나면 장소 기억 패널
    if (!cx.on || cx.state !== 's1') return; // 전환 중 반복 클릭 무시
    const b = cx.hs[i];
    if (b) { cxImg1.style.transformOrigin = `${b.style.left} ${b.style.top}`; b.classList.add('hit'); }
    cxSetState('zoom');
    $('cx-sr').textContent = '창가 자리로 들어갑니다.';
    cx.timer = setTimeout(() => {
      cxSetState('s2');
      $('cx-story').hidden = false;
      cxPlaceStory();
      $('cx-sr').textContent = '마주 보는 그네 자리. 장소 기억이 열렸습니다.';
      $('cx-story').focus({ preventScroll: true });
    }, CX.T_ZOOM);
  }
  function cxReadMore() { // 오른쪽 황금 패널의 캔모아 인터뷰 본문으로 (모바일은 시트를 펼친다)
    if (view === 'list') closeList();
    if (!isPanelOpen()) openPanel();
    const art = body.querySelector('.story'); if (!art) return;
    art.querySelector('[data-more]')?.click();
    if (isSheet()) { panel.classList.add('expanded'); $('sheet-handle').setAttribute('aria-expanded', 'true'); }
    art.setAttribute('tabindex', '-1');
    art.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    art.focus({ preventScroll: true });
  }

  function thumbStyle(p) { // 썸네일: 장소 사진이 있으면 그 사진, 없으면 야경 이미지에서 핀 주변을 잘라서 (별도 사진을 만들지 않는다)
    if (p.thumb) return `background-image:url('${esc(p.thumb)}')`;
    const z = MAP.thumbZoom, hz = z * MAP.imgRatio; // 배경 너비 = 썸네일의 z배, 높이는 이미지 비율대로
    const bx = ((p.fx * z - 0.5) / (z - 1)) * 100, by = ((p.fy * hz - 0.5) / (hz - 1)) * 100;
    return `background-image:url('${esc(HERO.src)}');background-size:${z * 100}% auto;background-position:${bx.toFixed(1)}% ${by.toFixed(1)}%`;
  }

  /* ---------- 메뉴 ---------- */
  function chipHtml(p) {
    const x = itemById(p.id); if (!x) return '';
    const pending = !x.records.length && !x.sensitive; // 기록이 아직 없는 곳은 활성 기능처럼 보이지 않게
    const tag = x.pick ? '<small class="chip-tag pick">농인 추천</small>' : pending ? '<small class="chip-tag">준비 중</small>' : x.sensitive ? '<small class="chip-tag">열람 확인</small>' : '';
    return `<button type="button" class="spot-btn${pending ? ' pending' : ''}" data-spot="${esc(x.id)}" aria-pressed="false" title="${esc(x.full || x.name)}${pending ? ' · 기록 준비 중' : ''}"><span class="thumb" style="${thumbStyle(p)}"></span><span class="spot-name">${esc(p.label)}</span>${tag}</button>`;
  }
  function buildMenus() {
    const pri = PRIORITY.map(itemById).filter(Boolean);
    $('spot-menu').innerHTML = MAP.places.map(chipHtml).join('');
    $('explore-list').innerHTML = pri.map((x) => `<button type="button" class="em-item${!x.records.length && !x.sensitive ? ' pending' : ''}" data-spot="${esc(x.id)}" aria-pressed="false"><small>${esc(x.id === HUB_ID ? '거점' : x.dist != null ? distText(x.dist).replace('직선 약 ', '') : '—')}</small><span>${esc(x.name)}</span><em>${esc(x.records.length ? `기억 ${x.records.length}` : x.sensitive ? '열람 확인' : '기록 준비 중')}</em></button>`).join('') + `<button type="button" class="em-item em-all" id="em-all"><small>+</small><span>함께 둘러볼 장소 전체</span><em>${ITEMS.length}곳</em></button>`;
    document.querySelectorAll('[data-spot]').forEach((b) => b.addEventListener('click', () => select(b.dataset.spot)));
    $('em-all').addEventListener('click', () => { toggleExplore(false); openList(); });
  }
  function syncMenus() { document.querySelectorAll('[data-spot]').forEach((b) => { const on = b.dataset.spot === current; b.classList.toggle('on', on); if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(on)); }); }
  function toggleExplore(force) {
    const menu = $('explore-menu'), btn = $('explore-btn');
    const open = force ?? menu.hidden;
    if (!open && menu.hidden) return;
    menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('on', open);
    if (open) (menu.querySelector('.em-item.on') || menu.querySelector('.em-item'))?.focus();
  }
  function bindUi() {
    $('cta').addEventListener('click', () => goMap()); // 첫 화면 → 실제 지도(캔모아 중심)
    $('brand').addEventListener('click', (e) => { e.preventDefault(); toggleExplore(false); goIntro(); });
    $('explore-btn').addEventListener('click', () => toggleExplore());
    $('explore-close').addEventListener('click', () => { toggleExplore(false); $('explore-btn').focus(); });
    document.addEventListener('pointerdown', (e) => { const m = $('explore-menu'); if (m.hidden) return; if (m.contains(e.target) || $('explore-btn').contains(e.target)) return; toggleExplore(false); });
    $('p-close').addEventListener('click', () => goMap()); // 장소 화면 닫기 → 지도로
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
      if (e.key === 'Escape') { if (letterOpen()) { closeStory(); return; } if (!$('explore-menu').hidden) { toggleExplore(false); $('explore-btn').focus(); } else if (view === 'list' && isPanelOpen()) closeList(); else if (state() === 'place') goMap(); return; }
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
    buildMenus(); bindUi(); cxBuild();
    if (typeof loadStories === 'function') await loadStories(); // 편지 화면 원고(story.js, data/memory-stories.json)
    await loadHero();
    const ms = location.hash.match(/^#place\/([\w-]+)\/story$/);
    const m = location.hash.match(/^#place\/([\w-]+)/);
    if (ms && itemById(ms[1])) { select(ms[1], { instant: true, fromHash: true }); history.replaceState(null, '', `#place/${ms[1]}/story`); openLetter(ms[1], null, { fromHash: true }); }
    else if (m && itemById(m[1])) select(m[1], { instant: true, fromHash: true });
    else if (location.hash === '#explore') { goMap({ replace: true }); return; } // 옛 주소
    else if (location.hash) setHash(null);
  }
  window.__cine = { select, goMap, goHome: () => select(HUB_ID), goIntro, openList, closeList, step, items: () => ITEMS, order: () => ORDER, choose: select, descendTo: select, cx: () => ({ ...cx }), cxGo, cxReset, places: () => MAP.places, openLetter };
  boot();
})();
