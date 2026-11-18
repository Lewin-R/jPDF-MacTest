import type { PagePointerEvent, ToolContext, ToolDefinition, ToolHandler } from '../../core/registry/tools'
import Icon from './Icon.svelte'

export function createHandHandler(ctx: ToolContext): ToolHandler {
  let last: { x: number; y: number } | null = null

  function end() {
    last = null
    ctx.cursor.set(null)
  }

  return {
    onPointerDown(e: PagePointerEvent) {
      last = { x: e.native.clientX, y: e.native.clientY }
      ctx.cursor.set('grabbing')
    },
    onPointerMove(e: PagePointerEvent) {
      if (!last) return
      // Client deltas: page-local coordinates move with the page while panning.
      const { clientX: x, clientY: y } = e.native
      ctx.session.scrollBy(-(x - last.x), -(y - last.y))
      last = { x, y }
    },
    onPointerUp: end,
    onPointerCancel: end,
    onDeactivate: end,
  }
}

export const handTool: ToolDefinition<Record<string, never>> = {
  type: 'hand',
  displayName: 'Hand',
  description: 'Drag to pan',
  shortcut: 'H',
  Icon,
  defaultSettings: {},
  Options: null,
  cursor: () => 'grab',
  allowMultipleInstances: false,
  createHandler: createHandHandler,
}
