/**
 * The active piece layer (task 14.12; design.md DD-5, DD-8, sections 7.4 and
 * 8, D-47, D-49; Requirements 11.1, 11.5, 11.6, 12.1, 31.1 to 31.8, 31.10,
 * 31.11).
 *
 * Draws, with ordinary meshes that share the cached piece geometries and
 * materials:
 * - the active pieces (selected or board-dragged, `isActivePiece`), which
 *   `PieceLayer` and `BlobShadows` leave out, with their contact shadow; the
 *   selected piece has a drei `<Outlines>` that turns green or red during a
 *   board drag;
 * - the palette ghost, in the shared green or red ghost material;
 * - the 200 ms exit copy of a deleted piece.
 *
 * `ActivePieceDirector` (`activePieceMotion.ts`) holds all motion. A store
 * subscription feeds it every transition, and one `useFrame` advances it and
 * writes each actor's pose into its Three.js objects. React state changes
 * only when an actor appears or disappears, never per frame.
 *
 * Opacity animations (ghost fade-out, delete fade, lifted shadow) need their
 * own opacity per actor, so those actors use clones of the shared materials,
 * made once per actor and disposed with it. The clones share the textures
 * and shader programs of the originals (D-49).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlines } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { getMaterialLibrary, GHOST_OPACITY, type MaterialLibrary } from '@/scene/models/materials';
import { partsFor } from '@/scene/models/geometry';
import { qualityProfile } from '@/scene/quality';
import { useAppStore, useAppStoreApi } from '@/store/useAppStore';
import { BLOB, blobFootprint, blobShadowResources } from './instancing';
import {
  ActivePieceDirector,
  OUTLINE_THICKNESS,
  blobPlacement,
  outlineColourFor,
  type ActorFrame,
  type ActorInfo,
} from './activePieceMotion';

/** Writes one frame into an actor's objects. */
type ApplyFrame = (frame: ActorFrame) => void;

const noRaycast = () => null;

interface ActorObjectProps {
  info: ActorInfo;
  director: ActivePieceDirector;
  lib: MaterialLibrary;
  contactShadows: boolean;
  register: (key: string, apply: ApplyFrame | null) => void;
}

