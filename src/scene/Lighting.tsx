/**
 * Scene lighting (task 14.9; design.md section 7.5; Requirements 7.3, 7.6,
 * 7.7, 30.9, 32.4, 33.1).
 *
 * - One directional light is the only shadow-casting light: 2048 × 2048
 *   shadow map, orthographic shadow camera bounded to ±12 units, and a
 *   blurred PCF edge (`MAIN_LIGHT.shadowRadius`, decision D-46). In Low
 *   quality it casts no shadow (Requirement 33.1).
 * - A hemisphere light and a weak ambient light give the fill.
 * - Colours and intensities come from `LIGHTING_MOODS` (palette tokens). On a
 *   setting change they move to the new mood over 400 ms in `useFrame`, with
 *   no React re-renders during the transition (Requirement 7.3: under 1 s).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type AmbientLight, type DirectionalLight, type HemisphereLight } from 'three';
import { useAppStore } from '@/store/useAppStore';
import { qualityProfile } from './quality';
import {
  LIGHTING_MOODS,
  MAIN_LIGHT,
  lightTransitionProgress,
  type LightingMood,
  type SettingId,
} from './settings/layout';

interface MoodState {
  main: Color;
  mainIntensity: number;
  sky: Color;
  ground: Color;
  hemisphereIntensity: number;
  ambient: Color;
  ambientIntensity: number;
}

function moodState(m: LightingMood): MoodState {
  return {
    main: new Color(m.main),
    mainIntensity: m.mainIntensity,
    sky: new Color(m.sky),
    ground: new Color(m.ground),
    hemisphereIntensity: m.hemisphereIntensity,
    ambient: new Color(m.ambient),
    ambientIntensity: m.ambientIntensity,
  };
}

function cloneMood(s: MoodState): MoodState {
  return {
    main: s.main.clone(),
    mainIntensity: s.mainIntensity,
    sky: s.sky.clone(),
    ground: s.ground.clone(),
    hemisphereIntensity: s.hemisphereIntensity,
    ambient: s.ambient.clone(),
    ambientIntensity: s.ambientIntensity,
  };
}

function mixMood(out: MoodState, a: MoodState, b: MoodState, t: number): void {
  out.main.lerpColors(a.main, b.main, t);
  out.sky.lerpColors(a.sky, b.sky, t);
  out.ground.lerpColors(a.ground, b.ground, t);
  out.ambient.lerpColors(a.ambient, b.ambient, t);
  out.mainIntensity = a.mainIntensity + (b.mainIntensity - a.mainIntensity) * t;
  out.hemisphereIntensity = a.hemisphereIntensity + (b.hemisphereIntensity - a.hemisphereIntensity) * t;
  out.ambientIntensity = a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * t;
}

export function Lighting() {
  const setting = useAppStore((s) => s.setting) as SettingId;
  const lowQuality = useAppStore((s) => s.lowQuality);
  const quality = qualityProfile(lowQuality);

  const mainRef = useRef<DirectionalLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);
  const ambientRef = useRef<AmbientLight>(null);

  /** Mood currently shown; mutated in place during a transition. */
  const current = useRef<MoodState | null>(null);
  current.current ??= moodState(LIGHTING_MOODS[setting]);
  const transition = useRef<{ from: MoodState; to: MoodState; elapsedMs: number } | null>(null);

  const apply = () => {
    const m = current.current!;
    const main = mainRef.current;
    const hemi = hemiRef.current;
    const ambient = ambientRef.current;
    if (main) {
      main.color.copy(m.main);
      main.intensity = m.mainIntensity;
    }
    if (hemi) {
      hemi.color.copy(m.sky);
      hemi.groundColor.copy(m.ground);
      hemi.intensity = m.hemisphereIntensity;
    }
    if (ambient) {
      ambient.color.copy(m.ambient);
      ambient.intensity = m.ambientIntensity;
    }
  };

  // Shadow camera and initial colours, before the first frame.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (main) {
      const cam = main.shadow.camera;
      const b = MAIN_LIGHT.shadowBounds;
      cam.left = -b;
      cam.right = b;
      cam.top = b;
      cam.bottom = -b;
      cam.near = MAIN_LIGHT.shadowNear;
      cam.far = MAIN_LIGHT.shadowFar;
      cam.updateProjectionMatrix();
      main.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      main.shadow.bias = MAIN_LIGHT.shadowBias;
      main.shadow.normalBias = MAIN_LIGHT.shadowNormalBias;
      main.shadow.radius = MAIN_LIGHT.shadowRadius;
      main.position.set(...MAIN_LIGHT.position);
      main.target.position.set(...MAIN_LIGHT.target);
      main.target.updateMatrixWorld();
    }
    // `apply` reads refs only, so it is safe to leave out of the dependencies.
    apply();
  }, [quality.shadowMapSize]);

  // Start a transition from whatever is shown now to the new setting's mood.
  const shownSetting = useRef(setting);
  useEffect(() => {
    if (shownSetting.current === setting) return;
    shownSetting.current = setting;
    transition.current = {
      from: cloneMood(current.current!),
      to: moodState(LIGHTING_MOODS[setting]),
      elapsedMs: 0,
    };
  }, [setting]);

  useFrame((_, dt) => {
    const t = transition.current;
    if (!t) return;
    t.elapsedMs += Math.max(0, dt) * 1000;
    const u = lightTransitionProgress(t.elapsedMs);
    mixMood(current.current!, t.from, t.to, u);
    apply();
    if (u >= 1) transition.current = null;
  });

  return (
    <>
      <directionalLight ref={mainRef} castShadow={quality.shadows} />
      <hemisphereLight ref={hemiRef} />
      <ambientLight ref={ambientRef} />
    </>
  );
}
