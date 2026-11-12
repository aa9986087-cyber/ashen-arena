'use strict';
/* WebAudio engine: synthesized SFX and the procedural fallback score. */
const MUS = { i: 0, boss: false, on: false, root: 55 };
const AU = {
  ctx: null,
  last: {},
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
      this.sg = this.ctx.createGain();
      this.mg = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      this.sg.connect(comp);
      this.mg.connect(comp);
      comp.connect(this.ctx.destination);
      const dl = this.ctx.createDelay(1),
        fb = this.ctx.createGain(),
        wet = this.ctx.createGain();
      dl.delayTime.value = 0.31;
      fb.gain.value = 0.38;
      wet.gain.value = 0.32;
      this.mg.connect(dl);
      dl.connect(fb);
      fb.connect(dl);
      dl.connect(wet);
      wet.connect(comp);
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate),
        d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.nb = b;
      this.next = this.ctx.currentTime + 0.1;
      this.step = 0;
      this.vol();
    } catch (e) {
      this.ctx = null;
    }
  },
  vol() {
    if (!this.ctx) return;
    this.sg.gain.value = S.set.sfx;
    this.mg.gain.value = S.set.mus * 0.55;
  },
  tone(f, d, type, v, f2, when, dest) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (when || 0),
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(v || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g);
    g.connect(dest || this.sg);
    o.start(t);
    o.stop(t + d + 0.03);
  },
  noise(d, v, fq, when, dest, type) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (when || 0),
      s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = this.nb;
    f.type = type || 'lowpass';
    f.frequency.value = fq || 1200;
    g.gain.setValueAtTime(v || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f);
    f.connect(g);
    g.connect(dest || this.sg);
    s.start(t, Math.random() * 0.5);
    s.stop(t + d + 0.03);
  },
  play(n) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - (this.last[n] || 0) < (GAP[n] || 50)) return;
    this.last[n] = now;
    SFX[n] && SFX[n](this);
  },
  str(f, d, v, when, dest, cut) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (when || 0),
      g = c.createGain(),
      lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cut || 1500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.07, d * 0.3));
    g.gain.setValueAtTime(v, t + d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    lp.connect(g);
    g.connect(dest || this.mg);
  },
  vio(f, d, v, when, dest) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (when || 0),
      g = c.createGain(),
      lp = c.createBiquadFilter(),
      a = Math.min(0.16, d * 0.3);
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + d * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    const l = c.createOscillator(),
      lg = c.createGain();
    l.frequency.value = 5.6;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(11, t + Math.min(0.35, d * 0.6));
    l.connect(lg);
    const os = [l];
    for (const det of [-4, 5]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.detune.value = det;
      lg.connect(o.detune);
      o.connect(lp);
      os.push(o);
    }
    lp.connect(g);
    g.connect(dest || this.mg);
    for (const x of os) {
      x.start(t);
      x.stop(t + d + 0.05);
    }
  },
  soft(f, d, v, when, dest) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (when || 0),
      g = c.createGain(),
      a = Math.min(0.12, d * 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + d * 0.65);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    const o = c.createOscillator(),
      o2 = c.createOscillator(),
      g2 = c.createGain(),
      l = c.createOscillator(),
      lg = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 2, t);
    g2.gain.value = 0.22;
    l.frequency.value = 5;
    lg.gain.value = 5;
    l.connect(lg);
    lg.connect(o.detune);
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(dest || this.mg);
    for (const x of [o, o2, l]) {
      x.start(t);
      x.stop(t + d + 0.05);
    }
  },
  music() {
    const c = this.ctx;
    if (!c) return;
    if (CM.on && CM.state !== 'missing') {
      CM.tick();
      // the synthesized score plays only while fighting without a boss (the track covers menu and bosses)
      if (!((G.state === 'play' || G.state === 'cards') && !MUS.boss)) {
        this.next = c.currentTime + 0.1;
        return;
      }
    }
    if (S.set.mus <= 0 || c.state !== 'running') {
      this.next = c.currentTime + 0.1;
      return;
    }
    const it = MUS.i,
      on = MUS.on,
      boss = MUS.boss,
      sd = 60 / (on ? 58 + it * 24 + (boss ? 10 : 0) : 50) / 6;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.16) {
      const s = this.step % 96,
        q = s % 12,
        ch = M_CH[((s / 12) | 0) % 4],
        w = this.next - c.currentTime,
        g = this.mg,
        root = MUS.root,
        N = n => root * Math.pow(2, n / 12);
      if (q === 0) this.str(N(ch[0]), sd * 11.5, on ? 0.17 : 0.11, w, g, 480);
      if (q === 0 && (it > 0.35 || boss)) for (const n of ch) this.str(N(n) * 4, sd * 11.8, 0.028, w, g, 1700);
      if (on && (it > 0.15 || boss) && q % 2 === 0)
        this.soft(N(ch[M_OST[q >> 1]]) * 2, sd * 2.2, 0.1 + it * 0.04, w, g);
      for (const m of M_MEL)
        if (m[0] === s) {
          this.vio(N(m[1]) * 8, sd * m[2] * 1.05, on ? 0.075 + it * 0.02 : 0.085, w, g);
          if (boss || it > 0.7) this.soft(N(m[1]) * 4, sd * m[2] * 0.97, 0.06, w, g);
        }
      if (on) {
        const pat = M_DR[boss || it > 0.6 ? 2 : it > 0.25 ? 1 : 0];
        if (pat.includes(q)) this.tone(70, 0.3, 'sine', q === 0 ? 0.26 : 0.15, 44, w, g);
        if (q === 3 && Math.random() < 0.6) this.tone(N(ch[2]) * 16, 0.7, 'sine', 0.02, null, w, g);
        if (q === 9 && Math.random() < 0.4) this.tone(N(ch[1]) * 16, 0.7, 'sine', 0.016, null, w, g);
        if (boss && q === 0) this.soft(N(ch[0]) * 2, sd * 10, 0.09, w, g);
        // boss theme: war drums on the off-beats and a low brass stab every bar
        if (boss && (q === 4 || q === 8 || q === 10)) this.tone(52, 0.35, 'sine', 0.2, 32, w, g);
        if (boss && q === 0 && s % 24 === 0) this.str(N(ch[0]) / 2, sd * 6, 0.12, w, g, 380);
      }
      this.next += sd;
      this.step++;
    }
  },
};
const M_CH = [
    [0, 3, 7],
    [-2, 2, 5],
    [-4, 0, 3],
    [-5, -2, 2],
  ],
  M_OST = [0, 1, 2, 1, 2, 1],
  M_DR = [[0], [0, 6], [0, 6, 10]],
  M_MEL = [
    [0, 0, 6],
    [6, 3, 4],
    [10, 2, 2],
    [12, 2, 6],
    [18, 5, 6],
    [24, 3, 6],
    [30, 2, 2],
    [32, 0, 4],
    [36, -2, 8],
    [44, -5, 4],
    [48, 7, 6],
    [54, 8, 2],
    [56, 7, 4],
    [60, 5, 6],
    [66, 2, 6],
    [72, 3, 4],
    [76, 5, 2],
    [78, 7, 6],
    [84, 2, 8],
    [92, 0, 4],
  ];
