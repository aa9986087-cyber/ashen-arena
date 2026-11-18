"""Preview-only integration for the campaign bosses' special attacks."""
import re
def apply(path, text, replace):
    def sub(before, after):
        nonlocal text
        text = replace(text, before, after, 'boss-specials:' + path)

    if path == 'js/game/enemy-ai.js':
        sub('    if (e.boss) {', '    if (e.boss && updateBossSpecial(e, p, dt)) continue;\n    if (e.boss) {')
        sub('e.ult <= 0 && d < 34', 'e.ult <= 0 && d < 34 && !bossSpecialActive()')
        text = apply_campaign_pacing(text, replace, path)
    if path == 'js/game/boss-ults.js':
        sub('  e.stT = 1;\n  e.lx = p.x;', '  e.stT = e.previewCadence ? 1.42 : 1;\n  e.lx = p.x;')
        sub('  zone(p.x, p.z, 5, 1, e.dmg * 1.5, false);',
            '  zone(p.x, p.z, e.previewCadence ? 4 : 5, e.stT, e.dmg * 1.5, false);')
    if path == 'js/game/spawning.js':
        sub('  G.bossOn = true;', '  strengthenPreviewBoss(e);\n  G.bossOn = true;')
    if path == 'js/audio/sound.js':
        sub('  rocket: a => {', '''  warhorn: a => {
    a.str(115, 0.49, 0.12, 0, a.sg, 710);
    a.tone(115, 0.36, 'triangle', 0.071, 105);
    a.tone(227, 0.27, 'triangle', 0.04, 207);
    a.noise(0.18, 0.027, 410, 0, null, 'bandpass');
  },
  rocket: a => {''')
    if path == 'js/game/fx.js':
        sub('function banner(h, sub, dur) {',
            "function banner(h, sub, dur, bossMove = false) {\n  $('banner').classList.toggle('boss-move', bossMove);")
    if path == 'js/game/update.js':
        sub('    z.l += dt;', '''    if (z.bossCast) {
      if (z.bossCast.owner.dead) { z.done = true; continue; }
      z.l = z.bossCast.elapsed;
    } else z.l += dt;''')
        sub("""        ring(z.x, z.z, 0.3, z.r, 0.3, [1, 0.3, 0.2]);
        parts(z.x, 0.6, z.z, 14, 1, 0.4, 0.2, 9, 0.3);
        AU.play('boom');
        shake(0.3);""", """        if (z.bossCast) bossSpecialImpact(z);
        else {
          ring(z.x, z.z, 0.3, z.r, 0.3, [1, 0.3, 0.2]);
          parts(z.x, 0.6, z.z, 14, 1, 0.4, 0.2, 9, 0.3);
          AU.play('boom');
          shake(0.3);
        }""")
        sub('if (!p.dead && (z.x - p.x) ** 2 + (z.z - p.z) ** 2 < z.r * z.r) hurt(z.dmg);',
            '''if (!p.dead && (z.bossGround ? bossSpecialContains(z, p.x, p.z) :
          (z.x - p.x) ** 2 + (z.z - p.z) ** 2 < z.r * z.r) &&
          (!z.bossCast || (!z.bossCast.hitPlayer && p.inv <= 0))) {
          if (z.bossCast) z.bossCast.hitPlayer = true;
          hurt(z.dmg);
        }''')
    if path == 'js/render/renderer.js':
        sub('  // enemies\n', "  drawBossSpecialImpacts(['play', 'cards', 'paused', 'count'].includes(G.state));\n  // enemies\n")
        sub('      b.scale.set(s, s, s);', '      b.scale.set(s, s, s);\n      poseBossSpecial(b, e);')
        sub("    b.visible = !!q && q.kind !== 'sky';",
            "    const shell = q?.bossGround?.form === 'shell';\n"
            "    b.visible = !!q && q.kind !== 'sky' && (q.kind !== 'boss-special' || (shell && q.d - q.l <= BOSS_SHELL_FLIGHT));")
        sub('      bossAura.visible = true;', '      bossAura.visible = !e.bossSpecial;')
        sub('      const k = q.l / q.d;\n      m.position.set(q.x, 0.1, q.z);\n      m.scale.set(q.r, q.r, 1);',
            '      const k = clamp(q.l / q.d, 0, 1);\n      drawBossWarning(m, q, k);')
        sub('      m.material.opacity = 0.18 + 0.4 * k;', '      b.geometry = shell ? bossShellGeometry : SPH;')
        sub('      const y = (1 - k) * 26 + 1,',
            '      const flight = shell ? clamp(1 - (q.d - q.l) / BOSS_SHELL_FLIGHT, 0, 1) : k;\n      const y = (1 - flight) * 26 + 1,')
        sub('b.position.set(q.x + (1 - k) * 6, y, q.z - (1 - k) * 4);',
            'b.position.set(q.x + (1 - flight) * 6, y, q.z - (1 - flight) * 4);')
    return text


