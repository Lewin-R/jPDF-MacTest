import type { InkAnnotation, Point } from '../../core/session/model'
import { newId } from '../../core/session/model'
import { addAnnotations } from '../../core/session/commands'
import { dedupe, simplify } from '../../core/geometry/stroke'
import { settings as appSettings } from '../../core/settings/settings.svelte'
import type { PagePointerEvent, ToolContext, ToolDefinition, ToolHandler } from '../../core/registry/tools'
import Icon from './Icon.svelte'
import Options from './Options.svelte'
import { PEN_PRESETS, type PenSettings } from './settings'

export { PEN_PRESETS, type PenSettings }

export function createPenHandler(ctx: ToolContext, settings: () => PenSettings): ToolHandler {
  let points: Point[] | null = null
  let page = 0
  let frame = 0

  function ink(pts: Point[], pg: number): InkAnnotation {
    const s = settings()
    return {
      id: newId(),
      page: pg,
      sourceRef: null,
      modifiedAt: new Date().toISOString(),
      author: appSettings.data.author,
      kind: 'ink',
      strokes: [pts],
      color: s.color,
      width: s.width,
      opacity: s.opacity,
      blend: 'normal',
      role: 'pen',
    }
  }

  function reset() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    points = null
    ctx.preview.set(null)
  }

  function schedulePreview() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (points) ctx.preview.set(ink(points.slice(), page))
    })
  }

  return {
    onPointerDown(e: PagePointerEvent) {
      reset()
      page = e.page
      points = [e.pdf]
      schedulePreview()
    },
    onPointerMove(e: PagePointerEvent) {
      if (!points) return
      const coalesced = e.native.getCoalescedEvents?.() ?? []
      if (coalesced.length > 0) {
        for (const c of coalesced) points.push(e.toPdf(c.clientX, c.clientY))
      } else {
        points.push(e.pdf)
      }
      schedulePreview()
    },
    onPointerUp(e: PagePointerEvent) {
      if (!points) return
      const raw = points
      // The up event can carry a position the last move did not.
      const last = raw[raw.length - 1]
      if (raw.length > 1 && (last[0] !== e.pdf[0] || last[1] !== e.pdf[1])) raw.push(e.pdf)
      const scale = e.vp.scale
      const pts = simplify(dedupe(raw, 0.5 / scale), 0.35 / scale)
      const pg = page
      reset()
      ctx.execute(addAnnotations([ink(pts, pg)]))
    },
    onPointerCancel() {
      reset()
    },
    onDeactivate() {
      reset()
    },
  }
}

export const penTool: ToolDefinition<PenSettings> = {
  type: 'pen',
  displayName: 'Pen',
  description: 'Draw freehand',
  shortcut: 'P',
  Icon,
  defaultSettings: { color: [0.898, 0.224, 0.208], width: 2, opacity: 1 },
  Options,
  cursor: () => 'crosshair',
  allowMultipleInstances: true,
  createHandler: createPenHandler,
}