const GAP = {
  select: 70,
  hit: 55,
  kill: 60,
  gem: 45,
  rifle: 70,
  pistol: 60,
  eshot: 120,
  clang: 120,
  boom: 90,
  hurt: 150,
  bolt: 120,
  flame: 110,
  whip: 120,
};
const SK = [293.66, 349.23, 392, 440, 523.25, 587.33, 698.46, 880, 1046.5, 1174.7];
const SFX = {
  sword: a => {
    a.noise(0.16, 0.15, 1200, 0, null, 'bandpass');
    a.tone(196, 0.14, 'triangle', 0.05, 130);
  },
  axe: a => {
    a.noise(0.22, 0.16, 500);
    a.tone(110, 0.22, 'sine', 0.1, 65);
  },
  bow: a => {
    a.tone(587, 0.09, 'triangle', 0.1, 440);
    a.noise(0.05, 0.05, 1800, 0, null, 'bandpass');
  },
  pistol: a => {
    a.noise(0.07, 0.17, 900);
    a.tone(180, 0.09, 'sine', 0.1, 70);
  },
  rifle: a => {
    a.noise(0.035, 0.1, 1100);
    a.tone(150, 0.045, 'sine', 0.06, 80);
  },
  rocket: a => {
    a.noise(0.4, 0.2, 400);
    a.tone(90, 0.35, 'sine', 0.13, 45);
  },
  whip: a => {
    a.noise(0.14, 0.15, 3000, 0, null, 'highpass');
    a.tone(880, 0.12, 'triangle', 0.05, 220);
  },
  flame: a => a.noise(0.18, 0.08, 700, 0, null, 'bandpass'),
  shuriken: a => {
    a.tone(1400, 0.06, 'triangle', 0.04, 900);
    a.noise(0.05, 0.05, 2500, 0, null, 'bandpass');
  },
  spear: a => {
    a.noise(0.12, 0.12, 1400, 0, null, 'bandpass');
    a.tone(330, 0.12, 'triangle', 0.06, 165);
  },
  hammer: a => {
    a.noise(0.35, 0.3, 300);
    a.tone(60, 0.4, 'sine', 0.3, 30);
  },
  staff: a => {
    a.soft(587.33, 0.3, 0.09, 0, a.sg);
    a.soft(880, 0.26, 0.04, 0.04, a.sg);
  },
  hit: a => a.tone(180, 0.05, 'sine', 0.06, 110),
  kill: a => {
    a.noise(0.1, 0.1, 700);
    a.tone(147, 0.1, 'sine', 0.07, 73);
  },
  boom: a => {
    a.noise(0.5, 0.38, 320);
    a.tone(70, 0.5, 'sine', 0.34, 30);
  },
  gem: a => a.tone(SK[5 + ((Math.random() * 4) | 0)], 0.1, 'sine', 0.05),
  coin: a => {
    a.tone(880, 0.09, 'sine', 0.06);
    a.tone(1174.7, 0.16, 'sine', 0.05, null, 0.07);
  },
  heart: a => {
    a.soft(349.23, 0.22, 0.1, 0, a.sg);
    a.soft(440, 0.32, 0.1, 0.1, a.sg);
  },
  hurt: a => {
    a.tone(147, 0.25, 'sine', 0.24, 73);
    a.noise(0.12, 0.14, 500);
  },
  dash: a => a.noise(0.22, 0.13, 900, 0, null, 'bandpass'),
  bolt: a => {
    a.noise(0.14, 0.15, 3000, 0, null, 'highpass');
    a.tone(880, 0.12, 'triangle', 0.05, 220);
  },
  nova: a => {
    a.tone(220, 0.35, 'sine', 0.18, 70);
    a.noise(0.25, 0.1, 900);
  },
  special: a => {
    a.str(73.4, 0.9, 0.26, 0, a.sg, 500);
    a.tone(110, 0.6, 'sine', 0.15, 330);
    a.noise(0.6, 0.2, 600);
  },
  clang: a => a.tone(1174.7, 0.09, 'triangle', 0.05, 880),
  eshot: a => a.tone(330, 0.1, 'sine', 0.05, 165),
  boss: a => {
    a.str(55, 1.3, 0.3, 0, a.sg, 420);
    a.str(82.4, 1.3, 0.12, 0, a.sg, 520);
    a.noise(0.8, 0.16, 300);
  },
  level: a => [293.66, 349.23, 440, 587.33].forEach((f, i) => a.soft(f, 0.4, 0.12, i * 0.09, a.sg)),
  legend: a => {
    [293.66, 440, 587.33, 698.46, 880, 1174.7].forEach((f, i) => {
      a.vio(f, 0.8, 0.06, i * 0.12, a.sg);
      a.tone(f * 2, 0.5, 'sine', 0.03, null, i * 0.12);
    });
  },
  select: a => {
    a.noise(0.05, 0.06, 3000, 0, null, 'bandpass');
    a.tone(660, 0.08, 'sine', 0.03);
  },
  nav: a => {
    a.str(73.42, 0.85, 0.11, 0, a.sg, 560);
    a.soft(293.66, 0.6, 0.05, 0.02, a.sg);
    a.soft(440, 0.6, 0.04, 0.07, a.sg);
    a.soft(587.33, 0.7, 0.035, 0.12, a.sg);
    a.tone(1174.7, 0.5, 'sine', 0.012, null, 0.12);
    a.noise(0.4, 0.035, 700, 0, null, 'bandpass');
  },
  unlock: a => {
    [146.83, 220, 293.66, 440, 587.33].forEach((f, i) => a.soft(f, 0.9, 0.06, i * 0.07, a.sg));
    a.str(73.42, 1.2, 0.13, 0, a.sg, 600);
    a.tone(1174.7, 0.8, 'sine', 0.02, null, 0.35);
  },
  deny: a => a.soft(146.83, 0.2, 0.1, 0, a.sg),
  shield: a => a.tone(698.46, 0.14, 'sine', 0.1, 523.25),
  over: a => [440, 392, 349.23, 293.66].forEach((f, i) => a.vio(f, 0.7, 0.08, i * 0.3, a.sg)),
  win: a => [293.66, 440, 587.33, 880].forEach((f, i) => a.soft(f, 0.45, 0.12, i * 0.12, a.sg)),
};
addEventListener(
  'click',
  e => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (b && !b.classList.contains('act')) {
      AU.init();
      AU.play('select');
    }
  },
  true
);
