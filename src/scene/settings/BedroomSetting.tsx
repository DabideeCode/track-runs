/**
 * Bedroom floor setting (task 14.9; Requirements 7.6, 7.8, 30.1): grained
 * floorboards 40 × 40, a 19 × 19 dusty-blue felt rug under the grid, and a
 * bed leg, a toy crate, a slipper and a stack of books around the grid edge.
 * Placement data lives in `layout.ts`; meshes in `settingGeometry.ts`.
 */
import { SettingMeshes } from './SettingMeshes';

export function BedroomSetting({ visible = true }: { visible?: boolean }) {
  return <SettingMeshes setting="bedroom" visible={visible} />;
}
