import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { CAMERA_FOV, defaultCameraPosition } from '@/domain/camera';
import { setBoardView } from '@/interaction/boardView';
import { useGameStore } from '@/store/gameStore';
import { setThumbnailCapture } from '@/store/thumbnail';
import { ActivePieces } from './ActivePiece';
import { CameraRig } from './CameraRig';
import { ContactShadowQuads } from './ContactShadowQuads';
import { Grid } from './Grid';
import { Lighting } from './Lighting';
import { OpenEndMarkers } from './OpenEndMarkers';
import { PieceBatches } from './PieceBatches';
import { SettingScene } from './Settings/SettingScene';
import { Train } from './Train';

const MAX_DPR = 1.5;
const LOW_QUALITY_DPR = 0.75; // below 1, so it lowers resolution even on a standard display
const THUMBNAIL_WIDTH = 240;
const THUMBNAIL_HEIGHT = 135;

/** Linear to sRGB for one byte. Render targets hold linear colour. */
const SRGB_BYTES = Uint8ClampedArray.from({ length: 256 }, (_, value) => {
  const linear = value / 255;
  const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
});

/**
 * Renders a small offscreen copy. Reading back the full canvas would stall the main thread on
 * every save and autosave.
 */
function renderThumbnail(gl: WebGLRenderer, scene: Scene, camera: Camera): string | null {
  const target = new WebGLRenderTarget(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  const pixels = new Uint8Array(THUMBNAIL_WIDTH * THUMBNAIL_HEIGHT * 4);
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  gl.render(scene, camera);
  gl.readRenderTargetPixels(target, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, pixels);
  gl.setRenderTarget(previous);
  target.dispose();

  const shot = document.createElement('canvas');
  shot.width = THUMBNAIL_WIDTH;
  shot.height = THUMBNAIL_HEIGHT;
  const context = shot.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  const rowBytes = THUMBNAIL_WIDTH * 4;
  for (let row = 0; row < THUMBNAIL_HEIGHT; row++) {
    const from = row * rowBytes;
    const to = (THUMBNAIL_HEIGHT - 1 - row) * rowBytes; // WebGL rows run bottom to top
    for (let index = 0; index < rowBytes; index += 4) {
      image.data[to + index] = SRGB_BYTES[pixels[from + index]!]!;
      image.data[to + index + 1] = SRGB_BYTES[pixels[from + index + 1]!]!;
      image.data[to + index + 2] = SRGB_BYTES[pixels[from + index + 2]!]!;
      image.data[to + index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return shot.toDataURL('image/jpeg', 0.7);
}

function BoardViewBridge() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const canvas = gl.domElement;
    setBoardView({ camera, canvas });
    canvas.dataset.ready = 'true';
    setThumbnailCapture(() => renderThumbnail(gl, scene, camera));
    return () => {
      setBoardView(null);
      setThumbnailCapture(null);
    };
  }, [camera, gl, scene]);
  return null;
}

export default function PlayfieldCanvas() {
  const lowQuality = useGameStore((state) => state.lowQuality);
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={lowQuality ? LOW_QUALITY_DPR : [1, MAX_DPR]}
      shadows="percentage"
      flat
      camera={{ fov: CAMERA_FOV, position: defaultCameraPosition(), near: 0.1, far: 160 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <BoardViewBridge />
      <CameraRig />
      <Lighting />
      <SettingScene />
      <Grid />
      <PieceBatches />
      <ContactShadowQuads />
      <ActivePieces />
      <OpenEndMarkers />
      <Train />
    </Canvas>
  );
}
