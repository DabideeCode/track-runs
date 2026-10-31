import { useMemo } from 'react';
import { LatheGeometry, MeshStandardMaterial, TorusGeometry, Vector2 } from 'three';
import { loadTexture } from '../geometry/materials';
import { box, cylinder, merge, sphere } from '../geometry/parts';

function bowlProfile(): LatheGeometry {
  const points = [
    [0, 0.05],
    [0.9, 0.05],
    [1.5, 0.3],
    [1.95, 0.85],
    [2.02, 0.95],
    [1.9, 0.92],
    [1.4, 0.42],
    [0, 0.2],
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(points, 28);
}

function mugHandle() {
  const geometry = new TorusGeometry(0.42, 0.1, 10, 18);
  geometry.translate(11.9, 0.85, -7);
  return geometry;
}

/** A tabletop with warmer light. The bowl and mug sit outside the grid, which ends at 8 tiles out. */
export function KitchenTable() {
  const parts = useMemo(() => {
    const standard = (color: string, map?: ReturnType<typeof loadTexture>, roughness = 0.8) =>
      new MeshStandardMaterial({ color, map: map ?? null, roughness, metalness: 0, transparent: true });
    return {
      top: standard('#f7e7cf', loadTexture('wood-tabletop.jpg', 4), 0.7),
      boardWood: standard('#e2c29a', loadTexture('wood-honey.jpg'), 0.72),
      bowlPaint: standard('#8aa7bf', undefined, 0.85),
      mugPaint: standard('#f3e8d2', undefined, 0.85),
      apple: standard('#cf8467', undefined, 0.7),
      lemon: standard('#deb26a', undefined, 0.7),
      pear: standard('#9fb896', undefined, 0.7),
      bowl: (() => {
        const geometry = bowlProfile();
        geometry.translate(-11.6, 0, -5.5);
        return geometry;
      })(),
      apples: merge(sphere(0.56, [-12.1, 0.72, -5.9]), sphere(0.52, [-11.4, 0.74, -4.9])),
      lemons: sphere(0.48, [-11, 0.7, -6]),
      pears: sphere(0.46, [-11.9, 1.2, -5.3]),
      mug: cylinder(0.72, 0.68, 1.6, [11, 0.8, -7], 24),
      handle: mugHandle(),
      board: box(3.6, 0.2, 5.2, [11.4, 0.1, 4], 0.08),
    };
  }, []);

  return (
    <>
      <mesh position-y={-0.45} receiveShadow material={parts.top}>
        <boxGeometry args={[34, 0.9, 27]} />
      </mesh>
      <mesh geometry={parts.bowl} material={parts.bowlPaint} castShadow receiveShadow />
      <mesh geometry={parts.apples} material={parts.apple} castShadow />
      <mesh geometry={parts.lemons} material={parts.lemon} castShadow />
      <mesh geometry={parts.pears} material={parts.pear} castShadow />
      <mesh geometry={parts.mug} material={parts.mugPaint} castShadow receiveShadow />
      <mesh geometry={parts.handle} material={parts.mugPaint} castShadow />
      <mesh geometry={parts.board} material={parts.boardWood} castShadow receiveShadow />
    </>
  );
}
