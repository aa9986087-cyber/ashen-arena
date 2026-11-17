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
    if path == 'js/render/renderer.js':
        sub('  // enemies\n', "  drawBossSpecialImpacts(['play', 'cards', 'paused', 'count'].includes(G.state));\n  // enemies\n")
        sub('      b.scale.set(s, s, s);', '      b.scale.set(s, s, s);\n      poseBossSpecial(b, e);')
        sub("    b.visible = !!q && q.kind !== 'sky';",
            "    b.visible = !!q && q.kind !== 'sky' && (q.kind !== 'boss-special' || q.sty === 4);")
        sub('      const k = q.l / q.d;\n      m.position.set(q.x, 0.1, q.z);',
            '      const k = clamp(q.l / q.d, 0, 1);\n      m.position.set(q.x, 0.1, q.z);')
        sub('      m.material.opacity = 0.18 + 0.4 * k;',
            "      m.material.opacity = q.kind === 'boss-special' ? 0.23 + 0.43 * k : 0.18 + 0.4 * k;")
    return text


def apply_guardian(text, replace):
    # The forest addon remains independent; the optional pose is attached only in the built preview.
    return replace(text, '    // Preserve original aura/bar in renderer/HUD;',
                   '    poseBossSpecial(a.g, e);\n    // Preserve original aura/bar in renderer/HUD;', 'boss-specials:guardian')


def apply_grave_model(text, replace):
    return replace(text, '  graveBossModel.rotation.y = e.face;',
                   '''  graveBossModel.rotation.set(0, e.face, 0);
  poseBossSpecial(graveBossModel, e);
  if (e.bossSpecial) {
    const progress = e.bossSpecial.elapsed / BOSS_SPECIALS[e.kind].wind;
    graveBossModel.userData.arm.rotation.x = -2.15 * Math.sin(Math.PI * clamp(progress, 0, 1));
    return true;
  }''', 'boss-specials:gravekeeper')
