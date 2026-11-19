"""Trim downloaded CC0 GLBs to the clips used in the preview.

Pass a directory containing the original files named by the asset IDs in
models/SOURCES.json. The manifest records the original download URLs.
"""
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

SOURCE = Path(sys.argv[1])
OUTPUT = Path(__file__).with_name('models')
CLIPS = (
    ('walk', ('Walk', 'Fast_Flying', 'Flying_Idle', 'Run')),
    ('attack', ('Attack', 'Punch', 'Headbutt', 'Bite_Front', 'SwordSlash')),
)


def pack(source, path):
    raw = source.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + size])
    original = raw[28 + size:]
    animations = {a['name'].split('|')[-1]: a for a in gltf.get('animations', [])}
    gltf['animations'] = []
    for role, names in CLIPS:
        if role == 'attack' and source.stem == 'iron-gunner':
            names = ('Shoot', *names)
        clip = next((animations[n] for n in names if n in animations), None)
        if clip is not None:
            gltf['animations'].append(dict(clip, name=role))

    refs = []
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            refs.extend((primitive['attributes'], k) for k in primitive['attributes'])
            if 'indices' in primitive:
                refs.append((primitive, 'indices'))
    refs.extend((skin, 'inverseBindMatrices') for skin in gltf.get('skins', []) if 'inverseBindMatrices' in skin)
    for clip in gltf['animations']:
        for sampler in clip['samplers']:
            refs.extend(((sampler, 'input'), (sampler, 'output')))

    def compact(items, references):
        kept = sorted({obj[key] for obj, key in references})
        remap = {old: new for new, old in enumerate(kept)}
        for obj, key in references:
            obj[key] = remap[obj[key]]
        return [items[i] for i in kept]

    gltf['accessors'] = compact(gltf['accessors'], refs)
    images = gltf.get('images', [])
    views = [(a, 'bufferView') for a in gltf['accessors']] + [(im, 'bufferView') for im in images]
    gltf['bufferViews'] = compact(gltf['bufferViews'], views)
    image_views = {im['bufferView']: im for im in images}
    binary = bytearray()
    for index, view in enumerate(gltf['bufferViews']):
        offset = view.get('byteOffset', 0)
        data = original[offset:offset + view['byteLength']]
        if index in image_views and len(data) > 200_000:
            from PIL import Image
            im = Image.open(io.BytesIO(data))
            im.thumbnail((384, 384), Image.Resampling.LANCZOS)
            resized = io.BytesIO()
            im.save(resized, format='PNG', optimize=True)
            image_views[index]['mimeType'] = 'image/png'
            data = resized.getvalue()
        view.update(byteOffset=len(binary), byteLength=len(data))
        binary.extend(data)
        binary.extend(b'\0' * (-len(binary) % 4))
    gltf['buffers'][0]['byteLength'] = len(binary)
    header = json.dumps(gltf, separators=(',', ':')).encode()
    header += b' ' * (-len(header) % 4)
    path.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 28 + len(header) + len(binary), len(header), 0x4E4F534A)
        + header + struct.pack('<II', len(binary), 0x004E4942) + binary)


manifest = json.loads((OUTPUT / 'SOURCES.json').read_text())
for key, details in manifest.items():
    path = OUTPUT / (key + '.glb')
    pack(SOURCE / path.name, path)
    details['license'] = 'CC0-1.0'
    details['source'] = details['source'].replace('/mechpack.html', '/animatedmech.html')
    details['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
(OUTPUT / 'SOURCES.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
