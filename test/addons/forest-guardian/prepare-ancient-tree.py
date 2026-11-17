"""Blender 4.3: blender -b -t 4 -P prepare-ancient-tree.py -- <extracted.zip directory> <output.glb>."""
import math
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion, Vector

source_dir, output = map(lambda value: Path(value).resolve(), sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(next((source_dir / 'source').glob('*.fbx'))), use_image_search=True)
mesh = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
bpy.context.view_layer.objects.active = mesh
mesh.rotation_euler.z -= math.pi / 2  # Sketchfab faces +X; export to the arena's +Z forward.
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh.location.z -= min(v.co.z for v in mesh.data.vertices)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
decimate = mesh.modifiers.new('Mobile mesh', 'DECIMATE')
decimate.ratio = min(1, 18000 / len(mesh.data.polygons))
bpy.ops.object.modifier_apply(modifier=decimate.name)
mesh.data.validate(clean_customdata=False)
mesh.name = 'Ancient Tree Giant'
mesh.data.polygons.foreach_set('use_smooth', [True] * len(mesh.data.polygons))

armature = bpy.data.armatures.new('Tree joints')
rig = bpy.data.objects.new('Tree rig', armature)
bpy.context.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
segments = {}


def joint(name, parent, start, end, radius):
    bone = armature.edit_bones.new(name)
    bone.head, bone.tail = start, end
    if parent:
        bone.parent = armature.edit_bones[parent]
    bone.align_roll(Vector((0, -1, 0)))
    segments[name] = (start, end, radius)


joint('Hips', None, (0, .014, .37), (0, .035, .48), .082)
joint('Chest', 'Hips', (0, .035, .48), (0, .035, .657), .111)
joint('Crown', 'Chest', (0, .018, .657), (0, .025, .97), .116)
for side, s in [('L', 1), ('R', -1)]:
    shoulder = (s * .133, .038, .588)
    elbow = (s * .195, .034, .449)
    wrist = (s * .228, -.019, .337)
    hip = (s * .057, .013, .383)
    knee = (s * .101, -.055, .218)
    ankle = (s * .126, .037, .065)
    joint('Arm.' + side, 'Chest', shoulder, elbow, .063)
    joint('Forearm.' + side, 'Arm.' + side, elbow, wrist, .058)
    joint('Hand.' + side, 'Forearm.' + side, wrist, (s * .235, -.036, .261), .051)
    joint('Thigh.' + side, 'Hips', hip, knee, .067)
    joint('Shin.' + side, 'Thigh.' + side, knee, ankle, .061)
    joint('Foot.' + side, 'Shin.' + side, ankle, (s * .134, -.135, .021), .064)
bpy.ops.object.mode_set(mode='OBJECT')

# Bind the bark and detached leaves to their closest limbs, with a smooth blend at each joint.
coords = np.empty(len(mesh.data.vertices) * 3, dtype=np.float32)
mesh.data.vertices.foreach_get('co', coords)
coords = coords.reshape(-1, 3)
scores = []
for name, (start, end, radius) in segments.items():
    start = np.asarray(start)
    delta = np.asarray(end) - start
    along = np.clip((coords - start) @ delta / (delta @ delta), 0, 1)
    distance = np.linalg.norm(coords - start - along[:, None] * delta, axis=1)
    score = distance / radius
    if name != 'Crown':
        score += np.clip((coords[:, 2] - .72) * 22, 0, 5)
    if '.' in name:
        score += 4 * (coords[:, 0] * (1 if name.endswith('.L') else -1) < 0)
    scores.append(score)
scores = np.stack(scores, axis=1)
closest = scores.argsort(axis=1)[:, :4]
weights = np.exp(-4.4 * (np.take_along_axis(scores, closest, axis=1) - scores.min(axis=1)[:, None]))
weights /= weights.sum(axis=1)[:, None]
groups = [mesh.vertex_groups.new(name=name) for name in segments]
for index, (bones, influences) in enumerate(zip(closest, weights)):
    for bone, weight in zip(bones, influences):
        if weight >= .0005:
            groups[bone].add([index], float(weight), 'REPLACE')
modifier = mesh.modifiers.new('Tree skeleton', 'ARMATURE')
modifier.object = rig
mesh.parent = rig

# Explicit clips. The special contacts on frame 43 (1.05 s after frame 1), matching combat.
scene = bpy.context.scene
scene.render.fps = 40
pose_bones = list(rig.pose.bones)
local_rot = {b.name: b.bone.matrix_local.to_quaternion() for b in pose_bones}
rig.animation_data_create()