def apply_guardian(text, replace):
    text = replace(text, "    hurt: ['hurt'", "    special: ['rootslam'],\n    hurt: ['hurt'", 'boss-specials:clip role')
    animate = "    animate(a, s, moving ? (e.st === 2 ? 'run' : 'walk') : 'idle', e.frz > 0 ? 0 : dt, Math.max(0.08, e.stT || 0.5), 0);"
    return replace(text, animate, '''    const special = e.bossSpecial && a.actions.special;
    if (special) {
      if (a.role !== 'special') {
        a.mixer.stopAllAction();
        a.current = null;
        change(a, 'special');
      }
      // A terrain warning and the skeletal slam share the same simulation clock.
      special.time = Math.min(bossSpecialPoseTime(e), special.getClip().duration - 0.001);
      a.mixer.update(0);
    } else {
      if (a.role === 'special') {
        a.current.stop();
        a.current = a.role = null;
      }
      animate(a, s, moving ? (e.st === 2 ? 'run' : 'walk') : 'idle', e.frz > 0 ? 0 : dt, Math.max(0.08, e.stT || 0.5), 0);
      poseBossSpecial(a.g, e);
    }''', 'boss-specials:guardian')


def apply_grave_model(text, replace):
    return replace(text, '  graveBossModel.rotation.y = e.face;',
                   '''  graveBossModel.rotation.set(0, e.face, 0);
  poseBossSpecial(graveBossModel, e);
  if (e.bossSpecial) {
    const progress = e.bossSpecial.elapsed / BOSS_SPECIALS[e.kind].wind;
    graveBossModel.userData.arm.rotation.x = -2.15 * Math.sin(Math.PI * clamp(progress, 0, 1));
    return true;
  }''', 'boss-specials:gravekeeper')


def apply_campaign_actors(text, replace):
    def sub(before, after):
        nonlocal text
        text = replace(text, before, after, 'campaign boss actors')

    sub('  return out;\n})();', '  return Object.assign(out, CAMPAIGN_BOSS_MODELS);\n})();')
    sub('function actorEnabled(key) {', '''function bossActorKey(kind) {
  if (kind === 0) return 'guardian';
  const key = 'boss' + kind;
  return Number.isInteger(kind) && Object.hasOwn(CAMPAIGN_BOSS_MODELS, key) ? key : null;
}
function actorEnabled(key) {
  if (Object.hasOwn(CAMPAIGN_BOSS_MODELS, key)) return true;''')
    sub("    const key = e && e.kind === 0 ? 'guardian' : null;",
        "    const key = e && bossActorKey(e.kind);")
    sub("    a.g.visible = true; a.g.position.set(e.x, (e.y || 0) + cfg.groundOffset, e.z);",
        """    a.g.visible = true; a.g.position.set(e.x, (e.y || 0) + cfg.groundOffset, e.z);
    if (key === 'boss1') {
      a.g.position.y += 0.55;
      if (!cine && dt > 0 && e.frz <= 0 && Math.floor(e.t * 18) !== Math.floor((e.t - dt) * 18)) {
        vfxP({ smoke: 1, x: e.x, y: 0.24, z: e.z, s: 1.4, s1: 3, life: 0.68,
          r: 0.70, g: 0.39, b: 0.12, a: 0.68,
          orbit: { cx: e.x, cz: e.z, ang: e.t * 8, rad: 0.8, w: 7, rise: 0.6, grow: 2.7 } });
      }
    }""")
    sub('  function destroyBoss() {', '  function destroyBoss(keepKey) {')
    sub('if (!bossRig || bossEntity !== e) { destroyBoss(); bossRig = makeRig(key); bossEntity = e; }',
        'if (!bossRig || bossEntity !== e) { destroyBoss(key); bossRig = makeRig(key); bossEntity = e; }')
    sub('G.boss !== bossEntity)) destroyBoss();', 'G.boss !== bossEntity)) destroyBoss(bossActorKey(G?.boss?.kind));')
    sub('    bossRig = bossEntity = tail = null;', '''    const { key, asset } = bossRig;
    bossRig = bossEntity = tail = null;
    if (key !== keepKey && Object.hasOwn(CAMPAIGN_BOSS_MODELS, key)) {
      delete assets[key];
      disposeResources(resources(asset.root), sharedResources(null));
    }''')
    sub("""function loadBossActor(kind) {
  if (kind === 0 && actorEnabled('guardian')) return ACTOR_MODELS.load(['guardian']);
  return Promise.resolve([]);
}""", """function loadBossActor(kind) {
  const key = bossActorKey(kind);
  return key && actorEnabled(key) ? ACTOR_MODELS.load([key]) : Promise.resolve([]);
}""")
    return text


