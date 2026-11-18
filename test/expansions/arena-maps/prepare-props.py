"""Blender 4.3: blender -b -P prepare-props.py -- <extracted Kenney kits> <props.js>."""
import base64
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import numpy as np

MODELS = {
    'oak': ('nature-kit', 'tree_oak_dark'),
    'fir': ('nature-kit', 'tree_pineTallA'),
    'mushrooms': ('nature-kit', 'mushroom_tanGroup'),
    'log': ('nature-kit', 'log_large'),
    'boulder': ('nature-kit', 'rock_largeC'),
    'cliff': ('nature-kit', 'cliff_large_rock'),
    'spire': ('nature-kit', 'rock_tallB'),
    'column': ('nature-kit', 'statue_columnDamaged'),
    'palm': ('nature-kit', 'tree_palmShort'),
    'stump': ('nature-kit', 'stump_oldTall'),
    'gate': ('castle-kit', 'gate'),
    'tower': ('castle-kit', 'tower-square'),
    'wall': ('castle-kit', 'wall-half-modular'),
    'banner': ('castle-kit', 'flag-wide'),
    'siege': ('castle-kit', 'siege-tower-demolished'),
    'crate': ('factory-kit', 'box-large'),
    'pipe': ('factory-kit', 'pipe-large-valve'),
    'crypt': ('graveyard-kit', 'crypt-a'),
    'coffin': ('graveyard-kit', 'coffin-old'),
    'tomb': ('graveyard-kit', 'gravestone-decorative'),
    'brokenTomb': ('graveyard-kit', 'gravestone-broken'),
    'obelisk': ('graveyard-kit', 'pillar-obelisk'),
    'brazier': ('graveyard-kit', 'fire-basket'),
    'fence': ('graveyard-kit', 'iron-fence-damaged'),
    'arch': ('modular-dungeon-kit', 'gate'),
}
root, output = [Path(p).resolve() for p in sys.argv[sys.argv.index('--') + 1:]]
packed = {}

def encode(data):
    return base64.b64encode(data).decode()

for identifier, (kit, name) in MODELS.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    filepath = next((root / kit).rglob(name + '.glb'))
    bpy.ops.import_scene.gltf(filepath=str(filepath))
    vertices, colors, atlas = [], [], {}
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        materials = []
        for mat in mesh.materials:
            shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            color = shader.inputs['Base Color']
            image = (color.links[0].from_node.image if color.is_linked
                     and color.links[0].from_node.type == 'TEX_IMAGE' else None)
            if image and image.name not in atlas:
                buf = np.empty(len(image.pixels), dtype=np.float32)
                image.pixels.foreach_get(buf)
                w, h = image.size
                if w == 0 or h == 0:
                    raise ValueError(f'Missing source atlas for {filepath}')
                atlas[image.name] = buf.reshape(h, w, 4)
            materials.append((color.default_value[:3], atlas.get(image.name) if image else None))
        uv = mesh.uv_layers.active
        for face in mesh.loop_triangles:
            for v in face.vertices:
                pos = obj.matrix_world @ mesh.vertices[v].co
                vertices.append((pos.x, pos.z, -pos.y))
            color, pixels = materials[face.material_index]
            if pixels is not None and uv:
                u, v = [sum(uv.data[i].uv[axis] for i in face.loops) / 3 for axis in (0, 1)]
                h, w, _ = pixels.shape
                color = pixels[math.floor((v % 1) * h), math.floor((u % 1) * w), :3]
            colors.append(tuple(max(0, min(255, round(float(value) * 255))) for value in color))
    positions = np.array(vertices)
    low, high = positions.min(axis=0), positions.max(axis=0)
    origin = (low + high) / 2
    origin[1] = low[1]
    normalized = np.rint((positions - origin) * (4096 / (high - low).max())).astype('<i2')
    packed[identifier] = [
        encode(normalized.tobytes()),
        encode(bytes(value for color in colors for value in color)),
    ]
    print(f'{identifier}: {len(colors)} faces')
output.write_text("'use strict';\n/* Generated from the CC0 sources in SOURCES.md. */\nconst OPEN_ARENA_PROPS = "
                  + json.dumps(packed, separators=(',', ':')) + ';\n')
