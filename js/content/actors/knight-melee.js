'use strict';
/* Knight-only timing/queue extracted from c0c1701:test/js/game/combat.js.
   No startup mutation; no timers. The registry calls these hooks explicitly. */
(() => {
  const MELEE_TIMING = Object.freeze({ duration: 0.1, impact: 0.04 });
  function active() {
    const registry = ASHEN_ADDONS;
    if (!registry || typeof registry.enabled !== 'function' || !registry.enabled('knight')) return false;
    if (typeof G === 'undefined' || !G || !G.p) return false;
    const char = typeof PM !== 'undefined' && PM.char ? PM.char : typeof S !== 'undefined' ? S.char : '';
    return char === 'knight';
  }
  function clearMeleeImpacts() {
    if (typeof G === 'undefined' || !G) return;
    G.meleeSwings = [];
    if (G.p) G.p.meleeVisual = null;
  }
  function queueMeleeImpact(apply) {
    if (typeof apply !== 'function') return false;
    // false means the parent keeps its baseline instant apply(). Never applies a job twice.
    if (!active()) return false;
    if (G.state !== 'play' || G.p.dead || (typeof choosingCards === 'function' && choosingCards())) {
      clearMeleeImpacts();
      return true;
    }
    const queue = G.meleeSwings || (G.meleeSwings = []);
    let cycle = queue[queue.length - 1];
    if (!cycle || G.t >= cycle.start + MELEE_TIMING.impact || cycle.done) {
      const previous = G.p.meleeVisual;
      const start = previous ? Math.max(G.t, previous.start + MELEE_TIMING.duration) : G.t;
      cycle = { id: (G.meleeSerial = (G.meleeSerial || 0) + 1), start, player: G.p, jobs: [] };
      queue.push(cycle);
    }
    cycle.jobs.push(apply);
    updateMeleeImpacts();
    return true;
  }
  function updateMeleeImpacts() {
    if (!active() || G.state !== 'play' || G.p.dead || (typeof choosingCards === 'function' && choosingCards())) {
      clearMeleeImpacts();
      return;
    }
    const queue = G.meleeSwings;
    if (!queue) return;
    for (const cycle of queue) {
      if (cycle.player !== G.p || cycle.done || G.t < cycle.start) continue;
      G.p.meleeVisual = cycle;
      if (G.t + 1e-8 < cycle.start + MELEE_TIMING.impact) continue;
      cycle.done = true;
      // Every callback retains the complete original weapon arc/range/enemy loop.
      for (const apply of cycle.jobs) {
        if (!active() || G.state !== 'play' || G.p.dead || cycle.player !== G.p) break;
        apply();
      }
      cycle.jobs.length = 0;
    }
    G.meleeSwings = queue.filter(c => !c.done && c.player === G.p);
  }
  window.ASHEN_KNIGHT_MELEE = Object.freeze({ timing: MELEE_TIMING, queueMeleeImpact, updateMeleeImpacts, clearMeleeImpacts });
})();
