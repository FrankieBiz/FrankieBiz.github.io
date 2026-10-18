"""Pad environment map: an equirect HDR rendered from inside the launch site.

The site lights glossy surfaces with this (PMREM) so the hull reflects the
real floodlamps, their pools on the pad, the tower and the distant facility
lights. Run tools/blender/pad.py first (this imports its pad.glb).

Outputs (assets-src/blender/): env-pad-high.hdr (1024x512),
env-pad-medium.hdr / env-pad-low.hdr (512x256), env-pad-preview.png.
The layout is three.js's equirect convention (centre column = +X, image top = +Y).
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common  # noqa: E402
from pad import AIM, FLOODS, POLE_H, B  # noqa: E402

PROBE = B(0, 6, 0)  # mid-hull, where reflections are seen
SIZE = (1024, 512)
SMALL = (512, 256)

# Linear colours from src/scene/Sky.ts and LaunchPad.ts (three converts the hex to linear).
HORIZON = (0.0103, 0.0242, 0.0545)
ZENITH = (0.0012, 0.0021, 0.0040)
GLOW = (0.0262, 0.0595, 0.1329)
FROST = (0.807, 0.855, 0.913)
WARM = (1.0, 0.693, 0.429)
FLOOD = (0.737, 0.807, 1.0)
# Lamp faces in the reflection. The site's glow material is tuned for bloom; real
# floodlamps outshine the night sky by orders of magnitude, which is what puts
# crisp glints on the hull once PMREM blurs them by roughness.
LAMP_STRENGTH = 60


def mulberry32(seed):
    """Same sequence as mulberry32 in src/scene/textures.ts."""
    state = [seed & 0xFFFFFFFF]

    def imul(a, b):
        return (a * b) & 0xFFFFFFFF

    def rand():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = state[0]
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def emitter(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    mat.node_tree.links.new(em.outputs[0], out.inputs["Surface"])
    return mat


def colour(sockets, name):
    """The colour-typed socket called `name` (Mix nodes have one per data type)."""
    return next(s for s in sockets if s.name == name and s.type == "RGBA")


def sky_world():
    """The site's night dome (Sky.ts DOME_FRAG) as world nodes, by elevation."""
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    nt = world.node_tree
    n, link = nt.nodes, nt.links.new
    coord = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ")
    link(coord.outputs["Generated"], sep.inputs[0])
    h = sep.outputs["Z"]

    def smooth(lo, hi):
        m = n.new("ShaderNodeMapRange")
        m.interpolation_type = "SMOOTHSTEP"
        m.inputs["From Min"].default_value, m.inputs["From Max"].default_value = lo, hi
        link(h, m.inputs["Value"])
        return m.outputs["Result"]

    def mix(a, b, fac, blend="MIX"):
        m = n.new("ShaderNodeMix")
        m.data_type, m.blend_type = "RGBA", blend
        link(fac, m.inputs["Factor"])
        for name, value in (("A", a), ("B", b)):
            slot = colour(m.inputs, name)
            if isinstance(value, tuple):
                slot.default_value = (*value, 1)
            else:
                link(value, slot)
        return colour(m.outputs, "Result")

    night = mix(HORIZON, ZENITH, smooth(-0.02, 0.55))
    # + glow * exp(-|h| * 16) * 0.55
    absh = n.new("ShaderNodeMath")
    absh.operation = "ABSOLUTE"
    link(h, absh.inputs[0])
    scaled = n.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY"
    link(absh.outputs[0], scaled.inputs[0])
    scaled.inputs[1].default_value = -16
    ex = n.new("ShaderNodeMath")
    ex.operation = "EXPONENT"
    link(scaled.outputs[0], ex.inputs[0])
    glow = mix(night, tuple(c * 0.55 for c in GLOW), ex.outputs[0], "ADD")
    below = n.new("ShaderNodeMath")
    below.operation = "SUBTRACT"
    below.inputs[0].default_value = 1
    link(smooth(-0.3, 0.0), below.inputs[1])
    col = mix(glow, tuple(c * 0.6 for c in ZENITH), below.outputs[0])
    link(col, n["Background"].inputs["Color"])
    return world


