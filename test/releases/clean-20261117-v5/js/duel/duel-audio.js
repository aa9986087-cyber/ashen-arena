'use strict';
/* Sword duel — sound: recorded clashes, hits and the announcer (Kenney Impact Sounds + Voiceover Fighter, CC0,
   assets/audio/duel/*.mp3) and synthesized voices (effort grunts, pain), sword whooshes and the crowd. */
const DSND = { buf: {}, loading: null };
const DSND_FILES = [
  'v_round',
  'v_1',
  'v_2',
  'v_3',
  'v_4',
  'v_5',
  'v_final_round',
  'v_go',
  'v_you_win',
  'v_you_lose',
  'v_its_a_tie',
  'v_time_over',
  'clash0',
  'clash1',
  'clash2',
  'hit0',
  'hit1',
  'hit2',
  'block0',
  'block1',
  'block2',
  'break0',
];
/** Recorded combat sounds (assets/audio/duel/real/<name><n>.mp3): Oculus Audio Pack 01 by Oculus VR, LLC (CC BY 4.0),
    Kenney RPG Audio (CC0) and PanderMusubi's medieval weapons library (CC0). name → number of takes. */
const DREAL = {
  whs: 3,
  swish: 6,
  hurt: 6,
  gear: 2,
  effort: 2,
  slice: 2,
  squish: 6,
  punch: 6,
  death: 6,
  chop: 1,
  clash: 10,
  skull: 2,
  whm: 3,
  parry: 2,
  kick: 5,
  scrape: 2,
  bone: 2,
  scream: 3,
  punchH: 4,
  dscream: 2,
  punchX: 1,
};
const DREAL_BUF = {};
function duelRealLoad() {
  if (DREAL_BUF.loading || !AU.ctx) return;
  DREAL_BUF.loading = true;
  for (const [name, n] of Object.entries(DREAL))
    for (let i = 0; i < n; i++)
      fetch('assets/audio/duel/real/' + name + i + '.mp3')
        .then(r => r.arrayBuffer())
        .then(ab => new Promise((ok, no) => AU.ctx.decodeAudioData(ab, ok, no)))
        .then(b => (DREAL_BUF[name] = DREAL_BUF[name] || []).push(b))
        .catch(() => {});
}
/** Play a random take of a recorded sound: volume, pitch, delay (s), arena reverb. False while it isn't loaded. */
function rPlay(name, v = 1, rate = 1, when = 0, wet = 0.22) {
  const c = AU.ctx,
    list = DREAL_BUF[name];
  if (!c || !list || !list.length) return false;
  const s = c.createBufferSource(),
    g = c.createGain();
  s.buffer = list[(Math.random() * list.length) | 0];
  s.playbackRate.value = rate * rand(0.97, 1.03);
  g.gain.value = v;
  s.connect(g);
  g.connect(AU.sg);
  if (typeof DSFX !== 'undefined' && DSFX.rev && wet > 0) {
    const w = c.createGain();
    w.gain.value = wet;
    g.connect(w);
    w.connect(DSFX.rev);
  }
  s.start(c.currentTime + when);
  return true;
}
/** Heavier weapons swing with a lower whoosh. */
const dWpRate = who => (who && who.wp ? { axe: 0.82, mace: 0.78, spear: 1.08 }[who.wpId] || 1 : 1);
/** A fighter's voice pitch: each fighter sounds like himself (you a little higher, your foe deeper). */
const dVox = who => clamp((who && who.pitch ? who.pitch : 110) / 110, 0.82, 1.12);
function duelSoundsLoad() {
  duelRealLoad();
  if (AU.ctx) sfxBuild(); // the designed combat sounds (duel-sfx.js)
  if (DSND.loading || !AU.ctx) return DSND.loading;
  DSND.loading = Promise.all(
    DSND_FILES.map(async n => {
      try {
        const ab = await (await fetch('assets/audio/duel/' + n + '.mp3')).arrayBuffer();
        DSND.buf[n] = await new Promise((ok, no) => AU.ctx.decodeAudioData(ab, ok, no));
      } catch (e) {}
    })
  );
  return DSND.loading;
}
/** Play a recorded sound (volume, pitch, delay in seconds). */
function dPlay(n, v = 1, rate = 1, when = 0) {
  const b = DSND.buf[n],
    c = AU.ctx;
  if (!b || !c) return;
  const s = c.createBufferSource(),
    g = c.createGain();
  s.buffer = b;
  s.playbackRate.value = rate;
  g.gain.value = v;
  s.connect(g);
  g.connect(AU.sg);
  s.start(c.currentTime + when);
}
const dOne = (base, n) => base + ((Math.random() * n) | 0);
/** A synthesized voice: a sawtooth "throat" through vowel formants, with breath and a falling pitch. */
function dVoice(f0, dur, v, vowel, drop) {
  const c = AU.ctx;
  if (!c) return;
  const t = c.currentTime,
    o = c.createOscillator(),
    lfo = c.createOscillator(),
    lg = c.createGain(),
    out = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * 1.08, t);
  o.frequency.exponentialRampToValueAtTime(f0 * (drop || 0.7), t + dur);
  lfo.frequency.value = rand(16, 28); // a rough, strained throat
  lg.gain.value = f0 * 0.05;
  lfo.connect(lg);
  lg.connect(o.frequency);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(v, t + 0.03);
  out.gain.setValueAtTime(v, t + dur * 0.4);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const F = vowel || [750, 1150];
  for (const [fq, q, gn] of [
    [F[0], 5, 1],
    [F[1], 7, 0.55],
    [2700, 9, 0.2],
  ]) {
    const bp = c.createBiquadFilter(),
      g = c.createGain();
    bp.type = 'bandpass';
    bp.frequency.value = fq;
    bp.Q.value = q;
    g.gain.value = gn * 2.2;
    o.connect(bp);
    bp.connect(g);
    g.connect(out);
  }
  const n = c.createBufferSource(),
    nf = c.createBiquadFilter(),
    ng = c.createGain();
  n.buffer = AU.nb;
  nf.type = 'bandpass';
  nf.frequency.value = 1600;
  nf.Q.value = 0.7;
  ng.gain.value = 0.5;
  n.connect(nf);
  nf.connect(ng);
  ng.connect(out);
  out.connect(AU.sg);
  for (const s of [o, lfo]) {
    s.start(t);
    s.stop(t + dur + 0.05);
  }
  n.start(t, Math.random() * 0.5);
  n.stop(t + dur + 0.05);
}
/** Air cut by a blade: noise through a band that sweeps up. */
function dWhoosh(dur, v, when = 0) {
  const c = AU.ctx;
  if (!c) return;
  const t = c.currentTime + when,
    s = c.createBufferSource(),
    f = c.createBiquadFilter(),
    g = c.createGain();
  s.buffer = AU.nb;
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(350, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.7);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(AU.sg);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}
/** The crowd in the stands: several noise bands swelling and falling. */
function dCrowd(dur, v) {
  const c = AU.ctx;
  if (!c) return;
  const t = c.currentTime;
  for (const fq of [500, 900, 1400]) {
    const s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain(),
      am = c.createOscillator(),
      ag = c.createGain();
    s.buffer = AU.nb;
    s.loop = true;
    f.type = 'bandpass';
    f.frequency.value = fq;
    f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.35);
    g.gain.setValueAtTime(v, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    am.frequency.value = rand(3, 7); // the many voices rise and fall
    ag.gain.value = v * 0.4;
    am.connect(ag);
    ag.connect(g.gain);
    s.connect(f);
    f.connect(g);
    g.connect(AU.sg);
    s.start(t, Math.random());
    am.start(t);
    s.stop(t + dur + 0.1);
    am.stop(t + dur + 0.1);
  }
}
/** Duel sound cues; `who` is the fighter (each has its own voice pitch). */
const DS = {
  light(who) {
    rPlay('swish', 0.55, rand(0.95, 1.12) * dWpRate(who), 0.1, 0.1) ||
      sfxPlay('whoosh', 0.6, sfxRnd(0.95, 1.1), 0.12, 0.12) ||
      dWhoosh(0.24, 0.55, 0.12);
    if (Math.random() < 0.4)
      rPlay('effort', 0.5, dVox(who) * rand(0.97, 1.08)) || dVoice(who.pitch, 0.17, 0.5, [700, 1200], 0.75);
  },
  heavy(who) {
    rPlay('effort', 0.8, dVox(who) * 0.92) || dVoice(who.pitch * 0.92, 0.5, 0.6, [820, 1250], 0.62); // the war cry
    const hf = who.M ? who.M.heavy.hitFrom : DM.heavy.hitFrom;
    rPlay('whm', 0.85, rand(0.8, 0.95) * dWpRate(who), hf - 0.18, 0.15) ||
      sfxPlay('whooshH', 0.8, 1, hf - 0.28, 0.15) ||
      dWhoosh(0.4, 0.8, hf - 0.25);
  },
  dodge() {
    rPlay('swish', 0.35, 0.8, 0, 0.08) || sfxPlay('whoosh', 0.4, 0.7, 0, 0.1) || dWhoosh(0.3, 0.35);
    rPlay('gear', 0.45, rand(0.95, 1.1));
  },
  /** A blade in flesh: the cut, the wet, the body, the bone for heavy blows, and the man's pain. */
  hurt(who, heavy, by) {
    const w = by && by.wp ? by.wp.snd : 'blade';
    let real;
    if (w === 'mace')
      // blunt: a crushing thud and breaking bone, no cut
      real =
        rPlay(heavy ? 'punchX' : 'punchH', 1, rand(0.8, 0.95), 0, 0.28) &&
        (rPlay('bone', heavy ? 1 : 0.7, rand(0.9, 1.1)), heavy && rPlay('skull', 0.6, 1.1), true);
    else if (w === 'axe')
      real = rPlay('chop', 1, rand(0.7, 0.85), 0, 0.3) && (rPlay('punchH', 0.8), heavy && rPlay('bone', 0.85), true);
    else
      real = heavy
        ? rPlay('chop', 1, rand(0.75, 0.95), 0, 0.28) && (rPlay('bone', 0.75), rPlay('punchH', 0.8), true)
        : rPlay('slice', 0.9, rand(0.95, 1.1) * (w === 'spear' ? 1.1 : 1), 0, 0.2) && (rPlay('punch', 0.55), true);
    if (real) rPlay('squish', heavy ? 0.75 : 0.5, rand(1, 1.25));
    else
      sfxPlay(heavy ? 'chop' : 'slice', heavy ? 1 : 0.9, 1, 0, heavy ? 0.3 : 0.22) ||
        dPlay(dOne('hit', 3), heavy ? 1 : 0.8, rand(0.9, 1.1));
    rPlay('hurt', heavy ? 0.9 : 0.7, dVox(who), 0.03, 0.15) ||
      dVoice(who.pitch * 1.3, heavy ? 0.4 : 0.24, 0.55, [600, 1000], 0.8);
  },
  /** A boot in the chest: a real kick, and the wind knocked out of him. */
  kick(who) {
    rPlay('kick', 1, rand(0.9, 1.05), 0, 0.2) || sfxPlay('kick', 1, 1, 0, 0.2) || dPlay(dOne('hit', 3), 0.7, 0.8);
    rPlay('effort', 0.6, dVox(who) * 1.08, 0.04) || dVoice(who.pitch * 1.2, 0.22, 0.5, [650, 1050], 0.7);
  },
  block() {
    rPlay('clash', 0.85, rand(0.95, 1.08), 0, 0.3) ||
      sfxPlay('clash', 0.85, 1, 0, 0.3) ||
      dPlay(dOne('block', 3), 0.9, rand(0.95, 1.1));
  },
  parry() {
    if (rPlay('parry', 1, rand(1, 1.1), 0, 0.45)) return void rPlay('clash', 0.5, 1.25, 0.04, 0.3);
    if (sfxPlay('parry', 1, 1, 0, 0.4)) return;
    dPlay(dOne('clash', 3), 1, 1.15);
    dPlay('clash1', 0.5, 1.7, 0.06);
  },
  breakGuard() {
    if (rPlay('clash', 1, 0.82, 0, 0.35)) {
      rPlay('scrape', 0.65, 1, 0.03, 0.3);
      rPlay('punchX', 0.7);
      return;
    }
    if (sfxPlay('break', 1, 1, 0, 0.35)) return;
    dPlay('break0', 1);
    dPlay(dOne('clash', 3), 0.7, 0.8);
  },
  death(who) {
    rPlay('death', 0.95, dVox(who), 0, 0.25) || dVoice(who.pitch * 1.15, 0.95, 0.6, [620, 980], 0.45);
    sfxPlay('fall', 0.85, 1, 0.6, 0.3); // the body hits the stones
    rPlay('gear', 0.55, 0.9, 0.6);
  },
  /** A war drum for the walk-out: one deep hit, or a double for the face-off. */
  drum(big) {
    const c = AU.ctx;
    if (!c) return;
    const t = c.currentTime;
    for (const at of big ? [0, 0.16] : [0]) {
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(big ? 95 : 80, t + at);
      o.frequency.exponentialRampToValueAtTime(38, t + at + 0.5);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(big ? 1 : 0.8, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.9);
      o.connect(g);
      g.connect(AU.sg);
      if (typeof DSFX !== 'undefined' && DSFX.rev) {
        const w = c.createGain();
        w.gain.value = 0.5;
        g.connect(w);
        w.connect(DSFX.rev);
      }
      o.start(t + at);
      o.stop(t + at + 1);
    }
    rPlay('punchX', big ? 0.7 : 0.45, 0.6, 0, 0.4); // the skin of the drum
  },
  /** A limb cut off a living man. */
  scream(who) {
    rPlay('scream', 1, dVox(who), 0.05, 0.3);
  },
  /** A finisher's wound: a skull split (the beheading, no voice left), or bone and a dying scream. */
  finWound(kind, who) {
    rPlay('chop', 1, 0.7, 0, 0.35);
    rPlay('squish', 0.9, 0.9, 0.03);
    if (kind === 0) rPlay('skull', 1, 0.95, 0, 0.3);
    else {
      rPlay('bone', 0.9, 0.9);
      rPlay('dscream', 1, dVox(who), 0.08, 0.35) || DS.death(who);
    }
  },
  /** The killing blow: a deep boom under a slowed impact, a few heartbeats, then the crowd erupts. */
  finisher() {
    const c = AU.ctx;
    if (!c) return;
    const t = c.currentTime;
    const tone = (f0, f1, at, dur, v) => {
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(v, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g);
      g.connect(AU.sg);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    tone(120, 30, 0, 1.7, 0.9);
    rPlay('punchX', 1, 0.55, 0, 0.5) || sfxPlay('chop', 1, 0.55, 0, 0.5) || dPlay(dOne('hit', 3), 1, 0.5);
    for (const k of [0.6, 0.82, 1.5, 1.72, 2.4, 2.62]) tone(62, 40, k, 0.2, k % 1 < 0.7 ? 0.7 : 0.45);
    setTimeout(() => DS.crowd(0.36), 2300);
  },
  crowd(v = 0.18) {
    dCrowd(2.6, v);
  },
  round(n, final) {
    if (final) dPlay('v_final_round', 1);
    else {
      dPlay('v_round', 1);
      dPlay('v_' + Math.min(5, n), 1, 1, 0.55);
    }
  },
};
