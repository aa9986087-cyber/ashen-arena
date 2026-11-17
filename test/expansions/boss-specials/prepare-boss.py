"""blender -b -t 4 -P prepare-boss.py -- <boss id> <unpacked archive> <output.glb>."""
import math
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion, Vector

kind, source, output = sys.argv[sys.argv.index('--') + 1:]
source, output = Path(source).resolve(), Path(output).resolve()
source_file = next((source / 'source').rglob('*.fbx'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source_file), use_image_search=True)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for mesh in meshes:
    mesh.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
mesh = bpy.context.object
matrix = mesh.matrix_world.copy()
mesh.parent = None
mesh.matrix_world = matrix
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(mesh.data.polygons) > 19000:
    modifier = mesh.modifiers.new('Mobile triangles', 'DECIMATE')
    modifier.ratio = 18500 / len(mesh.data.polygons)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
mesh.data.validate(clean_customdata=False)
mesh.name = kind.title() + ' Boss'

# The arena faces +Z in glTF, which is -Y in Blender.
angle = {'sand': -math.pi/2, 'frost': math.pi, 'knight': -math.pi/2, 'fire': -math.pi/2, 'grave': 0}[kind]
mesh.rotation_euler.z = angle
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
positions = np.empty(len(mesh.data.vertices) * 3, dtype=np.float32)
mesh.data.vertices.foreach_get('co', positions)
positions = positions.reshape(-1, 3)
low, high = positions.min(axis=0), positions.max(axis=0)
center = (low + high) / 2
center[2] = low[2]
positions = (positions - center) / (high[2] - low[2])
mesh.data.vertices.foreach_set('co', positions.ravel())
mesh.data.update()

armature = bpy.data.armatures.new(kind + ' joints')
rig = bpy.data.objects.new(kind + ' rig', armature)
bpy.context.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
segments = {}


def bone(name, parent, start, end, radius):
    joint = armature.edit_bones.new(name)
    joint.head, joint.tail = start, end
    if parent:
        joint.parent = armature.edit_bones[parent]
    joint.align_roll(Vector((0, -1, 0)))
    segments[name] = (start, end, radius)


def humanoid(root, chest, neck, shoulder, elbow, wrist, hand, hip=None, knee=None, ankle=None):
    bone('Hips', None, root, chest, .12)
    bone('Chest', 'Hips', chest, neck, .127)
    bone('Head', 'Chest', neck, (neck[0], neck[1], .98), .12)
    for side, sign in [('L', 1), ('R', -1)]:
        def m(p):
            return (sign * p[0], p[1], p[2])
        bone(f'Arm.{side}', 'Chest', m(shoulder), m(elbow), .083)
        bone(f'Forearm.{side}', f'Arm.{side}', m(elbow), m(wrist), .082)
        bone(f'Hand.{side}', f'Forearm.{side}', m(wrist), m(hand), .077)
        if hip:
            bone(f'Thigh.{side}', 'Hips', m(hip), m(knee), .091)
            bone(f'Shin.{side}', f'Thigh.{side}', m(knee), m(ankle), .091)
            bone(f'Foot.{side}', f'Shin.{side}', m(ankle), (sign*ankle[0], ankle[1]-.12, .025), .092)


if kind == 'sand':
    humanoid((.035,.035,.17), (.035,.022,.41), (.04,-.005,.68),
        (.181,.016,.58), (.208,-.021,.413), (.227,-.05,.235), (.229,-.057,.145))
    bone('Staff.R', 'Hand.R', (-.258,-.09,.10), (-.265,-.09,.76), .040)
elif kind == 'frost':
    humanoid((0,.035,.43), (0,.015,.58), (0,-.07,.69),
        (.205,.02,.74), (.243,-.02,.46), (.288,-.105,.21), (.303,-.11,.06),
        (.125,.108,.48), (.154,.078,.25), (.177,.065,.075))
