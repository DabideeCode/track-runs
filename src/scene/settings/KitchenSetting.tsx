/**
 * Kitchen table setting (task 14.9; Requirements 7.7, 7.8, 30.1): a 30 × 24
 * grained tabletop under the grid, and a fruit bowl, a mug, a salt shaker and
 * a folded napkin around the grid edge. Placement data lives in `layout.ts`;
 * meshes in `settingGeometry.ts`.
 */
import { SettingMeshes } from './SettingMeshes';

export function KitchenSetting({ visible = true }: { visible?: boolean }) {
  return <SettingMeshes setting="kitchen" visible={visible} />;
}
