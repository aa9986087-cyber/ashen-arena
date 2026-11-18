"""Fit the CC0 MakeHuman adult mesh to the arena's existing animation skeleton."""
import json
from collections import defaultdict
from pathlib import Path

import numpy as np


def fit(source: Path, clothes: Path, joints, inverse_binds):
    positions, texcoords, groups = [], [], defaultdict(list)
    labels = []
    for line in (source / "base.obj").open():
        tokens = line.split()
        if not tokens:
            continue
        match tokens[0]:
            case "v":
                positions.append([float(x) for x in tokens[1:4]])
            case "vt":
                texcoords.append([float(tokens[1]), 1 - float(tokens[2])])
            case "g":
                labels = tokens[1:]
            case "f":
                corners = [tuple(int(v) - 1 for v in s.split("/")[:2]) for s in tokens[1:]]
                for label in labels:
                    groups[label].append(corners)

    pos = np.array(positions)
    targets = {
        "asian-male-young": .65,
        "caucasian-male-young": .35,
        "universal-male-young-maxmuscle-averageweight": .42,
    }
    for name, strength in targets.items():
        with (source / (name + ".target")).open() as target:
            for line in target:
                parts = line.split()
                if parts and parts[0].isdigit():
                    idx, *offset = parts
                    pos[int(idx)] += np.array(offset, dtype=float) * strength

    def center(name):
        ids = sorted({i for face in groups[name] for i, _ in face})
        return pos[ids].mean(axis=0)

    bind = np.linalg.inv(np.asarray(inverse_binds).reshape(-1, 4, 4).transpose(0, 2, 1))
    align = lambda name: bind[joints[name], :3, 3]
    ankle = center("joint-l-ankle")
    knee = center("joint-l-knee")
    hip = center("joint-l-upper-leg")
    foot_bottom = min(pos[v,1] for face in groups["body"] for v, _ in face)
    levels = [foot_bottom, ankle[1], knee[1], hip[1], 1.55]
    leg_x = [ankle[0], ankle[0], knee[0], hip[0], 0]
    leg_z = [ankle[2], ankle[2], knee[2], hip[2], 0]
    rig_hip, rig_calf, rig_foot = (align(name) for name in ("thigh_l","calf_l","foot_l"))
    offset_x = np.array([rig_foot[0], rig_foot[0], rig_calf[0], rig_hip[0], 0]) - np.array(leg_x) * .1175
    offset_z = np.array([rig_foot[2]+.042, rig_foot[2]+.042, rig_calf[2]+.042, rig_hip[2]+.042, 0]) - np.array(leg_z) * .119

    def scale(vertices):
        out = vertices * [.1175, .105, .119] + [0, .88, -.042]
        heights = vertices[:,1]
        outer = np.clip(np.abs(vertices[:,0]) / .51, 0, 1)
        out[:,0] += np.interp(heights, levels, offset_x) * np.sign(vertices[:,0]) * outer
        out[:,2] += np.interp(heights, levels, offset_z)
        out[:,1] = np.interp(heights,
            [foot_bottom, ankle[1], knee[1], .67, 3, 5.07, 6.08, 7.01, 8.52],
            [.008, rig_foot[1], rig_calf[1], .949, 1.16, 1.455, 1.520, 1.599, 1.812])
        return out

    mapped = scale(pos)

    def frame(primary, front):
        forward = primary / np.linalg.norm(primary)
        tangent = front - forward * front.dot(forward)
        tangent /= np.linalg.norm(tangent)
        return np.column_stack((forward, tangent, np.cross(forward, tangent)))

    def retarget(src, dst, source_roll, target_roll):
        ds, dt = src[1] - src[0], dst[1] - dst[0]
        a, b = frame(ds, source_roll), frame(dt, target_roll)
        coords = (pos - src[0]) @ a
        coords *= [np.linalg.norm(dt) / np.linalg.norm(ds), .098, .104]
        return coords @ b.T + dst[0]

    weights = json.loads((source / "weights.json").read_text())["weights"]
    influence = defaultdict(lambda: defaultdict(float))
    arms_used = np.zeros(len(pos))
    arm_positions = np.zeros_like(pos)
    bone_names = {"root":"pelvis", "spine05":"pelvis", "spine04":"spine_01", "spine03":"spine_02",
                  "spine02":"spine_03", "spine01":"spine_03", "neck01":"neck_01", "neck02":"neck_01",
                  "neck03":"Head", "pelvis":"pelvis"}
    front = np.array([0.,0.,1.])

    for side in ("l", "r"):
        suffix = "." + side.upper()
        root = "joint-" + side + "-"
        source_joints = [center(root + name) for name in ("shoulder","elbow","hand","finger-3-1")]
        dest_joints = [align(name + "_" + side) for name in ("upperarm","lowerarm","hand","middle_01")]
        source_roll = center(root + "finger-2-1") - center(root + "finger-5-1")
        dest_roll = align("index_01_" + side) - align("pinky_01_" + side)
        posed = [
            retarget(source_joints[:2], dest_joints[:2], front, front),
            retarget(source_joints[1:3], dest_joints[1:3], front, front),
            retarget(source_joints[2:], dest_joints[2:], source_roll, dest_roll),
        ]
        regions = [np.zeros(len(pos)) for _ in range(3)]
        for name, entries in weights.items():
            if not name.endswith(suffix):
                continue
            group = name[:-2]
            if group.startswith("upperarm"):
                region, bone = 0, "upperarm"
            elif group.startswith("lowerarm"):
                region, bone = 1, "lowerarm"
            elif group.startswith("finger"):
                region = 2
                finger = ["thumb","index","middle","ring","pinky"][int(group[6])-1]
                bone = finger + "_0" + group[-1]
            elif group.startswith("metacarpal") or group == "wrist":
                region, bone = 2, "hand"
            else:
                continue
            idx = joints.get(bone + "_" + side, joints["hand_" + side])
            for vertex, weight in entries:
                regions[region][vertex] += weight
                influence[vertex][idx] += weight
        for mask, transform in zip(regions, posed):
            arms_used += mask
            arm_positions += transform * mask[:, None]

    for name, entries in weights.items():
        group, _, side = name.partition(".")
        if group.startswith(("upperarm","lowerarm","finger","metacarpal")) or group == "wrist":
            continue
        if group in ("clavicle","shoulder01"):
            bone = "clavicle_" + side.lower()
        elif group == "breast":
            bone = "spine_03"
        elif group.startswith("upperleg"):
            bone = "thigh_" + side.lower()
        elif group.startswith("lowerleg"):
            bone = "calf_" + side.lower()
        elif group == "foot" or group.startswith("toe"):
            bone = ("foot_" if group == "foot" else "ball_") + side.lower()
        else:
            bone = bone_names.get(group, "Head")
        for vertex, weight in entries:
            influence[vertex][joints[bone]] += weight

    result_pos = mapped * (1 - np.minimum(1, arms_used[:, None])) + arm_positions / np.maximum(1, arms_used[:, None])
    clothing_points, clothing_weights, clothing_uv, clothing_faces = fit_clothes(clothes, pos, influence)
    fitted_clothes = scale(clothing_points)
    cutoff = float(np.percentile(fitted_clothes[:, 1], 99))
    hems = fitted_clothes[(fitted_clothes[:, 1] < .4)]
    hem = float(np.percentile(hems[:, 1], 5))
    partitions = defaultdict(list)
    for face in groups["body"]:
        ids = [i for i, _ in face]
        average = result_pos[ids].mean(axis=0)
        if arms_used[ids].mean() > .42 and abs(average[0]) > .23:
            surface = "SkinArms"
        elif average[1] >= 1.575 and abs(average[0]) < .126:
            surface = "SkinHead"
        elif average[1] >= cutoff - .012:
            surface = "SkinTorso"
        elif average[1] < hem + .038:
            surface = "SkinFeet"
        else:
            continue
        partitions[surface].append(face)

    eyes = [center("helper-" + side + "-eye") * [.1175,.105,.119] + [0,0,-.042] for side in ("l","r")]
    for i, side in enumerate(("l","r")):
        eye = eyes[i]
        eye[1] = np.interp(center("joint-"+side+"-eye")[1], [7.01,8.52], [1.599,1.812])
        for face in groups["helper-" + side + "-eye"]:
            ids = [i for i, _ in face]
            average = mapped[ids].mean(axis=0)
            iris = np.linalg.norm((average-eye)[[0,1]]) < .0075 and average[2] - eye[2] > .010
            partitions["Iris" if iris else "Eyes"].append(face)
            for v in ids:
                result_pos[v] = mapped[v]
                influence[v] = {joints["Head"]:1.0}

    body_faces = [face for section, faces in partitions.items() for face in faces]
    body_normals = vertex_normals(result_pos, body_faces)
    for section, faces in partitions.items():
        yield section, *attributes(result_pos, texcoords, body_normals, influence, faces)
    pants_normals = vertex_normals(fitted_clothes, clothing_faces)
    yield "Trousers", *attributes(fitted_clothes, clothing_uv, pants_normals, clothing_weights, clothing_faces)


