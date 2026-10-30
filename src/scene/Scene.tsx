/**
 * The 3D scene inside the playfield canvas (task 14.14; design sections 7.4
 * to 7.6; Requirements 2.6, 32.1, 32.2).
 *
 * Composes the camera, lights, both settings (kept mounted and swapped with
 * `visible`, so a switch does no loading, D-46), the grid, the tile
 * highlight, the piece layers, the pick proxies and the train. It renders only
 * Three.js objects: every menu, palette, button, dialog and toast is an HTML
 * overlay outside the canvas (Requirement 2.6).
 */
import { useAppStore } from '@/store/useAppStore';
import { CameraRig } from './CameraRig';
import { GridLines } from './GridLines';
import { Lighting } from './Lighting';
import { TileHighlight } from './TileHighlight';
import { ActivePiece } from './pieces/ActivePiece';
import { BlobShadows } from './pieces/BlobShadows';
import { OpenEndMarkers } from './pieces/OpenEndMarkers';
import { PieceLayer } from './pieces/PieceLayer';
import { PickProxies, type PickTarget } from './pieces/PickProxies';
import { BedroomSetting } from './settings/BedroomSetting';
import { KitchenSetting } from './settings/KitchenSetting';
import { TrainView } from './train/TrainView';

export interface SceneProps {
  /** The playfield's drag controller; receives the piece picker (D-47). */
  controller?: PickTarget | null;
}

export function Scene({ controller = null }: SceneProps) {
  const setting = useAppStore((s) => s.setting);
  return (
    <>
      <CameraRig />
      <Lighting />
      <BedroomSetting visible={setting === 'bedroom'} />
      <KitchenSetting visible={setting === 'kitchen'} />
      <GridLines />
      <TileHighlight />
      <PieceLayer />
      <ActivePiece />
      <BlobShadows />
      <OpenEndMarkers />
      <PickProxies controller={controller} />
      <TrainView />
    </>
  );
}
