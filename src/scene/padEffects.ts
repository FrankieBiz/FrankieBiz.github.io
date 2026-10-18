// Pad atmosphere effects, split into their own chunk to keep first-load JS under budget;
// main.ts fetches it alongside the assets and the scene runs without them if it fails.
export { GroundFog } from './GroundFog'
export { Sparks } from './Sparks'