elif kind == 'knight':
    humanoid((.015,.008,.48), (.01,.008,.64), (.01,-.02,.83),
        (.132,.012,.789), (.185,.012,.66), (.223,-.025,.533), (.249,-.048,.49),
        (.08,.009,.49), (.11,-.043,.261), (.151,.01,.067))
    bone('Sword.R', 'Hand.R', (-.219,-.035,.505), (-.415,-.137,.146), .067)
    bone('Shield.L', 'Forearm.L', (.23,-.15,.685), (.413,-.115,.225), .096)
elif kind == 'grave':
    humanoid((0,.033,.438), (0,.025,.655), (0,-.026,.829),
        (.198,.002,.79), (.282,-.01,.578), (.348,-.04,.386), (.352,-.052,.265),
        (.104,.031,.45), (.163,-.031,.235), (.186,.026,.071))
elif kind == 'fire':
    bone('Hips', None, (0,.16,.40), (0,.05,.57), .11)
    bone('Chest', 'Hips', (0,.05,.57), (0,-.082,.65), .13)
    bone('Neck', 'Chest', (0,-.082,.65), (0,-.203,.58), .083)
    bone('Head', 'Neck', (0,-.203,.58), (0,-.414,.46), .10)
    bone('Tail', 'Hips', (0,.17,.415), (-.064,.26,.21), .093)
    bone('TailTip', 'Tail', (-.064,.26,.21), (-.14,.035,.025), .094)
    for side, sign in [('L',1),('R',-1)]:
        bone(f'Wing.{side}', 'Chest', (sign*.092,.017,.65), (sign*.298,-.01,.93), .106)
        bone(f'Wingtip.{side}', f'Wing.{side}', (sign*.298,-.01,.93), (sign*.57,.147,.38), .15)
        bone(f'Arm.{side}', 'Chest', (sign*.086,-.081,.52), (sign*.157,-.17,.371), .084)
        bone(f'Hand.{side}', f'Arm.{side}', (sign*.157,-.17,.371), (sign*.186,-.217,.25), .07)
        bone(f'Thigh.{side}', 'Hips', (sign*.085,.102,.44), (sign*.125,.14,.26), .071)
        bone(f'Foot.{side}', f'Thigh.{side}', (sign*.125,.14,.26), (sign*.135,.07,.12), .073)
bpy.ops.object.mode_set(mode='OBJECT')

scores = []
for name, (start, end, radius) in segments.items():
    start = np.asarray(start)
    delta = np.asarray(end) - start
    t = np.clip((positions-start) @ delta / (delta @ delta), 0, 1)
    distance = np.linalg.norm(positions - start - t[:, None] * delta, axis=1) / radius
    x, y, z = positions.T
    if '.' in name:
        side = 1 if name.endswith('.L') else -1
        distance += 4 * (x * side < -.012)
    if name == 'Head':
        distance += 2.2 * (np.abs(x) > .2)
    if name.startswith('Wing'):
        distance += 4 * (np.abs(x) < .144) + 2 * (y < -.27)
    if kind == 'frost' and name == 'Head':
        distance += 2.4 * (z > .78)
    if name in {'Staff.R', 'Sword.R', 'Shield.L'}:
        if name == 'Staff.R':
            distance += 5 * (x > -.172)
        elif name == 'Sword.R':
            distance += 4 * ((x > -.235) | (z > .58))
        else:
            distance += 3 * ((x < .205) | (y > .09))
        distance -= .43
    scores.append(distance)
scores = np.stack(scores, axis=1)
nearest = scores.argsort(axis=1)[:, :4]
weight = np.exp(-5.0 * (np.take_along_axis(scores, nearest, axis=1) - scores.min(axis=1)[:, None]))
weight /= weight.sum(axis=1)[:, None]
groups = [mesh.vertex_groups.new(name=name) for name in segments]
for v, (joints, weights) in enumerate(zip(nearest, weight)):
    for i, w in zip(joints, weights):
        if w >= .00045:
            groups[i].add([v], float(w), 'REPLACE')
deform = mesh.modifiers.new('Boss skin', 'ARMATURE')
deform.object = rig
mesh.parent = rig

scene = bpy.context.scene
scene.render.fps = 40
pose = list(rig.pose.bones)
rest = {b.name: b.bone.matrix_local.to_quaternion() for b in pose}
rig.animation_data_create()


