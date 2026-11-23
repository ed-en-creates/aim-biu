// "Ask Spark": a guided chat. No AI service. Every answer is computed from the
// handbook rules (biu.js) and the student's own results (logic.js).
import * as L from './logic.js';
import { BIU } from './biu.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f2 = (n) => (n == null || Number.isNaN(n) ? '—' : L.round2(n).toFixed(2));

export const QUESTIONS = [
  { id: 'stand', label: 'Where do I stand?', keys: ['stand', 'cgpa', 'gpa', 'class', 'result', 'how am i', 'my grade', 'current'] },
  { id: 'need', label: 'What do I need this semester?', keys: ['need', 'this semester', 'target', 'get to', 'reach', 'first class', 'aim'] },
  { id: 'focus', label: 'Which course should I focus on?', keys: ['focus', 'which course', 'hardest', 'priority', 'concentrate'] },
  { id: 'whatif', label: 'What if I get…?', keys: ['what if', 'if i get', 'if i fail', 'suppose', 'c in', 'b in', 'd in'] },
  { id: 'how', label: 'How is my degree class worked out?', keys: ['how is', 'calculated', 'weight', 'degree class', 'work out', 'percent', '5%', '40%'] },
  { id: 'best', label: "What's the best I can finish with?", keys: ['best', 'highest', 'maximum', 'possible', 'still make'] },
  { id: 'fail', label: 'What happens if I fail a course?', keys: ['fail', 'carryover', 'carry over', 'resit', 'retake', 'probation', 'withdraw', 'f '] },
  { id: 'study', label: 'How much should I study?', keys: ['study', 'hours', 'read', 'timetable', 'schedule', 'plan'] },
  { id: 'scale', label: "What's BIU's grading scale?", keys: ['scale', 'grading', 'score', 'percent', 'mark', 'points', '70'] },
];

/** Keyword router for typed questions ("manually trained"). */
export function route(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  let best = null, score = 0;
  for (const q of QUESTIONS) {
    const s = q.keys.reduce((n, k) => n + (t.includes(k) ? k.length : 0), 0);
    if (s > score) { score = s; best = q.id; }
  }
  return best;
}

function ctx(state) {
  const p = state.profile;
  const cg = L.cgpa(state.semesters, p.policy);
  const plan = L.weightedPlan(state.semesters, { entry: p.entry, target: p.target, policy: p.policy, mode: p.calc });
  const cur = L.inProgress(state.semesters).map((c) => ({ ...c, difficulty: c.diffManual ? c.difficulty : L.autoDifficulty(c.code, state.semesters).level }));
  return { p, cg, plan, cur, cls: L.classify(cg.gpa) };
}

const targetName = (t) => (t ? `${L.classify(t)?.label || ''} (${Number(t).toFixed(2)})` : 'your target');

