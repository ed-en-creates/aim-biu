import * as L from './logic.js';
import { BIU, PROGRAMMES, catalog, semesterCourses } from './biu.js';
import { spark, sound, buzz, confetti, countUp, setSound } from './fx.js';
import { QUESTIONS, answer, route as routeQuestion } from './ask.js';
import * as M from './milestones.js';

/* ============================== Storage & state ============================== */

const store = (() => {
  try { const s = window.localStorage; s.getItem('aim:probe'); return s; } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
})();
const KEY = 'aim:v2', ICON_BIG = 'aim:icon512', ICON_SMALL = 'aim:icon192';
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const plusDaysISO = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };
const semName = (level, sem) => `${level}L · ${sem === 2 ? 'Second' : 'First'} semester`;

function defaults() {
  return {
    v: 2,
    profile: { name: '', prog: 'csc', mode: 'full', entry: 'utme', level: 100, target: null, policy: 'all', calc: 'weighted', sound: true, theme: 'system', onboarded: false, installDismissed: false, revealed: false },
    semesters: [],
    plan: { days: [1, 2, 3, 4, 5], start: '19:00', length: 60, perDay: 1, breakMin: 10, fromISO: todayISO(), untilISO: plusDaysISO(98), alarm: 10, added: {}, custom: false },
    progress: M.emptyProgress(todayISO()),
  };
}

function sanitize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const profile = { ...d.profile, ...(raw.profile || {}) };
  for (const [k, ok] of [['mode', ['full', 'part']], ['entry', ['utme', 'de']], ['policy', ['all', 'latest']], ['calc', ['weighted', 'simple']], ['theme', ['system', 'light', 'dark']]])
    if (!ok.includes(profile[k])) profile[k] = d.profile[k];
  if (!PROGRAMMES[profile.prog]) profile.prog = 'csc';
  profile.level = [100, 200, 300, 400].includes(Number(profile.level)) ? Number(profile.level) : 100;
  profile.target = Number(profile.target) > 0 && Number(profile.target) <= 5 ? Number(profile.target) : null;
  const plan = { ...d.plan, ...(raw.plan || {}) };
  if (!Array.isArray(plan.days)) plan.days = d.plan.days;
  if (!plan.added || typeof plan.added !== 'object') plan.added = {};
  const semesters = (Array.isArray(raw.semesters) ? raw.semesters : []).filter((s) => s && typeof s === 'object').map((s) => {
    const lv = Number(s.level) || Number(/(\d)00\s*L/i.exec(s.name || '')?.[1]) * 100 || null;
    const sm = Number(s.sem) || (/second/i.test(s.name || '') ? 2 : /first/i.test(s.name || '') ? 1 : null);
    const courses = (Array.isArray(s.courses) ? s.courses : []).filter((c) => c && typeof c === 'object').map((c) => ({
      id: String(c.id || L.uid()), code: L.normCode(c.code || ''), title: String(c.title || ''), units: L.validUnits(c.units),
      grade: L.GRADES.includes(c.grade) ? c.grade : null, target: L.GRADES.includes(c.target) ? c.target : null, targetManual: !!c.targetManual,
      difficulty: [1, 2, 3].includes(Number(c.difficulty)) ? Number(c.difficulty) : 2, diffManual: !!c.diffManual,
    }));
    const current = s.current === true || (s.current === undefined && courses.length > 0 && courses.some((c) => !c.grade));
    return { id: String(s.id || L.uid()), level: lv, sem: sm, current, name: current ? 'This semester' : lv && sm ? semName(lv, sm) : String(s.name || 'Semester'), courses };
  });
  sortSemesters(semesters);
  return { v: 2, profile, plan, semesters, progress: M.sanitizeProgress(raw.progress, todayISO()) };
}
function sortSemesters(list) { list.sort((a, b) => (a.current - b.current) || ((a.level || 999) - (b.level || 999)) || ((a.sem || 9) - (b.sem || 9))); }
function load() { try { return sanitize(JSON.parse(store.getItem(KEY) || 'null')); } catch { return defaults(); } }
let state = load();
function save() { try { store.setItem(KEY, JSON.stringify(state)); } catch { toast('Couldn’t save. Your phone storage may be full.'); } }

/* ============================== Helpers ============================== */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f2 = (n) => (n == null || Number.isNaN(n) ? '—' : L.round2(n).toFixed(2));
const P = () => state.profile;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const CLASS_CSS = { '1st': 'cls-1st', '2:1': 'cls-21', '2:2': 'cls-22', '3rd': 'cls-3rd', Pass: 'cls-pass', '—': 'cls-na' };
const clsCss = (gpa) => (gpa == null ? 'cls-na' : CLASS_CSS[L.classify(gpa).short]);
const gradeChip = (g) => (g ? `<span class="g g${g}" aria-label="Grade ${g}">${g}</span>` : '<span class="g gP">This semester</span>');
const hrs = (m) => { const h = m / 60; return (Number.isInteger(h) ? h : h.toFixed(1)) + ' h'; };
const calcPlan = () => L.weightedPlan(state.semesters, { entry: P().entry, target: P().target, policy: P().policy, mode: P().calc });
const coachNow = () => L.coach(state.semesters, P(), state.plan);
const currentSem = () => state.semesters.find((s) => s.current);
const targetLabel = () => (P().target ? L.classify(P().target).label : null);
function findCourse(id) { for (const s of state.semesters) { const c = s.courses.find((x) => x.id === id); if (c) return { sem: s, course: c }; } return null; }

/** Keep the reading week sized to the courses, unless the student has customised it. */
function refreshAutoWeek() {
  if (state.plan.custom) return;
  const ch = coachNow();
  if (!ch.courses.length) return;
  const w = L.autoWeek(ch.courses, state.plan);
  state.plan.days = w.days; state.plan.perDay = w.perDay;
}

const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  results: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.9A8 8 0 1 1 21 12z"/><path d="M9 10.5h6M9 13.5h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

/* ============================== Shell ============================== */

const ROUTES = { home: { title: 'Home', icon: I.home, tab: 1 }, plan: { title: 'My plan', icon: I.plan, tab: 1 }, results: { title: 'Results', icon: I.results, tab: 1 }, ask: { title: 'Ask Spark', icon: I.ask, tab: 1 }, settings: { title: 'Settings' } };
const currentRoute = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home'; return ROUTES[r] ? r : 'home'; };

let lastRoute = null;
function render() {
  const r = P().onboarded ? currentRoute() : 'onboarding';
  const view = $('#view');
  const a = document.activeElement;
  const focusId = a?.id && view.contains(a) ? a.id : null;
  document.title = r === 'onboarding' ? 'Welcome · Aim' : `${ROUTES[r].title} · Aim`;
  view.innerHTML = VIEWS[r]();
  $('#tabs').innerHTML = Object.entries(ROUTES).filter(([, v]) => v.tab).map(([k, v]) => `<a class="tab" href="#${k}" ${k === r ? 'aria-current="page"' : ''}>${v.icon}<span>${k === 'ask' ? 'Ask' : k === 'plan' ? 'Plan' : v.title}</span></a>`).join('');
  $('#tabs').hidden = !P().onboarded;
  renderAvatar();
  AFTER[r]?.();
  if (r !== lastRoute) { scrollTo(0, 0); if (lastRoute !== null) view.focus({ preventScroll: true }); lastRoute = r; }
  else if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}
function renderAvatar() {
  const b = $('#avatar-btn'); const icon = store.getItem(ICON_SMALL);
  const ini = (P().name || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  b.innerHTML = icon ? `<img src="${icon}" alt="">` : esc(ini || '•'); b.hidden = !P().onboarded;
}
addEventListener('hashchange', render);

/* ============================== Toasts, sheets, cheers ============================== */

let toastT;
function toast(msg, action, opts = {}) {
  const el = $('#toast');
  el.className = 'toast' + (opts.top ? ' top' : '');
  el.innerHTML = `${opts.spark ? spark(opts.spark, 40, opts.spark === 'proud' ? 'jump' : '') : ''}<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), action ? 6000 : opts.spark ? 4200 : 3000);
}
function cheer(msg, mood = 'proud') {
  if (mood === 'proud') { sound.yay(); confetti(); buzz([10, 40, 10]); }
  else if (mood === 'worried') { sound.soft(); buzz(20); }
  else sound.ding();
  toast(msg, null, { top: true, spark: mood });
}
const dlg = $('#dlg');
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
function sheet(html, onSubmit) {
  dlg.innerHTML = html;
  const form = dlg.querySelector('form');
  form?.addEventListener('submit', (e) => { e.preventDefault(); onSubmit?.(form, e.submitter?.value || 'save'); });
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('[autofocus]')?.focus();
}
function confirmSheet({ title, body, ok = 'Confirm', danger }) {
  return new Promise((res) => {
    let yes = false;
    sheet(`<form class="sheet"><h2 id="dlg-title">${esc(title)}</h2><p class="muted">${esc(body)}</p>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}">${esc(ok)}</button></div></form>`, () => { yes = true; dlg.close(); });
    dlg.addEventListener('close', () => res(yes), { once: true });
  });
}

/* ============================== Milestone moments ============================== */

const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 2.5c.6 3.8 6 5.9 6 11.6A6.5 6.5 0 0 1 5.5 14c0-3.1 1.6-5.2 3.2-6.6.1 2.1 1 3.4 2.4 3.9-.5-3.1 0-6.1 1.4-8.8z" fill="currentColor"/><path d="M12 21a3.2 3.2 0 0 1-3.2-3.2c0-2 1.6-3.1 2.4-4.6.6 1.6 4 2.4 4 4.6A3.2 3.2 0 0 1 12 21z" fill="#fff" opacity=".55"/></svg>';
const ORDER = ['—', 'Pass', '3rd', '2:2', '2:1', '1st'];
const mq = [];
let mOpen = false, mdlg = null;

/** Queue a full-screen moment. tone: win | streak | miss | info */
function moment(m) { mq.push(m); if (!mOpen) nextMoment(); }
function nextMoment() {
  const m = mq.shift();
  if (!m) { mOpen = false; return; }
  mOpen = true;
  if (!mdlg) {
    mdlg = document.createElement('dialog'); mdlg.id = 'moment'; mdlg.setAttribute('aria-labelledby', 'm-title'); document.body.appendChild(mdlg);
    mdlg.addEventListener('close', () => setTimeout(nextMoment, 220));
    mdlg.addEventListener('click', (e) => { if (e.target === mdlg) mdlg.close(); });
  }
  mdlg.innerHTML = `<div class="moment tone-${m.tone}">
    <div class="m-hero">${m.hero || spark(m.mood || 'proud', 112, m.tone === 'miss' ? '' : 'jump')}</div>
    <p class="m-kicker">${esc(m.kicker)}</p><h2 id="m-title">${m.title}</h2>
    ${m.body ? `<p class="m-body">${m.body}</p>` : ''}${m.extra || ''}
    <div class="m-actions">${m.secondary ? `<button type="button" class="btn" data-m="2">${esc(m.secondary.label)}</button>` : ''}<button type="button" class="btn ${m.tone === 'miss' ? 'blue' : 'primary'}" data-m="1">${esc(m.ok || 'Continue')}</button></div></div>`;
  mdlg.querySelector('[data-m="1"]').onclick = () => { mdlg.close(); m.onOk?.(); };
  mdlg.querySelector('[data-m="2"]')?.addEventListener('click', () => { mdlg.close(); m.secondary.run(); });
  mdlg.showModal(); mdlg.querySelector('[data-m="1"]').focus();
  if (m.tone === 'win' || m.tone === 'streak') { sound.yay(); confetti(m.tone === 'streak' ? 70 : 110); buzz([10, 40, 10]); }
  else if (m.tone === 'miss') { sound.soft(); buzz(20); } else sound.ding();
}
const flameHero = (n) => `<div class="m-flame">${FLAME}<b class="num">${n}</b></div>`;
const bigNum = (txt, cls) => `<div class="m-num tile ${cls}"><b class="num">${txt}</b></div>`;
function weekDots(row, pop) {
  const n = row.filter((d) => d.state === 'done').length;
  return `${pop !== undefined || row.caption ? '<p class="tiny muted" style="margin:6px 0 -2px;font-weight:800">This week</p>' : ''}<div class="wk" role="img" aria-label="This week: ${n} reading day${n === 1 ? '' : 's'} done">${row.map((d) => `<span class="wd ${d.state} ${d.iso === pop ? 'pop' : ''}"><i>${d.state === 'done' ? I.check : d.state === 'missed' ? '·' : ''}</i><b>${d.label}</b></span>`).join('')}</div>`;
}
const firstName = () => esc((P().name || '').trim().split(/\s+/)[0] || 'friend');

