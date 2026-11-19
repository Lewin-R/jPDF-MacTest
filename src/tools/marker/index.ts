import type { PagePointerEvent, ToolContext, ToolDefinition, ToolHandler } from '../../core/registry/tools'
import Icon from './Icon.svelte'
import Options from './Options.svelte'
import { createFreehandHandler, straightLine } from './freehand'
import { MARKER_PRESETS, type MarkerSettings } from './settings'

export { MARKER_PRESETS, straightLine, type MarkerSettings }

/**
 * Picks a sub-handler per gesture from the current mode. Text mode arrives in
 * Task 19; until then it behaves as freehand.
 */
export function createMarkerHandler(ctx: ToolContext, settings: () => MarkerSettings): ToolHandler {
  const freehand = createFreehandHandler(ctx, settings)
  let active: ToolHandler | null = null

  function pick(): ToolHandler {
    return freehand
  }

  return {
    onPointerDown(e: PagePointerEvent) {
      active?.onPointerCancel?.(e)
      active = pick()
      active.onPointerDown?.(e)
    },
    onPointerMove(e: PagePointerEvent) {
      active?.onPointerMove?.(e)
    },
    onPointerUp(e: PagePointerEvent) {
      const h = active
      active = null
      h?.onPointerUp?.(e)
    },
    onPointerCancel(e: PagePointerEvent) {
      const h = active
      active = null
      h?.onPointerCancel?.(e)
    },
    onDeactivate() {
      const h = active
      active = null
      h?.onDeactivate?.()
    },
  }
}

export const markerTool: ToolDefinition<MarkerSettings> = {
  type: 'marker',
  displayName: 'Marker',
  description: 'Highlight text or draw with a marker',
  shortcut: 'M',
  Icon,
  defaultSettings: { mode: 'text', color: [1, 0.922, 0.231], opacity: 0.4, width: 14 },
  Options,
  cursor: () => 'crosshair',
  allowMultipleInstances: true,
  createHandler: createMarkerHandler,
}