function ActorObject({ info, director, lib, contactShadows, register }: ActorObjectProps) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const blob = useRef<Mesh>(null);
  const meshes = useRef<Array<Mesh | null>>([]);
  const parts = partsFor(info.type);
  const shape = useMemo(() => blobFootprint(info.type), [info.type]);
  const outline = useAppStore((s) => (info.kind === 'piece' ? outlineColourFor(s, info.pieceId!) : null));

  // Per-actor clones for animated opacity (D-49).
  const clones = useRef(new Map<Material, MeshStandardMaterial>());
  const blobMaterial = useMemo(() => blobShadowResources().material.clone() as MeshBasicMaterial, []);
  useEffect(() => {
    const owned = clones.current;
    return () => {
      for (const m of owned.values()) m.dispose();
      owned.clear();
      blobMaterial.dispose();
    };
  }, [blobMaterial]);

  const fadeOf = (base: MeshStandardMaterial): MeshStandardMaterial => {
    let m = clones.current.get(base);
    if (!m) {
      m = base.clone();
      m.name = `activeFade:${base.name}`;
      m.transparent = true;
      m.depthWrite = false;
      clones.current.set(base, m);
    }
    return m;
  };

  const apply: ApplyFrame = (f) => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    o.visible = f.visible;
    o.position.set(f.x, f.y, f.z);
    o.rotation.set(f.tiltX, 0, f.tiltZ);
    i.rotation.set(0, f.yaw, 0);
    i.scale.setScalar(f.scale);

    if (info.kind !== 'piece') {
      parts.forEach((part, k) => {
        const mesh = meshes.current[k];
        if (!mesh) return;
        if (info.kind === 'ghost') {
          const ghost = lib.ghost(f.valid);
          if (f.opacity >= 1) {
            mesh.material = ghost;
          } else {
            const m = fadeOf(ghost);
            m.opacity = GHOST_OPACITY * f.opacity;
            mesh.material = m;
          }
        } else {
          const m = fadeOf(part.material(lib));
          m.opacity = f.opacity;
          mesh.material = m;
        }
      });
    }

    const b = blob.current;
    if (b) {
      const p = blobPlacement(shape, f);
      b.visible = f.visible;
      b.position.set(p.x, BLOB.y, p.z);
      b.rotation.set(0, p.yaw, 0);
      b.scale.set(p.width, 1, p.depth);
      blobMaterial.opacity = BLOB.opacity * p.opacity;
    }
  };

  // Place the objects before the first paint, so a new actor never shows at the origin.
  useLayoutEffect(() => {
    const f = director.frame(info.key);
    if (f) apply(f);
    register(info.key, apply);
    return () => register(info.key, null);
  });

  const translucent = info.kind !== 'piece';
  return (
    <group name={info.key} dispose={null}>
      <group ref={outer}>
        <group ref={inner}>
          {parts.map((part, k) => (
            <mesh
              key={part.name}
              ref={(m) => {
                meshes.current[k] = m;
              }}
              name={part.name}
              geometry={part.geometry}
              material={info.kind === 'ghost' ? lib.ghost(true) : part.material(lib)}
              position={[part.position[0], part.position[1], part.position[2]]}
              rotation={[part.rotation[0], part.rotation[1], part.rotation[2]]}
              scale={[part.scale[0], part.scale[1], part.scale[2]]}
              castShadow={!translucent && part.castShadow}
              receiveShadow={!translucent && part.receiveShadow}
              raycast={noRaycast}
            >
              {outline !== null && <Outlines thickness={OUTLINE_THICKNESS} color={outline} />}
            </mesh>
          ))}
        </group>
      </group>
      {contactShadows && (
        <mesh
          ref={blob}
          geometry={blobShadowResources().geometry}
          material={blobMaterial}
          renderOrder={1}
          castShadow={false}
          receiveShadow={false}
          frustumCulled={false}
          raycast={noRaycast}
        />
      )}
    </group>
  );
}

export function ActivePiece() {
  const store = useAppStoreApi();
  const lowQuality = useAppStore((s) => s.lowQuality);
  const lib = getMaterialLibrary(lowQuality);
  const contactShadows = qualityProfile(lowQuality).contactShadows;

  const director = useMemo(() => new ActivePieceDirector(store.getState()), [store]);
  const [actors, setActors] = useState<readonly ActorInfo[]>(() => director.actors());
  const shown = useRef(actors);
  const views = useRef(new Map<string, ApplyFrame>());

  const sync = () => {
    const list = director.actors();
    if (list !== shown.current) {
      shown.current = list;
      setActors(list);
    }
  };

  useEffect(() => {
    // Catch up with anything that changed between the first render and now.
    director.update(store.getState());
    sync();
    return store.subscribe((s) => {
      director.update(s);
      sync();
    });
    // `sync` only reads refs and the stable director.
  }, [store, director]);

  // Runs before the default-priority frame callbacks; a negative priority does
  // not take over rendering.
  useFrame((_, dt) => {
    director.advance(dt);
    sync();
    for (const [key, apply] of views.current) {
      const f = director.frame(key);
      if (f) apply(f);
    }
  }, -1);

  const register = useMemo(
    () => (key: string, apply: ApplyFrame | null) => {
      if (apply) views.current.set(key, apply);
      else views.current.delete(key);
    },
    [],
  );

  return (
    <group name="activePieces" dispose={null}>
      {actors.map((info) => (
        <ActorObject
          key={info.key}
          info={info}
          director={director}
          lib={lib}
          contactShadows={contactShadows}
          register={register}
        />
      ))}
    </group>
  );
}
