/**
 * The simulated smoke flipbook (tools/blender/smoke.py): one billowing
 * Mantaflow puff over its life, 64 frames in an 8×8 atlas. Channels are
 * premultiplied light from three directions, stored as sqrt for 8-bit
 * precision in the darks: R lit from above (floods), G from below (engine),
 * B from behind (rim). A is density.
 */
export const FLIPBOOK = { frames: 64, cols: 8 } as const

/** Frame pair and blend factor for a particle age in [0, 1). */
export function flipbookFrame(age: number): { a: number; b: number; t: number } {
  const f = Math.min(Math.max(age, 0), 0.99999) * (FLIPBOOK.frames - 1)
  const a = Math.floor(f)
  return { a, b: a + 1, t: f - a }
}

/** Atlas UV for a frame and a sprite point coord ((0, 0) = top-left, like gl_PointCoord). */
export function atlasUv(frame: number, px: number, py: number): [number, number] {
  const col = frame % FLIPBOOK.cols
  const row = Math.floor(frame / FLIPBOOK.cols)
  return [(col + px) / FLIPBOOK.cols, 1 - (row + py) / FLIPBOOK.cols]
}

/** GLSL twins of flipbookFrame + atlasUv, sampling two frames and blending. */
export const FLIPBOOK_GLSL = /* glsl */ `
const float FLIP_FRAMES = ${FLIPBOOK.frames.toFixed(1)};
const float FLIP_COLS = ${FLIPBOOK.cols.toFixed(1)};
vec2 flipAtlasUv(float frame, vec2 pc) {
  float col = mod(frame, FLIP_COLS);
  float row = floor(frame / FLIP_COLS);
  return vec2((col + pc.x) / FLIP_COLS, 1.0 - (row + pc.y) / FLIP_COLS);
}
vec4 sampleFlipbook(sampler2D atlas, float age, vec2 pc) {
  float f = clamp(age, 0.0, 0.99999) * (FLIP_FRAMES - 1.0);
  float a = floor(f);
  vec4 s = mix(texture2D(atlas, flipAtlasUv(a, pc)), texture2D(atlas, flipAtlasUv(a + 1.0, pc)), f - a);
  s.rgb *= s.rgb;
  return s;
}
`
