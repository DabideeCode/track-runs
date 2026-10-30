// Repository audit for the stack rules (Requirements 1.6, 1.7, 1.8).
// Checks package.json against the runtime allow-list, keeps build tooling in
// devDependencies, rejects physics engines, keeps `tone` behind a dynamic
// import and keeps src/domain free of framework, renderer and DOM imports.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const SRC = join(ROOT, 'src');
const DOMAIN = join(SRC, 'domain');

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;
const runtimeDeps = Object.keys(pkg.dependencies ?? {});
const devDeps = Object.keys(pkg.devDependencies ?? {});
const allDeclared = [
  ...runtimeDeps,
  ...devDeps,
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
];

// ---------------------------------------------------------------------------
// Allow-lists and deny-lists
// ---------------------------------------------------------------------------

const RUNTIME_ALLOW = new Set([
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
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'lucide-react',
]);

function isAllowedRuntime(name: string): boolean {
  return RUNTIME_ALLOW.has(name) || name.startsWith('@radix-ui/');
}

/** Build-time tooling that may only be a dev dependency. */
function isBuildTooling(name: string): boolean {
  return (
    name === 'typescript' ||
    name === 'vite' ||
    name.startsWith('@vitejs/') ||
    name === 'tailwindcss' ||
    name.startsWith('@tailwindcss/')
  );
}

/** Known physics engines and their React bindings. */
const PHYSICS_PATTERN =
  /(^|[/@-])(physics|physijs|cannon|cannon-es|rapier|rapier3d|rapier2d|ammo|ammo\.js|ammojs|oimo|oimophysics|matter-js|planck|planck-js|p2|p2-es|box2d|jolt|jolt-physics|enable3d|bullet)([/-]|$)/i;

function isPhysicsPackage(name: string): boolean {
  return PHYSICS_PATTERN.test(name);
}

/** Bare module specifiers the domain core must never import (also covered by the relative-only rule). */
const DOMAIN_FORBIDDEN = /^(react|react-dom|three|@react-three\/|zustand|howler|tone|@react-spring\/)/;

/** DOM-only globals that must not appear in the domain core. */
const DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'AudioContext',
  'webkitAudioContext',
];
const DOM_GLOBAL_PATTERN = new RegExp(`(?<![.\\w$])(${DOM_GLOBALS.join('|')})(?![\\w$])`, 'g');

// ---------------------------------------------------------------------------
// Source scanning helpers
// ---------------------------------------------------------------------------

/**
 * Returns two copies of `code` with the same length and offsets as the input:
 * `noComments` has every comment replaced by spaces, and `blanked` also has the
 * contents of every string and template literal replaced by spaces (quotes kept).
 * Newlines are always kept. Patterns run on `blanked`, so text inside comments or
 * strings never matches, and specifiers are read back from `noComments`.
 */
function scanSource(code: string): { noComments: string; blanked: string } {
  const noComments: string[] = [];
  const blanked: string[] = [];
  const keep = (ch: string) => {
    noComments.push(ch);
    blanked.push(ch);
  };
  const blankAll = (ch: string) => {
    const b = ch === '\n' ? '\n' : ' ';
    noComments.push(b);
    blanked.push(b);
  };
  const blankString = (ch: string) => {
    noComments.push(ch);
    blanked.push(ch === '\n' ? '\n' : ' ');
  };

  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && code[i] !== '\n') blankAll(code[i++]);
      continue;
    }
    if (c === '/' && next === '*') {
      blankAll(code[i++]);
      blankAll(code[i++]);
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) blankAll(code[i++]);
      if (i < n) {
        blankAll(code[i++]);
        blankAll(code[i++]);
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      keep(code[i++]);
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\' && i + 1 < n) {
          blankString(code[i++]);
          blankString(code[i++]);
          continue;
        }
        if (code[i] === '\n' && quote !== '`') break; // unterminated: stop at the line end
        blankString(code[i++]);
      }
      if (i < n && code[i] === quote) keep(code[i++]);
      continue;
    }
    keep(code[i++]);
  }
  return { noComments: noComments.join(''), blanked: blanked.join('') };
}

