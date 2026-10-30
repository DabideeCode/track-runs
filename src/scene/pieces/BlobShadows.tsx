/**
 * Soft contact shadows under static pieces and the train (task 14.11;
 * design.md section 7.4; Requirements 30.10, 33.1).
 *
 * One instanced, horizontal plane with a radial-gradient texture in the
 * `blobShadow` colour. Instances 0 to 2 are the locomotive and the two
 * carriages; the rest are the static pieces, rotated with each piece and
 * sized from its model bounds. Active pieces (selected or board-dragged) are
 * left out, because `ActivePiece` (task 14.12) draws their shadow with the
 * lifted, larger and softer look of Requirement 31.1.
 *
 * Piece matrices are rewritten only when the static pieces change. The train
 * slots are rewritten in `useFrame` only when the train runtime's version
 * changes, so a parked train costs nothing per frame. With Low quality on,
 * nothing is rendered (Requirement 33.1).
 */
import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import type { VehiclePose } from '@/domain/train';
import { TrainRuntimeContext } from '@/scene/context';
import { qualityProfile } from '@/scene/quality';
import { useAppStore, useAppStoreShallow } from '@/store/useAppStore';
import { TRAIN_BLOB_SLOTS, blobShadowResources, writePieceBlobs, writeTrainBlobs } from './instancing';
import { MAX_PIECES, staticPieces } from './pieceLayout';

/** The part of `TrainRuntime` the shadows read. */
export interface TrainPoseSource {
  poses(): VehiclePose[] | null;
  getVersion(): number;
}

export interface BlobShadowsProps {
  /**
   * The train pose source. Defaults to the `TrainRuntimeContext` instance;
   * pass null to draw piece shadows only.
   */
  train?: TrainPoseSource | null;
}

function BlobShadowMesh({ train }: { train: TrainPoseSource | null }) {
  const { pieces, selectedPieceId, drag } = useAppStoreShallow((s) => ({
    pieces: s.pieces,
    selectedPieceId: s.selectedPieceId,
    drag: s.drag,
  }));
  const shown = useMemo(() => staticPieces(pieces, { selectedPieceId, drag }), [pieces, selectedPieceId, drag]);
  const meshRef = useRef<InstancedMesh>(null);
  const trainVersion = useRef<number | null>(null);
  const { geometry, material } = blobShadowResources();

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Until the first frame writes the train, keep its slots hidden.
    if (trainVersion.current === null) writeTrainBlobs(mesh, null);
    writePieceBlobs(mesh, shown);
  }, [shown]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const version = train ? train.getVersion() : -1;
    if (version === trainVersion.current) return;
    trainVersion.current = version;
    writeTrainBlobs(mesh, train ? train.poses() : null);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_PIECES + TRAIN_BLOB_SLOTS]}
      name="blobShadows"
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
      renderOrder={1}
      raycast={() => null}
    />
  );
}

export function BlobShadows({ train }: BlobShadowsProps) {
  const lowQuality = useAppStore((s) => s.lowQuality);
  const provided = useContext(TrainRuntimeContext);
  if (!qualityProfile(lowQuality).contactShadows) return null;
  return <BlobShadowMesh train={train === undefined ? provided : train} />;
}
