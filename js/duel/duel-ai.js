'use strict';
/* Sword duel — training opponent. Reads the player's moves with a human-like reaction delay. */
class DuelBot {
  constructor(me, foe) {
    this.me = me;
    this.foe = foe;
    this.think = 1;
    this.strafe = 0;
    this.blockFor = 0;
    this.seen = null; // the move of the player it already reacted to
  }
  update(dt) {
    const me = this.me,
      foe = this.foe,
      d = Math.hypot(foe.x - me.x, foe.z - me.z);
    // react once per player swing, after ~0.15 s (a person needs time to see it)
    const swing = (foe.act === 'light' || foe.act === 'heavy') && foe.t > 0.15 ? foe.act + foe.combo : null;
    if (swing && swing !== this.seen && d < 3.2 && me.free) {
      this.seen = swing;
      const r = Math.random();
      if (foe.act === 'heavy') {
        if (r < 0.45) me.dodge(pick([-1, 1]), -0.3);
        else if (r < 0.75 && foe.t < DM.heavy.hitFrom - 0.3) me.light(); // a quick blow interrupts the wind-up
      } else if (r < 0.6) {
        this.blockFor = 0.45 + Math.random() * 0.3;
        me.preBlock = Math.random() < 0.3 ? 0 : DM.parry; // perfect timing only sometimes
      } else if (r < 0.72) me.dodge(0, -1);
    }
    if (!swing) this.seen = null;
    me.want.block = (this.blockFor -= dt) > 0;
    // footwork: keep sword's length away, circle a little
    if ((this.think -= dt) <= 0) {
      this.think = rand(0.3, 0.75);
      this.strafe = pick([-1, -1, 0, 1, 1]) * 0.6;
      if (me.act === 'idle' && d < 2.3) {
        const r = Math.random();
        if (foe.act === 'stagger' || foe.act === 'hit') me.light();
        else if (foe.act === 'block' && me.st > DM.heavy.st && r < 0.55) me.heavy();
        else if (r < 0.5 && me.st > DM.light.st) me.light();
        else if (r < 0.62 && me.st > DM.heavy.st) me.heavy();
      }
    }
    me.want.mz = d > 2.0 ? 1 : d < 1.4 ? -0.7 : 0;
    me.want.mx = this.strafe;
  }
}
