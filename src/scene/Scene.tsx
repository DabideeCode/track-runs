import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { setThumbnailProvider, useGame } from '@/game/store'
import { GridLines, OpenEndMarkers, TileHighlight } from './BoardMarks'
import { attachBoard } from './boardPicking'
import { DEFAULT_CAMERA_FOV, DEFAULT_POSITION, DEFAULT_TARGET } from './cameraDefaults'
import { CameraRig } from './CameraRig'
import { Ghost } from './Ghost'
import { sharedMaterials, TEXTURE_URLS, type TextureSet } from './materials'
import { PieceInstances, SelectionOutline } from './PieceInstances'
import { renderPalettePreviews } from './previews'
import { SettingScene } from './Setting'
import { Train } from './Train'

const THUMBNAIL_WIDTH = 288
const THUMBNAIL_HEIGHT = 162

useTexture.preload(Object.values(TEXTURE_URLS))

/** Connects the canvas to the board input, thumbnails and on-demand rendering. */
function SceneBridge() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    attachBoard({ camera, canvas: gl.domElement })
    const unsubscribe = useGame.subscribe(() => invalidate())
    setThumbnailProvider(() => {
      gl.render(scene, camera)
      const canvas = document.createElement('canvas')
      canvas.width = THUMBNAIL_WIDTH
      canvas.height = THUMBNAIL_HEIGHT
      const context = canvas.getContext('2d')
      if (!context) return undefined
      const source = gl.domElement
      const fit = Math.max(THUMBNAIL_WIDTH / source.width, THUMBNAIL_HEIGHT / source.height)
      const width = THUMBNAIL_WIDTH / fit
      const height = THUMBNAIL_HEIGHT / fit
      context.drawImage(
        source,
        (source.width - width) / 2,
        (source.height - height) / 2,
        width,
        height,
        0,
        0,
        THUMBNAIL_WIDTH,
        THUMBNAIL_HEIGHT,
      )
      return canvas.toDataURL('image/jpeg', 0.72)
    })
    return () => {
      unsubscribe()
      attachBoard(null)
      setThumbnailProvider(null)
    }
  }, [camera, gl, invalidate, scene])

  return null
}

function SceneContent() {
  const loaded = useTexture(TEXTURE_URLS) as unknown as TextureSet
  const hasPreviews = useGame((state) => Object.keys(state.previews).length > 0)

  useEffect(() => {
    if (hasPreviews) return
    const id = window.setTimeout(() => {
      try {
        renderPalettePreviews(sharedMaterials(loaded))
      } catch (error) {
        console.warn('Track: palette previews unavailable', error)
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [hasPreviews, loaded])

  return (
    <>
      <SettingScene textures={loaded} />
      <PieceInstances textures={loaded} />
      <Train textures={loaded} />
      <OpenEndMarkers />
      <GridLines />
      <TileHighlight />
      <SelectionOutline />
      <Ghost />
    </>
  )
}

export default function Scene() {
  const mode = useGame((state) => state.mode)
  const lowQuality = useGame((state) => state.lowQuality)

  return (
    <Canvas
      className="absolute! inset-0"
      frameloop={mode === 'play' ? 'always' : 'demand'}
      dpr={lowQuality ? 0.7 : [1, 1.5]}
      shadows={{ type: THREE.PCFShadowMap }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.NeutralToneMapping,
      }}
      camera={{
        fov: DEFAULT_CAMERA_FOV,
        near: 0.5,
        far: 160,
        position: DEFAULT_POSITION.toArray(),
      }}
      onCreated={({ camera }) => camera.lookAt(DEFAULT_TARGET)}
      fallback={
        <div className="bg-background flex h-full items-center justify-center p-8 text-center">
          Track needs WebGL, which this browser has not made available.
        </div>
      }
    >
      <SceneBridge />
      <CameraRig />
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  )
}