interface ImportRef {
  specifier: string;
  kind: 'static' | 'dynamic';
}

/** Lists module specifiers from import/export-from, side-effect imports, `import()` and `require()`. */
function findImports(code: string): ImportRef[] {
  const { noComments, blanked } = scanSource(code);
  const patterns: Array<[RegExp, ImportRef['kind']]> = [
    [/(?<![.\w$])(?:import|export)\s+(?!\()[^;'"`]*?\bfrom\s*(['"])([^'"\n]*)\1/dg, 'static'],
    [/(?<![.\w$])import\s*(['"])([^'"\n]*)\1/dg, 'static'],
    [/(?<![.\w$])import\s*\(\s*(['"`])([^'"`\n]*)\1\s*[,)]/dg, 'dynamic'],
    [/(?<![.\w$])require\s*\(\s*(['"`])([^'"`\n]*)\1\s*\)/dg, 'static'],
  ];
  const refs: Array<ImportRef & { at: number }> = [];
  for (const [pattern, kind] of patterns) {
    for (const m of blanked.matchAll(pattern)) {
      const span = m.indices?.[2];
      if (!span) continue;
      const [start, end] = span;
      refs.push({ specifier: noComments.slice(start, end), kind, at: start });
    }
  }
  return refs.sort((a, b) => a.at - b.at).map(({ specifier, kind }) => ({ specifier, kind }));
}

/** Lists DOM-only globals used outside comments and string literals. */
function findDomGlobals(code: string): string[] {
  return [...scanSource(code).blanked.matchAll(DOM_GLOBAL_PATTERN)].map((m) => m[1]);
}

function isToneSpecifier(spec: string): boolean {
  return spec === 'tone' || spec.startsWith('tone/');
}

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(entry)) files.push(full);
  }
  return files;
}

/** True when a specifier used in `file` resolves inside src/domain. */
function resolvesInsideDomain(file: string, spec: string): boolean {
  let target: string;
  if (spec.startsWith('./') || spec.startsWith('../')) target = resolve(dirname(file), spec);
  else if (spec.startsWith('@/')) target = resolve(SRC, spec.slice(2));
  else return false;
  return target === DOMAIN || target.startsWith(DOMAIN + sep);
}

const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

// ---------------------------------------------------------------------------
// Scanner self-checks, so the audits below cannot pass vacuously
// ---------------------------------------------------------------------------

describe('audit scanners', () => {
  it('finds static, side-effect, re-export, dynamic and require imports', () => {
    const code = [
      "import * as Tone from 'tone';",
      'import {',
      '  a,',
      '  b,',
      "} from './multi';",
      "import type { X } from '../types';",
      "import './side-effect.css';",
      "export { c } from './reexport';",
      "export * from './all';",
      "const m = await import('./lazy');",
      "const r = require('cjs');",
    ].join('\n');
    expect(findImports(code)).toEqual([
      { specifier: 'tone', kind: 'static' },
      { specifier: './multi', kind: 'static' },
      { specifier: '../types', kind: 'static' },
      { specifier: './side-effect.css', kind: 'static' },
      { specifier: './reexport', kind: 'static' },
      { specifier: './all', kind: 'static' },
      { specifier: './lazy', kind: 'dynamic' },
      { specifier: 'cjs', kind: 'static' },
    ]);
  });

  it('treats import("tone") as dynamic and ignores imports inside comments and strings', () => {
    const code = [
      "// import * as Tone from 'tone';",
      "/* import { Synth } from 'tone'; */",
      "const note = \"import x from 'tone'\";",
      "const Tone = await import('tone');",
    ].join('\n');
    expect(findImports(code)).toEqual([{ specifier: 'tone', kind: 'dynamic' }]);
  });

  it('finds DOM globals in code but not in comments, strings or property names', () => {
    expect(findDomGlobals('const w = window.innerWidth;')).toEqual(['window']);
    expect(findDomGlobals('document.title = "x"; localStorage.getItem("k");')).toEqual([
      'document',
      'localStorage',
    ]);
    expect(
      findDomGlobals(
        [
          '// window is not used here',
          '/** uses the document model */',
          "const s = 'window document';",
          'const t = `navigator`;',
          'const o = state.window + state.documentCount;',
          'const windowSize = 3;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('recognises physics engine package names and leaves the stack alone', () => {
    for (const name of [
      'cannon-es',
      '@react-three/cannon',
      '@react-three/rapier',
      '@dimforge/rapier3d-compat',
      'ammo.js',
      'oimophysics',
      'matter-js',
      'planck-js',
      'p2-es',
      '@box2d/core',
      'jolt-physics',
      'enable3d',
    ]) {
      expect(isPhysicsPackage(name), name).toBe(true);
    }
    for (const name of [...RUNTIME_ALLOW, '@radix-ui/react-slider', 'vitest', 'fast-check']) {
      expect(isPhysicsPackage(name), name).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// package.json audits (Requirements 1.6, 1.8)
// ---------------------------------------------------------------------------

describe('package.json dependencies', () => {
  it('lists only allow-listed runtime dependencies', () => {
    const disallowed = runtimeDeps.filter((name) => !isAllowedRuntime(name));
    expect(disallowed).toEqual([]);
  });

  it('keeps TypeScript, Vite and Tailwind CSS out of runtime dependencies', () => {
    expect(runtimeDeps.filter(isBuildTooling)).toEqual([]);
  });

  it('lists TypeScript, Vite and Tailwind CSS as development dependencies', () => {
    expect(devDeps).toEqual(expect.arrayContaining(['typescript', 'vite', 'tailwindcss']));
  });

  it('declares no physics engine in any dependency section', () => {
    expect(allDeclared.filter(isPhysicsPackage)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Source audits (Requirements 1.7, 1.8, design layering rule 1)
// ---------------------------------------------------------------------------

describe('source imports', () => {
  const srcFiles = listSourceFiles(SRC);

  it('finds source files to audit', () => {
    expect(srcFiles.length).toBeGreaterThan(0);
  });

  it('loads tone only through a dynamic import()', () => {
    const offenders = srcFiles.flatMap((file) =>
      findImports(readFileSync(file, 'utf8'))
        .filter((ref) => ref.kind === 'static' && isToneSpecifier(ref.specifier))
        .map((ref) => `${rel(file)}: ${ref.specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('imports no physics engine anywhere in src/', () => {
    const offenders = srcFiles.flatMap((file) =>
      findImports(readFileSync(file, 'utf8'))
        .filter((ref) => isPhysicsPackage(ref.specifier) || /\/physics\//i.test(ref.specifier))
        .map((ref) => `${rel(file)}: ${ref.specifier}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('domain core isolation', () => {
  const domainFiles = listSourceFiles(DOMAIN);

  it('has domain files to audit', () => {
    expect(domainFiles.length).toBeGreaterThan(0);
  });

  it('imports only modules inside src/domain', () => {
    const offenders = domainFiles.flatMap((file) =>
      findImports(readFileSync(file, 'utf8'))
        .filter((ref) => !resolvesInsideDomain(file, ref.specifier))
        .map((ref) => `${rel(file)}: ${ref.specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('never names React, Three.js, Zustand, drei, react-spring, howler or tone', () => {
    const offenders = domainFiles.flatMap((file) =>
      findImports(readFileSync(file, 'utf8'))
        .filter((ref) => DOMAIN_FORBIDDEN.test(ref.specifier))
        .map((ref) => `${rel(file)}: ${ref.specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('uses no DOM-only globals', () => {
    const offenders = domainFiles.flatMap((file) =>
      findDomGlobals(readFileSync(file, 'utf8')).map((name) => `${rel(file)}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });
});
