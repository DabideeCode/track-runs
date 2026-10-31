import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const allowed = new Set([
  'react',
  'react-dom',
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  'zustand',
  '@react-spring/three',
  'howler',
  'nanoid',
  'tone',
]);

describe('runtime dependencies', () => {
  it('stay inside the Section 3 allowlist', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const outside = Object.keys(pkg.dependencies).filter(
      (name) => !allowed.has(name) && !name.startsWith('@radix-ui/'),
    );
    expect(outside).toEqual([]);
  });
});
