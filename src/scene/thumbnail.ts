// Thumbnail capture for the main menu (AC-1.7, D25). The scene registers a renderer callback.

let renderFrame: (() => HTMLCanvasElement) | null = null

export function registerThumbnail(fn: (() => HTMLCanvasElement) | null) {
  renderFrame = fn
}

/** Renders one frame and returns a small JPEG data URL, or undefined if no scene is mounted. */
export function captureThumbnail(width = 192, height = 108): string | undefined {
  if (!renderFrame) return undefined
  try {
    const src = renderFrame()
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const g = out.getContext('2d')
    if (!g) return undefined
    // Cover-crop the centre of the view.
    const scale = Math.max(width / src.width, height / src.height)
    const w = width / scale
    const h = height / scale
    g.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, width, height)
    return out.toDataURL('image/jpeg', 0.75)
  } catch {
    return undefined
  }
}
