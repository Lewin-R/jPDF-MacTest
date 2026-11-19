import type { AnnotationKind } from '../../core/registry/annotationKinds'
import type { ImageAnnotation } from '../../core/session/model'
import Render from './Render.svelte'

/** Pasted images: hit anywhere in their rect, moved and resized (never erased). */
export const imageKind: AnnotationKind<ImageAnnotation> = {
  kind: 'image',
  Render,
  bounds: (a) => a.rect,
  hitTest(a, [x, y], tolerancePt) {
    const r = a.rect
    return x >= r[0] - tolerancePt && x <= r[2] + tolerancePt && y >= r[1] - tolerancePt && y <= r[3] + tolerancePt
  },
  translate: (a, dx, dy) => ({
    ...a,
    rect: [a.rect[0] + dx, a.rect[1] + dy, a.rect[2] + dx, a.rect[3] + dy],
  }),
  scale(a, from, to) {
    const sx = from[2] === from[0] ? 1 : (to[2] - to[0]) / (from[2] - from[0])
    const sy = from[3] === from[1] ? 1 : (to[3] - to[1]) / (from[3] - from[1])
    const x = (v: number) => to[0] + (v - from[0]) * sx
    const y = (v: number) => to[1] + (v - from[1]) * sy
    const [x1, x2] = [x(a.rect[0]), x(a.rect[2])]
    const [y1, y2] = [y(a.rect[1]), y(a.rect[3])]
    return { ...a, rect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] }
  },
}