def clip(name, keys):
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    for t, lift, pose_angles in keys:
        frame = round(t*40)+1
        for b in pose:
            x, y, z = pose_angles.get(b.name, (0,0,0))
            rotation = Quaternion((0,0,1), math.radians(z)) @ Quaternion((0,1,0), math.radians(y)) @ Quaternion((1,0,0), math.radians(x))
            b.rotation_mode = 'QUATERNION'
            b.rotation_quaternion = rest[b.name].inverted() @ rotation @ rest[b.name]
            b.keyframe_insert('rotation_quaternion', frame=frame, group=b.name)
        hips = rig.pose.bones['Hips']
        hips.location = rest['Hips'].inverted() @ Vector((0,0,lift))
        hips.keyframe_insert('location', frame=frame, group='Hips')
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name,1,action)


def wings(bank, sweep=0):
    return {'Wing.L': (sweep,-bank,0), 'Wing.R': (sweep,bank,0),
        'Wingtip.L': (0,-bank*.72,sweep*.28), 'Wingtip.R': (0,bank*.72,-sweep*.28)}


def stride(cycle, amplitude):
    keys = []
    for index in range(9):
        phase = math.tau*index/8
        sway = math.sin(phase)
        angles = {'Chest': (3,0,4*sway)}
        if kind == 'sand':
            angles |= {'Head': (-1,0,-3*sway), 'Arm.R': (-5,0,4*sway), 'Arm.L': (5*sway,0,0)}
        elif kind == 'fire':
            angles |= wings(23*sway,5*sway) | {'Tail': (0,0,10*sway), 'Neck': (-6*sway,0,0)}
        else:
            for side, sign in [('L',1),('R',-1)]:
                travel = sway*sign
                angles[f'Thigh.{side}'] = (amplitude*travel,0,0)
                angles[f'Shin.{side}'] = (max(0,-travel)*amplitude*.8,0,0)
                angles[f'Arm.{side}'] = (-amplitude*travel*.31,0,0)
        lift = (.03 if kind in {'fire','sand'} else .013)*(1+math.cos(phase*2))*.5
        keys.append((cycle*index/8,lift,angles))
    return keys


def press(chest, left, right, forearm=0, lean=0, twist=0, open_arm=0):
    return {'Hips': (lean,0,twist*.28), 'Chest': (chest,0,twist), 'Head': (-chest*.4,0,-twist*.18),
        'Arm.L': (left,-open_arm,0), 'Arm.R': (right,open_arm,0),
        'Forearm.L': (forearm,0,0), 'Forearm.R': (forearm,0,0),
        'Thigh.L': (-lean*.6,0,0), 'Thigh.R': (-lean*.6,0,0),
        'Shin.L': (lean*.4,0,0), 'Shin.R': (lean*.4,0,0)}


ready = (0,0,{})
if kind == 'sand':
    wind, special_keys = 1.10, [
        (.23,.026,press(4,-20,-27,-18,0,-28,13)),
        (.76,.11,press(-13,-59,-82,-19,-4,34,23)),
        (1.10,.072,press(10,-64,-32,-8,0,7,31)),
        (1.35,.06,press(2,-18,-23,-10,0,-13,16))]
elif kind == 'frost':
    wind, special_keys = 1.15, [
        (.29,-.036,press(14,15,21,-16,10,2,8)),
        (.88,.019,press(-15,-119,-125,-18,-7,-2,16)),
        (1.15,-.117,press(31,-32,-32,-5,22,0,8)),
        (1.43,-.077,press(19,-24,-24,-12,12,0,10))]
elif kind == 'knight':
    wind, special_keys = 1.15, [
        (.23,-.064,press(22,-21,18,-12,14,-14,7)),
        (.71,.014,press(-15,-24,-123,-18,-9,-24,11)),
        (.98,0,press(-9,-21,-153,-15,-6,-3,3)),
        (1.15,-.09,press(32,-62,-39,-4,23,13,4)),
        (1.43,-.04,press(12,-38,-24,-8,7,0,3))]
