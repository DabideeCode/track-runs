import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { useGameStore } from '@/store/gameStore'
import { GridLines, OpenEndMarkers, TileHighlight } from './BoardOverlays'
import { CameraRig, DEFAULT_CAMERA } from './CameraRig'
import { Lights, SettingSurface } from './Environment'
import { Ghost } from './Ghost'
import { clickPlace } from './interaction'
import { PiecesLayer } from './PiecesLayer'
import { clientToTile, registerCamera } from './pointer'
import { registerThumbnail } from './thumbnail'
import { TrainView } from './TrainView'

const MAX_DPR = 1.5

/** Wires the camera/canvas into pointer maths and keeps quality settings in sync. */
function Bridge({ lowQuality }: { lowQuality: boolean }) {
  const { camera, gl, scene, setDpr } = useThree()
  useEffect(() => {
    registerCamera(camera, gl.domElement)
    registerThumbnail(() => {
      gl.render(scene, camera)
      return gl.domElement
    })
    return () => {
      registerCamera(null, null)
      registerThumbnail(null)
    }
  }, [camera, gl, scene])
  useEffect(() => {
    setDpr(lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR))
    gl.shadowMap.enabled = !lowQuality
    gl.shadowMap.needsUpdate = true
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true))
    })
  }, [lowQuality, gl, scene, setDpr])
  return null
}

const groundGeo = new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2)

/** Invisible ground that turns clicks into placement / deselection and tracks the hovered tile. */
function GroundInput() {
  return (
    <mesh
      geometry={groundGeo}
      visible={false}
      onPointerMove={(e) => useGameStore.getState().setHoverTile(clientToTile(e.nativeEvent.clientX, e.nativeEvent.clientY))}
      onPointerLeave={() => useGameStore.getState().setHoverTile(null)}
      onClick={(e) => {
        if (e.delta > 5) return
        const s = useGameStore.getState()
        if (s.mode !== 'build') return
        if (s.selectedTool) clickPlace(clientToTile(e.nativeEvent.clientX, e.nativeEvent.clientY))
        else s.selectPiece(null)
      }}
    />
  )
}

export function Scene() {
  const lowQuality = useGameStore((s) => s.lowQuality)
  return (
    <Canvas
      className="!absolute inset-0"
      shadows="percentage"
      dpr={[1, MAX_DPR]}
      flat
      camera={{ fov: 40, near: 0.1, far: 220, position: DEFAULT_CAMERA.toArray() }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Bridge lowQuality={lowQuality} />
      <Lights lowQuality={lowQuality} />
      <SettingSurface />
      <GridLines />
      <TileHighlight />
      <OpenEndMarkers />
      <PiecesLayer />
      <Ghost />
      <TrainView />
      <GroundInput />
      <CameraRig />
    </Canvas>
  )
}
