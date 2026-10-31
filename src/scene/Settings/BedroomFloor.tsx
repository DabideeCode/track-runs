import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { loadTexture } from '../geometry/materials';
import { box, cylinder, merge } from '../geometry/parts';

const LEG_HEIGHT = 3.2;
const LEG_RADIUS = 0.2;

/** Warm floorboards with a soft rug. All props stay outside the grid, which ends at 8 tiles out. */
export function BedroomFloor() {
  const parts = useMemo(() => {
    const standard = (color: string, map?: ReturnType<typeof loadTexture>, roughness = 0.8) =>
      new MeshStandardMaterial({ color, map: map ?? null, roughness, metalness: 0, transparent: true });
    const fabric = loadTexture('fabric.jpg', 9);
    const wood = loadTexture('wood-honey.jpg');
    return {
      floor: standard('#f0e2cc', loadTexture('floorboards.jpg', 6)),
      rug: standard('#fff0d4', fabric, 0.96),
      rugBorder: standard('#a8b89f', fabric, 0.96),
      chairWood: standard('#dcbf95', wood, 0.72),
      bookBlue: standard('#8aa7bf', undefined, 0.85),
      bookRed: standard('#cf8467', undefined, 0.85),
      chairLegs: merge(
        cylinder(LEG_RADIUS, LEG_RADIUS * 0.8, LEG_HEIGHT, [-12.4, LEG_HEIGHT / 2, -11]),
        cylinder(LEG_RADIUS, LEG_RADIUS * 0.8, LEG_HEIGHT, [-9.4, LEG_HEIGHT / 2, -11]),
        cylinder(LEG_RADIUS, LEG_RADIUS * 0.8, LEG_HEIGHT, [-12.4, LEG_HEIGHT / 2, -14]),
        cylinder(LEG_RADIUS, LEG_RADIUS * 0.8, LEG_HEIGHT, [-9.4, LEG_HEIGHT / 2, -14]),
      ),
      chairSeat: box(3.6, 0.3, 3.6, [-10.9, LEG_HEIGHT + 0.15, -12.5], 0.1),
      bookLower: box(3.4, 0.45, 4.4, [11.8, 0.225, -3], 0.05),
      bookUpper: box(2.8, 0.36, 3.8, [11.7, 0.63, -2.8], 0.05),
    };
  }, []);

  return (
    <>
      <mesh position-y={-0.012} rotation-x={-Math.PI / 2} receiveShadow material={parts.floor} renderOrder={-2}>
        <planeGeometry args={[90, 90]} />
      </mesh>
      <mesh position-y={-0.006} rotation-x={-Math.PI / 2} receiveShadow material={parts.rugBorder} renderOrder={-1}>
        <planeGeometry args={[18.6, 18.6]} />
      </mesh>
      <mesh position-y={-0.003} rotation-x={-Math.PI / 2} receiveShadow material={parts.rug} renderOrder={-1}>
        <planeGeometry args={[17.8, 17.8]} />
      </mesh>
      <mesh geometry={parts.chairLegs} material={parts.chairWood} castShadow receiveShadow />
      <mesh geometry={parts.chairSeat} material={parts.chairWood} castShadow receiveShadow />
      <mesh geometry={parts.bookLower} material={parts.bookBlue} castShadow receiveShadow />
      <mesh geometry={parts.bookUpper} material={parts.bookRed} castShadow receiveShadow />
    </>
  );
}
