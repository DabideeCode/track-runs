import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, type Group, type Material } from 'three';
import { useGameStore } from '@/store/gameStore';
import { COLORS } from './materials';
import { createFloorboardTexture, createRugTexture, createTabletopTexture } from './woodTexture';

const FADE_SECONDS = 0.6;
const FLOOR_REPEAT = 8;
const TABLE_REPEAT = 11;
const textureFile = (name: string) => `${import.meta.env.BASE_URL}assets/textures/${name}`;

function createMaterials() {
  const floor = createFloorboardTexture();
  floor.repeat.set(FLOOR_REPEAT, FLOOR_REPEAT);
  const table = createTabletopTexture();
  table.repeat.set(TABLE_REPEAT, TABLE_REPEAT);
  const rug = createRugTexture();
  rug.repeat.set(3, 3);

  const standard = (options: ConstructorParameters<typeof MeshStandardMaterial>[0]) =>
    new MeshStandardMaterial({ transparent: true, ...options });

  return {
    floor: standard({ map: floor, roughness: 0.7, transparent: false }),
    rug: standard({ map: rug, roughness: 0.95, transparent: false }),
    rugEdge: standard({ color: '#8fa3a0', roughness: 0.95, transparent: false }),
    table: standard({ map: table, color: '#f4f2ee', roughness: 0.68 }),
    wood: standard({ color: COLORS.walnut, roughness: 0.7 }),
    spoon: standard({ color: COLORS.walnut, roughness: 0.7 }),
    ceramic: standard({ color: COLORS.cream, roughness: 0.62 }),
    bowl: standard({ color: COLORS.cream, roughness: 0.62, side: DoubleSide }),
    apple: standard({ color: COLORS.terracotta, roughness: 0.65 }),
    pear: standard({ color: COLORS.sage, roughness: 0.68 }),
    book: standard({ color: COLORS.dustyDeep, roughness: 0.8 }),
    paper: standard({ color: COLORS.cream, roughness: 0.9 }),
    ball: standard({ color: COLORS.mustard, roughness: 0.75 }),
  };
}

type Materials = ReturnType<typeof createMaterials>;

function loadSurface(material: MeshStandardMaterial, file: string, repeat: number) {
  new TextureLoader().load(textureFile(file), (texture) => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    material.map = texture;
    material.needsUpdate = true;
  });
}

function ChairLeg({ position, material }: { position: [number, number, number]; material: Material }) {
  return (
    <mesh position={position} material={material} castShadow>
      <boxGeometry args={[0.9, 8, 0.9]} />
    </mesh>
  );
}

function BedroomSurfaces({ m }: { m: Materials }) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.06} material={m.floor} receiveShadow>
        <planeGeometry args={[70, 70]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} material={m.rugEdge} receiveShadow>
        <planeGeometry args={[18, 18]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} material={m.rug} receiveShadow>
        <planeGeometry args={[17.2, 17.2]} />
      </mesh>
    </>
  );
}

function BedroomProps({ m }: { m: Materials }) {
  return (
    <>
      <ChairLeg position={[-11.5, 4, -10.5]} material={m.wood} />
      <ChairLeg position={[-11.5, 4, -3.5]} material={m.wood} />
      <group position={[11.2, 0, 4.5]} rotation-y={0.3}>
        <mesh position-y={0.2} material={m.paper} castShadow>
          <boxGeometry args={[2.1, 0.34, 2.9]} />
        </mesh>
        <mesh position-y={0.42} material={m.book} castShadow>
          <boxGeometry args={[2.3, 0.1, 3.1]} />
        </mesh>
      </group>
      <mesh position={[10.6, 0.8, -6]} material={m.ball} castShadow>
        <sphereGeometry args={[0.85, 24, 16]} />
      </mesh>
    </>
  );
}

function KitchenProps({ m }: { m: Materials }) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.004} material={m.table} receiveShadow>
        <planeGeometry args={[70, 70]} />
      </mesh>
      <group position={[-12, 0, -5.5]}>
        <mesh position-y={1.35} scale={[1, 0.62, 1]} material={m.bowl} castShadow>
          <sphereGeometry args={[2.2, 32, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        </mesh>
        <mesh position={[-0.7, 1.45, 0.3]} material={m.apple} castShadow>
          <sphereGeometry args={[0.8, 20, 14]} />
        </mesh>
        <mesh position={[0.8, 1.5, -0.3]} material={m.pear} castShadow>
          <sphereGeometry args={[0.75, 20, 14]} />
        </mesh>
        <mesh position={[0.1, 1.55, 0.9]} material={m.apple} castShadow>
          <sphereGeometry args={[0.7, 20, 14]} />
        </mesh>
      </group>
      <group position={[11.5, 0, 3]}>
        <mesh position-y={0.95} material={m.ceramic} castShadow>
          <cylinderGeometry args={[0.95, 0.85, 1.9, 24]} />
        </mesh>
        <mesh position={[1.1, 0.95, 0]} rotation-x={Math.PI / 2} material={m.ceramic} castShadow>
          <torusGeometry args={[0.42, 0.11, 10, 20]} />
        </mesh>
      </group>
      <group position={[10.5, 0.14, -6.5]} rotation-y={0.5}>
        <mesh material={m.spoon} castShadow>
          <boxGeometry args={[0.32, 0.16, 5]} />
        </mesh>
        <mesh position={[0, 0.05, 3.1]} scale={[0.72, 0.16, 1]} material={m.spoon} castShadow>
          <sphereGeometry args={[1, 20, 12]} />
        </mesh>
      </group>
    </>
  );
}

export function Ground() {
  const setting = useGameStore((state) => state.setting);
  const m = useMemo(createMaterials, []);

  // Drawn surfaces show until the sourced textures arrive, and stay if a file cannot load.
  useEffect(() => {
    loadSurface(m.floor, 'wood-floor.jpg', FLOOR_REPEAT);
    loadSurface(m.table, 'table-top.jpg', TABLE_REPEAT);
  }, [m]);

  const bedroomFade = useMemo(() => [m.wood, m.book, m.paper, m.ball], [m]);
  const kitchenFade = useMemo(() => [m.table, m.ceramic, m.bowl, m.apple, m.pear, m.spoon], [m]);
  const surfaces = useRef<Group>(null);
  const bedroomProps = useRef<Group>(null);
  const kitchen = useRef<Group>(null);
  const blend = useRef(setting === 'kitchen' ? 1 : 0);

  // The bedroom surfaces stay solid while the table fades in above them, so nothing shows through.
  const applyBlend = useRef((value: number) => {
    const eased = value * value * (3 - 2 * value);
    for (const material of kitchenFade) material.opacity = eased;
    for (const material of bedroomFade) material.opacity = 1 - eased;
    if (surfaces.current) surfaces.current.visible = value < 1;
    if (bedroomProps.current) bedroomProps.current.visible = value < 1;
    if (kitchen.current) kitchen.current.visible = value > 0;
  });

  useEffect(() => applyBlend.current(blend.current), []);

  useFrame((_, delta) => {
    const target = setting === 'kitchen' ? 1 : 0;
    if (blend.current === target) return;
    const step = delta / FADE_SECONDS;
    blend.current = target > blend.current
      ? Math.min(target, blend.current + step)
      : Math.max(target, blend.current - step);
    applyBlend.current(blend.current);
  });

  return (
    <>
      <group ref={surfaces}>
        <BedroomSurfaces m={m} />
      </group>
      <group ref={bedroomProps}>
        <BedroomProps m={m} />
      </group>
      <group ref={kitchen}>
        <KitchenProps m={m} />
      </group>
    </>
  );
}
