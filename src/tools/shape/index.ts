import type { Point, Rect, ShapeAnnotation } from '../../core/session/model'
import { newId } from '../../core/session/model'
import { addAnnotations } from '../../core/session/commands'
import { settings as appSettings } from '../../core/settings/settings.svelte'
import type { PagePointerEvent, ToolContext, ToolDefinition, ToolHandler } from '../../core/registry/tools'
import { createPreviewFrame } from '../shared/previewFrame'
import Icon from './Icon.svelte'
import Options from './Options.svelte'
import { copyStyle, type ShapeSettings } from './settings'

export type { ShapeSettings }

/** Smallest rect side (screen px) and circle radius (screen px) a drag must reach to draw. */
const MIN_RECT_PX = 2
const MIN_RADIUS_PX = 1

/**
 * The shape's rect (PDF, normalized) for a drag from `start` to `end`.
 * Rect: opposite corners; `square` makes both sides the longer one, in the
 * drag direction. Circle: `start` is the centre, the distance the radius.
 */
export function dragRect(shape: ShapeSettings['shape'], start: Point, end: Point, square: boolean): Rect {
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

function tooSmall(shape: ShapeSettings['shape'], r: Rect, scale: number): boolean {
  if (shape === 'circle') return ((r[2] - r[0]) / 2) * scale < MIN_RADIUS_PX
  return (r[2] - r[0]) * scale < MIN_RECT_PX || (r[3] - r[1]) * scale < MIN_RECT_PX
}

interface Drag {
  page: number
  shape: ShapeSettings['shape']
  start: Point
  end: Point
  /** Shift was held at some point of the drag (latching, like the marker's straight line). */
  square: boolean
}

/**
 * Press = one corner (rect) or the centre (circle), drag = the opposite corner
 * or the radius; previewed live and committed as one annotation on release.
 */
export function createShapeHandler(ctx: ToolContext, settings: () => ShapeSettings): ToolHandler {
  let drag: Drag | null = null

  function build(d: Drag): ShapeAnnotation {
    return {
      id: newId(),
      page: d.page,
      sourceRef: null,
      modifiedAt: new Date().toISOString(),
      author: appSettings.data.author,
      kind: 'shape',
      shape: d.shape,
      rect: dragRect(d.shape, d.start, d.end, d.square),
      ...copyStyle(settings()),
    }
  }

  const preview = createPreviewFrame(ctx, () => drag && build(drag))

  function track(d: Drag, e: PagePointerEvent) {
    if (e.native.shiftKey) d.square = true
    d.end = e.pdf
  }

  function reset() {
    drag = null
    preview.clear()
  }

  return {
    onPointerDown(e) {
      reset()
      drag = { page: e.page, shape: settings().shape, start: e.pdf, end: e.pdf, square: !!e.native.shiftKey }
    },
    onPointerMove(e) {
      if (!drag) return
      track(drag, e)
      preview.schedule()
    },
    onPointerUp(e) {
      const d = drag
      if (!d) return
      track(d, e)
      reset()
      if (tooSmall(d.shape, dragRect(d.shape, d.start, d.end, d.square), e.vp.scale)) return
      ctx.execute(addAnnotations([build(d)]))
    },
    onPointerCancel: reset,
    onDeactivate: reset,
  }
}

export const shapeTool: ToolDefinition<ShapeSettings> = {
  type: 'shape',
  displayName: 'Shape',
  description: 'Draw rectangles and circles',
  shortcut: 'S',
  Icon,
  defaultSettings: { shape: 'rect', border: { color: [0.898, 0.224, 0.208], width: 2, opacity: 1 }, fill: null },
  Options,
  cursor: () => 'crosshair',
  allowMultipleInstances: true,
  createHandler: createShapeHandler,
}
