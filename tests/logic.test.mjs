import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../js/logic.js';
import { seriesTotals, catalog, semesterCourses } from '../js/biu.js';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const C = (id, code, units, grade, extra = {}) => ({ id, code, units, grade, ...extra });

const eden = [
  { id: 's1', name: '100L · First semester', courses: [C('a', 'CSC 111', 3, 'B'), C('b', 'CSC 113', 2, 'A'), C('c', 'GST 111', 2, 'B'), C('d', 'GST 112', 2, 'B'), C('e', 'IDS 111', 1, 'B'), C('f', 'MTH 111', 2, 'C')] },
  { id: 's2', name: '100L · Second semester', courses: [C('g', 'CSC 121', 3, 'B'), C('h', 'CSC 122', 2, 'A'), C('i', 'CSC 123', 3, 'A'), C('j', 'IDS 121', 1, 'C'), C('k', 'MTH 122', 3, 'D'), C('l', 'MTH 126', 2, 'B')] },
  { id: 's3', name: '200L · First semester', courses: [C('m', 'CSC 112', 3, null), C('n', 'ENT 211', 2, null), C('o', 'GST 212', 2, null), C('p', 'MTH 211', 2, null), C('q', 'PHY 111', 2, null), C('r', 'PHY 113', 1, null)] },
];

t('BIU score → grade (handbook §23)', () => {
  assert.equal(L.scoreToGrade(78), 'A'); assert.equal(L.scoreToGrade(70), 'A'); assert.equal(L.scoreToGrade(69.9), 'B');
  assert.equal(L.scoreToGrade(45), 'D'); assert.equal(L.scoreToGrade(44), 'E'); assert.equal(L.scoreToGrade(39), 'F');
  assert.equal(L.scoreToGrade(101), null); assert.equal(L.scoreToGrade('x'), null);
});

t('class bands (handbook §28)', () => {
  assert.equal(L.classify(3.92).label, 'Second Class Upper'); assert.equal(L.classify(4.5).label, 'First Class');
  assert.equal(L.classify(2.39).label, 'Third Class'); assert.equal(L.classify(1.0).label, 'Pass'); assert.equal(L.classify(0.4).label, 'Below pass');
  assert.equal(L.nextClassUp(3.92).label, 'First Class'); assert.equal(L.nextClassUp(4.6), null);
});

t('series from course code', () => {
  assert.equal(L.seriesOf('CSC 112'), 100); assert.equal(L.seriesOf('MTH 211'), 200); assert.equal(L.seriesOf('CSC 426'), 400); assert.equal(L.seriesOf('XYZ'), null);
  assert.equal(L.normCode('csc112'), 'CSC 112'); assert.equal(L.normCode(' mth  211 '), 'MTH 211');
});

t("Eden's CGPA 3.92, semesters 4.00 / 3.86", () => {
  const c = L.cgpa(eden); assert.equal(c.units, 26); assert.equal(c.points, 102); assert.equal(L.round2(c.gpa), 3.92);
  assert.equal(L.round2(L.semesterGpa(eden[0]).gpa), 4); assert.equal(L.round2(L.semesterGpa(eden[1]).gpa), 3.86);
});

t('curriculum totals: 36 units per level', () => {
  assert.deepEqual(seriesTotals(), { 100: 36, 200: 36, 300: 36, 400: 36 });
  for (const [lvl, sem] of [[100, 1], [100, 2], [200, 1], [200, 2], [300, 1], [300, 2], [400, 1], [400, 2]])
    assert.equal(semesterCourses('csc', lvl, sem).reduce((s, c) => s + c.units, 0), 18, `${lvl}-${sem} = 18`);
});

t('weighted plan: First Class needs ≈4.52 on remaining work', () => {
  const p = L.weightedPlan(eden, { entry: 'utme', target: 4.5 });
  assert.equal(p.status, 'possible');
  assert.equal(L.round2(p.required), 4.52);
  assert.ok(p.best > 4.9 && p.best < 5);
  const de = L.weightedPlan(eden, { entry: 'de', target: 4.5 });
  assert.equal(L.round2(de.required), 4.5, 'direct entry: 100 level counts 0%');
  const simple = L.weightedPlan(eden, { mode: 'simple', target: 4.5 });
  assert.equal(L.round2(simple.required), 4.63, 'simple CGPA over 144 units');
});

t('weighted plan edge cases', () => {
  assert.equal(L.weightedPlan(eden, { target: null }).status, 'no-target');
  assert.equal(L.weightedPlan([], { target: 4.5 }).status, 'possible');
  // everything graded at A → achieved
  const all = Object.entries({ 100: 1, 200: 1, 300: 1, 400: 1 }).map(([s]) => ({ id: s, name: s, courses: [C(s, `CSC ${Number(s) + 11}`, 36, 'A')] }));
  assert.equal(L.weightedPlan(all, { target: 4.5 }).status, 'achieved');
  // a bad 100–200 record makes First Class impossible
  const bad = [{ id: 'x', name: 'x', courses: [C('x1', 'CSC 111', 36, 'F'), C('x2', 'CSC 211', 36, 'F')] }];
  const r = L.weightedPlan(bad, { target: 4.5 });
  assert.equal(r.status, 'impossible'); assert.equal(L.round2(r.best), 3.75);
});

