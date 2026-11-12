'use strict';
/* Enemy and boss behaviour (movement, attacks) and crowd separation. */
/** Ranged-enemy movement: approach beyond `far`, retreat inside `near`, otherwise strafe at speed×slow.
    Returns [mx, mz, speedMultiplier]. */
const kite = (d, far, near, slow, ux, uz, side) =>
  d > far ? [ux, uz, 1] : d < near ? [-ux, -uz, 1] : [-uz * side, ux * side, slow];
/** n hazard zones: the first on (cx,cz), the rest scattered within ±spread; each lands dstep later. */
function zoneBarrage(cx, cz, n, spread, r, d0, dstep, dmg) {
  for (let j = 0; j < n; j++)
    zone(cx + (j ? rand(-spread, spread) : 0), cz + (j ? rand(-spread, spread) : 0), r, d0 + j * dstep, dmg, false);
}
function updEnemies(dt) {
  const p = G.p,
    E = G.enemies,
    fl = G.ups.fire || 0;
  for (let i = 0, n = E.length; i < n; i++) {
    const e = E[i];
    if (e.dead) continue;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.hitCd > 0) e.hitCd -= dt;
    if (e.oCd > 0) e.oCd -= dt;
    if (e.frz > 0) {
      // frozen by the mage's special: no movement, attacks or contact damage
      e.frz -= dt;
      continue;
    }
    if (e.burn > 0) {
      e.burn -= dt;
      e.bAcc += dt;
      if (e.bAcc >= 0.5) {
        e.bAcc = 0;
        hit(e, 5 * Math.max(1, fl) * p.dmgMul, { burn: 1, noCrit: 1, aoe: 1, quiet: 1 });
        text(e.x, e.z, Math.round(5 * Math.max(1, fl) * p.dmgMul), '#ff9a4a');
        parts(e.x, 1.4, e.z, 1, 1, 0.5, 0.1, 2, 0.2, 0.4);
        if (e.dead) continue;
      }
    }
    const dx = p.x - e.x,
      dz = p.z - e.z,
      d = Math.hypot(dx, dz) || 0.001,
      ux = dx / d,
      uz = dz / d;
    let mx = 0,
      mz = 0,
      spd = e.spd;
    e.face = Math.atan2(dx, dz);
    if (e.boss) {
      const rage = e.hp < e.maxHp * 0.5 ? 1.45 : 1,
        k = e.kind;
      e.a1 -= dt * rage;
      e.a2 -= dt * rage;
      e.a3 -= dt * rage;
      mx = ux;
      mz = uz;
      e.y = 0;
      e.a4 -= dt * rage;
      if (e.a4 <= 0 && e.st === 0 && d < 32) {
        e.a4 = 2.6;
        const ld = d / 15,
          tx = p.x + (IN.mvx || 0) * p.speed * ld,
          tz = p.z + (IN.mvz || 0) * p.speed * ld,
          aa = Math.atan2(tz - e.z, tx - e.x);
        eFan(e.x, e.z, aa, 1, 0.13, 15, e.dmg * 0.45);
        AU.play('eshot');
      }
      e.ult -= dt * rage;
      bossTick(e, p, dt);
      if (e.st === 0 && e.ult <= 0 && d < 34) startUlt(e);
      if (e.st === 4) {
        // ultimate wind-up (see js/game/boss-ults.js)
        spd = 0;
        e.flash = 0.05;
        e.stT -= dt;
        if (e.stT <= 0) {
          e.st = 0;
          BOSS_ULTS[k].f(e, p);
        }
      } else if (e.st === 1) {
        e.stT -= dt;
        e.flash = 0.05;
        spd = 0;
        if (e.stT <= 0) {
          e.st = 2;
          e.stT = 0.85;
        }
      } else if (e.st === 2) {
        mx = e.cx;
        mz = e.cz;
        spd = 18;
        e.stT -= dt;
        if (e.stT <= 0) {
          e.st = 0;
          if (e.kind === 5) eRing(e.x, e.z, 18, 8, e.dmg * 0.5);
        }
        if (Math.random() < 0.5) parts(e.x, 0.3, e.z, 1, 0.6, 0.5, 0.3, 3, 0.3, 0.4);
      } else if (e.st === 3) {
        spd = 0;
        e.stT -= dt;
        e.y = Math.sin(Math.max(0, e.stT) * Math.PI) * 9;
        e.x += (e.lx - e.x) * Math.min(1, dt * 5);
        e.z += (e.lz - e.z) * Math.min(1, dt * 5);
        if (e.stT <= 0) {
          e.st = 0;
          e.x = e.lx;
          e.z = e.lz;
          eRing(e.x, e.z, 14, 8, e.dmg * 0.6);
          if (e.leaps > 0) {
            e.leaps--;
            bossLeap(e, p);
          }
        }
      } else if (k === 0) {
        if (e.a1 <= 0 && d < 17) {
          e.a1 = 4.6;
          e.st = 1;
          e.stT = 0.75;
          e.cx = ux;
          e.cz = uz;
          AU.play('boss');
        }
        if (e.a2 <= 0) {
          e.a2 = 9;
          spawnPack('fast', 5, e.x, e.z, 3);
          ring(e.x, e.z, 0.5, 4, 0.4, [0.4, 1, 0.3]);
        }
      } else if (k === 1) {
        if (d < 8) {
          mx = -ux;
          mz = -uz;
        } else if (d < 13) {
          mx = -uz;
          mz = ux;
        }
        if (e.a1 <= 0) {
          e.a1 = 2.5;
          eRing(e.x, e.z, 14, 7.5, e.dmg * 0.6, e.t);
          AU.play('eshot');
        }
        if (e.a2 <= 0) {
          e.a2 = 8;
          e.spiral = 2.2;
        }
        if (e.spiral > 0) {
          e.spiral -= dt;
          e.spAcc += dt;
          spd *= 0.3;
          while (e.spAcc > 0.06) {
            e.spAcc -= 0.06;
            e.spA += 0.4;
            eShot(e.x, e.z, e.spA, 8.5, e.dmg * 0.5);
            eShot(e.x, e.z, e.spA + Math.PI, 8.5, e.dmg * 0.5);
          }
        }
      } else if (k === 2) {
        if (e.a1 <= 0) {
          e.a1 = 4.6;
          bossLeap(e, p);
        }
        if (e.a2 <= 0 && d < 19) {
          e.a2 = 3;
          eFan(e.x, e.z, Math.atan2(dz, dx), 2, 0.2, 11, e.dmg * 0.6);
          AU.play('eshot');
        }
      } else if (k === 4) {
        if (e.a1 <= 0) {
          e.a1 = 3.6;
          eRing(e.x, e.z, 16, 5.5, e.dmg * 0.55, e.t);
          e.burst = 1;
          e.spAcc = 0.5;
          AU.play('eshot');
        }
        if (e.burst > 0) {
          e.spAcc -= dt;
          if (e.spAcc <= 0) {
            e.burst = 0;
            eRing(e.x, e.z, 16, 7, e.dmg * 0.55, e.t, 0.5);
          }
        }
        if (e.a2 <= 0) {
          e.a2 = 6;
          for (let j = 1; j <= 5; j++)
            zone(e.x + ux * j * 3.4, e.z + uz * j * 3.4, 2.7, 0.7 + j * 0.16, e.dmg * 1.2, false);
          AU.play('boss');
        }
        if (e.a3 <= 0) {
          e.a3 = 11;
          spawnPack('wolf', 4, e.x, e.z, 4);
        }
      } else if (k === 5) {
        if (e.a1 <= 0 && d < 18) {
          e.a1 = 4.4;
          e.st = 1;
          e.stT = 0.7;
          e.cx = ux;
          e.cz = uz;
          AU.play('boss');
        }
        if (e.a2 <= 0) {
          e.a2 = 2.8;
          zoneBarrage(p.x, p.z, 3, 5, 3.4, 1, 0.2, e.dmg * 1.2);
        }
        if (e.a3 <= 0) {
          e.a3 = 10;
          e.spiral = 2.4;
          spawnPack('bomber', 3, e.x, e.z, 4);
        }
        if (e.spiral > 0) {
          e.spiral -= dt;
          e.spAcc += dt;
          while (e.spAcc > 0.07) {
            e.spAcc -= 0.07;
            e.spA += 0.5;
            for (let q = 0; q < 3; q++) eShot(e.x, e.z, e.spA + (q * TAU) / 3, 8, e.dmg * 0.5);
          }
        }
      } else {
        if (e.a1 <= 0) {
          e.a1 = 3.4;
          zoneBarrage(p.x, p.z, 4, 6, 3.2, 1.05, 0.16, e.dmg * 1.2);
          AU.play('rocket');
        }
        if (e.a2 <= 0) {
          e.a2 = 5;
          e.burst = 3;
          e.spAcc = 0;
        }
        if (e.burst > 0) {
          e.spAcc -= dt;
          if (e.spAcc <= 0) {
            e.spAcc = 0.28;
            e.burst--;
            eFan(e.x, e.z, Math.atan2(dz, dx), 3, 0.15, 11, e.dmg * 0.5);
            AU.play('eshot');
          }
        }
        if (e.a3 <= 0) {
          e.a3 = 13;
          spawnPack('shield', 4, e.x, e.z, 4);
        }
      }
    } else if (e.type === 'grunt' || e.type === 'shield') {
      if (e.flank && d > 5) {
        const tx = p.x + Math.cos(e.slot) * 4.5 - e.x,
          tz = p.z + Math.sin(e.slot) * 4.5 - e.z,
          ad = Math.hypot(tx, tz) || 1;
        mx = tx / ad;
        mz = tz / ad;
        if (ad < 1.5) e.flank = false;
      } else {
        mx = ux;
        mz = uz;
      }
    } else if (e.type === 'fast') {
      [mx, mz] = rotate(ux, uz, Math.sin(e.t * 3 + e.slot) * 0.9);
    } else if (e.type === 'archer') {
      let k;
      [mx, mz, k] = kite(d, 12, 7, 0.6, ux, uz, e.side);
      spd *= k;
      e.cd -= dt;
      if (e.cd <= 0 && d < 16) {
        e.cd = 2.3 + Math.random();
        eShot(e.x, e.z, Math.atan2(dz, dx) + rand(-0.08, 0.08), 9.5, e.dmg);
        AU.play('eshot');
      }
    } else if (e.type === 'wolf') {
      if (e.st === 2) {
        mx = e.cx;
        mz = e.cz;
        spd = 17;
        e.stT -= dt;
        if (e.stT <= 0) {
          e.st = 0;
          e.cd = 2.2 + Math.random();
        }
      } else {
        [mx, mz] = rotate(ux, uz, Math.sin(e.t * 2 + e.slot) * 0.5);
        e.cd -= dt;
        if (e.cd <= 0 && d < 7) {
          e.st = 2;
          e.stT = 0.32;
          e.cx = ux;
          e.cz = uz;
        }
      }
    } else if (e.type === 'runner') {
      if (e.hitCd > 0.15) {
        mx = -ux;
        mz = -uz;
        spd *= 0.8;
      } else {
        [mx, mz] = rotate(ux, uz, Math.sin(e.t * 7 + e.slot) * 0.35);
        if (d < 9) spd *= 1.25;
      }
      if (Math.random() < dt * 6) parts(e.x, 0.2, e.z, 1, 0.6, 0.55, 0.45, 1.5, 0.18, 0.35);
    } else if (e.type === 'bomber') {
      mx = ux;
      mz = uz;
      if (e.st === 1) {
        e.stT -= dt;
        e.flash = 0.05;
        spd *= 0.3;
        if (e.stT <= 0) {
          e.dead = true;
          ring(e.x, e.z, 0.3, 3.2, 0.3, [1, 0.4, 0.1]);
          parts(e.x, 0.8, e.z, 18, 1, 0.5, 0.1, 10, 0.3);
          AU.play('boom');
          shake(0.35);
          if (d < 3.2 + p.r) hurt(e.dmg);
          if (G.state !== 'play') return;
          continue;
        }
      } else if (d < 2.3) {
        e.st = 1;
        e.stT = 0.55;
      }
    } else if (e.type === 'shaman') {
      let k;
      [mx, mz, k] = kite(d, 12, 8, 0.5, ux, uz, e.side);
      spd *= k;
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = 4.5;
        let n = 0;
        for (const o of E) {
          if (o.dead || o === e || o.boss) continue;
          if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 49 && o.hp < o.maxHp) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.3);
            n++;
          }
        }
        if (n) ring(e.x, e.z, 0.5, 7, 0.5, [0.3, 1, 0.5]);
      }
    } else if (e.type === 'mage') {
      let k;
      [mx, mz, k] = kite(d, 14, 9, 0.5, ux, uz, e.side);
      spd *= k;
      e.cd -= dt;
      if (e.cd <= 0 && d < 18) {
        e.cd = 3.6 + Math.random();
        zone(p.x + (IN.mvx || 0) * 2, p.z + (IN.mvz || 0) * 2, 2.6, 1, e.dmg, false);
        e.flash = 0.15;
      }
    } else if (e.type === 'golem') {
      if (e.st === 1) {
        e.stT -= dt;
        e.flash = 0.05;
        spd = 0;
        if (e.stT <= 0) {
          e.st = 0;
          e.cd = 4;
        }
      } else {
        mx = ux;
        mz = uz;
        e.cd -= dt;
        e.aCd -= dt;
        if (e.aCd <= 0 && d < 22) {
          e.aCd = 4.5;
          eRing(e.x, e.z, 10, 7, e.dmg * 0.4, e.t);
          AU.play('eshot');
        }
        if (e.cd <= 0 && d < 5) {
          e.st = 1;
          e.stT = 0.95;
          zone(e.x, e.z, 5, 0.9, e.dmg, false);
        }
      }
    } else {
      // brute
      if (e.st === 0) {
        mx = ux;
        mz = uz;
        e.cd -= dt;
        e.aCd -= dt;
        if (e.aCd <= 0 && d > 7 && d < 24) {
          e.aCd = 3.2;
          const aa = Math.atan2(dz, dx);
          eShot(e.x, e.z, aa, 10, e.dmg * 0.55);
          eShot(e.x, e.z, aa + 0.22, 10, e.dmg * 0.4);
          eShot(e.x, e.z, aa - 0.22, 10, e.dmg * 0.4);
          AU.play('eshot');
        }
        if (e.cd <= 0 && d < 10) {
          e.st = 1;
          e.stT = 0.7;
          e.cx = ux;
          e.cz = uz;
        }
      } else if (e.st === 1) {
        e.stT -= dt;
        e.flash = 0.05;
        if (e.stT <= 0) {
          e.st = 2;
          e.stT = 0.55;
        }
      } else {
        mx = e.cx;
        mz = e.cz;
        spd = 15;
        e.stT -= dt;
        if (e.stT <= 0) {
          e.st = 0;
          e.cd = 3.5;
        }
      }
    }
    if (e.elite && !e.boss) {
      e.eCd = (e.eCd === undefined ? rand(1, 3) : e.eCd) - dt;
      if (e.eCd <= 0 && d > 4 && d < 22) {
        e.eCd = 2.8;
        eShot(e.x, e.z, Math.atan2(dz, dx), 12, e.dmg * 0.5);
        AU.play('eshot');
      }
    }
    e.x += (mx * spd + e.kx) * dt;
    e.z += (mz * spd + e.kz) * dt;
    const kd = 1 - Math.min(1, 8 * dt);
    e.kx *= kd;
    e.kz *= kd;
    const er = Math.hypot(e.x, e.z);
    if (er > ARENA + 4) {
      e.x *= (ARENA + 4) / er;
      e.z *= (ARENA + 4) / er;
    }
    if (d < e.r + p.r && e.hitCd <= 0 && !(e.boss && e.st === 3)) {
      e.hitCd = 0.5;
      hurt(e.dmg);
      if (G.state !== 'play') return;
    }
  }
  // separation
  for (let i = 0, n = E.length; i < n; i++) {
    const a = E[i];
    if (a.dead) continue;
    for (let j = i + 1; j < n; j++) {
      const b = E[j];
      if (b.dead) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z,
        rr = (a.r + b.r) * 0.9,
        d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-4) {
        const d = Math.sqrt(d2),
          f = ((rr - d) / d) * 0.5;
        if (!a.boss) {
          a.x -= dx * f;
          a.z -= dz * f;
        }
        if (!b.boss) {
          b.x += dx * f;
          b.z += dz * f;
        }
      }
    }
  }
}
