type Capture = () => string | null;

let capture: Capture | null = null;

/** The scene registers this, so saving never imports 3D code into the menu's chunk. */
export function setThumbnailCapture(next: Capture | null): void {
  capture = next;
}

export function captureThumbnail(): string | null {
  try {
    return capture?.() ?? null;
  } catch (error) {
    console.warn('Could not capture a thumbnail:', error);
    return null;
  }
}
