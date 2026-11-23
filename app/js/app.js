import * as L from './logic.js';
import { BIU, PROGRAMMES, catalog, semesterCourses } from './biu.js';
import { spark, sound, buzz, confetti, countUp, setSound } from './fx.js';
import { QUESTIONS, answer, route as routeQuestion } from './ask.js';

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

function defaults() {
  return {
    v: 2,
    profile: { name: '', prog: 'csc', mode: 'full', entry: 'utme', level: 100, target: null, policy: 'all', calc: 'weighted', sound: true, theme: 'system', onboarded: false, installDismissed: false },
    semesters: [],
    plan: { days: [1, 2, 3, 4, 5], start: '19:00', length: 60, perDay: 1, breakMin: 10, fromISO: todayISO(), untilISO: plusDaysISO(98), alarm: 10, added: {} },
  };
}
const semName = (level, sem) => `${level}L · ${sem === 2 ? 'Second' : 'First'} semester`;

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
    // v1 backups have only a name like "100L First Semester"
    const lv = Number(s.level) || Number(/(\d)00\s*L/i.exec(s.name || '')?.[1]) * 100 || null;
    const sm = Number(s.sem) || (/second/i.test(s.name || '') ? 2 : /first/i.test(s.name || '') ? 1 : null);
    return {
      id: String(s.id || L.uid()), level: lv, sem: sm, name: lv && sm ? semName(lv, sm) : String(s.name || 'Semester'),
      courses: (Array.isArray(s.courses) ? s.courses : []).filter((c) => c && typeof c === 'object').map((c) => ({
        id: String(c.id || L.uid()), code: L.normCode(c.code || ''), title: String(c.title || ''), units: L.validUnits(c.units),
        grade: L.GRADES.includes(c.grade) ? c.grade : null, target: L.GRADES.includes(c.target) ? c.target : null,
        difficulty: [1, 2, 3].includes(Number(c.difficulty)) ? Number(c.difficulty) : 2, diffManual: !!c.diffManual,
      })),
    };
  });
  sortSemesters(semesters);
  return { v: 2, profile, plan, semesters };
}
function sortSemesters(list) { list.sort((a, b) => ((a.level || 999) - (b.level || 999)) || ((a.sem || 9) - (b.sem || 9))); }
function load() { try { return sanitize(JSON.parse(store.getItem(KEY) || 'null')); } catch { return defaults(); } }
let state = load();
function save() { try { store.setItem(KEY, JSON.stringify(state)); } catch { toast('Couldn’t save. Your phone storage may be full.'); } }

/* ============================== Helpers ============================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
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
const gradeChip = (g) => (g ? `<span class="g g${g}" aria-label="Grade ${g}">${g}</span>` : '<span class="g gP">In progress</span>');
const calcPlan = (semesters = state.semesters) => L.weightedPlan(semesters, { entry: P().entry, target: P().target, policy: P().policy, mode: P().calc });
const current = () => L.inProgress(state.semesters).map((c) => ({ ...c, difficulty: c.diffManual ? c.difficulty : L.autoDifficulty(c.code, state.semesters).level }));
function findCourse(id) { for (const s of state.semesters) { const c = s.courses.find((x) => x.id === id); if (c) return { sem: s, course: c }; } return null; }

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
};

/* ============================== Shell ============================== */

const ROUTES = { home: { title: 'Home', icon: I.home, tab: 1 }, results: { title: 'Results', icon: I.results, tab: 1 }, plan: { title: 'Plan', icon: I.plan, tab: 1 }, ask: { title: 'Ask Spark', icon: I.ask, tab: 1 }, settings: { title: 'Settings' } };
const currentRoute = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home'; return ROUTES[r] ? r : 'home'; };

