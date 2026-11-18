"""Preview-only integration for the campaign bosses' special attacks."""
def apply(path, text, replace):
    def sub(before, after):
        nonlocal text
        text = replace(text, before, after, 'boss-specials:' + path)

    if path == 'js/game/enemy-ai.js':
        sub('    if (e.boss) {', '    if (e.boss && updateBossSpecial(e, p, dt)) continue;\n    if (e.boss) {')
        sub('e.ult <= 0 && d < 34', 'e.ult <= 0 && d < 34 && !bossSpecialActive()')
    if path == 'js/game/spawning.js':
        sub('  G.bossOn = true;', '  strengthenPreviewBoss(e);\n  G.bossOn = true;')
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
            'if (!p.dead && (z.bossGround ? bossSpecialContains(z, p.x, p.z) : (z.x - p.x) ** 2 + (z.z - p.z) ** 2 < z.r * z.r)) hurt(z.dmg);')
    if path == 'js/render/renderer.js':
        sub('  // enemies\n', "  drawBossSpecialImpacts(['play', 'cards', 'paused', 'count'].includes(G.state));\n  // enemies\n")
        sub('      b.scale.set(s, s, s);', '      b.scale.set(s, s, s);\n      poseBossSpecial(b, e);')
        sub("    b.visible = !!q && q.kind !== 'sky';",
            "    b.visible = !!q && q.kind !== 'sky' && (q.kind !== 'boss-special' || q.sty === 4);")
        sub('      bossAura.visible = true;', '      bossAura.visible = !e.bossSpecial;')
        sub('      const k = q.l / q.d;\n      m.position.set(q.x, 0.1, q.z);\n      m.scale.set(q.r, q.r, 1);',
            '      const k = clamp(q.l / q.d, 0, 1);\n      drawBossWarning(m, q, k);')
        sub('      m.material.opacity = 0.18 + 0.4 * k;', '      b.geometry = q.bossGround?.form === "shell" ? bossShellGeometry : SPH;')
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
      special.time = Math.min(e.bossSpecial.elapsed, special.getClip().duration - 0.001);
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
