import { describe, expect, it } from 'vitest'
import type { PageViewport } from 'pdfjs-dist'
import '../../../src/annotations'
import { createSelectHandler, selectTool } from '../../../src/tools/select'
import type { PagePointerEvent, TextEdit, ToolContext } from '../../../src/core/registry/tools'
import { History } from '../../../src/core/session/history.svelte'
import type { Annotation, FreeTextAnnotation, InkAnnotation, Point } from '../../../src/core/session/model'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import { boxHeight, layoutLines, pageBoxRect } from '../../../src/core/geometry/textLayout'

// Page 200 x 100 pt at scale 2: screen = (2x, 2(100 - y)).
const vp = {
  scale: 2,
  rotation: 0,
  width: 400,
  height: 200,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
  convertToPdfPoint: (x: number, y: number) => [x / 2, 100 - y / 2],
} as unknown as PageViewport

// /Rotate 90 at scale 2: screen right = +y, down = +x.
const vp90 = {
  scale: 2,
  rotation: 90,
  width: 200,
  height: 400,
  convertToViewportPoint: (x: number, y: number) => [y * 2, x * 2],
  convertToPdfPoint: (x: number, y: number) => [y / 2, x / 2],
} as unknown as PageViewport

let clock = 0
let currentVp = vp
function ev(pdf: Point, page = 0): PagePointerEvent {
  return { page, pdf, screen: [0, 0], vp: currentVp, native: { timeStamp: clock } as PointerEvent, toPdf: () => pdf }
}

const base = { page: 0, sourceRef: null, modifiedAt: '2026-01-01T00:00:00Z', author: 'A' }

function box(id: string, rect: FreeTextAnnotation['rect'], text = 'hi'): FreeTextAnnotation {
  return {
    ...base, id, kind: 'freetext', rect, text, lines: [text], fontSize: 10,
    textColor: [0, 0, 0], background: null,
  }
}

function ink(id: string, strokes: Point[][], width = 2): InkAnnotation {
  return { ...base, id, kind: 'ink', strokes, color: [1, 0, 0], width, opacity: 1, blend: 'normal', role: 'pen' }
}

const rectOf = (store: AnnotationStore, id: string) => (store.get(id) as FreeTextAnnotation).rect

function setup(loaded: Annotation[]) {
  const store = new AnnotationStore()
  store.load(loaded)
  const history = new History(store)
  const session = { store, history, pendingEdit: null as (() => void) | null }
  const state = {
    selection: [] as string[],
    preview: null as Annotation | null,
    hidden: [] as string[],
    cursor: null as string | null,
    edit: null as TextEdit | null,
  }
  const ctx = {
    session,
    execute: (c: Parameters<History['execute']>[0]) => history.execute(c),
    selection: {
      get ids() {
        return state.selection
      },
      set: (ids: string[]) => void (state.selection = ids),
    },
    preview: { set: (a: Annotation | null) => void (state.preview = a) },
    hidden: {
      get ids() {
        return new Set(state.hidden)
      },
      set: (ids: Iterable<string>) => void (state.hidden = [...ids]),
    },
    cursor: { set: (c: string | null) => void (state.cursor = c) },
    textEdit: { set: (e: TextEdit | null) => void (state.edit = e) },
  } as unknown as ToolContext
  const h = createSelectHandler(ctx)
  const drag = (from: Point, ...to: Point[]) => {
    h.onPointerDown!(ev(from))
    for (const p of to) h.onPointerMove!(ev(p))
    h.onPointerUp!(ev(to.at(-1) ?? from))
  }
  const click = (p: Point) => drag(p)
  return { store, history, state, h, drag, click }
}

