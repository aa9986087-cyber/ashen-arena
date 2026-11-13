'use strict';
/* Sword duel — combat sounds designed in code, the way a sound designer layers them, rendered once into buffers
   (a few at a time, while the arena is being prepared) and then played instantly:
   - steel on steel: inharmonic partials (a struck bar rings at non-integer ratios), each fading at its own rate,
     paired with a slightly detuned twin so the ring beats, over a sharp strike transient;
   - a blade in flesh: a bright cut that sweeps down, a wet squelch, a body thud (and bone crunch for heavy blows);
   - air: noise through a band that rises and falls, with the blade's faint whistle;
   - the arena: everything is sent through a short stone-hall reverb. */
const DSFX = { buf: {}, ready: false, building: null, rev: null, sr: 32000 };
const sfxRnd = (a, b) => a + Math.random() * (b - a);
function sfxNoise(n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
  return a;
}
/** RBJ biquad over a whole buffer; `f` is Hz or a function of time (re-tuned every 32 samples, for sweeps). */
function sfxFilter(x, type, f, q) {
  const sr = DSFX.sr,
    y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0,
    b0,
    b1,
    b2,
    a1,
    a2;
  const coef = hz => {
    const w = (2 * Math.PI * Math.min(Math.max(hz, 20), sr * 0.45)) / sr,
      cs = Math.cos(w),
      al = Math.sin(w) / (2 * q),
      A0 = 1 + al;
    let B0, B1, B2;
    if (type === 'lp') ((B0 = (1 - cs) / 2), (B1 = 1 - cs), (B2 = (1 - cs) / 2));
    else if (type === 'hp') ((B0 = (1 + cs) / 2), (B1 = -(1 + cs)), (B2 = (1 + cs) / 2));
    else ((B0 = al), (B1 = 0), (B2 = -al));
    b0 = B0 / A0;
    b1 = B1 / A0;
    b2 = B2 / A0;
    a1 = (-2 * cs) / A0;
    a2 = (1 - al) / A0;
  };
  const sweep = typeof f === 'function';
  if (!sweep) coef(f);
  for (let i = 0; i < x.length; i++) {
    if (sweep && (i & 31) === 0) coef(f(i / sr));
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
/** Add `src` into `a` from time `at`, shaped by an attack (s) and an exponential decay (tau, s). */
function sfxMix(a, src, at, amp, attack, tau) {
  const sr = DSFX.sr,
    s0 = Math.round(at * sr),
    k = Math.exp(-1 / (tau * sr));
  let e = 1;
  for (let i = 0; i < src.length && s0 + i < a.length; i++) {
    const t = i / sr,
      atk = attack > 0 && t < attack ? t / attack : 1;
    a[s0 + i] += src[i] * amp * atk * e;
    e *= k;
  }
}
/** Struck steel: inharmonic partials, beating twins, a bright strike. */
function sfxSteel(a, at, f0, ring, bright, amp) {
  const sr = DSFX.sr,
    s0 = Math.round(at * sr),
    P = [
      [1, 1, 1],
      [2.31, 0.78, 0.86],
      [3.87, 0.62, 0.7],
      [5.13, 0.5, 0.56],
      [6.92, 0.4, 0.42],
      [9.2, 0.3, 0.3],
      [11.7, 0.22, 0.22],
      [14.1, 0.15, 0.16],
    ];
  for (const [r, am, dk] of P)
    for (const twin of [0, 1]) {
      const f = f0 * r * (1 + sfxRnd(-0.012, 0.012)) * (twin ? 1.0028 + Math.random() * 0.003 : 1);
      if (f > sr * 0.45) continue;
      const tau = ring * dk,
        A = am * amp * (twin ? 0.45 : 1),
        w = (2 * Math.PI * f) / sr,
        k = Math.exp(-1 / (tau * sr)),
        end = Math.min(a.length, s0 + Math.ceil(tau * 7 * sr));
      let ph = Math.random() * 6.283,
        e = A;
      for (let i = s0; i < end; i++) {
        const t = (i - s0) / sr;
        a[i] += Math.sin(ph) * e * (t < 0.0015 ? t / 0.0015 : 1);
        ph += w;
        e *= k;
      }
    }
  // the strike: a click of bright noise
  sfxMix(a, sfxFilter(sfxNoise(Math.round(0.03 * sr)), 'hp', 2600, 0.7), at, bright * amp, 0, 0.005);
}
/** A body thud: a sine sweeping down from `hi` to `lo` Hz. */
function sfxThud(a, at, lo, hi, tau, amp) {
  const sr = DSFX.sr,
    n = Math.ceil(tau * 7 * sr),
    s = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * (lo + (hi - lo) * Math.exp(-t / 0.03))) / sr;
    s[i] = Math.sin(ph);
  }
  sfxMix(a, s, at, amp, 0.002, tau);
}
/** Wet flesh: low noise pulsing like a squelch. */
function sfxWet(a, at, tau, amp, lp) {
  const sr = DSFX.sr,
    n = Math.ceil(tau * 6 * sr),
    s = sfxFilter(sfxNoise(n), 'lp', lp || 1100, 0.8),
    rate = sfxRnd(26, 42);
  let jit = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 63) === 0) jit = sfxRnd(-0.25, 0.25);
    s[i] *= 0.55 + 0.45 * Math.sin((2 * Math.PI * rate * i) / sr + jit * 6);
  }
  sfxMix(a, s, at, amp, 0.004, tau);
}
/** The cut itself: bright noise sweeping down. */
function sfxCut(a, at, hi, lo, tau, amp) {
  const sr = DSFX.sr,
    n = Math.ceil(tau * 6 * sr);
  sfxMix(
    a,
    sfxFilter(sfxNoise(n), 'bp', t => lo + (hi - lo) * Math.exp(-t / 0.06), 1.1),
    at,
    amp * 2.2,
    0.0015,
    tau
  );
}
/* ---- the sound list: name → [duration, how to build it], several takes each so repeats don't sound the same */
const DSFX_DEFS = {
  clash: [
    0.9,
    a => {
      sfxSteel(a, 0, sfxRnd(470, 650), 0.22, 1.3, 1);
      sfxThud(a, 0, 120, 190, 0.03, 0.45);
    },
    3,
  ],
  parry: [
    2.0,
    a => {
      const f = sfxRnd(800, 920);
      sfxSteel(a, 0, f, 0.55, 1.6, 1);
      sfxSteel(a, 0.045, f * 1.42, 0.3, 0.6, 0.5); // the blade sliding off: a second, higher ting
    },
    2,
  ],
  break: [
    1.3,
    a => {
      sfxSteel(a, 0, sfxRnd(300, 360), 0.3, 2, 1);
      sfxSteel(a, 0.02, sfxRnd(450, 520), 0.2, 1, 0.6);
      sfxThud(a, 0, 45, 110, 0.1, 1.1);
      // steel scraping steel
      const sr = DSFX.sr,
        n = Math.round(0.6 * sr),
        sc = sfxFilter(sfxNoise(n), 'bp', 3400, 6);
      let j = 1;
      for (let i = 0; i < n; i++) {
        if ((i & 127) === 0) j = sfxRnd(0.3, 1);
        sc[i] *= j;
      }
      sfxMix(a, sc, 0.03, 0.5, 0.01, 0.11);
    },
    2,
  ],
  slice: [
    0.55,
    a => {
      sfxCut(a, 0, sfxRnd(2200, 2800), 480, 0.045, 1);
      sfxWet(a, 0.008, 0.055, 0.5);
      sfxThud(a, 0, 55, 125, 0.07, 0.85);
      sfxSteel(a, 0, sfxRnd(1800, 2100), 0.03, 0.2, 0.1); // the edge biting
    },
    3,
  ],
  chop: [
    0.9,
    a => {
      sfxCut(a, 0, sfxRnd(1500, 1900), 330, 0.06, 0.8);
      sfxThud(a, 0, 36, 115, 0.14, 1.3);
      sfxWet(a, 0.012, 0.15, 0.7, 900);
      // bone giving way: a burst of crackles
      const sr = DSFX.sr,
        n = Math.round(0.14 * sr),
        cr = new Float32Array(n);
      for (let k = 0; k < 28; k++)
        cr[Math.round(sfxRnd(0.01, 0.12) * sr)] = sfxRnd(0.5, 1) * (Math.random() < 0.5 ? -1 : 1);
      sfxMix(a, sfxFilter(cr, 'bp', 2200, 0.9), 0, 6, 0, 0.09);
    },
    3,
  ],
  whoosh: [0.34, a => sfxAir(a, 0.32, 520, sfxRnd(2800, 3400), 0), 3],
  whooshH: [0.6, a => sfxAir(a, 0.56, 260, sfxRnd(1500, 1800), 0.45), 2],
  kick: [
    0.45,
    a => {
      sfxThud(a, 0, 50, 140, 0.06, 1.2);
      const sr = DSFX.sr;
      sfxMix(a, sfxFilter(sfxNoise(Math.round(0.06 * sr)), 'bp', 1100, 0.9), 0, 2.2, 0.001, 0.011);
      sfxMix(a, sfxFilter(sfxNoise(Math.round(0.25 * sr)), 'bp', 600, 0.8), 0.004, 0.5, 0.004, 0.05);
      sfxSteel(a, 0.006, sfxRnd(1250, 1400), 0.04, 0.3, 0.12); // buckles and plates rattle
      sfxSteel(a, 0.022, sfxRnd(1650, 1800), 0.035, 0.2, 0.08);
    },
    2,
  ],
  fall: [
    0.9,
    a => {
      sfxThud(a, 0, 34, 90, 0.16, 1);
      sfxThud(a, 0.11, 40, 100, 0.08, 0.5); // the second bounce
      const sr = DSFX.sr;
      sfxMix(a, sfxFilter(sfxNoise(Math.round(0.6 * sr)), 'bp', 700, 0.6), 0.01, 0.5, 0.01, 0.12); // dust and cloth
    },
    1,
  ],
};
/** A blade through air: a noise band rising and falling, a faint whistle on top, a low push for heavy swings. */
function sfxAir(a, dur, lo, hi, rumble) {
  // a real swing builds slowly, peaks late (the blade's fastest point) and cuts off fast: "...fwOOSH"
  const sr = DSFX.sr,
    n = Math.round(dur * sr),
    pk = 0.62,
    shape = x => (x < pk ? Math.pow(x / pk, 2.2) : Math.pow((1 - x) / (1 - pk), 2.6)),
    fc = t => lo + (hi - lo) * shape(Math.min(1, t / dur)),
    body = sfxFilter(sfxFilter(sfxNoise(n), 'bp', fc, 2.4), 'bp', fc, 1.6), // twice: a narrower, less hissy band
    whistle = sfxFilter(sfxNoise(n), 'bp', t => fc(t) * 1.6, 14),
    low = rumble ? sfxFilter(sfxNoise(n), 'bp', 160, 1.6) : null;
  for (let i = 0; i < n; i++) {
    const env = shape(i / n);
    a[i] += env * (body[i] * 4 + whistle[i] * 1.1 + (low ? low[i] * rumble * 3 : 0));
  }
}
/** A short stone-hall reverb: early reflections, then a darkening tail. */
function sfxReverb(c) {
  const sr = c.sampleRate,
    n = Math.round(1.4 * sr),
    b = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (const [ms, g] of [
      [19 + ch * 4, 0.5],
      [37 - ch * 3, 0.35],
      [61 + ch * 5, 0.25],
    ])
      d[Math.round((ms / 1000) * sr)] += g;
    let lp = 0;
    for (let i = Math.round(0.07 * sr); i < n; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * Math.max(0.08, 0.6 - t * 0.4); // darker as it fades
      d[i] += lp * 0.4 * Math.exp(-t / 0.32);
    }
  }
  const cv = c.createConvolver(),
    g = c.createGain();
  cv.buffer = b;
  g.gain.value = 0.9;
  cv.connect(g);
  g.connect(AU.sg);
  return cv;
}
/** Build every sound, a few per frame (called while the arena is prepared). */
function sfxBuild() {
  if (DSFX.building || !AU.ctx) return DSFX.building;
  DSFX.building = (async () => {
    const c = AU.ctx,
      sr = DSFX.sr;
    DSFX.rev = sfxReverb(c);
    for (const [name, [dur, make, takes]] of Object.entries(DSFX_DEFS)) {
      DSFX.buf[name] = [];
      for (let k = 0; k < takes; k++) {
        const a = new Float32Array(Math.round(dur * sr));
        make(a);
        let pk = 0;
        for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i]));
        const g = pk > 0 ? 0.95 / pk : 1,
          fade = Math.round(0.01 * sr);
        for (let i = 0; i < a.length; i++) a[i] *= g * (i > a.length - fade ? (a.length - i) / fade : 1);
        const b = c.createBuffer(1, a.length, sr);
        b.getChannelData(0).set(a);
        DSFX.buf[name].push(b);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    DSFX.ready = true;
  })();
  return DSFX.building;
}
/** Play a designed sound (a random take): volume, pitch, delay (s), how much arena reverb. False if not built yet. */
function sfxPlay(name, v = 1, rate = 1, when = 0, wet = 0.25) {
  const c = AU.ctx,
    list = DSFX.buf[name];
  if (!c || !list || !list.length) return false;
  const s = c.createBufferSource(),
    g = c.createGain();
  s.buffer = list[(Math.random() * list.length) | 0];
  s.playbackRate.value = rate * sfxRnd(0.97, 1.03);
  g.gain.value = v;
  s.connect(g);
  g.connect(AU.sg);
  if (DSFX.rev && wet > 0) {
    const w = c.createGain();
    w.gain.value = wet;
    g.connect(w);
    w.connect(DSFX.rev);
  }
  s.start(c.currentTime + when);
  return true;
}
