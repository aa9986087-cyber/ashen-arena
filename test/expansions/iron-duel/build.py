"""Build the standalone Iron Duel review from a pinned Ashen Arena revision."""
from pathlib import Path
import argparse
import base64
import json
import io
import re
import shutil
import subprocess
import tarfile

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
BASE = "c358c3ff5534ced36c1a4f160cb05e5f04189b71"

def replace(text, anchor, update):
    if text.count(anchor) != 1:
        raise RuntimeError(f"Preview integration changed: {anchor[:95]}")
    return text.replace(anchor, update, 1)

def patch(out, name, edits):
    path = out / name
    code = path.read_text()
    for anchor, update in edits:
        code = replace(code, anchor, update)
    path.write_text(code)

def build(out):
    if out.exists():
        raise SystemExit("Choose a new output directory")
    archive = subprocess.check_output(
        ["git", "archive", BASE, "index.html", "js", "css", "assets"], cwd=ROOT
    )
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(out, filter="data")
    shutil.copytree(ROOT / "test/assets/vendor", out / "vendor")
    for name in ("combat.js", "injury.js", "art.js", "gear.js", "network.js", "menu.js", "style.css"):
        shutil.copyfile(SOURCE / name, out / name)
    shutil.copytree(SOURCE / "assets", out / "assets" / "iron-duel")

    patch(out, "js/ui/leaderboard.js", [
        ("async function api(path, opt) {", "async function api(path, opt) {\n  if (NET_LOCAL) throw new Error('Isolated preview');")
    ])
    patch(out, "js/ui/news.js", [
        ("const newsUnseen = () => NEWS.length && S.newsSeen !== NEWS[0].id;", "const newsUnseen = () => false;")
    ])
    patch(out, "js/main.js", [("if (!S.name) askName();", "if (!S.name) S.name = 'مبارز';")])
    patch(out, "js/core/save.js", [("'ashen_arena_v1'", "'ashen_iron_duel_profile_v1'")])
    patch(out, "js/game/run.js", [("'ashen_arena_run'", "'ashen_iron_duel_run_v1'")])
    patch(out, "js/core/penalties.js", [("    if (!pid || !S.pkey) return null;", "    return null;")])
    patch(out, "js/duel/duel-net.js", [
        ("const NET_LOCAL = /netlocal/.test(location.hash);", "const NET_LOCAL = true;"),
        ("  if (NET_LOCAL) {\n    const bc", "  if (!name.startsWith('duel-iron-v5-live-')) {\n    const bc"),
        ("new BroadcastChannel('ashen:' + name)", "new BroadcastChannel('ashen-iron-v5:' + name)"),
    ])
    (out / "js/duel/duel-lobby.js").write_text(
        (out / "js/duel/duel-lobby.js").read_text().replace("ashen_duels_local", "ashen_iron_duels")
    )
    lobby = out / "js/duel/duel-lobby.js"
    code = lobby.read_text()
    begin = code.index("function lobbyWeapons()")
    end = code.index("async function lobbyOpen()", begin)
    lobby.write_text(code[:begin] + "function lobbyWeapons() { forgeWeaponPicker(); }\n" + code[end:])

    path = out / "js/duel/duel-fighter.js"
    code = path.read_text()
    movement_start = code.index("    // weight: speed")
    movement_end = code.index("    this.lean =", movement_start)
    code = code[:movement_start] + """    if (this.act !== 'dodge') [vx, vz] = forgeFootwork(this, vx, vz, dt);
    else this.vx = this.vz = 0;
    """ + code[movement_end:]
    start = code.index("    // swings: sword glows")
    end = code.index("    // end of timed states", start)
    code = code[:start] + """    const M = this.M[this.act] || DM[this.act];
    const manual = forgeManual(this);
""" + code[end:]
    code = replace(code, "    this.hitDone = false;\n  }\n  /** The sword", """    this.hitDone = false;
    forgeBeginAction(this, act);
  }
  /** The sword""")
    code = replace(code, "    this.play(['atk1', 'atk2', 'atk3'][this.combo++ % 3], 0.08, this.M.light.t * 1.15, true);", "    this.combo++;")
    code = replace(code, "    this.play('heavy', 0.1, this.M.heavy.t * 1.6, true);", "")
    code = replace(code, "      this.play('block', 0.06, 0, true);", "")
    start = code.index("      if (this.act === 'idle') {\n        // a real sprint")
    end = code.index("\n    } else {\n      this.moving = 0;", start)
    code = code[:start] + code[end:]
    anchor = "    this.lean = (this.lean || 0)"
    start = code.index(anchor)
    code = code[:start] + """    if (this.free || this.act === 'light' || this.act === 'heavy') {
      const speed = Math.hypot(vx, vz);
      const forward = vx * fx + vz * fz;
      if (speed < .15) this.play('idle', .14);
      else {
        const run = this.running && this.acts.run, jog = this.jogging && this.acts.jog;
        this.play(run ? 'run' : jog ? 'jog' : 'walk', .12);
        this.cur.timeScale = (forward < -.22 ? -1 : 1) * (run || jog ? 1.05 : clamp(speed / 2.35, .32, 1.45));
      }
    }
""" + code[start:]
    start = code.index("    for (const o of this.others || [foe]) {", code.index("    // move, knock-back"))
    end = code.index("    const r = Math.hypot(this.x, this.z);", start)
    code = code[:start] + code[end:]
    start = code.index("    // the killing blow: a staged finisher")
    end = code.index("    if (kind === 'kick') {", start)
    code = code[:start] + "    forgeWound(this, from, kind);\n" + code[end:]
    code = replace(code, "    goreHit(this, from, kind);", "")
    code = code.replace("this.play('hit', 0.05, this.stun * 1.4, true);", "this.play('idle', .09);")
    code = replace(code, "this.play(s.a, 0.05, this.stun * 1.4, true);", "this.play('idle', .09);")
    code = replace(code, "this.play(kind === 'heavy' ? 'knock' : 'hit', 0.05, this.stun * 1.4, true);", "this.play('idle', .09);")
    code = replace(code, "    const cut = this.execute && !(this.cuts & 1) && W.cut ? 'head' : goreDecide(this, kind, from);",
                   "    const cut = goreDecide(this, kind, from);")
    code = replace(code, "    if (s.a === 'hit' || s.a === 'knock') goreHit(this, other, s.a === 'hit' ? 'light' : 'heavy');", "")
    start = code.index("    if (s.a === 'dead') {")
    end = code.index("    } else if (s.a === 'kicked')", start)
    code = code[:start] + "    if (s.a === 'dead') {\n      forgeFall(this, other);\n" + code[end:]
    code = code.replace("        this.start('dead');\n        this.play('death', 0.1, 0, true);\n        DS.death(this);", "        forgeFall(this, from);")
    code = code.replace("      this.start('dead');\n      this.play('death', 0.1, 0, true);\n      DS.death(this);", "      forgeFall(this, from);")
    start = code.index("  // a clean hit, and what made it special:")
    end = code.index("\n}", start)
    code = code[:start] + """  const injury = forgePenalty(a, 'armR');
  d.damage(M.dmg * (d.forgeContact?.power ?? 1) * (1 - injury * .34), a, kind);
  return 'hit';""" + code[end:]
    code = replace(code, "      goreHit(d, a, 'chip');", "")
    code = code.replace("Math.sin(this.face) * 5", "Math.sin(this.face) * 1.15").replace("Math.cos(this.face) * 5", "Math.cos(this.face) * 1.15")
    code = replace(code, "this.freeLook\n        ? // free movement:", "(this.freeLook || forgeManual(this))\n        ? // free movement:")
    code = replace(code, "          (this.act === 'light' || this.act === 'heavy' || this.act === 'kick') &&", "          !forgeManual(this) && (this.act === 'light' || this.act === 'heavy' || this.act === 'kick') &&")
    code = replace(code, "    this.kx = (ax / L) * kb;\n    this.kz = (az / L) * kb;", """    const weight = this.forgeContact?.power ?? .37;
    this.kx = (ax / L) * kb * weight * .66;
    this.kz = (az / L) * kb * weight * .66;""")
    code = replace(code, "if (kind === 'heavy' || d.st < cost)", "if (d.st < cost || (kind === 'heavy' && W.block > 1.25))")
    code = code.replace("this.st < this.M.light.st * 0.5", "this.st < this.M.light.st")
    code = code.replace("this.st < this.M.heavy.st * 0.5", "this.st < this.M.heavy.st")
    code = code.replace("blockT: 0, moving: 0", "blockT: 0, moving: 0, vx: 0, vz: 0, forgeSweep: null, forgePrior: null, forgeGuardBlade: null, forgePreviousGuard: null, forgeGait: null, forgeLean: 0, forgeMotion: null, forgeGesture: null")
    code = replace(code, "    if (M && this.t >= M.t) {", "    if (M && this.t >= (manual ? (this.forgeGesture.held ? 1.45 : Math.max(M.t, this.forgeGesture.release + .26)) : M.t)) {")
    code = replace(code, "    if (this.free) {\n      let mx", "    if (this.free || this.act === 'light' || this.act === 'heavy') {\n      let mx")
    code = replace(code, "* (this.armless ? 0.65 : 1);", "* (this.armless ? 0.65 : (this.act === 'light' || this.act === 'heavy') ? .55 : 1);")
    code = replace(code, "  if (d.act === 'dodge' && d.t > DM.dodge.iFrom && d.t < DM.dodge.iTo) return 'miss';", "")
    code = replace(code, "  if (d.act === 'block' && Math.abs(wrapAng(Math.atan2(a.x - d.x, a.z - d.z) - d.face)) < 1.4) {",
                   "  if (d.act === 'block' && d.forgeContact?.guard) {")
    code = replace(code, "    goreReset(this);", "    if (this.forgeRig) for (const z of this.forgeRig) z.ready = false;\n    forgeClearInjuries(this);\n    goreReset(this);")
    code = replace(code, "if (!this.free || this.st < DM.kick.st * 0.5)", "if (!this.free || this.st < DM.kick.st || (this.cuts & GORE_PARTS.legR.bit))")
    code = replace(code, "if (!this.free || this.st < DM.dodge.st * 0.5)", "if (!this.free || this.st < DM.dodge.st)")
    path.write_text(code)
    mode = out / "js/duel/duel-mode.js"
    code = mode.read_text()
    code = replace(code, 'DUEL_WEAPON_IDS.map(id => DUEL_WEAPONS[id].build())', 'DUEL_WEAPON_IDS.slice(0, 2).map(id => DUEL_WEAPONS[id].build())')
    warm_start = code.index("  for (const o of items) o.visible = false;")
    warm_end = code.index("  for (const g of spare)", warm_start)
    code = code[:warm_start] + """  withEnc(() => {
    renderer.compile(DUEL.scene, cam);
    for (const o of items) {
      for (const m of [].concat(o.material || [])) {
        if (m.map?.isTexture) renderer.initTexture(m.map);
      }
    }
    pixel();
  });
""" + code[warm_end:]
    code = code.replace("m.visible = !m.userData.cut", "m.visible = forgeFighterVisible(m)")
    code = replace(code, "const heavy = att.act === 'heavy' || r !== 'hit';", "const heavy = (def.forgeImpact?.amount || 0) > .63 || r !== 'hit';")
    code = replace(code, "m.visible = !fp && !m.userData.cut;", "m.visible = forgeFighterVisible(m, fp);")
    mode.write_text(code)
    patch(out, "js/duel/duel-mode.js", [
        ("    duelSoundsLoad();", "    duelSoundsLoad();\n    await forgeLoadGear();"),
        ("  G.state = 'duel';", "  G.state = 'duel';\n  DUEL.phase = 'load';"),
        ("getItem('ashen_duel_view')", "getItem('ashen_iron_view')"),
        ("setItem('ashen_duel_view',", "setItem('ashen_iron_view',"),
        ("|| 'fp';", "|| 'tps';"),
        ("    DUEL.scene.add(DUEL.me.root, DUEL.foe.root);",
         "    forgeDress(DUEL.me, 0);\n    forgeDress(DUEL.foe, 1);\n    DUEL.scene.add(DUEL.me.root, DUEL.foe.root);"),
        ("if (DUEL.atkDown >= 0 && !DUEL.heavyFired && performance.now()", "if (!forgePointer && DUEL.atkDown >= 0 && !DUEL.heavyFired && performance.now()"),
        ("  me.want.block = blockNow;", "  me.want.block = blockNow;\n  forgeTickControls();"),
        ("function duelExit() {", "function duelExit() {\n  forgeClearControls();"),
        ("function duelSetRot(on) {", "function duelSetRot(on) {\n  if (duelRotated() !== on) forgeClearControls();"),
        ("  const w = DUEL.me.want;\n  DUEL.me.dodge(w.mx, w.mz);", "  const w = DUEL.me.want, joy = DUEL.joy;\n  DUEL.me.dodge(joy?.x ?? w.mx, joy?.z ?? w.mz);"),
        ("  J.x = dx / m;\n  J.z = -dy / m;", """  const pressure = Math.max(0, (Math.min(d, m) - 7) / (m - 7));
  J.x = d > 0 ? (P.x - J.x0) / d * pressure : 0;
  J.z = d > 0 ? (J.y0 - P.y) / d * pressure : 0;"""),
        ("  duelLock(false);\n  DUEL.pitch = 0;",
         "  duelLock(!watch);\n  DUEL.pitch = 0;\n  me.forgeAttack = foe.forgeAttack = foe.forgeRemoteAttack = 0;"),
        ("""const press = (id, down, up) => {
  const b = $(id);
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    b.classList.add('held');
    down();
  });
  const end = e => {
    b.classList.remove('held');
    up && up();
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener('pointerleave', end);
};
press('dAtk', duelAtkDown, duelAtkUp);""", """const press = (id, down, up) => {
  const b = $(id);
  b.forgeHeldBy = null;
  b.addEventListener('pointerdown', e => {
    if (b.forgeHeldBy !== null || !DUEL.on || DUEL.phase !== 'fight') return;
    e.preventDefault();
    e.stopPropagation();
    b.forgeHeldBy = e.pointerId;
    b.setPointerCapture(e.pointerId);
    b.classList.add('held');
    down();
  });
  const end = e => {
    if (e.pointerId !== b.forgeHeldBy) return;
    b.forgeHeldBy = null;
    b.classList.remove('held');
    up?.();
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, end);
};"""),
        ("      DUEL.me.update(rdt * ts, DUEL.foe);\n      DUEL.foe.update(rdt * ts, DUEL.me);", "      forgeAdvance([[DUEL.me, DUEL.foe], [DUEL.foe, DUEL.me]], rdt * ts);"),
        ("    me.update(dt, foe);\n    foe.update(dt, me);", "    forgeAdvance([[me, foe], [foe, me]], dt);"),
        ("  const N = (DUEL.net = { ch, host, room", "  ch = forgeChannel(ch, host);\n  const N = (DUEL.net = { ch, host, room"),
        ("    if (DUEL.foe && DUEL.phase !== 'over') DUEL.foe.netState(s);",
         """    if (DUEL.foe && DUEL.phase !== 'over') {
      forgeReadFighter(DUEL.foe, s);
      DUEL.foe.netState(s);
    }"""),
        ("if (DUEL.foe && DUEL.phase === 'fight' && m.r === DUEL.round) DUEL.foe.netMove(m);",
         "if (DUEL.foe && DUEL.phase === 'fight' && m.r === DUEL.round) forgeReadMove(DUEL.foe, m);"),
        ("        duelRound(d.n);", "        if (d.n > DUEL.round) duelRound(d.n);"),
        ("    .on('go', () => {\n      alive();\n      N.ready = true;\n    })",
         """    .on('go', () => {
      alive(); // A go alone does not stop the guest's retries. Round 1 does.
    })"""),
        ("        ch.send('go', {});\n        if (!N.ready)", "        ch.send('go', {});\n        if (N.ready && DUEL.round === 1) ch.send('rd', { n: 1 });\n        if (!N.ready)"),
        ("    N.ch.send('st', {", """    N.ch.send('st', {
      gesture: forgePacketGesture(me),
      wound: forgeWoundPacket(me),
      mid: me.forgeAttack || 0,
      mt: r(me.t),
      md: me.forgeDirection || 0,
      mc: me.combo,"""),
        ("function duelOutcome(att, def, r) {", "function duelOutcome(att, def, r, at) {"),
        ("  duelOutcome(me, DUEL.foe, r.o);", "  duelOutcome(me, DUEL.foe, r.o, r.at && new THREE.Vector3(...r.at));"),
        ("me.x - fx * back - fz * 0.75,", "me.x - fx * back - fz * .94,"),
        ("me.z - fz * back + fx * 0.75", "me.z - fz * back + fx * .94"),
        ("goreSparks(att, def, 16);", "goreSparks(att, def, 16, at);"),
        ("goreSparks(att, def, 42);", "goreSparks(att, def, 42, at);"),
        ("goreSparks(att, def, 28);", "goreSparks(att, def, 28, at);"),
        ("    DUEL.me.onHit = r => duelOutcome(DUEL.me, DUEL.foe, r);", "    DUEL.me.onHit = (r, d, kind, at) => duelOutcome(DUEL.me, d, r, at);"),
        ("    DUEL.foe.onHit = r => duelOutcome(DUEL.foe, DUEL.me, r);", "    DUEL.foe.onHit = (r, d, kind, at) => duelOutcome(DUEL.foe, d, r, at);"),
        ("""    ? r => {
        duelOutcome(foe, me, r);
        DUEL.net && DUEL.net.ch.send('res', { o: r, k: foe.act });
      }
    : r => duelOutcome(foe, me, r);""", """    ? (r, d, kind, at) => {
        duelOutcome(foe, me, r, at);
        DUEL.net?.ch.send('res', { o: r, k: kind, at: at?.toArray().map(v => Math.round(v * 100) / 100) });
      }
    : (r, d, kind, at) => duelOutcome(foe, me, r, at);"""),
        ("  } else if (r === 'block') {\n    duelFloat", """  } else if (r === 'clash') {
    duelFloat('اصطدام النصال', 'blk');
    goreSparks(att, def, 24, at);
    DUEL.hitStop = 0.05;
    DS.block();
  } else if (r === 'block') {
    duelFloat"""),
        ("  if (r.o === 'parry') {", "  if (r.o === 'clash') {\n    me.stagger(0.38);\n    me.spend(8);\n  } else if (r.o === 'parry') {"),
        ("  if (DUEL.kc || !killer) return;", "  if (DUEL.kc || !killer || victim.forgeFall) return;"),
        ("""  const exec = N.asking.kind;
  N.asking = null;
  me.hp = 0;
  if (!duelFinisher(me, DUEL.foe, finPick(me, exec))) {
    me.start('dead');
    me.play('death', 0.1, 0, true);
    DS.death(me);
  }""", """  N.asking = null;
  me.hp = 0;
  forgeFall(me, DUEL.foe);"""),
        ("  DUEL.phaseT = DUEL.fin ? 6.2 : 3.5; // room for the killing-blow cinematic", "  DUEL.phaseT = DUEL.clock > 0 ? 2.5 : 1.8;"),
        ("  DUEL.slow = 1.1;", "  DUEL.slow = 0;"),
        ("  else duelMsg(meWon ? 'فزت بالجولة' : 'خسرت الجولة', DUEL.score[0] + ' - ' + DUEL.score[1], meWon ? 'win' : 'lose');",
         """  else {
    const fallen = meWon ? foe : me;
    const verdict = DUEL.clock <= 0 ? 'حُسمت بالوقت' : FORGE_ANATOMY_LABEL[fallen.forgeLastZone] || 'سقوط الخصم';
    duelMsg(meWon ? 'فزت بالجولة' : 'خسرت الجولة', verdict + ' · ' + DUEL.score[0] + ' - ' + DUEL.score[1], meWon ? 'win' : 'lose');
  }"""),
        ("  DUEL.round = n || DUEL.round + 1;", "  DUEL.round = n || DUEL.round + 1;\n  forgeClearControls();"),
    ])
    patch(out, "js/duel/duel-ai.js", [
        ("      d = Math.hypot(foe.x - me.x, foe.z - me.z);", """      d = Math.hypot(foe.x - me.x, foe.z - me.z);
    const gap = clamp(me.wp.hit[1] + .35, .88, 1.68);
    const inReach = d < gap + (me.wp.thrust && me.wpId !== 'spear' ? .08 : .18);"""),
        ("d < 2.2 &&", "inReach &&"),
        ("d < 2.3", "inReach"),
        ("d < DM.kick.reach - 0.1", "d < 1.02"),
        ("r < 0.75 && foe.t", "r < 0.75 && inReach && foe.t"),
        ("me.want.mz = d > 2.0 ? 1 : d < 1.4 ? -0.7 : 0;",
         """const exhausted = me.st < me.M.light.st * 1.2;
    me.want.mz = exhausted || d < gap - .13 ? -.62 : d > gap + .11 ? .91 : .08;"""),
    ])
    gore = out / "js/duel/duel-gore.js"
    code = gore.read_text()
    start = code.index("  // fighters bleeding:")
    end = code.index("  // wounds and stumps", start)
    gore.write_text(code[:start] + code[end:])
    code = gore.read_text()
    start = code.index("function goreDecide(")
    end = code.index("/* ---- per frame */", start)
    gore.write_text(code[:start] + """function goreDecide(d, kind, from) {
  const hit = d.forgeContact;
  if (!hit?.pos || S.forgeBlood === 'light' || kind !== 'heavy' ||
      !from?.wp.cut || hit.power < .88 || forgePenalty(d, hit.zone) < .69) return null;
  const part = GORE_PARTS[hit.zone];
  return part && !(d.cuts & part.bit) ? hit.zone : null;
}
""" + code[end:])
    patch(out, "js/duel/duel-gore.js", [
        ("function goreSparks(a, d, n) {", "function goreSparks(a, d, n, at) {"),
        ("const x = a.x + (d.x - a.x) * 0.55,\n    z = a.z + (d.z - a.z) * 0.55;", "const x = at?.x ?? a.x + (d.x - a.x) * .55,\n    z = at?.z ?? a.z + (d.z - a.z) * .55;"),
        ("y: 1.25 + rand(-0.1, 0.15),", "y: (at?.y ?? 1.25) + rand(-.04, .06),"),
        ("          f.start('dead');\n          f.play('death', 0.1, 0, true);\n          DS.death(f);",
         "          forgeFall(f, f.lastFrom);"),
        ("""    } else {
      j.bone.getWorldPosition(gV);
      dir = gV2.set(rand(-0.3, 0.3), -0.2, rand(-0.3, 0.3));
    }""", """    } else {
      if (j.point) j.bone.localToWorld(gV.copy(j.point));
      else j.bone.getWorldPosition(gV);
      dir = gV2.set(rand(-0.3, 0.3), -0.27, rand(-0.3, 0.3));
      if (j.normal) dir.addScaledVector(gV3.copy(j.normal).applyQuaternion(j.bone.getWorldQuaternion(gQ)), .32);
    }"""),
        ("    if (o.position.y < p.r) {\n      o.position.y = p.r;", """    const base = p.weapon ? p.r + Math.abs(gV.copy(gUp).applyQuaternion(o.quaternion).y) * p.half : p.r;
    if (o.position.y < base) {
      o.position.y = base;"""),
        ("        goreStain(o.position.x, o.position.z, 0.25 + Math.random() * 0.2, false);",
         "        if (!p.weapon) goreStain(o.position.x, o.position.z, 0.25 + Math.random() * 0.2, false);"),
        ("        goreStain(o.position.x, o.position.z, 0.7 + Math.random() * 0.3, true, 0.18);", """        if (p.weapon) {
          const aim = gV.copy(gUp).applyQuaternion(o.quaternion).setY(0).normalize();
          if (aim.lengthSq() > 0.5) o.quaternion.setFromUnitVectors(gUp, aim);
          o.position.y = p.r;
        } else goreStain(o.position.x, o.position.z, 0.7 + Math.random() * 0.3, true, 0.18);"""),
        ("const gV = new THREE.Vector3(),", "const gV = new THREE.Vector3(),\n  gV3 = new THREE.Vector3(),"),
        ("    if (!o.isSkinnedMesh) return;", "    if (!o.isSkinnedMesh || o.userData.forgeHiddenLegacy) return;"),
    ])
    patch(out, "js/duel/duel-ffa.js", [
        ("  G.state = 'duel';", "  G.state = 'duel';\n  DUEL.phase = 'load';\n  forgeClearControls();"),
        ("  X.round = n;", "  X.round = n;\n  forgeClearControls();"),
        ("  for (const f of ffaExtra || []) f.root.visible = false;", """  for (const f of ffaExtra || []) {
    f.root.visible = false;
    if (f.forgeShadow) f.forgeShadow.visible = false;
  }"""),
        ("  ffaTarget();\n  ffaStep(rdt);", "  ffaTarget();\n  duelRotTick(rdt);\n  ffaStep(rdt);"),
        ("for (const m of DUEL.me.fpHide) m.visible = !m.userData.cut;", "for (const m of DUEL.me.fpHide) m.visible = forgeFighterVisible(m);"),
        ("""  for (const f of X.all) {
    if (f.gone) continue;
    const foe = f === me ? DUEL.tgt || any : f.ai ? f.ai.foe || me : me;
    f.update(dt, foe === f ? any : foe);
  }""", """  const pairs = X.all.filter(f => !f.gone).map(f => {
    const foe = f === me ? DUEL.tgt || any : f.ai ? f.ai.foe || me : me;
    return [f, foe === f ? any : foe];
  });
  forgeAdvance(pairs, dt);"""),
        ("    ffaExtra = [new Duelist(a, FFA_HUES[2], 104), new Duelist(b, FFA_HUES[3], 124)];",
         "    ffaExtra = [new Duelist(a, FFA_HUES[2], 104), new Duelist(b, FFA_HUES[3], 124)];\n    ffaExtra.forEach((fighter, i) => forgeDress(fighter, i + 2));"),
    ])
    patch(out, "js/duel/duel-arena.js", [
        ("  s.background = new THREE.Color(0x0a0708);", "  s.background = new THREE.Color(0x110d16);"),
        ("new THREE.Fog(0x120a0e, 22, 70)", "new THREE.Fog(0x20141c, 16, 56)"),
        ("map: arenaFloorTex(), roughness: 0.88", "...forgeFloorMaterial()"),
        ("  s.add(key);", "  s.add(key);\n  forgeLight(s);"),
        ("  key.shadow.bias = -0.0008;", "  key.shadow.bias = -0.0004;\n  key.shadow.normalBias = .035;\n  key.shadow.radius = 2.5;"),
    ])
    html = (out / "index.html").read_text()
    html = replace(html, "<title>ساحة الرماد</title>", "<title>حلبة النغالة | ساحة الرماد</title>")
    html = html.replace("?v=202611180848", "?v=202611180848&preview=41")
    # Reuse the vetted Three.js assets and keep the preview independent of CDN rendering.
    vendors = "\n".join(f'<script src="vendor/{p.name}"></script>' for p in sorted((out / "vendor").glob("*.js")))
    html = re.sub(r'<script src="https://[^"]+"></script>', '', html)
    html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex,nofollow">\n'
        '<meta http-equiv="Content-Security-Policy" content="connect-src \'self\' data: blob: wss://bvxfzcndquirqmpyhtpj.supabase.co https://bvxfzcndquirqmpyhtpj.supabase.co">\n'
        '<link rel="stylesheet" href="style.css?v=41">', 1)
    html = replace(html, '<script src="js/core/config.js', vendors + '\n<script src="js/core/config.js')
    html = replace(html, '<script src="js/main.js', '\n'.join(f'<script src="{n}.js?v=41"></script>' for n in ['combat','injury','art','gear','network','menu']) + '\n<script src="js/main.js')
    (out / "index.html").write_text(html)