def fit_clothes(folder, body, influence):
    """Apply the garment author's MakeClothes vertex bindings to this body shape."""
    garment = next(folder.glob("*.mhclo"))
    scale = np.ones(3)
    points, weights = [], []
    obj = None
    reading = False
    for line in garment.read_text().splitlines():
        t = line.split()
        if not t or t[0].startswith("#"):
            continue
        if t[0] == "obj_file":
            obj = folder / t[1]
        if t[0] in ("x_scale", "y_scale", "z_scale"):
            k = "xyz".index(t[0][0])
            a,b = map(int, t[1:3])
            scale[k] = abs(body[a,k] - body[b,k]) / float(t[3])
        if t[0] == "verts":
            reading = True
            continue
        if not reading:
            continue
        if not t[0].isdigit():
            break
        if len(t) == 1:
            a = int(t[0])
            points.append(body[a])
            weights.append(influence[a])
            continue
        ids = list(map(int, t[:3]))
        blend = np.array(t[3:6], dtype=float)
        correction = np.array(t[6:9], dtype=float) * scale
        points.append(blend @ body[ids] + correction)
        accumulated = defaultdict(float)
        for vertex, factor in zip(ids, np.maximum(0, blend)):
            for bone, weight in influence[vertex].items():
                accumulated[bone] += factor * weight
        weights.append(accumulated)

    uv, faces = [], []
    vertex_count = 0
    for line in obj.read_text().splitlines():
        t = line.split()
        if not t:
            continue
        if t[0] == "v":
            vertex_count += 1
        elif t[0] == "vt":
            uv.append((float(t[1]), 1 - float(t[2])))
        elif t[0] == "f":
            faces.append([tuple(int(v) - 1 for v in corner.split("/")[:2]) for corner in t[1:]])
    if len(points) != vertex_count:
        raise ValueError(f"Clothing bindings ({len(points)}) do not match the mesh ({vertex_count})")
    return np.array(points), weights, uv, faces


