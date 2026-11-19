"""Package the independent Ashen Arena duel build and vetted open game assets."""
from pathlib import Path
from argparse import ArgumentParser
import json
import re
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
GEAR = HERE.parent / "iron-duel"
BASE = "c358c3ff5534ced36c1a4f160cb05e5f04189b71"

def read_base(name):
    return subprocess.check_output(["git", "show", f"{BASE}:{name}"], cwd=ROOT, text=True)

def build(out):
    out.mkdir(parents=True, exist_ok=False)
    for name in ("index.html", "style.css", "physics.js", "scene.js", "app.js", "rooms.js"):
        shutil.copy2(HERE / name, out / name)
    (out / "vendor").mkdir()
    for name in ("01-three.min.js", "02-GLTFLoader.js"):
        shutil.copy2(ROOT / "test/assets/vendor" / name, out / "vendor" / name)
    shutil.copytree(GEAR / "assets", out / "assets")
    source = (GEAR / "gear.js").read_text()
    section = source.split("const FORGE_WEAPON_DATA = {", 1)[1].split("};", 1)[0]
    gear = {}
    for name, raw in re.findall(r"(\w+):\s*(\[[^\[\]]+\])", section):
        item = json.loads(raw.replace("'", '"'))
        label, _, mode, start, tip, _, power, _, mass, radius, offset, _ = item
        gear[name] = dict(name=label, type=mode, start=start, tip=tip, power=power,
                          mass=mass, radius=radius, offset=offset,
                          two=name in ("claymore", "greatsword", "greataxe", "scythe", "spear", "warhammer"))
    assert len(gear) == 13
    (out / "weapons.json").write_text(json.dumps(gear, ensure_ascii=False))
    source = read_base("js/ui/leaderboard.js")
    config = re.search(r"const ONLINE = \{.*?\n\};", source, re.S)
    if not config:
        raise RuntimeError("The preview connection settings could not be read")
    transport = read_base("js/duel/duel-net.js")
    transport = transport.replace("/netlocal/.test(location.hash)", "new URLSearchParams(location.search).has('local')")
    start = transport.index("/** This device's player id")
    end = transport.index("/** Join a channel.", start)
    transport = transport[:start] + transport[end:]
    (out / "room-transport.js").write_text(config.group() + "\n" + transport)

if __name__ == "__main__":
    cli = ArgumentParser()
    cli.add_argument("output", type=Path)
    build(cli.parse_args().output.resolve())