def action(name, frames):
    clip = bpy.data.actions.new(name)
    rig.animation_data.action = clip
    for tick, height, angles in frames:
        for bone in pose_bones:
            x, y, z = angles.get(bone.name, (0, 0, 0))
            world = Quaternion((0, 0, 1), math.radians(z)) @ Quaternion((0, 1, 0), math.radians(y)) @ Quaternion((1, 0, 0), math.radians(x))
            rest = local_rot[bone.name]
            bone.rotation_mode = 'QUATERNION'
            bone.rotation_quaternion = rest.inverted() @ world @ rest
            bone.keyframe_insert(data_path='rotation_quaternion', frame=tick + 1, group=bone.name)
        hips = rig.pose.bones['Hips']
        hips.location = local_rot['Hips'].inverted() @ Vector((0, 0, height))
        hips.keyframe_insert(data_path='location', frame=tick + 1, group='Hips')
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, clip)


def gait(period, stride, bounce):
    result = []
    for tick in sorted({round(period * i / 8) for i in range(9)}):
        phase = math.tau * tick / period
        angles = {'Chest': (-4, 0, 5 * math.sin(phase)), 'Crown': (3, 0, -3 * math.sin(phase))}
        for side, sign in [('L', 1), ('R', -1)]:
            swing = math.sin(phase) * sign
            angles['Thigh.' + side] = (stride * swing, 0, 0)
            angles['Shin.' + side] = (min(0, swing) * stride * -.82, 0, 0)
            angles['Foot.' + side] = (max(0, -swing) * -stride * .28, 0, 0)
            angles['Arm.' + side] = (-swing * stride * .58, sign * -5, 0)
            angles['Forearm.' + side] = (-max(0, swing) * 15, 0, 0)
        result.append((tick, bounce * (1 - abs(math.sin(phase))), angles))
    return result


def swing(tick, drop, hip, chest, left, right, elbow, splay=8):
    return (tick, drop, {'Hips': (hip, 0, 0), 'Chest': (chest, 0, 0), 'Crown': (-chest * .42, 0, 0),
        'Arm.L': (left, -splay, -4), 'Arm.R': (right, splay, 4),
        'Forearm.L': (elbow, 0, 0), 'Forearm.R': (elbow, 0, 0),
        'Thigh.L': (-hip * .64, 0, 0), 'Thigh.R': (-hip * .64, 0, 0),
        'Shin.L': (hip * .65, 0, 0), 'Shin.R': (hip * .65, 0, 0)})


action('idle', [(0, 0, {}), (42, .012, {'Chest': (-2, 0, 2), 'Crown': (0, 0, -2),
    'Arm.L': (-4, -2, 0), 'Arm.R': (-4, 2, 0)}), (84, 0, {})])
action('walk', gait(55, 23, .015))
action('run', gait(31, 33, .029))
action('attack', [swing(0, 0, 0, 0, 0, 0, 0), swing(12, -.028, 9, -14, -39, 26, -25),
    swing(23, -.064, 17, 20, -52, -63, -8), swing(33, 0, 0, 0, 0, 0, 0)])
action('rootSlam', [swing(0, 0, 0, 0, 0, 0, 0), swing(12, -.035, 8, 11, -28, -34, -28),
    swing(30, .018, -7, -9, -109, -116, -18, 19), swing(38, .048, -10, -12, -141, -146, -9, 12),
    swing(42, -.106, 25, 34, -45, -52, -9, 10), swing(50, -.079, 19, 22, -38, -41, -14),
    swing(65, -.021, 10, 4, -12, -18, -8), swing(82, 0, 0, 0, 0, 0, 0)])
action('fall', [(0, 0, {}), (19, -.018, {'Hips': (-16, 0, 0), 'Arm.L': (-28, 0, 0), 'Arm.R': (-34, 0, 0)}),
    (46, -.275, {'Hips': (40, -46, 0), 'Chest': (16, -8, 0), 'Arm.R': (-32, 0, 0)}),
    (63, -.29, {'Hips': (43, -49, 0), 'Chest': (17, -8, 0), 'Arm.R': (-32, 0, 0)})])

for obj in [mesh, rig]:
    obj.select_set(True)
with tempfile.TemporaryDirectory(prefix='ashen-tree-maps-') as tmp:
    material = mesh.data.materials[0]
    material.name = 'Ancient bark'
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for socket, value in [('Metallic', .025), ('Roughness', .83)]:
        for link in list(shader.inputs[socket].links):
            material.node_tree.links.remove(link)
        shader.inputs[socket].default_value = value
    for name, color_space in [('Image Texture', 'sRGB'), ('Image Texture.001', 'Non-Color')]:
        tex = material.node_tree.nodes[name]
        image = tex.image
        image.scale(1024, 1024)
        image.file_format = 'JPEG'
        target = str(Path(tmp) / (name + '.jpg'))
        image.save(filepath=target, quality=89)
        tex.image = bpy.data.images.load(target)
        tex.image.colorspace_settings.name = color_space
    material.node_tree.nodes['Normal Map'].inputs['Strength'].default_value = .68
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
        use_selection=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_anim_slide_to_zero=True, export_image_format='JPEG', export_jpeg_quality=89)
print(f'{output.name}: {len(mesh.data.polygons)} faces, {len(segments)} bones, {output.stat().st_size:,} bytes')
