/* ---------- 장소 기억: 한 사람의 기억을 손글씨 편지처럼 읽는 전체 화면 ----------
   데이터: data/memory-stories.json (거점 id → { title, subtitle, paragraphs[], emphasis[] }).
   거점 패널(spots.js)의 '장소 기억' 버튼이 openStory(id)를 부른다. 지도·패널은 건드리지 않고
   그 위에 화면을 겹쳤다가 걷어내므로, 닫으면 지도 중심·줌·선택 상태가 그대로 남는다. */
const STORIES_URL = 'data/memory-stories.json?v=20261017';
let memoryStories = {};
const storyEl = document.getElementById('story');
const storyScrollEl = document.getElementById('story-scroll');
const storyBodyEl = document.getElementById('story-body');
let storyState = null; // { id, p, c, timer, waiting, done, reduced }
let storyReturnFocus = null;
let storyObserver = null;

const storyIsOpen = () => !!storyEl && !storyEl.hidden;
const hasStory = (id) => !!memoryStories[id];
const storyAnim = () => !prefersReducedMotion() && !document.documentElement.classList.contains('noanim');

function loadStories() {
  return fetch(STORIES_URL)
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => {
      memoryStories = {};
      Object.keys(d || {}).forEach((k) => { if (!k.startsWith('_') && d[k] && Array.isArray(d[k].paragraphs)) memoryStories[k] = d[k]; });
    })
    .catch((err) => { console.error('장소 기억 데이터 로드 실패:', err); memoryStories = {}; });
}

/* ---------- 화면 구성 ---------- */
function buildStory(id) {
  const s = memoryStories[id];
  const emph = new Set(s.emphasis || []);
  storyEl.querySelector('.paper-kicker').textContent = s.subtitle || '';
  storyEl.querySelector('#story-title').textContent = s.title || '';
  // 각 문단: 보이지 않는 전체 글(ghost)이 자리를 잡고, 같은 글꼴의 ink가 한 글자씩 덮어 쓴다 → 줄바꿈·높이가 처음부터 고정
  storyBodyEl.innerHTML = s.paragraphs
    .map((t, i) => {
      const n = i + 1;
      const cls = ['story-p', emph.has(n) ? 'emph' : '', emph.has(n) && n === s.paragraphs.length ? 'emph-final' : ''].filter(Boolean).join(' ');
      return `<p class="${cls}" data-i="${i}"><span class="ghost">${esc(t)}</span><span class="ink" aria-hidden="true"></span></p>`;
    })
    .join('');
  // 화면 읽기 도구용 전체 원문 (타이핑 연출과 무관하게 바로 읽힌다)
  storyEl.querySelector('.story-sr').textContent = `${s.title}. ${s.subtitle}. ` + s.paragraphs.join(' ');
  storyEl.classList.remove('ended');
}

/* ---------- 쓰기 엔진 ---------- */
const CHAR_MS = 42;
function charDelay(ch) {
  if (ch === ' ') return 28;
  if (ch === ',') return CHAR_MS + 220;
  if ('.!?'.includes(ch)) return CHAR_MS + 480;
  if (ch === '…') return CHAR_MS + 320;
  return CHAR_MS;
}
const paraEl = (i) => storyBodyEl.querySelector(`.story-p[data-i="${i}"]`);
function renderPrefix(i, n) {
  const el = paraEl(i);
  if (!el) return;
  const text = memoryStories[storyState.id].paragraphs[i];
  el.querySelector('.ink').textContent = text.slice(0, n);
  el.classList.toggle('typing', n > 0 && n < text.length);
  el.classList.toggle('done', n >= text.length);
  if (n > 0) el.classList.add('started');
}
function stopTimer() {
  if (storyState && storyState.timer) { clearTimeout(storyState.timer); storyState.timer = null; }
}
function step() {
  if (!storyState || storyState.done) return;
  const text = memoryStories[storyState.id].paragraphs[storyState.p];
  if (storyState.c >= text.length) { finishParagraph(); return; }
  storyState.c += 1;
  renderPrefix(storyState.p, storyState.c);
  storyState.timer = setTimeout(step, charDelay(text[storyState.c - 1]));
}
function paragraphVisible(i) {
  const el = paraEl(i);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top < innerHeight - 80 && r.bottom > 60;
}
function startParagraph(i) {
  storyState.p = i;
  storyState.c = 0;
  storyState.waiting = false;
  stopTimer();
  storyState.timer = setTimeout(step, 120);
}
function finishParagraph() {
  stopTimer();
  const total = memoryStories[storyState.id].paragraphs.length;
  renderPrefix(storyState.p, Infinity);
  if (storyState.p >= total - 1) { endStory(); return; }
  const next = storyState.p + 1;
  // 다음 문단이 화면에 보이면 잠깐 쉬고 이어 쓰고, 아래쪽에 있으면 사용자가 스크롤해 올 때까지 기다린다
  if (paragraphVisible(next)) { storyState.timer = setTimeout(() => startParagraph(next), 650); }
  else { storyState.p = next; storyState.c = 0; storyState.waiting = true; }
}
function completeCurrent() {
  if (!storyState || storyState.done) return;
  if (storyState.waiting) { startParagraph(storyState.p); return; }
  stopTimer();
  finishParagraph();
}
function revealAll() {
  if (!storyState) return;
  stopTimer();
  const total = memoryStories[storyState.id].paragraphs.length;
  for (let i = 0; i < total; i++) renderPrefix(i, Infinity);
  storyState.p = total - 1;
  endStory();
}
function endStory() {
  if (!storyState || storyState.done) return;
  storyState.done = true;
  storyState.waiting = false;
  stopTimer();
  storyEl.classList.add('ended');
}
function bindObserver() {
  if (storyObserver) storyObserver.disconnect();
  storyObserver = new IntersectionObserver((entries) => {
    if (!storyState || storyState.done || !storyState.waiting) return;
    entries.forEach((en) => {
      if (en.isIntersecting && Number(en.target.dataset.i) === storyState.p) startParagraph(storyState.p);
    });
  }, { root: storyScrollEl, threshold: 0.2 });
  storyBodyEl.querySelectorAll('.story-p').forEach((el) => storyObserver.observe(el));
}

