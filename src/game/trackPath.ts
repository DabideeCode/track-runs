import { connectorsOf, opposite, rotateSide, sideDelta, tileCenter } from './grid'
import { connectedNeighbour, trackOccupancy } from './rules'
import type { Piece, Side, StartFacing } from './types'

/** Distance from the buffer's connector edge to the face of its stop block. */
export const BUFFER_RUN = 0.8

export interface Point {
  x: number
  z: number
}

export interface Segment {
  pieceId: string
  length: number
  /** Point on the centreline at t in 0..1, in the direction of travel. */
  at(t: number): Point
}

export interface Chain {
  segments: Segment[]
  /** Start of each segment along the chain. */
  offsets: number[]
  length: number
  closed: boolean
  /** Where the station's centre sits along the chain. */
  stationS: number
}

const edgeMidpoint = (center: Point, side: Side): Point => ({
  x: center.x + sideDelta[side][0] / 2,
  z: center.z + sideDelta[side][1] / 2,
})

const lineSegment = (pieceId: string, from: Point, to: Point): Segment => ({
  pieceId,
  length: Math.hypot(to.x - from.x, to.z - from.z),
  at: (t) => ({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }),
})

const arcSegment = (pieceId: string, from: Point, to: Point, center: Point): Segment => {
  const radius = Math.hypot(from.x - center.x, from.z - center.z)
  const start = Math.atan2(from.z - center.z, from.x - center.x)
  const end = Math.atan2(to.z - center.z, to.x - center.x)
  const sweep = Math.atan2(Math.sin(end - start), Math.cos(end - start))
  return {
    pieceId,
    length: Math.abs(sweep) * radius,
    at: (t) => {
      const angle = start + sweep * t
      return { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius }
    },
  }
}

/** A piece's centreline, entered through `entry`. A buffer entered at its block side runs outward. */
export const piecePath = (piece: Piece, entry: Side): Segment => {
  const center = tileCenter(piece.gridX, piece.gridZ)
  const connectors = connectorsOf(piece)

  if (piece.type === 'buffer') {
    const connector = connectors[0]
    const edge = edgeMidpoint(center, connector)
    const [dx, dz] = sideDelta[connector]
    const face = { x: edge.x - dx * BUFFER_RUN, z: edge.z - dz * BUFFER_RUN }
    return entry === connector
      ? lineSegment(piece.id, edge, face)
      : lineSegment(piece.id, face, edge)
  }

  const exit = connectors.find((side) => side !== entry) ?? opposite(entry)
  const from = edgeMidpoint(center, entry)
  const to = edgeMidpoint(center, exit)
  if (piece.type !== 'curve') return lineSegment(piece.id, from, to)

  const [ax, az] = sideDelta[connectors[0]]
  const [bx, bz] = sideDelta[connectors[1]]
  return arcSegment(piece.id, from, to, {
    x: center.x + (ax + bx) / 2,
    z: center.z + (az + bz) / 2,
  })
}

/** The other connector of a track, undefined for a buffer. */
const otherSide = (piece: Piece, side: Side) => connectorsOf(piece).find((other) => other !== side)

/** Walks outward through connected tracks, stopping at a dead end or back at the start. */
const walk = (
  occupancy: ReturnType<typeof trackOccupancy>,
  start: Piece,
  exit: Side,
): { steps: { piece: Piece; entry: Side }[]; closed: boolean } => {
  const steps: { piece: Piece; entry: Side }[] = []
  let current = start
  let side: Side | undefined = exit
  while (side) {
    const next = connectedNeighbour(occupancy, current, side)
    if (!next) return { steps, closed: false }
    if (next.id === start.id) return { steps, closed: true }
    const entry = opposite(side)
    steps.push({ piece: next, entry })
    current = next
    side = otherSide(next, entry)
  }
  return { steps, closed: false }
}

/** The station's connected track as one simple path or loop, with +s the facing direction. */
export const buildChain = (
  pieces: Piece[],
  stationId: string,
  facing: StartFacing,
): Chain | null => {
  const station = pieces.find((piece) => piece.id === stationId)
  if (!station) return null
  const occupancy = trackOccupancy(pieces)
  const front = rotateSide(facing === 0 ? 'N' : 'S', station.rotation)
  const back = opposite(front)

  const ahead = walk(occupancy, station, front)
  const behind = ahead.closed ? { steps: [] } : walk(occupancy, station, back)

  const segments: Segment[] = [
    // Behind runs away from the station, so reverse it to travel toward the station.
    ...[...behind.steps].reverse().map(({ piece, entry }) => {
      const exit = piece.type === 'buffer' ? entry : otherSide(piece, entry)!
      return piecePath(piece, piece.type === 'buffer' ? opposite(exit) : exit)
    }),
    piecePath(station, back),
    ...ahead.steps.map(({ piece, entry }) => piecePath(piece, entry)),
  ]

  const offsets: number[] = []
  let length = 0
  for (const segment of segments) {
    offsets.push(length)
    length += segment.length
  }
  const stationIndex = behind.steps.length
  return {
    segments,
    offsets,
    length,
    closed: ahead.closed,
    stationS: offsets[stationIndex] + segments[stationIndex].length / 2,
  }
}

const locate = (chain: Chain, s: number) => {
  let low = 0
  let high = chain.segments.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (chain.offsets[mid] <= s) low = mid
    else high = mid - 1
  }
  return low
}

export const wrapS = (chain: Chain, s: number) =>
  chain.closed ? ((s % chain.length) + chain.length) % chain.length : s

export const pointAt = (chain: Chain, rawS: number): Point => {
  const s = wrapS(chain, rawS)
  if (s < 0 || s > chain.length) {
    // Past an open end: carry on along the end tangent.
    const atStart = s < 0
    const a = pointAt(chain, atStart ? 0 : chain.length - 0.01)
    const b = pointAt(chain, atStart ? 0.01 : chain.length)
    const over = atStart ? s : s - chain.length
    const anchor = atStart ? a : b
    return {
      x: anchor.x + ((b.x - a.x) / 0.01) * over,
      z: anchor.z + ((b.z - a.z) / 0.01) * over,
    }
  }
  const index = locate(chain, s)
  const segment = chain.segments[index]
  return segment.at(Math.min(1, (s - chain.offsets[index]) / segment.length))
}

export interface Pose extends Point {
  /** three.js rotation.y that points a -Z-facing model along +s. */
  yaw: number
}

/** Position at s, with heading taken from a chord so long vehicles sit naturally in curves. */
export const samplePath = (chain: Chain, s: number, wheelbase = 0.04): Pose => {
  const point = pointAt(chain, s)
  const front = pointAt(chain, s + wheelbase / 2)
  const rear = pointAt(chain, s - wheelbase / 2)
  return { ...point, yaw: Math.atan2(rear.x - front.x, rear.z - front.z) }
}

export const locateOnChain = (chain: Chain, rawS: number) => {
  const s = Math.min(chain.length, Math.max(0, wrapS(chain, rawS)))
  const index = locate(chain, s)
  const segment = chain.segments[index]
  return {
    pieceId: segment.pieceId,
    progress: Math.min(1, Math.max(0, (s - chain.offsets[index]) / segment.length)),
  }
}
