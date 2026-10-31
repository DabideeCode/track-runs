// Checks the size limits in requirement.md Sections 7.3 and 8 against a production build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MB = 1024 * 1024;
const LIMITS = {
  assets: 20 * MB,
  model: 1 * MB,
  music: 5 * MB,
  startup: 4 * MB,
  texture: 1024,
};

function walk(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function jpegSize(path) {
  const data = readFileSync(path);
  let offset = 2;
  while (offset < data.length) {
    const marker = data[offset + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  throw new Error(`No size found in ${path}`);
}

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};
const mb = (bytes) => `${(bytes / MB).toFixed(2)} MB`;

const assets = walk('public/assets').filter((path) => !path.endsWith('.gitkeep'));
const size = (path) => statSync(path).size;
const total = assets.reduce((sum, path) => sum + size(path), 0);
check(total < LIMITS.assets, `total assets ${mb(total)} under 20 MB`);

for (const path of assets) {
  if (path.endsWith('.glb')) check(size(path) <= LIMITS.model, `${path} is 1 MB or less`);
  if (path.includes('music')) check(size(path) <= LIMITS.music, `${path} ${mb(size(path))} is 5 MB or less`);
  if (path.endsWith('.jpg')) {
    const { width, height } = jpegSize(path);
    check(width <= LIMITS.texture && height <= LIMITS.texture, `${path} is ${width} × ${height}`);
  }
}

const built = walk('dist/assets');
const entry = built.find((path) => /[\\/]index-.*\.js$/.test(path));
const entryCode = readFileSync(entry, 'utf8');
check(!entryCode.includes('WebGLRenderer'), 'the entry chunk has no Three.js');
check(!built.some((path) => readFileSync(path, 'utf8').includes('Tone.js')), 'tone is not bundled');
check(!built.some((path) => path.endsWith('.wasm')), 'no heavy drei extras are bundled');

const textures = assets.filter((path) => path.endsWith('.jpg'));
const code = built.filter((path) => /\.(js|css)$/.test(path));
const startup = [...code, ...textures].reduce((sum, path) => sum + size(path), 0);
check(startup <= LIMITS.startup, `startup download ${mb(startup)} within 4 MB (uncompressed code)`);

if (failures.length > 0) process.exit(1);