def mobile_file(out, target):
    """One file for practicing on a phone with no archive or local web server."""
    html = (out / "index.html").read_text()
    files = [out / "assets/models/duelist.glb", *sorted((out / "assets/audio/duel").rglob("*.mp3")), *sorted((out / "assets/iron-duel").glob("*.glb")), *sorted((out / "assets/iron-duel").glob("*.webp"))]
    assets = {p.relative_to(out).as_posix(): base64.b64encode(p.read_bytes()).decode() for p in files}
    boot = """window.IRON_STANDALONE = true;
const ironAssets = new Map(Object.entries(%s));
window.ironPicture = id => {
  const asset = ironAssets.get('assets/iron-duel/' + id + '.webp');
  return asset ? 'data:image/webp;base64,' + asset : null;
};
const ironFetch = window.fetch.bind(window);
window.fetch = (request, init) => {
  const name = new URL(typeof request === 'string' ? request : (request.url || request.href), location.href).pathname;
  const at = name.lastIndexOf('/assets/');
  const bytes = at >= 0 && ironAssets.get(name.slice(at + 1));
  if (bytes) return Promise.resolve(new Response(Uint8Array.from(atob(bytes), c => c.charCodeAt(0))));
  return ironFetch(request, init);
};
""" % json.dumps(assets, separators=(",", ":"))
    html = html.replace("<head>", "<head>\n<script>" + boot + "</script>", 1)

    def script(match):
        name = match.group(1).split("?")[0]
        code = (out / name).read_text()
        code = code.replace("document.currentScript.src", f"new URL({json.dumps(name)}, location.href).href")
        code = code.replace("const script = document.currentScript;", f"const script = {{src: new URL({json.dumps(name)}, location.href).href}};")
        return "<script>\n" + re.sub(r"</script", lambda m: "<" + chr(92) + "/script", code, flags=re.I) + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    html = re.sub(r'<link rel="stylesheet" href="((?:css/|style\.css)[^"]*)"(?:\s*/)?\s*>',
         lambda match: "<style>\n" + (out / match.group(1).split("?")[0]).read_text() + "\n</style>", html)
    target.write_text(html)

if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("output", type=Path)
    cli.add_argument("--mobile-file", type=Path)
    args = cli.parse_args()
    out = args.output.resolve()
    build(out)
    if args.mobile_file:
        mobile_file(out, args.mobile_file)
