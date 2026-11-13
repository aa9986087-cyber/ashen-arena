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
function duelSoundsLoad() {
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
    sfxPlay('whoosh', 0.6, sfxRnd(0.95, 1.1), 0.12, 0.12) || dWhoosh(0.24, 0.55, 0.12);
    if (Math.random() < 0.75) dVoice(who.pitch * rand(0.95, 1.08), 0.17, 0.5, [700, 1200], 0.75);
  },
  heavy(who) {
    dVoice(who.pitch * 0.92, 0.5, 0.6, [820, 1250], 0.62); // the wind-up war cry
    sfxPlay('whooshH', 0.8, 1, DM.heavy.hitFrom - 0.28, 0.15) || dWhoosh(0.4, 0.8, DM.heavy.hitFrom - 0.25);
  },
  dodge() {
    sfxPlay('whoosh', 0.4, 0.7, 0, 0.1) || dWhoosh(0.3, 0.35);
  },
  hurt(who, heavy) {
    sfxPlay(heavy ? 'chop' : 'slice', heavy ? 1 : 0.9, 1, 0, heavy ? 0.3 : 0.22) ||
      dPlay(dOne('hit', 3), heavy ? 1 : 0.8, rand(0.9, 1.1));
    dVoice(who.pitch * 1.3, heavy ? 0.4 : 0.24, 0.55, [600, 1000], 0.8);
  },
  /** A boot in the chest: a thud, leather, rattling plates, and a winded grunt. */
  kick(who) {
    sfxPlay('kick', 1, 1, 0, 0.2) || dPlay(dOne('hit', 3), 0.7, 0.8);
    dVoice(who.pitch * 1.2, 0.22, 0.5, [650, 1050], 0.7);
  },
  block() {
    sfxPlay('clash', 0.85, 1, 0, 0.3) || dPlay(dOne('block', 3), 0.9, rand(0.95, 1.1));
  },
  parry() {
    if (sfxPlay('parry', 1, 1, 0, 0.4)) return;
    dPlay(dOne('clash', 3), 1, 1.15);
    dPlay('clash1', 0.5, 1.7, 0.06);
  },
  breakGuard() {
    if (sfxPlay('break', 1, 1, 0, 0.35)) return;
    dPlay('break0', 1);
    dPlay(dOne('clash', 3), 0.7, 0.8);
  },
  death(who) {
    dVoice(who.pitch * 1.15, 0.95, 0.6, [620, 980], 0.45);
    sfxPlay('fall', 0.85, 1, 0.6, 0.3); // the body hits the stones
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
    sfxPlay('chop', 1, 0.55, 0, 0.5) || dPlay(dOne('hit', 3), 1, 0.5);
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
