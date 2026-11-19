import type { Annotation, HighlightAnnotation, InkAnnotation, Point, Quad, RGB } from '../session/model'
import { distToSegment } from './hit'
import { mergeLineRects, type ScreenRect } from './quads'

/**
 * Merge rules for overlapping highlights of one colour, so an area is never
 * darkened twice: text highlights whose quads overlap or touch, and marker
 * strokes whose painted bands overlap or touch, become one annotation.
 */

/** Quads closer than this (pt) count as touching. */
export const HIGHLIGHT_TOUCH_PT = 1
/** Quads whose line centres are at most this far apart (pt) are on the same line. */
export const HIGHLIGHT_LINE_TOLERANCE_PT = 2

const byte = (c: number) => Math.round(c * 255)
/** Same colour at 8-bit precision. */
export const sameColor = (a: RGB, b: RGB): boolean => a.every((c, i) => byte(c) === byte(b[i]))
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-3

type Box = [number, number, number, number]

function boxOf(points: number[]): Box {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    x1 = Math.min(x1, points[i])
    x2 = Math.max(x2, points[i])
    y1 = Math.min(y1, points[i + 1])
    y2 = Math.max(y2, points[i + 1])
  }
  return [x1, y1, x2, y2]
}

const boxesTouch = (a: Box, b: Box, tol: number) =>
  a[0] - tol <= b[2] && b[0] - tol <= a[2] && a[1] - tol <= b[3] && b[1] - tol <= a[3]

/**
 * A quad in its line frame: `along` is the PDF axis the text runs on, and
 * the frame coordinates are signed so that TL is the frame's (left, top) on
 * every page rotation. Null for quads that are not axis-aligned rectangles.
 */
interface Framed {
  key: string
  axis: 0 | 1
  su: number
  sv: number
  rect: ScreenRect
}

const EPS = 1e-3

function frame(q: Quad): Framed | null {
  const [tlx, tly, trx, try_, blx, bly, brx, bry] = q
  const axis: 0 | 1 = Math.abs(trx - tlx) >= Math.abs(try_ - tly) ? 0 : 1
  const tl = [tlx, tly]
  const tr = [trx, try_]
  const bl = [blx, bly]
  const br = [brx, bry]
  const cross = axis === 0 ? 1 : 0
  // Axis-aligned rectangle: TL-TR and BL-BR run along the axis, TL-BL and TR-BR across it.
  const aligned =
    Math.abs(tl[cross] - tr[cross]) <= EPS &&
    Math.abs(bl[cross] - br[cross]) <= EPS &&
    Math.abs(tl[axis] - bl[axis]) <= EPS &&
    Math.abs(tr[axis] - br[axis]) <= EPS
  if (!aligned) return null
  const su = tr[axis] >= tl[axis] ? 1 : -1
  const sv = bl[cross] >= tl[cross] ? 1 : -1
  const a = [tl[axis] * su, tr[axis] * su]
  const c = [tl[cross] * sv, bl[cross] * sv]
  return {
    key: `${axis}${su}${sv}`,
    axis,
    su,
    sv,
    rect: { left: Math.min(...a), right: Math.max(...a), top: Math.min(...c), bottom: Math.max(...c) },
  }
}

function unframe(f: Omit<Framed, 'rect' | 'key'>, r: ScreenRect): Quad {
  const point = (along: number, across: number): Point => {
    const a = along * f.su
    const c = across * f.sv
    return f.axis === 0 ? [a, c] : [c, a]
  }
  const tl = point(r.left, r.top)
  const tr = point(r.right, r.top)
  const bl = point(r.left, r.bottom)
  const br = point(r.right, r.bottom)
  return [tl[0], tl[1], tr[0], tr[1], bl[0], bl[1], br[0], br[1]]
}

