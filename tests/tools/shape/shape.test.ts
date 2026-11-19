import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShapeHandler, dragRect, shapeTool } from '../../../src/tools/shape'
import { DEFAULT_BORDER, DEFAULT_FILL, withBorder, withFill, type ShapeSettings } from '../../../src/tools/shape/settings'
import type { PagePointerEvent, ToolContext } from '../../../src/core/registry/tools'
import type { Annotation, Point, ShapeAnnotation } from '../../../src/core/session/model'
import type { Command } from '../../../src/core/session/history.svelte'
import { settings as appSettings } from '../../../src/core/settings/settings.svelte'

function ev(pdf: Point, native: Partial<PointerEvent> = {}, scale = 2): PagePointerEvent {
  return {
    page: 3,
    pdf,
    screen: [0, 0],
    vp: { scale } as never,
    native: native as PointerEvent,
    toPdf: (x, y) => [x, y],
  }
}

const RECT: ShapeSettings = {
  shape: 'rect',
  border: { color: [0, 0, 1], width: 3, opacity: 0.5 },
  fill: { color: [1, 1, 0], opacity: 0.25 },
}

function setup(s: ShapeSettings = RECT) {
  const executed: Command[] = []
  const previews: (Annotation | null)[] = []
  const ctx = {
    execute: (c: Command) => executed.push(c),
    preview: { set: (a: Annotation | null) => previews.push(a) },
  } as unknown as ToolContext
  const handler = createShapeHandler(ctx, () => s)
  const committed = () => {
    const added: Annotation[] = []
    executed[0].do({ add: (a: Annotation) => added.push(a) } as never)
    return added as ShapeAnnotation[]
  }
  return { executed, previews, handler, committed }
}

describe('shape tool definition', () => {
  it('defaults, shortcut S, multiple instances, crosshair', () => {
    expect(shapeTool.defaultSettings).toEqual({
      shape: 'rect',
      border: { color: [0.898, 0.224, 0.208], width: 2, opacity: 1 },
      fill: null,
    })
    expect(shapeTool).toMatchObject({ type: 'shape', shortcut: 'S', allowMultipleInstances: true })
    expect(shapeTool.cursor!(RECT)).toBe('crosshair')
  })
})

describe('dragRect', () => {
  it('rect: normalized corners; Shift makes a square in the drag direction', () => {
    expect(dragRect('rect', [10, 50], [30, 20], false)).toEqual([10, 20, 30, 50])
    expect(dragRect('rect', [10, 50], [30, 40], true)).toEqual([10, 30, 30, 50])
    expect(dragRect('rect', [10, 10], [5, 8], true)).toEqual([5, 5, 10, 10])
    expect(dragRect('rect', [10, 10], [5, 10], true)).toEqual([5, 10, 10, 15]) // no vertical drag: upwards
  })
  it('circle: centre and radius', () => {
    expect(dragRect('circle', [50, 50], [53, 54], false)).toEqual([45, 45, 55, 55])
  })
})

describe('shape handler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a rect drag previews live and commits one annotation with a normalized rect', () => {
    const { executed, previews, handler, committed } = setup()
    handler.onPointerDown!(ev([40, 80]))
    handler.onPointerMove!(ev([20, 70]))
    vi.advanceTimersByTime(50)
    expect((previews.at(-1) as ShapeAnnotation).rect).toEqual([20, 70, 40, 80])
    handler.onPointerMove!(ev([10, 60]))
    handler.onPointerUp!(ev([10, 60]))
    expect(previews.at(-1)).toBeNull()
    expect(executed).toHaveLength(1)
    const [a] = committed()
    expect(a).toMatchObject({
      kind: 'shape',
      shape: 'rect',
      page: 3,
      sourceRef: null,
      author: appSettings.data.author,
      rect: [10, 60, 40, 80],
      border: RECT.border,
      fill: RECT.fill,
    })
    expect(a.id).toBeTruthy()
    expect(a.border).not.toBe(RECT.border)
  })

  it('Shift during the drag latches a square', () => {
    const { handler, committed } = setup()
    handler.onPointerDown!(ev([0, 0]))
    handler.onPointerMove!(ev([10, 4], { shiftKey: true }))
    handler.onPointerUp!(ev([20, 5]))
    expect(committed()[0].rect).toEqual([0, 0, 20, 20])
  })

  it('circle: press is the centre, drag distance the radius', () => {
    const { handler, committed } = setup({ ...RECT, shape: 'circle' })
    handler.onPointerDown!(ev([100, 100]))
    handler.onPointerMove!(ev([106, 108]))
    handler.onPointerUp!(ev([106, 108]))
    expect(committed()[0]).toMatchObject({ shape: 'circle', rect: [90, 90, 110, 110] })
  })

  it('a press without real drag commits nothing', () => {
    // Scale 2: a rect needs 1 pt (2 px) on both axes, a circle 0.5 pt (1 px) radius.
    for (const [s, to] of [
      [RECT, [10.9, 20]],
      [RECT, [20, 10.9]],
      [{ ...RECT, shape: 'circle' }, [10.4, 10]],
    ] as [ShapeSettings, Point][]) {
      const { executed, previews, handler } = setup(s)
      handler.onPointerDown!(ev([10, 10]))
      handler.onPointerMove!(ev(to))
      handler.onPointerUp!(ev(to))
      expect(executed).toHaveLength(0)
      expect(previews.at(-1)).toBeNull()
    }
    const { executed, handler } = setup()
    handler.onPointerDown!(ev([10, 10]))
    handler.onPointerUp!(ev([11, 11]))
    expect(executed).toHaveLength(1)
  })

  it('cancel and deactivate discard the shape and clear the preview', () => {
    for (const end of ['onPointerCancel', 'onDeactivate'] as const) {
      const { executed, previews, handler } = setup()
      handler.onPointerDown!(ev([0, 0]))
      handler.onPointerMove!(ev([50, 50]))
      handler[end]!(ev([60, 60]))
      vi.advanceTimersByTime(50)
      expect(executed).toHaveLength(0)
      expect(previews.at(-1)).toBeNull()
      handler.onPointerUp!(ev([60, 60]))
      expect(executed).toHaveLength(0)
    }
  })
})

describe('border/fill rule', () => {
  it('turning off the last of border and fill turns the other on with defaults', () => {
    expect(withBorder({ border: RECT.border, fill: null }, null)).toEqual({ border: null, fill: DEFAULT_FILL })
    expect(withFill({ border: null, fill: RECT.fill }, null)).toEqual({ border: DEFAULT_BORDER, fill: null })
  })
  it('otherwise only the changed part changes', () => {
    expect(withBorder(RECT, null)).toEqual({ border: null, fill: RECT.fill })
    expect(withFill(RECT, null)).toEqual({ border: RECT.border, fill: null })
    expect(withFill({ border: RECT.border, fill: null }, DEFAULT_FILL)).toEqual({ border: RECT.border, fill: DEFAULT_FILL })
  })
})
