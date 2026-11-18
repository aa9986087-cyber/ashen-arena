"""Small source hooks for the independent Gravebound preview expansion."""
def apply(path, text, replace):
    def sub(before, after):
        nonlocal text
        text = replace(text, before, after, 'gravebound:' + path)
    if path == 'js/game/enemy-ai.js':
        if 'hurt(e.dmg * (e.previewCadence ? .58 : 1));' in text:
            sub('hurt(e.dmg * (e.previewCadence ? .58 : 1));', 'hurt(e.dmg * (e.previewCadence ? .58 : 1), e);')
        else:
            sub('hurt(e.dmg);','hurt(e.dmg, e);')
        sub('    if (e.boss) {\n', '    if (e.boss && e.kind === 6) { graveBossAI(e, p, dt); continue; }\n    if (e.boss) {\n')
    if path == 'js/game/progression.js':
        sub('else if (G.stage >= 5)', 'else if (G.stage >= STAGES.findIndex(s => s.abyss) - 1)')
    if path == 'js/game/spawning.js':
        sub('G.abyss ? 36 + G.depth * 6', 'G.abyss ? (STAGES.length - 1) * 6 + G.depth * 6')
    if path == 'js/game/run.js':
        sub('        char: S.char,', '        char: S.char,\n        grave: graveSaveRun(),')
        sub('    stage: o.stage | 0,', '    stage: o.abyss ? STAGES.length - 1 : o.stage | 0,')
        sub('  G.need = xpNeed(G.lvl);', '  graveRestoreRun(o.grave);\n  G.need = xpNeed(G.lvl);')
    if path == 'js/game/update.js':
        sub('hurt(s.dmg);','hurt(s.dmg, s);')
        sub('hurt(z.dmg);','hurt(z.dmg, z);')
        sub('  else if (tgt) fa = Math.atan2(tgt.x - p.x, tgt.z - p.z);',
            "  else if (S.char === 'reaper' && p.dashT > 0) fa = Math.atan2(p.dx, p.dz);\n"
            "  else if (S.char === 'reaper' && p.moving) fa = Math.atan2(mx, mz);\n"
            "  else if (tgt) fa = Math.atan2(tgt.x - p.x, tgt.z - p.z);")
    if path == 'js/game/specials.js':
        sub("  shake(0.7);\n  sp.f", "  if (S.char !== 'reaper') shake(0.7);\n  sp.f")
    if path == 'js/game/combat.js':
        sub('function hurt(d) {','function hurt(d, source) {')
        sub('  p.shieldRe = 5;', '  d = graveAbsorb(d, source);\n  if (d <= 0) { p.inv = 0.2; return; }\n  p.shieldRe = 5;')
    if path == 'js/ui/profile.js':
        sub("if ((s.mb | 0) >= 6) return 'أنهى المراحل الست'", "if ((s.mb | 0) >= STAGES.length - 1) return 'أنهى المراحل السبع'")
        sub('const i = Math.min(5, s.mb | 0);', 'const i = Math.min(STAGES.length - 2, s.mb | 0);')
    if path == 'js/ui/backup.js':
        sub("const BACKUP_SALT = '#vamos-save';", "const BACKUP_SALT = '#vamos-modular-test-save';")
        sub("return 'AS1-'", "return 'AT1-'")
        sub('/AS1-(', '/AT1-(')
    return text