def vertex_normals(positions, faces):
    normals = np.zeros_like(positions)
    for face in faces:
        ids = [vertex for vertex, _ in face]
        for i in range(1, len(ids) - 1):
            a,b,c = ids[0],ids[i],ids[i+1]
            normal = np.cross(positions[b] - positions[a], positions[c] - positions[a])
            for v in (a,b,c):
                normals[v] += normal
    normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-9)
    return normals


def attributes(positions, tex, normals, influence, faces):
    coords, normal, uv, skin_indices, skin_weights, triangles = [], [], [], [], [], []
    known = {}
    for face in faces:
        ids = []
        for vertex, vt in face:
            key = (vertex, vt)
            if key not in known:
                known[key] = len(coords)
                coords.append(positions[vertex])
                normal.append(normals[vertex])
                uv.append(tex[vt])
                source = influence[vertex]
                if not source:
                    raise ValueError(f"Missing skin weights at vertex {vertex}")
                ranked = sorted(source.items(), key=lambda item: item[1], reverse=True)[:4]
                total = sum(value for _, value in ranked)
                skin_indices.append([i for i, _ in ranked] + [0] * (4 - len(ranked)))
                skin_weights.append([v / total for _, v in ranked] + [0] * (4 - len(ranked)))
            ids.append(known[key])
        for i in range(1, len(ids) - 1):
            triangles.extend((ids[0], ids[i], ids[i+1]))
    return coords, normal, uv, skin_indices, skin_weights, triangles
