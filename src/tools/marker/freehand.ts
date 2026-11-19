import type { InkAnnotation, Point } from '../../core/session/model'
import { newId } from '../../core/session/model'
import { settings as appSettings } from '../../core/settings/settings.svelte'
import type { ToolContext, ToolHandler } from '../../core/registry/tools'
import { createStrokeCapture } from '../shared/strokeCapture'
import type { MarkerSettings } from './settings'

/** Shift-constrained marker stroke: just the two end points. */
export function straightLine(start: Point, current: Point): Point[] {
  return [start, current]
}

export function createFreehandHandler(ctx: ToolContext, settings: () => MarkerSettings): ToolHandler {
  return createStrokeCapture({
    ctx,
    straight: straightLine,
    build(pts, page): InkAnnotation {
      const s = settings()
      return {
        id: newId(),
        page,
        sourceRef: null,
        modifiedAt: new Date().toISOString(),
        author: appSettings.data.author,
        kind: 'ink',
        strokes: [pts],
        color: s.color,
        width: s.width,
        opacity: s.opacity,
        blend: 'multiply',
        role: 'marker',
      }
    },
  })
}