/** What the results looked like before a change, to compare after it. */
function snap() {
  const cg = L.cgpa(state.semesters, P().policy), plan = calcPlan();
  return {
    cg, cls: cg.gpa != null ? L.classify(cg.gpa) : null, plan, best: M.bestSemester(state.semesters, L.semesterGpa),
    goals: Object.fromEntries(coachNow().courses.filter((c) => c.target).map((c) => [c.id, { code: c.code, target: c.target }])),
    pending: new Set(L.inProgress(state.semesters).map((c) => c.id)),
  };
}
/** Compare with a snapshot and queue the moments that matter. Returns how many were shown. */
function celebrate(before) {
  const after = snap(), out = [], hasPlan = L.inProgress(state.semesters).length > 0;
  const toPlan = () => { location.hash = '#plan'; };
  // 1. First CGPA
  if (!before.cg.units && after.cg.units) {
    const need = P().target && after.plan.status === 'possible' ? `To graduate with <b>${esc(targetLabel())}</b>, average <b>${f2(after.plan.required)}</b> from now on.` : '';
    out.push({ tone: 'win', kicker: 'YOUR CGPA', hero: bigNum(f2(after.cg.gpa), clsCss(after.cg.gpa)), title: esc(after.cls.label), body: `${after.cg.units} units of results counted. ${need}`, ok: hasPlan ? 'See my plan' : 'Nice', onOk: hasPlan ? toPlan : null });
  }
  // 2. This semester's grades vs the goals they had
  const graded = []; for (const s of state.semesters) for (const c of s.courses) if (before.pending.has(c.id) && c.grade) graded.push(c);
  const res = M.gradeResults(before.goals, graded);
  if (res.length) {
    const hits = res.filter((r) => r.kind !== 'miss').length, misses = res.length - hits;
    const rows = `<div class="m-list">${res.map((r) => `<div class="m-row ${r.kind}"><b>${esc(r.code)}</b><span class="tiny muted">goal ${r.target}</span>${gradeChip(r.grade)}<span class="m-ic" aria-label="${r.kind === 'miss' ? 'below goal' : r.kind === 'beat' ? 'beat goal' : 'hit goal'}">${r.kind === 'miss' ? '↓' : r.kind === 'beat' ? '↑' : I.check}</span></div>`).join('')}</div>`;
    const need = after.plan.status === 'possible' && P().target ? ` From here, average <b>${f2(after.plan.required)}</b> for ${esc(targetLabel())}.` : '';
    if (!misses) out.push({ tone: 'win', kicker: 'RESULTS ARE IN', title: res.length === 1 ? `You hit your goal in ${esc(res[0].code)}!` : 'You hit every goal!', body: `This is exactly how it’s done.${need}`, extra: rows });
    else if (hits >= misses) out.push({ tone: 'info', mood: 'happy', kicker: 'RESULTS ARE IN', title: `You hit ${hits} of ${res.length} goals`, body: `Good work. The ones below goal now get more weight in your plan.${need}`, extra: rows, ok: 'See my plan', onOk: toPlan });
    else out.push({ tone: 'miss', mood: 'worried', kicker: 'RESULTS ARE IN', title: hits ? `${hits} of ${res.length} goals this time` : 'Tough results this time', body: `One semester doesn’t decide your class. I’ve updated your plan around these.${need}`, extra: rows, ok: 'See my new plan', onOk: toPlan });
  }
  // 3. Class moved
  if (before.cls && after.cls && before.cls.short !== after.cls.short) {
    const up = ORDER.indexOf(after.cls.short) > ORDER.indexOf(before.cls.short);
    out.push(up
      ? { tone: 'win', kicker: 'LEVEL UP', hero: bigNum(f2(after.cg.gpa), clsCss(after.cg.gpa)), title: `You moved up to ${esc(after.cls.label)}!`, body: `From ${f2(before.cg.gpa)} to ${f2(after.cg.gpa)}. Keep this exact energy.` }
      : { tone: 'miss', mood: 'worried', kicker: 'HEADS UP', hero: bigNum(f2(after.cg.gpa), clsCss(after.cg.gpa)), title: `You’re at ${esc(after.cls.label)} for now`, body: `Your CGPA went from ${f2(before.cg.gpa)} to ${f2(after.cg.gpa)}. Later levels count more, so this is very recoverable.`, ok: 'Show me how', onOk: toPlan });
  }
  // 4. Target secured or lost
  const was = before.plan.status, now = after.plan.status;
  if (P().target && was !== now) {
    if ((now === 'secured' || now === 'achieved') && was !== 'secured' && was !== 'achieved') out.push({ tone: 'win', kicker: 'TARGET LOCKED IN', title: `${esc(targetLabel())} is yours`, body: 'Even average grades from here keep it. Legend.' });
    else if (now === 'impossible' && was === 'possible') {
      const alt = L.classify(after.plan.best);
      out.push({ tone: 'miss', mood: 'worried', kicker: 'NEW TARGET?', title: `${esc(targetLabel())} is out of reach now`, body: `That stings. But <b>${esc(alt.label)}</b> is still fully yours. Want to aim for it?`, ok: 'Keep my target', secondary: { label: `Aim for ${alt.label}`, run: () => { P().target = alt.min; save(); render(); toast(`New target: ${alt.label}`); } } });
    }
  }
  // 5. Personal best semester
  if (before.best && after.best && after.best.gpa > before.best.gpa + 0.004) out.push({ tone: 'win', kicker: 'PERSONAL BEST', hero: bigNum(f2(after.best.gpa), clsCss(after.best.gpa)), title: 'Your best semester yet', body: `${esc(after.best.name)} beat your old best of ${f2(before.best.gpa)}.` });
  out.slice(0, 3).forEach(moment);
  return out.length;
}

/** Reading check-in: tick a session, grow the streak. */
function tickSession(uid) {
  const pr = state.progress, today = todayISO();
  const list = pr.done[today] || [];
  if (list.includes(uid)) { pr.done[today] = list.filter((x) => x !== uid); if (!pr.done[today].length) delete pr.done[today]; save(); render(); sound.tap(); return; }
  const firstEver = !Object.values(pr.done).some((a) => a.length), wasDone = list.length > 0;
  pr.done[today] = [...list, uid]; delete pr.missed[today];
  const st = M.streak(pr, today), newBest = st > pr.best && pr.best >= 3; pr.best = Math.max(pr.best, st);
  const { events } = weekEvents(), row = M.weekRow(pr, state.plan.days, today), wk = M.weekKey(today);
  save(); render(); sound.ding(); buzz(12);
  if (firstEver) moment({ tone: 'win', kicker: 'FIRST SESSION', title: 'You showed up!', body: 'That’s day 1. Tick a session on each reading day and watch your streak grow.', extra: weekDots(row, today), ok: 'Let’s go' });
  else if (!wasDone && M.STREAK_MILESTONES.includes(st)) {
    const line = { 3: 'Three reading days in a row. This is how habits start.', 7: 'A full week of reading. This is how First Class is built.', 14: 'Two weeks straight. Most people quit by now. Not you.', 30: 'A whole month. That’s discipline.' }[st] || `${st} reading days in a row. You’re built different.`;
    moment({ tone: 'streak', hero: flameHero(st), kicker: newBest ? 'NEW RECORD' : 'STREAK', title: `${st}-day streak!`, body: line, extra: weekDots(row, today) });
  } else if (M.perfectWeek(pr, events, today) && !pr.seen[wk]) {
    pr.seen[wk] = true; save();
    moment({ tone: 'win', kicker: 'PERFECT WEEK', title: 'Every session this week, done.', body: 'You did exactly what you planned. That’s rare. Rest well.', extra: weekDots(row, null) });
  } else if (!wasDone) toast(`${st}-day streak. Keep going!`, null, { top: true, spark: 'proud' });
  else toast('Session done. Nice!');
}

/** On open: notice reading days with nothing ticked and respond kindly. */
function checkMisses() {
  if (!P().onboarded) return;
  const pr = state.progress, today = todayISO();
  if (pr.lastCheck >= today) return;
  const { events } = weekEvents();
  if (!events.length) { if (!Object.keys(pr.done).length) pr.since = today; pr.lastCheck = today; save(); return; }
  const before = M.streak(pr, today);
  const r = M.findMisses(pr, state.plan.days, today, state.plan.untilISO);
  r.missed.forEach((d) => { pr.missed[d] = true; });
  pr.lastCheck = today; save();
  if (!r.missed.length) return;
  const lost = before - M.streak(pr, today);
  const recent = Object.keys(pr.missed).filter((d) => d >= M.addDays(today, -7)).length;
  const title = r.away ? `Welcome back, ${firstName()}` : r.missed.length === 1 ? `You missed ${DAYS_LONG[M.weekdayOf(r.missed[0])]}’s reading` : `You missed ${r.missed.length} reading days`;
  moment({
    tone: 'miss', mood: 'worried', kicker: r.away ? 'FRESH START' : 'MISSED READING', title,
    body: `${lost > 1 ? `Your ${before}-day streak ended${pr.best > before ? `, but your record of ${pr.best} days still stands` : ''}. ` : ''}No guilt. What matters is today: tick one session and you’re back on.`,
    extra: weekDots(M.weekRow(pr, state.plan.days, today), null), ok: 'Back on it',
    secondary: recent >= 2 ? { label: 'Make my week lighter', run: () => { PLAN_ACTIONS['act-lighter'](); save(); render(); toast(`Lighter week: ${weekSummary()}`); } } : null,
  });
}

/* ============================== Spark's line ============================== */

function sparkLine() {
  const cg = L.cgpa(state.semesters, P().policy), cur = L.inProgress(state.semesters), plan = calcPlan();
  const name = (P().name || '').split(' ')[0];
  if (!cg.units && !cur.length) return { mood: 'happy', text: `Hi ${esc(name)}! Start by uploading your result screenshots. All of them, at once.` };
  if (!cg.units) return { mood: 'focus', text: `No grades yet, ${esc(name)}. Let’s make this first semester count. Your plan is ready.` };
  if (!P().target) return { mood: 'happy', text: `CGPA ${f2(cg.gpa)}. What are you aiming for? Set a target and I’ll plan the way.` };
  if (plan.status === 'impossible') return { mood: 'worried', text: `${targetLabel()} is out of reach now, but ${L.classify(plan.best).label} is still yours. Want to retarget?` };
  if (plan.status === 'secured' || plan.status === 'achieved') return { mood: 'proud', text: `You’ve locked in ${targetLabel()}. Legend.` };
  if (plan.required <= (cg.gpa ?? 0) + 0.05) return { mood: 'proud', text: `You’re on track for ${targetLabel()}. Keep this exact energy.` };
  if (!cur.length) return { mood: 'focus', text: `Upload this semester’s course registration and I’ll tell you exactly what to aim for.` };
  return { mood: 'focus', text: `Your plan for ${targetLabel()} is ready. Follow it and you’ll get there.` };
}

/* ============================== Views ============================== */

