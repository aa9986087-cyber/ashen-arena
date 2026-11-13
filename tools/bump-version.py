#!/usr/bin/env python3
"""Stamp every local script/stylesheet in index.html with ?v=<timestamp> so browsers fetch the new files
after each deploy instead of mixing cached old ones with new ones. Run before every push:  python3 tools/bump-version.py"""
import re, time, pathlib
f = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
v = time.strftime('%Y%m%d%H%M')
s = f.read_text(encoding='utf-8')
s = re.sub(r'((?:src|href)="(?:js|css)/[^"?]+\.(?:js|css))(\?v=\w+)?"', lambda m: m.group(1) + '?v=' + v + '"', s)
f.write_text(s, encoding='utf-8')
print('version', v)
