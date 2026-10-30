import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function createCanvas(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, context: canvas.getContext('2d')! };
}

function toTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function drawGrain(context: CanvasRenderingContext2D, size: number, x: number, width: number, seed: number) {
  for (let line = 0; line < width / 2; line += 1) {
    const lineX = x + Math.random() * width;
    const shade = Math.random() > 0.5 ? 'rgba(92, 58, 28,' : 'rgba(255, 234, 200,';
    context.strokeStyle = `${shade}${0.05 + Math.random() * 0.14})`;
    context.lineWidth = 0.5 + Math.random() * 1.6;
    context.beginPath();
    const wobble = 1 + Math.random() * 2.5;
    for (let y = 0; y <= size; y += 16) {
      const px = lineX + Math.sin(y * 0.012 + seed + lineX * 0.03) * wobble;
      if (y === 0) context.moveTo(px, y);
      else context.lineTo(px, y);
    }
    context.stroke();
  }
}

// A neutral grain, tinted by each part's vertex colour.
export function createGrainTexture() {
  const size = 512;
  const { canvas, context } = createCanvas(size);
  context.fillStyle = '#f0e6d6';
  context.fillRect(0, 0, size, size);
  drawGrain(context, size, 0, size, 1.3);
  return toTexture(canvas);
}

export function createFloorboardTexture() {
  const size = 1024;
  const boards = 6;
  const { canvas, context } = createCanvas(size);
  const boardWidth = size / boards;
  for (let board = 0; board < boards; board += 1) {
    const light = 56 + Math.random() * 7;
    context.fillStyle = `hsl(${28 + Math.random() * 6}, ${44 + Math.random() * 8}%, ${light}%)`;
    context.fillRect(board * boardWidth, 0, boardWidth, size);
    drawGrain(context, size, board * boardWidth, boardWidth, board * 2.1);
    context.fillStyle = 'rgba(70, 44, 24, 0.5)';
    context.fillRect(board * boardWidth - 1.5, 0, 3, size);
    const seam = Math.random() * size;
    context.fillRect(board * boardWidth, seam, boardWidth, 2.5);
  }
  return toTexture(canvas);
}

export function createTabletopTexture() {
  const size = 1024;
  const { canvas, context } = createCanvas(size);
  context.fillStyle = '#e3c8a0';
  context.fillRect(0, 0, size, size);
  drawGrain(context, size, 0, size, 4.2);
  return toTexture(canvas);
}

export function createRugTexture() {
  const size = 512;
  const { canvas, context } = createCanvas(size);
  context.fillStyle = '#b9c7c2';
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i += 1) {
    context.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,240' : '70,90,90'},${Math.random() * 0.1})`;
    context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  return toTexture(canvas);
}

export function createBlobTexture() {
  const size = 128;
  const { canvas, context } = createCanvas(size);
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(58, 40, 24, 0.5)');
  gradient.addColorStop(0.55, 'rgba(58, 40, 24, 0.32)');
  gradient.addColorStop(1, 'rgba(58, 40, 24, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}
