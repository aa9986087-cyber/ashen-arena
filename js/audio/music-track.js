'use strict';
/* Streams the recorded soundtrack and fades its volume with the action. */
const CM = {
  el: null,
  on: false,
  state: '',
  set(src) {
    if (!this.el) {
      this.el = new Audio();
      this.el.loop = true;
      this.el.preload = 'auto';
      this.el.addEventListener('playing', () => {
        this.state = 'play';
      });
      this.el.addEventListener('error', () => {
        this.on = false;
        this.state = 'missing';
      });
    } else {
      this.el.pause();
      try {
        if (this.el.src.startsWith('blob:')) URL.revokeObjectURL(this.el.src);
      } catch (e) {}
    }
    this.el.src = typeof src === 'string' ? src : URL.createObjectURL(src);
    this.on = true;
    this.state = 'load';
    this.el.volume = 0;
    this.kick();
  },
  kick() {
    if (this.on && this.el && this.el.paused) {
      const p = this.el.play();
      if (p && p.catch)
        p.catch(() => {
          this.state = this.state === 'play' ? 'play' : 'wait';
        });
    }
  },
  tick() {
    if (!this.el || !this.on) return;
    const st = G.state,
      live = st === 'play' || st === 'cards',
      k = MUS.boss ? 1 : Math.min(1, MUS.i * 2.5);
    const target = S.set.mus * (st === 'paused' ? 0.3 : live ? 0.55 + 0.45 * k : 0.6);
    this.el.volume = clamp(this.el.volume + (target - this.el.volume) * 0.05, 0, 1);
  },
};
const unlockMusic = () => {
  AU.init();
  CM.kick();
};
addEventListener('pointerdown', unlockMusic, true);
addEventListener('keydown', unlockMusic, true);
addEventListener('touchend', unlockMusic, true);