describe('select tool', () => {
  it('is the single-instance default tool with shortcut V', () => {
    expect(selectTool.type).toBe('select')
    expect(selectTool.shortcut).toBe('V')
    expect(selectTool.allowMultipleInstances).toBe(false)
    expect(selectTool.Options).toBeNull()
    expect(selectTool.SelectionOptions).toBeDefined()
    expect(selectTool.cursor!({})).toBe('default')
  })

  it('click selects the topmost annotation under the pointer', () => {
    const t = setup([box('under', [10, 10, 100, 50]), box('top', [50, 30, 150, 60])])
    t.click([60, 40])
    expect(t.state.selection).toEqual(['top'])
    t.click([20, 20])
    expect(t.state.selection).toEqual(['under'])
    expect(t.history.canUndo).toBe(false)
  })

  it('click on empty space deselects', () => {
    const t = setup([box('a', [10, 10, 100, 50])])
    t.click([20, 20])
    t.click([180, 90])
    expect(t.state.selection).toEqual([])
  })

  it('drag previews the move live and commits one update with translated geometry', () => {
    const t = setup([box('a', [10, 10, 100, 50])])
    t.h.onPointerDown!(ev([20, 20]))
    t.h.onPointerMove!(ev([25, 22]))
    expect(t.state.hidden).toEqual(['a'])
    expect((t.state.preview as FreeTextAnnotation).rect).toEqual([15, 12, 105, 52])
    expect(rectOf(t.store, 'a')).toEqual([10, 10, 100, 50])
    t.h.onPointerMove!(ev([30, 25]))
    t.h.onPointerUp!(ev([30, 25]))
    const moved = t.store.get('a') as FreeTextAnnotation
    expect(moved.rect).toEqual([20, 15, 110, 55])
    expect(moved.modifiedAt).not.toBe(base.modifiedAt)
    expect(t.state.preview).toBeNull()
    expect(t.state.hidden).toEqual([])
    expect(t.state.selection).toEqual(['a'])
    t.history.undo()
    expect(rectOf(t.store, 'a')).toEqual([10, 10, 100, 50])
    expect(t.history.canUndo).toBe(false)
  })

  it('a press without movement beyond the threshold commits nothing', () => {
    const t = setup([box('a', [10, 10, 100, 50])])
    t.drag([20, 20], [20.5, 20.5])
    expect(t.history.canUndo).toBe(false)
  })

  it('moves ink and keeps it on the page', () => {
    const t = setup([ink('i', [[[20, 20], [40, 30]]])])
    t.drag([30, 25], [-100, 500])
    const a = t.store.get('i') as InkAnnotation
    // Bounds [19, 19, 41, 31] clamped to the page [0, 0, 200, 100].
    expect(a.strokes[0]).toEqual([[1, 89], [21, 99]])
  })

  it('cancel restores the original', () => {
    const t = setup([box('a', [10, 10, 100, 50])])
    t.h.onPointerDown!(ev([20, 20]))
    t.h.onPointerMove!(ev([60, 60]))
    t.h.onPointerCancel!(ev([60, 60]))
    expect(rectOf(t.store, 'a')).toEqual([10, 10, 100, 50])
    expect(t.state.preview).toBeNull()
    expect(t.state.hidden).toEqual([])
    expect(t.history.canUndo).toBe(false)
  })

  it('dragging a text box e handle changes its width, re-wraps lines and fits the height', () => {
    const text = 'the quick brown fox jumps'
    const t = setup([box('a', [10, 70, 210, 90], text)])
    t.click([50, 80]) // select
    // e handle in the middle of the right edge; drag it 120pt left.
    t.drag([210, 80], [90, 80])
    const a = t.store.get('a') as FreeTextAnnotation
    const lines = layoutLines(text, 10, 80)
    expect(lines.length).toBeGreaterThan(1)
    expect(a.lines).toEqual(lines)
    // The top-left corner stays; the height fits the lines.
    expect(a.rect).toEqual([10, 90 - boxHeight(lines.length, 10), 90, 90])
    expect(t.history.canUndo).toBe(true)
  })

  it('text box w handle keeps the right edge and stops at the minimum width', () => {
    const t = setup([box('a', [10, 70, 110, 90])])
    t.click([50, 80])
    t.drag([10, 80], [180, 80])
    const a = t.store.get('a') as FreeTextAnnotation
    expect(a.rect[2]).toBeCloseTo(110)
    expect(a.rect[0]).toBeCloseTo(110 - 24)
  })

  it('resizes text boxes on rotated pages along their on-screen width', () => {
    currentVp = vp90
    try {
      const text = 'the quick brown fox jumps'
      const rect = pageBoxRect([50, 10], 100, 20, 90) // [50, 10, 70, 110]
      const t = setup([box('a', rect, text)])
      t.click([60, 50])
      // w handle: screen left edge = pdf y 10; drag it 20pt to screen-right (+y).
      t.drag([60, 10], [60, 30])
      const lines = layoutLines(text, 10, 80)
      const a = t.store.get('a') as FreeTextAnnotation
      expect(a.lines).toEqual(lines)
      expect(a.rect).toEqual(pageBoxRect([50, 30], 80, boxHeight(lines.length, 10), 90))
    } finally {
      currentVp = vp
    }
  })

  it('text boxes have no vertical handles: a press on the top edge middle moves', () => {
    const t = setup([box('a', [10, 70, 110, 90])])
    t.click([50, 80])
    t.drag([60, 90], [60, 80])
    expect(rectOf(t.store, 'a')).toEqual([10, 60, 110, 80])
  })

  it('ink se handle scales the strokes proportionally to the new box', () => {
    const t = setup([ink('i', [[[20, 20], [40, 40]]], 2)])
    t.click([30, 30])
    // Bounds [19, 19, 41, 41]; the se corner (screen bottom-right) is pdf (41, 19).
    // Dragging it 20pt right doubles the stroke extent in x.
    t.drag([41, 19], [61, 19])
    const a = t.store.get('i') as InkAnnotation
    expect(a.strokes[0][0][0]).toBeCloseTo(20)
    expect(a.strokes[0][0][1]).toBeCloseTo(20)
    expect(a.strokes[0][1][0]).toBeCloseTo(60)
    expect(a.strokes[0][1][1]).toBeCloseTo(40)
    expect(t.history.canUndo).toBe(true)
  })

  it('double-click on a text box opens its editor', () => {
    const t = setup([box('a', [10, 70, 110, 90])])
    clock = 1000
    t.click([50, 80])
    expect(t.state.edit).toBeNull()
    clock = 1200
    t.click([50, 80])
    expect(t.state.edit?.draft.id).toBe('a')
    expect(t.state.hidden).toEqual(['a'])
    // The next press commits the edit.
    t.state.edit!.setText('changed')
    clock = 5000
    t.click([180, 10])
    expect(t.state.edit).toBeNull()
    expect((t.store.get('a') as FreeTextAnnotation).text).toBe('changed')
  })

  it('two slow clicks do not open the editor', () => {
    const t = setup([box('a', [10, 70, 110, 90])])
    clock = 1000
    t.click([50, 80])
    clock = 2000
    t.click([50, 80])
    expect(t.state.edit).toBeNull()
  })

  it('passes through to the text layer only where nothing is under the pointer', () => {
    const t = setup([box('a', [10, 70, 110, 90])])
    expect(t.h.passThroughAt!(ev([50, 80]))).toBe(false)
    expect(t.h.passThroughAt!(ev([150, 20]))).toBe(true)
    t.h.onPassThroughDown!(ev([50, 80]))
    expect(t.state.selection).toEqual(['a'])
    // A selected box's handle (just outside the box) also takes the press.
    expect(t.h.passThroughAt!(ev([112, 80]))).toBe(false)
    t.h.onPassThroughDown!(ev([150, 20]))
    expect(t.state.selection).toEqual([])
  })

  it('deactivation clears the selection', () => {
    const t = setup([box('a', [10, 70, 110, 90])])
    t.click([50, 80])
    t.h.onDeactivate!()
    expect(t.state.selection).toEqual([])
  })
})
