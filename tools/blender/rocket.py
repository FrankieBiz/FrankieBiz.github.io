"""Authored rocket: detailed geometry + baked hull AO for the site.

Matches the procedural rocket's proportions and conventions so the browser's
painted markings (name, callsign, roll pattern) land in the same places:
hull UVs follow three.js LatheGeometry (u around, v by height from 0.3 to 10)
and painted u = 0.5 faces the camera (+z in three.js, -y here).

Outputs (assets-src/blender/): rocket.glb, rocket-ao.png, rocket.blend,
rocket-preview.png. Blender is Z-up; the glTF export converts to Y-up.
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import common  # noqa: E402

R = 0.56  # hull radius
HULL_Y0, HULL_Y1 = 0.3, 10.0
NOZZLE_EXIT = -0.5
SEGMENTS = 96
RINGS = [1.75, 2.7, 3.6, 4.3, 4.75, 5.5, 6.1, 6.6, 7.5, 8.4]  # panel seam heights
GROOVE_DEPTH, GROOVE_HALF = 0.004, 0.004
# Middle access arm meets the hull from the service tower's side (local height, direction).
UMBILICAL_Z, UMBILICAL_DIR = 4.7, (-0.82, 0.57)


def ogive_radius(z):
    """Tangent ogive from (R, 6.6) to the tip at 10."""
    length = HULL_Y1 - 6.6
    rho = (R * R + length * length) / (2 * R)
    x = z - 6.6
    return max(math.sqrt(max(rho * rho - x * x, 0.0)) + R - rho, 0.0)


def hull_radius(z):
    if z <= 6.6:
        return R
    return ogive_radius(z)


def hull_profile():
    """(radius, z) from the bottom centre to the tip, with seam grooves cut in."""
    pts = [(0.0, HULL_Y0), (0.42, HULL_Y0), (0.47, 0.36), (0.53, 0.55), (R, 0.8)]
    zs = sorted(set([0.8, 6.6] + [6.6 + (HULL_Y1 - 6.6) * (i / 40) for i in range(1, 41)]))
    events = sorted(set(zs) | set(RINGS))
    out = list(pts)
    for z in events:
        if z <= 0.8:
            continue
        r = hull_radius(z)
        if z in RINGS:
            # Groove: step in, run, step out (sharp walls survive smoothing).
            out += [
                (hull_radius(z - GROOVE_HALF), z - GROOVE_HALF),
                (hull_radius(z - GROOVE_HALF * 0.6) - GROOVE_DEPTH, z - GROOVE_HALF * 0.6),
                (hull_radius(z + GROOVE_HALF * 0.6) - GROOVE_DEPTH, z + GROOVE_HALF * 0.6),
                (hull_radius(z + GROOVE_HALF), z + GROOVE_HALF),
            ]
        elif z < HULL_Y1:
            out.append((r, z))
    out.append((0.0, HULL_Y1))
    return out


def lathe(name, profile, segments, uv_for=None):
    """Spin a (r, z) profile around Z. Faces wind outward for upward profiles.

    Vertex angle φ = 2πu with position (-r·sinφ, r·cosφ): three.js's lathe
    rotated by π, so u = 0.5 faces -y (the camera after export).
    """
    verts, faces, uvs = [], [], []
    index = {}
    rows = len(profile)
    for k, (r, z) in enumerate(profile):
        if r == 0.0:
            index[(k, 0)] = len(verts)
            verts.append((0.0, 0.0, z))
            continue
        for j in range(segments):
            phi = 2 * math.pi * j / segments
            index[(k, j)] = len(verts)
            verts.append((-r * math.sin(phi), r * math.cos(phi), z))

    def vid(k, j):
        return index[(k, 0)] if profile[k][0] == 0.0 else index[(k, j % segments)]

    def uv(k, j):
        u = j / segments
        return (u, uv_for(profile[k][1])) if uv_for else (u, k / (rows - 1))

    for k in range(rows - 1):
        for j in range(segments):
            a, b, c, d = (k, j), (k, j + 1), (k + 1, j + 1), (k + 1, j)
            if profile[k][0] == 0.0:  # bottom pole: triangle fan
                faces.append((vid(*a), vid(*c), vid(*d)))
                uvs.append([((j + 0.5) / segments, uv(*a)[1]), uv(*c), uv(*d)])
            elif profile[k + 1][0] == 0.0:  # top pole
                faces.append((vid(*a), vid(*b), vid(*d)))
                uvs.append([uv(*a), uv(*b), ((j + 0.5) / segments, uv(*d)[1])])
            else:
                faces.append((vid(*a), vid(*b), vid(*c), vid(*d)))
                uvs.append([uv(*a), uv(*b), uv(*c), uv(*d)])

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for poly, face_uvs in zip(mesh.polygons, uvs):
        for loop_index, coord in zip(poly.loop_indices, face_uvs):
            layer.data[loop_index].uv = coord
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def smooth(obj, angle=30):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(angle))


def apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)


def box(name, size, location, rotation_z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=(0, 0, rotation_z))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def join(objs, name):
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def apply_transforms(objs):
    for obj in objs:
        with bpy.context.temp_override(active_object=obj, selected_editable_objects=[obj]):
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def build():
    paint = common.material("HullPaint", (0.86, 0.88, 0.9), roughness=0.38)
    graphite = common.material("Graphite", (0.06, 0.07, 0.09), roughness=0.45, metallic=0.35)
    metal = common.material("NozzleMetal", (0.2, 0.22, 0.25), roughness=0.34, metallic=0.92)
    steel = common.material("Steel", (0.28, 0.3, 0.33), roughness=0.5, metallic=0.8)
    dark = common.material("Umbilical", (0.03, 0.035, 0.045), roughness=0.6, metallic=0.2)

    # Hull with seam grooves; UV v by height, like three.js LatheGeometry.
    hull = lathe("Hull", hull_profile(), SEGMENTS, uv_for=lambda z: (z - HULL_Y0) / (HULL_Y1 - HULL_Y0))
    common.assign(hull, paint)
    smooth(hull)

    # Fins: swept planform, solid with bevelled edges, plus a root doubler plate.
    fins = []
    for i in range(4):
        angle = math.pi / 4 + i * math.pi / 2
        planform = [(0.0, 0.0, 0.36), (0.92, 0.0, 0.10), (0.95, 0.0, 0.82), (0.0, 0.0, 2.15)]
        mesh = bpy.data.meshes.new(f"Fin_{i}")
        mesh.from_pydata(planform, [], [(0, 1, 2, 3)])
        fin = bpy.data.objects.new(f"Fin_{i}", mesh)
        bpy.context.scene.collection.objects.link(fin)
        solid = fin.modifiers.new("Solidify", "SOLIDIFY")
        solid.thickness, solid.offset = 0.05, 0.0
        bevel = fin.modifiers.new("Bevel", "BEVEL")
        bevel.width, bevel.segments, bevel.limit_method = 0.012, 2, "ANGLE"
        apply_modifiers(fin)
        fin.location = (0, 0, 0)
        fin.data.transform(Matrix.Translation((R - 0.08, 0, 0)))
        doubler = box(f"Doubler_{i}", (0.02, 0.16, 1.95), (R + 0.006, 0, 1.25))
        fin_obj = join([fin, doubler], f"Fin_{i}")
        fin_obj.rotation_euler = (0, 0, angle)
        common.assign(fin_obj, graphite)
        smooth(fin_obj, 40)
        fins.append(fin_obj)

    # Cable raceway with brackets, ~20° right of the painted name as seen from the camera.
    race_angle = math.radians(20)
    rx, ry = math.sin(race_angle), -math.cos(race_angle)
    rot = math.atan2(ry, rx)
    parts = [box("Raceway", (0.045, 0.07, 5.5), ((R + 0.012) * rx, (R + 0.012) * ry, 3.85), rot)]
    z = 1.3
    while z < 6.4:
        parts.append(box("Bracket", (0.03, 0.11, 0.02), ((R + 0.006) * rx, (R + 0.006) * ry, z), rot))
        z += 0.45
    raceway = join(parts, "Raceway")
    common.assign(raceway, graphite)

    # Engine bell (profile from the exit up to the throat), solid, with cooling ribs.
    bell_profile = [(0.44, NOZZLE_EXIT), (0.38, -0.36), (0.30, -0.18), (0.22, 0.0), (0.18, 0.12), (0.20, 0.22), (0.24, 0.34)]
    bell = lathe("Bell", bell_profile, 144)
    for v in bell.data.vertices:
        phi = math.atan2(-v.co.x, v.co.y)
        if v.co.z < 0.05 and (round(phi / (2 * math.pi) * 144) % 3 == 0):
            v.co.x *= 1.012
            v.co.y *= 1.012
    solid = bell.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness, solid.offset = 0.012, -1.0
    apply_modifiers(bell)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.215, minor_radius=0.026, major_segments=64, minor_segments=12, location=(0, 0, 0.12))
    manifold = bpy.context.active_object
    actuators = []
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.022, depth=0.34, location=(side * 0.27, 0, 0.2), rotation=(0, side * 0.55, 0))
        actuators.append(bpy.context.active_object)
    nozzle = join([bell, manifold] + actuators, "Nozzle")
    common.assign(nozzle, metal)
    smooth(nozzle, 35)

    # Hold-down fittings between the fins and an umbilical plate under the middle arm.
    holds = []
    for i in range(4):
        a = i * math.pi / 2
        holds.append(box("Hold", (0.12, 0.1, 0.16), (0.47 * math.cos(a), 0.47 * math.sin(a), 0.38), a))
    hold_downs = join(holds, "HoldDowns")
    common.assign(hold_downs, steel)

    ux, uy = UMBILICAL_DIR
    urot = math.atan2(uy, ux)
    plate = [box("Umbilical", (0.02, 0.18, 0.26), ((R + 0.008) * ux, (R + 0.008) * uy, UMBILICAL_Z), urot)]
    for dz in (-0.07, 0.0, 0.07):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.022, depth=0.03, location=((R + 0.024) * ux, (R + 0.024) * uy, UMBILICAL_Z + dz), rotation=(0, math.pi / 2, urot))
        plate.append(bpy.context.active_object)
    umbilical = join(plate, "Umbilical")
    common.assign(umbilical, dark)

    exit_anchor = bpy.data.objects.new("NozzleExit", None)
    bpy.context.scene.collection.objects.link(exit_anchor)
    exit_anchor.location = (0, 0, NOZZLE_EXIT)

    meshes = [hull, *fins, raceway, nozzle, hold_downs, umbilical]
    apply_transforms(meshes)
    return hull, meshes, exit_anchor


def bake_hull_ao(hull, path, size=(1024, 2048), samples=64):
    """Bake local ambient occlusion (grooves, fin roots, raceway) into the hull UVs."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new("BakeWorld")
    scene.world = world
    world.light_settings.distance = 0.6
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    image = bpy.data.images.new("HullAO", *size)
    mat = hull.data.materials[0]
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    hull.select_set(True)
    bpy.context.view_layer.objects.active = hull
    bpy.ops.object.bake(type="AO", margin=8)
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    mat.node_tree.nodes.remove(node)


def main():
    opts = common.args(lambda p: p.add_argument("--no-bake", action="store_true"))
    common.reset()
    out = common.ensure_dir(opts.out)
    hull, meshes, exit_anchor = build()
    print(f"[rocket] triangles: {common.triangle_count(meshes)}")
    if not opts.no_bake:
        bake_hull_ao(hull, os.path.join(out, "rocket-ao.png"))
    common.export_glb(os.path.join(out, "rocket.glb"), [*meshes, exit_anchor])
    common.save_blend(os.path.join(out, "rocket.blend"))
    if not opts.no_preview:
        common.preview(
            os.path.join(out, "rocket-preview.png"),
            camera_location=(7.5, -12.5, 4.2),
            target=(0, 0, 4.8),
            size=(900, 1200),
            samples=32,
            lens=34,
        )
    print("[rocket] done")


main()
