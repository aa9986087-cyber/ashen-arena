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
    const old = this.el.get(this.cur);
    if (old) old.volume = Math.min(old.volume, 0.2); // never two songs at full voice
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
    let key = musicFor(G.state, MUS.boss);
    // cards and pause: keep the theme that was already playing, so no two songs trade places mid-choice
    if ((G.state === 'cards' || G.state === 'paused') && (this.cur === 'run' || this.cur === 'boss')) key = this.cur;
    // a win/lose sting plays alone over the results: the bed waits, then the menu fades in
    const stinging = this.stings.size > 0;
    if (stinging && G.state === 'over') key = this.cur;
    if (key !== this.cur) this.set(key);
    const paused = G.state === 'paused',
      duck = (paused ? 0.35 : 1) * (G.state === 'cards' ? 0.45 : 1) * (stinging ? 0.15 : 1),
      mus = S.set.mus;
    for (const [k, a] of this.el) {
      let target = 0;
      if (k === this.cur)
        target =
          (k === 'menu' ? MUSIC_VOL.menu : k === 'boss' ? MUSIC_VOL.boss : MUSIC_VOL.run + MUSIC_VOL.runPeak * MUS.i) *
          mus *
          duck;
      a.volume = clamp(a.volume + (target - a.volume) * 0.12, 0, 1); // a quick, clean crossfade
      if (k === this.cur && target > 0.01 && a.paused) this.kick(); // the slider went back up: resume
      if (a.volume <= 0.004 && !a.paused && (k !== this.cur || mus <= 0)) a.pause();
    }
    for (const s of this.stings) {
      s.volume = clamp(s.volume + (mus * MUSIC_VOL.sting - s.volume) * 0.2, 0, 1);
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
    setTimeout(() => this.stings.delete(a), 15000); // a blocked or stuck clip never silences the menu
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
