// Pure logic (no DOM). Tested in tests/logic.test.mjs
import { BIU, catalog, seriesTotals } from './biu.js';

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const GRADES = BIU.grades.map((g) => g.g);
export const gp = (g) => BIU.grades.find((x) => x.g === g)?.p ?? null;
export const validUnits = (u) => { const n = Number(u); return Number.isFinite(n) && n > 0 ? n : 0; };

export function scoreToGrade(score) {
  const s = Number(score);
  if (!Number.isFinite(s) || s < 0 || s > 100) return null;
  return BIU.grades.find((g) => s >= g.min).g;
}

export function classify(gpa) {
  if (gpa == null || Number.isNaN(gpa)) return null;
  return BIU.classes.find((c) => gpa + 1e-9 >= c.min) || BIU.classes.at(-1);
}

export function nextClassUp(gpa) {
  const cls = BIU.classes.filter((c) => c.min > 0).reverse(); // ascending
  return cls.find((c) => c.min > (gpa ?? -1) + 1e-9) || null;
}

/** Series (100, 200…) from a code like "CSC 211"; null if unknown. */
export function seriesOf(code) {
  const m = /(\d)\d\d\b/.exec(code || '');
  if (!m) return null;
  const s = Number(m[1]) * 100;
  return s >= 100 && s <= 400 ? s : s > 400 ? 400 : null;
}

