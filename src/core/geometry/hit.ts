import type { Annotation, Point, Quad } from '../session/model'
import { annotationKinds } from '../registry/annotationKinds'

/** Distance from `p` to the segment a-b (to the endpoint when the projection falls outside). */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Whether `p` lies inside the quad (PDF QuadPoints order TL, TR, BL, BR; boundary counts as inside). */
export function pointInQuad(p: Point, q: Quad): boolean {
  // Outline order: TL, TR, BR, BL.
  const poly: Point[] = [
    [q[0], q[1]],
    [q[2], q[3]],
    [q[6], q[7]],
    [q[4], q[5]],
  ]
  for (let i = 0; i < 4; i++) {
    if (distToSegment(p, poly[i], poly[(i + 1) % 4]) < 1e-9) return true
  }
  let inside = false
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Annotations of `list` hit at `p`, topmost first (reverse z-order). `accept`
 * limits which annotations are tested (e.g. by kind).
 */
export function hitAnnotations(
  list: Annotation[],
  p: Point,
  tolerancePt: number,
  accept?: (a: Annotation) => boolean,
): Annotation[] {
  const out: Annotation[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]
    if (accept && !accept(a)) continue
    if (annotationKinds.get(a.kind).hitTest(a, p, tolerancePt)) out.push(a)
  }
  return out
}
