import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../src/annotations'
import { createFreehandHandler } from '../../../src/tools/marker/freehand'
import { highlightsCommand, markerStrokeCommand } from '../../../src/tools/marker/merging'
import type { MarkerSettings } from '../../../src/tools/marker/settings'
import type { PagePointerEvent, ToolContext } from '../../../src/core/registry/tools'
import type { Command } from '../../../src/core/session/history.svelte'
import type { Annotation, HighlightAnnotation, InkAnnotation, Point, Quad } from '../../../src/core/session/model'
import { AnnotationStore } from '../../../src/core/session/store.svelte'

const q = (x1: number, x2: number, y1: number, y2: number): Quad => [x1, y2, x2, y2, x1, y1, x2, y1]
const yellow: [number, number, number] = [1, 0.922, 0.231]

const hl = (id: string, quads: Quad[], over: Partial<HighlightAnnotation> = {}): HighlightAnnotation => ({
  id, page: 0, sourceRef: null, modifiedAt: 'old', author: 'A', kind: 'highlight', quads, color: yellow, opacity: 0.4, ...over,
})
const marker = (id: string, strokes: Point[][], over: Partial<InkAnnotation> = {}): InkAnnotation => ({
  id, page: 0, sourceRef: null, modifiedAt: 'old', author: 'A', kind: 'ink',
  strokes, color: yellow, width: 14, opacity: 0.4, blend: 'multiply', role: 'marker', ...over,
})
const pen = (id: string, strokes: Point[][]): InkAnnotation =>
  marker(id, strokes, { role: 'pen', blend: 'normal', color: [0, 0, 0], width: 2, opacity: 1 })

const ids = (list: Annotation[]) => list.map((a) => a.id)

describe('markerStrokeCommand', () => {
  it('adds a stroke that touches nothing as a new annotation', () => {
    const store = new AnnotationStore()
    store.load([marker('a', [[[0, 100], [50, 100]]])])
    const cmd = markerStrokeCommand(store, marker('new', [[[0, 0], [50, 0]]], { modifiedAt: 'now' }))
    cmd.do(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'new'])
  })

  it('merges overlapping marker strokes into the oldest one, keeping its id, ref and z-position; undo restores', () => {
    const store = new AnnotationStore()
    const a = { ...marker('a', [[[0, 0], [50, 0]]]), sourceRef: '4 0 R' }
    const b = marker('b', [[[0, 20], [50, 20]]])
    store.load([a, pen('p', [[[0, 0], [50, 0]]]), b, marker('far', [[[0, 200], [50, 200]]])])
    const fresh = marker('new', [[[25, -5], [25, 25]]], { modifiedAt: 'now' })
    const cmd = markerStrokeCommand(store, fresh)
    cmd.do(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'p', 'far'])
    expect(store.get('a')).toMatchObject({
      sourceRef: '4 0 R',
      modifiedAt: 'now',
      strokes: [[[0, 0], [50, 0]], [[0, 20], [50, 20]], [[25, -5], [25, 25]]],
    })
    cmd.undo(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'p', 'b', 'far'])
    expect(store.get('a')).toEqual(a)
    expect(store.get('b')).toEqual(b)
  })
})

describe('cascading merges', () => {
  it('marker: new touches only b, b touches the older a: all three become a', () => {
    const store = new AnnotationStore()
    const a = marker('a', [[[0, 0], [50, 0]]])
    const b = marker('b', [[[0, 14], [50, 14]]])
    store.load([a, b])
    const fresh = marker('new', [[[0, 28], [50, 28]]], { modifiedAt: 'now' })
    const cmd = markerStrokeCommand(store, fresh)
    cmd.do(store)
    expect(ids(store.byPage(0))).toEqual(['a'])
    expect((store.get('a') as InkAnnotation).strokes).toEqual([...a.strokes, ...b.strokes, ...fresh.strokes])
    cmd.undo(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'b'])
  })

  it('highlight: new touches only b, b touches the older a: all three become a', () => {
    const store = new AnnotationStore()
    const a = hl('a', [q(10, 50, 100, 110)])
    const b = hl('b', [q(50.5, 90, 100, 110)])
    store.load([a, b])
    const cmd = highlightsCommand(store, [hl('new', [q(90, 130, 100, 110)], { modifiedAt: 'now' })])
    cmd.do(store)
    expect(ids(store.byPage(0))).toEqual(['a'])
    expect((store.get('a') as HighlightAnnotation).quads).toEqual([q(10, 130, 100, 110)])
    cmd.undo(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'b'])
    expect(store.get('a')).toEqual(a)
  })
})

describe('highlightsCommand', () => {
  it('merges an overlapping highlight into the oldest, quads joined per line, one undo step for all pages', () => {
    const store = new AnnotationStore()
    const a = { ...hl('a', [q(10, 50, 100, 110)]), sourceRef: '9 0 R' }
    const b = hl('b', [q(80, 120, 100, 110), q(10, 40, 88, 98)])
    const green = hl('green', [q(10, 50, 100, 110)], { color: [0, 1, 0] })
    store.load([a, green, b, hl('p1', [q(0, 10, 0, 10)], { page: 1 })])
    const fresh = [
      hl('n0', [q(45, 85, 100, 110)], { modifiedAt: 'now' }),
      hl('n1', [q(300, 310, 0, 10)], { page: 1, modifiedAt: 'now' }),
    ]
    const cmd = highlightsCommand(store, fresh)
    cmd.do(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'green'])
    expect(store.get('a')).toMatchObject({ sourceRef: '9 0 R', modifiedAt: 'now' })
    expect((store.get('a') as HighlightAnnotation).quads).toEqual([q(10, 120, 100, 110), q(10, 40, 88, 98)])
    expect(ids(store.byPage(1))).toEqual(['p1', 'n1'])
    cmd.undo(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'green', 'b'])
    expect(store.get('a')).toEqual(a)
    expect(ids(store.byPage(1))).toEqual(['p1'])
  })

  it('without overlaps is a plain add of every highlight', () => {
    const store = new AnnotationStore()
    const cmd = highlightsCommand(store, [hl('n0', [q(0, 10, 0, 10)]), hl('n1', [q(0, 10, 0, 10)], { page: 1 })])
    expect(cmd.label).toBe('Add annotation')
    cmd.do(store)
    expect(store.all()).toHaveLength(2)
  })
})

describe('marker freehand commit', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('merges the new stroke into an overlapping marker annotation of the same style', () => {
    const store = new AnnotationStore()
    store.load([marker('old', [[[0, 0], [50, 0]]], { page: 1 })])
    const executed: Command[] = []
    const ctx = {
      session: { store },
      execute: (c: Command) => {
        executed.push(c)
        c.do(store)
      },
      preview: { set: () => {} },
    } as unknown as ToolContext
    const s: MarkerSettings = { mode: 'freehand', color: yellow, opacity: 0.4, width: 14 }
    const handler = createFreehandHandler(ctx, () => s)
    const ev = (pdf: Point): PagePointerEvent =>
      ({ page: 1, pdf, screen: [0, 0], vp: { scale: 1 } as never, native: {} as PointerEvent, toPdf: (x, y) => [x, y] })
    handler.onPointerDown!(ev([10, 5]))
    handler.onPointerMove!(ev([30, 5]))
    handler.onPointerUp!(ev([40, 5]))
    expect(executed).toHaveLength(1)
    expect(ids(store.byPage(1))).toEqual(['old'])
    expect((store.get('old') as InkAnnotation).strokes).toHaveLength(2)
  })
})