export function answer(id, state, extra = {}) {
  const { p, cg, plan, cur, cls } = ctx(state);
  const none = !cg.units && !cur.length;
  if (none && !['how', 'scale', 'fail'].includes(id)) {
    return { mood: 'happy', html: `<p>I don't have your results yet. Add them on the <a href="#results">Results</a> tab (a portal screenshot is fastest) and I'll answer that properly.</p>` };
  }
  switch (id) {
    case 'stand': {
      if (!cg.units) return { mood: 'focus', html: `<p>No final grades yet, just ${cur.length} course${cur.length === 1 ? '' : 's'} in progress. Once results are out, add them and I'll work out your CGPA.</p>` };
      const series = L.seriesStats(state.semesters, p.policy);
      const lv = [100, 200, 300, 400].filter((s) => series[s].units).map((s) => `<li>${s} level: <b>${f2(series[s].gpa)}</b> over ${series[s].units} units</li>`).join('');
      const up = L.nextClassUp(cg.gpa);
      return {
        mood: cg.gpa >= 3.5 ? 'proud' : cg.gpa >= 2.4 ? 'happy' : 'worried',
        html: `<p>Your CGPA is <b>${f2(cg.gpa)}</b>: <b>${esc(cls.label)}</b>, from ${cg.units} units.</p><ul>${lv}</ul>
          ${up ? `<p>The next class up is ${esc(up.label)} at ${up.min.toFixed(2)}.${p.calc !== 'simple' ? ' Remember: at BIU your final class is weighted by level, so your later years count for much more.' : ''}</p>` : '<p>You are in the top class. Protect it!</p>'}`,
      };
    }
    case 'need': {
      if (!p.target) return { mood: 'happy', html: `<p>Pick a target first. Tap your avatar → Settings, or tell me in the <a href="#plan">Plan</a> tab.</p>` };
      if (plan.status === 'impossible') return { mood: 'worried', html: `<p>Honest answer: ${esc(targetName(p.target))} is out of reach now. The best you can finish with is <b>${f2(plan.best)}</b> (${esc(L.classify(plan.best).label)}). Let's set that as the new target and chase it hard.</p>` };
      if (plan.status === 'secured') return { mood: 'proud', html: `<p>You've already locked in ${esc(targetName(p.target))}. Keep passing and it's yours.</p>` };
      if (!cur.length) return { mood: 'focus', html: `<p>To finish on ${esc(targetName(p.target))} you need to average <b>${f2(plan.required)}</b> on everything left. Add this semester's courses (grade: in progress) and I'll set a target for each one.</p>` };
      const s = L.suggestGrades(cur, plan.required, plan);
      const rows = cur.map((c) => `<li><b>${esc(c.code)}</b> → <span class="g g${s[c.id]}">${s[c.id]}</span>${L.unitWeight(c.code, plan) === 0 ? ' <span class="tiny muted">(doesn’t count toward your class, but you must pass)</span>' : ''}</li>`).join('');
      return {
        mood: plan.required > 4.4 ? 'focus' : 'happy',
        html: `<p>To finish on ${esc(targetName(p.target))}, average <b>${f2(plan.required)}</b> from here. For this semester that means:</p><ul>${rows}</ul>
          <p class="tiny muted">I put any B's where they cost you least: lower-level courses first, then the ones that are hardest for you.</p>`,
        action: { id: 'apply-suggest', label: 'Use these as my targets' },
      };
    }
    case 'focus': {
      if (!cur.length) return { mood: 'happy', html: `<p>You have no courses in progress. Add this semester's courses and I'll tell you where your hours matter most.</p>` };
      const ranked = cur.map((c) => {
        const w = plan.rows.length ? L.unitWeight(c.code, plan) : 1;
        return { c, score: w * c.units * c.difficulty, w, why: L.autoDifficulty(c.code, state.semesters).reason };
      }).sort((a, b) => b.score - a.score);
      const top = ranked.slice(0, 2);
      return {
        mood: 'focus',
        html: `<p>Put your best hours into:</p><ul>${top.map((r) => `<li><b>${esc(r.c.code)}</b>${r.c.title ? ` (${esc(r.c.title)})` : ''}: ${r.c.units} units, ${['', 'easier for you', 'medium for you', 'harder for you'][r.c.difficulty]}. ${esc(r.why)}.</li>`).join('')}</ul>
          <p class="tiny muted">I weigh units, how much the course's level counts toward your class, and your past grades in that subject.</p>`,
      };
    }
    case 'whatif': {
      const pool = cur.length ? cur : [];
      if (!pool.length) return { mood: 'happy', html: `<p>Add this semester's courses first, then ask me "what if".</p>` };
      if (!extra.course || !extra.grade) {
        return { mood: 'happy', html: `<p>Pick a course and a grade:</p>`, picker: { courses: pool.map((c) => ({ id: c.id, code: c.code })) } };
      }
      const c = pool.find((x) => x.id === extra.course);
      if (!c) return { mood: 'happy', html: '<p>I couldn’t find that course.</p>' };
      const sim = structuredClone(state.semesters);
      for (const s of sim) for (const x of s.courses) {
        if (!x.grade) x.target = x.id === c.id ? extra.grade : (x.target || 'A');
      }
      const before = L.projection(state.semesters.map((s) => ({ ...s, courses: s.courses.map((x) => (!x.grade ? { ...x, target: x.target || 'A' } : x)) })), p.policy);
      const after = L.projection(sim, p.policy);
      const simDone = sim.map((s) => ({ ...s, courses: s.courses.map((x) => (x.id === c.id ? { ...x, grade: extra.grade } : x)) }));
      const plan2 = L.weightedPlan(simDone, { entry: p.entry, target: p.target, policy: p.policy, mode: p.calc });
      const drop = after.cgpa < before.cgpa - 1e-9;
      const bad = ['D', 'E', 'F'].includes(extra.grade);
      return {
        mood: bad ? 'worried' : drop ? 'focus' : 'proud',
        html: `<p>If you get <span class="g g${extra.grade}">${extra.grade}</span> in <b>${esc(c.code)}</b> (others as targeted):</p>
          <ul><li>This semester's GPA: <b>${f2(after.semesterGpa)}</b> (vs ${f2(before.semesterGpa)})</li><li>CGPA: <b>${f2(after.cgpa)}</b> (vs ${f2(before.cgpa)})</li>
          ${p.target && plan2.required != null ? `<li>Average needed after that for ${esc(targetName(p.target))}: <b>${f2(plan2.required)}</b>${plan2.status === 'impossible' ? ' (out of reach)' : ''}</li>` : ''}</ul>
          ${extra.grade === 'F' ? '<p>An F means repeating the course. It doesn’t end your target, but it makes the rest of the road steeper.</p>' : bad ? '<p>Passable, but expensive. Worth extra hours to avoid.</p>' : ''}`,
      };
    }
    case 'how': {
      const W = BIU.weights[p.entry] || BIU.weights.utme;
      const tiles = [100, 200, 300, 400].map((s) => `<li>${s}-level courses: <b>${Math.round(W[s] * 100)}%</b></li>`).join('');
      return {
        mood: 'happy',
        html: `<p>The BIU handbook (§27) works out your final grade by <b>level</b>, not as one big average. ${p.entry === 'de' ? 'For direct entry (3-year):' : 'For the 4-year programme:'}</p><ul>${tiles}</ul>
          <p>Each level's GPA is weighted by course units, then the four are combined. First Class is 4.50+, 2:1 is 3.50+, 2:2 is 2.40+, Third is 1.50+.</p>
          <p>What it means: a unit at 400 level counts about <b>${W[100] ? Math.round(W[400] / W[100]) : '∞'}×</b> a unit at 100 level. A rough start can be fixed, and the final years decide your class.</p>
          ${p.mode === 'part' ? '<p class="tiny muted">You study part-time. Ask your course adviser to confirm the weighting applies to part-time students too. If it doesn’t, switch to “Simple CGPA” in Settings.</p>' : ''}`,
      };
    }
    case 'best': {
      return {
        mood: plan.best >= 4.5 ? 'proud' : 'focus',
        html: `<p>With straight A's from here, the best you can finish with is <b>${f2(plan.best)}</b>: <b>${esc(L.classify(plan.best).label)}</b>.</p>
          ${plan.best >= 4.5 ? '<p>First Class is still fully on the table.</p>' : '<p>First Class is out of reach, but the next class is yours to lock in.</p>'}`,
      };
    }
    case 'fail': {
      const share = L.promotionStatus(state.semesters.at(-1)?.courses || []);
      return {
        mood: 'focus',
        html: `<p>From the handbook (§16):</p><ul>
          <li>To move to the next level you must pass at least <b>50%</b> of your credit load for the session.</li>
          <li>Passing 25–49% means probation (or a faculty transfer).</li>
          <li>Passing under 25% means you'll be advised to withdraw.</li></ul>
          <p>A failed course has to be taken again. In Aim, every attempt counts in your CGPA by default. If your adviser says only the latest attempt counts, change it in Settings.</p>
          ${share ? `<p>In your latest semester you passed <b>${Math.round(share.share * 100)}%</b> of your units.</p>` : ''}`,
      };
    }
    case 'study': {
      const plan2 = L.buildStudyPlan(cur, state.plan);
      if (!cur.length) return { mood: 'happy', html: '<p>Add this semester’s courses and I’ll build you a weekly timetable.</p>' };
      const total = plan2.slots.length * state.plan.length;
      return {
        mood: 'happy',
        html: `<p>Your current plan gives you <b>${(total / 60).toFixed(1)} hours</b> a week across ${cur.length} courses${plan2.slots.length ? '' : ' (pick some study days first)'}.</p>
          <p>A good rule: about 1 hour of reading per unit per week, more for courses that are hard for you. For your ${cur.reduce((s, c) => s + c.units, 0)} units, aim for <b>${cur.reduce((s, c) => s + c.units * (c.difficulty === 3 ? 1.5 : c.difficulty === 1 ? 0.75 : 1), 0).toFixed(0)} hours</b> a week.</p>`,
        action: { id: 'go-plan', label: 'Open my timetable' },
      };
    }
    case 'scale':
      return {
        mood: 'happy',
        html: `<p>BIU grading (handbook §23):</p><ul>${BIU.grades.map((g, i) => `<li><span class="g g${g.g}">${g.g}</span> ${g.min}–${i ? BIU.grades[i - 1].min - 1 : 100}% → ${g.p} point${g.p === 1 ? '' : 's'}</li>`).join('')}</ul>
          <p>Results on the portal are letter grades only, so Aim works with letters. If you know your score, Aim converts it.</p>`,
      };
    default:
      return { mood: 'happy', html: `<p>I can't answer that one yet. Here's what I can help with:</p>` };
  }
}
