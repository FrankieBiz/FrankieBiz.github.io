"""Authored launch pad: service tower, launch mount, access arms, floodlight rigs.

Positions mirror src/scene/LaunchPad.ts. The site is Y-up and Blender Z-up;
B(x, y, z) converts a three.js position. Outputs (assets-src/blender/):
pad.glb, pad-ao.png (AO atlas on the "Lightmap" UV set), ground-ao.png
(contact shadows mapped to the pad disc's UVs), pad.blend, pad-preview.png.
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common  # noqa: E402


def B(x, y, z):
    """three.js (Y-up) position → Blender (Z-up)."""
    return (x, -z, y)


TOWER = {"x": -3.0, "z": -2.1, "w": 1.5, "h": 12.6, "level": 1.05}
ARM_LEVELS = [3.1, 6.5, 8.95]
MOUNT_TOP = 1.3
FLOODS = [(12.5, 9.5), (-13.0, 7.5), (11.0, -11.0), (-9.5, -12.5)]
AIM = B(0, 5.5, 0)
POLE_H = 9.0
PAD_RADIUS = 16.0


def beam(name, a, b, section):
    """A box from point a to b (Blender coords) with cross-section (width, depth)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    obj = common.box(name, (section[0], section[1], d.length), (a + b) / 2)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return obj