let lastRoute = null;
function render() {
  const r = P().onboarded ? currentRoute() : 'onboarding';
  const view = $('#view');
  const a = document.activeElement;
  const focusId = a?.id && view.contains(a) ? a.id : null;
  document.title = r === 'onboarding' ? 'Welcome · Aim' : `${ROUTES[r].title} · Aim`;
  view.innerHTML = VIEWS[r]();
  $('#tabs').innerHTML = Object.entries(ROUTES).filter(([, v]) => v.tab).map(([k, v]) => `<a class="tab" href="#${k}" ${k === r ? 'aria-current="page"' : ''}>${v.icon}<span>${v.title === 'Ask Spark' ? 'Ask' : v.title}</span></a>`).join('');
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

/* ============================== Toasts, dialogs, cheers ============================== */

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

/** Run a change, then celebrate (or comfort) based on what changed. */
function withFeedback(change) {
  const before = L.cgpa(state.semesters, P().policy);
  const beforeCls = before.gpa != null ? L.classify(before.gpa).short : null;
  const touched = change();
  save();
  const after = L.cgpa(state.semesters, P().policy);
  if (after.units === before.units && after.points === before.points) return;
  const sem = touched ? state.semesters.find((s) => s.id === touched) : null;
  const semG = sem ? L.semesterGpa(sem) : null;
  const newF = sem?.courses.some((c) => c.grade === 'F');
  const afterCls = after.gpa != null ? L.classify(after.gpa) : null;
  const order = ['—', 'Pass', '3rd', '2:2', '2:1', '1st'];
  if (afterCls && beforeCls && order.indexOf(afterCls.short) > order.indexOf(beforeCls)) cheer(`You moved up to ${afterCls.label}!`, 'proud');
  else if (semG?.gpa >= 4.5 && !sem.courses.some((c) => !c.grade)) cheer(`First-class semester: ${f2(semG.gpa)}!`, 'proud');
  else if (newF) cheer('An F is tough. We’ll plan around it together.', 'worried');
  else if (!before.units && after.units) cheer(`Your CGPA is ${f2(after.gpa)}. Let’s go!`, after.gpa >= 3.5 ? 'proud' : 'happy');
}

/* ============================== Spark's line on Home ============================== */

function sparkLine() {
  const cg = L.cgpa(state.semesters, P().policy);
  const cur = L.inProgress(state.semesters);
  const plan = calcPlan();
  const name = (P().name || '').split(' ')[0];
  if (!cg.units && !cur.length) return { mood: 'happy', text: `Hi ${esc(name)}! Add your results. A screenshot of your portal is fastest, and I’ll do the maths.` };
  if (!cg.units) return { mood: 'focus', text: `No grades yet, ${esc(name)}, so let’s make this first semester count. Your plan is ready on the Plan tab.` };
  if (!P().target) return { mood: 'happy', text: `${f2(cg.gpa)}, nice. What are you aiming for? Set a target and I’ll show you the way.` };
  if (plan.status === 'impossible') return { mood: 'worried', text: `${L.classify(P().target).label} is out of reach now, but ${L.classify(plan.best).label} is still yours. Want to retarget?` };
  if (plan.status === 'secured' || plan.status === 'achieved') return { mood: 'proud', text: `You’ve locked in ${L.classify(P().target).label}. Legend.` };
  if (plan.required <= (cg.gpa ?? 0) + 0.05) return { mood: 'proud', text: `You’re on track for ${L.classify(P().target).label}. Keep this exact energy.` };
  if (plan.required > 4.6) return { mood: 'focus', text: `You need ${f2(plan.required)} from here. Tight, but your 300 and 400 level count the most. Lock in.` };
  return { mood: 'focus', text: `Average ${f2(plan.required)} from here for ${L.classify(P().target).label}. Very doable. Let’s plan it.` };
}

/* ============================== Views ============================== */

const onb = { step: 0 };
const VIEWS = {
  onboarding() {
    const p = P();
    const steps = `<div class="steps" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<i class="${i <= onb.step ? 'on' : ''}"></i>`).join('')}</div>`;
    if (onb.step === 0) return `<div class="onb">${steps}
      <div class="say">${spark('happy', 96)}<div class="bubble">Hi! I’m Spark. I help BIU students know their CGPA, set a target, and actually hit it.</div></div>
      <form id="onb" class="stack" novalidate>
        <div class="field"><label for="o-name">What should I call you?</label>
          <input id="o-name" name="name" value="${esc(p.name)}" autocomplete="given-name" placeholder="Your first name" autofocus>
          <span class="error" id="o-name-err" hidden>Tell me your name first.</span></div>
        <button class="btn primary block">Continue</button>
        <p class="hint">No account, no email. Your results stay on your phone.</p></form></div>`;
    if (onb.step === 1) return `<div class="onb">${steps}<h1>Your programme</h1>
      <form id="onb" class="stack">
        <fieldset class="stack-sm"><legend class="legend">Department</legend>
          <label class="option"><input type="radio" name="prog" value="csc" checked><span>Computer Science<span class="sub">Faculty of Computing · more departments coming soon</span></span></label></fieldset>
        <fieldset class="stack-sm"><legend class="legend">How do you study?</legend>
          <div class="grid-2">${[['full', 'Full-time'], ['part', 'Part-time']].map(([v, l]) => `<label class="option"><input type="radio" name="mode" value="${v}" ${p.mode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
        <fieldset class="stack-sm"><legend class="legend">How did you come in?</legend>
          <label class="option"><input type="radio" name="entry" value="utme" ${p.entry === 'utme' ? 'checked' : ''}><span>Started at 100 level<span class="sub">4-year programme</span></span></label>
          <label class="option"><input type="radio" name="entry" value="de" ${p.entry === 'de' ? 'checked' : ''}><span>Direct entry<span class="sub">3-year programme, started at 200 level</span></span></label></fieldset>
        <div class="field"><label for="o-level">Your level now</label><select id="o-level" name="level">${[100, 200, 300, 400].map((l) => `<option ${p.level === l ? 'selected' : ''} value="${l}">${l} level</option>`).join('')}</select></div>
        <div class="row"><button type="button" class="btn" data-action="onb-back">Back</button><button class="btn primary grow">Continue</button></div></form></div>`;
    if (onb.step === 2) return `<div class="onb">${steps}
      <div class="say">${spark('focus', 80)}<div class="bubble">What are you aiming for? Be bold. I’ll tell you if it’s still possible.</div></div>
      <form id="onb" class="stack"><fieldset class="class-pick"><legend class="sr-only">Target class</legend>
        ${BIU.classes.slice(0, 3).map((c) => `<label class="${CLASS_CSS[c.short]}"><span>${c.label}<br><span class="tiny">${c.min.toFixed(2)} and above</span></span><input type="radio" name="target" value="${c.min}" ${p.target === c.min ? 'checked' : ''}></label>`).join('')}
      </fieldset>
      <div class="row"><button type="button" class="btn" data-action="onb-back">Back</button><button class="btn primary grow">Set my target</button></div>
      <button type="button" class="btn ghost" data-action="onb-skip-target">Decide later</button></form></div>`;
    return `<div class="onb">${steps}
      <div class="say">${spark('happy', 80)}<div class="bubble">Last step${p.name ? `, ${esc(p.name.split(' ')[0])}` : ''}: let’s get your results in.</div></div>
      <button class="btn primary block" data-action="onb-upload">${I.camera}Upload portal screenshot</button>
      <button class="btn block" data-action="onb-manual">I’ll type them in</button>
      <button class="btn ghost" data-action="onb-fresher">I’m in my first semester, no results yet</button>
      <p class="hint">Screenshots are read on your phone. The picture is never uploaded anywhere.</p></div>`;
  },

  home() {
    const p = P(), cg = L.cgpa(state.semesters, p.policy), plan = calcPlan(), cur = current(), line = sparkLine();
    const cls = cg.gpa != null ? L.classify(cg.gpa) : null;
    const series = L.seriesStats(state.semesters, p.policy);
    const W = BIU.weights[p.entry];
    const levels = p.calc === 'simple' ? '' : `<section class="card stack-sm" aria-labelledby="lv-h">
      <div class="row spread"><h2 id="lv-h">How your degree is weighted</h2><a class="btn ghost sm" href="#ask" data-ask="how">Why?</a></div>
      <div class="levels">${[100, 200, 300, 400].filter((s) => W[s] > 0).map((s) => {
        const g = series[s].gpa; const cur2 = p.level === s;
        return `<div class="lvl ${g != null ? 'done ' + clsCss(g) : ''} ${cur2 ? 'current' : ''}" style="flex:${W[s] * 100} 1 0" aria-label="${s} level counts ${Math.round(W[s] * 100)} percent${g != null ? `, GPA ${f2(g)}` : ''}">
          <span>${s}L</span><b class="num">${g != null ? f2(g) : '—'}</b><span>${Math.round(W[s] * 100)}%</span></div>`;
      }).join('')}</div>
      <p class="tiny muted">Bigger tile, bigger say in your final class. ${p.level < 300 ? 'Your 300 and 400 level decide most of it.' : 'You’re in the years that decide most of it.'}</p></section>`;

    const mix = (() => {
      const counted = L.countedCourses(state.semesters, p.policy);
      const tot = counted.reduce((s, c) => s + c.units, 0);
      if (!tot) return '';
      const by = Object.fromEntries(L.GRADES.map((g) => [g, counted.filter((c) => c.grade === g).reduce((s, c) => s + c.units, 0)]));
      return `<section class="card stack-sm" aria-labelledby="mix-h"><h2 id="mix-h">Your grade mix</h2>
        <div class="mix" role="img" aria-label="${L.GRADES.filter((g) => by[g]).map((g) => `${g}: ${by[g]} units`).join(', ')}">${L.GRADES.filter((g) => by[g]).map((g) => `<i class="g${g}" style="flex:${by[g]}"></i>`).join('')}</div>
        <div class="chips">${L.GRADES.filter((g) => by[g]).map((g) => `<span class="row tiny" style="gap:6px">${gradeChip(g)}<b>${by[g]}</b> units</span>`).join('')}</div></section>`;
    })();

    const targetTile = !p.target
      ? `<button class="tile cls-na stack-sm" data-action="set-target" style="text-align:left;border:0;font:inherit;cursor:pointer"><span class="label">Target</span><b style="font-size:1.25rem">Set a target</b><span class="tiny">See exactly what it takes</span></button>`
      : `<a class="tile ${CLASS_CSS[L.classify(p.target).short]} stack-sm" href="#plan" style="text-decoration:none">
          <span class="label">Target · ${esc(L.classify(p.target).label)}</span>
          ${plan.status === 'possible' ? `<b class="num" style="font-size:2rem;line-height:1">${f2(plan.required)}</b><span class="tiny"><b>average needed</b> from here</span>`
            : plan.status === 'impossible' ? `<b style="font-size:1.1rem">Out of reach</b><span class="tiny">Best now: ${f2(plan.best)}</span>`
            : `<b style="font-size:1.1rem">Locked in</b><span class="tiny">Keep passing</span>`}</a>`;

    const next = nextSession();
    const curCard = cur.length ? `<section class="card flush" aria-labelledby="cur-h">
      <div class="card-head"><h2 id="cur-h">This semester</h2><a class="btn ghost sm" href="#plan">Targets</a></div>
      <ul class="list">${cur.map((c) => `<li class="item"><div class="grow"><div class="title">${esc(c.code)}</div><div class="sub">${esc(c.title || '')} · ${c.units} units</div></div>
        ${c.target ? `<span class="tiny muted">aim</span>${gradeChip(c.target)}` : '<span class="tiny muted">no target</span>'}</li>`).join('')}</ul></section>` : '';

    return `<div class="stack">
      <div class="say">${spark(line.mood, 64)}<div class="bubble" id="spark-line">${line.text}</div></div>
      ${cg.units ? `<div class="hero">
        <div class="tile ${clsCss(cg.gpa)} stack-sm"><span class="label">CGPA</span><span class="big" id="cgpa-num" data-v="${cg.gpa}">${f2(cg.gpa)}</span>
          <b>${esc(cls.label)}</b><span class="tiny">${cg.units} units · ${cg.points} points</span></div>
        ${targetTile}</div>` : `<div class="card stack" style="text-align:center;justify-items:center">
          <h2>Your CGPA lives here</h2><p class="muted">Upload a screenshot of your portal result page, or type your grades.</p>
          <div class="row wrap" style="justify-content:center"><button class="btn primary" data-action="import">${I.camera}Upload screenshot</button><a class="btn" href="#results">Type them</a></div></div>
          ${p.target ? '' : targetTile}`}
      ${next ? `<a class="card row" href="#plan" style="text-decoration:none"><span class="g gP" style="height:44px;width:44px">${I.cal}</span>
        <span class="grow"><span class="tiny muted">Next study session</span><br><b>${esc(next.when)}, ${next.start}</b> · ${esc(next.title.replace('Study: ', ''))}</span></a>` : ''}
      ${curCard}${levels}${mix}${installCard()}
    </div>`;
  },

  results() {
    const p = P();
    const re = L.retakes(state.semesters);
    const cards = state.semesters.map((s) => {
      const g = L.semesterGpa(s);
      const pending = s.courses.some((c) => !c.grade);
      return `<section class="card flush" aria-labelledby="h-${s.id}">
        <div class="card-head"><div><h2 id="h-${s.id}">${esc(s.name)}</h2>
          <p class="tiny muted">${s.courses.reduce((a, c) => a + c.units, 0)} units${pending ? ' · in progress' : ''}</p></div>
          <div class="row">${g.gpa != null ? `<span class="tile ${clsCss(g.gpa)} num" style="padding:6px 12px;border-radius:12px">${f2(g.gpa)}</span>` : ''}
          <button class="icon-btn" data-action="edit-sem" data-id="${s.id}" aria-label="Edit ${esc(s.name)}">${I.edit}</button></div></div>
        ${s.courses.length ? `<div class="list">${s.courses.map((c) => `<button class="item" data-action="edit-course" data-id="${c.id}" aria-label="${esc(c.code)}, ${c.units} units, ${c.grade ? 'grade ' + c.grade : 'in progress'}. Edit">
          <div class="grow"><div class="title">${esc(c.code)}${re.includes(c.code) ? ' <span class="flag">retake</span>' : ''}</div><div class="sub">${esc(c.title || '')}${c.title ? ' · ' : ''}${c.units} unit${c.units === 1 ? '' : 's'}</div></div>${gradeChip(c.grade)}</button>`).join('')}</div>` : '<p class="muted small" style="padding:0 20px 12px">No courses yet.</p>'}
        <div class="row wrap" style="padding:10px 14px 14px;border-top:1px solid var(--line)">
          <button class="btn sm" data-action="add-courses" data-sem="${s.id}">${I.plus}Add courses</button>
          <button class="btn sm" data-action="import" data-sem="${s.id}">${I.camera}Screenshot</button></div></section>`;
    }).join('');
    return `<div class="stack">
      <div class="grid-2"><button class="btn primary" data-action="import">${I.camera}Upload screenshot</button><button class="btn" data-action="add-sem">${I.plus}Add semester</button></div>
      ${state.semesters.length ? cards : `<div class="card stack" style="text-align:center;justify-items:center">${spark('happy', 72)}<h2>No results yet</h2>
        <p class="muted">Take a screenshot of your result page on the BIU portal and upload it. Or add a semester and pick your courses from the handbook.</p></div>`}
      ${re.length ? `<p class="tiny muted">Retakes: ${re.map(esc).join(', ')}. ${p.policy === 'all' ? 'Every attempt counts in your CGPA' : 'Only the latest attempt counts'} (change in Settings).</p>` : ''}
    </div>`;
  },

  plan() {
    const p = P(), cur = current(), plan = calcPlan(), pl = state.plan;
    if (!cur.length) return `<div class="card stack" style="text-align:center;justify-items:center">${spark('focus', 72)}<h2>Nothing to plan yet</h2>
      <p class="muted">Add this semester’s courses with the grade left as “In progress”. A screenshot of your course registration page works too.</p>
      <div class="row wrap" style="justify-content:center"><button class="btn primary" data-action="import">${I.camera}Registration screenshot</button><a class="btn" href="#results">Add courses</a></div></div>`;
    const banner = !p.target ? `<div class="callout info row spread wrap"><span>Set a target to get grade goals for each course.</span><button class="btn sm" data-action="set-target">Set target</button></div>`
      : plan.status === 'possible' ? `<div class="callout ${plan.required > 4.5 ? 'warn' : 'good'}"><b>Average ${f2(plan.required)}</b> on all remaining work for ${esc(L.classify(p.target).label)}.</div>`
      : plan.status === 'impossible' ? `<div class="callout bad">${esc(L.classify(p.target).label)} is out of reach. Best possible: <b>${f2(plan.best)}</b>. <button class="btn sm" data-action="set-target">Change target</button></div>`
      : `<div class="callout good">Target locked in. Keep passing!</div>`;
    return `<div class="stack-lg">
      <section class="stack" aria-labelledby="t-h"><h1 id="t-h">This semester</h1>${banner}
        <div class="card flush"><ul class="list">${cur.map((c) => {
          const auto = L.autoDifficulty(c.code, state.semesters);
          return `<li class="item" style="flex-wrap:wrap"><div class="grow" style="min-width:140px"><div class="title">${esc(c.code)}</div>
            <div class="sub">${c.units} units${plan.rows.length && L.unitWeight(c.code, plan) === 0 ? ' · counts 0% for you' : ''}${c.diffManual ? '' : ` · ${esc(auto.reason)}`}</div></div>
            <div class="row" style="gap:6px"><label class="sr-only" for="d-${c.id}">How hard is ${esc(c.code)} for you</label>
            <select id="d-${c.id}" data-diff="${c.id}" style="width:auto;min-height:44px">${[[1, 'Easy'], [2, 'Medium'], [3, 'Hard']].map(([v, l]) => `<option value="${v}" ${c.difficulty === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <label class="sr-only" for="tg-${c.id}">Target grade for ${esc(c.code)}</label>
            <select id="tg-${c.id}" data-target="${c.id}" style="width:auto;min-height:44px"><option value="">Aim…</option>${L.GRADES.map((g) => `<option ${c.target === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div></li>`;
        }).join('')}</ul>
        <div style="padding:12px 16px 16px;border-top:1px solid var(--line)" class="stack-sm">
          <button class="btn primary" id="suggest-btn" data-action="suggest">Suggest my targets</button>
          <div id="proj" aria-live="polite">${projBlock()}</div></div></div></section>

      <section class="stack" aria-labelledby="w-h"><h1 id="w-h">Your week</h1>
        <div class="card stack">
          <fieldset class="stack-sm"><legend class="legend">Study days</legend><div class="chips">${WEEK.map((d) => `<button type="button" class="chip" data-action="day" data-day="${d}" aria-pressed="${pl.days.includes(d)}" aria-label="${DAYS_LONG[d]}">${DAYS[d]}</button>`).join('')}</div></fieldset>
          <div class="grid-2">
            <div class="field"><label for="p-start">Start time</label><input id="p-start" type="time" value="${esc(pl.start)}" data-plan="start"></div>
            <div class="field"><label for="p-len">Session</label><select id="p-len" data-plan="length">${[30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${pl.length === m ? 'selected' : ''}>${m < 60 ? m + ' min' : m / 60 + ' h'}</option>`).join('')}</select></div>
            <div class="field"><label for="p-per">Per day</label><select id="p-per" data-plan="perDay">${[1, 2, 3, 4].map((n) => `<option ${pl.perDay === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
            <div class="field"><label for="p-brk">Break</label><select id="p-brk" data-plan="breakMin">${[0, 5, 10, 15, 30].map((n) => `<option value="${n}" ${pl.breakMin === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></div>
            <div class="field"><label for="p-from">From</label><input id="p-from" type="date" value="${esc(pl.fromISO)}" data-plan="fromISO"></div>
            <div class="field"><label for="p-until">Until exams</label><input id="p-until" type="date" value="${esc(pl.untilISO)}" data-plan="untilISO"></div>
          </div>
          <div class="field"><label for="p-alarm">Remind me</label><select id="p-alarm" data-plan="alarm">${[0, 5, 10, 15, 30, 60].map((n) => `<option value="${n}" ${pl.alarm === n ? 'selected' : ''}>${n ? n + ' minutes before' : 'At start time'}</option>`).join('')}</select></div>
        </div>
        <div id="plan-out" aria-live="polite">${planOut()}</div></section>
    </div>`;
  },

  ask() {
    greet();
    return `<div class="stack">
      <div id="chat" class="chat" aria-live="polite">${chat.map(msgHtml).join('')}</div>
      <div class="suggest" role="group" aria-label="Questions you can ask">${QUESTIONS.map((q) => `<button class="chip" data-ask="${q.id}">${esc(q.label)}</button>`).join('')}</div>
      <form id="ask-form" class="row" autocomplete="off"><label class="sr-only" for="ask-in">Ask Spark</label>
        <input id="ask-in" placeholder="Ask about your results…" maxlength="140"><button class="btn blue" aria-label="Send" style="min-width:56px;padding:0 14px">${I.send}</button></form>
      <p class="tiny muted">Spark answers from the BIU handbook and your own results. Nothing you type leaves your phone.</p></div>`;
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
        <div class="field"><label for="s-target">Target</label><select id="s-target" data-pset="target"><option value="">Not set</option>${BIU.classes.slice(0, 4).map((c) => `<option value="${c.min}" ${p.target === c.min ? 'selected' : ''}>${c.label} (${c.min.toFixed(2)})</option>`).join('')}</select></div>
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
      <p class="tiny muted" style="text-align:center">Aim 2.0 · for Benson Idahosa University students · not an official BIU app</p></div>`;
  },
};

function projBlock() {
  const pr = L.projection(state.semesters, P().policy);
  if (pr.semesterGpa == null) return '<p class="tiny muted">Pick a target grade for each course, or tap “Suggest”.</p>';
  return `<div class="grid-2"><div class="tile ${clsCss(pr.semesterGpa)}"><span class="label">This semester</span><br><b class="num" style="font-size:1.6rem">${f2(pr.semesterGpa)}</b></div>
    <div class="tile ${clsCss(pr.cgpa)}"><span class="label">CGPA after</span><br><b class="num" style="font-size:1.6rem">${f2(pr.cgpa)}</b></div></div>
    ${pr.missing ? `<p class="tiny muted" style="margin-top:6px">${pr.missing} course${pr.missing > 1 ? 's' : ''} still need a target.</p>` : ''}`;
}

/* ---------- plan output (timetable + reminders) ---------- */
function currentPlanEvents() {
  const cur = current(); const built = L.buildStudyPlan(cur, state.plan);
  return { cur, ...built, events: L.slotsToEvents(built.slots, cur) };
}
function planOut() {
  const pl = state.plan;
  if (!pl.days.length) return '<div class="callout warn">Pick at least one study day.</div>';
  if (L.timeToMinutes(pl.start) == null) return '<div class="callout warn">Enter a start time.</div>';
  if (!pl.fromISO || !pl.untilISO || pl.untilISO < pl.fromISO) return '<div class="callout warn">The end date must be after the start date.</div>';
  const { cur, slots, perCourse, events } = currentPlanEvents();
  if (!slots.length) return '<div class="callout warn">Those sessions would run past midnight. Start earlier.</div>';
  const byId = Object.fromEntries(cur.map((c) => [c.id, c]));
  const total = slots.length * pl.length;
  const h = (m) => (m % 60 ? (m / 60).toFixed(1) : m / 60) + 'h';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const opts = { fromISO: pl.fromISO, untilISO: pl.untilISO };
  const added = events.filter((e) => pl.added[e.uid]).length;
  const ics = `<button class="btn ${isAndroid ? '' : 'primary'} block" data-action="ics">${I.cal}Add all to my calendar</button>
    <p class="hint">${isIOS ? 'iPhone: tap “Add All” when Calendar opens. If nothing happens in the installed app, open Aim in Safari for this step.' : isAndroid ? 'Works if your calendar app opens .ics files (e.g. Samsung Calendar). Otherwise use the Google buttons.' : 'Opens in Apple Calendar or Outlook. Google Calendar on a computer: Settings → Import.'}</p>`;
  const google = `<div class="row spread"><h3>Google Calendar</h3><span class="tiny muted">${added}/${events.length} added</span></div>
    <p class="hint">Each button adds one weekly session. Tap Save in Google, then come back for the next.</p>
    <div class="list" style="margin:0 -20px">${events.map((e) => `<div class="item"><div class="grow"><div class="title">${esc(e.title.replace('Study: ', ''))}</div><div class="sub">Every ${DAYS_LONG[e.day]} · ${e.start}–${e.end}</div></div>
      <a class="btn sm ${pl.added[e.uid] ? '' : 'blue'}" href="${esc(L.googleCalendarUrl(e, opts, tz))}" target="_blank" rel="noopener" data-gcal="${esc(e.uid)}">${pl.added[e.uid] ? I.check + 'Added' : 'Add' + I.ext}</a></div>`).join('')}</div>`;
  return `<div class="stack">
    <div class="card flush"><div class="card-head"><h2>${slots.length} sessions · ${h(total)} a week</h2></div>
      <div style="border-top:1px solid var(--line)">${WEEK.filter((d) => slots.some((s) => s.day === d)).map((d) => `<div class="day"><b>${DAYS[d]}</b><div>${slots.filter((s) => s.day === d).map((s) => `<div class="session"><span>${esc(byId[s.courseId]?.code || '')}</span><span class="t">${s.start}–${s.end}</span></div>`).join('')}</div></div>`).join('')}</div></div>
    <div class="card stack-sm"><h2>Time per course</h2>${cur.map((c) => `<div class="row"><b style="width:76px">${esc(c.code)}</b><div class="bar grow"><i style="width:${((perCourse[c.id] || 0) / total) * 100}%"></i></div><span class="tiny num" style="width:40px;text-align:right">${h(perCourse[c.id] || 0)}</span></div>`).join('')}</div>
    <div class="card stack"><h2>Turn on reminders</h2>${isAndroid ? google + ics : ics + google}
      <p class="tiny muted">Changed your plan? Delete the old sessions from your calendar first so they don’t double up.</p></div></div>`;
}

function nextSession() {
  const pl = state.plan, today = todayISO();
  if (!pl.fromISO || !pl.untilISO || today > pl.untilISO) return null;
  const { events } = currentPlanEvents(); if (!events.length) return null;
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

/* ============================== Chat ============================== */

const chat = [];
function msgHtml(m) {
  if (m.me) return `<div class="msg me">${esc(m.text)}</div>`;
  if (m.typing) return `<div class="botrow">${spark('happy', 36)}<div class="msg bot typing" aria-label="Spark is typing"><i></i><i></i><i></i></div></div>`;
  return `<div class="botrow">${spark(m.mood || 'happy', 36)}<div class="msg bot">${m.html}
    ${m.picker ? `<div class="stack-sm" style="margin-top:10px"><label class="sr-only" for="wi-c-${m.n}">Course</label><select id="wi-c-${m.n}" data-wi-course="${m.n}">${m.picker.courses.map((c) => `<option value="${c.id}">${esc(c.code)}</option>`).join('')}</select>
      <div class="gpick" role="group" aria-label="Grade">${L.GRADES.map((g) => `<button type="button" class="g${g} ${g}" data-wi-grade="${g}" data-n="${m.n}" style="background:var(--g${g})">${g}</button>`).join('')}</div></div>` : ''}
    ${m.action ? `<div style="margin-top:10px"><button class="btn sm primary" data-chat-action="${m.action.id}">${esc(m.action.label)}</button></div>` : ''}</div></div>`;
}
let msgN = 0;
function botSay(res) {
  chat.push({ typing: true });
  if (currentRoute() === 'ask') render();
  setTimeout(() => {
    chat.pop(); chat.push({ ...res, n: ++msgN });
    if (currentRoute() === 'ask') { render(); $('#chat')?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (res.mood === 'proud') sound.ding(); else sound.tap();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 550);
}
function ask(id, label) {
  chat.push({ me: true, text: label });
  botSay(id ? answer(id, state) : { ...answer('__none', state), mood: 'happy' });
}
function greet() {
  if (chat.length) return;
  const n = (P().name || '').split(' ')[0];
  chat.push({ n: ++msgN, mood: 'happy', html: `<p>Hey ${esc(n)}! Ask me anything about your results, target or study plan. Tap a question below or type one.</p>` });
}

/* ============================== Results: add / edit / import ============================== */

function semesterSheet(sem) {
  const editing = !!sem;
  const used = state.semesters.map((s) => `${s.level}-${s.sem}`);
  let lv = sem?.level || P().level, sm = sem?.sem || 1;
  if (!editing) { for (const l of [100, 200, 300, 400]) for (const s of [1, 2]) if (!used.includes(`${l}-${s}`) && lv === P().level && used.includes(`${lv}-${sm}`)) { lv = l; sm = s; } }
  sheet(`<form class="sheet"><h2 id="dlg-title">${editing ? 'Edit semester' : 'Add semester'}</h2>
    <div class="grid-2"><div class="field"><label for="f-lv">Level</label><select id="f-lv" name="level">${[100, 200, 300, 400].map((l) => `<option value="${l}" ${lv === l ? 'selected' : ''}>${l} level</option>`).join('')}</select></div>
    <div class="field"><label for="f-sm">Semester</label><select id="f-sm" name="sem"><option value="1" ${sm === 1 ? 'selected' : ''}>First</option><option value="2" ${sm === 2 ? 'selected' : ''}>Second</option></select></div></div>
    <p class="hint">Use the level you were in that session, even if some courses were from another level.</p>
    <div class="sheet-actions">${editing ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Delete</button>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${editing ? 'Save' : 'Next'}</button></div></form>`,
  (f) => {
    const level = Number(f.elements.level.value), s2 = Number(f.elements.sem.value);
    const clash = state.semesters.find((x) => x !== sem && x.level === level && x.sem === s2);
    if (clash) { dlg.close(); toast(`${clash.name} already exists. Opened it.`); location.hash = '#results'; setTimeout(() => addCoursesSheet(clash.id), 60); return; }
    if (editing) { sem.level = level; sem.sem = s2; sem.name = semName(level, s2); sortSemesters(state.semesters); save(); dlg.close(); render(); return; }
    const s = { id: L.uid(), level, sem: s2, name: semName(level, s2), courses: [] };
    state.semesters.push(s); sortSemesters(state.semesters); save(); dlg.close();
    if (location.hash !== '#results') location.hash = '#results'; else render();
    setTimeout(() => addCoursesSheet(s.id), 60);
  });
  dlg.querySelector('[data-del]')?.addEventListener('click', () => {
    const i = state.semesters.indexOf(sem); state.semesters.splice(i, 1); save(); dlg.close(); render();
    toast(`Deleted ${sem.name}`, { label: 'Undo', run: () => { state.semesters.splice(i, 0, sem); save(); render(); } });
  });
}

function addCoursesSheet(semId) {
  const sem = state.semesters.find((s) => s.id === semId); if (!sem) return;
  const have = new Set(sem.courses.map((c) => c.code));
  const list = semesterCourses(P().prog, sem.level, sem.sem).filter((c) => !have.has(c.code));
  const cat = catalog(P().prog);
  const opt = (sel = 'skip') => `<option value="skip" ${sel === 'skip' ? 'selected' : ''}>Skip</option><option value="ip" ${sel === 'ip' ? 'selected' : ''}>In progress</option>${L.GRADES.map((g) => `<option value="${g}">${g}</option>`).join('')}`;
  const pending = sem.courses.some((c) => !c.grade) || state.semesters.at(-1) === sem;
  sheet(`<form class="sheet" novalidate><div><h2 id="dlg-title">Add courses</h2><p class="small muted">${esc(sem.name)} · pick a grade for each course you took</p></div>
    ${list.length ? `<div class="list" style="margin:0 -22px;max-height:46vh;overflow:auto">${list.map((c, i) => `<div class="item"><div class="grow"><div class="title">${esc(c.code)} <span class="tiny muted">${c.units}u</span></div><div class="sub">${esc(c.title)}</div></div>
      <label class="sr-only" for="ac-${i}">Grade for ${esc(c.code)}</label><select id="ac-${i}" name="g-${esc(c.code)}" style="width:auto;min-width:116px">${opt(pending ? 'ip' : 'skip')}</select></div>`).join('')}</div>
      <p class="hint">From the handbook. If your portal shows different units, fix them after saving.</p>` : '<p class="muted small">All handbook courses for this semester are already added.</p>'}
    <details><summary class="small" style="cursor:pointer;font-weight:800;color:var(--blue);min-height:32px">Add a course not listed</summary>
      <div class="stack-sm" style="margin-top:10px"><div class="grid-2">
        <div class="field"><label for="x-code">Code</label><input id="x-code" name="xcode" list="codes" placeholder="e.g. PHY 111" autocapitalize="characters"></div>
        <div class="field"><label for="x-units">Units</label><input id="x-units" name="xunits" type="number" inputmode="numeric" min="1" max="9"></div></div>
        <div class="field"><label for="x-grade">Grade</label><select id="x-grade" name="xgrade">${opt('ip')}</select></div>
        <datalist id="codes">${[...cat.values()].map((c) => `<option value="${c.code}">${esc(c.title)}</option>`).join('')}</datalist></div></details>
    <span class="error" id="ac-err" hidden></span>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`,
  (f) => {
    const add = [];
    for (const c of list) { const v = f.elements[`g-${c.code}`]?.value; if (v && v !== 'skip') add.push({ ...c, grade: v === 'ip' ? null : v }); }
    const xc = L.normCode(f.elements.xcode.value);
    if (xc) {
      const known = cat.get(xc); const u = Number(f.elements.xunits.value) || known?.units;
      const err = $('#ac-err');
      if (!/^[A-Z]{2,4} \d{3}$/.test(xc)) { err.textContent = 'Course code should look like PHY 111.'; err.hidden = false; return; }
      if (!(u > 0 && u <= 9)) { err.textContent = `Add the units for ${xc}.`; err.hidden = false; return; }
      if (have.has(xc) || add.some((a) => a.code === xc)) { err.textContent = `${xc} is already in this semester.`; err.hidden = false; return; }
      const v = f.elements.xgrade.value;
      if (v !== 'skip') add.push({ code: xc, title: known?.title || '', units: u, grade: v === 'ip' ? null : v });
    }
    if (!add.length) { dlg.close(); return; }
    dlg.close();
    withFeedback(() => { for (const a of add) sem.courses.push({ id: L.uid(), code: a.code, title: a.title, units: a.units, grade: a.grade, target: null, difficulty: 2, diffManual: false }); return sem.id; });
    render(); toast(`Added ${add.length} course${add.length > 1 ? 's' : ''}`);
  });
}

function courseSheet(id) {
  const f0 = findCourse(id); if (!f0) return;
  const { sem, course: c } = f0;
  let pick = c.grade || '';
  sheet(`<form class="sheet" novalidate><div><h2 id="dlg-title">${esc(c.code)}</h2><p class="small muted">${esc(c.title || '')} · ${esc(sem.name)}</p></div>
    <fieldset class="stack-sm"><legend class="legend">Grade</legend>
      <div class="gpick">${L.GRADES.map((g) => `<button type="button" class="${g}" data-pick="${g}" aria-pressed="${pick === g}" style="${pick === g ? `background:var(--g${g})` : ''}">${g}</button>`).join('')}</div>
      <button type="button" class="chip" data-pick="" aria-pressed="${!pick}">In progress</button></fieldset>
    <div class="grid-2"><div class="field"><label for="c-score">Got a score instead?</label><input id="c-score" type="number" inputmode="decimal" min="0" max="100" placeholder="e.g. 68"><span class="hint" id="c-score-out"></span></div>
      <div class="field"><label for="c-units">Units</label><input id="c-units" name="units" type="number" inputmode="numeric" min="1" max="9" value="${c.units}"></div></div>
    <span class="error" id="c-err" hidden></span>
    <div class="sheet-actions"><button type="button" class="btn danger" data-del style="margin-right:auto">Delete</button><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`,
  (f) => {
    const u = Number(f.elements.units.value);
    if (!(u > 0 && u <= 9)) { const e = $('#c-err'); e.textContent = 'Units must be between 1 and 9.'; e.hidden = false; return; }
    dlg.close();
    withFeedback(() => { c.units = u; c.grade = pick || null; return sem.id; });
    render();
  });
  const paint = () => dlg.querySelectorAll('[data-pick]').forEach((b) => { const on = b.dataset.pick === pick; b.setAttribute('aria-pressed', String(on)); if (b.dataset.pick) b.style.background = on ? `var(--g${b.dataset.pick})` : ''; });
  dlg.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { pick = b.dataset.pick; paint(); sound.tap(); }));
  $('#c-score').addEventListener('input', (e) => {
    const g = L.scoreToGrade(e.target.value); const out = $('#c-score-out');
    if (e.target.value === '') { out.textContent = ''; return; }
    if (!g) { out.textContent = 'Enter 0–100'; return; }
    out.textContent = `${e.target.value}% = ${g} at BIU`; pick = g; paint();
  });
  dlg.querySelector('[data-del]').addEventListener('click', () => {
    const i = sem.courses.indexOf(c); sem.courses.splice(i, 1); save(); dlg.close(); render();
    toast(`Deleted ${c.code}`, { label: 'Undo', run: () => { sem.courses.splice(i, 0, c); save(); render(); } });
  });
}

/* ---------- screenshot import (on-device OCR) ---------- */
let tessWorker = null;
async function getOCR(onProgress) {
  if (tessWorker) return tessWorker;
  const base = new URL('vendor/tesseract/', location.href).href;
  if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
  tessWorker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', gzip: true,
    logger: (m) => onProgress?.(m),
  });
  return tessWorker;
}

function importSheet(semId) {
  sheet(`<div class="sheet"><div class="row spread"><h2 id="dlg-title">Upload results</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <label class="drop" for="imp-file" id="drop">${spark('happy', 64)}<b>Choose screenshots</b><span class="small muted">Your BIU portal result page or course registration page. You can pick more than one.</span>
      <span class="btn primary sm" aria-hidden="true">${I.camera}Choose</span></label>
    <input id="imp-file" type="file" accept="image/*" multiple class="sr-only">
    <p class="tiny muted">Read on your phone. The picture never leaves your device. The first time, Aim downloads its reader (about 7 MB) and keeps it for offline use.</p></div>`);
  const input = $('#imp-file'), drop = $('#drop');
  input.addEventListener('change', () => runImport([...input.files], semId));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); runImport([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')), semId); });
}

async function runImport(files, semId) {
  if (!files.length) return;
  const show = (pct, msg) => { dlg.innerHTML = `<div class="sheet" style="text-align:center;justify-items:center">${spark('focus', 72)}<h2 id="dlg-title">Reading your results…</h2>
    <div class="bar" style="width:100%" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div><p class="small muted">${esc(msg)}</p></div>`; };
  show(3, 'Getting ready');
  let text = '';
  try {
    const w = await getOCR((m) => { if (m.status && m.progress != null) show(5 + m.progress * 40, m.status.includes('load') || m.status.includes('init') ? 'Loading the reader (first time only)' : 'Reading'); });
    for (let i = 0; i < files.length; i++) {
      show(50 + (i / files.length) * 45, `Reading picture ${i + 1} of ${files.length}`);
      const { data } = await w.recognize(files[i]);
      text += '\n' + data.text;
    }
  } catch (e) {
    dlg.innerHTML = `<div class="sheet">${spark('worried', 64)}<h2 id="dlg-title">I couldn’t read that</h2><p class="muted">The reader didn’t load or the picture couldn’t be opened. Check your connection the first time, or add courses by hand.</p>
      <div class="sheet-actions"><button class="btn" data-close>Close</button></div></div>`;
    dlg.querySelector('[data-close]').onclick = () => dlg.close(); return;
  }
  const parsed = L.parsePortalText(text, P().prog);
  reviewSheet(parsed, semId);
}

function reviewSheet(parsed, semId) {
  const rows = parsed.courses.map((c) => ({ ...c, key: L.uid() }));
  if (!rows.length) {
    sheet(`<div class="sheet">${spark('worried', 64)}<h2 id="dlg-title">No courses found</h2><p class="muted">I couldn’t spot course codes in that picture. Use a clear screenshot of the results table (not a photo of the screen), or add them by hand.</p>
      <div class="sheet-actions"><button class="btn" data-close>Close</button><button class="btn primary" id="rv-manual">Add by hand</button></div></div>`);
    $('#rv-manual').onclick = () => { dlg.close(); semId ? addCoursesSheet(semId) : semesterSheet(); }; return;
  }
  const graded = rows.some((r) => r.grade);
  const guessLevel = P().level;
  const target = semId ? state.semesters.find((s) => s.id === semId) : state.semesters.find((s) => s.level === guessLevel && s.sem === (parsed.semester || 1));
  const semOpts = state.semesters.map((s) => `<option value="${s.id}" ${target?.id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  sheet(`<form class="sheet" novalidate><div><h2 id="dlg-title">Check before saving</h2><p class="small muted">Found ${rows.length} course${rows.length > 1 ? 's' : ''}${graded ? ' with grades' : ' (registration, so marked in progress)'}. Fix anything I misread.</p></div>
    <div class="field"><label for="rv-sem">Save to</label><select id="rv-sem" name="sem">${semOpts}${[100, 200, 300, 400].flatMap((l) => [1, 2].map((s) => state.semesters.some((x) => x.level === l && x.sem === s) ? '' : `<option value="new-${l}-${s}" ${!target && l === guessLevel && s === (parsed.semester || 1) ? 'selected' : ''}>New: ${semName(l, s)}</option>`)).join('')}</select></div>
    <div class="list" style="margin:0 -22px;max-height:44vh;overflow:auto">${rows.map((r, i) => `<div class="item" style="flex-wrap:wrap;gap:8px">
      <div class="grow" style="min-width:150px"><label class="sr-only" for="rv-c-${i}">Course code</label><input id="rv-c-${i}" name="code-${r.key}" value="${esc(r.code)}" style="min-height:44px;font-weight:900">
        <div class="tiny muted" style="margin-top:4px">${esc(r.title)} ${r.notes.map((n) => `<span class="flag">${esc(n)}</span>`).join(' ')}</div></div>
      <label class="sr-only" for="rv-u-${i}">Units</label><input id="rv-u-${i}" name="units-${r.key}" type="number" min="1" max="9" value="${r.units}" style="width:64px;min-height:44px" inputmode="numeric">
      <label class="sr-only" for="rv-g-${i}">Grade</label><select id="rv-g-${i}" name="grade-${r.key}" style="width:auto;min-height:44px"><option value="">In progress</option>${L.GRADES.map((g) => `<option ${r.grade === g ? 'selected' : ''}>${g}</option>`).join('')}<option value="skip">Don’t add</option></select></div>`).join('')}</div>
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
    let sem; const v = f.elements.sem.value;
    if (v.startsWith('new-')) { const [, l, s] = v.split('-'); sem = { id: L.uid(), level: Number(l), sem: Number(s), name: semName(Number(l), Number(s)), courses: [] }; state.semesters.push(sem); sortSemesters(state.semesters); }
    else sem = state.semesters.find((s) => s.id === v);
    dlg.close();
    withFeedback(() => {
      for (const o of out) {
        const ex = sem.courses.find((c) => c.code === o.code);
        if (ex) Object.assign(ex, { units: o.units, grade: o.grade ?? ex.grade, title: ex.title || o.title });
        else sem.courses.push({ id: L.uid(), ...o, target: null, difficulty: 2, diffManual: false });
      }
      return sem.id;
    });
    if (!P().onboarded) { P().onboarded = true; save(); }
    location.hash = graded ? '#home' : '#plan'; render();
    if (!graded) toast(`Saved ${out.length} courses. Set your targets next.`);
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

function targetSheet() {
  sheet(`<form class="sheet"><div class="say">${spark('focus', 56)}<div class="bubble">What are you aiming for?</div></div>
    <fieldset class="class-pick"><legend class="sr-only">Target class</legend>${BIU.classes.slice(0, 3).map((c) => `<label class="${CLASS_CSS[c.short]}"><span>${c.label}<br><span class="tiny">${c.min.toFixed(2)}+</span></span><input type="radio" name="t" value="${c.min}" ${P().target === c.min ? 'checked' : ''}></label>`).join('')}</fieldset>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Set target</button></div></form>`, (f) => {
    const v = Number(f.elements.t.value); if (!v) return;
    P().target = v; save(); dlg.close(); render();
    const pl = calcPlan();
    cheer(pl.status === 'impossible' ? `${L.classify(v).label} is out of reach now. Best possible: ${f2(pl.best)}.` : `Target set: ${L.classify(v).label}. Let’s get it!`, pl.status === 'impossible' ? 'worried' : 'proud');
  });
}

const ACTIONS = {
  'onb-back': () => { onb.step = Math.max(0, onb.step - 1); render(); },
  'onb-skip-target': () => { onb.step = 3; render(); },
  'onb-upload': () => { importSheet(); },
  'onb-manual': () => { P().onboarded = true; save(); location.hash = '#results'; render(); setTimeout(() => semesterSheet(), 60); },
  'onb-fresher': () => {
    P().onboarded = true;
    if (!state.semesters.length) {
      const s = { id: L.uid(), level: P().level, sem: 1, name: semName(P().level, 1), courses: semesterCourses(P().prog, P().level, 1).map((c) => ({ id: L.uid(), code: c.code, title: c.title, units: c.units, grade: null, target: null, difficulty: 2, diffManual: false })) };
      state.semesters.push(s);
    }
    save(); location.hash = '#plan'; render(); cheer('I added your handbook courses. Set your targets!', 'happy');
  },
  import: (el) => importSheet(el.dataset.sem),
  'add-sem': () => semesterSheet(),
  'edit-sem': (el) => semesterSheet(state.semesters.find((s) => s.id === el.dataset.id)),
  'add-courses': (el) => addCoursesSheet(el.dataset.sem),
  'edit-course': (el) => courseSheet(el.dataset.id),
  'set-target': () => targetSheet(),
  suggest: () => {
    const plan = calcPlan(), cur = current();
    if (!P().target) { targetSheet(); return; }
    const need = plan.status === 'possible' ? plan.required : plan.status === 'impossible' ? 5 : 3.5;
    const picks = L.suggestGrades(cur, need, plan);
    for (const c of cur) { const f = findCourse(c.id); if (f) f.course.target = picks[c.id]; }
    save(); render();
    const pr = L.projection(state.semesters, P().policy);
    cheer(`Targets set! This semester: ${f2(pr.semesterGpa)}`, pr.semesterGpa >= 4.5 ? 'proud' : 'happy');
  },
  day: (el) => {
    const d = Number(el.dataset.day), days = state.plan.days;
    state.plan.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    el.setAttribute('aria-pressed', String(state.plan.days.includes(d))); sound.tap(); save(); $('#plan-out').innerHTML = planOut();
  },
  ics: () => {
    const { events } = currentPlanEvents(); if (!events.length) return;
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
  const q = e.target.closest('[data-ask]');
  if (q) { e.preventDefault(); const def = QUESTIONS.find((x) => x.id === q.dataset.ask); if (currentRoute() !== 'ask') { greet(); location.hash = '#ask'; } ask(def.id, def.label); return; }
  const wg = e.target.closest('[data-wi-grade]');
  if (wg) { const n = wg.dataset.n; const course = $(`[data-wi-course="${n}"]`)?.value; const code = current().find((c) => c.id === course)?.code; chat.push({ me: true, text: `What if I get ${wg.dataset.wiGrade} in ${code}?` }); botSay(answer('whatif', state, { course, grade: wg.dataset.wiGrade })); return; }
  const ca = e.target.closest('[data-chat-action]');
  if (ca) {
    if (ca.dataset.chatAction === 'apply-suggest') { ACTIONS.suggest(); chat.push({ me: true, text: 'Use these as my targets' }); botSay({ mood: 'proud', html: '<p>Done! Your targets are set on the Plan tab. Now let’s build the timetable to hit them.</p>', action: { id: 'go-plan', label: 'Open my plan' } }); }
    if (ca.dataset.chatAction === 'go-plan') location.hash = '#plan';
    return;
  }
  const g = e.target.closest('[data-gcal]');
  if (g) { state.plan.added[g.dataset.gcal] = true; save(); setTimeout(() => { const o = $('#plan-out'); if (o) o.innerHTML = planOut(); }, 300); }
});
document.addEventListener('keydown', (e) => { const el = e.target.closest?.('[data-keyclick]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.getElementById(el.htmlFor)?.click(); } });

document.addEventListener('submit', (e) => {
  if (e.target.id === 'ask-form') {
    e.preventDefault(); const inp = $('#ask-in'); const text = inp.value.trim(); if (!text) return;
    const id = routeQuestion(text); inp.value = '';
    chat.push({ me: true, text });
    botSay(id ? answer(id, state) : { mood: 'happy', html: '<p>I can’t answer that one yet. I only know BIU’s rules and your results. Try one of the questions below.</p>' });
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
    onb.step = 3; render();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.diff) { const f = findCourse(t.dataset.diff); if (f) { f.course.difficulty = Number(t.value); f.course.diffManual = true; save(); } }
  else if (t.dataset.target) { const f = findCourse(t.dataset.target); if (f) { f.course.target = t.value || null; save(); $('#proj').innerHTML = projBlock(); } }
  else if (t.dataset.plan) { const k = t.dataset.plan; state.plan[k] = ['length', 'perDay', 'breakMin', 'alarm'].includes(k) ? Number(t.value) : t.value; save(); $('#plan-out').innerHTML = planOut(); }
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
    const keepPrefs = { sound: P().sound, theme: P().theme };
    state = sanitize(data); state.profile.onboarded = true; if (!data.v) Object.assign(state.profile, keepPrefs);
    save(); applyTheme(); render(); toast('Backup restored');
  } catch { toast('That file isn’t an Aim backup.'); }
}

$('#avatar-btn').addEventListener('click', () => { location.hash = '#settings'; });
function applyTheme() { const t = P().theme; if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

const AFTER = {
  home: () => { const el = $('#cgpa-num'); if (el && !sessionStorageSafe('counted')) countUp(el, Number(el.dataset.v)); $('.say .spark')?.classList.add('jump'); },
  ask: () => { const c = $('#chat'); c?.lastElementChild?.scrollIntoView({ block: 'nearest' }); },
};
function sessionStorageSafe(k) { try { const had = sessionStorage.getItem('aim:' + k); sessionStorage.setItem('aim:' + k, '1'); return had; } catch { return null; } }

/* ============================== Service worker & boot ============================== */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const prompt = (w) => toast('A new version of Aim is ready.', { label: 'Refresh', run: () => w.postMessage('skip-waiting') });
      if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); }); });
      let done = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!done) { done = true; location.reload(); } });
    } catch { /* offline support unavailable */ }
  });
}

setSound(P().sound);
applyTheme(); applyIcon();
render();
