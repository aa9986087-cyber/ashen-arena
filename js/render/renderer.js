'use strict';
/* Draws a frame: camera, player, instanced enemies/projectiles/pickups, effect pools, and the 2D overlay. */
function resize() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, S.set.qual ? 2 : 1.25);
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  fxC.width = W * DPR;
  fxC.height = H * DPR;
}
addEventListener('resize', resize);
const proj = (x, y, z) => {
  V.set(x, y, z).project(camera);
  return [((+V.x + 1) / 2) * W, ((1 - V.y) / 2) * H];
};
const PCOL = [
  [0.3, 0.85, 1],
  [0.4, 1, 0.5],
  [0.85, 0.45, 1],
];
function render(dt, now) {
  const p = G.p,
    playing = G.state !== 'menu';
  // camera
  if (playing) {
    const portrait = W < H,
      ch = portrait ? 31 : 24,
      cd = portrait ? 17 : 15,
      sk = G.shake;
    camera.position.set(p.x + rand(-sk, sk), ch + rand(-sk, sk) * 0.5, p.z + cd + rand(-sk, sk));
    camera.lookAt(p.x, 0, p.z - 1);
  } else {
    const a = now * 0.00012;
    camera.position.set(Math.sin(a) * 13, 6.5, Math.cos(a) * 13);
    camera.lookAt(0, 1.6, 0);
  }
  sun.position.set(p.x + 12, 26, p.z + 9);
  sun.target.position.set(p.x, 0, p.z);
  if (playing && !IN.touch) mouseWorld();
  // player
  if (PM.g) {
    const g = PM.g,
      sup = G.superT > 0;
    g.position.set(p.x, Math.abs(Math.sin(p.walk)) * 0.12 * p.moving, p.z);
    g.rotation.y = playing ? p.face : Math.sin(now * 0.0006) * 0.4;
    g.visible = !(p.inv > 0 && p.dashT <= 0 && ((now / 60) | 0) % 2 === 0 && G.state === 'play');
    const sw = Math.sin(p.walk) * 0.9 * p.moving;
    PM.lL.rotation.x = sw;
    PM.lR.rotation.x = -sw;
    PM.aL.rotation.x = -sw * 0.7;
    const cur = G.weapons[0],
      melee = WEP[cur.id].melee,
      idle = playing ? 0 : Math.sin(now * 0.002) * 0.08;
    if (melee) {
      PM.aR.rotation.x = -Math.PI / 2 + idle;
      PM.aR.rotation.z = p.swing > 0 ? -1.4 + 2.8 * (1 - p.swing) : 0.5;
    } else {
      PM.aR.rotation.x = -Math.PI / 2 - p.swing * 0.35 + idle;
      PM.aR.rotation.z = 0;
    }
    const s = sup ? 1.25 : 1;
    g.scale.set(s, s, s);
    glow.intensity = sup ? 2.2 : 0;
    glow.position.set(p.x, 3, p.z);
    shieldMesh.visible = p.shield > 1 && playing;
    shieldMesh.position.set(p.x, 1.3, p.z);
    shieldMesh.material.opacity = 0.1 + 0.16 * (p.shield / (p.shieldMax || 1));
    const au = G.ups.aura;
    auraMesh.visible = !!au;
    if (au) {
      const R = auraRadius();
      auraMesh.position.set(p.x, 0.08, p.z);
      auraMesh.scale.set(R, R, 1);
      auraMesh.material.opacity = 0.13 + 0.06 * Math.sin(now * 0.01);
    }
  }
  // enemies
  bossAura.visible = false;
  for (const e of G.enemies) {
    if (e.boss) {
      const s = e.scale,
        b = bossMesh;
      b.position.set(e.x, (e.y || 0) + Math.abs(Math.sin(e.t * 3)) * 0.15, e.z);
      b.rotation.set(0, e.face, Math.sin(e.t * 3) * 0.05);
      b.scale.set(s, s, s);
      const ab = G.abyss ? 0.14 : 0; // the abyss "shadow" versions glow purple
      bossMat.emissive.setRGB(
        e.flash > 0 ? 0.8 : e.hp < e.maxHp * 0.5 ? 0.25 : ab,
        e.flash > 0 ? 0.8 : e.frz > 0 ? 0.3 : 0,
        e.flash > 0 ? 0.8 : e.frz > 0 ? 0.7 : ab * 0.9
      );
      const c = BOSS_ULTS[e.kind].col,
        R = 3.2 + 0.25 * Math.sin(e.t * 4) + (e.st === 4 ? 1.5 : 0);
      bossAura.visible = true;
      bossAura.position.set(e.x, 0.07, e.z);
      bossAura.scale.set(R, R, 1);
      bossAura.material.color.setRGB(c[0], c[1], c[2]);
      bossAura.material.opacity = e.st === 4 ? 0.45 : e.hp < e.maxHp * 0.5 ? 0.3 : 0.18;
      continue;
    }
    const s = e.scale,
      ph = e.t * e.spd * 1.7,
      f = e.flash > 0;
    put(
      EM[e.type],
      e.x,
      Math.abs(Math.sin(ph)) * 0.2 * s,
      e.z,
      e.face,
      s,
      s,
      s,
      f ? 3 : e.frz > 0 ? 0.55 : e.burn > 0 ? 1.7 : e.elite ? 1.8 : G.abyss ? 0.85 : 1,
      f ? 3 : e.frz > 0 ? 0.9 : e.burn > 0 ? 0.8 : e.elite ? 1.45 : G.abyss ? 0.45 : 1,
      f ? 3 : e.frz > 0 ? 1.7 : e.burn > 0 ? 0.45 : e.elite ? 0.5 : G.abyss ? 0.55 : 1,
      e.st === 2 ? 0.35 : 0,
      Math.sin(ph) * 0.1
    );
  }
  for (const k in EM) flush(EM[k]);
  for (const a of G.allies) put(IAlly, a.x, Math.abs(Math.sin(a.t)) * 0.12, a.z, a.face, 0.85, 0.85, 0.85, 1, 1, 1);
  flush(IAlly);
  if (G.ups.orbit) forOrbitBlades((a, x, z) => put(IBlade, x, 1.1, z, -a, 1.2, 1.2, 1.2, 1.2, 1.3, 1.6));
  flush(IBlade);
  // shots
  for (const s of G.shots) {
    const c = s.col,
      ry = Math.atan2(s.vx, s.vz);
    if (s.kind === 0) put(IB, s.x, 1.1, s.z, ry, 0.14, 0.14, 0.75, c[0] * 1.2, c[1] * 1.1, c[2] * 0.6);
    else if (s.kind === 1) put(IB, s.x, 1.1, s.z, ry, 0.09, 0.09, 1.4, c[0], c[1], c[2]);
    else if (s.kind === 2) put(IB, s.x, 1.1, s.z, s.t * 16, s.r * 1.9, 0.12, s.r * 0.8, c[0], c[1], c[2]);
    else if (s.kind === 3) {
      put(IB, s.x, 1.1, s.z, ry, 0.3, 0.3, 0.95, 0.6, 0.65, 0.5);
      put(IS, s.x - s.vx * 0.03, 1.1, s.z - s.vz * 0.03, 0, 0.45, 0.45, 0.45, 1.5, 0.8, 0.2);
    } else if (s.kind === 4) {
      const q = s.r * 2 * (1 + 0.15 * Math.sin(s.t * 20));
      put(IS, s.x, 1.1, s.z, 0, q, q, q, c[0] * 0.9, c[1] * 0.6, c[2] * 1.3);
    } else put(IB, s.x, 1, s.z, ry, s.r * 2.4, 0.08, 0.5, c[0], c[1], c[2]);
  }
  for (const s of G.eshots) {
    const st = s.sty && BOSS_ULTS[s.sty - 1].shot;
    if (!st) put(IS, s.x, 1, s.z, 0, 0.6, 0.6, 0.6, 1.9, 0.35, 0.25);
    else {
      const c = st.c,
        ry = Math.atan2(s.vx, s.vz);
      if (st.form === 'orb') put(IS, s.x, 1, s.z, 0, st.s, st.s, st.s, c[0], c[1], c[2]);
      else if (st.form === 'thorn') put(IB, s.x, 1, s.z, ry, 0.16, 0.16, 0.95, c[0], c[1], c[2]);
      else if (st.form === 'blade') put(IB, s.x, 1, s.z, ry, 0.7, 0.07, 0.35, c[0], c[1], c[2]);
      else put(IB, s.x, 1, s.z, ry, 0.3, 0.3, 0.6, c[0], c[1], c[2]); // shell
    }
  }
  flush(IB);
  flush(IS);
  // pickups
  for (const q of G.picks) {
    const bob = 0.5 + Math.sin(q.t * 4) * 0.12;
    if (q.k === 0) {
      const c = PCOL[q.v >= 10 ? 2 : q.v >= 3 ? 1 : 0],
        s = q.v >= 10 ? 0.62 : q.v >= 3 ? 0.48 : 0.36;
      put(IG, q.x, bob, q.z, q.t * 2, s, s * 1.3, s, c[0], c[1], c[2]);
    } else if (q.k === 1) put(ICoin, q.x, bob, q.z, q.t * 3, 0.5, 0.5, 0.5, 1.3, 1, 0.2, Math.PI / 2);
    else put(IG, q.x, bob + 0.2, q.z, q.t * 2, 0.7, 0.7, 0.7, 1.4, 0.2, 0.3);
  }
  flush(IG);
  flush(ICoin);
  for (const q of G.parts) {
    const k = 1 - q.l / q.m,
      s = q.s * k;
    put(IP, q.x, q.y, q.z, q.l * 6, s, s, s, q.r * 1.2, q.g * 1.2, q.b * 1.2, q.l * 4);
  }
  flush(IP);
  // rings / zones / slashes
  ringPool.forEach((m, i) => {
    const q = G.rings[i];
    m.visible = !!q;
    if (q) {
      const k = q.l / q.d,
        r = q.r0 + (q.r1 - q.r0) * (1 - (1 - k) * (1 - k));
      m.position.set(q.x, 0.12, q.z);
      m.scale.set(r, r, 1);
      m.material.color.setRGB(q.c[0], q.c[1], q.c[2]);
      m.material.opacity = 1 - k;
    }
  });
  zonePool.forEach((m, i) => {
    const q = G.zones[i],
      b = ballPool[i];
    m.visible = !!q;
    b.visible = !!q;
    if (q) {
      const k = q.l / q.d;
      m.position.set(q.x, 0.1, q.z);
      m.scale.set(q.r, q.r, 1);
      const zc = q.f ? 0xffa020 : q.sty ? BOSS_ULTS[q.sty - 1].zone : 0xff2a1a;
      m.material.color.setHex(zc);
      m.material.opacity = 0.18 + 0.4 * k;
      const y = (1 - k) * 26 + 1,
        bs = q.f ? 1.6 : 0.9;
      b.position.set(q.x + (1 - k) * 6, y, q.z - (1 - k) * 4);
      b.scale.set(bs, bs, bs);
      b.material.color.setHex(q.f ? 0xff8a20 : q.sty ? zc : 0xff4030);
    }
  });
  slashPool.forEach((m, i) => {
    const q = G.slashes[i];
    m.visible = !!q;
    if (q) {
      const k = q.l / FX_LIFE.slash;
      m.geometry = slashGeo[q.tier];
      m.position.set(p.x, 1, p.z);
      m.rotation.set(-Math.PI / 2, 0, -q.a);
      m.scale.set(q.R * (0.7 + 0.3 * k), q.R * (0.7 + 0.3 * k), 1);
      const c = TIERC[q.tier];
      m.material.color.setRGB(c[0], c[1], c[2]);
      m.material.opacity = 0.85 * (1 - k);
    }
  });
  renderer.render(scene, camera);
  // 2D overlay
  fx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fx.clearRect(0, 0, W, H);
  if (playing) {
    fx.lineJoin = 'round';
    fx.lineCap = 'round';
    for (const b of G.bolts) {
      const al = 1 - b.l / FX_LIFE.bolt;
      fx.globalAlpha = al;
      fx.shadowColor = '#7fd0ff';
      fx.shadowBlur = 14;
      fx.strokeStyle = '#eaf8ff';
      fx.lineWidth = 3;
      fx.beginPath();
      for (let i = 0; i < b.pts.length; i++) {
        const a = proj(b.pts[i][0], 1.2, b.pts[i][1]);
        if (!i) fx.moveTo(a[0], a[1]);
        else {
          const pr = proj(b.pts[i - 1][0], 1.2, b.pts[i - 1][1]);
          for (let j = 1; j <= 4; j++) {
            const t = j / 4,
              jx = j < 4 ? rand(-9, 9) : 0;
            fx.lineTo(pr[0] + (a[0] - pr[0]) * t + jx, pr[1] + (a[1] - pr[1]) * t + jx);
          }
        }
      }
      fx.stroke();
    }
    fx.shadowBlur = 0;
    fx.textAlign = 'center';
    for (const q of G.texts) {
      const a = proj(q.x, 2 + q.l * 2.4, q.z),
        k = q.l / FX_LIFE.text;
      fx.globalAlpha = 1 - k * k;
      fx.font = (q.big ? '800 24px ' : '700 16px ') + 'Tajawal,sans-serif';
      fx.lineWidth = 3;
      fx.strokeStyle = 'rgba(0,0,0,.75)';
      fx.strokeText(q.t, a[0], a[1]);
      fx.fillStyle = q.c;
      fx.fillText(q.t, a[0], a[1]);
    }
    fx.globalAlpha = 1;
    for (const e of G.enemies)
      if (e.elite && !e.boss && e.hp < e.maxHp) {
        const a = proj(e.x, 2.6 * e.scale, e.z);
        fx.fillStyle = 'rgba(0,0,0,.6)';
        fx.fillRect(a[0] - 20, a[1], 40, 5);
        fx.fillStyle = '#ffb52e';
        fx.fillRect(a[0] - 20, a[1], 40 * Math.max(0, e.hp / e.maxHp), 5);
      }
    if (G.boss) {
      const a = proj(G.boss.x, 1, G.boss.z);
      if (a[0] < 0 || a[0] > W || a[1] < 0 || a[1] > H) {
        const cx = W / 2,
          cy = H / 2,
          an = Math.atan2(a[1] - cy, a[0] - cx),
          r = Math.min(W, H) * 0.42;
        fx.fillStyle = '#ff5a40';
        fx.font = '800 30px sans-serif';
        fx.fillText('☠', cx + Math.cos(an) * r, cy + Math.sin(an) * r);
      }
    }
    drawHud();
  }
  if (vig > 0) {
    vig = Math.max(0, vig - dt * 2);
  }
  $('vig').style.opacity = vig + (playing && p.hp < p.maxHp * 0.25 ? 0.25 + 0.1 * Math.sin(now * 0.008) : 0);
  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) $('banner').classList.remove('on');
  }
}