def apply_campaign_intro(text, replace):
    def sub(before, after):
        nonlocal text
        text = replace(text, before, after, 'campaign boss intro')
    sub("  if (ASHEN_ADDONS.enabled('forest-guardian')) loadBossActor(0);",
        '  loadBossActor(STAGES[G.stage]?.bk);')
    sub("  if (!ASHEN_ADDONS.enabled('forest-guardian') || e?.kind !== 0 || COOP.on || DUEL.on)",
        '  const key = bossActorKey(e?.kind);\n  if (!key || !actorEnabled(key) || COOP.on || DUEL.on)')
    sub('  if (ACTOR_MODELS.diagnostics().guardian) return addonBaseBossIntro(e);',
        '  if (ACTOR_MODELS.diagnostics()[key]) return addonBaseBossIntro(e);')
    sub('Promise.resolve(loadBossActor(0))', 'Promise.resolve(loadBossActor(e.kind))')
    return text


def apply_campaign_grave(text, replace):
    return replace(text, '  if (!graveBossModel) { graveBossModel = gravekeeperModel(); scene.add(graveBossModel); }',
                   '''  if (graveBaseActorBossRender(e, now)) {
    if (graveBossModel) graveBossModel.visible = false;
    return true;
  }
  if (!graveBossModel) { graveBossModel = gravekeeperModel(); scene.add(graveBossModel); }''',
                   'campaign boss grave visual')


