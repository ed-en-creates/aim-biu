// Milestones: reading streaks, missed days and grade-vs-goal results. Pure functions, no DOM.
// progress = { since: ISO, done: { ISO: [eventUid] }, missed: { ISO: true }, best: number, lastCheck: ISO, seen: {} }

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100];
const GP = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateOf = (iso) => new Date(iso + 'T12:00:00');
export const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const weekdayOf = (iso) => dateOf(iso).getDay();

export function emptyProgress(today) { return { since: today, done: {}, missed: {}, best: 0, lastCheck: today, seen: {} }; }

export function sanitizeProgress(raw, today) {
  const p = emptyProgress(today);
  if (!raw || typeof raw !== 'object') return p;
  const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isISO(raw.since)) p.since = raw.since;
  if (isISO(raw.lastCheck)) p.lastCheck = raw.lastCheck;
  p.best = Math.max(0, Number(raw.best) || 0);
  for (const [k, v] of Object.entries(raw.done || {})) if (isISO(k) && Array.isArray(v)) p.done[k] = v.filter((x) => typeof x === 'string');
  for (const k of Object.keys(raw.missed || {})) if (isISO(k)) p.missed[k] = true;
  if (raw.seen && typeof raw.seen === 'object') p.seen = { ...raw.seen };
  return p;
}

export const dayDone = (p, iso) => (p.done[iso]?.length || 0) > 0;

/**
 * Current streak = consecutive reading days completed, walking back from today.
 * Today counts only once done (an unfinished today doesn't break it yet).
 * A recorded miss breaks it; days that weren't reading days are skipped.
 */
export function streak(p, today) {
  let n = 0;
  let iso = today;
  if (!dayDone(p, iso)) iso = addDays(iso, -1);
  for (let guard = 0; guard < 400 && iso >= p.since; guard++, iso = addDays(iso, -1)) {
    if (dayDone(p, iso)) n++;
    else if (p.missed[iso]) break;
  }
  return n;
}

/**
 * Reading days between the last check and yesterday that have no session ticked.
 * Looks back at most 7 days: after a long absence we say "welcome back", not list every day.
 * Returns { missed: [ISO], away: boolean }.
 */
export function findMisses(p, readingDays, today, untilISO) {
  const yesterday = addDays(today, -1);
  let from = p.lastCheck > p.since ? p.lastCheck : p.since;
  if (from > yesterday) return { missed: [], away: false };
  const gap = Math.round((dateOf(yesterday) - dateOf(from)) / 864e5) + 1;
  const away = gap > 7;
  if (away) from = addDays(yesterday, -6);
  const missed = [];
  for (let iso = from; iso <= yesterday; iso = addDays(iso, 1)) {
    if (untilISO && iso > untilISO) break;
    if (readingDays.includes(weekdayOf(iso)) && !dayDone(p, iso)) missed.push(iso);
  }
  return { missed, away };
}

/** This week Mon–Sun, for the dot row. */
export function weekRow(p, readingDays, today) {
  const back = (weekdayOf(today) + 6) % 7; // days since Monday
  const mon = addDays(today, -back);
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(mon, i);
    const reading = readingDays.includes(weekdayOf(iso));
    const state = dayDone(p, iso) ? 'done' : iso === today ? (reading ? 'today' : 'rest') : iso > today ? (reading ? 'ahead' : 'rest') : p.missed[iso] ? 'missed' : reading && iso >= p.since ? 'missed' : 'rest';
    return { iso, label: 'MTWTFSS'[i], state, isToday: iso === today };
  });
}

/** True when every reading session of this week (so far planned) has been ticked. */
export function perfectWeek(p, events, today) {
  if (!events.length) return false;
  const back = (weekdayOf(today) + 6) % 7, mon = addDays(today, -back);
  for (let i = 0; i < 7; i++) {
    const iso = addDays(mon, i), wd = weekdayOf(iso);
    if (iso < p.since) continue;
    for (const e of events) if (e.day === wd && !(p.done[iso] || []).includes(e.uid)) return false;
  }
  return true;
}
export const weekKey = (today) => 'week-' + addDays(today, -((weekdayOf(today) + 6) % 7));

/** Compare new grades with the goals they had. goals: { courseId: {code, target} }. */
export function gradeResults(goals, graded) {
  const out = [];
  for (const g of graded) {
    const goal = goals[g.id];
    if (!goal?.target || !g.grade) continue;
    const d = GP[g.grade] - GP[goal.target];
    out.push({ code: g.code, grade: g.grade, target: goal.target, kind: d > 0 ? 'beat' : d === 0 ? 'hit' : 'miss' });
  }
  return out;
}

/** Highest GPA among finished semesters. */
export function bestSemester(semesters, gpaOf) {
  let best = null;
  for (const s of semesters) {
    if (s.current || !s.courses.length || s.courses.some((c) => !c.grade)) continue;
    const g = gpaOf(s).gpa;
    if (g != null && (best == null || g > best.gpa)) best = { gpa: g, name: s.name, id: s.id };
  }
  return best;
}
