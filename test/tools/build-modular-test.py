#!/usr/bin/env python3
"""Build a NEW isolated test from a pinned production tree plus independent optional addons.
Never writes root production files or historical test/js, test/css, test/assets, test/releases.
Usage: python3 test/tools/build-modular-test.py
Change modular-config.json release before a later delivery to invalidate mobile caches.
"""
from pathlib import Path
import hashlib, json, re, shutil, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]
TEST = ROOT / 'test'
CFG = json.loads((TEST / 'modular-config.json').read_text())
RELEASE = CFG['release']
if not re.fullmatch(r'clean-[a-zA-Z0-9-]+', RELEASE):
    raise SystemExit('Invalid release id')
REV = subprocess.check_output(['git', 'rev-parse', CFG['baseRevision']], cwd=ROOT, text=True).strip()
OUT = TEST / 'releases' / RELEASE
if OUT.exists():
    raise SystemExit('Release already exists; choose a NEW release id in modular-config.json: ' + RELEASE)
OUT.mkdir(parents=True)
SCRIPT = re.compile(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*</script>', re.S | re.I)

def git_text(path):
    return subprocess.check_output(['git', 'show', f'{REV}:{path}'], cwd=ROOT).decode()

def replace_once(text, before, after, name):
    if text.count(before) != 1:
        raise RuntimeError(f'Integration anchor changed: {name}: {text.count(before)} matches')
    return text.replace(before, after, 1)

def patch(path, text):
    # Preview isolation, not game balance or artwork changes.
    if path == 'js/core/save.js':
        text = text.replace("const SAVE_KEY = 'ashen_arena_v1';", "const SAVE_KEY = 'ashen_arena_modular_test_v1';")
    if path == 'js/game/run.js':
        text = text.replace("const RUN_KEY = 'ashen_arena_run';", "const RUN_KEY = 'ashen_arena_modular_test_run_v1';")
    if path == 'js/duel/duel-net.js':
        text = replace_once(text, "const NET_LOCAL = /netlocal/.test(location.hash);", 'const NET_LOCAL = true;', path)
    if path == 'js/main.js':
        text = replace_once(text, 'function frame(now) {',
            "function frame(now) {\n  resumeAddonBossIntro();\n  if (G.state !== 'play' || G.p.dead || G.cardsOpen || CINE.on || CINE.pending) ASHEN_ADDONS.clearMelee();", path)
    if path == 'js/render/player-model.js':
        text = replace_once(text, 'function buildRig(R, charId, wep) {\n  if (R.g) scene.remove(R.g);',
            "function buildRig(R, charId, wep) {\n  if (typeof buildActorRig === 'function' && buildActorRig(R, charId, wep)) return;\n  if (typeof actorReleaseRig === 'function') actorReleaseRig(R);\n  else if (R.g) scene.remove(R.g);", path)
        text = replace_once(text, 'function buildWeapon(R = PM, wep) {\n  const w = R.wp;',
            "function buildWeapon(R = PM, wep) {\n  if (typeof actorWeaponWillRebuild === 'function') actorWeaponWillRebuild(R);\n  const w = R.wp;", path)
        text = replace_once(text, '  const model = weaponModel(id, t, ev, tc);',
            "  if (ASHEN_ADDONS.weapon(R, id, t, ev, tc, em, s)) return;\n  const model = weaponModel(id, t, ev, tc);", path)
    if path == 'js/render/renderer.js':
        text = replace_once(text, 'function poseRig(R, p, wepId, playing, now) {',
            "function poseRig(R, p, wepId, playing, now) {\n  if (typeof actorRigPose === 'function' && actorRigPose(R, p, wepId, playing, now)) return;", path)
        text = replace_once(text, '  // enemies\n', "  // enemies\n  if (typeof actorBossFrame === 'function') actorBossFrame(now);\n", path)
        text = replace_once(text, "      const A = ANIM['boss' + e.kind];",
            "      if (CINE.pending && G.boss === e) { b.visible = false; continue; }\n      const actorBody = typeof actorBossRender === 'function' && actorBossRender(e, now);\n      b.visible = !actorBody;\n      if (!actorBody) {\n      const A = ANIM['boss' + e.kind];", path)
        text = replace_once(text, '      const c = BOSS_ULTS[e.kind].col,', '      }\n      const c = BOSS_ULTS[e.kind].col,', path)
    if path == 'js/game/update.js':
        text = replace_once(text, 'function update(dt) {', 'function update(dt) {\n  if (CINE.pending) return;', path)
        text = replace_once(text, '  G.t += dt;', "  G.t += dt;\n  ASHEN_ADDONS.updateMelee();", path)
        text = replace_once(text, '  p.face += wrapAng(fa - p.face)',
            '  if (PM.actor && p.moving) fa = Math.atan2(mx, mz);\n  p.face += wrapAng(fa - p.face)', path)
    if path == 'js/game/combat.js':
        # Queue only the original melee block; range/arc/damage math remains exactly the production math.
        begin = text.index('  if (d.melee) {', text.index('function fire(w, ang)'))
        end = text.index('  } else if (d.chain) {', begin)
        original = text[begin + len('  if (d.melee) {'):end]
        text = text[:begin] + '  if (d.melee) {\n    ASHEN_ADDONS.queueMelee(() => {\n      AU.play(w.id);' + original + '\n    });\n' + text[end:]
        text = replace_once(text, '  p.swing = 1;\n  AU.play(w.id);',
            "  p.swing = 1;\n  p.swingT = (p.swingT || 0) + 1;\n  if (typeof actorNotify === 'function') actorNotify(p, 'attack');\n  if (!d.melee) AU.play(w.id);", path)
    return text

html = git_text('index.html')
source_paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', REV, 'js', 'css', 'assets'], cwd=ROOT, text=True).splitlines()
source_hashes = {}
for path in source_paths:
    payload = subprocess.check_output(['git', 'show', f'{REV}:{path}'], cwd=ROOT)
    source_hashes[path] = hashlib.sha256(payload).hexdigest()
    target = OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if path.startswith('js/'):
        target.write_text(patch(path, payload.decode()))
    elif path.endswith('.css'):
        target.write_bytes(payload.rstrip(b'\n') + b'\n')
    else:
        target.write_bytes(payload)
source_hashes['index.html'] = hashlib.sha256(html.encode()).hexdigest()

# Pin the same eight Three.js vendor sources already cached in the repository.
vendors = sorted((TEST / 'assets' / 'vendor').glob('*.js'))
if len(vendors) != 8: raise RuntimeError('Expected eight saved vendor scripts')
(OUT / 'vendor.js').write_text('\n;\n'.join(v.read_text() for v in vendors))
registry = (TEST / 'tools' / 'modular-runtime' / 'registry.js').read_text()
preamble = 'window.ASHEN_TEST_RELEASE = ' + json.dumps({**CFG, 'baseRevision': REV}, ensure_ascii=False) + ';\n' + registry
addons = ['knight', 'ranger', 'forest-guardian']
config_code = []
for addon in addons:
    for filename in ['melee.js', 'bow-weapon.js']:
        f = TEST / 'addons' / addon / filename
        if f.exists(): config_code.append(f.read_text())
    code = (TEST / 'addons' / addon / 'config.js').read_text()
    # Preserve standalone configs and adapt only the generated bundle to its release directory.
    for asset in ['model.glb', 'portrait.jpg']:
        code = code.replace("new URL('./" + asset + "', script.src)", "new URL('../../addons/" + addon + "/" + asset + "', script.src)")
    config_code.append(code)
extra = '\n;\n'.join(config_code)
extra += '\n;\n' + (TEST / 'addons' / 'shared' / 'actor-runtime.js').read_text()
extra += '\n;\n' + (TEST / 'tools' / 'modular-runtime' / 'hooks.js').read_text()
parts = [preamble]
for match in SCRIPT.finditer(html):
    src = match.group(1).split('?', 1)[0]
    if src.startswith(('http:', 'https:')): continue
    if not src.startswith('js/'): raise RuntimeError('Unexpected script: ' + src)
    if src == 'js/main.js': parts.append(extra)
    parts.append('\n/* ' + src + ' */\n' + (OUT / src).read_text() + '\n;\n')
(OUT / 'app.js').write_text('\n'.join(parts))
# minify without top-level mangling: all inline event/global references remain callable.
subprocess.run(['npx', '--yes', 'terser@5', str(OUT / 'app.js'), '--compress', 'passes=2', '--mangle', '--keep-fnames', '--comments', 'false', '--output', str(OUT / 'app.min.js')], cwd=ROOT, check=True)
html = SCRIPT.sub('', html)
html = html.replace('<head>', '<head>\n    <meta name="robots" content="noindex, nofollow">\n    <meta http-equiv="Content-Security-Policy" content="connect-src \'self\' data: blob:">', 1)
html = re.sub(r'href="(css/[^"?]+)(?:\?[^\"]*)?"', lambda m: f'href="{m.group(1)}?v={RELEASE}"', html)
html = html.replace('</body>', f'    <script src="vendor.js?v={RELEASE}"></script>\n    <script src="app.min.js?v={RELEASE}"></script>\n  </body>')
html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
(OUT / 'index.html').write_text(html)
manifest = {**CFG, 'baseRevision': REV, 'baseHashes': source_hashes, 'sourceKind': 'production-root', 'legacySourcesUsed': False}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
# Keep the previously served page, but never keep editing its sources.
archive = TEST / 'archive' / 'pre-modular-index.html'
if not archive.exists():
    archive.parent.mkdir(parents=True, exist_ok=True)
    old = (TEST / 'index.html').read_text().replace('<head>', '<head>\n    <base href="../">', 1)
    archive.write_text(old)
# Stable /test/ link points to this release and preserves only deliberate addon selection for development.
(TEST / 'index.html').write_text('''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تجربة ساحة الرماد</title>
<script>const dest=new URL('./releases/RELEASE/index.html',location.href);dest.search=location.search;dest.hash=location.hash;location.replace(dest.href);</script>
</head><body><p><a href="releases/RELEASE/index.html">افتح نسخة التجربة الجديدة</a></p></body></html>
'''.replace('RELEASE', RELEASE))
print(json.dumps({'release': RELEASE, 'base': REV, 'enabled': CFG['enabledAddons'], 'sourceFiles': len(source_hashes), 'directory': str(OUT)}, ensure_ascii=False))