def fog_volume():
    """Ground-hugging haze toward the horizon colour, like the site's exp2 fog."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 14))
    box = bpy.context.active_object
    box.name = "Fog"
    box.scale = (1200, 1200, 30)
    mat = bpy.data.materials.new("Fog")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    absorb = nt.nodes.new("ShaderNodeVolumeAbsorption")
    absorb.inputs["Density"].default_value = 0.012
    absorb.inputs["Color"].default_value = (0, 0, 0, 1)
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*HORIZON, 1)
    emit.inputs["Strength"].default_value = 0.012
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(absorb.outputs[0], add.inputs[0])
    nt.links.new(emit.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs["Volume"])
    common.assign(box, mat)


def ground():
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=700, fill_type="NGON")
    g = bpy.context.active_object
    g.name = "Ground"
    common.assign(g, common.material("Ground", (0.0035, 0.005, 0.008), roughness=1))
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=16, fill_type="NGON", location=(0, 0, 0.01))
    pad = bpy.context.active_object
    pad.name = "PadDisc"
    common.assign(pad, common.material("PadConcrete", (0.02, 0.025, 0.033), roughness=0.9))


def flood_lights():
    for i, (fx, fz) in enumerate(FLOODS):
        data = bpy.data.lights.new(f"Flood{i}", "SPOT")
        data.energy = 9000
        data.color = FLOOD
        data.spot_size = 0.84
        data.spot_blend = 0.55
        data.shadow_soft_size = 0.4
        light = bpy.data.objects.new(f"Flood{i}", data)
        bpy.context.scene.collection.objects.link(light)
        light.location = B(fx, POLE_H + 0.1, fz)
        common.look_at(light, AIM)


def facility_lights():
    """Distant lights and the perimeter ring, placed exactly as LaunchPad.ts does."""
    rand = mulberry32(41)
    frost, warm = emitter("Frost", FROST, 6), emitter("Warm", WARM, 6)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=1)
    proto = bpy.context.active_object
    for i in range(160):
        a = rand() * math.pi * 2
        r = 70 + rand() * 180
        y = 0.3 + rand() * 4
        mat = warm if rand() > 0.7 else frost
        size = 1.5 + rand() * 2.5
        dot = proto.copy()
        dot.data = proto.data.copy()
        bpy.context.scene.collection.objects.link(dot)
        dot.location = B(math.cos(a) * r, y, math.sin(a) * r)
        dot.scale = (0.12 * size,) * 3
        common.assign(dot, mat)
    ring = emitter("Ring", FROST, 8)
    for i in range(36):
        a = i / 36 * math.pi * 2
        dot = proto.copy()
        dot.data = proto.data.copy()
        bpy.context.scene.collection.objects.link(dot)
        dot.location = B(math.cos(a) * 14.4, 0.08, math.sin(a) * 14.4)
        dot.scale = (0.05,) * 3
        common.assign(dot, ring)
    bpy.data.objects.remove(proto, do_unlink=True)


def render(path, size, fmt, samples):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.cycles.samples = samples
    scene.render.image_settings.file_format = fmt
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    opts = common.args()
    common.reset()
    out = common.ensure_dir(opts.out)
    scene = bpy.context.scene

    bpy.ops.import_scene.gltf(filepath=os.path.join(out, "pad.glb"))
    # The rocket isn't in its own reflection, and neither are the arms that dock against it.
    for obj in [o for o in scene.objects if o.name.startswith("Arm_")]:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mat in [m for m in bpy.data.materials if m.name.startswith("Lens")]:
        for node in mat.node_tree.nodes:
            if "Emission Strength" in node.inputs:
                node.inputs["Emission Strength"].default_value = LAMP_STRENGTH
    ground()
    flood_lights()
    facility_lights()
    fog_volume()
    scene.world = sky_world()

    cam_data = bpy.data.cameras.new("Probe")
    cam_data.type = "PANO"
    cam_data.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("Probe", cam_data)
    scene.collection.objects.link(cam)
    cam.location = Vector(PROBE)
    # Look along +X (three's equirect centre) with Z up.
    cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    scene.camera = cam

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = True
    scene.cycles.volume_step_rate = 4
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"

    high = os.path.join(out, "env-pad-high.hdr")
    render(high, SIZE, "HDR", 96)
    img = bpy.data.images.load(high)
    img.scale(*SMALL)
    for tier in ("medium", "low"):
        img.filepath_raw = os.path.join(out, f"env-pad-{tier}.hdr")
        img.file_format = "HDR"
        img.save()

    if not opts.no_preview:
        scene.view_settings.view_transform = "AgX"
        render(os.path.join(out, "env-pad-preview.png"), SIZE, "PNG", 32)
    common.save_blend(os.path.join(out, "env-pad.blend"))
    print("[env] done")


if __name__ == "__main__":
    main()
