// Enforces the asset budgets in requirement.md Section 8 and Section 7.3.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const MB = 1024 * 1024;
const root = 'public/assets';
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function jpegSize(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

function imageSize(path) {
  const buffer = readFileSync(path);
  if (path.endsWith('.png')) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (/\.jpe?g$/.test(path)) return jpegSize(buffer);
  return null;
}

const files = walk(root).filter((path) => !path.endsWith('.gitkeep'));
const credits = readFileSync('CREDITS.md', 'utf8');
let total = 0;

for (const file of files) {
  const path = relative('.', file).split(sep).join('/');
  const { size } = statSync(file);
  total += size;

  if (path.includes('/models/')) {
    if (!path.endsWith('.glb')) errors.push(`${path}: models must be .glb`);
    if (size > MB) errors.push(`${path}: model exceeds 1 MB`);
  }
  if (path.includes('/audio/')) {
    if (!/\.(mp3|ogg)$/.test(path)) errors.push(`${path}: audio must be .mp3 or .ogg`);
  }
  if (path.includes('/audio/music/') && size > 5 * MB) {
    errors.push(`${path}: music exceeds 5 MB`);
  }
  if (path.includes('/textures/')) {
    const dimensions = imageSize(file);
    if (!dimensions) errors.push(`${path}: cannot read texture size`);
    else if (dimensions.width > 1024 || dimensions.height > 1024) {
      errors.push(`${path}: texture exceeds 1024 x 1024`);
    }
  }
  if (!credits.includes(path)) errors.push(`${path}: missing from CREDITS.md`);
}

if (total >= 20 * MB) errors.push(`Total assets ${(total / MB).toFixed(1)} MB reach the 20 MB limit`);

console.log(`Checked ${files.length} files, ${(total / MB).toFixed(2)} MB in total.`);
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log('Asset budgets and credits are fine.');
