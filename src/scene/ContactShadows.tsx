import { createInstances } from '@react-three/drei';
import type { ReactNode } from 'react';
import { PlaneGeometry } from 'three';
import { catalogItem } from '@/domain/catalog';
import type { PieceType } from '@/domain/types';
import { blobMaterial } from './materials';

const [BlobInstances, BlobInstance] = createInstances();
const blobGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export function ContactShadowField({ children }: { children: ReactNode }) {
  return (
    <BlobInstances
      limit={256}
      geometry={blobGeometry}
      material={blobMaterial()}
      frustumCulled={false}
      renderOrder={1}
    >
      {children}
    </BlobInstances>
  );
}

export function blobSize(type: PieceType) {
  const { footprint, kind } = catalogItem(type);
  return (kind === 'track' ? 1.15 : 1.25) * footprint;
}

export function ContactShadow({ type }: { type: PieceType }) {
  return <BlobInstance position={[0, 0.012, 0]} scale={blobSize(type)} />;
}
