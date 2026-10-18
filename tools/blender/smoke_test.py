"""Pipeline smoke test: build a tiny scene, export it and render a preview."""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy  # noqa: E402

import common  # noqa: E402

opts = common.args()
common.reset()
out = common.ensure_dir(opts.out)

bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.56, depth=6, location=(0, 0, 3))
body = common.assign(bpy.context.active_object, common.material("Ceramic", (0.86, 0.88, 0.9), roughness=0.38))
bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.56, depth=2.4, location=(0, 0, 7.2))
nose = common.assign(bpy.context.active_object, common.material("Graphite", (0.08, 0.09, 0.11), roughness=0.45, metallic=0.3))
bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
ground = common.assign(bpy.context.active_object, common.material("Concrete", (0.18, 0.19, 0.21), roughness=0.9))

print(f"[smoke] triangles: {common.triangle_count([body, nose])}")
common.export_glb(os.path.join(out, "smoke.glb"), [body, nose])
common.save_blend(os.path.join(out, "smoke.blend"))
if not opts.no_preview:
    common.preview(os.path.join(out, "smoke-preview.png"), camera_location=(7, -9, 4), target=(0, 0, 3.5))
print("[smoke] done")