export function normCode(code) {
  const m = /^\s*([A-Za-z]{2,4})\s*-?\s*(\d{3})\s*$/.exec(code || '');
  return m ? `${m[1].toUpperCase()} ${m[2]}` : String(code || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/** All courses with semester info, in order. */
export function allCourses(semesters) {
  const out = [];
  semesters.forEach((s, si) => (s.courses || []).forEach((c) => out.push({ ...c, semesterId: s.id, semesterIndex: si })));
  return out;
}

/**
 * Which graded attempts count. policy 'all': every attempt counts (failed grade stays in CGPA);
 * 'latest': only the most recent attempt of a course counts.
 */
export function countedCourses(semesters, policy = 'all') {
  const graded = allCourses(semesters).filter((c) => c.grade && gp(c.grade) != null && validUnits(c.units));
  if (policy !== 'latest') return graded;
  const last = new Map();
  for (const c of graded) last.set(c.code || c.id, c);
  return graded.filter((c) => last.get(c.code || c.id) === c);
}

export function totals(courses) {
  let units = 0, points = 0;
  for (const c of courses) { const u = validUnits(c.units), p = gp(c.grade); if (u && p != null) { units += u; points += u * p; } }
  return { units, points, gpa: units ? points / units : null };
}

export function semesterGpa(sem) { return totals((sem.courses || []).filter((c) => c.grade)); }

export function cgpa(semesters, policy) { return totals(countedCourses(semesters, policy)); }

export function inProgress(semesters) {
  return allCourses(semesters).filter((c) => !c.grade && validUnits(c.units));
}

/** Retakes: codes that appear more than once. */
export function retakes(semesters) {
  const seen = new Map();
  for (const c of allCourses(semesters)) if (c.code) seen.set(c.code, (seen.get(c.code) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([code]) => code);
}

/** GPA per course series. */
export function seriesStats(semesters, policy) {
  const out = {};
  for (const s of [100, 200, 300, 400]) out[s] = { units: 0, points: 0, gpa: null, pending: 0 };
  for (const c of countedCourses(semesters, policy)) {
    const s = seriesOf(c.code); if (!s) continue;
    out[s].units += validUnits(c.units); out[s].points += validUnits(c.units) * gp(c.grade);
  }
  for (const c of inProgress(semesters)) { const s = seriesOf(c.code); if (s) out[s].pending += validUnits(c.units); }
  for (const s of Object.keys(out)) out[s].gpa = out[s].units ? out[s].points / out[s].units : null;
  return out;
}

/**
 * Weighted degree projection (handbook §27).
 * For a target final grade T, solves for the uniform average R needed on every
 * unit not yet graded: final = Σ w_s · (p_s + R·r_s) / n_s, where n_s is the
 * series size (curriculum total, or more if the student has taken more).
 */
export function weightedPlan(semesters, { entry = 'utme', target, policy, prog = 'csc', mode = 'weighted' } = {}) {
  const W = BIU.weights[entry] || BIU.weights.utme;
  const tot = seriesTotals(prog);
  const st = seriesStats(semesters, policy);
  const rows = [100, 200, 300, 400].map((s) => {
    const n = Math.max(tot[s], st[s].units + st[s].pending);
    return { series: s, weight: mode === 'simple' ? null : W[s], n, done: st[s].units, points: st[s].points, gpa: st[s].gpa, remaining: n - st[s].units };
  }).filter((r) => mode === 'simple' || r.weight > 0);

  let a, b, best;
  if (mode === 'simple') {
    const N = rows.reduce((x, r) => x + r.n, 0);
    a = rows.reduce((x, r) => x + r.points, 0) / N;
    b = rows.reduce((x, r) => x + r.remaining, 0) / N;
  } else {
    a = rows.reduce((x, r) => x + (r.weight * r.points) / r.n, 0);
    b = rows.reduce((x, r) => x + (r.weight * r.remaining) / r.n, 0);
  }
  best = a + b * BIU.max;
  const result = { rows, best, floor: a, mode };
  const T = Number(target);
  if (!(T > 0)) return { ...result, status: 'no-target' };
  if (b <= 1e-9) return { ...result, status: a + 1e-9 >= T ? 'achieved' : 'missed', final: a };
  const R = (T - a) / b;
  return { ...result, required: R, status: R > BIU.max + 1e-9 ? 'impossible' : R <= 0 ? 'secured' : 'possible' };
}

/** Weight per unit of a course in the final grade (0 for courses that don't count). */
export function unitWeight(code, plan) {
  const s = seriesOf(code);
  const row = plan.rows.find((r) => r.series === s);
  if (!row) return 0;
  return plan.mode === 'simple' ? 1 : row.weight / row.n;
}

/**
 * Suggest target grades for this semester's courses so their weighted contribution
 * averages at least `required`. Drops go first to courses that count least, then
 * (least impact on the final grade), then harder ones. Never suggests below B.
 */
export function suggestGrades(courses, required, plan) {
  const order = ['A', 'B']; // never plan for less than B
  const lvl = Object.fromEntries(courses.map((c) => [c.id, 0]));
  const k = (c) => unitWeight(c.code, plan) * validUnits(c.units);
  const totalK = courses.reduce((s, c) => s + k(c), 0);
  const need = Math.max(0, required) * totalK - 1e-9;
  const score = () => courses.reduce((s, c) => s + k(c) * gp(order[lvl[c.id]]), 0);
  let changed = true;
  while (changed) {
    changed = false;
    const cand = courses.filter((c) => lvl[c.id] < order.length - 1).sort((x, y) =>
      (k(x) - k(y)) || ((y.difficulty || 2) - (x.difficulty || 2)) || (lvl[x.id] - lvl[y.id]));
    for (const c of cand) {
      lvl[c.id]++;
      if (totalK === 0 || score() >= need) { changed = true; break; }
      lvl[c.id]--;
    }
    if (totalK === 0) break;
  }
  return Object.fromEntries(courses.map((c) => [c.id, order[lvl[c.id]]]));
}

/** Simple CGPA and per-semester GPA if in-progress courses get their target grades. */
export function projection(semesters, policy) {
  const done = cgpa(semesters, policy);
  let u = done.units, p = done.points, su = 0, sp = 0, missing = 0;
  for (const c of inProgress(semesters)) {
    const g = gp(c.target);
    if (g == null) { missing++; continue; }
    u += validUnits(c.units); p += validUnits(c.units) * g; su += validUnits(c.units); sp += validUnits(c.units) * g;
  }
  return { cgpa: u ? p / u : null, semesterGpa: su ? sp / su : null, missing };
}

/** Difficulty from history: average grade in past courses with the same subject prefix. */
export function autoDifficulty(code, semesters) {
  const prefix = (code || '').split(' ')[0];
  const past = allCourses(semesters).filter((c) => c.grade && (c.code || '').startsWith(prefix + ' '));
  if (!past.length) return { level: 2, reason: 'No past results in this subject yet' };
  const avg = totals(past).gpa;
  if (avg < 3.5) return { level: 3, reason: `Your ${prefix} average so far is ${avg.toFixed(2)}` };
  if (avg < 4.5) return { level: 2, reason: `Your ${prefix} average so far is ${avg.toFixed(2)}` };
  return { level: 1, reason: `You average ${avg.toFixed(2)} in ${prefix}` };
}

/** Handbook §16: share of registered credits passed this session. */
export function promotionStatus(courses) {
  const graded = courses.filter((c) => c.grade);
  const total = graded.reduce((s, c) => s + validUnits(c.units), 0);
  if (!total) return null;
  const passed = graded.filter((c) => gp(c.grade) > 0).reduce((s, c) => s + validUnits(c.units), 0);
  const share = passed / total;
  return { share, status: share >= BIU.promotion.promote ? 'promoted' : share >= BIU.promotion.probation ? 'probation' : 'withdraw' };
}

/* -------------------- Portal screenshot parsing -------------------- */

const PREFIXES = ['CSC', 'MTH', 'PHY', 'GST', 'IDS', 'ENT', 'STA', 'CHM', 'BIO', 'ECO', 'ACC', 'BUS', 'MAC', 'ENG', 'GNS'];

function fixDigits(s) { return s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8'); }

function fixPrefix(raw, num, cat) {
  const letters = raw.toUpperCase().replace(/€/g, 'C').replace(/[^A-Z]/g, '');
  if (PREFIXES.includes(letters)) return letters;
  // Look for a known course with this number whose prefix ends/starts with what we read
  const hits = [...cat.keys()].filter((code) => code.endsWith(' ' + num)).map((c) => c.split(' ')[0]);
  const near = hits.find((p) => p.endsWith(letters) || p.startsWith(letters) || lev(p, letters) <= 1);
  if (near) return near;
  const known = PREFIXES.find((p) => (letters.length >= 2 && (p.endsWith(letters) || p.startsWith(letters))) || lev(p, letters) <= 1);
  return known || (letters.length >= 3 ? letters.slice(-3) : null);
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Turn OCR text from a BIU portal results/registration page into courses.
 * Returns { semester: 1|2|null, courses: [{code,title,units,grade,confidence,notes}] }
 */
const SEM_RE = /^(FIRST|SECOND|1ST|2ND|FIRS|F1RST|FlRST)\b/i;
const FOOTER_RE = /^(course|student|adviser|total|semester|signature|balance|maximum)/i;
const TAIL_RE = /\s+(APPROVED|PENDING|NOT APPROVED|[(\[]?[A-Fa-f](?:[A-Fa-f])?[.,)\]]?)\s*$/i;

/**
 * Phone-width portal tables wrap: the course number lands on the next line
 * ("FIRST CSC 3 INTRODUCTION TO APPROVED" / "112 COMPUTER" / "APPLICATIONS").
 * Join each row's continuation lines back into one canonical line.
 */
export function joinWrapped(lines) {
  const groups = []; let cur = null;
  for (const raw of lines) {
    const line = String(raw).replace(/[‘’'"`~]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (SEM_RE.test(line)) { if (cur) groups.push(cur); cur = { head: line, cont: [] }; continue; }
    if (cur && cur.cont.length < 3 && !FOOTER_RE.test(line)) { cur.cont.push(line); continue; }
    if (cur) { groups.push(cur); cur = null; }
    groups.push({ head: line, cont: [] });
  }
  if (cur) groups.push(cur);
  return groups.map(({ head, cont }) => {
    const split = /^(\S+)\s+([A-Za-z€]{2,4})\s+([0-9OoIl|]{1,2})\s+(.*)$/.exec(head);
    const num = cont.length ? /^([0-9OoIl|SB]{3})\b\s*(.*)$/.exec(cont[0]) : null;
    if (split && num) {
      const tail = TAIL_RE.exec(split[4]);
      const title = (tail ? split[4].slice(0, tail.index) : split[4]).trim();
      const extra = [num[2], ...cont.slice(1)].filter(Boolean).join(' ');
      return `${split[1]} ${split[2]} ${num[1]} ${split[3]} ${title} ${extra}${tail ? ' ' + tail[1] : ''}`.replace(/\s+/g, ' ');
    }
    const full = /^(\S+\s+[A-Za-z€]{2,4}\s?[0-9OoIl|SB]{3}\b\s+[0-9OoIl|]{1,2}\s+)(.*)$/.exec(head);
    if (full && cont.length) {
      const tail = TAIL_RE.exec(full[2]);
      const title = (tail ? full[2].slice(0, tail.index) : full[2]).trim();
      const extra = cont.filter((c) => /^[A-Za-z ,&()\-/]+$/.test(c)).join(' ');
      return `${full[1]}${title} ${extra}${tail ? ' ' + tail[1] : ''}`.replace(/\s+/g, ' ');
    }
    return head;
  });
}

export function parsePortalText(text, prog = 'csc') {
  const cat = catalog(prog);
  const courses = [];
  let semester = null;
  for (const rawLine of joinWrapped(String(text || '').split(/\r?\n/))) {
    const line = rawLine.replace(/[‘’'"`]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const semM = /^(FIRST|SECOND|1ST|2ND)\b/i.exec(line);
    // code: 2–4 letter-ish chars, optional space, 3 digit-ish chars
    const m = /([A-Za-z€]{2,4})\s?([0-9OoIl|SB]{3})\b\s+([0-9OoIl|]{1,2})\s+(.*)$/.exec(line);
    if (!m) continue;
    const num = fixDigits(m[2]);
    const prefix = fixPrefix(m[1], num, cat);
    if (!prefix || !/^\d{3}$/.test(num)) continue;
    const code = `${prefix} ${num}`;
    let units = Number(fixDigits(m[3]));
    let rest = m[4].trim();
    let grade = null, status = 'in-progress';
    // grade at the end; OCR sometimes doubles it ("Cc") or adds punctuation ("C.", "(C")
    const tail = /\s+[(\[]?([A-Fa-f])(\1)?[.,)\]]?\s*$/i.exec(rest);
    if (tail) { grade = tail[1].toUpperCase(); rest = rest.slice(0, tail.index); status = 'graded'; }
    else rest = rest.replace(/\s+(APPROVED|PENDING|REMOVE|NOT APPROVED)\b.*$/i, '');
    const known = cat.get(code);
    const notes = [];
    if (!(units >= 1 && units <= 9)) { units = known?.units ?? 0; notes.push('units guessed from handbook'); }
    if (known && known.units !== units) notes.push(`handbook lists ${known.units} units`);
    const title = titleCase(rest.replace(/[^A-Za-z0-9 ,&()\-/]/g, '').trim()) || known?.title || '';
    const confidence = known ? 'high' : 'check';
    if (semM) semester = /^(SECOND|2ND)/i.test(semM[1]) ? 2 : 1;
    if (!courses.some((c) => c.code === code)) courses.push({ code, title, units, grade, status, confidence, notes });
  }
  return { semester, courses };
}

function titleCase(s) {
  const small = new Set(['and', 'of', 'to', 'in', 'the', 'for', 'using', 'its', 'a']);
  return s.toLowerCase().split(' ').map((w, i) => {
    if (/^(ii|iii|iv|i)$/.test(w)) return w.toUpperCase();
    if (/^\(?(c\+\+|sql|hci|siwes)\)?$/i.test(w)) return w.toUpperCase();
    if (i > 0 && small.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ').replace(/\s+/g, ' ').trim().replace(/ (T|1|l)$/, ' I'); // OCR often reads a trailing "I" as T/1
}

/* -------------------- Study plan + calendar (unchanged from v1, tested) -------------------- */

const DIFF_WEIGHT = { 1: 1, 2: 1.5, 3: 2 };
export function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); if (!m) return null;
  const h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return null; return h * 60 + mi;
}
export function minutesToTime(m) { return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

export function buildStudyPlan(courses, plan) {
  const days = [...new Set(plan.days || [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const start = timeToMinutes(plan.start);
  const len = Math.max(15, Math.min(240, Number(plan.length) || 60));
  const perDay = Math.max(1, Math.min(6, Number(plan.perDay) || 1));
  const gap = Math.max(0, Math.min(60, Number(plan.breakMin ?? 10)));
  const list = courses.filter((c) => validUnits(c.units));
  if (!days.length || start == null || !list.length) return { slots: [], perCourse: {} };
  const slots = [];
  for (const d of days) for (let i = 0; i < perDay; i++) {
    const s = start + i * (len + gap);
    if (s + len > 24 * 60 - 1) break;
    slots.push({ day: d, start: minutesToTime(s), end: minutesToTime(s + len), courseId: null });
  }
  const n = slots.length; if (!n) return { slots: [], perCourse: {} };
  const weights = list.map((c) => validUnits(c.units) * (DIFF_WEIGHT[c.difficulty] || 1.5));
  // D'Hondt allocation: give each course one slot (if there are enough), then hand out the
  // rest one by one to the course with the highest weight per slot already held.
  // A heavier/harder course can never end up with fewer sessions than a lighter one.
  const counts = list.map(() => (n >= list.length ? 1 : 0));
  let assigned = counts.reduce((a, b) => a + b, 0);
  while (assigned < n) {
    let best = -1, bi = 0;
    weights.forEach((w, i) => { const q = w / (counts[i] + 1); if (q > best + 1e-9 || (Math.abs(q - best) < 1e-9 && w > weights[bi])) { best = q; bi = i; } });
    counts[bi]++; assigned++;
  }
  const left = [...counts]; let prev = -1;
  for (const slot of slots) {
    let pick = -1, best = -1;
    left.forEach((c, i) => { if (c > 0 && i !== prev && c > best) { best = c; pick = i; } });
    if (pick < 0) left.forEach((c, i) => { if (c > 0 && c > best) { best = c; pick = i; } });
    if (pick < 0) break;
    slot.courseId = list[pick].id; left[pick]--; prev = pick;
  }
  const perCourse = {}; slots.forEach((s) => { perCourse[s.courseId] = (perCourse[s.courseId] || 0) + len; });
  return { slots, perCourse };
}

const pad = (n) => String(n).padStart(2, '0');
export function firstOnOrAfter(fromISO, day) {
  const [y, m, d] = fromISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12); dt.setDate(dt.getDate() + ((day - dt.getDay() + 7) % 7));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export const localStamp = (iso, hhmm) => `${iso.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', len = 0;
  for (const ch of line) { const l = enc.encode(ch).length; if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; } cur += ch; len += l; }
  out.push(cur); return out.join('\r\n ');
}
const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function buildICS(events, opts, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const until = `${opts.untilISO.replace(/-/g, '')}T235959`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aim//BIU Study Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Aim study plan'];
  for (const e of events) {
    const date = firstOnOrAfter(opts.fromISO, e.day); if (date > opts.untilISO) continue;
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART:${localStamp(date, e.start)}`, `DTEND:${localStamp(date, e.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DAY[e.day]};UNTIL=${until}`, `SUMMARY:${icsEscape(e.title)}`, `DESCRIPTION:${icsEscape(e.description)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${Math.max(0, opts.alarmMinutes ?? 10)}M`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function googleCalendarUrl(e, opts, tz) {
  const date = firstOnOrAfter(opts.fromISO, e.day);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, details: e.description,
    dates: `${localStamp(date, e.start)}/${localStamp(date, e.end)}`,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${DAY[e.day]};UNTIL=${opts.untilISO.replace(/-/g, '')}T235959` });
  if (tz) p.set('ctz', tz);
  return `https://calendar.google.com/calendar/render?${p}`;
}
export function slotsToEvents(slots, courses) {
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  return slots.filter((s) => byId[s.courseId]).map((s) => {
    const c = byId[s.courseId];
    return { uid: `aim-${s.day}-${s.start.replace(':', '')}-${c.id}@aim.study`, courseId: c.id, day: s.day, start: s.start, end: s.end,
      title: `Study: ${c.code || c.title}`, description: [c.title, 'Planned in Aim. Phone face down, one topic, then a 5-minute recap.'].filter(Boolean).join('\n') };
  });
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* -------------------- v2.1: auto-sorting and coaching -------------------- */

/** Handbook §5: first digit = level, second digit = semester (CSC 112 → 100 level, first semester). */
export function codeSlot(code) {
  const m = /(\d)(\d)\d\b/.exec(code || '');
  if (!m) return null;
  const level = Math.min(6, Math.max(1, Number(m[1]))) * 100;
  const sem = m[2] === '2' ? 2 : 1;
  return { level, sem };
}

const HOURS_FACTOR = { 1: 0.75, 2: 1, 3: 1.5 };
/** Recommended weekly reading hours: about 1 hour per unit, more for courses that are hard for you. */
export function recommendedHours(courses) {
  return courses.reduce((s, c) => s + validUnits(c.units) * (HOURS_FACTOR[c.difficulty] || 1), 0);
}

/** Pick sessions-per-day (and Saturday if needed) so the week roughly covers the recommended hours. */
export function autoWeek(courses, base) {
  const len = Number(base.length) || 60;
  const want = Math.max(1, Math.round((recommendedHours(courses) * 60) / len));
  let days = [1, 2, 3, 4, 5];
  let perDay = Math.min(3, Math.max(1, Math.ceil(want / days.length)));
  if (want > days.length * 3) days = [1, 2, 3, 4, 5, 6];
  perDay = Math.min(3, Math.max(1, Math.ceil(want / days.length)));
  return { ...base, days, perDay };
}

/** Past record in the same subject (prefix), for the coach card. */
export function subjectHistory(code, semesters) {
  const prefix = (code || '').split(' ')[0];
  const past = allCourses(semesters).filter((c) => c.grade && (c.code || '').split(' ')[0] === prefix && c.code !== code);
  const t = totals(past);
  return { prefix, grades: past.map((c) => c.grade), avg: t.gpa };
}

/**
 * Everything the plan screen needs for this semester's courses, in one place:
 * effective difficulty (auto from history unless the student changed it),
 * effective target (auto-suggested unless the student changed it), weight, reasons.
 */
export function coach(semesters, profile, plan) {
  const wp = weightedPlan(semesters, { entry: profile.entry, target: profile.target, policy: profile.policy, mode: profile.calc });
  const cur = inProgress(semesters).map((c) => {
    const auto = autoDifficulty(c.code, semesters);
    return { ...c, difficulty: c.diffManual ? c.difficulty : auto.level, diffReason: c.diffManual ? 'You set this' : auto.reason };
  });
  let need = null;
  if (profile.target) need = wp.status === 'possible' ? wp.required : wp.status === 'impossible' ? BIU.max : wp.status === 'secured' ? 3.5 : Number(profile.target);
  const auto = need != null && cur.length ? suggestGrades(cur, need, wp) : {};
  const built = buildStudyPlan(cur, plan);
  const courses = cur.map((c) => {
    const series = seriesOf(c.code);
    const row = wp.rows.find((r) => r.series === series);
    const pct = wp.mode === 'simple' ? null : row ? Math.round(row.weight * 100) : 0;
    const hist = subjectHistory(c.code, semesters);
    const target = c.targetManual ? c.target : auto[c.id] || null;
    return { ...c, target, targetAuto: !c.targetManual, seriesPct: pct, series, history: hist, minutes: built.perCourse[c.id] || 0 };
  });
  // projection with effective targets
  const sim = semesters.map((s) => ({ ...s, courses: s.courses.map((x) => { const k = courses.find((y) => y.id === x.id); return k ? { ...x, target: k.target } : x; }) }));
  const proj = projection(sim, profile.policy);
  return { plan: wp, need, courses, slots: built.slots, perCourse: built.perCourse, projection: proj, recommended: recommendedHours(cur) };
}

/** One line of coaching for a course. */
export function adviceFor(c) {
  const parts = [];
  if (c.seriesPct === 0) parts.push(`Counts 0% toward your class, but you must pass it`);
  else if (c.seriesPct != null) parts.push(`${c.series}-level: counts ${c.seriesPct}% of your degree class`);
  const h = c.history;
  if (h.grades.length) {
    const weak = h.avg < 3.5, strong = h.avg >= 4.5;
    parts.push(`Your ${h.prefix} so far: ${h.grades.join(', ')}${weak ? '. Your weakest subject, so put in extra hours' : strong ? '. One of your strongest' : ''}`);
  } else parts.push(`New subject for you`);
  return parts;
}
