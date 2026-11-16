#!/usr/bin/env python3
"""Build the Ashen Arena test page into two ordered classic-script bundles.

The game uses classic global scripts, not ES modules. Concatenating in the exact
order of test/index.html keeps the existing global scope and load order intact.
Vendor code is copied as-is; app code is minified with top-level mangling off so
inline HTML handlers and the preview bootstrap keep working.
"""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "index.source.html"
INDEX = ROOT / "index.html"
VERSION = "bundle-20261116-v18"
OUT = ROOT / "releases" / VERSION
TMP = Path("/tmp/ashen-bundle-build")
SCRIPT_RE = re.compile(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*</script>', re.I | re.S)


def read_source(src: str) -> tuple[Path, str]:
    clean = src.split("?", 1)[0].split("#", 1)[0]
    path = (ROOT / clean).resolve()
    if ROOT not in path.parents and path != ROOT:
        raise SystemExit(f"script escapes test root: {src}")
    if not path.is_file():
        raise SystemExit(f"missing script: {src} -> {path}")
    return path, path.read_text(encoding="utf-8")


def bundle_text(name: str, entries: list[tuple[str, Path, str]]) -> str:
    parts = [f"/* Ashen Arena test {name}: {len(entries)} source files */\n"]
    for src, path, code in entries:
        parts.append(f"\n/* ---- {src} ---- */\n")
        parts.append(code)
        if not code.endswith("\n"):
            parts.append("\n")
        parts.append(";\n")
    return "".join(parts)


def main() -> None:
    html = SOURCE.read_text(encoding="utf-8")
    matches = list(SCRIPT_RE.finditer(html))
    if not matches:
        raise SystemExit("no external scripts found")
    if any(m.group(1).startswith(("http://", "https://", "//")) for m in matches):
        raise SystemExit("external CDN scripts must be handled separately")

    vendor: list[tuple[str, Path, str]] = []
    app: list[tuple[str, Path, str]] = []
    for m in matches:
        src = m.group(1)
        path, code = read_source(src)
        rel = src.split("?", 1)[0]
        (vendor if rel.startswith(("assets/vendor/", "vendor/")) else app).append((rel, path, code))
    if len(vendor) + len(app) != len(matches):
        raise SystemExit("script classification mismatch")

    TMP.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    raw_vendor = TMP / "vendor.raw.js"
    raw_app = TMP / "app.raw.js"
    raw_vendor.write_text(bundle_text("vendor", vendor), encoding="utf-8")
    raw_app.write_text(bundle_text("app", app), encoding="utf-8")

    out_vendor = OUT / "vendor.js"
    out_app = OUT / "app.js"
    shutil.copyfile(raw_vendor, out_vendor)
    cmd = [
        "npx", "--yes", "terser@5", str(raw_app),
        "--compress", "passes=2",
        "--mangle",
        "--keep-fnames",
        "--comments", "false",
        "--output", str(out_app),
    ]
    print("minifying app with terser...")
    subprocess.run(cmd, check=True)

    q = f"?v={VERSION}"
    tags = (
        f'\n    <script src="releases/{VERSION}/vendor.js{q}"></script>'
        f'\n    <script src="releases/{VERSION}/app.js{q}"></script>\n'
    )
    parts: list[str] = []
    last = 0
    for i, m in enumerate(matches):
        parts.append(html[last:m.start()])
        if i == 0:
            parts.append(tags)
        last = m.end()
    parts.append(html[last:])
    new_html = "".join(parts)
    new_html = "\n".join(line.rstrip() for line in new_html.splitlines()) + "\n"
    INDEX.write_text(new_html, encoding="utf-8")

    manifest = {
        "version": VERSION,
        "script_count": len(matches),
        "vendor_count": len(vendor),
        "app_count": len(app),
        "vendor_sources": [x[0] for x in vendor],
        "app_sources": [x[0] for x in app],
        "vendor_bytes": out_vendor.stat().st_size,
        "app_bytes": out_app.stat().st_size,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in manifest.items() if not k.endswith("_sources")}, ensure_ascii=False, indent=2))
    print(f"index now has {len(SCRIPT_RE.findall(new_html))} external scripts")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print(f"build failed: {e}", file=sys.stderr)
        raise
