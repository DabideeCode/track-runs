import { createInstances } from '@react-three/drei';
import { useEffect, useMemo, useRef, type ComponentType, type ReactNode } from 'react';
import { CATALOG } from '@/domain/catalog';
import type { PieceType } from '@/domain/types';
import { useGameStore } from '@/store/gameStore';
import { ContactShadowField } from './ContactShadows';
import { familyMaterials } from './materials';
import { pieceParts, type ModelPart } from './pieceGeometry';
import { PieceNode } from './PieceNode';

const MAX_INSTANCES = 256;

interface Batch {
  part: ModelPart;
  Provider: ReturnType<typeof createInstances>[0];
  Instance: ComponentType;
}

function createBatches() {
  const byType = new Map<PieceType, Batch[]>();
  for (const { type } of CATALOG) {
    byType.set(
      type,
      pieceParts(type).map((part) => {
        const [Provider, Instance] = createInstances();
        return { part, Provider, Instance: Instance as unknown as ComponentType };
      }),
    );
  }
  return byType;
}

function InstanceProviders({ batches, children }: { batches: Batch[]; children: ReactNode }) {
  const materials = familyMaterials();
  return batches.reduceRight<ReactNode>(
    (inner, { part, Provider }) => (
      <Provider
        limit={MAX_INSTANCES}
        geometry={part.geometry}
        material={materials[part.family]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        {inner}
      </Provider>
    ),
    children,
  );
}

export function PieceField() {
  const pieces = useGameStore((state) => state.pieces);
  const batches = useMemo(createBatches, []);
  const allBatches = useMemo(() => [...batches.values()].flat(), [batches]);
  const firstRender = useRef(true);

  useEffect(() => {
    firstRender.current = false;
  }, []);

  return (
    <InstanceProviders batches={allBatches}>
      <ContactShadowField>
        {pieces.map((piece) => (
          <PieceNode
            key={piece.id}
            piece={piece}
            parts={batches.get(piece.type)!.map((batch) => batch.Instance)}
            animateEntrance={!firstRender.current}
          />
        ))}
      </ContactShadowField>
    </InstanceProviders>
  );
}
