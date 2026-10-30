/**
 * Draws the cached meshes of one setting (`settingParts`) with the shared
 * materials for the current quality level. Every mesh ignores raycasts, so
 * neither ground nor props can be picked or affect placement (Requirement 7.8).
 *
 * `visible` lets the scene keep both settings mounted and swap them at once,
 * with no geometry or texture work at switch time (Requirement 7.3).
 */
import { useAppStore } from '@/store/useAppStore';
import { getMaterialLibrary } from '@/scene/models/materials';
import { qualityProfile } from '@/scene/quality';
import type { SettingId } from './layout';
import { noRaycast, resolveSettingMaterial, settingParts } from './settingGeometry';

export interface SettingMeshesProps {
  setting: SettingId;
  visible?: boolean;
}

export function SettingMeshes({ setting, visible = true }: SettingMeshesProps) {
  const lowQuality = useAppStore((s) => s.lowQuality);
  const shadows = qualityProfile(lowQuality).shadows;
  const lib = getMaterialLibrary(lowQuality);
  const parts = settingParts(setting);

  return (
    <group name={`setting-${setting}`} visible={visible}>
      {parts.map((part) => (
        <mesh
          key={part.name}
          name={part.name}
          geometry={part.geometry}
          material={resolveSettingMaterial(lib, part.materialSpec)}
          castShadow={shadows && part.castShadow}
          receiveShadow={shadows && part.receiveShadow}
          raycast={noRaycast}
        />
      ))}
    </group>
  );
}
