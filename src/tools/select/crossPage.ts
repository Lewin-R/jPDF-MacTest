import type { PageViewport } from 'pdfjs-dist'
import { annotationKinds } from '../../core/registry/annotationKinds'
import type { PageFrame } from '../../core/registry/tools'
import type { Annotation, Point } from '../../core/session/model'
import { toScreenRect } from './handles'

export type { PageFrame }

/**
 * Drag state: the element as placed on `base.page` when the pointer was at
 * `anchor`, in that page's own px (so the drag survives scrolling).
 */
export interface CrossPageDrag {
  base: Annotation
  anchor: Point
}

/** `d` limited so the shift does not push an edge further off the page (it never forces a jump onto it). */
export function clampShift(d: number, lo: number, hi: number): number {
  return Math.min(Math.max(d, Math.min(lo, 0)), Math.max(hi, 0))
}

/** `a` moved onto page `page` so its screen box's top-left is `[left, top]` (page px). */
function placeOn(a: Annotation, page: number, vp: PageViewport, left: number, top: number): Annotation {
  const kind = annotationKinds.get(a.kind)
  const r = toScreenRect(kind.bounds(a), vp)
  const [fx, fy] = vp.convertToPdfPoint(r[0], r[1])
  const [tx, ty] = vp.convertToPdfPoint(left, top)
  return { ...kind.translate(a, tx - fx, ty - fy), page }
}

/**
 * Where a dragged element goes with the pointer at `client`. It follows the
 * pointer (horizontally kept on the page); vertically the page clips what
 * sticks out until more than half of its height is past the top or bottom
 * edge, then it snaps flush onto the facing edge of the previous or next page
 * (or lands where the pointer puts it there, after a fast move) and the drag
 * is re-based there. Snaps chain; without a mounted neighbour at most half of
 * it goes out.
 */
export function dragAcrossPages(
  drag: CrossPageDrag,
  client: Point,
  frameOf: (page: number) => PageFrame | null,
): { annotation: Annotation; drag: CrossPageDrag } {
  const start = frameOf(drag.base.page)
  if (!start) return { annotation: drag.base, drag }
  const kind = annotationKinds.get(drag.base.kind)
  const box0 = toScreenRect(kind.bounds(drag.base), start.vp)
  const dx = clampShift(client[0] - start.origin[0] - drag.anchor[0], -box0[0], start.vp.width - box0[2])
  /** Where the pointer wants the box's top, in client px (the box's height can change between pages). */
  let naturalTop = client[1] - drag.anchor[1] + box0[1]
  let page = drag.base.page
  let frame = start
  let left = box0[0] + dx
  let snapped = false
  // Each pass moves one page, always in the same direction (a snap down never
  // asks for the page above and vice versa), until a page has no neighbour.
  for (;;) {
    const box = toScreenRect(kind.bounds(drag.base), frame.vp)
    const h = box[3] - box[1]
    const H = frame.vp.height
    const top = naturalTop - frame.origin[1]
    const next = top + h - H > h / 2 ? page + 1 : -top > h / 2 ? page - 1 : null
    const to = next === null || next < 0 ? null : frameOf(next)
    if (next === null || !to) {
      const a = placeOn(drag.base, page, frame.vp, left, Math.min(Math.max(top, -h / 2), H - h / 2))
      const anchor: Point = [client[0] - frame.origin[0], client[1] - frame.origin[1]]
      return { annotation: a, drag: snapped ? { base: a, anchor } : drag }
    }
    const toBox = toScreenRect(kind.bounds(drag.base), to.vp)
    const th = toBox[3] - toBox[1]
    const relTop = naturalTop - to.origin[1]
    // Snap flush onto the facing edge unless the pointer already put it further in.
    const t = next > page ? Math.max(relTop, 0) : Math.min(relTop, to.vp.height - th)
    left = Math.max(0, Math.min(left + frame.origin[0] - to.origin[0], to.vp.width - (toBox[2] - toBox[0])))
    naturalTop = to.origin[1] + t
    page = next
    frame = to
    snapped = true
  }
}