def apply_campaign_pacing(text, replace, path):
    start = text.index('    if (e.boss) {')
    end = text.index("    } else if (e.type === 'grunt'", start)
    block = text[start:end]

    def sub(before, after):
        nonlocal block
        block = replace(block, before, after, 'boss pacing:' + path)

    sub('e.hp < e.maxHp * 0.5 ? 1.45 : 1', 'e.hp < e.maxHp * 0.5 ? (e.previewCadence ? 1.16 : 1.45) : 1')
    sub('e.a4 <= 0 && e.st === 0 && d < 32', 'e.a4 <= 0 && e.st === 0 && d < 32 && (!e.previewCadence || d > 5.4)')
    sub('e.a4 = 2.6;', 'e.a4 = e.previewCadence ? 4.3 : 2.6;')
    sub('aa, 1, 0.13, 15,', 'aa, 1, 0.13, e.previewCadence ? 10 : 15,')
    sub('          e.stT = 0.85;', '          e.stT = e.previewCadence ? 0.57 : 0.85;')
    sub('        spd = 18;', '        spd = e.previewCadence ? 14 : 18;')
    sub('        e.stT -= dt;\n        e.flash = 0.05;', '        if (e.previewCadence) e.face = Math.atan2(e.cx, e.cz);\n        e.stT -= dt;\n        e.flash = 0.05;')
    sub('        mx = e.cx;\n        mz = e.cz;', '        mx = e.cx;\n        mz = e.cz;\n        if (e.previewCadence) e.face = Math.atan2(mx, mz);')
    sub('Math.sin(Math.max(0, e.stT) * Math.PI) * 9', 'Math.sin(Math.max(0, e.stT) / (e.previewCadence ? 1.42 : 1) * Math.PI) * (e.previewCadence ? 6 : 9)')
    sub('e.stT = 0.75;', 'e.stT = e.previewCadence ? 1.1 : 0.75;')
    sub('e.stT = 0.7;', 'e.stT = e.previewCadence ? 1.07 : 0.7;')
    sub("spawnPack('fast', 5,", "spawnPack('fast', e.previewCadence ? 2 : 5,")
    sub("spawnPack('wolf', 4,", "spawnPack('wolf', e.previewCadence ? 2 : 4,")
    sub("spawnPack('bomber', 3,", "spawnPack('bomber', e.previewCadence ? 2 : 3,")
    sub("spawnPack('shield', 4,", "spawnPack('shield', e.previewCadence ? 2 : 4,")
    sub('14, 7.5, e.dmg * 0.6, e.t', '(e.previewCadence ? 10 : 14), 7.5, e.dmg * 0.6, e.t')
    sub('e.spiral = 2.2;', 'e.spiral = e.previewCadence ? 1.3 : 2.2;')
    sub('e.spiral = 2.4;', 'e.spiral = e.previewCadence ? 1.3 : 2.4;')
    for interval in ('0.06', '0.07'):
        sub(f'          while (e.spAcc > {interval}) {{\n            e.spAcc -= {interval};',
            f'          const interval = e.previewCadence ? 0.135 : {interval};\n'
            '          while (e.spAcc > interval) {\n            e.spAcc -= interval;')
    sub('16, 5.5, e.dmg', '(e.previewCadence ? 11 : 16), 5.5, e.dmg')
    sub('16, 7, e.dmg', '(e.previewCadence ? 11 : 16), 7, e.dmg')
    sub('2.7, 0.7 + j * 0.16,', '2.7, (e.previewCadence ? 1.0 : 0.7) + j * 0.16,')
    sub('zoneBarrage(p.x, p.z, 3, 5, 3.4, 1, 0.2,',
        'zoneBarrage(p.x, p.z, e.previewCadence ? 2 : 3, 5, 3.4, e.previewCadence ? 1.35 : 1, 0.2,')
    sub('zoneBarrage(p.x, p.z, 4, 6, 3.2, 1.05, 0.16,',
        'zoneBarrage(p.x, p.z, e.previewCadence ? 3 : 4, 6, 3.2, e.previewCadence ? 1.42 : 1.05, 0.16,')
    sub('e.burst = 3;', 'e.burst = e.previewCadence ? 2 : 3;')
    sub('e.spAcc = 0.28;', 'e.spAcc = e.previewCadence ? 0.43 : 0.28;')
    sub('Math.atan2(dz, dx), 3, 0.15, 11,',
        'Math.atan2(dz, dx), e.previewCadence ? 2 : 3, 0.15, e.previewCadence ? 9.5 : 11,')
    block, count = re.subn(r'if \(e\.a([1-4]) <= 0([^\n]*)\) \{',
                          lambda m: f'if (e.a{m[1]} <= 0{m[2]} && campaignBossAttack(e, {m[1]})) {{', block)
    if count != 16:
        raise RuntimeError(f'Boss cooldown anchors changed: {count}')
    block += '      if (campaignBossResting(e)) spd = 0;\n'
    text = text[:start] + block + text[end:]
    text = replace(text, 'G.contactCd <= 0 && !(e.boss && e.st === 3)',
        'G.contactCd <= 0 && !(e.boss && (e.st === 3 || campaignBossResting(e) || (e.previewCadence && e.st === 1)))', path)
    text = replace(text, "      hurt(e.dmg);\n      if (G.ups.thorns",
        "      hurt(e.dmg * (e.previewCadence ? .58 : 1));\n      if (G.ups.thorns", path)
    # The Gravebound source patch also updates contact-damage attribution.
    return text


def apply_grave_pacing(text, replace):
    def sub(before, after):
        nonlocal text
        text = replace(text, before, after, 'grave boss pacing')
    sub('  if (e.graveDig <= 0) {', '  if (e.graveDig <= 0 && campaignBossAttack(e, 1)) {')
    sub('  if (e.graveSlam <= 0) {', '  if (e.graveSlam <= 0 && campaignBossAttack(e, 2)) {')
    sub('    e.graveSwingUntil = G.t + 1;', '    const wind = e.previewCadence ? 1.28 : 1;\n    e.graveSwingUntil = G.t + wind;')
    sub('    zone(p.x, p.z, 2.8, 1,', '    zone(p.x, p.z, 2.8, wind,')
    sub('  if (!(e.graveSwingUntil > G.t) && d > 3.4) {',
        '  if (!(e.graveSwingUntil > G.t) && !campaignBossResting(e) && d > 3.4) {')
    sub('  if (d < e.r + p.r && e.hitCd <= 0)', '  if (d < e.r + p.r && e.hitCd <= 0 && !campaignBossResting(e))')
    return text