elif kind == 'fire':
    wind, special_keys = 1.10, [
        (.35,.06,wings(20,-8)|{'Neck':(-16,0,0),'Head':(-12,0,0),'Tail':(0,0,-14)}),
        (.87,.17,wings(-28,-9)|{'Chest':(-10,0,0),'Neck':(-24,0,0),'Head':(-8,0,0)}),
        (1.10,.10,wings(36,11)|{'Chest':(13,0,0),'Neck':(29,0,0),'Head':(13,0,0),'Tail':(-10,0,11)}),
        (1.40,.06,wings(21,3)|{'Chest':(12,0,0),'Neck':(17,0,0),'Head':(3,0,0)})]
else:
    wind, special_keys = 1.20, [
        (.34,-.023,press(16,17,-6,-12,10,-18,4)),
        (.88,.02,press(-15,-45,-134,-8,-5,-13,19)),
        (1.20,-.108,press(32,-23,-50,-3,21,17,7)),
        (1.49,-.044,press(17,-17,-24,-12,12,3,9))]
clip('idle', [(0,0,{}), (.9,.016,({'Chest':(-3,0,2),'Head':(3,0,-3)} if kind!='fire' else wings(12))),
    (1.8,0,{})])
clip('walk', stride(1.42,24))
clip('run', stride(.8,31))
clip('special', [ready, *special_keys, (wind+.82,0,{})])
clip('attack', [ready, (.24, .011, special_keys[1][2]), (.45, -.04, special_keys[2][2]), (.84,0,{})])
clip('fall', [ready, (.47,-.027,{'Hips':(-18,0,12)}), (1.28,-.28,{'Hips':(40,-49,11),'Chest':(14,11,0)}),
    (1.65,-.28,{'Hips':(40,-49,11),'Chest':(14,11,0)})])

# Keep one map pair per material, at most 1024 square. Ice uses its four original texture sets at 512.
mesh.select_set(True)
with tempfile.TemporaryDirectory(prefix='ashen-boss-maps-') as tmp:
    for mi, material in enumerate(mesh.data.materials):
        material.use_nodes = True
        tree = material.node_tree
        shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        for name, value in [('Metallic',.1 if kind=='knight' else .025),('Roughness',.55 if kind in {'frost','knight'} else .8)]:
            for link in list(shader.inputs[name].links):
                tree.links.remove(link)
            shader.inputs[name].default_value = value
        if kind == 'frost':
            for suffix, socket in [('albedo','Base Color'),('normal','Normal')]:
                file = source/'textures'/f'{material.name}_{suffix}.jpg'
                if not file.exists():
                    continue
                tex = tree.nodes.new('ShaderNodeTexImage')
                tex.image = bpy.data.images.load(str(file))
                if suffix == 'normal':
                    tex.image.colorspace_settings.name = 'Non-Color'
                    normal = tree.nodes.new('ShaderNodeNormalMap')
                    tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
                    tree.links.new(normal.outputs[0], shader.inputs[socket])
                else:
                    tree.links.new(tex.outputs['Color'], shader.inputs[socket])
        for i, socket in enumerate(['Base Color','Normal']):
            links = shader.inputs[socket].links
            if not links:
                continue
            node = links[0].from_node
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = .72
                color_links = node.inputs['Color'].links
                if not color_links:
                    continue
                node = color_links[0].from_node
            if node.type != 'TEX_IMAGE' or not node.image:
                continue
            image = node.image
            limit = 512 if kind=='frost' else 1024
            width,height = image.size
            ratio = min(1, limit/max(width,height))
            image.scale(max(1, round(width*ratio)), max(1, round(height*ratio)))
            image.file_format = 'JPEG'
            target = str(Path(tmp)/f'{mi}-{i}.jpg')
            image.save(filepath=target, quality=89)
            node.image = bpy.data.images.load(target)
            node.image.colorspace_settings.name = 'sRGB' if i==0 else 'Non-Color'
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
        export_animation_mode='NLA_TRACKS', export_anim_slide_to_zero=True, export_force_sampling=True,
        export_image_format='JPEG', export_jpeg_quality=89)
print(kind, len(mesh.data.polygons), len(segments), output.stat().st_size)
