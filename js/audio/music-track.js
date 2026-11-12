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
    // the recorded track is the menu song and the boss theme; ordinary fighting uses the synthesized score
    const st = G.state,
      inRun = st === 'play' || st === 'cards' || st === 'paused' || st === 'lab',
      target = !inRun ? S.set.mus * 0.6 : MUS.boss ? S.set.mus * (st === 'paused' ? 0.35 : 1) : 0;
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
