import type { PageViewport } from 'pdfjs-dist'
import type { Annotation, Point, Rect } from '../../core/session/model'

/**
 * Resize handles of a selection box, named by compass direction on screen.
 * Handle geometry works in screen (viewport) space: rects are
 * [left, top, right, bottom] with y growing downwards, so 'n' is the top edge
 * whatever the page rotation.
 */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const ALL_HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const WIDTH_HANDLES: readonly Handle[] = ['e', 'w']
const NO_HANDLES: readonly Handle[] = []

/** Handles a selected annotation offers: text boxes resize in width, ink and shapes in any direction, highlights not at all. */
export function handlesFor(a: Annotation): readonly Handle[] {
  switch (a.kind) {
    case 'freetext':
      return WIDTH_HANDLES
    case 'ink':
    case 'shape':
      return ALL_HANDLES
    default:
      return NO_HANDLES
  }
}

export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

/** Centre of handle `h` on the y-down rect `r`. */
export function handlePoint(r: Rect, h: Handle): Point {
  const [x1, y1, x2, y2] = r
  const x = h.includes('w') ? x1 : h.includes('e') ? x2 : (x1 + x2) / 2
  const y = h.includes('n') ? y1 : h.includes('s') ? y2 : (y1 + y2) / 2
  return [x, y]
}

/**
 * `r` (y-down) with the edges of handle `h` moved by dx/dy; an edge never
 * moves closer than `minSize` to the opposite edge (the opposite edge stays put).
 */
export function resizeRect(r: Rect, h: Handle, dx: number, dy: number, minSize: number): Rect {
  let [x1, y1, x2, y2] = r
  if (h.includes('w')) x1 = Math.min(x1 + dx, x2 - minSize)
  if (h.includes('e')) x2 = Math.max(x2 + dx, x1 + minSize)
  if (h.includes('n')) y1 = Math.min(y1 + dy, y2 - minSize)
  if (h.includes('s')) y2 = Math.max(y2 + dy, y1 + minSize)
  return [x1, y1, x2, y2]
}

/**
 * The handle of `r` (y-down) whose centre is within `tolerancePt` of `p` on
 * both axes (the nearest when several are), among `allowed`; null if none.
 * Units are those of `r` and `p`.
 */
export function handleAt(
  r: Rect,
  p: Point,
  tolerancePt: number,
  allowed: readonly Handle[] = ALL_HANDLES,
): Handle | null {
  let best: Handle | null = null
  let bestDist = Infinity
  for (const h of allowed) {
    const [hx, hy] = handlePoint(r, h)
    const ax = Math.abs(p[0] - hx)
    const ay = Math.abs(p[1] - hy)
    if (ax > tolerancePt || ay > tolerancePt) continue
    const d = Math.hypot(ax, ay)
    if (d < bestDist) {
      best = h
      bestDist = d
    }
  }
  return best
}

/** Screen (viewport) rect, y-down, of the PDF rect `r`: axis-aligned for any page rotation. */
export function toScreenRect(r: Rect, vp: PageViewport): Rect {
  const [ax, ay] = vp.convertToViewportPoint(r[0], r[1])
  const [bx, by] = vp.convertToViewportPoint(r[2], r[3])
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}

/** PDF rect (x1 < x2, y1 < y2) of the screen rect `r`. */
export function toPdfRect(r: Rect, vp: PageViewport): Rect {
  const [ax, ay] = vp.convertToPdfPoint(r[0], r[1])
  const [bx, by] = vp.convertToPdfPoint(r[2], r[3])
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}

/** Whether `p` lies inside the rect `r` (any y direction, boundary included). */
export function inRect(r: Rect, p: Point): boolean {
  return p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3]
}
