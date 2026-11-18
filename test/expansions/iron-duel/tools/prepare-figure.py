"""Split the CC0 Superhero Male into dressable pieces, keeping its original rig and vertex weights."""
import argparse
import copy
import json
import math
import struct
from pathlib import Path

def load(path):
    source = path.read_bytes()
    magic, version, total, json_len = struct.unpack_from("<4sIII", source)
    assert magic == b"glTF" and version == 2 and total == len(source)
    model = json.loads(source[20:20 + json_len])
    return model, source[28 + json_len:]

def bake(source, output):
    old, data = load(source)
    result = {k: copy.deepcopy(old[k]) for k in ("asset", "scene", "scenes", "nodes", "skins") if k in old}
    result.update(accessors=[], bufferViews=[], meshes=[], materials=[])
    result["asset"]["copyright"] = "Superhero Male by Quaternius, CC0 1.0. Mesh partitioned for Ashen Arena."
    payload = bytearray()
    known = {}
    colors = {
        "SkinTorso": (0.48, 0.23, 0.13), "SkinArms": (0.48, 0.23, 0.13),
        "SkinHead": (0.48, 0.23, 0.13), "SkinFeet": (0.45, 0.20, 0.12),
        "Trousers": (0.05, 0.055, 0.065), "Waist": (0.12, 0.064, 0.035),
        "Eyes": (0.68, 0.66, 0.54), "Brows": (0.045, 0.025, 0.018),
    }
    materials = {}
    for name, rgb in colors.items():
        materials[name] = len(result["materials"])
        result["materials"].append({
            "name": name,
            "pbrMetallicRoughness": {"baseColorFactor": [*rgb, 1.0], "roughnessFactor": 0.78, "metallicFactor": 0},
        })

    def view(bytes_, **hints):
        while len(payload) % 4:
            payload.append(0)
        item = {"buffer": 0, "byteOffset": len(payload), "byteLength": len(bytes_), **hints}
        payload.extend(bytes_)
        result["bufferViews"].append(item)
        return len(result["bufferViews"]) - 1

    def old_view(i):
        src = old["bufferViews"][i]
        offset = src.get("byteOffset", 0)
        return data[offset:offset + src["byteLength"]]

    def access(i):
        if i not in known:
            a = copy.deepcopy(old["accessors"][i])
            original = old["bufferViews"][a["bufferView"]]
            a["bufferView"] = view(old_view(a["bufferView"]),
                                   **{k: original[k] for k in ("target","byteStride") if k in original})
            result["accessors"].append(a)
            known[i] = len(result["accessors"]) - 1
        return known[i]

    def values(i, code, n):
        a = old["accessors"][i]
        raw = old_view(a["bufferView"])
        fmt = "<" + code * n
        stride = old["bufferViews"][a["bufferView"]].get("byteStride", struct.calcsize(fmt))
        return [struct.unpack_from(fmt, raw, a.get("byteOffset", 0) + stride * x) for x in range(a["count"])]

    def index(values):
        result["accessors"].append({
            "bufferView": view(struct.pack("<" + "H" * len(values), *values), target=34963),
            "componentType": 5123, "count": len(values), "type": "SCALAR", "min": [min(values)], "max": [max(values)]
        })
        return len(result["accessors"]) - 1

    def attribute(rows, code, shape, bounds=False):
        width = len(rows[0])
        raw = b"".join(struct.pack("<" + code * width, *row) for row in rows)
        item = {"bufferView": view(raw, target=34962), "componentType": {"f": 5126, "H": 5123}[code],
                "count": len(rows), "type": shape}
        if bounds:
            item.update(min=[min(column) for column in zip(*rows)],
                        max=[max(column) for column in zip(*rows)])
        result["accessors"].append(item)
        return len(result["accessors"]) - 1

    joint = {result["nodes"][node]["name"]: n for n, node in enumerate(result["skins"][0]["joints"])}

    def garment(shells, material):
        positions, normals, joints, weights, triangles = [], [], [], [], []
        slices = 24
        for rings in shells:
            start = len(positions)
            for r, (y, x, rx, rz, influences) in enumerate(rings):
                for i in range(slices):
                    a = i * math.tau / slices
                    # Small folds in the fabric, independent of the body mesh.
                    fold = 1 + .038 * math.cos(5 * a + r * .81) + .022 * math.sin(9 * a - r)
                    c, s = math.cos(a), math.sin(a)
                    positions.append((x + c * rx * fold, y, s * rz * fold - .008))
                    nx, nz = c / rx, s / rz
                    length = math.hypot(nx, nz)
                    normals.append((nx / length, 0, nz / length))
                    joints.append(tuple(joint[name] for name, _ in influences) + (0,) * (4 - len(influences)))
                    weights.append(tuple(value for _, value in influences) + (0,) * (4 - len(influences)))
                    if r < len(rings) - 1:
                        a0 = start + r * slices + i
                        b0 = start + r * slices + ((i + 1) % slices)
                        triangles.extend((a0, b0, a0 + slices, b0, b0 + slices, a0 + slices))
        attrs = {"POSITION": attribute(positions, "f", "VEC3", True),
                 "NORMAL": attribute(normals, "f", "VEC3"),
                 "JOINTS_0": attribute(joints, "H", "VEC4"),
                 "WEIGHTS_0": attribute(weights, "f", "VEC4")}
        return {"attributes": attrs, "indices": index(triangles), "material": materials[material]}

    pelvis = [("pelvis", 1)]
    hips = [(1.073, 0, .223, .141, pelvis), (1.023, 0, .241, .158, pelvis),
            (.958, 0, .241, .167, pelvis),
            (.904, 0, .231, .159, [("pelvis", .72), ("thigh_r", .14), ("thigh_l", .14)]),
            (.859, 0, .212, .13, [("pelvis", .54), ("thigh_r", .23), ("thigh_l", .23)]),
            (.840, 0, .107, .098, pelvis), (.835, 0, .003, .003, pelvis)]
    belt = [(1.079, 0, .224, .143, pelvis), (1.069, 0, .233, .151, pelvis),
            (1.033, 0, .247, .161, pelvis), (1.022, 0, .246, .163, pelvis)]
    legs = []
    for side, direction in [("l", 1), ("r", -1)]:
        thigh, calf, foot = ("thigh_" + side, "calf_" + side, "foot_" + side)
        legs.append([(y, direction * cx, rx, rz, weights) for y, cx, rx, rz, weights in [
            (.951, .103, .116, .129, [("pelvis", .82), (thigh, .18)]),
            (.870, .117, .121, .135, [("pelvis", .36), (thigh, .64)]),
            (.763, .120, .113, .122, [(thigh, 1)]),
            (.640, .118, .103, .105, [(thigh, .95), (calf, .05)]),
            (.549, .116, .109, .107, [(thigh, .5), (calf, .5)]),
            (.445, .113, .096, .098, [(thigh, .08), (calf, .92)]),
            (.319, .110, .089, .093, [(calf, 1)]),
            (.199, .105, .074, .080, [(calf, .9), (foot, .1)]),
            (.147, .103, .066, .076, [(calf, .72), (foot, .28)]),
            (.137, .103, .061, .071, [(calf, .66), (foot, .34)]),
        ]])

    for skin in result["skins"]:
        skin["inverseBindMatrices"] = access(skin["inverseBindMatrices"])
    for no, mesh in enumerate(old["meshes"]):
        primitive = mesh["primitives"][0]
        attrs = {key: access(primitive["attributes"][key]) for key in ("POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0")}
        if no < 2:
            parts = [{"attributes": attrs, "indices": access(primitive["indices"]),
                      "material": materials["Brows" if no == 0 else "Eyes"]}]
        else:
            pos = values(primitive["attributes"]["POSITION"], "f", 3)
            code = {5121: "B", 5123: "H", 5125: "I"}[old["accessors"][primitive["indices"]]["componentType"]]
            ids = [v[0] for v in values(primitive["indices"], code, 1)]
            grouped = {key: [] for key in ("SkinTorso","SkinArms","SkinHead","SkinFeet","Trousers","Waist")}
            for i in range(0, len(ids), 3):
                tri = ids[i:i+3]
                xx, yy, _ = [sum(pos[j][k] for j in tri) / 3 for k in range(3)]
                region = ("SkinFeet" if yy < 0.145 else "Trousers" if yy < 0.99 else "Waist" if yy < 1.042
                    else "SkinHead" if yy > 1.54 and abs(xx) < 0.17 else "SkinArms" if abs(xx) > 0.235
                    else "SkinTorso")
                grouped[region].extend(tri)
            parts = [{"attributes": attrs, "indices": index(ids), "material": materials[name]}
                     for name, ids in grouped.items() if ids and name not in ("Trousers", "Waist")]
            parts.extend([garment([hips, *legs], "Trousers"), garment([belt], "Waist")])
        result["meshes"].append({"name": mesh["name"],"primitives": parts})

    while len(payload) % 4:
        payload.append(0)
    result["buffers"] = [{"byteLength": len(payload)}]
    encoded = json.dumps(result,separators=(",",":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    full = 28 + len(encoded) + len(payload)
    output.write_bytes(struct.pack("<4sIII4s",b"glTF",2,full,len(encoded),b"JSON") + encoded
                       + struct.pack("<I4s",len(payload),b"BIN\0") + payload)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    bake(args.source,args.output)
