import { DataTexture, EquirectangularReflectionMapping, LinearFilter, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import type { LoadOptions } from './load'

/** Browser decoders for each asset kind, used by `loadAssets`. */
export function createDecoder(): LoadOptions['decode'] {
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  return async (kind, buffer) => {
    switch (kind) {
      case 'texture': {
        // Decode off the main thread; flip at decode time so three doesn't have to.
        const bitmap = await createImageBitmap(new Blob([buffer]), { imageOrientation: 'flipY' })
        const texture = new Texture(bitmap)
        texture.flipY = false
        texture.needsUpdate = true
        return texture
      }
      case 'gltf':
        return gltf.parseAsync(buffer, '')
      case 'hdr': {
        const data = new HDRLoader().parse(buffer)
        const texture = new DataTexture(data.data, data.width, data.height, undefined, data.type)
        texture.mapping = EquirectangularReflectionMapping
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        texture.generateMipmaps = false
        texture.flipY = true
        texture.needsUpdate = true
        return texture
      }
      case 'lut':
        return new LUTCubeLoader().parse(new TextDecoder().decode(buffer))
    }
  }
}