t('suggestions: 100-level (5%) courses take drops first, hard MTH next, never below B', () => {
  const plan = L.weightedPlan(eden, { target: 4.5 });
  const cur = L.inProgress(eden).map((c) => ({ ...c, difficulty: L.autoDifficulty(c.code, eden).level }));
  const s = L.suggestGrades(cur, plan.required, plan);
  for (const g of Object.values(s)) assert.ok(['A', 'B'].includes(g));
  assert.deepEqual(s, { m: 'B', n: 'A', o: 'A', p: 'B', q: 'B', r: 'B' });
  const lax = L.suggestGrades(cur, 3.0, plan);
  assert.ok(Object.values(lax).every((g) => g === 'B'));
});

t('auto difficulty from past grades', () => {
  assert.equal(L.autoDifficulty('MTH 211', eden).level, 3); // MTH avg 2.43
  assert.equal(L.autoDifficulty('CSC 211', eden).level, 1); // CSC avg 4.54
  assert.equal(L.autoDifficulty('PHY 111', eden).level, 2); // no history
});

t('retakes: all attempts vs latest only', () => {
  const sems = [{ id: 'a', name: 'a', courses: [C('1', 'MTH 111', 2, 'F'), C('2', 'CSC 111', 2, 'A')] }, { id: 'b', name: 'b', courses: [C('3', 'MTH 111', 2, 'B')] }];
  assert.deepEqual(L.retakes(sems), ['MTH 111']);
  assert.equal(L.round2(L.cgpa(sems, 'all').gpa), 3); // (0+10+8)/6
  assert.equal(L.round2(L.cgpa(sems, 'latest').gpa), 4.5); // (10+8)/4
});

t('promotion status (handbook §16)', () => {
  assert.equal(L.promotionStatus([C('1', 'X 111', 4, 'A'), C('2', 'X 112', 4, 'F')]).status, 'promoted');
  assert.equal(L.promotionStatus([C('1', 'X 111', 3, 'A'), C('2', 'X 112', 7, 'F')]).status, 'probation');
  assert.equal(L.promotionStatus([C('1', 'X 111', 1, 'A'), C('2', 'X 112', 9, 'F')]).status, 'withdraw');
});

t("OCR text from Eden's real screenshots parses correctly", () => {
  const results = `SEMESTER CODE LOAD TITLE GRADE
FIRST €sC111 3 INTRODUCTION TO COMPUTER SCIENCES B
FIRST csc 113 2 VISUAL BASIC PROGRAMMING A
FIRST GST 111 2 COMMUNICATION IN ENGLISH B
FIRST GST 112 2 NIGERIAN PEOPLES & CULTURE B
FIRST DS 111 1 RUDIMENTS OF CHRISTIAN LIFE B
FIRST MTH111 2 ALGEBRA AND TRIGONOMETRY c`;
  const r = L.parsePortalText(results);
  assert.equal(r.semester, 1);
  assert.deepEqual(r.courses.map((c) => `${c.code}:${c.units}:${c.grade}`), ['CSC 111:3:B', 'CSC 113:2:A', 'GST 111:2:B', 'GST 112:2:B', 'IDS 111:1:B', 'MTH 111:2:C']);
  assert.equal(r.courses[0].title, 'Introduction to Computer Sciences');
  const reg = `SEMESTER cope LoAD TITLE APPROVAL STATUS Action
FIRST csc112 3 INTRODUCTION TO COMPUTER APPLICATIONS APPROVED
FIRST GsT212 2 LOGIC, PHILOSOPHY AND HUMAN EXISTENCE APPROVED
FIRST PHY 111 2 GENERAL PHYSICS T APPROVED
FIRST PHY 113 1 ‘GENERAL PHYSICS PRACTICAL I APPROVED`;
  const g = L.parsePortalText(reg);
  assert.deepEqual(g.courses.map((c) => `${c.code}:${c.units}:${c.grade}`), ['CSC 112:3:null', 'GST 212:2:null', 'PHY 111:2:null', 'PHY 113:1:null']);
  assert.equal(g.courses[2].title, 'General Physics I');
  const sec = L.parsePortalText('SECOND csc 123 3 BUSINESS APPLICATIONS APPROVED\nSECOND DS 121 1 LIFE AND TIMES OF ARCHBISHOP BENSON IDAHOSA APPROVED');
  assert.equal(sec.semester, 2); assert.equal(sec.courses[1].code, 'IDS 121');
  assert.ok(sec.courses[0].notes.some((n) => n.includes('handbook lists 2')), 'flags unit mismatch with handbook');
  assert.deepEqual(L.parsePortalText('random words\n\nnothing here').courses, []);
});

t('study plan + calendar still correct', () => {
  const cur = L.inProgress(eden).map((c) => ({ ...c, difficulty: L.autoDifficulty(c.code, eden).level }));
  const p = L.buildStudyPlan(cur, { days: [1, 2, 3, 4, 5], start: '19:00', length: 60, perDay: 2, breakMin: 10 });
  assert.equal(p.slots.length, 10); assert.ok(p.slots.every((s) => s.courseId));
  assert.ok(p.perCourse.p >= p.perCourse.n, 'MTH 211 gets at least as much as ENT 211');
  const ics = L.buildICS(L.slotsToEvents(p.slots, cur), { fromISO: '2026-11-23', untilISO: '2027-03-01', alarmMinutes: 10 }, new Date('2026-11-23T00:00:00Z'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 10);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(L.buildStudyPlan(cur, { days: [1], start: '23:30', length: 60, perDay: 1 }).slots.length, 0);
});

console.log(`\n${passed} tests passed`);
