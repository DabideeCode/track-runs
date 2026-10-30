/**
 * Code-splitting audit (task 17.2, D-59; Requirements 32.6, 1.7, 38.3).
 *
 * Follows every static value import from `src/main.tsx` through `src/` and
 * checks that the first chunk (the main menu path) reaches none of the heavy
 * 3D or music packages and none of the modules that must stay in their own
 * chunks. `import type` and `export type` are erased at build time and are not
 * followed; dynamic `import()` calls are the split points and are not followed
 * either.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(process.cwd(), 'src');

const FORBIDDEN_PACKAGES = [/^three($|\/)/, /^@react-three\//, /^@react-spring\//, /^camera-controls($|\/)/, /^tone($|\/)/];
const FORBIDDEN_MODULES = ['ui/Playfield.tsx', 'ui/PerfOverlay.tsx', 'testHook/installTestHook.ts'];

/** Static value import specifiers of a module's source. */
function staticImports(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const specs: string[] = [];
  const fromRe = /^[ \t]*(?:import|export)\s+(?!type\s)[^;'"]*?\sfrom\s*['"]([^'"]+)['"]/gm;
  const bareRe = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
  for (const re of [fromRe, bareRe]) for (const m of code.matchAll(re)) specs.push(m[1]);
  return specs;
}

function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`cannot resolve ${spec} from ${fromFile}`);
}

function menuGraph(entry: string): { modules: Set<string>; packages: Map<string, string> } {
  const modules = new Set<string>();
  const packages = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (modules.has(file)) continue;
    modules.add(file);
    if (!/\.(ts|tsx)$/.test(file)) continue; // CSS
    for (const spec of staticImports(readFileSync(file, 'utf8'))) {
      const local = resolveLocal(spec, file);
      if (local) queue.push(local);
      else if (!packages.has(spec)) packages.set(spec, relative(SRC, file));
    }
  }
  return { modules, packages };
}

describe('the main menu chunk', () => {
  const { modules, packages } = menuGraph(join(SRC, 'main.tsx'));
  const rel = [...modules].map((m) => relative(SRC, m).replaceAll('\\', '/'));

  it('reaches no Three.js, React Three Fiber, drei, react-spring, camera-controls or tone import', () => {
    const offending = [...packages].filter(([spec]) => FORBIDDEN_PACKAGES.some((re) => re.test(spec)));
    expect(offending).toEqual([]);
    // Sanity: the walk did reach the app's main modules.
    expect(rel).toEqual(expect.arrayContaining(['App.tsx', 'app/bootstrap.ts', 'ui/MainMenu.tsx', 'runtime/SceneBridge.ts']));
    expect([...packages.keys()]).toEqual(expect.arrayContaining(['react', 'howler']));
  });

  it('does not include the playfield, the perf overlay or the test hook, which load with import()', () => {
    for (const m of FORBIDDEN_MODULES) expect(rel).not.toContain(m);
    expect(rel.some((m) => m.startsWith('scene/') && m !== 'scene/context.ts')).toBe(false);
  });

  it('the playfield and tone are reached only through dynamic import()', () => {
    const loader = readFileSync(join(SRC, 'ui', 'playfieldLoader.ts'), 'utf8');
    expect(loader).toContain("import('@/ui/Playfield')");
    const music = readFileSync(join(SRC, 'audio', 'music.ts'), 'utf8');
    expect(music).toContain("import('tone')");
    expect(staticImports(music).filter((s) => s === 'tone')).toEqual([]);
  });
});

describe('staticImports', () => {
  it('finds value imports and re-exports, and skips type-only and dynamic imports', () => {
    const src = [
      "import { a } from 'pkg-a';",
      "import b, { type C } from './b';",
      "import type { D } from 'pkg-d';",
      "export type { E } from 'pkg-e';",
      "export { f } from '@/f';",
      "import 'side-effect.css';",
      'import {',
      '  g,',
      "} from 'pkg-g';",
      "const h = () => import('pkg-h');",
      "/* import { i } from 'pkg-i'; */",
    ].join('\n');
    expect(staticImports(src).sort()).toEqual(['./b', '@/f', 'pkg-a', 'pkg-g', 'side-effect.css'].sort());
  });
});
