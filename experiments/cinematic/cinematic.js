/* ===== Cinematic Gwangju — 1단계 시안 =====
   상태 3개: intro(첫 화면: 무등산·도심 항공사진 + 프로젝트 소개 원문) → explore(광주 탐험하기: 하단 장소 메뉴)
   → place(장소 선택: 실제 거리 사진 + 손글씨 한 줄 + 큰 지명 + 오른쪽 황금 패널).
   사진 위에 위치 핀을 찍지 않는다(촬영점·방향 미확정). 기록 본문은 ../city3d/data/content.json(기존 데이터 원문 복사본)만 쓴다. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || q.has('noanim');
  const isSheet = () => matchMedia('(max-width: 767px)').matches;

  // 배경 사진. 저장소에는 넣지 않는다(게시 권한 미확인) — README 참고. ?hero=mountains|acc|boulevard
  const HEROES = {
    mountains: { src: 'assets/overlook-mountains.jpg', grade: 'bluehour', focus: '50% 50%', focusM: '52% 50%', glow: ['44%', '66%'], credit: '배경 사진: 광주 도심과 무등산 방향 조망 — 참고 사진 08 (내부 시안용, 촬영점·방향 미확정, 낮 사진을 블루아워 톤으로 보정)' },
    acc: { src: 'assets/acc-night.jpg', grade: 'night', focus: '50% 62%', focusM: '46% 60%', glow: ['50%', '58%'], credit: '배경 사진: 국립아시아문화전당 일대, 해질녘 — 참고 사진 03 (내부 시안용, 촬영 방향 미확정)' },
    boulevard: { src: 'assets/aerial-boulevard.jpg', grade: 'bluehour', focus: '50% 56%', focusM: '50% 56%', glow: ['48%', '60%'], credit: '배경 사진: 대로 항공 전경 — 참고 사진 10 (내부 시안용, 구간 미확정, 낮 사진을 블루아워 톤으로 보정)' },
  };
  const HERO_DEFAULT = 'mountains';
  const SPOTS = [
    { id: 'chungjang', no: '01', name: '충장로', en: 'CHUNGJANGNO', ready: true, contentId: 'chungjang',
      scene: { src: 'assets/chungjang-night.jpg', grade: 'night', focus: '50% 55%', focusM: '58% 50%', credit: '장면 사진: 충장로 상점거리, 밤 — 참고 사진 01 (내부 시안용, 개별 상점 위치 미확인)' },
      thumb: 'assets/chungjang-night.jpg', mapHash: '#map/chungjang-ro', siteHash: '#spot/canmore', siteLabel: '본 사이트에서 캔모아 기록 보기' },
    { id: 'geumnam', no: '02', name: '금남로', en: 'GEUMNAMNO', ready: false, contentId: 'geumnam', mapHash: '#map/geumnam-ro' },
    { id: 'square', no: '03', name: '5·18민주광장', en: '5·18 DEMOCRACY SQUARE', ready: false, contentId: 'square', mapHash: '#map/518-democracy-square' },
    { id: 'acc', no: '04', name: 'ACC', en: 'ASIA CULTURE CENTER', ready: false, contentId: 'acc' },
    { id: 'nabi', no: '05', name: '금남로 나비정원', en: '', ready: false, unverified: true, contentId: 'nabi' },
  ];

  const stage = $('stage'), hero = $('hero'), heroImg = $('hero-img'), scene = $('scene'), sceneImg = $('scene-img'), panel = $('panel'), body = $('p-body');
  let content = null, current = null, lastFocus = null, hideTimer = null, sceneTimer = null;
  const revealed = new Set();
  const heroKey = HEROES[q.get('hero')] ? q.get('hero') : HERO_DEFAULT;
  const HERO = HEROES[heroKey];

  const spotById = (id) => SPOTS.find((s) => s.id === id);
  const contentFor = (id) => ((content && content.spots) || []).find((c) => c.id === id) || null;
  const rel = (p) => (!p ? '' : /^https?:/.test(p) ? p : `../../${p}`);
  const setState = (st) => { document.body.dataset.state = st; };
  const state = () => document.body.dataset.state;

  /* ---------- 사진 ---------- */
  function applyPhoto(wrap, img, spec) {
    wrap.classList.remove('grade-bluehour', 'grade-night');
    wrap.classList.add(`grade-${spec.grade}`);
    img.style.setProperty('--focus', spec.focus || '50% 50%');
    img.style.setProperty('--focus-m', spec.focusM || spec.focus || '50% 50%');
    return new Promise((resolve) => { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = spec.src; });
  }
  async function loadHero() {
    const ok = await applyPhoto(hero, heroImg, HERO);
    if (!ok) { $('no-photo').hidden = false; $('credit').textContent = ''; return; }
    $('credit').textContent = HERO.credit;
    stage.style.setProperty('--gx', HERO.glow[0]); stage.style.setProperty('--gy', HERO.glow[1]);
    if (!REDUCED) hero.classList.add('drift');
  }
  function showScene(spec) {
    clearTimeout(sceneTimer);
    applyPhoto(scene, sceneImg, spec).then((ok) => { if (!ok) return; sceneTimer = setTimeout(() => { scene.classList.add('on'); $('credit').textContent = spec.credit || HERO.credit; }, REDUCED ? 0 : 450); });
  }
  function hideScene() { clearTimeout(sceneTimer); scene.classList.remove('on'); $('credit').textContent = HERO.credit; }
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
    current = null; hideScene(); syncMenus(); setState('intro'); setHash(null);
  }
  function goExplore({ fromClose = false } = {}) {
    if (!fromClose && isPanelOpen()) closePanelOnly();
    current = null; hideScene(); syncMenus(); setState('explore'); setHash('explore');
    if (!fromClose) setTimeout(() => $('spot-menu').querySelector('.spot-btn')?.focus({ preventScroll: true }), REDUCED ? 0 : 500);
  }
  function updatePlaceTitle(s) {
    const c = contentFor(s.contentId);
    const m = c && (c.memories || [])[0];
    // 손글씨 한 줄: 기존 팀 수첩 메모 원문(출처 places.json memories). 없으면 비운다
    $('hand').innerHTML = m ? `${esc(m.hand)}<small>${esc([m.spot, m.by ? `${m.by}님` : '', m.years ? `광주 ${m.years}년` : ''].filter(Boolean).join(' · '))}</small>` : '';
    $('place-title').textContent = s.name;
    $('eyebrow').textContent = `광주 동구 · ${s.no} / ${String(SPOTS.length).padStart(2, '0')}${s.ready ? '' : ' · 준비 중'}`;
  }
  function select(id, { instant = false } = {}) {
    const s = spotById(id);
    if (!s) return;
    toggleExplore(false);
    const wasOpen = isPanelOpen();
    current = id;
    setState('place');
    if (s.scene) showScene(s.scene); else hideScene();
    updatePlaceTitle(s);
    renderPanel(s);
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
  function closeAll({ keepHash = false } = {}) {
    if (!isPanelOpen()) return;
    closePanelOnly();
    goExplore({ fromClose: true });
    if (keepHash) return;
    const back = lastFocus && document.contains(lastFocus) && lastFocus.offsetParent !== null ? lastFocus : $('spot-menu').querySelector('.spot-btn') || $('explore-btn');
    back.focus({ preventScroll: true });
  }
  function step(dir) {
    const i = SPOTS.findIndex((s) => s.id === current);
    select(SPOTS[(i + dir + SPOTS.length) % SPOTS.length].id);
  }
  function setHash(v) {
    const next = v === null ? '' : v === 'explore' ? '#explore' : `#place/${v}`;
    if (location.hash === next) return;
    history.replaceState(null, '', next || location.pathname + location.search);
  }
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#place\/([\w-]+)/);
    if (m && spotById(m[1])) { if (current !== m[1]) select(m[1]); }
    else if (location.hash === '#explore') { if (state() !== 'explore') { if (isPanelOpen()) closePanelOnly(); goExplore({ fromClose: true }); } }
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
  function videoHtml(s, c) {
    const v = c && c.video;
    if (v && v.src) return `<div class="pv" style="--ar:${Number(v.ratio) || 0.75}"><video id="pv" playsinline preload="metadata" ${v.poster ? `poster="${esc(rel(v.poster))}"` : ''} src="${esc(rel(v.src))}" aria-label="${esc(s.name)} 수어 영상"></video><button type="button" class="pv-play" id="pv-play">수어 영상 보기<i aria-hidden="true"></i></button></div>`;
    return `<div class="pv none"><span>SIGN — COMING SOON<b>${esc(s.name)} 수어 영상 준비 중</b><small>확인된 영상만 연결합니다. 세로형(3:4) 자리이며 얼굴·손·상체가 잘리지 않게 contain으로 보여줍니다.</small></span></div>`;
  }
  function recordsHtml(c) {
    if (!c) return '';
    const memos = (c.memories || []).map((m) => `<div class="memo"><b>${esc(m.spot || '')}</b><p>${esc(m.hand || '')}</p><small>${esc([m.by ? `${m.by}님` : '', m.years ? `광주 ${m.years}년` : ''].filter(Boolean).join(' · '))}</small></div>`).join('');
    const stories = (c.stories || []).map((st) => `<article class="story"><div class="who">${esc(st.narrator_line || '')}</div><h4>${esc(st.title || '')}</h4>${st.subtitle ? `<p class="sub">${esc(st.subtitle)}</p>` : ''}${st.quote ? `<blockquote>${esc(st.quote)}</blockquote>` : ''}${st.location || st.source ? `<p class="src">${esc([st.location ? `장소: ${st.location}` : '', st.source ? `출처: ${st.source}` : ''].filter(Boolean).join(' · '))}</p>` : ''}</article>`).join('');
    return memos + stories;
  }
  function renderPanel(s) {
    stopVideo();
    const c = contentFor(s.contentId);
    $('p-en').textContent = s.en || (c && c.en) || '';
    $('p-name').textContent = s.name;
    $('p-sub').textContent = s.ready ? '광주 동구 · 지명 수어 기록과 농인의 장소 기억' : '';
    const gated = c && c.sensitive && c.sensitive.gated && !revealed.has(s.id);
    const nRec = c ? (c.memories || []).length + (c.stories || []).length : 0;
    let html = '';
    if (gated) html = `<div class="gate"><p>${esc(c.sensitive.notice || '이 지점은 역사적으로 민감한 기록을 담고 있습니다. 계속 보시겠어요?')}</p><button type="button" id="p-reveal">기록 보기</button></div>`;
    else if (!s.ready) {
      html = `<p class="pending">${s.unverified ? '위치가 확인되지 않아 장면과 핀을 두지 않았습니다. ' : ''}이 장소의 장면은 확인된 사진과 기록이 갖춰지면 만듭니다. 지금 단계는 충장로 한 곳에 집중합니다.</p>`;
      if (c && nRec) html += `<p class="sec">장소 기억</p>${recordsHtml(c)}`;
      if (s.mapHash) html += `<div class="links"><a href="../../${esc(s.mapHash)}">지명 수어 지도에서 위치 보기 →</a></div>`;
    } else {
      html = `${videoHtml(s, c)}
        <dl class="facts"><div><dt>광주 동구</dt><dd>GWANGJU DONG-GU</dd></div><div><dt>기록 ${nRec}건</dt><dd>RECORDS</dd></div></dl>
        <p class="sec">장소 기억</p>${recordsHtml(c) || '<p class="pending">기록 준비 중</p>'}
        <div class="links">${s.siteHash ? `<a href="../../${esc(s.siteHash)}">${esc(s.siteLabel || '본 사이트에서 보기')} →</a>` : ''}${s.mapHash ? `<a href="../../${esc(s.mapHash)}">지명 수어 지도에서 위치 보기 →</a>` : ''}</div>`;
      if (c && (c.tags || []).length) html += `<div class="tags">${c.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;
    }
    body.innerHTML = html;
    const v = $('pv'), play = $('pv-play');
    if (v && play) { play.addEventListener('click', () => { v.controls = true; v.play().catch(() => {}); }); v.addEventListener('playing', () => { play.hidden = true; }); v.addEventListener('pause', () => { play.hidden = false; }); }
    $('p-reveal')?.addEventListener('click', () => { revealed.add(s.id); renderPanel(s); });
  }

  /* ---------- 메뉴 ---------- */
  function buildMenus() {
    $('spot-menu').innerHTML = SPOTS.map((s) => `<button type="button" class="spot-btn${s.ready ? '' : ' pending'}" data-spot="${esc(s.id)}" aria-pressed="false" title="${esc(s.ready ? s.name : s.name + ' — 준비 중')}">${s.thumb ? `<span class="thumb"><img src="${esc(s.thumb)}" alt="" onerror="this.parentNode.className='thumb empty';this.parentNode.textContent='${esc(s.no)}'"></span>` : `<span class="thumb empty">${esc(s.no)}</span>`}${esc(s.name)}</button>`).join('');
    $('explore-list').innerHTML = SPOTS.map((s) => `<button type="button" class="em-item${s.ready ? '' : ' pending'}" data-spot="${esc(s.id)}" aria-pressed="false"><small>${esc(s.no)}</small><span>${esc(s.name)}</span><em>${s.ready ? '장면 · 기록' : s.unverified ? '위치 검증 중' : '준비 중'}</em></button>`).join('');
    document.querySelectorAll('[data-spot]').forEach((b) => b.addEventListener('click', () => select(b.dataset.spot)));
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
    $('cta').addEventListener('click', () => goExplore());
    $('brand').addEventListener('click', (e) => { e.preventDefault(); toggleExplore(false); goIntro(); });
    $('explore-btn').addEventListener('click', () => toggleExplore());
    $('explore-close').addEventListener('click', () => { toggleExplore(false); $('explore-btn').focus(); });
    document.addEventListener('pointerdown', (e) => { const m = $('explore-menu'); if (m.hidden) return; if (m.contains(e.target) || $('explore-btn').contains(e.target)) return; toggleExplore(false); });
    $('p-close').addEventListener('click', () => closeAll());
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
      if (e.key === 'Escape') { if (!$('explore-menu').hidden) { toggleExplore(false); $('explore-btn').focus(); } else if (isPanelOpen()) closeAll(); else if (state() === 'explore') goIntro(); return; }
      if (!isPanelOpen() || (e.target instanceof Element && e.target.closest('input, textarea, video'))) return;
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
    });
  }

  /* ---------- 시작 ---------- */
  async function boot() {
    try { content = await fetch('../city3d/data/content.json?v=1').then((r) => (r.ok ? r.json() : null)); } catch (e) { content = null; }
    buildMenus(); bindUi();
    await loadHero();
    const m = location.hash.match(/^#place\/([\w-]+)/);
    if (m && spotById(m[1])) select(m[1], { instant: true });
    else if (location.hash === '#explore') goExplore({ fromClose: true });
  }
  window.__cine = { select, closeAll, step, goIntro, goExplore, hero: heroKey };
  boot();
})();
