"""Cook the author-provided CC0 FBX props into one metre-scale glTF catalogue.
   Run with Blender: blender -b --python prepare-weapons.py -- SOURCE_FBX_DIR OUTPUT_GLB
"""
from pathlib import Path
from mathutils import Vector
import bpy
import sys

# Stable weapon ID, author file, handle centre on the original long axis, reach in metres above the hand.
ITEMS = [
    ("sword","Sword",-0.34,1.07), ("axe","Axe",-0.85,0.98),
    ("spear","Spear",0.10,1.76), ("mace","Hammer_Small",-0.58,0.91),
    ("sabre","Sword_2",-0.34,1.10), ("claymore","Claymore",0.20,1.34),
    ("greatsword","Sword_Big",0.16,1.25), ("dagger","Dagger",-0.24,0.53),
    ("dirk","Dagger_2",-0.21,0.62), ("hatchet","Axe_Small",-0.62,0.72),
    ("greataxe","Axe_Double",-1.16,1.18), ("warhammer","Hammer_Double",-0.86,1.13),
    ("scythe","Scythe",-1.12,1.40),
]

def bake(folder, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kept = []
    mats = {}
    for tag, source, grip, reach in ITEMS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=str(folder / (source+".fbx")))
        imported = set(bpy.data.objects)-before
        meshes = [o for o in imported if o.type=="MESH"]
        top = max((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)
        scale = reach/(top-grip)
        group = bpy.data.objects.new(tag,None)
        bpy.context.collection.objects.link(group)
        kept.append(group)
        for i,o in enumerate(meshes):
            world = o.matrix_world.copy()
            mesh = o.data.copy()
            obj = bpy.data.objects.new(tag+"_"+str(i),mesh)
            bpy.context.collection.objects.link(obj)
            obj.parent = group
            kept.append(obj)
            for v in mesh.vertices:
                p = world @ v.co
                v.co = Vector((p.x*scale,-p.y*scale,(p.z-grip)*scale))
            for j, material in enumerate(list(mesh.materials)):
                name = material.name.split(".")[0]
                if name not in mats:
                    mat = bpy.data.materials.new("Forge "+name)
                    mat.diffuse_color = material.diffuse_color
                    mat.metallic = 0.68 if ("Steel" in name or "Gold" in name) else 0
                    mat.roughness = 0.37 if mat.metallic else 0.81
                    mats[name] = mat
                mesh.materials[j] = mats[name]
            mesh.update()
        for o in imported:
            bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in kept:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",use_selection=True,
                             export_animations=False,export_materials="EXPORT",export_texcoords=False)

if __name__ == "__main__":
    arg = sys.argv[sys.argv.index("--")+1:]
    bake(Path(arg[0]),Path(arg[1]))
