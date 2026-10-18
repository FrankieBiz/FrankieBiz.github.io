"""Shared helpers for the headless Blender asset scripts.

Every script: reset to a clean, deterministic scene, build, save a .blend for
anyone curious, export a GLB for the site and render a preview PNG for review.
"""
import argparse
import os
import random
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "assets-src", "blender")


def args(extra=None):
    """Parse arguments after Blender's `--` separator."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=OUT_DIR)
    parser.add_argument("--no-preview", action="store_true")
    if extra:
        extra(parser)
    return parser.parse_args(argv)


def reset(seed=7):
    """Empty scene, metric units, deterministic randomness."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(seed)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def material(name, color=(0.8, 0.8, 0.8), roughness=0.5, metallic=0.0, emission=None, strength=1.0):
    """A Principled BSDF material (exports cleanly to glTF PBR)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def preview(path, camera_location, target, size=(960, 540), samples=24, lens=50):
    """Render a quick Cycles CPU preview with a simple three-light setup."""
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = Vector(camera_location)
    look_at(cam, target)
    scene.camera = cam

    def light(name, kind, location, energy, color=(1, 1, 1), size_=1.0):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.size = size_
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = Vector(location)
        look_at(obj, target)
        return obj

    light("Key", "AREA", (6, -6, 8), 900, (1.0, 0.97, 0.92), 4)
    light("Fill", "AREA", (-7, -4, 3), 220, (0.75, 0.82, 1.0), 6)
    light("Rim", "AREA", (0, 8, 6), 600, (0.85, 0.9, 1.0), 3)

    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.025, 0.035, 1)
    scene.world = world

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

    # Preview rig is not part of the asset.
    for obj in [o for o in scene.objects if o.name.startswith(("PreviewCam", "Key", "Fill", "Rim"))]:
        bpy.data.objects.remove(obj, do_unlink=True)


def save_blend(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)


def export_glb(path, objects=None):
    """Export to GLB with tangents (for normal maps), Y-up, modifiers applied."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects or bpy.context.scene.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_tangents=True,
        export_yup=True,
    )


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path


def triangle_count(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        mesh = obj.evaluated_get(depsgraph).to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        obj.evaluated_get(depsgraph).to_mesh_clear()
    return total
