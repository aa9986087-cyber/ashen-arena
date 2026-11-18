"""Bake the arena fighter from CC0 MakeHuman geometry and the Quaternius animation rig."""
import argparse
import copy
import json
import struct
from io import BytesIO
from PIL import Image
from importlib import import_module
from pathlib import Path

def load(path):
    source = path.read_bytes()
    magic, version, total, json_len = struct.unpack_from("<4sIII", source)
    assert magic == b"glTF" and version == 2 and total == len(source)
    model = json.loads(source[20:20 + json_len])
    return model, source[28 + json_len:]

def bake(source, makehuman, clothes, output):
    old, data = load(source)
    result = {k: copy.deepcopy(old[k]) for k in ("asset", "scene", "scenes", "nodes", "skins") if k in old}
    result.update(accessors=[], bufferViews=[], meshes=[], materials=[])
    result["asset"]["copyright"] = "MakeHuman body and weights, Margaret Toigo wool trousers, Quaternius rig. CC0 1.0."
    payload = bytearray()
    known = {}
    colors = {
        "SkinTorso": (0.48, 0.23, 0.13), "SkinArms": (0.48, 0.23, 0.13),
        "SkinHead": (0.48, 0.23, 0.13), "SkinFeet": (0.45, 0.20, 0.12),
        "Trousers": (0.88, 0.88, 0.88),
        "Eyes": (0.43, 0.40, 0.36), "Iris": (0.032, 0.021, 0.016),
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
            item.update(min=[float(min(column)) for column in zip(*rows)],
                        max=[float(max(column)) for column in zip(*rows)])
        result["accessors"].append(item)
        return len(result["accessors"]) - 1

    joint = {result["nodes"][node]["name"]: n for n, node in enumerate(result["skins"][0]["joints"])}

    image_path = clothes / "Pants_wool.png"
    with Image.open(image_path) as source_image:
        image = source_image.convert("RGB")
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        texture = BytesIO()
        image.save(texture, format="JPEG", quality=90, optimize=True)
    result["images"] = [{"bufferView": view(texture.getvalue()), "mimeType": "image/jpeg"}]
    result["textures"] = [{"source": 0}]
    result["materials"][materials["Trousers"]]["pbrMetallicRoughness"]["baseColorTexture"] = {"index":0}

    fitter = import_module("makehuman-upper")
    inverse = values(old["skins"][0]["inverseBindMatrices"], "f", 16)
    for skin in result["skins"]:
        skin["inverseBindMatrices"] = access(skin["inverseBindMatrices"])
    parts = []
    for name, xyz, normal, uv, ids, weights, triangles in fitter.fit(makehuman, clothes, joint, inverse):
        attrs = {"POSITION": attribute(xyz, "f", "VEC3", True),
                 "NORMAL": attribute(normal, "f", "VEC3"),
                 "TEXCOORD_0": attribute(uv, "f", "VEC2"),
                 "JOINTS_0": attribute(ids, "H", "VEC4"),
                 "WEIGHTS_0": attribute(weights, "f", "VEC4")}
        parts.append({"attributes": attrs, "indices": index(triangles), "material": materials[name]})
    for node in result["nodes"]:
        if node.get("mesh") == 2:
            node["mesh"] = 0
        elif "mesh" in node:
            node.pop("mesh")
            node.pop("skin", None)
    result["meshes"] = [{"name": "ArenaFighter", "primitives": parts}]

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
    parser.add_argument("makehuman", type=Path)
    parser.add_argument("clothes", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    bake(args.source,args.makehuman,args.clothes,args.output)