def cylinder(name, radius, depth, location, rotation=(0, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return obj


# ----------------------------------------------------------------- tower


def build_tower():
    cx, cy = TOWER["x"], -TOWER["z"]
    half, H, L = TOWER["w"] / 2, TOWER["h"], TOWER["level"]
    corners = [(cx - half, cy - half), (cx + half, cy - half), (cx + half, cy + half), (cx - half, cy + half)]
    parts = []
    for x, y in corners:  # I-section columns
        parts.append(common.box("ColWeb", (0.12, 0.03, H), (x, y, H / 2)))
        parts.append(common.box("ColFlange", (0.03, 0.12, H), (x, y, H / 2)))
    levels = int(H // L)
    for j in range(levels + 1):
        z = j * L
        for c in range(4):
            (ax, ay), (bx, by) = corners[c], corners[(c + 1) % 4]
            parts.append(beam("Girder", (ax, ay, z), (bx, by, z), (0.07, 0.09)))
            # Knee gussets where girders meet the columns.
            along = Vector((bx - ax, by - ay, 0)).normalized()
            base = Vector((ax, ay, z))
            if z + 0.24 <= H:
                parts.append(beam("Gusset", base + along * 0.02 + Vector((0, 0, 0.22)), base + along * 0.22 + Vector((0, 0, 0.02)), (0.06, 0.012)))
            if j < levels:
                parts.append(beam("Brace", (ax, ay, z), (bx, by, z + L), (0.05, 0.012)))
                parts.append(beam("Brace", (bx, by, z), (ax, ay, z + L), (0.05, 0.012)))
    # Platforms with railings at the arm levels and the top.
    for level in ARM_LEVELS + [H]:
        z = level - 0.25
        size = TOWER["w"] + 0.35
        parts.append(common.box("Platform", (size, size, 0.06), (cx, cy, z)))
        s = size / 2
        for px, py in [(-s, -s), (0, -s), (s, -s), (s, 0), (s, s), (0, s), (-s, s), (-s, 0)]:
            parts.append(common.box("Post", (0.04, 0.04, 1.0), (cx + px, cy + py, z + 0.5)))
        for rail_z in (0.5, 1.0):
            for (ax, ay), (bx, by) in [((-s, -s), (s, -s)), ((s, -s), (s, s)), ((s, s), (-s, s)), ((-s, s), (-s, -s))]:
                parts.append(beam("Rail", (cx + ax, cy + ay, z + rail_z), (cx + bx, cy + by, z + rail_z), (0.035, 0.035)))
    # Zig-zag stair flights inside the lattice.
    for j in range(levels):
        z0, z1 = j * L + 0.03, (j + 1) * L - 0.03
        x0, x1 = (cx - half + 0.18, cx + half - 0.18) if j % 2 == 0 else (cx + half - 0.18, cx - half + 0.18)
        for side in (-0.16, 0.16):
            parts.append(beam("Stringer", (x0, cy + side, z0), (x1, cy + side, z1), (0.03, 0.08)))
        for s in range(1, 7):
            t = s / 7
            parts.append(common.box("Step", (0.12, 0.3, 0.025), (x0 + (x1 - x0) * t, cy, z0 + (z1 - z0) * t)))
    # Cable tray up the outer face, and the lightning mast.
    tray_x = cx - half - 0.08
    parts.append(common.box("Tray", (0.05, 0.2, H), (tray_x, cy, H / 2)))
    z = 0.3
    while z < H:
        parts.append(common.box("TrayRung", (0.06, 0.22, 0.02), (tray_x - 0.02, cy, z)))
        z += 0.35
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.05, radius2=0.022, depth=3.4, location=(cx, cy, H + 1.7))
    parts.append(bpy.context.active_object)
    parts.append(common.box("MastArm", (0.6, 0.03, 0.03), (cx, cy, H + 2.6)))
    tower = common.join(parts, "Tower")
    common.apply_transforms([tower])

    beacon = bpy.data.objects.new("Beacon", None)
    bpy.context.scene.collection.objects.link(beacon)
    beacon.location = (cx, cy, H + 3.45)
    return tower, beacon


# ----------------------------------------------------------------- mount


def build_mount():
    top = MOUNT_TOP
    concrete, steel = [], []
    for x, y in [(1.25, 1.25), (-1.25, 1.25), (1.25, -1.25), (-1.25, -1.25)]:
        leg = common.box("Leg", (0.5, 0.5, 1.05), (x, y, 0.525))
        bevel = leg.modifiers.new("Bevel", "BEVEL")
        bevel.width, bevel.segments = 0.03, 2
        common.apply_modifiers(leg)
        concrete.append(leg)
    for w, d, x, y in [(3.2, 0.9, 0, 1.15), (3.2, 0.9, 0, -1.15), (0.9, 1.4, 1.15, 0), (0.9, 1.4, -1.15, 0)]:
        slab = common.box("Slab", (w, d, 0.26), (x, y, top - 0.13))
        bevel = slab.modifiers.new("Bevel", "BEVEL")
        bevel.width, bevel.segments = 0.02, 2
        common.apply_modifiers(slab)
        concrete.append(slab)
    # Hold-down clamps: base block, angled jaw and a pivot pin.
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        ca, sa = math.cos(a), math.sin(a)
        steel.append(common.box("ClampBase", (0.26, 0.2, 0.34), (0.68 * ca, 0.68 * sa, top + 0.17), a))
        jaw = common.box("ClampJaw", (0.24, 0.12, 0.06), (0.56 * ca, 0.56 * sa, top + 0.36), a)
        jaw.rotation_euler = (0, -0.4, a)
        steel.append(jaw)
        steel.append(cylinder("ClampPin", 0.035, 0.24, (0.66 * ca, 0.66 * sa, top + 0.3), (math.pi / 2, 0, a + math.pi / 2), 12))
    # Flame deflector sloping down the trench (three.js -z = Blender +y), with ribs.
    deflector = common.box("Deflector", (1.3, 2.2, 0.5), (0, 0.7, 0.25))
    deflector.rotation_euler = (0.32, 0, 0)
    concrete.append(deflector)
    for k in range(5):
        rib = common.box("Rib", (0.05, 2.0, 0.06), (-0.5 + k * 0.25, 0.7, 0.53))
        rib.rotation_euler = (0.32, 0, 0)
        steel.append(rib)
    # Trench curbs and service pipes from the tower.
    for x in (-1.62, 1.62):
        curb = common.box("Curb", (0.2, 14.2, 0.18), (x, 1.3 + 14.2 / 2, 0.09))
        # Ramp the end by the mount into the ground: a vertical end face there faces
        # the engine light head-on and reads as a flat glowing block.
        for v in curb.data.vertices:
            if v.co.y < 0 and v.co.z > 0:
                v.co.y += 0.6
        concrete.append(curb)
    tx, ty = TOWER["x"] + TOWER["w"] / 2, -TOWER["z"] - TOWER["w"] / 2
    for k, r in enumerate((0.06, 0.045, 0.035)):
        steel.append(beam("Pipe", (tx, ty + 0.15 * k, r), (-1.45, 0.9 + 0.15 * k, r), (r * 2, r * 2)))

    mat_concrete = common.material("Concrete", (0.09, 0.095, 0.105), roughness=0.88)
    mat_steel = common.material("Steel", (0.05, 0.055, 0.065), roughness=0.8, metallic=0.45)
    for obj in concrete:
        common.assign(obj, mat_concrete)
    for obj in steel:
        common.assign(obj, mat_steel)
    mount = common.join(concrete + steel, "Mount")
    common.apply_transforms([mount])
    return mount


# ------------------------------------------------------------------ arms


def build_arm(index, level, mat_steel, mat_hose):
    half = TOWER["w"] / 2
    pivot3 = (TOWER["x"] + half, level, TOWER["z"] + half)
    to_rocket = Vector((-pivot3[0], -pivot3[2])).length
    reach = to_rocket - 0.6
    parts = [common.box("Deck", (reach, 0.34, 0.03), (reach / 2, 0, -0.15))]
    for side in (-0.16, 0.16):
        parts.append(common.box("TopChord", (reach, 0.05, 0.05), (reach / 2, side, 0.15)))
        parts.append(common.box("BottomChord", (reach, 0.04, 0.04), (reach / 2, side, -0.18)))
        for p in range(5):
            parts.append(common.box("Post", (0.04, 0.04, 0.33), (p / 4 * reach, side, -0.015)))
        for p in range(4):
            x0, x1 = p / 4 * reach, (p + 1) / 4 * reach
            parts.append(beam("Diagonal", (x0, side, -0.18), (x1, side, 0.15), (0.025, 0.025)))
    parts.append(common.box("Bulkhead", (0.04, 0.42, 0.42), (reach, 0, 0)))
    arm = common.join(parts, f"Arm_{index}")
    common.assign(arm, mat_steel)
    if index == 1:
        curve = bpy.data.curves.new("Hose", type="CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth, curve.bevel_resolution = 0.045, 4
        spline = curve.splines.new("POLY")
        spline.points.add(4)
        for k, (x, y, z) in enumerate([(0, 0, -0.2), (reach * 0.25, 0.04, -0.45), (reach * 0.5, 0.05, -0.55), (reach * 0.75, 0.04, -0.45), (reach, 0, -0.25)]):
            spline.points[k].co = (x, y, z, 1)
        hose_curve = bpy.data.objects.new("HoseCurve", curve)
        bpy.context.scene.collection.objects.link(hose_curve)
        mesh = bpy.data.meshes.new_from_object(hose_curve.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        hose = bpy.data.objects.new("Hose", mesh)
        bpy.context.scene.collection.objects.link(hose)
        bpy.data.objects.remove(hose_curve, do_unlink=True)
        common.assign(hose, mat_hose)
        arm = common.join([arm, hose], f"Arm_{index}")
    common.apply_transforms([arm])
    arm.name = arm.data.name = f"Arm_{index}_Mesh"
    # The site swings the Arm_i empty: hinge at the tower corner, local +X toward the rocket.
    # The mesh hangs under it because compression (quantization) rewrites mesh node transforms.
    pivot = bpy.data.objects.new(f"Arm_{index}", None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot.location = B(*pivot3)
    to = Vector(B(0, level, 0)) - Vector(B(*pivot3))
    pivot.rotation_euler = (0, 0, math.atan2(to.y, to.x))
    arm.parent = pivot
    return pivot, arm


# ---------------------------------------------------------------- floods


def build_flood(index, fx, fz, mat_steel, mat_lens):
    bx, by, _ = B(fx, 0, fz)
    parts = []
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.14, radius2=0.09, depth=POLE_H, location=(bx, by, POLE_H / 2))
    parts.append(bpy.context.active_object)
    parts.append(cylinder("Flange", 0.3, 0.04, (bx, by, 0.02), vertices=24))
    for k in range(6):
        a = k * math.pi / 3
        parts.append(cylinder("Bolt", 0.025, 0.08, (bx + 0.24 * math.cos(a), by + 0.24 * math.sin(a), 0.06), vertices=8))
    # Service ladder on the far side of the pole from the pad.
    away = Vector((bx, by, 0)).normalized()
    side = Vector((-away.y, away.x, 0))
    ladder_base = Vector((bx, by, 0)) + away * 0.24
    for s in (-0.16, 0.16):
        p = ladder_base + side * s
        parts.append(common.box("LadderRail", (0.03, 0.03, POLE_H - 0.6), (p.x, p.y, (POLE_H - 0.6) / 2 + 0.3)))
    z = 0.6
    while z < POLE_H - 0.4:
        parts.append(beam("Rung", ladder_base - side * 0.16 + Vector((0, 0, z)), ladder_base + side * 0.16 + Vector((0, 0, z)), (0.02, 0.02)))
        z += 0.32

    # Head: frame + 2×2 lamp housings facing the rocket, lenses as a separate object.
    head_pos = Vector(B(fx, POLE_H + 0.1, fz))
    facing = (Vector(AIM) - head_pos).normalized()
    rot = facing.to_track_quat("Y", "Z").to_matrix().to_4x4()
    head_parts, lenses = [common.box("Frame", (1.3, 0.12, 0.68), (0, -0.06, 0))], []
    for gx in (-0.32, 0.32):
        for gz in (-0.17, 0.17):
            head_parts.append(cylinder("Housing", 0.15, 0.24, (gx, 0.08, gz), (math.pi / 2, 0, 0), 20))
            lenses.append(cylinder("Lens", 0.125, 0.012, (gx, 0.205, gz), (math.pi / 2, 0, 0), 20))
    yoke = common.box("Yoke", (0.08, 0.08, 0.5), (0, -0.16, -0.5))
    head_parts.append(yoke)
    for obj in head_parts + lenses:
        common.apply_transforms([obj])
        obj.data.transform(rot)
        obj.data.transform(Matrix.Translation(head_pos))
    flood = common.join(parts + head_parts, f"Flood_{index}")
    common.assign(flood, mat_steel)
    lens = common.join(lenses, f"FloodLens_{index}")
    common.assign(lens, mat_lens)
    common.apply_transforms([flood, lens])
    return flood, lens


# ---------------------------------------------------------------- unwrap


def unwrap_lightmap(obj, tile):
    """Two UV sets: UVMap (smart project, for future textures) and Lightmap (packed into `tile`).
    The lightmap must be the second set (glTF TEXCOORD_1, three's uv1) for aoMap.channel = 1."""
    mesh = obj.data
    # Joined primitives arrive with their own UV maps; start clean so no stray set comes first.
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.uv_layers.new(name="UVMap")
    mesh.uv_layers.new(name="Lightmap")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for layer_name, op in (("UVMap", "smart"), ("Lightmap", "lightmap")):
        mesh.uv_layers.active = mesh.uv_layers[layer_name]
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        if op == "smart":
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
        else:
            bpy.ops.uv.lightmap_pack(PREF_CONTEXT="ALL_FACES", PREF_PACK_IN_ONE=True, PREF_MARGIN_DIV=0.3)
        bpy.ops.object.mode_set(mode="OBJECT")
    u0, v0, su, sv = tile
    for loop in mesh.uv_layers["Lightmap"].data:
        loop.uv = (u0 + loop.uv.x * su, v0 + loop.uv.y * sv)
    mesh.uv_layers.active = mesh.uv_layers["UVMap"]


def ground_ao_plane():
    """A plane over the pad whose UVs match the site's pad disc (CircleGeometry r=16,
    rotated x=-π/2 then z=π/2): u = (1 + y/16)/2, v = (1 - x/16)/2 in Blender coords."""
    r = PAD_RADIUS
    verts = [(-r, -r, 0.005), (r, -r, 0.005), (r, r, 0.005), (-r, r, 0.005)]
    mesh = bpy.data.meshes.new("GroundAO")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        x, y, _ = verts[loop.vertex_index]
        layer.data[loop.index].uv = ((1 + y / r) / 2, (1 - x / r) / 2)
    obj = bpy.data.objects.new("GroundAO", mesh)
    bpy.context.scene.collection.objects.link(obj)
    common.assign(obj, common.material("GroundAOMat", (0.5, 0.5, 0.5), roughness=1))
    return obj


def main():
    opts = common.args(lambda p: p.add_argument("--no-bake", action="store_true"))
    common.reset()
    out = common.ensure_dir(opts.out)

    mat_steel = common.material("Steel", (0.05, 0.055, 0.065), roughness=0.8, metallic=0.45)
    mat_hose = common.material("Hose", (0.04, 0.045, 0.055), roughness=0.6)
    mat_lens = common.material("Lens", (1, 1, 1), roughness=0.2, emission=(1, 1, 1), strength=8)

    tower, beacon = build_tower()
    common.assign(tower, mat_steel)
    mount = build_mount()
    arms = [part for i, level in enumerate(ARM_LEVELS) for part in build_arm(i, level, mat_steel, mat_hose)]
    floods, lenses = zip(*[build_flood(i, fx, fz, mat_steel, mat_lens) for i, (fx, fz) in enumerate(FLOODS)])
    baked = [tower, mount, *floods]
    exported = [*baked, *arms, *lenses, beacon]
    print(f"[pad] triangles: {common.triangle_count([o for o in exported if o.type == 'MESH'])}")

    unwrap_lightmap(tower, (0.0, 0.0, 0.5, 1.0))
    unwrap_lightmap(mount, (0.5, 0.5, 0.5, 0.5))
    for i, flood in enumerate(floods):
        unwrap_lightmap(flood, (0.5 + 0.25 * (i % 2), 0.25 * (i // 2), 0.25, 0.25))

    if not opts.no_bake:
        # Ground occluder so structures darken toward their feet; not exported.
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
        occluder = common.assign(bpy.context.active_object, common.material("Occluder", (0.3, 0.3, 0.3)))
        common.bake_ao(baked, os.path.join(out, "pad-ao.png"), size=(2048, 2048), distance=1.2, samples=48, uv_layer="Lightmap")
        bpy.data.objects.remove(occluder, do_unlink=True)
        ground = ground_ao_plane()
        common.bake_ao([ground], os.path.join(out, "ground-ao.png"), size=(1024, 1024), distance=2.5, samples=64)
        bpy.data.objects.remove(ground, do_unlink=True)

    common.export_glb(os.path.join(out, "pad.glb"), exported)
    common.save_blend(os.path.join(out, "pad.blend"))
    if not opts.no_preview:
        common.preview(os.path.join(out, "pad-preview.png"), camera_location=B(9, 5, 24), target=B(-1, 5, 0), size=(1280, 720), samples=24, lens=28)
    print("[pad] done")


if __name__ == "__main__":
    main()
