import type { AnnotationKind } from '../../core/registry/annotationKinds'
import type { HighlightAnnotation, Point, Quad } from '../../core/session/model'
import { distToSegment, pointInQuad } from '../../core/geometry/hit'
import { quadOutline } from '../../core/geometry/quads'
import Render from './Render.svelte'

function nearQuad(p: Point, q: Quad, tolerancePt: number): boolean {
  if (pointInQuad(p, q)) return true
  const o = quadOutline(q)
  return o.some((a, i) => distToSegment(p, a, o[(i + 1) % 4]) <= tolerancePt)
}

export const highlightKind: AnnotationKind<HighlightAnnotation> = {
  kind: 'highlight',
  Render,
  bounds(a) {
    if (a.quads.length === 0) return [0, 0, 0, 0]
    const xs = a.quads.flatMap((q) => [q[0], q[2], q[4], q[6]])
    const ys = a.quads.flatMap((q) => [q[1], q[3], q[5], q[7]])
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  },
  hitTest: (a, p, tolerancePt) => a.quads.some((q) => nearQuad(p, q, tolerancePt)),
  translate: (a, dx, dy) => ({
    ...a,
    quads: a.quads.map((q) => q.map((v, i) => v + (i % 2 === 0 ? dx : dy)) as Quad),
  }),
}
