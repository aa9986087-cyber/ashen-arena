import bpy,json,os,math,sys
from pathlib import Path
# blender -b --disable-autoexec SOURCE.blend --python prepare-actor.py -- TEXTURE_ROOT OUTPUT_DIR
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
if bpy.context.object and bpy.context.object.mode!='OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
keep={'Stand_Idle_0':'idle','Run':'run','Walk':'walk','Stand_Attack_4':'attack','Stand_Attack_6':'attack2','Stand_Attack_8':'attack3','Stand_Shield_Attack':'bash','Stand_Block_0':'block','Stand_Damage_0':'hurt','Fall':'fall','Run_To_Spin_Attack':'special'}
print('BLOCKS',[a.name for a in bpy.data.actions if 'Block' in a.name])
for a in list(bpy.data.actions):
 if a.name in keep:a.name=keep[a.name];a.use_fake_user=True
 else:bpy.data.actions.remove(a)
rig.animation_data_clear();rig.animation_data_create();rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
# Back duplicates are alternate equipment states. Keep the real held weapon pair only.
for name in ['_Shield_Kept_Back','_Sword_Kept']:
 o=bpy.data.objects.get(name)
 if o:bpy.data.objects.remove(o,do_unlink=True)
images={p.name:p for p in src.rglob('*.png')}
for image in bpy.data.images:
 if image.name=='Render Result':continue
 name=Path(image.filepath.replace('\\','/')).name
 candidates=[p for p in src.rglob(name)]
 if not candidates:continue
 # Armor uses the exact dark-aged steel variation from the artist's material.
 pick=next((p for p in candidates if 'Steel_Dark_Aged' in str(p)),candidates[0])
 image.filepath=str(pick);image.reload()
 if max(image.size)>1024:
  ratio=1024/max(image.size);image.scale(round(image.size[0]*ratio),round(image.size[1]*ratio))
 image.pack()
for mat in bpy.data.materials:
 if not mat.use_nodes:continue
 principled=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if principled:
  principled.inputs['Metallic'].default_value=0.75 if any(k in mat.name.lower() for k in ['armor','shield','sword']) else 0.05
  principled.inputs['Roughness'].default_value=0.46
# Keep real original animation names mapped to a small mobile-ready set.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
 if o.type in ['ARMATURE','MESH']:o.select_set(True)
bpy.context.view_layer.objects.active=rig
props=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
opts=dict(filepath=str(out/'model.glb'),export_format='GLB',use_selection=True,export_animations=True,export_skins=True,export_yup=True,export_force_sampling=True,export_image_format='JPEG',export_jpeg_quality=88)
if 'export_animation_mode' in props:opts['export_animation_mode']='ACTIONS'
bpy.ops.export_scene.gltf(**opts)
print('EXPORTED',os.path.getsize(out/'model.glb'))