const onb = { step: 0 };
const VIEWS = {
  onboarding() {
    const p = P();
    const steps = `<div class="steps" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<i class="${i <= onb.step ? 'on' : ''}"></i>`).join('')}</div>`;
    if (onb.step === 0) return `<div class="onb">${steps}
      <div class="say">${spark('happy', 96)}<div class="bubble">Hi! I’m Spark. Give me your results and I’ll show you where you stand and exactly how to hit your target.</div></div>
      <form id="onb" class="stack" novalidate>
        <div class="field"><label for="o-name">What should I call you?</label>
          <input id="o-name" name="name" value="${esc(p.name)}" autocomplete="given-name" placeholder="Your first name" autofocus>
          <span class="error" id="o-name-err" hidden>Tell me your name first.</span></div>
        <button class="btn primary block">Continue</button>
        <p class="hint">No account, no email. Your results stay on your phone.</p></form></div>`;
    if (onb.step === 1) return `<div class="onb">${steps}<h1>About you</h1>
      <form id="onb" class="stack">
        <label class="option"><input type="radio" name="prog" value="csc" checked><span>Computer Science<span class="sub">Faculty of Computing · more departments coming soon</span></span></label>
        <fieldset class="stack-sm"><legend class="legend">How do you study?</legend>
          <div class="grid-2">${[['full', 'Full-time'], ['part', 'Part-time']].map(([v, l]) => `<label class="option"><input type="radio" name="mode" value="${v}" ${p.mode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
        <fieldset class="stack-sm"><legend class="legend">How did you come in?</legend>
          <label class="option"><input type="radio" name="entry" value="utme" ${p.entry === 'utme' ? 'checked' : ''}><span>Started at 100 level<span class="sub">4-year programme</span></span></label>
          <label class="option"><input type="radio" name="entry" value="de" ${p.entry === 'de' ? 'checked' : ''}><span>Direct entry<span class="sub">3-year programme</span></span></label></fieldset>
        <div class="field"><label for="o-level">Your level now</label><select id="o-level" name="level">${[100, 200, 300, 400].map((l) => `<option ${p.level === l ? 'selected' : ''} value="${l}">${l} level</option>`).join('')}</select></div>
        <div class="row"><button type="button" class="btn" data-action="onb-back">Back</button><button class="btn primary grow">Continue</button></div></form></div>`;
    if (onb.step === 2) return `<div class="onb">${steps}
      <div class="say">${spark('focus', 80)}<div class="bubble">What class do you want to graduate with? Be bold. I’ll tell you if it’s still possible.</div></div>
      <form id="onb" class="stack"><fieldset class="class-pick"><legend class="sr-only">Target class</legend>
        ${BIU.classes.slice(0, 3).map((c) => `<label class="${CLASS_CSS[c.short]}"><span>${c.label}<br><span class="tiny">CGPA ${c.min.toFixed(2)} and above</span></span><input type="radio" name="target" value="${c.min}" ${p.target === c.min ? 'checked' : ''}></label>`).join('')}
      </fieldset>
      <div class="row"><button type="button" class="btn" data-action="onb-back">Back</button><button class="btn primary grow">Continue</button></div>
      <button type="button" class="btn ghost" data-action="onb-skip-target">Decide later</button></form></div>`;
    return `<div class="onb">${steps}
      <div class="say">${spark('happy', 80)}<div class="bubble">Now the fun part${p.name ? `, ${esc(p.name.split(' ')[0])}` : ''}. Screenshot your portal pages and pick them all at once:</div></div>
      <div class="card stack-sm">
        <p class="row" style="gap:12px"><span class="g gA" aria-hidden="true">1</span><span><b>Every result page</b>, all levels and semesters you’ve finished</span></p>
        <p class="row" style="gap:12px"><span class="g gB" aria-hidden="true">2</span><span><b>This semester’s course registration</b>, so I can plan it</span></p>
        <p class="hint">I sort everything by course code. No need to tell me which level or semester.</p></div>
      <button class="btn primary block" data-action="import">${I.camera}Choose screenshots</button>
      <p class="hint" id="warm" aria-live="polite"></p>
      <button class="btn block" data-action="onb-fresher">I’m a fresher, no results yet</button>
      <button class="btn ghost" data-action="onb-manual">Type my grades instead</button></div>`;
  },

  home() {
    const p = P(), cg = L.cgpa(state.semesters, p.policy), plan = calcPlan(), line = sparkLine();
    const ch = coachNow();
    if (!cg.units && !ch.courses.length) {
      return `<div class="stack"><div class="say">${spark(line.mood, 64)}<div class="bubble">${line.text}</div></div>
        <div class="card stack" style="text-align:center;justify-items:center"><h2>Start here</h2>
        <p class="muted">Screenshot your result pages and this semester’s registration on the BIU portal, then pick them all at once.</p>
        <button class="btn primary" data-action="import">${I.camera}Upload screenshots</button><button class="btn ghost sm" data-action="type-results">Type grades instead</button></div>${installCard()}</div>`;
    }
    const cls = cg.gpa != null ? L.classify(cg.gpa) : null;
    const W = BIU.weights[p.entry];
    const series = L.seriesStats(state.semesters, p.policy);
    const need = p.target && plan.status === 'possible'
      ? `To graduate with <b>${esc(targetLabel())}</b>, average <b>${f2(plan.required)}</b> in every course from now on.`
      : p.target && plan.status === 'impossible' ? `<b>${esc(targetLabel())}</b> is out of reach now. The best you can still finish with is <b>${f2(plan.best)}</b> (${esc(L.classify(plan.best).label)}).`
      : p.target ? `<b>${esc(targetLabel())}</b> is locked in. Just keep passing.` : `<button class="btn sm" data-action="set-target">Set a target class</button> to see what you need.`;
    const curCard = ch.courses.length ? `<section class="card flush" aria-labelledby="cur-h">
      <div class="card-head"><div><h2 id="cur-h">This semester</h2><p class="tiny muted">${p.target ? `Hit these and this semester comes to <b>${f2(ch.projection.semesterGpa)}</b>` : 'Set a target to get grade goals'}</p></div></div>
      <div class="list">${ch.courses.map((c) => `<div class="item"><div class="grow"><div class="title">${esc(c.code)}</div><div class="sub">${hrs(c.minutes)} reading a week · ${['', 'easier for you', 'medium', 'hard for you'][c.difficulty]}</div></div>
        ${c.target ? `<span class="tiny muted">aim for</span>${gradeChip(c.target)}` : ''}</div>`).join('')}</div>
      <div style="padding:12px 14px 14px;border-top:1px solid var(--line)"><a class="btn primary block" href="#plan">Open my plan ${I.arrow}</a></div></section>`
      : `<section class="card stack-sm"><h2>Plan this semester</h2><p class="small muted">Upload this semester’s course registration and I’ll give you a grade goal and reading time for each course.</p>
        <button class="btn primary" data-action="import">${I.camera}Upload registration</button></section>`;
    const next = nextSession();
    return `<div class="stack">
      <div class="say">${spark(line.mood, 64)}<div class="bubble">${line.text}</div></div>
      ${cg.units ? `<section class="card stack" aria-labelledby="st-h"><h2 id="st-h" class="sr-only">Where you stand</h2>
        <div class="tile ${clsCss(cg.gpa)} stack-sm"><span class="label">Your CGPA</span><span class="big" id="cgpa-num" data-v="${cg.gpa}">${f2(cg.gpa)}</span>
          <b>${esc(cls.label)}</b><span class="tiny">from ${cg.units} units of results</span></div>
        <p>${need}</p></section>` : ''}
      ${todayCard(next)}
      ${curCard}
      ${p.calc === 'simple' || !cg.units ? '' : `<section class="card stack-sm" aria-labelledby="lv-h"><h2 id="lv-h">Why later levels matter more</h2>
        <p class="small muted">At BIU, each level counts a different amount toward your final class. Bigger tile, bigger say.</p>
        <div class="levels">${[100, 200, 300, 400].filter((s) => W[s] > 0).map((s) => { const g = series[s].gpa; return `<div class="lvl ${g != null ? 'done ' + clsCss(g) : ''} ${p.level === s ? 'current' : ''}" style="flex:${W[s] * 100} 1 0" aria-label="${s} level counts ${Math.round(W[s] * 100)} percent${g != null ? `, your GPA ${f2(g)}` : ''}"><span>${s}L</span><b class="num">${g != null ? f2(g) : '—'}</b><span>${Math.round(W[s] * 100)}%</span></div>`; }).join('')}</div></section>`}
      ${installCard()}</div>`;
  },

  plan() {
    const p = P(), ch = coachNow(), pl = state.plan;
    if (!ch.courses.length) return `<div class="card stack" style="text-align:center;justify-items:center">${spark('focus', 72)}<h2>No courses for this semester yet</h2>
      <p class="muted">Upload a screenshot of this semester’s course registration on the portal and I’ll build your plan.</p>
      <button class="btn primary" data-action="import">${I.camera}Upload registration</button><button class="btn ghost sm" data-action="fresher-courses">Use the handbook courses</button></div>`;
    const total = ch.slots.length * pl.length;
    const order = [...ch.courses].sort((a, b) => b.minutes - a.minutes);
    const intro = !p.target ? `<div class="callout info row spread wrap"><span>Set a target class and I’ll give each course a grade goal.</span><button class="btn sm" data-action="set-target">Set target</button></div>`
      : ch.plan.status === 'impossible' ? `<div class="callout bad">${esc(targetLabel())} is out of reach now. Aiming for the best possible: ${f2(ch.plan.best)}. <button class="btn sm" data-action="set-target">Change target</button></div>`
      : `<div class="say">${spark('focus', 56)}<div class="bubble">To stay on track for <b>${esc(targetLabel())}</b>, aim for these grades. Together they make <b>${f2(ch.projection.semesterGpa)}</b> this semester.</div></div>`;
    return `<div class="stack-lg">
      <section class="stack" aria-labelledby="g-h">
        <div><p class="tiny muted" style="font-weight:900">STEP 1 OF 3</p><h1 id="g-h">What to aim for</h1></div>${intro}
        ${order.map((c) => { const adv = L.adviceFor(c); return `<article class="card stack-sm" aria-labelledby="c-${c.id}">
          <div class="row spread" style="align-items:flex-start"><div><h2 id="c-${c.id}">${esc(c.code)}</h2><p class="tiny muted">${esc(c.title || '')} · ${c.units} units</p></div>
            ${c.target ? `<button class="aimchip" data-action="pick-target" data-id="${c.id}" aria-label="Aim for ${c.target} in ${esc(c.code)}. Change"><span class="tiny">Aim for</span>${gradeChip(c.target)}</button>` : ''}</div>
          <ul class="why">${adv.map((a) => `<li>${esc(a)}</li>`).join('')}${c.targetAuto || !c.target ? '' : '<li>You chose this grade</li>'}</ul>
          <div class="row spread wrap" style="gap:8px"><div class="seg" role="radiogroup" aria-label="How hard is ${esc(c.code)} for you?">${[[1, 'Easy'], [2, 'Medium'], [3, 'Hard']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${c.difficulty === v}" data-action="diff" data-id="${c.id}" data-v="${v}">${l}</button>`).join('')}</div>
            <b class="small">${hrs(c.minutes)} / week</b></div>
          <div class="bar" aria-hidden="true"><i style="width:${total ? (c.minutes / total) * 100 : 0}%"></i></div></article>`; }).join('')}
        <p class="hint">Grade goals update by themselves as your results change. Tap a grade to set your own. Tap Easy, Medium or Hard and your reading time changes.</p>
      </section>

      <section class="stack" aria-labelledby="w-h">
        <div><p class="tiny muted" style="font-weight:900">STEP 2 OF 3</p><h1 id="w-h">Your reading week</h1></div>
        <p class="small muted">${pl.custom ? 'You chose these times.' : `I set up <b>${hrs(total)}</b> a week, enough for your ${ch.courses.reduce((s, c) => s + c.units, 0)} units.`} I decide which course goes in each slot, giving more time to the hard ones.</p>
        <div id="plan-out" aria-live="polite">${weekOut()}</div>
        <details class="card" ${pl.custom ? 'open' : ''}><summary style="cursor:pointer;font-weight:900;min-height:32px">Change when I read</summary>
          <div class="stack" style="margin-top:14px">
            <fieldset class="stack-sm"><legend class="legend">Days</legend><div class="chips">${WEEK.map((d) => `<button type="button" class="chip" data-action="day" data-day="${d}" aria-pressed="${pl.days.includes(d)}" aria-label="${DAYS_LONG[d]}">${DAYS[d]}</button>`).join('')}</div></fieldset>
            <div class="grid-2">
              <div class="field"><label for="p-start">Start time</label><input id="p-start" type="time" value="${esc(pl.start)}" data-plan="start"></div>
              <div class="field"><label for="p-len">Each session</label><select id="p-len" data-plan="length">${[30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${pl.length === m ? 'selected' : ''}>${m < 60 ? m + ' min' : m / 60 + ' h'}</option>`).join('')}</select></div>
              <div class="field"><label for="p-per">Sessions a day</label><select id="p-per" data-plan="perDay">${[1, 2, 3, 4].map((n) => `<option ${pl.perDay === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
              <div class="field"><label for="p-until">Until exams</label><input id="p-until" type="date" value="${esc(pl.untilISO)}" data-plan="untilISO"></div>
            </div>
            ${pl.custom ? '<button class="btn sm" data-action="reset-week">Let Aim choose again</button>' : ''}
          </div></details></section>

      <section class="stack" aria-labelledby="r-h">
        <div><p class="tiny muted" style="font-weight:900">STEP 3 OF 3</p><h1 id="r-h">Get reminded</h1></div>
        <div id="rem-out">${remindersOut()}</div></section>
    </div>`;
  },

  results() {
    const p = P(), re = L.retakes(state.semesters);
    const cards = state.semesters.map((s) => {
      const g = L.semesterGpa(s);
      return `<section class="card flush" aria-labelledby="h-${s.id}">
        <div class="card-head"><div><h2 id="h-${s.id}">${esc(s.name)}</h2><p class="tiny muted">${s.courses.reduce((a, c) => a + c.units, 0)} units${s.current ? ' · in progress' : ''}</p></div>
          <div class="row">${g.gpa != null ? `<span class="tile ${clsCss(g.gpa)} num" style="padding:6px 12px;border-radius:12px">${f2(g.gpa)}</span>` : ''}
          <button class="icon-btn" data-action="edit-sem" data-id="${s.id}" aria-label="Edit ${esc(s.name)}">${I.edit}</button></div></div>
        ${s.courses.length ? `<div class="list">${s.courses.map((c) => `<button class="item" data-action="edit-course" data-id="${c.id}" aria-label="${esc(c.code)}, ${c.units} units, ${c.grade ? 'grade ' + c.grade : 'this semester'}. Edit">
          <div class="grow"><div class="title">${esc(c.code)}${re.includes(c.code) ? ' <span class="flag">retake</span>' : ''}</div><div class="sub">${esc(c.title || '')}${c.title ? ' · ' : ''}${c.units} unit${c.units === 1 ? '' : 's'}</div></div>${gradeChip(c.grade)}</button>`).join('')}</div>` : '<p class="muted small" style="padding:0 20px 12px">No courses yet.</p>'}
        <div style="padding:8px 12px 12px;border-top:1px solid var(--line)"><button class="btn ghost sm" data-action="add-courses" data-sem="${s.id}">${I.plus}Add a course</button></div></section>`;
    }).join('');
    return `<div class="stack">
      <button class="btn primary block" data-action="import">${I.camera}Upload screenshots</button>
      <p class="hint" style="text-align:center">Results and registration pages, as many as you like. I sort them by course code.</p>
      ${state.semesters.length ? cards : `<div class="card stack" style="text-align:center;justify-items:center">${spark('happy', 72)}<h2>No results yet</h2><p class="muted">Upload your portal screenshots, or type your grades.</p><button class="btn" data-action="type-results">Type grades</button></div>`}
      ${state.semesters.length ? '<button class="btn ghost" data-action="type-results">Type grades for another semester</button>' : ''}
      ${re.length ? `<p class="tiny muted">Retakes: ${re.map(esc).join(', ')}. ${p.policy === 'all' ? 'Every attempt counts in your CGPA' : 'Only the latest attempt counts'} (change in Settings).</p>` : ''}
    </div>`;
  },

  ask() {
    greet();
    const acts = [['act-lighter', 'Make my week lighter'], ['act-more', 'I can read more'], ['act-morning', 'Read in the mornings'], ['act-night', 'Read at night'], ['act-weekend', 'Add Saturday'], ['act-hard', 'A course is hard for me']];
    return `<div class="stack">
      <div id="chat" class="chat" aria-live="polite">${chat.map(msgHtml).join('')}</div>
      <div><p class="tiny muted" style="font-weight:900;margin-bottom:4px">CHANGE MY PLAN</p><div class="suggest" role="group" aria-label="Change my plan">${acts.map(([a, l]) => `<button class="chip act" data-act="${a}">${esc(l)}</button>`).join('')}</div></div>
      <div><p class="tiny muted" style="font-weight:900;margin-bottom:4px">ASK ME</p><div class="suggest" role="group" aria-label="Questions you can ask">${QUESTIONS.map((q) => `<button class="chip" data-ask="${q.id}">${esc(q.label)}</button>`).join('')}</div></div>
      <form id="ask-form" class="row" autocomplete="off"><label class="sr-only" for="ask-in">Ask Spark</label>
        <input id="ask-in" placeholder="e.g. “make my week lighter” or “MTH 211 is hard”" maxlength="140"><button class="btn blue" aria-label="Send" style="min-width:56px;padding:0 14px">${I.send}</button></form>
      <p class="tiny muted">Spark answers from the BIU handbook and your results, and can change your plan. Nothing leaves your phone.</p></div>`;
  },

  settings() {
    const p = P(), icon = store.getItem(ICON_BIG);
    return `<div class="stack">
      <section class="card stack" aria-labelledby="s-you"><h2 id="s-you">You</h2>
        <div class="field"><label for="s-name">Name</label><input id="s-name" value="${esc(p.name)}" data-profile="name" autocomplete="given-name"></div>
        <div class="grid-2">
          <div class="field"><label for="s-mode">Study mode</label><select id="s-mode" data-pset="mode"><option value="full" ${p.mode === 'full' ? 'selected' : ''}>Full-time</option><option value="part" ${p.mode === 'part' ? 'selected' : ''}>Part-time</option></select></div>
          <div class="field"><label for="s-level">Level</label><select id="s-level" data-pset="level">${[100, 200, 300, 400].map((l) => `<option value="${l}" ${p.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="field"><label for="s-entry">Entry</label><select id="s-entry" data-pset="entry"><option value="utme" ${p.entry === 'utme' ? 'selected' : ''}>100 level start (4-year)</option><option value="de" ${p.entry === 'de' ? 'selected' : ''}>Direct entry (3-year)</option></select></div>
        <div class="field"><label for="s-target">Target class</label><select id="s-target" data-pset="target"><option value="">Not set</option>${BIU.classes.slice(0, 4).map((c) => `<option value="${c.min}" ${p.target === c.min ? 'selected' : ''}>${c.label} (${c.min.toFixed(2)})</option>`).join('')}</select></div>
      </section>
      <section class="card stack" aria-labelledby="s-rules"><h2 id="s-rules">How Aim calculates</h2>
        <div class="field"><label for="s-calc">Degree class</label><select id="s-calc" data-pset="calc"><option value="weighted" ${p.calc === 'weighted' ? 'selected' : ''}>Weighted by level (handbook §27)</option><option value="simple" ${p.calc === 'simple' ? 'selected' : ''}>Simple CGPA</option></select>
          <span class="hint">${p.mode === 'part' ? 'Part-time: ask your course adviser whether the weighting applies to you.' : 'BIU weights each level: 5% / 20% / 35% / 40%.'}</span></div>
        <div class="field"><label for="s-policy">Retaken courses</label><select id="s-policy" data-pset="policy"><option value="all" ${p.policy === 'all' ? 'selected' : ''}>Every attempt counts</option><option value="latest" ${p.policy === 'latest' ? 'selected' : ''}>Only the latest attempt counts</option></select></div>
      </section>
      <section class="card stack" aria-labelledby="s-feel"><h2 id="s-feel">Feel</h2>
        <label class="option"><input type="checkbox" id="s-sound" ${p.sound ? 'checked' : ''}><span>Sounds and vibration<span class="sub">Spark cheers when you do well</span></span></label>
        <div class="field"><label for="s-theme">Appearance</label><select id="s-theme" data-pset="theme">${[['system', 'Match my phone'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${p.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </section>
      <section class="card stack" aria-labelledby="s-icon"><h2 id="s-icon">App icon</h2>
        <div class="row"><img src="${icon || 'icons/icon-192.png'}" alt="Current app icon" width="64" height="64" style="border-radius:16px;object-fit:cover">
          <p class="small muted grow">Use your own picture as Aim’s icon. <b style="color:var(--ink)">Set it before you install</b>; changing it later needs a reinstall.</p></div>
        <div id="icon-editor"></div>
        <div class="row wrap"><label class="btn sm" for="icon-file" tabindex="0" role="button" data-keyclick>Choose picture</label>
          <input id="icon-file" type="file" accept="image/*" class="sr-only" tabindex="-1">${icon ? '<button class="btn sm" data-action="icon-reset">Use default</button>' : ''}</div></section>
      <section class="card stack" aria-labelledby="s-inst"><h2 id="s-inst">Install</h2>${installBody()}</section>
      <section class="card stack" aria-labelledby="s-data"><h2 id="s-data">Privacy & data</h2>
        <p class="small muted">Your results live only on this phone. Screenshots are read on the phone and never uploaded. There are no accounts, no tracking and no ads.</p>
        <div class="row wrap"><button class="btn sm" data-action="export">Back up</button>
          <label class="btn sm" for="import-file" tabindex="0" role="button" data-keyclick>Restore backup</label><input id="import-file" type="file" accept=".json,application/json" class="sr-only" tabindex="-1"></div>
        <button class="btn danger sm" data-action="wipe">Delete all my data</button></section>
      <p class="tiny muted" style="text-align:center">Aim 2.2 · for Benson Idahosa University students · not an official BIU app</p></div>`;
  },
};

function todayCard(next) {
  const { events } = weekEvents(); if (!events.length) return '';
  const pr = state.progress, today = todayISO(), wd = new Date().getDay(), pl = state.plan;
  const inRange = today >= pl.fromISO && today <= pl.untilISO;
  const todays = inRange ? events.filter((e) => e.day === wd).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const st = M.streak(pr, today), done = pr.done[today] || [];
  const code = (e) => esc(e.title.replace('Study: ', ''));
  return `<section class="card stack-sm" aria-labelledby="td-h">
    <div class="row spread"><h2 id="td-h">Today’s reading</h2><span class="streak-chip ${st ? 'on' : ''}" title="Reading streak">${FLAME}<b class="num">${st}</b><span class="sr-only">-day streak</span></span></div>
    ${weekDots(M.weekRow(pr, pl.days, today))}
    ${todays.length ? `<div class="list" style="margin:0 -20px">${todays.map((e) => { const on = done.includes(e.uid); return `<div class="item"><div class="grow"><div class="title">${code(e)}</div><div class="sub">${e.start}–${e.end}</div></div>
      <button class="tick ${on ? 'on' : ''}" data-action="session-done" data-uid="${esc(e.uid)}" aria-pressed="${on}" aria-label="${code(e)} at ${e.start}: ${on ? 'done' : 'mark done'}">${I.check}<span>${on ? 'Done' : 'Done?'}</span></button></div>`; }).join('')}</div>`
      : `<p class="small muted">Rest day.${next ? ` Next: <b style="color:var(--ink)">${esc(next.when)}, ${next.start}</b> · ${code(next)}` : ''}</p>`}
    ${!Object.keys(pr.done).length && todays.length ? '<p class="hint">Finished a session? Tick it to start your streak.</p>' : pr.best > st && pr.best >= 3 ? `<p class="hint">Your best: ${pr.best} days.</p>` : ''}
  </section>`;
}

/* ---------- week + reminders ---------- */
function weekEvents() { const ch = coachNow(); return { ch, events: L.slotsToEvents(ch.slots, ch.courses) }; }
function weekOut() {
  const pl = state.plan;
  if (!pl.days.length) return '<div class="callout warn">Pick at least one day.</div>';
  if (L.timeToMinutes(pl.start) == null) return '<div class="callout warn">Enter a start time.</div>';
  const { ch } = weekEvents();
  if (!ch.slots.length) return '<div class="callout warn">Those sessions would run past midnight. Start earlier.</div>';
  const byId = Object.fromEntries(ch.courses.map((c) => [c.id, c]));
  return `<div class="card flush">${WEEK.filter((d) => ch.slots.some((s) => s.day === d)).map((d) => `<div class="day"><b>${DAYS[d]}</b><div>${ch.slots.filter((s) => s.day === d).map((s) => `<div class="session"><span>${esc(byId[s.courseId]?.code || '')}</span><span class="t">${s.start}–${s.end}</span></div>`).join('')}</div></div>`).join('')}</div>`;
}
function remindersOut() {
  const pl = state.plan;
  const { events } = weekEvents();
  if (!events.length) return '<p class="muted small">Your week needs at least one session first.</p>';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone, opts = { fromISO: pl.fromISO, untilISO: pl.untilISO };
  const added = events.filter((e) => pl.added[e.uid]).length;
  const ics = `<button class="btn ${isAndroid ? '' : 'primary'} block" data-action="ics">${I.cal}Add all to my calendar</button>
    <p class="hint">${isIOS ? 'iPhone: tap “Add All” when Calendar opens. If nothing happens in the installed app, open Aim in Safari for this step.' : isAndroid ? 'Works if your calendar app opens .ics files (e.g. Samsung Calendar). Otherwise use the Google buttons below.' : 'Opens in Apple Calendar or Outlook. Google Calendar on a computer: Settings → Import.'}</p>`;
  const google = `<div class="row spread"><h3>Google Calendar</h3><span class="tiny muted">${added}/${events.length} added</span></div>
    <p class="hint">Each button adds one weekly session. Tap Save in Google, then come back for the next.</p>
    <div class="list" style="margin:0 -20px">${events.map((e) => `<div class="item"><div class="grow"><div class="title">${esc(e.title.replace('Study: ', ''))}</div><div class="sub">Every ${DAYS_LONG[e.day]} · ${e.start}–${e.end}</div></div>
      <a class="btn sm ${pl.added[e.uid] ? '' : 'blue'}" href="${esc(L.googleCalendarUrl(e, opts, tz))}" target="_blank" rel="noopener" data-gcal="${esc(e.uid)}">${pl.added[e.uid] ? I.check + 'Added' : 'Add' + I.ext}</a></div>`).join('')}</div>`;
  return `<div class="card stack"><div class="field"><label for="p-alarm">Remind me</label><select id="p-alarm" data-plan="alarm">${[0, 5, 10, 15, 30, 60].map((n) => `<option value="${n}" ${pl.alarm === n ? 'selected' : ''}>${n ? n + ' minutes before' : 'At start time'}</option>`).join('')}</select></div>
    ${isAndroid ? google + ics : ics + google}<p class="tiny muted">Changed your plan? Delete the old sessions from your calendar first so they don’t double up.</p></div>`;
}
function refreshPlanParts() { const a = $('#plan-out'), b = $('#rem-out'); if (a) a.innerHTML = weekOut(); if (b) b.innerHTML = remindersOut(); }

function nextSession() {
  const pl = state.plan, today = todayISO();
  if (!pl.fromISO || !pl.untilISO || today > pl.untilISO) return null;
  const { events } = weekEvents(); if (!events.length) return null;
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const start = today < pl.fromISO ? new Date(pl.fromISO + 'T12:00:00') : now;
  for (let add = 0; add < 8; add++) {
    const d = new Date(start); d.setDate(d.getDate() + add);
    const iso = isoOf(d); if (iso > pl.untilISO) return null;
    for (const e of events.filter((x) => x.day === d.getDay()).sort((a, b) => a.start.localeCompare(b.start))) {
      if (iso === today && L.timeToMinutes(e.start) <= nowMin) continue;
      return { ...e, when: iso === today ? 'Today' : add === 1 && today >= pl.fromISO ? 'Tomorrow' : DAYS_LONG[d.getDay()] };
    }
  }
  return null;
}

/* ---------- install ---------- */
let deferredInstall = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (['home', 'settings'].includes(currentRoute())) render(); });
addEventListener('appinstalled', () => { deferredInstall = null; cheer('Aim is installed!', 'proud'); render(); });
function installBody() {
  if (isStandalone()) return `<p class="small">${I.check.replace('<svg', '<svg width="18" height="18" style="vertical-align:-3px;color:var(--lime-d)"')} Installed on this device.</p>`;
  if (deferredInstall) return `<p class="small muted">Put Aim on your home screen. It opens like an app and works offline.</p><button class="btn primary" data-action="install">Install Aim</button>`;
  if (isIOS) return '<ol class="small" style="margin:0;padding-left:20px"><li>Open this page in <b>Safari</b></li><li>Tap <b>Share</b></li><li>Tap <b>Add to Home Screen</b></li></ol>';
  return '<p class="small muted">In Chrome or Samsung Internet, open the menu and tap <b>Install app</b> or <b>Add to Home screen</b>.</p>';
}
function installCard() {
  if (isStandalone() || P().installDismissed) return '';
  const has = !!store.getItem(ICON_BIG);
  return `<section class="card stack-sm" aria-labelledby="in-h"><div class="row spread"><h2 id="in-h">Make Aim yours</h2><button class="icon-btn" data-action="dismiss-install" aria-label="Dismiss">${I.x}</button></div>
    <p class="small muted">Install Aim with your own picture as the icon.</p>
    <div class="row wrap"><a class="btn sm" href="#settings">${has ? I.check + 'Icon set' : 'Choose icon picture'}</a>${deferredInstall ? '<button class="btn primary sm" data-action="install">Install</button>' : '<a class="btn ghost sm" href="#settings">How to install</a>'}</div></section>`;
}

/* ============================== Chat & plan actions ============================== */

const chat = [];
let msgN = 0;
function msgHtml(m) {
  if (m.me) return `<div class="msg me">${esc(m.text)}</div>`;
  if (m.typing) return `<div class="botrow">${spark('happy', 36)}<div class="msg bot typing" aria-label="Spark is typing"><i></i><i></i><i></i></div></div>`;
  return `<div class="botrow">${spark(m.mood || 'happy', 36)}<div class="msg bot">${m.html}
    ${m.picker ? `<div class="stack-sm" style="margin-top:10px"><label class="sr-only" for="wi-c-${m.n}">Course</label><select id="wi-c-${m.n}" data-wi-course="${m.n}">${m.picker.courses.map((c) => `<option value="${c.id}">${esc(c.code)}</option>`).join('')}</select>
      ${m.picker.kind === 'hard' ? `<div class="seg" role="group" aria-label="How hard">${[[1, 'Easy'], [2, 'Medium'], [3, 'Hard']].map(([v, l]) => `<button type="button" data-hard="${v}" data-n="${m.n}">${l}</button>`).join('')}</div>`
        : `<div class="gpick" role="group" aria-label="Grade">${L.GRADES.map((g) => `<button type="button" class="${g}" data-wi-grade="${g}" data-n="${m.n}" style="background:var(--g${g})">${g}</button>`).join('')}</div>`}</div>` : ''}
    ${m.action ? `<div style="margin-top:10px"><button class="btn sm primary" data-chat-action="${m.action.id}">${esc(m.action.label)}</button></div>` : ''}</div></div>`;
}
function botSay(res) {
  chat.push({ typing: true });
  if (currentRoute() === 'ask') render();
  setTimeout(() => {
    chat.pop(); chat.push({ ...res, n: ++msgN });
    if (currentRoute() === 'ask') { render(); $('#chat')?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (res.mood === 'proud') sound.ding(); else sound.tap();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500);
}
function greet() {
  if (chat.length) return;
  const n = (P().name || '').split(' ')[0];
  chat.push({ n: ++msgN, mood: 'happy', html: `<p>Hey ${esc(n)}! Ask me about your results, or tell me how to change your plan. I’ll update it for you.</p>` });
}

/** Plan-changing actions shared by Ask chips, typed messages and buttons. Each returns Spark's reply. */
function weekSummary() { const ch = coachNow(); return `${ch.slots.length} sessions, ${hrs(ch.slots.length * state.plan.length)} a week`; }
const PLAN_ACTIONS = {
  'act-lighter'() {
    const pl = state.plan; pl.custom = true;
    if (pl.perDay > 1) pl.perDay--; else if (pl.length > 30) pl.length = pl.length >= 90 ? 60 : pl.length === 60 ? 45 : 30; else if (pl.days.length > 1) pl.days = pl.days.slice(0, -1);
    return { mood: 'happy', html: `<p>Done. Your week is lighter now: <b>${weekSummary()}</b>. Hard courses still get the most time.</p>`, action: { id: 'go-plan', label: 'See my week' } };
  },
  'act-more'() {
    const pl = state.plan; pl.custom = true;
    if (pl.perDay < 3) pl.perDay++; else if (!pl.days.includes(6)) pl.days = [...pl.days, 6]; else if (!pl.days.includes(0)) pl.days = [...pl.days, 0];
    return { mood: 'proud', html: `<p>Love it. Your week now has <b>${weekSummary()}</b>.</p>`, action: { id: 'go-plan', label: 'See my week' } };
  },
  'act-morning'() { state.plan.start = '06:00'; state.plan.custom = true; return { mood: 'happy', html: `<p>Early bird! Your sessions now start at <b>6:00</b>.</p>`, action: { id: 'go-plan', label: 'See my week' } }; },
  'act-night'() { state.plan.start = '20:00'; state.plan.custom = true; return { mood: 'happy', html: `<p>Night reader. Your sessions now start at <b>20:00</b>.</p>`, action: { id: 'go-plan', label: 'See my week' } }; },
  'act-weekend'() {
    const pl = state.plan; pl.custom = true;
    if (!pl.days.includes(6)) pl.days = [...pl.days, 6]; else if (!pl.days.includes(0)) pl.days = [...pl.days, 0];
    return { mood: 'happy', html: `<p>Weekend added. Your week now has <b>${weekSummary()}</b>.</p>`, action: { id: 'go-plan', label: 'See my week' } };
  },
};
function setDifficulty(id, v) {
  const f = findCourse(id); if (!f) return null;
  f.course.difficulty = v; f.course.diffManual = true; refreshAutoWeek(); save();
  const c = coachNow().courses.find((x) => x.id === id);
  return c;
}
function runAction(id, label) {
  if (!L.inProgress(state.semesters).length) { chat.push({ me: true, text: label }); botSay({ mood: 'focus', html: '<p>Add this semester’s courses first (upload your course registration), then I can plan your week.</p>' }); return; }
  if (id === 'act-hard') { chat.push({ me: true, text: label }); botSay({ mood: 'focus', html: '<p>Which course, and how hard is it for you?</p>', picker: { kind: 'hard', courses: coachNow().courses.map((c) => ({ id: c.id, code: c.code })) } }); return; }
  chat.push({ me: true, text: label });
  const res = PLAN_ACTIONS[id](); save(); botSay(res);
}
/** Typed messages: plan changes first, then questions. */
function routeTyped(text) {
  const t = ` ${text.toLowerCase()} `;
  const code = /\b([a-z]{3})\s?(\d{3})\b/.exec(t);
  if (code && /(hard|difficult|struggl|tough|weak|easy|simple)/.test(t)) {
    const c = coachNow().courses.find((x) => x.code === `${code[1].toUpperCase()} ${code[2]}`);
    if (c) return { kind: 'diff', id: c.id, v: /(easy|simple)/.test(t) ? 1 : 3 };
  }
  if (/(lighter|less|busy|tired|reduce|too much|cut)/.test(t)) return { kind: 'act', id: 'act-lighter' };
  if (/(more time|read more|study more|increase|extra|harder on myself)/.test(t)) return { kind: 'act', id: 'act-more' };
  if (/(morning|early)/.test(t)) return { kind: 'act', id: 'act-morning' };
  if (/(night|evening|late)/.test(t)) return { kind: 'act', id: 'act-night' };
  if (/(saturday|sunday|weekend)/.test(t)) return { kind: 'act', id: 'act-weekend' };
  const q = routeQuestion(text);
  return q ? { kind: 'q', id: q } : null;
}

/* ============================== Results: import (on-device OCR) ============================== */

let tessWorker = null, tessLoading = null, tessProgress = 0;
function warmOCR() {
  if (tessWorker) return Promise.resolve(tessWorker);
  if (tessLoading) return tessLoading;
  const base = new URL('vendor/tesseract/', location.href).href;
  tessLoading = (async () => {
    if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
    tessWorker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', gzip: true,
      logger: (m) => { if (m.status && m.progress != null && /load|init/.test(m.status)) { tessProgress = Math.max(tessProgress, m.progress); const w = $('#warm'); if (w) w.textContent = tessProgress < 1 ? `Getting the screenshot reader ready… ${Math.round(tessProgress * 100)}%` : 'Reader ready.'; } },
    });
    tessProgress = 1; const w = $('#warm'); if (w) w.textContent = 'Reader ready.';
    return tessWorker;
  })();
  tessLoading.catch(() => { tessLoading = null; });
  return tessLoading;
}

/** Enlarge small screenshots and boost contrast (phone portal pages use small grey text). */
async function prepImage(file) {
  let img;
  try { img = await createImageBitmap(file); } catch {
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w0 = img.width, h0 = img.height;
  let k = Math.min(2.5, Math.max(1, 1000 / w0));
  if (w0 * k * h0 * k > 10e6) k = Math.max(0.5, Math.sqrt(10e6 / (w0 * h0)));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data, hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) { const g = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0; p[i] = g; hist[g]++; }
  const total = p.length / 4; let lo = 0, hi = 255, acc = 0;
  for (; lo < 254; lo++) { acc += hist[lo]; if (acc > total * 0.01) break; }
  acc = 0; for (; hi > lo + 1; hi--) { acc += hist[hi]; if (acc > total * 0.01) break; }
  const span = Math.max(1, hi - lo);
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) { const v = ((p[i] - lo) * 255) / span; p[i] = v < 0 ? 0 : v > 255 ? 255 : v; sum += p[i]; }
  const mean = sum / total; // stretch around the page's own brightness: darkens thin grey text
  for (let i = 0; i < p.length; i += 4) { let v = (p[i] - mean) * 1.6 + mean; v = v < 0 ? 0 : v > 255 ? 255 : v; p[i] = p[i + 1] = p[i + 2] = v; }
  x.putImageData(d, 0, 0);
  return c;
}

function importSheet() {
  sheet(`<div class="sheet"><div class="row spread"><h2 id="dlg-title">Upload screenshots</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <label class="drop" for="imp-file" id="drop">${spark('happy', 64)}<b>Pick all your screenshots at once</b>
      <span class="small muted">Result pages from every semester, plus this semester’s course registration. I’ll sort them by course code.</span>
      <span class="btn primary sm" aria-hidden="true">${I.camera}Choose</span></label>
    <input id="imp-file" type="file" accept="image/*" multiple class="sr-only">
    <p class="tiny muted" id="warm" aria-live="polite">${tessWorker ? 'Reader ready.' : 'Getting the screenshot reader ready… (first time only, about 5 MB)'}</p>
    <p class="tiny muted">Read on your phone. Pictures never leave your device.</p></div>`);
  warmOCR().catch(() => {});
  const input = $('#imp-file'), drop = $('#drop');
  input.addEventListener('change', () => runImport([...input.files]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); runImport([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); });
}

async function runImport(files) {
  if (!files.length) return;
  const show = (pct, msg) => { dlg.innerHTML = `<div class="sheet" style="text-align:center;justify-items:center">${spark('focus', 72)}<h2 id="dlg-title">Reading your screenshots…</h2>
    <div class="bar" style="width:100%" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div><p class="small muted">${esc(msg)}</p></div>`; };
  show(4, tessWorker ? 'Starting' : 'Getting the reader ready (first time only)');
  const tick = setInterval(() => { if (!tessWorker) show(4 + tessProgress * 30, `Getting the reader ready… ${Math.round(tessProgress * 100)}%`); }, 400);
  const texts = [];
  try {
    const w = await warmOCR(); clearInterval(tick);
    for (let i = 0; i < files.length; i++) {
      show(35 + (i / files.length) * 60, `Reading picture ${i + 1} of ${files.length}`);
      const { data } = await w.recognize(await prepImage(files[i]));
      texts.push(data.text);
    }
  } catch {
    clearInterval(tick);
    dlg.innerHTML = `<div class="sheet">${spark('worried', 64)}<h2 id="dlg-title">I couldn’t read that</h2><p class="muted">The reader didn’t load (check your connection the first time) or a picture couldn’t be opened. You can type your grades instead.</p>
      <div class="sheet-actions"><button class="btn" data-close>Close</button></div></div>`;
    dlg.querySelector('[data-close]').onclick = () => dlg.close(); return;
  }
  window.__aimLastOCR = texts.join('\n---\n'); // for debugging misreads
  const seen = new Map();
  for (const t of texts) for (const c of L.parsePortalText(t, P().prog).courses) {
    const k = c.code + (c.grade ? ':g' : ':r');
    if (!seen.has(k)) seen.set(k, c);
  }
  // a registered course that also appears with a grade is a result: keep the graded one
  for (const [k, c] of [...seen]) if (k.endsWith(':r') && seen.has(c.code + ':g')) seen.delete(k);
  reviewSheet([...seen.values()]);
}

/** Group parsed rows the way they'll be saved: graded by course-code slot, ungraded into "This semester". */
function groupRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    let key, label;
    if (r.grade) { const s = L.codeSlot(r.code) || { level: P().level, sem: 1 }; key = `${s.level}-${s.sem}`; label = semName(s.level, s.sem); }
    else { key = 'current'; label = 'This semester (no grades yet)'; }
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].sort((a, b) => (a.key === 'current') - (b.key === 'current') || a.key.localeCompare(b.key));
}

function reviewSheet(found) {
  const rows = found.map((c) => ({ ...c, key: L.uid() }));
  if (!rows.length) {
    sheet(`<div class="sheet">${spark('worried', 64)}<h2 id="dlg-title">No courses found</h2><p class="muted">I couldn’t spot course codes. Use a screenshot of the results table (not a photo of the screen), or type your grades.</p>
      <div class="sheet-actions"><button class="btn" data-close>Close</button><button class="btn primary" id="rv-manual">Type grades</button></div></div>`);
    $('#rv-manual').onclick = () => { dlg.close(); typeResultsSheet(); }; return;
  }
  const groups = groupRows(rows);
  let idx = 0;
  sheet(`<form class="sheet" novalidate><div><h2 id="dlg-title">Check before saving</h2><p class="small muted">I found ${rows.length} course${rows.length > 1 ? 's' : ''}. Fix anything I misread, then save.</p></div>
    <div style="max-height:52vh;overflow:auto;margin:0 -22px">${groups.map((g) => `<div class="section-title" style="padding:12px 22px 4px">${esc(g.label)}</div>
      ${g.rows.map((r) => { const i = idx++; return `<div class="item" style="flex-wrap:wrap;gap:8px">
        <div class="grow" style="min-width:150px"><label class="sr-only" for="rv-c-${i}">Course code</label><input id="rv-c-${i}" name="code-${r.key}" value="${esc(r.code)}" style="min-height:44px;font-weight:900">
          <div class="tiny muted" style="margin-top:4px">${esc(r.title)} ${r.notes.map((n) => `<span class="flag">${esc(n)}</span>`).join(' ')}</div></div>
        <label class="sr-only" for="rv-u-${i}">Units</label><input id="rv-u-${i}" name="units-${r.key}" type="number" min="1" max="9" value="${r.units}" style="width:64px;min-height:44px" inputmode="numeric">
        <label class="sr-only" for="rv-g-${i}">Grade</label><select id="rv-g-${i}" name="grade-${r.key}" style="width:auto;min-height:44px"><option value="">This sem.</option>${L.GRADES.map((g2) => `<option ${r.grade === g2 ? 'selected' : ''}>${g2}</option>`).join('')}<option value="skip">Don’t add</option></select></div>`; }).join('')}`).join('')}</div>
    <span class="error" id="rv-err" hidden></span>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save ${rows.length} course${rows.length > 1 ? 's' : ''}</button></div></form>`,
  (f) => {
    const out = [];
    for (const r of rows) {
      const g = f.elements[`grade-${r.key}`].value; if (g === 'skip') continue;
      const code = L.normCode(f.elements[`code-${r.key}`].value), units = Number(f.elements[`units-${r.key}`].value);
      if (!/^[A-Z]{2,4} \d{3}$/.test(code) || !(units > 0 && units <= 9)) { const e = $('#rv-err'); e.textContent = `Check ${code || 'a course code'}: code like CSC 111, units 1–9.`; e.hidden = false; return; }
      out.push({ code, units, grade: g || null, title: r.title });
    }
    dlg.close();
    saveImported(out);
  });
}

/** Merge courses into the right semesters. Graded → semester by course code; ungraded → This semester. */
function saveImported(list, opts = {}) {
  const before = L.cgpa(state.semesters, P().policy), snapBefore = snap();
  const newCurrent = list.filter((c) => !c.grade);
  let cur = currentSem();
  if (newCurrent.length && cur && cur.courses.length && cur.courses.every((c) => c.grade)) {
    // last semester's results are all in: it stops being "this semester"
    const counts = {}; for (const c of cur.courses) { const s = L.codeSlot(c.code); if (s) { const k = `${s.level}-${s.sem}`; counts[k] = (counts[k] || 0) + 1; } }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) { const [l, s] = top.split('-').map(Number); cur.level = l; cur.sem = s; cur.name = `${semName(l, s)} (earlier session)`; }
    cur.current = false; cur = null;
  }
  for (const o of list) {
    const all = L.allCourses(state.semesters);
    if (o.grade) {
      const pending = all.find((c) => c.code === o.code && !c.grade);
      if (pending) { const f = findCourse(pending.id); Object.assign(f.course, { grade: o.grade, units: o.units }); continue; }
      const slot = L.codeSlot(o.code) || { level: P().level, sem: 1 };
      let sem = state.semesters.find((s) => !s.current && s.level === slot.level && s.sem === slot.sem && !/earlier session/.test(s.name));
      if (!sem) { sem = { id: L.uid(), level: slot.level, sem: slot.sem, current: false, name: semName(slot.level, slot.sem), courses: [] }; state.semesters.push(sem); }
      const ex = sem.courses.find((c) => c.code === o.code);
      if (ex) Object.assign(ex, { grade: o.grade, units: o.units, title: ex.title || o.title });
      else sem.courses.push({ id: L.uid(), code: o.code, title: o.title, units: o.units, grade: o.grade, target: null, targetManual: false, difficulty: 2, diffManual: false });
    } else {
      if (!cur) { cur = { id: L.uid(), level: P().level, sem: 1, current: true, name: 'This semester', courses: [] }; state.semesters.push(cur); }
      const ex = cur.courses.find((c) => c.code === o.code);
      if (ex) Object.assign(ex, { units: o.units, title: ex.title || o.title });
      else cur.courses.push({ id: L.uid(), code: o.code, title: o.title, units: o.units, grade: null, target: null, targetManual: false, difficulty: 2, diffManual: false });
    }
  }
  sortSemesters(state.semesters);
  if (!P().onboarded) P().onboarded = true;
  refreshAutoWeek();
  save();
  const after = L.cgpa(state.semesters, P().policy);
  const hasCurrent = L.inProgress(state.semesters).length > 0;
  if (opts.silent) { render(); return; }
  if (after.units && (!before.units || after.points !== before.points)) {
    location.hash = '#home'; render();
    if (!celebrate(snapBefore)) toast(`Saved. CGPA now ${f2(after.gpa)}.`);
  } else if (hasCurrent) {
    location.hash = '#plan'; render(); cheer('Your plan for this semester is ready!', 'happy');
  } else { render(); toast(`Saved ${list.length} course${list.length > 1 ? 's' : ''}`); }
}

/* ---------- typing grades (fallback) ---------- */
function typeResultsSheet() {
  sheet(`<form class="sheet"><h2 id="dlg-title">Which semester?</h2>
    <div class="grid-2"><div class="field"><label for="f-lv">Level</label><select id="f-lv" name="level">${[100, 200, 300, 400].map((l) => `<option value="${l}" ${P().level === l ? 'selected' : ''}>${l} level</option>`).join('')}</select></div>
    <div class="field"><label for="f-sm">Semester</label><select id="f-sm" name="sem"><option value="1">First</option><option value="2">Second</option></select></div></div>
    <p class="hint">I’ll list that semester’s courses from the handbook so you just pick grades.</p>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Next</button></div></form>`, (f) => {
    const level = Number(f.elements.level.value), s2 = Number(f.elements.sem.value);
    let sem = state.semesters.find((x) => !x.current && x.level === level && x.sem === s2);
    if (!sem) { sem = { id: L.uid(), level, sem: s2, current: false, name: semName(level, s2), courses: [] }; state.semesters.push(sem); sortSemesters(state.semesters); save(); }
    dlg.close(); if (!P().onboarded) { P().onboarded = true; save(); }
    location.hash = '#results'; render(); setTimeout(() => addCoursesSheet(sem.id), 60);
  });
}

function addCoursesSheet(semId) {
  const sem = state.semesters.find((s) => s.id === semId); if (!sem) return;
  const have = new Set(sem.courses.map((c) => c.code));
  const list = sem.current ? [] : semesterCourses(P().prog, sem.level, sem.sem).filter((c) => !have.has(c.code));
  const cat = catalog(P().prog);
  const opt = (sel) => `<option value="skip" ${sel === 'skip' ? 'selected' : ''}>Skip</option><option value="ip" ${sel === 'ip' ? 'selected' : ''}>This semester</option>${L.GRADES.map((g) => `<option value="${g}">${g}</option>`).join('')}`;
  sheet(`<form class="sheet" novalidate><div><h2 id="dlg-title">Add courses</h2><p class="small muted">${esc(sem.name)}</p></div>
    ${list.length ? `<div class="list" style="margin:0 -22px;max-height:46vh;overflow:auto">${list.map((c, i) => `<div class="item"><div class="grow"><div class="title">${esc(c.code)} <span class="tiny muted">${c.units}u</span></div><div class="sub">${esc(c.title)}</div></div>
      <label class="sr-only" for="ac-${i}">Grade for ${esc(c.code)}</label><select id="ac-${i}" name="g-${esc(c.code)}" style="width:auto;min-width:116px">${opt('skip')}</select></div>`).join('')}</div>
      <p class="hint">From the handbook. If your portal shows different units, fix them after saving.</p>` : ''}
    <details ${list.length ? '' : 'open'}><summary class="small" style="cursor:pointer;font-weight:800;color:var(--blue);min-height:32px">Add a course by code</summary>
      <div class="stack-sm" style="margin-top:10px"><div class="grid-2">
        <div class="field"><label for="x-code">Code</label><input id="x-code" name="xcode" list="codes" placeholder="e.g. PHY 111" autocapitalize="characters"></div>
        <div class="field"><label for="x-units">Units</label><input id="x-units" name="xunits" type="number" inputmode="numeric" min="1" max="9"></div></div>
        <div class="field"><label for="x-grade">Grade</label><select id="x-grade" name="xgrade">${opt(sem.current ? 'ip' : 'A')}</select></div>
        <datalist id="codes">${[...cat.values()].map((c) => `<option value="${c.code}">${esc(c.title)}</option>`).join('')}</datalist></div></details>
    <span class="error" id="ac-err" hidden></span>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`,
  (f) => {
    const add = [];
    for (const c of list) { const v = f.elements[`g-${c.code}`]?.value; if (v && v !== 'skip') add.push({ ...c, grade: v === 'ip' ? null : v }); }
    const xc = L.normCode(f.elements.xcode.value);
    if (xc) {
      const known = cat.get(xc), u = Number(f.elements.xunits.value) || known?.units, err = $('#ac-err');
      if (!/^[A-Z]{2,4} \d{3}$/.test(xc)) { err.textContent = 'Course code should look like PHY 111.'; err.hidden = false; return; }
      if (!(u > 0 && u <= 9)) { err.textContent = `Add the units for ${xc}.`; err.hidden = false; return; }
      if (have.has(xc) || add.some((a) => a.code === xc)) { err.textContent = `${xc} is already here.`; err.hidden = false; return; }
      const v = f.elements.xgrade.value; if (v !== 'skip') add.push({ code: xc, title: known?.title || '', units: u, grade: v === 'ip' ? null : v });
    }
    if (!add.length) { dlg.close(); return; }
    dlg.close();
    const snapBefore = snap();
    for (const a of add) {
      if (!a.grade && !sem.current) { saveImported([a], { silent: true }); continue; }
      sem.courses.push({ id: L.uid(), code: a.code, title: a.title, units: a.units, grade: a.grade, target: null, targetManual: false, difficulty: 2, diffManual: false });
    }
    refreshAutoWeek(); save(); render();
    if (!celebrate(snapBefore)) toast(`Added ${add.length} course${add.length > 1 ? 's' : ''}`);
  });
}

function semesterSheet(sem) {
  sheet(`<form class="sheet"><h2 id="dlg-title">${esc(sem.name)}</h2>
    ${sem.current ? '' : `<div class="grid-2"><div class="field"><label for="f-lv">Level</label><select id="f-lv" name="level">${[100, 200, 300, 400].map((l) => `<option value="${l}" ${sem.level === l ? 'selected' : ''}>${l} level</option>`).join('')}</select></div>
    <div class="field"><label for="f-sm">Semester</label><select id="f-sm" name="sem"><option value="1" ${sem.sem === 1 ? 'selected' : ''}>First</option><option value="2" ${sem.sem === 2 ? 'selected' : ''}>Second</option></select></div></div>`}
    <div class="sheet-actions"><button type="button" class="btn danger" data-del style="margin-right:auto">Delete</button><button type="button" class="btn" data-close>Cancel</button>${sem.current ? '' : '<button class="btn primary">Save</button>'}</div></form>`,
  (f) => { const l = Number(f.elements.level.value), s = Number(f.elements.sem.value); sem.level = l; sem.sem = s; sem.name = semName(l, s); sortSemesters(state.semesters); save(); dlg.close(); render(); });
  dlg.querySelector('[data-del]').addEventListener('click', () => {
    const i = state.semesters.indexOf(sem); state.semesters.splice(i, 1); refreshAutoWeek(); save(); dlg.close(); render();
    toast(`Deleted ${sem.name}`, { label: 'Undo', run: () => { state.semesters.splice(i, 0, sem); refreshAutoWeek(); save(); render(); } });
  });
}

function courseSheet(id) {
  const f0 = findCourse(id); if (!f0) return;
  const { sem, course: c } = f0;
  let pick = c.grade || '';
  sheet(`<form class="sheet" novalidate><div><h2 id="dlg-title">${esc(c.code)}</h2><p class="small muted">${esc(c.title || '')} · ${esc(sem.name)}</p></div>
    <fieldset class="stack-sm"><legend class="legend">Grade</legend>
      <div class="gpick">${L.GRADES.map((g) => `<button type="button" class="${g}" data-pick="${g}" aria-pressed="${pick === g}" style="${pick === g ? `background:var(--g${g})` : ''}">${g}</button>`).join('')}</div>
      <button type="button" class="chip" data-pick="" aria-pressed="${!pick}">No grade yet (this semester)</button></fieldset>
    <div class="grid-2"><div class="field"><label for="c-score">Got a score instead?</label><input id="c-score" type="number" inputmode="decimal" min="0" max="100" placeholder="e.g. 68"><span class="hint" id="c-score-out"></span></div>
      <div class="field"><label for="c-units">Units</label><input id="c-units" name="units" type="number" inputmode="numeric" min="1" max="9" value="${c.units}"></div></div>
    <span class="error" id="c-err" hidden></span>
    <div class="sheet-actions"><button type="button" class="btn danger" data-del style="margin-right:auto">Delete</button><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`,
  (f) => {
    const u = Number(f.elements.units.value);
    if (!(u > 0 && u <= 9)) { const e = $('#c-err'); e.textContent = 'Units must be between 1 and 9.'; e.hidden = false; return; }
    dlg.close();
    const snapBefore = snap();
    c.units = u; c.grade = pick || null; refreshAutoWeek(); save(); render();
    if (!celebrate(snapBefore) && pick === 'F') cheer('An F is tough. We’ll plan around it together.', 'worried');
  });
  const paint = () => dlg.querySelectorAll('[data-pick]').forEach((b) => { const on = b.dataset.pick === pick; b.setAttribute('aria-pressed', String(on)); if (b.dataset.pick) b.style.background = on ? `var(--g${b.dataset.pick})` : ''; });
  dlg.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { pick = b.dataset.pick; paint(); sound.tap(); }));
  $('#c-score').addEventListener('input', (e) => {
    const g = L.scoreToGrade(e.target.value), out = $('#c-score-out');
    if (e.target.value === '') { out.textContent = ''; return; } if (!g) { out.textContent = 'Enter 0–100'; return; }
    out.textContent = `${e.target.value}% = ${g} at BIU`; pick = g; paint();
  });
  dlg.querySelector('[data-del]').addEventListener('click', () => {
    const i = sem.courses.indexOf(c); sem.courses.splice(i, 1); refreshAutoWeek(); save(); dlg.close(); render();
    toast(`Deleted ${c.code}`, { label: 'Undo', run: () => { sem.courses.splice(i, 0, c); refreshAutoWeek(); save(); render(); } });
  });
}

function targetPickSheet(id) {
  const f0 = findCourse(id); if (!f0) return;
  const c = f0.course;
  sheet(`<div class="sheet"><h2 id="dlg-title">Grade to aim for in ${esc(c.code)}</h2>
    <div class="gpick">${L.GRADES.slice(0, 5).map((g) => `<button type="button" class="${g}" data-tg="${g}" aria-pressed="${c.targetManual && c.target === g}" style="background:var(--g${g})">${g}</button>`).join('')}</div>
    <button class="btn" data-tg="">Let Aim decide</button>
    <p class="hint">If you choose your own grade, the rest of your grade goals adjust around it.</p></div>`);
  dlg.querySelectorAll('[data-tg]').forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.tg; c.target = g || null; c.targetManual = !!g; save(); dlg.close(); render(); sound.tap();
  }));
}

function targetSheet() {
  sheet(`<form class="sheet"><div class="say">${spark('focus', 56)}<div class="bubble">What class do you want to graduate with?</div></div>
    <fieldset class="class-pick"><legend class="sr-only">Target class</legend>${BIU.classes.slice(0, 3).map((c) => `<label class="${CLASS_CSS[c.short]}"><span>${c.label}<br><span class="tiny">${c.min.toFixed(2)}+</span></span><input type="radio" name="t" value="${c.min}" ${P().target === c.min ? 'checked' : ''}></label>`).join('')}</fieldset>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Set target</button></div></form>`, (f) => {
    const v = Number(f.elements.t.value); if (!v) return;
    P().target = v; save(); dlg.close(); render();
    const pl = calcPlan();
    cheer(pl.status === 'impossible' ? `${L.classify(v).label} is out of reach now. Best possible: ${f2(pl.best)}.` : `Target set: ${L.classify(v).label}. Let’s get it!`, pl.status === 'impossible' ? 'worried' : 'proud');
  });
}

/* ============================== Icon editor ============================== */
const ed = { img: null, zoom: 1, x: 0, y: 0 };
function drawIcon(cv, size = 512) {
  const x = cv.getContext('2d'), { img } = ed;
  const s = Math.max(size / img.naturalWidth, size / img.naturalHeight) * ed.zoom, w = img.naturalWidth * s, h = img.naturalHeight * s;
  const mx = (w - size) / 2, my = (h - size) / 2;
  ed.x = Math.max(-mx * 512 / size, Math.min(mx * 512 / size, ed.x)); ed.y = Math.max(-my * 512 / size, Math.min(my * 512 / size, ed.y));
  x.clearRect(0, 0, size, size); x.imageSmoothingQuality = 'high';
  x.drawImage(img, (size - w) / 2 + ed.x * size / 512, (size - h) / 2 + ed.y * size / 512, w, h);
}
function openIconEditor(file) {
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    Object.assign(ed, { img, zoom: 1, x: 0, y: 0 });
    const host = $('#icon-editor'); if (!host) return;
    host.innerHTML = `<div class="stack-sm" style="justify-items:center"><div class="crop" tabindex="0" aria-label="Icon preview. Drag or use arrow keys to move." style="width:200px;height:200px;border-radius:44px;overflow:hidden;touch-action:none;cursor:grab;box-shadow:var(--shadow)"><canvas width="512" height="512" style="width:100%;height:100%"></canvas></div>
      <div class="field" style="width:min(260px,100%)"><label for="zoom">Zoom</label><input id="zoom" type="range" min="1" max="3" step=".01" value="1" style="min-height:32px;border:0;padding:0;accent-color:var(--lime-d)"></div>
      <div class="row"><button class="btn sm" data-action="icon-cancel">Cancel</button><button class="btn primary sm" data-action="icon-save">Use this picture</button></div></div>`;
    const cv = host.querySelector('canvas'), crop = host.querySelector('.crop'); drawIcon(cv);
    let d = null;
    crop.addEventListener('pointerdown', (e) => { d = { x: e.clientX, y: e.clientY, ox: ed.x, oy: ed.y }; crop.setPointerCapture(e.pointerId); });
    crop.addEventListener('pointermove', (e) => { if (!d) return; const k = 512 / crop.clientWidth; ed.x = d.ox + (e.clientX - d.x) * k; ed.y = d.oy + (e.clientY - d.y) * k; drawIcon(cv); });
    crop.addEventListener('pointerup', () => { d = null; }); crop.addEventListener('pointercancel', () => { d = null; });
    crop.addEventListener('keydown', (e) => { const m = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key]; if (!m) return; e.preventDefault(); ed.x += m[0]; ed.y += m[1]; drawIcon(cv); });
    host.querySelector('#zoom').addEventListener('input', (e) => { ed.zoom = Number(e.target.value); drawIcon(cv); });
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Couldn’t open that picture. Try a JPG or PNG.'); };
  img.src = url;
}
function saveIcon() {
  if (!ed.img) return;
  const mk = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; drawIcon(c, n); return c; };
  const b = mk(512), s = mk(192);
  const put = (x, y) => { try { store.setItem(ICON_BIG, x); store.setItem(ICON_SMALL, y); return true; } catch { store.removeItem(ICON_BIG); store.removeItem(ICON_SMALL); return false; } };
  if (!put(b.toDataURL('image/png'), s.toDataURL('image/png')) && !put(b.toDataURL('image/jpeg', 0.9), s.toDataURL('image/jpeg', 0.9))) { toast('Not enough space for that picture.'); return; }
  ed.img = null; applyIcon(); render(); cheer(isStandalone() ? 'Icon saved. Reinstall Aim to see it.' : 'Icon saved! Install Aim to see it on your home screen.', 'happy');
}
function applyIcon() {
  const big = store.getItem(ICON_BIG), small = store.getItem(ICON_SMALL) || big;
  const man = $('#manifest'), ap = $('#apple-icon'), fav = $('#favicon');
  if (!big) { man.href = 'manifest.webmanifest'; ap.href = 'icons/apple-touch-icon.png'; fav.href = 'icons/favicon.svg'; fav.type = 'image/svg+xml'; renderAvatar(); return; }
  const type = (d) => d.slice(5, d.indexOf(';')), base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const m = { id: base, name: 'Aim · BIU CGPA & Study Planner', short_name: 'Aim', start_url: base, scope: base, display: 'standalone', background_color: '#f2f6fb', theme_color: '#f2f6fb',
    icons: [{ src: small, sizes: '192x192', type: type(small), purpose: 'any' }, { src: big, sizes: '512x512', type: type(big), purpose: 'any' }, { src: big, sizes: '512x512', type: type(big), purpose: 'maskable' }] };
  man.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m)); ap.href = big; fav.href = small; fav.type = type(small); renderAvatar();
}

/* ============================== Actions & events ============================== */

const ACTIONS = {
  'onb-back': () => { onb.step = Math.max(0, onb.step - 1); render(); },
  'onb-skip-target': () => { onb.step = 3; render(); warmOCR().catch(() => {}); },
  'onb-manual': () => { typeResultsSheet(); },
  'onb-fresher': () => { P().onboarded = true; ACTIONS['fresher-courses'](); },
  'fresher-courses': () => {
    const list = semesterCourses(P().prog, P().level, 1).map((c) => ({ ...c, grade: null }));
    saveImported(list, { silent: true }); location.hash = '#plan'; render(); cheer('I added your handbook courses. Here’s your plan!', 'happy');
  },
  import: () => importSheet(),
  'type-results': () => typeResultsSheet(),
  'edit-sem': (el) => semesterSheet(state.semesters.find((s) => s.id === el.dataset.id)),
  'add-courses': (el) => addCoursesSheet(el.dataset.sem),
  'edit-course': (el) => courseSheet(el.dataset.id),
  'set-target': () => targetSheet(),
  'pick-target': (el) => targetPickSheet(el.dataset.id),
  diff: (el) => {
    const v = Number(el.dataset.v), before = coachNow().courses.find((c) => c.id === el.dataset.id)?.minutes || 0;
    const c = setDifficulty(el.dataset.id, v); render(); sound.tap();
    if (c) toast(`${c.code}: ${hrs(c.minutes)} a week${c.minutes > before ? ' (more time)' : c.minutes < before ? ' (less time)' : ''}`);
  },
  day: (el) => {
    const d = Number(el.dataset.day), days = state.plan.days;
    state.plan.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]; state.plan.custom = true;
    el.setAttribute('aria-pressed', String(state.plan.days.includes(d))); sound.tap(); save(); refreshPlanParts();
  },
  'session-done': (el) => tickSession(el.dataset.uid),
  'reset-week': () => { state.plan.custom = false; state.plan.start = '19:00'; state.plan.length = 60; refreshAutoWeek(); save(); render(); toast('Aim chose your week again'); },
  ics: () => {
    const { events } = weekEvents(); if (!events.length) return;
    const ics = L.buildICS(events, { fromISO: state.plan.fromISO, untilISO: state.plan.untilISO, alarmMinutes: state.plan.alarm });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'aim-study-plan.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    cheer('Calendar file ready. Open it to add your sessions.', 'happy');
  },
  install: async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => null); deferredInstall = null; render(); },
  'dismiss-install': () => { P().installDismissed = true; save(); render(); },
  'icon-save': saveIcon,
  'icon-cancel': () => { ed.img = null; $('#icon-editor').innerHTML = ''; },
  'icon-reset': () => { store.removeItem(ICON_BIG); store.removeItem(ICON_SMALL); applyIcon(); render(); toast('Default icon restored'); },
  export: () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); a.download = `aim-backup-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); toast('Backup downloaded');
  },
  wipe: async () => {
    if (!(await confirmSheet({ title: 'Delete everything?', body: 'This removes all your results, targets, plan and icon from this phone. It can’t be undone without a backup.', ok: 'Delete everything', danger: true }))) return;
    [KEY, ICON_BIG, ICON_SMALL].forEach((k) => store.removeItem(k)); state = defaults(); onb.step = 0; chat.length = 0; applyIcon(); location.hash = '#home'; render();
  },
};

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (a && ACTIONS[a.dataset.action]) { e.preventDefault(); ACTIONS[a.dataset.action](a); return; }
  const act = e.target.closest('[data-act]');
  if (act) { runAction(act.dataset.act, act.textContent.trim()); return; }
  const q = e.target.closest('[data-ask]');
  if (q) { e.preventDefault(); const def = QUESTIONS.find((x) => x.id === q.dataset.ask); if (currentRoute() !== 'ask') { greet(); location.hash = '#ask'; } chat.push({ me: true, text: def.label }); botSay(answer(def.id, state)); return; }
  const wg = e.target.closest('[data-wi-grade]');
  if (wg) { const n = wg.dataset.n; const course = $(`[data-wi-course="${n}"]`)?.value; const code = L.inProgress(state.semesters).find((c) => c.id === course)?.code; chat.push({ me: true, text: `What if I get ${wg.dataset.wiGrade} in ${code}?` }); botSay(answer('whatif', state, { course, grade: wg.dataset.wiGrade })); return; }
  const hd = e.target.closest('[data-hard]');
  if (hd) {
    const n = hd.dataset.n, course = $(`[data-wi-course="${n}"]`)?.value, v = Number(hd.dataset.hard);
    const c = setDifficulty(course, v); if (!c) return;
    chat.push({ me: true, text: `${c.code} is ${['', 'easy', 'medium', 'hard'][v]} for me` });
    botSay({ mood: v === 3 ? 'focus' : 'happy', html: `<p>Got it. <b>${esc(c.code)}</b> now gets <b>${hrs(c.minutes)}</b> of reading a week.</p>`, action: { id: 'go-plan', label: 'See my plan' } }); return;
  }
  const ca = e.target.closest('[data-chat-action]');
  if (ca) {
    if (ca.dataset.chatAction === 'apply-suggest') { for (const s of state.semesters) for (const c of s.courses) if (!c.grade) { c.targetManual = false; } save(); chat.push({ me: true, text: 'Use these as my targets' }); botSay({ mood: 'proud', html: '<p>Done! Those are your grade goals now.</p>', action: { id: 'go-plan', label: 'See my plan' } }); }
    if (ca.dataset.chatAction === 'go-plan') location.hash = '#plan';
    return;
  }
  const g = e.target.closest('[data-gcal]');
  if (g) { state.plan.added[g.dataset.gcal] = true; save(); setTimeout(refreshPlanParts, 300); }
});
document.addEventListener('keydown', (e) => { const el = e.target.closest?.('[data-keyclick]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.getElementById(el.htmlFor)?.click(); } });

document.addEventListener('submit', (e) => {
  if (e.target.id === 'ask-form') {
    e.preventDefault(); const inp = $('#ask-in'); const text = inp.value.trim(); if (!text) return; inp.value = '';
    const r = routeTyped(text);
    if (r?.kind === 'act') { runAction(r.id, text); return; }
    chat.push({ me: true, text });
    if (r?.kind === 'diff') { const c = setDifficulty(r.id, r.v); botSay({ mood: 'focus', html: `<p>Noted. <b>${esc(c.code)}</b> is now marked ${r.v === 3 ? 'hard' : 'easy'} for you and gets <b>${hrs(c.minutes)}</b> a week.</p>`, action: { id: 'go-plan', label: 'See my plan' } }); return; }
    botSay(r?.kind === 'q' ? answer(r.id, state) : { mood: 'happy', html: '<p>I can’t do that one yet. I can answer questions about your results and change your reading plan. Try the buttons below.</p>' });
    return;
  }
  if (e.target.id !== 'onb') return;
  e.preventDefault(); const f = e.target;
  if (onb.step === 0) {
    const n = f.elements.name.value.trim();
    if (!n) { f.elements.name.setAttribute('aria-invalid', 'true'); $('#o-name-err').hidden = false; f.elements.name.focus(); sound.soft(); return; }
    P().name = n; save(); onb.step = 1; sound.tap(); render();
  } else if (onb.step === 1) {
    P().prog = 'csc'; P().mode = f.elements.mode.value || 'full'; P().entry = f.elements.entry.value || 'utme'; P().level = Number(f.elements.level.value);
    if (P().entry === 'de' && P().level < 200) P().level = 200;
    save(); onb.step = 2; sound.tap(); render();
  } else if (onb.step === 2) {
    const v = Number(f.elements.target.value);
    if (v) { P().target = v; save(); sound.yay(); confetti(40); }
    onb.step = 3; render(); warmOCR().catch(() => {});
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.plan) { const k = t.dataset.plan; state.plan[k] = ['length', 'perDay', 'breakMin', 'alarm'].includes(k) ? Number(t.value) : t.value; if (k !== 'alarm') state.plan.custom = true; save(); refreshPlanParts(); }
  else if (t.dataset.pset) {
    const k = t.dataset.pset; let v = t.value;
    if (k === 'level') v = Number(v); if (k === 'target') v = v ? Number(v) : null;
    P()[k] = v; save(); if (k === 'theme') applyTheme(); render();
  }
  else if (t.id === 's-sound') { P().sound = t.checked; setSound(t.checked); save(); if (t.checked) sound.ding(); }
  else if (t.id === 'icon-file') { openIconEditor(t.files?.[0]); t.value = ''; }
  else if (t.id === 'import-file') { restore(t.files?.[0]); t.value = ''; }
});
document.addEventListener('input', (e) => { const t = e.target; if (t.dataset.profile) { P()[t.dataset.profile] = t.value; save(); renderAvatar(); } if (t.getAttribute('aria-invalid')) t.removeAttribute('aria-invalid'); });

async function restore(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()); if (!data || !Array.isArray(data.semesters)) throw 0;
    if (!(await confirmSheet({ title: 'Restore this backup?', body: `It has ${data.semesters.length} semester(s) and replaces what’s on this phone now.`, ok: 'Restore' }))) return;
    const keep = { sound: P().sound, theme: P().theme };
    state = sanitize(data); state.profile.onboarded = true; if (!data.v) Object.assign(state.profile, keep);
    refreshAutoWeek(); save(); applyTheme(); render(); toast('Backup restored');
  } catch { toast('That file isn’t an Aim backup.'); }
}

$('#avatar-btn').addEventListener('click', () => { location.hash = '#settings'; });
function applyTheme() { const t = P().theme; if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

const AFTER = {
  home: () => { const el = $('#cgpa-num'); if (el && !onceThisSession('counted')) countUp(el, Number(el.dataset.v)); $('.say .spark')?.classList.add('jump'); },
  ask: () => { $('#chat')?.lastElementChild?.scrollIntoView({ block: 'nearest' }); },
};
function onceThisSession(k) { try { const had = sessionStorage.getItem('aim:' + k); sessionStorage.setItem('aim:' + k, '1'); return had; } catch { return null; } }

/* ============================== Service worker & boot ============================== */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', async () => {
    try {
      const hadController = !!navigator.serviceWorker.controller; // first visit: no reload when the worker takes over
      const reg = await navigator.serviceWorker.register('sw.js');
      const prompt = (w) => toast('A new version of Aim is ready.', { label: 'Refresh', run: () => w.postMessage('skip-waiting') });
      if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); }); });
      let done = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !done) { done = true; location.reload(); } });
    } catch { /* offline support unavailable */ }
  });
}

setSound(P().sound);
applyTheme(); applyIcon();
refreshAutoWeek();
render();
checkMisses();
addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkMisses(); if (currentRoute() === 'home' && P().onboarded) render(); } });