/**
 * Merges quads that overlap or touch on the same line into one quad, with
 * the rectsToQuads rules in PDF space: line centres within
 * HIGHLIGHT_LINE_TOLERANCE_PT, gap ≤ HIGHLIGHT_TOUCH_PT. Only axis-aligned
 * quads of the same orientation merge (upright text on any page rotation);
 * other quads are kept unchanged after the merged ones.
 */
export function mergeHighlightQuads(quads: Quad[]): Quad[] {
  const groups = new Map<string, { f: Framed; rects: ScreenRect[] }>()
  const other: Quad[] = []
  for (const q of quads) {
    const f = frame(q)
    if (!f) {
      other.push(q)
      continue
    }
    const g = groups.get(f.key)
    if (g) g.rects.push(f.rect)
    else groups.set(f.key, { f, rects: [f.rect] })
  }
  const out: Quad[] = []
  for (const { f, rects } of groups.values()) {
    for (const r of mergeLineRects(rects, HIGHLIGHT_LINE_TOLERANCE_PT, HIGHLIGHT_TOUCH_PT)) out.push(unframe(f, r))
  }
  return [...out, ...other]
}

/**
 * Highlights among `pageAnnotations` (z-order) that `fresh` merges with:
 * same page, colour and opacity, and a quad whose bounding box overlaps or
 * touches (within HIGHLIGHT_TOUCH_PT) the bounding box of a quad of `fresh`.
 */
export function findMergeableHighlights(
  pageAnnotations: readonly Annotation[],
  fresh: HighlightAnnotation,
): HighlightAnnotation[] {
  const boxes = fresh.quads.map((q) => boxOf(q))
  return pageAnnotations.filter(
    (a): a is HighlightAnnotation =>
      a.kind === 'highlight' &&
      a.id !== fresh.id &&
      a.page === fresh.page &&
      sameColor(a.color, fresh.color) &&
      close(a.opacity, fresh.opacity) &&
      a.quads.some((q) => {
        const b = boxOf(q)
        return boxes.some((f) => boxesTouch(f, b, HIGHLIGHT_TOUCH_PT))
      }),
  )
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/** Distance between segments a-b and c-d (0 when they cross). */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b))
}

/** Segments of a stroke; a single point is a zero-length segment. */
function segments(s: Point[]): [Point, Point][] {
  if (s.length === 1) return [[s[0], s[0]]]
  const out: [Point, Point][] = []
  for (let i = 1; i < s.length; i++) out.push([s[i - 1], s[i]])
  return out
}

/** Whether some point of stroke `a` is within `dist` of stroke `b`. */
export function strokesWithin(a: Point[], b: Point[], dist: number): boolean {
  if (a.length === 0 || b.length === 0) return false
  if (!boxesTouch(boxOf(a.flat()), boxOf(b.flat()), dist)) return false
  const sb = segments(b)
  return segments(a).some(([p, q]) => sb.some(([r, s]) => segmentDistance(p, q, r, s) <= dist + 1e-9))
}

/**
 * Marker annotations among `pageAnnotations` (z-order) that the marker
 * stroke(s) of `fresh` merge with: same page, colour, opacity, width and
 * blend, and a stroke within `width` of a stroke of `fresh` (the painted
 * bands overlap or touch). Pen ink never merges.
 */
export function findMergeableMarkerStrokes(
  pageAnnotations: readonly Annotation[],
  fresh: InkAnnotation,
): InkAnnotation[] {
  if (fresh.role !== 'marker') return []
  return pageAnnotations.filter(
    (a): a is InkAnnotation =>
      a.kind === 'ink' &&
      a.role === 'marker' &&
      a.id !== fresh.id &&
      a.page === fresh.page &&
      a.blend === fresh.blend &&
      sameColor(a.color, fresh.color) &&
      close(a.opacity, fresh.opacity) &&
      close(a.width, fresh.width) &&
      a.strokes.some((s) => fresh.strokes.some((f) => strokesWithin(s, f, fresh.width))),
  )
}