/* 이야기가 열린 동안 뒤의 지도·패널·메뉴는 초점·클릭을 받지 않는다 (지원 브라우저에서 inert) */
let inertEls = [];
function setBackgroundInert(on) {
  if (on) {
    inertEls = [...document.body.children].filter((el) => el !== storyEl && el.tagName !== 'SCRIPT' && !el.inert);
    inertEls.forEach((el) => { el.inert = true; });
  } else {
    inertEls.forEach((el) => { el.inert = false; });
    inertEls = [];
  }
}

/* ---------- 열기 / 닫기 ---------- */
function openStory(id, { fromHash = false, trigger = null } = {}) {
  if (!hasStory(id) || !storyEl) return;
  storyReturnFocus = trigger || document.activeElement;
  buildStory(id);
  storyState = { id, p: 0, c: 0, timer: null, waiting: false, done: false, reduced: !storyAnim() };
  storyScrollEl.scrollTop = 0;
  storyEl.hidden = false;
  document.body.classList.add('story-open');
  void storyEl.offsetWidth; // 리플로우 → 등장 전환 재생
  storyEl.classList.add('on');
  if (!fromHash && !/\/story$/.test(location.hash)) {
    history.pushState({ story: id }, '', `#spot/${id}/story`); // 뒤로 가기 한 번이면 이야기만 닫힌다
  }
  storyEl.querySelector('.story-close').focus({ preventScroll: true });
  setBackgroundInert(true);
  bindObserver();
  if (storyState.reduced) revealAll(); // 모션 줄이기: 쓰기 연출 없이 전체 원문
  else storyState.timer = setTimeout(() => startParagraph(0), 950); // 종이가 떠오른 뒤 첫 문단
}
function closeStory({ fromHistory = false } = {}) {
  if (!storyIsOpen()) return;
  stopTimer();
  if (storyObserver) { storyObserver.disconnect(); storyObserver = null; }
  storyEl.classList.remove('on');
  document.body.classList.remove('story-open');
  const after = () => { storyEl.hidden = true; storyBodyEl.innerHTML = ''; };
  if (storyAnim()) setTimeout(after, 450); else after();
  if (!fromHistory && /\/story$/.test(location.hash)) history.replaceState(null, '', `#spot/${storyState ? storyState.id : location.hash.split('/')[1]}`);
  storyState = null;
  setBackgroundInert(false);
  const back = storyReturnFocus;
  storyReturnFocus = null;
  if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true });
}

/* ---------- 조작 ---------- */
if (storyEl) {
  storyEl.querySelector('.story-close').addEventListener('click', () => closeStory());
  storyEl.querySelector('.story-return').addEventListener('click', () => closeStory());
  storyEl.querySelector('.story-skip').addEventListener('click', () => revealAll());
  // 종이를 누르면(탭) 지금 쓰고 있는 문단이 바로 완성된다
  storyEl.querySelector('.paper').addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    completeCurrent();
  });
  // Enter: 지금 쓰고 있는 문단 완성 (Space는 평소처럼 스크롤)
  document.addEventListener('keydown', (e) => {
    if (!storyIsOpen() || e.key !== 'Enter') return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest('button, a, input, textarea')) return;
    if (storyState && !storyState.done) { e.preventDefault(); completeCurrent(); }
  });
}
// 테스트·디버깅용 (화면에는 영향 없음)
window.__story = {
  renderPrefix: (i, n) => renderPrefix(i, n), completeCurrent, revealAll, state: () => storyState,
  pause: () => stopTimer(),
  resume: () => { if (storyState && !storyState.done && !storyState.waiting && !storyState.timer) step(); },
};
