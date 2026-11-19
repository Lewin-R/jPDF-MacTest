import type { Point, Quad } from '../session/model'

/** A client-space rectangle (e.g. from Range.getClientRects()). */
export interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Same-line fragments at most this far apart horizontally are merged. */
const MAX_GAP_PX = 4

const centre = (r: ScreenRect) => (r.top + r.bottom) / 2

function joinable(a: ScreenRect, b: ScreenRect, tol: number): boolean {
  return (
    Math.abs(centre(a) - centre(b)) <= tol &&
    b.left - a.right <= MAX_GAP_PX &&
    a.left - b.right <= MAX_GAP_PX
  )
}

function union(a: ScreenRect, b: ScreenRect): ScreenRect {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }
}

/**
 * Selection rects → highlight quads: drops rects under 1px wide or high, merges
 * rects on one line (vertical centres within `lineTolerancePx`, horizontal gap
 * ≤ 4px) into one rect per line fragment, and maps the corners to PDF space in
 * QuadPoints order TL, TR, BL, BR. Quads come out top to bottom, left to right.
 */
export function rectsToQuads(
  rects: ScreenRect[],
  toPdf: (x: number, y: number) => Point,
  lineTolerancePx = 3,
): Quad[] {
  const merged: ScreenRect[] = []
  const sorted = rects
    .filter((r) => r.right - r.left >= 1 && r.bottom - r.top >= 1)
    .sort((a, b) => a.left - b.left)
  for (const r of sorted) {
    const i = merged.findIndex((m) => joinable(m, r, lineTolerancePx))
    if (i >= 0) merged[i] = union(merged[i], r)
    else merged.push({ ...r })
  }
  // A merge can widen a fragment until it reaches another one.
  for (let changed = true; changed; ) {
    changed = false
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (joinable(merged[i], merged[j], lineTolerancePx)) {
          merged[i] = union(merged[i], merged[j])
          merged.splice(j, 1)
          changed = true
          break outer
        }
      }
    }
  }
  merged.sort((a, b) => a.top - b.top || a.left - b.left)
  return merged.map((r) => {
    const tl = toPdf(r.left, r.top)
    const tr = toPdf(r.right, r.top)
    const bl = toPdf(r.left, r.bottom)
    const br = toPdf(r.right, r.bottom)
    return [tl[0], tl[1], tr[0], tr[1], bl[0], bl[1], br[0], br[1]]
  })
}

/** Quad outline in drawing order TL, TR, BR, BL (QuadPoints order is TL, TR, BL, BR). */
export function quadOutline(q: Quad): Point[] {
  return [
    [q[0], q[1]],
    [q[2], q[3]],
    [q[6], q[7]],
    [q[4], q[5]],
  ]
}
