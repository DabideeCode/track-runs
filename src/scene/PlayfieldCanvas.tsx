import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { registerViewport } from '@/interaction/pointerRay';
import { registerThumbnailCapture, useGameStore } from '@/store/gameStore';
import { CameraRig, DEFAULT_CAMERA } from './CameraRig';
import { DragGhost } from './DragGhost';
import { ExitEffects } from './ExitEffects';
import { GridOverlay } from './GridOverlay';
import { Ground } from './Ground';
import { Lighting } from './Lighting';
import { OpenEndMarkers } from './OpenEndMarkers';
import { PieceField } from './PieceField';
import { SelectionOutline } from './SelectionOutline';
import { TileHighlight } from './TileHighlight';
import { TrainView } from './TrainView';

const THUMBNAIL_WIDTH = 240;
const THUMBNAIL_HEIGHT = 135;

function ViewportBridge() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    registerViewport({ camera, canvas: gl.domElement });
    registerThumbnailCapture(() => {
      try {
        gl.render(scene, camera);
        const output = document.createElement('canvas');
        output.width = THUMBNAIL_WIDTH;
        output.height = THUMBNAIL_HEIGHT;
        output.getContext('2d')?.drawImage(gl.domElement, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
        return output.toDataURL('image/jpeg', 0.7);
      } catch {
        return undefined;
      }
    });
    const stopCursor = useGameStore.subscribe((state) => {
      const overPiece = state.hoverPieceId !== null && !state.selectedTool;
      gl.domElement.style.cursor = state.drag ? 'grabbing' : overPiece ? 'pointer' : 'auto';
    });
    return () => {
      stopCursor();
      registerViewport(null);
      registerThumbnailCapture(null);
    };
  }, [camera, gl, scene]);

  return null;
}

function hasWebGl() {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export default function PlayfieldCanvas() {
  const lowQuality = useGameStore((state) => state.lowQuality);

  if (!hasWebGl()) {
    return (
      <p className="grid h-full place-items-center px-8 text-center text-ink-soft">
        Track needs WebGL, which is turned off in this browser. Turn it on and reload.
      </p>
    );
  }

  return (
    <Canvas
      className="absolute inset-0"
      dpr={lowQuality ? 0.75 : [1, 1.5]}
      shadows="percentage"
      frameloop="always"
      camera={{ fov: 42, position: DEFAULT_CAMERA, near: 0.5, far: 120 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ViewportBridge />
      <Lighting />
      <Ground />
      <GridOverlay />
      <TileHighlight />
      <PieceField />
      <OpenEndMarkers />
      <SelectionOutline />
      <DragGhost />
      <ExitEffects />
      <TrainView />
      <CameraRig />
    </Canvas>
  );
}
