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
    for name in ("combat.js", "art.js", "gear.js", "network.js", "menu.js", "style.css"):
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
        ("  if (NET_LOCAL) {\n    const bc", "  if (!name.startsWith('duel-iron-v2-live-')) {\n    const bc"),
        ("new BroadcastChannel('ashen:' + name)", "new BroadcastChannel('ashen-iron-v2:' + name)"),
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
    forgeBodyLean(this, dt);
""" + code[movement_end:]
    start = code.index("    // swings: sword glows")
    end = code.index("    // end of timed states", start)
    code = code[:start] + """    const M = this.M[this.act] || DM[this.act];
    const strike = !this.hitDone && FORGE_ATTACKS.has(this.act) &&
      this.t >= M.hitFrom && this.t - dt <= M.hitTo ? this.act : null;
""" + code[end:]
    code = replace(code, "    this.hitDone = false;\n  }\n  /** The sword", """    this.hitDone = false;
    forgeBeginAction(this, act);
  }
  /** The sword""")
    pose = "this.root.rotation.y = this.face;"
    if code.count(pose) != 2:
        raise RuntimeError("Expected the local and remote pose exits")
    code = code.replace(pose, pose + "\n      forgePoseAndStrike(this, foe, strike, dt);")
    code = replace(code, """    // the killing blow: a staged finisher""", """    if (kind !== 'kick') forgeWound(this, from, kind);
    // the killing blow: a staged finisher""")
    code = replace(code, "    goreHit(this, from, kind);", "    if (!this.forgeContact) goreHit(this, from, kind);")
    code = replace(code, "  let dmg = M.dmg,", "  let dmg = M.dmg * (d.forgeContact?.power ?? 1),")
    code = replace(code, "if (kind === 'heavy' || d.st < cost)", "if (d.st < cost || (kind === 'heavy' && W.block > 1.25))")
    code = code.replace("this.st < this.M.light.st * 0.5", "this.st < this.M.light.st")
    code = code.replace("this.st < this.M.heavy.st * 0.5", "this.st < this.M.heavy.st")
    code = code.replace("blockT: 0, moving: 0", "blockT: 0, moving: 0, vx: 0, vz: 0, forgeSweep: null, forgeLean: 0")
    code = replace(code, "    goreReset(this);", "    forgeClearInjuries(this);\n    goreReset(this);")
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
    code = code.replace("m.visible = !m.userData.cut", "m.visible = forgeFighterVisible(me, m)")
    code = replace(code, "m.visible = !fp && !m.userData.cut;", "m.visible = forgeFighterVisible(me, m, fp);")
    mode.write_text(code)
    patch(out, "js/duel/duel-mode.js", [
        ("    duelSoundsLoad();", "    duelSoundsLoad();\n    await forgeLoadGear();"),
        ("  G.state = 'duel';", "  G.state = 'duel';\n  DUEL.phase = 'load';"),
        ("getItem('ashen_duel_view')", "getItem('ashen_iron_view')"),
        ("setItem('ashen_duel_view',", "setItem('ashen_iron_view',"),
        ("|| 'fp';", "|| 'tps';"),
        ("    DUEL.scene.add(DUEL.me.root, DUEL.foe.root);",
         "    forgeDress(DUEL.me, forgeStyle());\n    forgeDress(DUEL.foe, 4);\n    DUEL.scene.add(DUEL.me.root, DUEL.foe.root);"),
        ("  duelLock(false);\n  DUEL.pitch = 0;",
         "  duelLock(!watch);\n  DUEL.pitch = 0;\n  me.forgeAttack = foe.forgeAttack = foe.forgeRemoteAttack = 0;\n  forgeDress(me, forgeStyle());"),
        ("    down();\n  });", "    b.setPointerCapture(e.pointerId);\n    down();\n  });"),
        ("  b.addEventListener('pointercancel', end);\n  b.addEventListener('pointerleave', end);",
         """  b.addEventListener('pointercancel', () => {
    if (id === 'dAtk') DUEL.atkDown = -1;
    end();
  });
  b.addEventListener('lostpointercapture', end);"""),
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
      av: me.forgeStyle,
      mid: me.forgeAttack || 0,
      mt: r(me.t),
      md: me.forgeDirection || 0,
      mc: me.combo,"""),
        ("  } else if (r === 'block') {\n    duelFloat", """  } else if (r === 'clash') {
    duelFloat('اصطدام النصال', 'blk');
    goreSparks(att, def, 24);
    DUEL.hitStop = 0.05;
    DS.block();
  } else if (r === 'block') {
    duelFloat"""),
        ("  if (r.o === 'parry') {", "  if (r.o === 'clash') {\n    me.stagger(0.38);\n    me.spend(8);\n  } else if (r.o === 'parry') {"),
        ("  DUEL.round = n || DUEL.round + 1;", "  DUEL.round = n || DUEL.round + 1;\n  DUEL.atkDown = -1;\n  DUEL.blockHeld = DUEL.blockWas = false;"),
    ])
    patch(out, "js/duel/duel-ai.js", [
        ("d < 2.3", "d < Math.min(2.0, me.M.light.reach * 0.8)"),
        ("me.want.mz = d > 2.0 ? 1 : d < 1.4 ? -0.7 : 0;",
         """const gap = me.wpId === 'spear' ? 1.74 : 1.37;
    const exhausted = me.st < me.M.light.st * 1.3;
    me.want.mz = d > gap + 0.21 ? (exhausted ? 0.15 : 0.91) : d < gap - 0.19 || exhausted ? -0.76 : 0;"""),
    ])
    patch(out, "js/duel/duel-gore.js", [
        ("    if (!o.isSkinnedMesh) return;", "    if (!o.isSkinnedMesh || !forgeIsEquipped(f, o)) return;"),
        ("function goreDecide(d, kind, from) {", """function goreDecide(d, kind, from) {
  const hit = d.forgeContact;
  if (hit) {
    if (S.forgeBlood === 'light' || kind !== 'heavy' || !from.wp.cut || d.hp > 22) return null;
    const part = GORE_PARTS[hit.zone];
    return part && !(d.cuts & part.bit) && hit.power > 0.70 ? hit.zone : null;
  }"""),
    ])
    patch(out, "js/duel/duel-ffa.js", [
        ("    ffaExtra = [new Duelist(a, FFA_HUES[2], 104), new Duelist(b, FFA_HUES[3], 124)];",
         "    ffaExtra = [new Duelist(a, FFA_HUES[2], 104), new Duelist(b, FFA_HUES[3], 124)];\n    ffaExtra.forEach((fighter, i) => forgeDress(fighter, (i + 1) % FORGE_STYLES.length));"),
    ])
    patch(out, "js/duel/duel-arena.js", [
        ("  s.background = new THREE.Color(0x0a0708);", "  s.background = new THREE.Color(0x110d16);"),
        ("new THREE.Fog(0x120a0e, 22, 70)", "new THREE.Fog(0x20141c, 16, 56)"),
        ("map: arenaFloorTex(), roughness: 0.88", "map: forgeFloorTexture(), roughness: 0.79"),
        ("  s.add(key);", "  s.add(key);\n  forgeLight(s);"),
    ])
    html = (out / "index.html").read_text()
    html = replace(html, "<title>ساحة الرماد</title>", "<title>حلبة النغالة | ساحة الرماد</title>")
    html = html.replace("?v=202611180848", "?v=202611180848&preview=38")
    # Reuse the vetted Three.js assets and keep the preview independent of CDN rendering.
    vendors = "\n".join(f'<script src="vendor/{p.name}"></script>' for p in sorted((out / "vendor").glob("*.js")))
    html = re.sub(r'<script src="https://[^"]+"></script>', '', html)
    html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex,nofollow">\n'
        '<meta http-equiv="Content-Security-Policy" content="connect-src \'self\' data: blob: wss://bvxfzcndquirqmpyhtpj.supabase.co https://bvxfzcndquirqmpyhtpj.supabase.co">\n'
        '<link rel="stylesheet" href="style.css?v=38">', 1)
    html = replace(html, '<script src="js/core/config.js', vendors + '\n<script src="js/core/config.js')
    html = replace(html, '<script src="js/main.js', '\n'.join(f'<script src="{n}.js?v=38"></script>' for n in ['combat','art','gear','network','menu']) + '\n<script src="js/main.js')
    (out / "index.html").write_text(html)

def mobile_file(out, target):
    """One file for practicing on a phone with no archive or local web server."""
    html = (out / "index.html").read_text()
    files = [out / "assets/models/duelist.glb", *sorted((out / "assets/audio/duel").rglob("*.mp3")), *sorted((out / "assets/iron-duel").glob("*.glb"))]
    assets = {p.relative_to(out).as_posix(): base64.b64encode(p.read_bytes()).decode() for p in files}
    boot = """window.IRON_STANDALONE = true;
const ironAssets = new Map(Object.entries(%s));
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
