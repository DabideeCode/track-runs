// CREDITS.md audit (Requirements 34.2, 34.3, 34.10, 42.3, 42.5).
// Focused on what the broader audits do not check: each asset file has exactly
// one row, CC-BY rows carry author, URL and CC-BY, and the Fallbacks section
// names every item, synthesised sound event and the music the code makes
// instead of loading a file. Folder rules and size budgets live in
// assets.test.ts; the README and the Fallbacks heading live in docs.test.ts.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../../../src/domain/catalogue';
import { SOUND_BANK } from '../../../src/audio/soundBank';
import { MUSIC_FILES } from '../../../src/audio/music';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const ASSETS = join(ROOT, 'public', 'assets');
const credits = readFileSync(join(ROOT, 'CREDITS.md'), 'utf8');

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const assetPaths = listFiles(ASSETS)
  .filter((file) => !file.endsWith('.gitkeep'))
  .map((file) => relative(ROOT, file).split(sep).join('/'));

/** Text of a `## Heading` section, up to the next level-2 heading. */
function section(heading: string): string {
  const start = credits.indexOf(`\n## ${heading}\n`);
  if (start < 0) return '';
  const rest = credits.slice(start + heading.length + 4);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Data rows (cells trimmed) of every markdown table in a block of text. */
function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)));
}

const assetRows = tableRows(section('Assets'));
const [assetHeader, ...assetData] = assetRows;
const fallbacks = section('Fallbacks');

describe('CREDITS.md assets', () => {
  it('uses the five required columns', () => {
    expect(assetHeader).toEqual(['Path', 'Title', 'Author', 'Source URL', 'Licence']);
  });

  it('has exactly one complete row per asset file and no rows for missing files', () => {
    const rowPaths = assetData.map((cells) => cells[0]!.replace(/`/g, ''));
    for (const path of assetPaths) {
      const rows = assetData.filter((cells) => cells[0]!.replace(/`/g, '') === path);
      expect(rows, path).toHaveLength(1);
      expect(rows[0]!.length, path).toBe(5);
      for (const cell of rows[0]!) expect(cell, path).not.toBe('');
      expect(rows[0]![3], path).toMatch(/^https?:\/\//);
    }
    expect([...rowPaths].sort()).toEqual([...assetPaths].sort());
  });

  it('credits every CC-BY row with author, source URL and a CC-BY licence', () => {
    for (const [path, , author, url, licence] of assetData) {
      expect(licence, path).toMatch(/^(CC0|CC-BY)\b/);
      if (licence!.startsWith('CC-BY')) {
        expect(author, path).not.toBe('');
        expect(url, path).toMatch(/^https?:\/\//);
      }
    }
  });
});

describe('CREDITS.md fallbacks', () => {
  it('names every catalogue item built from primitives with procedural wood materials', () => {
    const modelFiles = assetPaths.filter((path) => path.startsWith('public/assets/models/'));
    expect(modelFiles).toEqual([]);
    for (const item of CATALOGUE) {
      const line = fallbacks.split('\n').find((l) => l.includes(item.label));
      expect(line, item.label).toContain('Three.js primitives with procedural wood materials');
    }
    expect(fallbacks).toMatch(/locomotive.*Three\.js primitives with procedural wood materials/);
    expect(fallbacks).toMatch(/carriages.*Three\.js primitives with procedural wood materials/);
  });

  it('names every synthesised sound event with Web Audio API synthesis', () => {
    const synthEvents = Object.entries(SOUND_BANK)
      .filter(([, source]) => source.kind === 'synth')
      .map(([event]) => event);
    expect(synthEvents.length).toBeGreaterThan(0);
    for (const event of synthEvents) {
      const line = fallbacks.split('\n').find((l) => l.includes(`Sound event \`${event}\``));
      expect(line, event).toContain('Web Audio API synthesis');
    }
  });

  it('notes the tone music fallback while no music file is used', () => {
    const musicFiles = assetPaths.filter((path) => path.startsWith('public/assets/audio/music/'));
    if (MUSIC_FILES === null || musicFiles.length === 0) {
      expect(fallbacks).toMatch(/Background music.*procedural music with `tone`/i);
    }
  });
});
