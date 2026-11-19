import type { LineAnnotation, Point, Rect, ShapeAnnotation } from '../../core/session/model'
import { newId } from '../../core/session/model'
import { addAnnotations } from '../../core/session/commands'
import { snap45 } from '../../core/geometry/arrow'
import { settings as appSettings } from '../../core/settings/settings.svelte'
import type { PagePointerEvent, ToolContext, ToolDefinition, ToolHandler } from '../../core/registry/tools'
import { createPreviewFrame } from '../shared/previewFrame'
import Icon from './Icon.svelte'
import Options from './Options.svelte'
import { copyStyle, isLineShape, lineBorder, type LineShape, type ShapeSettings } from './settings'

export type { ShapeSettings }

/** Smallest rect side (screen px) and circle radius (screen px) a drag must reach to draw. */
const MIN_RECT_PX = 2
const MIN_RADIUS_PX = 1
/** Shortest line (screen px) a drag must reach to draw; also how far a polyline press must move to place a vertex on release. */
const MIN_LINE_PX = 2
/** A polyline press this close (screen px) to the last vertex, soon after placing it, finishes the polyline (double click). */
const DOUBLE_CLICK_PX = 4
const DOUBLE_CLICK_MS = 500

type BoxShape = ShapeAnnotation['shape']

/**
 * The shape's rect (PDF, normalized) for a drag from `start` to `end`.
 * Rect: opposite corners; `square` makes both sides the longer one, in the
 * drag direction. Circle: `start` is the centre, the distance the radius.
 */
export function dragRect(shape: BoxShape, start: Point, end: Point, square: boolean): Rect {
  const [sx, sy] = start
  if (shape === 'circle') {
    const r = Math.hypot(end[0] - sx, end[1] - sy)
    return [sx - r, sy - r, sx + r, sy + r]
  }
  let [ex, ey] = end
  if (square) {
    const side = Math.max(Math.abs(ex - sx), Math.abs(ey - sy))
    ex = sx + (ex < sx ? -side : side)
    ey = sy + (ey < sy ? -side : side)
  }
  return [Math.min(sx, ex), Math.min(sy, ey), Math.max(sx, ex), Math.max(sy, ey)]
}

