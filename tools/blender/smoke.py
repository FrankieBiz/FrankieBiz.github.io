"""Smoke flipbook: one billowing Mantaflow puff, rendered over its life.

Packs 64 frames into an 8x8 atlas (src/scene/SmokeFlipbook.ts reads it):
R/G/B = premultiplied light from above / below / behind (sqrt-encoded),
A = density. Each frame is cropped to the puff's (smoothed) extent so the
puff fills every cell; the site grows the sprite instead.

Outputs (assets-src/blender/): smoke-atlas.png (2048x2048),
smoke-contact.png (the atlas lit for review), smoke-sim.blend.
Usage: npm run assets:blender -- tools/blender/smoke.py [--skip-bake] [--draft] [--pack-only]
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy  # noqa: E402
import numpy as np  # noqa: E402

import common  # noqa: E402

FRAMES, COLS, CELL = 64, 8, 256
FIRST = 7  # sim frame for atlas frame 0 (the burst is already moving)
RENDER = 512  # square render of the whole domain before cropping
DOMAIN = 5.0
FILL = 0.40  # puff radius (97% of its density) as a fraction of the cell
LIGHTS = ("top", "bottom", "back")


def build_sim(cache):
    bpy.ops.mesh.primitive_cube_add(size=DOMAIN, location=(0, 0, 0))
    domain = bpy.context.active_object
    domain.name = "Domain"
    mod = domain.modifiers.new("Fluid", "FLUID")
    mod.fluid_type = "DOMAIN"
    ds = mod.domain_settings
    ds.domain_type = "GAS"
    ds.resolution_max = 96
    ds.use_noise = True
    ds.noise_scale = 2
    ds.noise_strength = 1.6
    ds.vorticity = 0.45
    ds.alpha = 0.0  # no buoyancy: the puff stays centred in its sprite
    ds.beta = 0.0
    ds.use_dissolve_smoke = True
    ds.use_dissolve_smoke_log = True
    ds.dissolve_speed = 90
    for side in ("front", "back", "left", "right", "top", "bottom"):
        setattr(ds, f"use_collision_border_{side}", False)
    ds.cache_type = "ALL"
    ds.cache_directory = cache
    ds.cache_frame_start = 1
    ds.cache_frame_end = FIRST + FRAMES

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.28, location=(0, 0, 0))
    emitter = bpy.context.active_object
    emitter.name = "Emitter"
    fm = emitter.modifiers.new("Fluid", "FLUID")
    fm.fluid_type = "FLOW"
    fs = fm.flow_settings
    fs.flow_type = "SMOKE"
    fs.flow_behavior = "INFLOW"
    fs.flow_source = "MESH"
    fs.surface_distance = 0.6
    fs.smoke_color = (1, 1, 1)
    fs.temperature = 0
    fs.use_initial_velocity = True
    fs.velocity_normal = 0.7
    fs.velocity_random = 0.5
    # Lumpy emission so the puff isn't a smooth ball.
    tex = bpy.data.textures.new("Lumps", "CLOUDS")
    tex.noise_scale = 0.18
    fs.use_texture = True
    fs.noise_texture = tex
    fs.texture_map_type = "AUTO"
    fs.use_inflow = True
    fs.keyframe_insert("use_inflow", frame=1)
    fs.use_inflow = False
    fs.keyframe_insert("use_inflow", frame=6)
    emitter.hide_render = True

    bpy.ops.object.effector_add(type="TURBULENCE", location=(0, 0, 0))
    turb = bpy.context.active_object
    turb.field.strength = 1.6
    turb.field.size = 0.45
    turb.field.noise = 0.4
    return domain


def smoke_material(domain):
    mat = bpy.data.materials.new("Smoke")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.9, 0.9, 0.9, 1)
    vol.inputs["Anisotropy"].default_value = 0.25
    # Sharpen the density field so billows get defined edges and shade each other.
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "density"
    curve = nt.nodes.new("ShaderNodeMath")
    curve.operation = "POWER"
    curve.inputs[1].default_value = 1.6
    gain = nt.nodes.new("ShaderNodeMath")
    gain.name = "Gain"
    gain.operation = "MULTIPLY"
    nt.links.new(attr.outputs["Fac"], curve.inputs[0])
    nt.links.new(curve.outputs[0], gain.inputs[0])
    nt.links.new(gain.outputs[0], vol.inputs["Density"])
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    common.assign(domain, mat)
    return gain


def calibrate(frames, gain, scratch, depth=3.0, base=30.0):
    """Per-frame density gain so every frame's core has the same optical depth:
    each reads as an equally thick cloud (the site fades particles over life).
    Measured from small opacity renders (density_grid is empty headless). Volume
    alpha is stochastic per sample, so it needs real sample counts to be measurable."""
    scene = bpy.context.scene
    size = scene.render.resolution_x
    scene.render.resolution_x = scene.render.resolution_y = 96
    scene.render.film_transparent = True
    scene.cycles.samples = 48
    gain.inputs[1].default_value = base
    gains = {}
    for f in frames:
        scene.frame_set(f)
        scene.render.filepath = os.path.join(scratch, "calibrate.exr")
        bpy.ops.render.render(write_still=True)
        alpha = load(scene.render.filepath)[..., 3]
        tau = -np.log(np.clip(1 - alpha[alpha > 0.02], 1e-4, 1))
        core = float(np.percentile(tau, 90)) if tau.size else depth
        gains[f] = base * depth / max(core, 1e-3)
    scene.render.resolution_x = scene.render.resolution_y = size
    return gains


def lights():
    made = {}
    for name, rot in (("top", (0, 0, 0)), ("bottom", (math.pi, 0, 0)), ("back", (-math.pi / 2 + 0.25, 0, 0))):
        data = bpy.data.lights.new(name, "SUN")
        data.energy = 3.0
        data.angle = math.radians(8)
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        # Sun lamps shine along their local -Z: identity = straight down. "back" faces the camera (at -Y).
        obj.rotation_euler = rot
        made[name] = obj
    return made


def camera():
    data = bpy.data.cameras.new("Cam")
    data.type = "ORTHO"
    data.ortho_scale = DOMAIN
    cam = bpy.data.objects.new("Cam", data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -10, 0)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.camera = cam


def render_pass(path_pattern, frames, transparent, samples, gain, gains):
    scene = bpy.context.scene
    scene.render.film_transparent = transparent
    scene.cycles.samples = samples
    paths = []
    for f in frames:
        scene.frame_set(f)
        gain.inputs[1].default_value = gains[f]
        path = path_pattern.format(f)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    return paths


def load(path):
    img = bpy.data.images.load(path)
    buf = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(buf)
    w, h = img.size
    bpy.data.images.remove(img)
    return buf.reshape(h, w, 4)[::-1]  # Blender rows are bottom-up; make row 0 the top


def extent(alpha):
    """Radius (px) holding 97% of the density, measured from the centre."""
    h, w = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(xx - (w - 1) / 2, yy - (h - 1) / 2).ravel()
    a = alpha.ravel()
    order = np.argsort(r)
    cum = np.cumsum(a[order])
    if cum[-1] <= 0:
        return 8.0
    return float(r[order][np.searchsorted(cum, cum[-1] * 0.97)])


def crop(img, half, size):
    """Bilinear resample of the centred square of half-width `half` to size x size."""
    h, w = img.shape[:2]
    cx, cy = (w - 1) / 2, (h - 1) / 2
    t = (np.arange(size) + 0.5) / size * 2 - 1
    xs = np.clip(cx + t * half, 0, w - 1)
    ys = np.clip(cy + t * half, 0, h - 1)
    x0, y0 = np.floor(xs).astype(int), np.floor(ys).astype(int)
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    fx, fy = (xs - x0)[None, :, None], (ys - y0)[:, None, None]
    top = img[y0][:, x0] * (1 - fx) + img[y0][:, x1] * fx
    bottom = img[y1][:, x0] * (1 - fx) + img[y1][:, x1] * fx
    return top * (1 - fy) + bottom * fy


def save_png(rgba_top_down, path):
    h, w = rgba_top_down.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(rgba_top_down[::-1]).ravel().astype(np.float32))
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def pack(frames_dir, sim_frames, out):
    cells = []
    radii = []
    for f in sim_frames:
        alpha = load(os.path.join(frames_dir, f"alpha_{f:03d}.exr"))[..., 3]
        light = [load(os.path.join(frames_dir, f"{name}_{f:03d}.exr"))[..., :3].mean(axis=2) for name in LIGHTS]
        cells.append(np.dstack([*light, alpha]))
        radii.append(extent(alpha))
    # Smooth, never-shrinking framing so cells don't jitter frame to frame.
    radii = np.maximum.accumulate(np.convolve(np.pad(radii, 2, mode="edge"), np.ones(5) / 5, mode="valid"))
    half = np.minimum(radii / (FILL * 2), RENDER / 2)
    # Soft circular edge: nothing reaches a cell border, even when the sprite rotates.
    t = (np.arange(CELL) + 0.5) / CELL - 0.5
    r = np.hypot(*np.meshgrid(t, t))
    mask = np.clip((0.5 - r) / 0.06, 0, 1)
    mask = mask * mask * (3 - 2 * mask)
    resampled = [crop(c, hw, CELL) * mask[..., None] for c, hw in zip(cells, half)]
    peak = np.percentile(np.stack([c[..., :3] for c in resampled]), 99.7)
    atlas = np.zeros((CELL * COLS, CELL * COLS, 4), np.float32)
    for i, c in enumerate(resampled):
        row, col = divmod(i, COLS)
        cell = c.copy()
        cell[..., :3] = np.sqrt(np.clip(cell[..., :3] / peak, 0, 1))
        cell[..., 3] = np.clip(cell[..., 3], 0, 1)
        atlas[row * CELL : (row + 1) * CELL, col * CELL : (col + 1) * CELL] = cell
    save_png(atlas, os.path.join(out, "smoke-atlas.png"))

    # Review sheet: the atlas lit warm-from-below over a dark backdrop.
    lit = atlas[..., :3] ** 2
    col = lit[..., 0:1] * np.array([0.75, 0.8, 0.88]) + lit[..., 1:2] * np.array([1.0, 0.45, 0.15]) + lit[..., 2:3] * np.array([0.5, 0.55, 0.65])
    a = atlas[..., 3:4]
    sheet = np.concatenate([np.clip(col + np.array([0.04, 0.05, 0.07]) * (1 - a), 0, 1) ** (1 / 2.2), np.ones_like(a)], axis=2)
    save_png(sheet, os.path.join(out, "smoke-contact.png"))
    print(f"[smoke] crop half-widths px: {half[0]:.0f} → {half[-1]:.0f}, light peak {peak:.3f}")


def main():
    opts = common.args(
        lambda p: [p.add_argument(flag, action="store_true") for flag in ("--skip-bake", "--draft", "--pack-only")]
    )
    common.reset()
    out = common.ensure_dir(opts.out)
    cache = common.ensure_dir(os.path.join(out, "cache", "smoke"))
    frames_dir = common.ensure_dir(os.path.join(out, "cache", "smoke-frames"))
    if opts.pack_only:  # re-pack already rendered frames
        pack(frames_dir, list(range(FIRST, FIRST + FRAMES)), out)
        return
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, FIRST + FRAMES

    domain = build_sim(cache)
    gain = smoke_material(domain)
    lamps = lights()
    camera()

    if not opts.skip_bake:
        with bpy.context.temp_override(object=domain, active_object=domain, selected_objects=[domain], scene=scene):
            bpy.ops.fluid.free_all()
            bpy.ops.fluid.bake_all()
        print("[smoke] baked")

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.cycles.volume_bounces = 1
    scene.cycles.volume_step_rate = 1
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = scene.render.resolution_y = RENDER
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("Black")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0
    scene.world = world

    sim_frames = list(range(FIRST, FIRST + FRAMES))
    if opts.draft:
        sim_frames = sim_frames[::9]
    samples = 24 if opts.draft else 64
    for lamp in lamps.values():
        lamp.hide_render = True
    gains = calibrate(sim_frames, gain, frames_dir)
    print("[smoke] density gain by frame:", " ".join(f"{gains[f]:.0f}" for f in sim_frames))
    # Light passes on black (RGB is premultiplied light), then one alpha pass with no lights.
    for name in LIGHTS:
        for lamp in lamps.values():
            lamp.hide_render = lamp.name != name
        render_pass(os.path.join(frames_dir, name + "_{:03d}.exr"), sim_frames, False, samples, gain, gains)
    for lamp in lamps.values():
        lamp.hide_render = True
    render_pass(os.path.join(frames_dir, "alpha_{:03d}.exr"), sim_frames, True, samples, gain, gains)

    if not opts.draft:
        pack(frames_dir, sim_frames, out)
    else:
        # Draft: one strip of the sampled frames, lit by the top light, for a quick look.
        strip = np.concatenate([load(os.path.join(frames_dir, f"top_{f:03d}.exr")) for f in sim_frames], axis=1)
        strip[..., :3] = np.clip(strip[..., :3], 0, 1) ** (1 / 2.2)
        strip[..., 3] = 1
        save_png(strip, os.path.join(out, "smoke-draft.png"))
    common.save_blend(os.path.join(out, "smoke-sim.blend"))
    print("[smoke] done")


if __name__ == "__main__":
    main()
