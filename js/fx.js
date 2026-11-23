// Spark (Aim's mascot), sounds and confetti. No image or audio files: everything is drawn/synthesised here.

const EYES = {
  open: '<g class="eyes"><ellipse cx="45" cy="60" rx="9" ry="10.5" fill="#fff"/><ellipse cx="75" cy="60" rx="9" ry="10.5" fill="#fff"/><circle class="pupil" cx="47" cy="62" r="5.2" fill="#1d2230"/><circle class="pupil" cx="77" cy="62" r="5.2" fill="#1d2230"/><circle cx="49" cy="59.5" r="1.8" fill="#fff"/><circle cx="79" cy="59.5" r="1.8" fill="#fff"/></g>',
  happy: '<g class="eyes"><path d="M37 62q8-10 16 0M67 62q8-10 16 0" fill="none" stroke="#1d2230" stroke-width="4.5" stroke-linecap="round"/></g>',
};
const FACES = {
  happy: { eyes: 'open', brows: '', mouth: '<path d="M50 77q10 9 20 0" fill="none" stroke="#1d2230" stroke-width="4" stroke-linecap="round"/>' },
  proud: { eyes: 'happy', brows: '', mouth: '<path d="M46 74q14 18 28 0z" fill="#1d2230"/><path d="M52 81q8 5 16 0" fill="#ff7a59"/>' },
  worried: { eyes: 'open', brows: '<path d="M36 47l14 4M84 47l-14 4" stroke="#1d2230" stroke-width="3.5" stroke-linecap="round"/>', mouth: '<path d="M50 81q5-5 10 0t10 0" fill="none" stroke="#1d2230" stroke-width="3.5" stroke-linecap="round"/>' },
  focus: { eyes: 'open', brows: '<path d="M36 50l14-3M84 50l-14-3" stroke="#1d2230" stroke-width="3.5" stroke-linecap="round"/>', mouth: '<path d="M52 78h16" stroke="#1d2230" stroke-width="4" stroke-linecap="round"/>' },
};

/** Inline SVG of Spark. mood: happy | proud | worried | focus */
export function spark(mood = 'happy', size = 72, extraClass = '') {
  const f = FACES[mood] || FACES.happy;
  return `<svg class="spark ${extraClass} mood-${mood}" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="Spark looks ${mood}">
    <g class="spark-body">
      <path class="sprout" d="M60 26c0-8 3-14 9-18 1 8-2 14-9 18zm0 0c-1-7-5-11-12-12 0 7 4 11 12 12z" fill="#5cbf2a"/>
      <path d="M60 22v8" stroke="#3f9a17" stroke-width="3" stroke-linecap="round"/>
      <rect x="16" y="28" width="88" height="80" rx="38" fill="#ffc21a"/>
      <path d="M18 76c6 22 26 32 42 32s36-10 42-32c-8 14-24 22-42 22S26 90 18 76z" fill="#f0a500" opacity=".55"/>
      <ellipse cx="44" cy="40" rx="14" ry="6" fill="#fff" opacity=".35" transform="rotate(-18 44 40)"/>
      <circle cx="32" cy="76" r="6.5" fill="#ff8a65" opacity=".7"/><circle cx="88" cy="76" r="6.5" fill="#ff8a65" opacity=".7"/>
      ${EYES[f.eyes]}${f.brows}${f.mouth}
    </g></svg>`;
}

/* ---------------- Sound (Web Audio, synthesised) ---------------- */
let ctx = null;
let enabled = true;
export function setSound(on) { enabled = !!on; }
function ac() {
  if (!enabled) return null;
  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch { return null; }
}
function tone(c, freq, t0, dur, type = 'triangle', vol = 0.18) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
export const sound = {
  yay() { const c = ac(); if (!c) return; const t = c.currentTime; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.085, 0.28)); tone(c, 1318.5, t + 0.36, 0.4, 'sine', 0.08); },
  ding() { const c = ac(); if (!c) return; const t = c.currentTime; tone(c, 880, t, 0.18, 'sine', 0.14); tone(c, 1318.5, t + 0.07, 0.25, 'sine', 0.1); },
  soft() { const c = ac(); if (!c) return; const t = c.currentTime; tone(c, 392, t, 0.25, 'sine', 0.12); tone(c, 329.63, t + 0.16, 0.35, 'sine', 0.1); },
  tap() { const c = ac(); if (!c) return; tone(c, 1200, c.currentTime, 0.04, 'sine', 0.05); },
};
export function buzz(pattern = 12) { try { if (enabled) navigator.vibrate?.(pattern); } catch { /* not supported */ } }

/* ---------------- Confetti ---------------- */
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function confetti(n = 90) {
  if (reduced()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti'; cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const colors = ['#7ccf1f', '#ffc21a', '#ff7a59', '#4f8cff', '#b66dff'];
  const ps = Array.from({ length: n }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 12 - 5,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0],
  }));
  let frame = 0;
  (function step() {
    x.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
    }
    if (++frame < 150) requestAnimationFrame(step); else cv.remove();
  })();
}

/** Animate a number counting up inside el. */
export function countUp(el, to, decimals = 2, ms = 900) {
  if (!el || to == null || Number.isNaN(to)) return;
  if (reduced()) { el.textContent = to.toFixed(decimals); return; }
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  (function f(now) {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = (to * ease(k)).toFixed(decimals);
    if (k < 1) requestAnimationFrame(f);
  })(t0);
}
