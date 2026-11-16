'use strict';
/* The recorded soundtrack: a menu theme, a run theme and a boss theme that crossfade as the game moves, plus
   one-shot win/lose stings over the results screen. Volume follows the music setting, the action and a pause. */
const CM = {
  el: new Map(), // key -> the looping Audio element of that theme
  cur: '',
  state: 'idle',
  on: false,
  stings: new Set(),
  /** The (lazily created) looping element of one theme. */
  track(key) {
    let a = this.el.get(key);
    if (!a) {
      a = new Audio(MUSIC[key]);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      a.addEventListener('playing', () => {
        if (this.cur === key) this.state = 'play';
      });
      a.addEventListener('error', () => {
        if (this.cur === key) this.state = 'missing';
      });
      this.el.set(key, a);
    }
    return a;
  },
  /** Make this theme the one playing; the old one fades out in tick(). */
  set(key) {
    if (!MUSIC[key]) key = 'menu';
    this.on = true;
    if (this.cur === key) return this.kick();
    this.cur = key;
    this.state = 'load';
    this.kick();
  },
  kick() {
    if (!this.cur) return;
    const a = this.track(this.cur);
    if (a.paused) {
      const p = a.play();
      if (p && p.catch)
        p.catch(() => {
          if (this.state !== 'play') this.state = 'wait';
        });
    }
  },
  /** Per frame: follow the game state and glide every volume toward its target. */
  tick() {
    if (!this.on) return;
    const key = musicFor(G.state, MUS.boss);
    if (key !== this.cur) this.set(key);
    const paused = G.state === 'paused',
      duck = paused ? 0.35 : 1,
      mus = S.set.mus;
    for (const [k, a] of this.el) {
      let target = 0;
      if (k === this.cur) target = (k === 'menu' ? 0.6 : k === 'boss' ? 0.95 : 0.55 + 0.35 * MUS.i) * mus * duck;
      a.volume = clamp(a.volume + (target - a.volume) * 0.06, 0, 1);
      if (a.volume <= 0.002 && !a.paused && (k !== this.cur || mus <= 0)) a.pause();
    }
    for (const s of this.stings) {
      s.volume = clamp(s.volume + (mus * 0.9 - s.volume) * 0.2, 0, 1);
      if (s.ended) this.stings.delete(s);
    }
  },
  /** Play a one-shot (win/lose) over whatever is playing. */
  sting(key) {
    if (!MUSIC[key] || S.set.mus <= 0) return;
    const a = new Audio(MUSIC[key]);
    a.volume = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    a.addEventListener('ended', () => this.stings.delete(a));
    this.stings.add(a);
  },
  /** Warm the cache of the themes a run will need, without playing them. */
  prefetch(keys) {
    for (const k of keys) {
      if (!MUSIC[k] || this.el.has(k)) continue;
      this.track(k).load();
    }
  },
};
const unlockMusic = () => {
  AU.init();
  CM.kick();
};
addEventListener('pointerdown', unlockMusic, true);
addEventListener('keydown', unlockMusic, true);
addEventListener('touchend', unlockMusic, true);
