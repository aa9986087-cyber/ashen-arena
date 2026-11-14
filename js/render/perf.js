'use strict';
/* Smoothness: GPU warm-up (no first-use stalls), adaptive resolution, and the optional FPS counter. */

/** Draw everything the game can show once, off-screen, so shaders compile and every model / animation frame
    is uploaded to the GPU now — not the first time an archer attacks or a boss walks in (that was the stutter). */
function warmGPU() {
  try {
    const tmp = new THREE.Group(),
      geos = new Set(),
      add = g => g && g.isBufferGeometry && geos.add(g);
    for (const k in ANIM) for (const c in ANIM[k]) ANIM[k][c].forEach(add);
    for (const h in HERO_GEOS) {
      const b = HERO_GEOS[h];
      add(b.base);
      for (const c in b.clips) b.clips[c].forEach(add);
    }
    for (const st of STAGES) st.decor.forEach(k => add(GEO[k]));
    for (const k in GEO) if (k.startsWith('boss')) add(GEO[k]);
    for (const g of geos) {
      const m = new THREE.Mesh(g, lamV);
      m.frustumCulled = false;
      m.castShadow = true;
      tmp.add(m);
    }
    const bm = new THREE.Mesh(GEO.boss0, bossMat);
    bm.frustumCulled = false;
    bm.castShadow = true;
    tmp.add(bm);
    // hidden pools and empty instanced meshes take part for this one draw
    const shown = [],
      counts = [];
    scene.traverse(o => {
      if (!o.visible) {
        shown.push(o);
        o.visible = true;
      }
      if (o.isInstancedMesh && o.count === 0) {
        counts.push(o);
        o.count = 1;
      }
    });
    scene.add(tmp);
    const rt = new THREE.WebGLRenderTarget(64, 64);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    rt.dispose();
    scene.remove(tmp);
    for (const o of shown) o.visible = false;
    for (const o of counts) o.count = 0;
  } catch (e) {
    console.warn('warmGPU', e);
  }
}

/* ---- adaptive resolution: if frames come late, render fewer pixels; when there is headroom, go back up.
   `best` learns the display's own frame interval (8.3 ms at 120 Hz, 16.7 ms at 60 Hz). */
const PERF = { avg: 0, best: 1e9, acc: 0, good: 0, n: 0, fpsT: 0, fpsN: 0, slowN: 0, cap60: false };
/** Milliseconds to wait between drawn frames (0 = every display frame). Nothing on screen changes:
    calm screens (menus, pause, card pick, run over) move slowly or sit behind a panel → 30 fps;
    play runs at the display's rate, or a steady 60 when this device can't hold 120 (or battery saver is on). */
function frameGap() {
  const st = G.state;
  if (st === 'menu' && typeof M2 !== 'undefined' && M2.on) return 1000 / 60 - 2; // the living menu moves: 60
  if (!DUEL.on && st !== 'play' && st !== 'watch' && st !== 'count') return 1000 / 30 - 2;
  if (S.set.eco || PERF.cap60) return 1000 / 60 - 2;
  return 0;
}
function perfTick(ms) {
  if (ms <= 0 || ms > 250) return; // tab switches, pauses
  PERF.avg = PERF.avg ? PERF.avg * 0.9 + ms * 0.1 : ms;
  PERF.n++;
  // learn the display's own interval only from unthrottled frames
  if (PERF.n > 30 && !frameGap()) PERF.best = Math.max(1000 / 165, Math.min(PERF.best, PERF.avg));
  // FPS counter, refreshed twice a second
  PERF.fpsT += ms;
  PERF.fpsN++;
  if (PERF.fpsT >= 500) {
    if (S.set.fps)
      $('fps').textContent =
        Math.round((PERF.fpsN * 1000) / PERF.fpsT) + ' FPS' + (RS < 1 ? ' · ' + Math.round(RS * 100) + '%' : '');
    PERF.fpsT = PERF.fpsN = 0;
  }
  if (G.state !== 'play') return;
  PERF.acc += ms;
  if (PERF.acc < 1000) return;
  PERF.acc = 0;
  // a screen drawn slower on purpose (menus at 30) is not a slow device: judge frames against that pace,
  // or the menus would wrongly drop the resolution (they did: down to 55%)
  const capped = S.set.eco || PERF.cap60,
    target = Math.max(capped ? Math.max(PERF.best, 1000 / 60) : PERF.best, frameGap() + 2),
    slow = PERF.avg > target * 1.3,
    fine = PERF.avg < target * 1.08;
  // a fast (≈120 Hz) display this device can't keep up with: settle on a steady 60 first — smoother, cooler,
  // and the picture stays exactly the same; only if 60 is still too much does the resolution come down
  if (!capped && PERF.best < 12) {
    PERF.slowN = slow ? PERF.slowN + 1 : 0;
    if (PERF.slowN >= 3) {
      PERF.cap60 = true;
      PERF.slowN = 0;
    }
    return;
  }
  if (slow && RS > 0.55) {
    RS = Math.max(0.55, RS - 0.1);
    PERF.good = 0;
    resize();
  } else if (fine && RS < 1 && ++PERF.good >= 4) {
    RS = Math.min(1, RS + 0.05);
    PERF.good = 0;
    resize();
  } else if (!fine) PERF.good = 0;
}
