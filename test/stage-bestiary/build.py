"""Generate the isolated bestiary preview from a pinned production revision.

Only modified scripts are bundled. The HTML still loads the game's shared assets
relative to the repository root, including all unchanged bosses and arenas.
"""
import re
import subprocess
from pathlib import Path

PREVIEW = Path(__file__).resolve().parent
ROOT = PREVIEW.parents[1]
BASE = '41f7935c16b1241ae53a98d40d28ca33a5127607'


def read(path):
    return subprocess.check_output(['git', 'show', f'{BASE}:{path}'], cwd=ROOT, text=True)


def replace(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f'Expected one occurrence of {before!r}')
    return text.replace(before, after, 1)


patches = {
    'js/core/save.js': [("'ashen_arena_v1'", "'ashen_stage_bestiary_v1'")],
    'js/game/run.js': [("'ashen_arena_run'", "'ashen_stage_bestiary_run_v1'")],
    'js/duel/duel-net.js': [('const NET_LOCAL = /netlocal/.test(location.hash);', 'const NET_LOCAL = true;')],
    'js/game/spawning.js': [
        ('  let tot = 0;', '  for (const row of w) row[1] *= bestiaryWeight(row[0]);\n  let tot = 0;'),
    ],
    'js/render/world.js': [
        ('function setStage(i) {', 'function setStage(i) {\n  prepareBestiary(i);'),
    ],
    'js/game/enemy-ai.js': [
        (f'zone({args}, false);', f"zone({args}, false, 'slam');")
        for args in ('e.x, e.z, 4.5, 0.9, e.dmg * 0.8', 'e.x, e.z, 5, 0.9, e.dmg',
                     'e.x, e.z, 4, 0.9, e.dmg * 0.7')
    ],
    'js/render/renderer.js': [
        ('    const s = e.scale,\n      ph', '    const look = bestiaryLook(e.type);\n    const s = e.scale,\n      ph'),
        ('      F = EMA[e.type],\n      FA = EMAA[e.type];\n    let I = EM[e.type];',
         '      F = look?.walk || EMA[e.type],\n      FA = look?.attack.length ? look.attack : EMAA[e.type];\n    let I = look?.walk[0] || EM[e.type];'),
        ('EMA[c.type] ? EMA[c.type][0] : EM[c.type]', 'bestiaryLook(c.type)?.walk[0] || EMA[c.type]?.[0] || EM[c.type]'),
        ('  for (const k in EM) flush(EM[k]);', '  flushBestiary();\n  for (const k in EM) flush(EM[k]);'),
        ("q.kind !== 'sky' &&", "q.kind !== 'sky' && q.kind !== 'slam' &&"),
    ],
}
html = read('index.html')
html = replace(html, '<head>', '''<head>
    <base href="../../">
    <meta http-equiv="Content-Security-Policy" content="connect-src 'self' blob:">
    <style>
      #bestiaryStage {width:100%; font:inherit; direction:rtl;}
      #bestiaryStage option {color:#eee; background:#201d20;}
      #mLab, #mDuel, #mCoop {display:none!important;}
    </style>''')
html = replace(html, '        <div id="tiles">', '''        <select id="bestiaryStage" class="btn" aria-label="استعراض وحوش مرحلة">
          <option value="">استعرض وحوش المراحل</option>
        </select>
        <div id="tiles">''')
html = replace(html, '    <script src="js/main.js',
               '    <script src="test/stage-bestiary/bestiary.js?v=1"></script>\n    <script src="js/main.js')

for path, changes in patches.items():
    source = read(path)
    for before, after in changes:
        source = replace(source, before, after)
    name = Path(path).name
    output = PREVIEW / 'runtime' / name
    output.parent.mkdir(exist_ok=True)
    output.write_text(source)
    html, count = re.subn(r'(src=")' + re.escape(path) + r'\?v=\d+(")',
                          r'\1test/stage-bestiary/runtime/' + name + r'?v=1\2', html)
    if count != 1:
        raise ValueError(f'Missing script for {path}')
(PREVIEW / 'index.html').write_text(html)
