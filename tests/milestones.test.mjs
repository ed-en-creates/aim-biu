import assert from 'node:assert/strict';
import * as M from '../app/js/milestones.js';
let n = 0; const t = (name, fn) => { fn(); n++; };
// 2026-11-23 is a Monday. Reading days Mon–Fri.
const days = [1, 2, 3, 4, 5];
t('streak counts done days, skips rest days, ignores unfinished today', () => {
  const p = M.emptyProgress('2026-11-12');
  for (const d of ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']) p.done[d] = ['x']; // Tue–Fri
  assert.equal(M.streak(p, '2026-11-23'), 4); // Mon not done yet, weekend skipped
  p.done['2026-11-23'] = ['y']; assert.equal(M.streak(p, '2026-11-23'), 5);
});
t('a recorded miss breaks the streak', () => {
  const p = M.emptyProgress('2026-11-12');
  p.done['2026-11-20'] = ['x']; p.missed['2026-11-19'] = true; p.done['2026-11-18'] = ['x'];
  assert.equal(M.streak(p, '2026-11-23'), 1);
});
t('misses found only on reading days since last check', () => {
  const p = M.emptyProgress('2026-11-16'); p.lastCheck = '2026-11-18'; p.done['2026-11-18'] = ['x']; p.done['2026-11-20'] = ['x'];
  const r = M.findMisses(p, days, '2026-11-23');
  assert.deepEqual(r.missed, ['2026-11-19']); assert.equal(r.away, false);
});
t('nothing missed on the first day', () => {
  const p = M.emptyProgress('2026-11-23'); assert.deepEqual(M.findMisses(p, days, '2026-11-23').missed, []);
});
t('long absence = away, only the last 7 days listed', () => {
  const p = M.emptyProgress('2026-10-01'); p.lastCheck = '2026-10-01';
  const r = M.findMisses(p, days, '2026-11-23'); assert.equal(r.away, true); assert.equal(r.missed.length, 5);
});
t('week row states', () => {
  const p = M.emptyProgress('2026-11-23'); p.done['2026-11-23'] = ['x'];
  const w = M.weekRow(p, days, '2026-11-24');
  assert.deepEqual(w.map((d) => d.state), ['done', 'today', 'ahead', 'ahead', 'ahead', 'rest', 'rest']);
});
t('perfect week needs every planned session ticked', () => {
  const p = M.emptyProgress('2026-11-23'); const ev = [{ uid: 'a', day: 1 }, { uid: 'b', day: 3 }];
  p.done['2026-11-23'] = ['a']; assert.equal(M.perfectWeek(p, ev, '2026-11-29'), false);
  p.done['2026-11-25'] = ['b']; assert.equal(M.perfectWeek(p, ev, '2026-11-29'), true);
});
t('grade results vs goals', () => {
  const r = M.gradeResults({ a: { code: 'MTH 211', target: 'B' }, b: { code: 'ENT 211', target: 'A' }, c: { code: 'PHY 111', target: 'B' } },
    [{ id: 'a', code: 'MTH 211', grade: 'C' }, { id: 'b', code: 'ENT 211', grade: 'A' }, { id: 'c', code: 'PHY 111', grade: 'A' }]);
  assert.deepEqual(r.map((x) => x.kind), ['miss', 'hit', 'beat']);
});
t('sanitize drops junk', () => {
  const p = M.sanitizeProgress({ since: 'nope', done: { '2026-11-01': ['a', 3], bad: ['x'] }, best: '7' }, '2026-11-23');
  assert.equal(p.since, '2026-11-23'); assert.deepEqual(p.done, { '2026-11-01': ['a'] }); assert.equal(p.best, 7);
});
console.log(`${n} milestone tests passed`);
