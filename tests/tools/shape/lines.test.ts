import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShapeHandler } from '../../../src/tools/shape'
import { DEFAULT_BORDER, type ShapeSettings } from '../../../src/tools/shape/settings'
import type { PagePointerEvent, ToolContext } from '../../../src/core/registry/tools'
import type { Annotation, LineAnnotation, Point } from '../../../src/core/session/model'
import type { Command } from '../../../src/core/session/history.svelte'
import { snap45 } from '../../../src/core/geometry/arrow'

/** Scale 2, screen = 2 × pdf; `time` is the event's timeStamp. */
function ev(pdf: Point, { shift = false, time = 0, page = 3 } = {}): PagePointerEvent {
  return {
    page,
    pdf,
    screen: [pdf[0] * 2, pdf[1] * 2],
    vp: { scale: 2 } as never,
    native: { shiftKey: shift, timeStamp: time } as PointerEvent,
    toPdf: (x, y) => [x, y],
  }
}

const key = (k: string) => new KeyboardEvent('keydown', { key: k })

const BORDER = { color: [0, 0, 1] as [number, number, number], width: 3, opacity: 0.5 }

function setup(shape: ShapeSettings['shape'], over: Partial<ShapeSettings> = {}) {
  const s: ShapeSettings = { shape, border: BORDER, fill: null, ...over }
  const executed: Command[] = []
  const previews: (Annotation | null)[] = []
  const ctx = {
    execute: (c: Command) => executed.push(c),
    preview: { set: (a: Annotation | null) => previews.push(a) },
  } as unknown as ToolContext
  const handler = createShapeHandler(ctx, () => s)
  const committed = () =>
    executed.map((c) => {
      const added: Annotation[] = []
      c.do({ add: (a: Annotation) => added.push(a) } as never)
      return added[0] as LineAnnotation
    })
  const lastPreview = () => {
    vi.advanceTimersByTime(50)
    return previews.at(-1) as LineAnnotation | null
  }
  return { executed, handler, committed, lastPreview }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('snap45', () => {
  it('snaps to the nearest multiple of 45°, keeping the projection', () => {
    expect(snap45([0, 0], [10, 1])).toEqual([10, 0])
    expect(snap45([0, 0], [1, -10])).toEqual([0, -10])
    expect(snap45([0, 0], [10, 9])).toEqual([9.5, 9.5])
    expect(snap45([5, 5], [5, 5])).toEqual([5, 5])
  })
})

describe('line and arrow', () => {
  it('a drag draws a line from press to release, previewed live, with the border as stroke', () => {
    const { handler, committed, lastPreview } = setup('line')
    handler.onPointerDown!(ev([10, 10]))
    handler.onPointerMove!(ev([30, 20]))
    expect(lastPreview()).toMatchObject({ kind: 'line', points: [[10, 10], [30, 20]], arrow: false })
    handler.onPointerUp!(ev([40, 50]))
    expect(lastPreview()).toBeNull()
    const [a] = committed()
    expect(a).toMatchObject({ kind: 'line', page: 3, points: [[10, 10], [40, 50]], arrow: false, border: BORDER })
    expect(a.border).not.toBe(BORDER)
  })

  it('arrow: the same with an arrowhead; Shift snaps to 45° steps', () => {
    const { handler, committed } = setup('arrow')
    handler.onPointerDown!(ev([0, 0]))
    handler.onPointerUp!(ev([20, 2], { shift: true }))
    expect(committed()[0]).toMatchObject({ points: [[0, 0], [20, 0]], arrow: true })
  })

  it('lines always have a stroke: without a border, the remembered or the default one', () => {
    const last = { color: [0, 1, 0] as [number, number, number], width: 1, opacity: 1 }
    for (const [over, expected] of [
      [{ border: null, fill: { color: [1, 1, 0], opacity: 1 }, lastBorder: last }, last],
      [{ border: null, fill: { color: [1, 1, 0], opacity: 1 } }, DEFAULT_BORDER],
    ] as const) {
      const { handler, committed } = setup('line', over as Partial<ShapeSettings>)
      handler.onPointerDown!(ev([0, 0]))
      handler.onPointerUp!(ev([20, 0]))
      expect(committed()[0].border).toEqual(expected)
    }
  })

  it('a click without drag draws nothing', () => {
    const { executed, handler } = setup('arrow')
    handler.onPointerDown!(ev([10, 10]))
    handler.onPointerUp!(ev([10.5, 10]))
    expect(executed).toHaveLength(0)
  })
})

describe('polyline', () => {
  it('clicks place vertices, the next segment follows the hover, a double click finishes', () => {
    const { handler, committed, lastPreview } = setup('polyline')
    handler.onPointerDown!(ev([10, 10], { time: 0 }))
    handler.onPointerUp!(ev([10, 10], { time: 50 }))
    handler.onHover!(ev([30, 10]))
    expect(lastPreview()!.points).toEqual([[10, 10], [30, 10]])
    handler.onPointerDown!(ev([30, 10], { time: 1000 }))
    handler.onPointerUp!(ev([30, 10], { time: 1050 }))
    handler.onHover!(ev([30, 40]))
    expect(lastPreview()!.points).toEqual([[10, 10], [30, 10], [30, 40]])
    handler.onPointerDown!(ev([30, 40], { time: 2000 }))
    handler.onPointerUp!(ev([30, 40], { time: 2050 }))
    // Second click of the double click: finishes without another vertex.
    handler.onPointerDown!(ev([30.5, 40], { time: 2200 }))
    handler.onPointerUp!(ev([30.5, 40], { time: 2250 }))
    expect(lastPreview()).toBeNull()
    expect(committed()).toHaveLength(1)
    expect(committed()[0]).toMatchObject({ kind: 'line', points: [[10, 10], [30, 10], [30, 40]], arrow: false })
  })

  it('a dragged press places a vertex where it is released', () => {
    const { handler, committed } = setup('polyline')
    handler.onPointerDown!(ev([0, 0], { time: 0 }))
    handler.onPointerMove!(ev([10, 5]))
    handler.onPointerUp!(ev([20, 0], { time: 100 }))
    handler.onPointerDown!(ev([20, 20], { time: 1000 }))
    handler.onPointerUp!(ev([20, 20], { time: 1050 }))
    expect(handler.onKeyDown!(key('Enter'))).toBe(true)
    expect(committed()[0].points).toEqual([[0, 0], [20, 0], [20, 20]])
  })

  it('Backspace takes back the last vertex, Escape drops the polyline', () => {
    const { executed, handler, lastPreview } = setup('polyline')
    for (const [p, t] of [[[0, 0], 0], [[10, 0], 1000], [[10, 10], 2000]] as [Point, number][]) {
      handler.onPointerDown!(ev(p, { time: t }))
      handler.onPointerUp!(ev(p, { time: t + 50 }))
    }
    expect(handler.onKeyDown!(key('Backspace'))).toBe(true)
    handler.onHover!(ev([20, 20]))
    expect(lastPreview()!.points).toEqual([[0, 0], [10, 0], [20, 20]])
    expect(handler.onKeyDown!(key('Escape'))).toBe(true)
    expect(lastPreview()).toBeNull()
    expect(executed).toHaveLength(0)
    // No polyline in progress: keys go on to the shortcuts.
    expect(handler.onKeyDown!(key('Escape'))).toBe(false)
  })

  it('Enter with a single point draws nothing; a press on another page finishes the polyline there', () => {
    const { executed, handler, committed } = setup('polyline')
    handler.onPointerDown!(ev([0, 0]))
    handler.onPointerUp!(ev([0, 0]))
    handler.onKeyDown!(key('Enter'))
    expect(executed).toHaveLength(0)
    handler.onPointerDown!(ev([0, 0], { time: 0 }))
    handler.onPointerUp!(ev([0, 0], { time: 50 }))
    handler.onPointerDown!(ev([10, 0], { time: 1000 }))
    handler.onPointerUp!(ev([10, 0], { time: 1050 }))
    handler.onPointerDown!(ev([5, 5], { time: 2000, page: 4 }))
    expect(committed()[0]).toMatchObject({ page: 3, points: [[0, 0], [10, 0]] })
  })

  it('a cancelled press keeps the polyline; deactivating drops it', () => {
    const { executed, handler, lastPreview } = setup('polyline')
    handler.onPointerDown!(ev([0, 0], { time: 0 }))
    handler.onPointerUp!(ev([0, 0], { time: 50 }))
    handler.onPointerDown!(ev([10, 0], { time: 1000 }))
    handler.onPointerCancel!(ev([10, 0]))
    expect(lastPreview()!.points).toEqual([[0, 0], [10, 0]])
    handler.onDeactivate!()
    expect(lastPreview()).toBeNull()
    expect(executed).toHaveLength(0)
  })
})
