import type { Point, Quad, Rect } from '../core/session/model'
import { distToSegment, pointInQuad } from '../core/geometry/hit'
import { quadOutline } from '../core/geometry/quads'

/** Shared geometry of annotations made from text quads (highlight, underline, strike-out). */

/** Union of the quads; zero for none. */
export function quadsBounds(quads: Quad[]): Rect {
  if (quads.length === 0) return [0, 0, 0, 0]
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const q of quads) {
    for (let i = 0; i < 8; i += 2) {
      x1 = Math.min(x1, q[i])
      x2 = Math.max(x2, q[i])
      y1 = Math.min(y1, q[i + 1])
      y2 = Math.max(y2, q[i + 1])
    }
  }
  return [x1, y1, x2, y2]
}

function nearQuad(p: Point, q: Quad, tolerancePt: number): boolean {
  if (pointInQuad(p, q)) return true
  const o = quadOutline(q)
  return o.some((a, i) => distToSegment(p, a, o[(i + 1) % 4]) <= tolerancePt)
}

/** Whether `p` lies in or within `tolerancePt` of one of the quads. */
export const nearQuads = (quads: Quad[], p: Point, tolerancePt: number): boolean =>
  quads.some((q) => nearQuad(p, q, tolerancePt))

export const translateQuads = (quads: Quad[], dx: number, dy: number): Quad[] =>
  quads.map((q) => q.map((v, i) => v + (i % 2 === 0 ? dx : dy)) as Quad)