function tooSmall(shape: BoxShape, r: Rect, scale: number): boolean {
  if (shape === 'circle') return ((r[2] - r[0]) / 2) * scale < MIN_RADIUS_PX
  return (r[2] - r[0]) * scale < MIN_RECT_PX || (r[3] - r[1]) * scale < MIN_RECT_PX
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

interface Drag {
  page: number
  shape: BoxShape
  start: Point
  end: Point
  /** Shift was held at some point of the drag (latching, like the marker's straight line). */
  square: boolean
}

/**
 * A line being drawn: its placed `points` and the pointer position `end`,
 * where the next point goes (snapped to 45° steps while Shift is held).
 * Line and arrow: one drag. Polyline: lasts across presses, see the handler.
 */
interface LineDraft {
  page: number
  shape: LineShape
  points: Point[]
  end: Point
  /** Polyline: the current press, its screen position and time (moving it far enough places a vertex on release). */
  press: { at: Point; time: number } | null
  /** Polyline: when the last vertex was placed by a click (for the double click that finishes). */
  lastClick: { at: Point; time: number } | null
}

/**
 * Rect and circle: press = one corner (rect) or the centre (circle), drag =
 * the opposite corner or the radius. Line and arrow: press = start, drag =
 * end (the arrowhead). Polyline: each click places a vertex (a press dragged
 * and released places one where it ends), the next segment follows the
 * pointer; a double click or Enter finishes it, Backspace takes back the last
 * vertex, Escape drops it. Shift: square (rect) or 45° steps (lines).
 * Previewed live and committed as one annotation.
 */
export function createShapeHandler(ctx: ToolContext, settings: () => ShapeSettings): ToolHandler {
  let drag: Drag | null = null
  let line: LineDraft | null = null

  const base = (page: number) => ({
    id: newId(),
    page,
    sourceRef: null,
    modifiedAt: new Date().toISOString(),
    author: appSettings.data.author,
  })

  function buildShape(d: Drag): ShapeAnnotation {
    return {
      ...base(d.page),
      kind: 'shape',
      shape: d.shape,
      rect: dragRect(d.shape, d.start, d.end, d.square),
      ...copyStyle(settings()),
    }
  }

  function buildLine(d: LineDraft, points: Point[]): LineAnnotation {
    const b = lineBorder(settings())
    return {
      ...base(d.page),
      kind: 'line',
      points: points.map((p) => [p[0], p[1]] as Point),
      arrow: d.shape === 'arrow',
      border: { color: [b.color[0], b.color[1], b.color[2]], width: b.width, opacity: b.opacity },
    }
  }

  /** The draft's points with the pointer position appended (unless it sits on the last point). */
  function withEnd(d: LineDraft): Point[] {
    const last = d.points[d.points.length - 1]
    return last && dist(last, d.end) === 0 ? d.points : [...d.points, d.end]
  }

  const preview = createPreviewFrame(ctx, () => {
    if (drag) return buildShape(drag)
    if (line) return buildLine(line, withEnd(line))
    return null
  })

  function track(d: Drag, e: PagePointerEvent) {
    if (e.native.shiftKey) d.square = true
    d.end = e.pdf
  }

  function trackLine(d: LineDraft, e: PagePointerEvent) {
    const last = d.points[d.points.length - 1]
    d.end = e.native.shiftKey ? snap45(last, e.pdf) : e.pdf
  }

  function reset() {
    drag = null
    line = null
    preview.clear()
  }

  /** Commits the polyline if it has at least two distinct points; ends the draft either way. */
  function finishPolyline(scale: number | null) {
    const d = line
    reset()
    if (!d) return
    const pts = d.points.filter((p, i) => i === 0 || dist(p, d.points[i - 1]) > 0)
    if (pts.length < 2) return
    // Too small to see at the current zoom (when known): nothing.
    if (scale !== null && pts.every((p) => dist(p, pts[0]) * scale < MIN_LINE_PX)) return
    ctx.execute(addAnnotations([buildLine(d, pts)]))
  }

  function polylineDown(e: PagePointerEvent) {
    const time = e.native.timeStamp ?? 0
    if (line && line.page !== e.page) finishPolyline(e.vp.scale)
    if (!line) {
      const press = { at: e.screen, time }
      line = { page: e.page, shape: 'polyline', points: [e.pdf], end: e.pdf, press, lastClick: press }
      preview.schedule()
      return
    }
    const c = line.lastClick
    if (c && line.points.length > 1 && time - c.time <= DOUBLE_CLICK_MS && dist(c.at, e.screen) <= DOUBLE_CLICK_PX) {
      finishPolyline(e.vp.scale)
      return
    }
    trackLine(line, e)
    line.points.push(line.end)
    line.press = { at: e.screen, time }
    line.lastClick = { at: e.screen, time }
    preview.schedule()
  }

  function polylineUp(e: PagePointerEvent) {
    const d = line
    if (!d?.press) return
    // Dragged far enough: the release places the next vertex.
    if (dist(d.press.at, e.screen) >= MIN_LINE_PX) {
      trackLine(d, e)
      d.points.push(d.end)
      d.lastClick = null
    }
    d.press = null
    preview.schedule()
  }

  return {
    onPointerDown(e) {
      const shape = settings().shape
      if (shape === 'polyline') {
        drag = null
        polylineDown(e)
        return
      }
      reset()
      if (isLineShape(shape)) {
        line = { page: e.page, shape, points: [e.pdf], end: e.pdf, press: null, lastClick: null }
        return
      }
      drag = { page: e.page, shape, start: e.pdf, end: e.pdf, square: !!e.native.shiftKey }
    },
    onPointerMove(e) {
      if (drag) track(drag, e)
      else if (line && line.page === e.page) trackLine(line, e)
      else return
      preview.schedule()
    },
    onHover(e) {
      if (!line || line.page !== e.page || line.shape !== 'polyline') return
      trackLine(line, e)
      preview.schedule()
    },
    onPointerUp(e) {
      if (line?.shape === 'polyline') {
        polylineUp(e)
        return
      }
      if (line) {
        const d = line
        trackLine(d, e)
        reset()
        if (dist(d.points[0], d.end) * e.vp.scale < MIN_LINE_PX) return
        ctx.execute(addAnnotations([buildLine(d, [d.points[0], d.end])]))
        return
      }
      const d = drag
      if (!d) return
      track(d, e)
      reset()
      if (tooSmall(d.shape, dragRect(d.shape, d.start, d.end, d.square), e.vp.scale)) return
      ctx.execute(addAnnotations([buildShape(d)]))
    },
    onPointerCancel() {
      // A polyline outlives its presses: only the aborted press is dropped.
      if (line?.shape === 'polyline') line.press = null
      else reset()
    },
    onKeyDown(e) {
      if (line?.shape !== 'polyline' || line.press) return false
      if (e.key === 'Enter') {
        finishPolyline(null)
        return true
      }
      if (e.key === 'Escape') {
        reset()
        return true
      }
      if (e.key === 'Backspace') {
        line.points.pop()
        if (line.points.length === 0) reset()
        else {
          line.lastClick = null
          preview.schedule()
        }
        return true
      }
      return false
    },
    onDeactivate: reset,
  }
}

export const shapeTool: ToolDefinition<ShapeSettings> = {
  type: 'shape',
  displayName: 'Shape',
  description: 'Draw rectangles, circles, lines, polylines and arrows',
  shortcut: 'S',
  Icon,
  defaultSettings: { shape: 'rect', border: { color: [0.898, 0.224, 0.208], width: 2, opacity: 1 }, fill: null },
  Options,
  cursor: () => 'crosshair',
  allowMultipleInstances: true,
  createHandler: createShapeHandler,
}
