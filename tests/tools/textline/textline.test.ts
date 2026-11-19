import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../src/tools'
import { NO_TEXT_MESSAGE, createTextLineHandler, strikeoutTool, underlineTool } from '../../../src/tools/textline'
import type { TextLineSettings } from '../../../src/tools/textline/settings'
import type { PagePointerEvent, ToolContext } from '../../../src/core/registry/tools'
import { toolRegistry } from '../../../src/core/registry/tools'
import type { Annotation, HighlightAnnotation, Point, TextLineAnnotation } from '../../../src/core/session/model'
import type { Command } from '../../../src/core/session/history.svelte'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import { registerTextLayer } from '../../../src/core/viewer/textLayers'
import { settings as appSettings } from '../../../src/core/settings/settings.svelte'
import { toasts } from '../../../src/ui/toasts.svelte'

const red: TextLineSettings = { color: [1, 0, 0] }

/** A text layer whose spans carry their client rect (see the Range.getClientRects stub). */
function layer(page: number, spans: { text: string; rect: [number, number, number, number] }[]) {
  const el = document.createElement('div')
  for (const s of spans) {
    const span = document.createElement('span')
    span.textContent = s.text
    span.dataset.rect = s.rect.join(',')
    el.append(span)
  }
  document.body.append(el)
  // Page box: client y=top maps to PDF y = 1000 - y; x unchanged.
  const toPdf = (x: number, y: number): Point => [x, 1000 - y]
  cleanup.push(registerTextLayer(el, { page, toPdf }))
  return el
}

function setup(kind: TextLineAnnotation['kind'], s: TextLineSettings = red, existing: Annotation[] = []) {
  const store = new AnnotationStore()
  existing.forEach((a) => store.add(a))
  const executed: Command[] = []
  const previews: Annotation[][] = []
  const ctx = {
    pagePreviews: { set: (list: readonly Annotation[]) => previews.push([...list]) },
    execute: (c: Command) => {
      executed.push(c)
      c.do(store)
    },
    preview: { set: () => {} },
    session: { store },
  } as unknown as ToolContext
  const handler = createTextLineHandler(kind, ctx, () => s)
  cleanup.push(() => handler.onDeactivate!())
  return { executed, handler, store, previews }
}

const pointerDown = (target: Element, button = 0) =>
  target.dispatchEvent(new MouseEvent('pointerdown', { button, bubbles: true }))
const pointerUp = () => window.dispatchEvent(new MouseEvent('pointerup', { button: 0 }))

/** Selects characters `from`..`to` of the span's text (as dragging does: a selectionchange follows). */
function drag(span: Element, to: number, from = 0) {
  const range = document.createRange()
  range.setStart(span.firstChild!, from)
  range.setEnd(span.firstChild!, to)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  return sel
}

/** Selects the first `end` characters of the span's text, starting the gesture inside it. */
function selectIn(span: Element, end: number) {
  pointerDown(span)
  const sel = drag(span, end)
  pointerUp()
  return sel
}

/** Pending animation frames (requestAnimationFrame is stubbed: frames run when the test says so). */
let frames: FrameRequestCallback[] = []
function runFrames() {
  const pending = frames
  frames = []
  pending.forEach((f) => f(0))
}

let cleanup: (() => void)[] = []
const originalGetClientRects = Range.prototype.getClientRects

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => {}
  })
  Range.prototype.getClientRects = function (this: Range) {
    const span = this.startContainer.parentElement
    if (!span?.dataset.rect || this.collapsed) return [] as unknown as DOMRectList
    const [left, top, right, bottom] = span.dataset.rect.split(',').map(Number)
    return [{ left, top, right, bottom, width: right - left, height: bottom - top }] as unknown as DOMRectList
  }
})

afterEach(() => {
  Range.prototype.getClientRects = originalGetClientRects
  cleanup.forEach((f) => f())
  cleanup = []
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('underline and strikethrough tools', () => {
  it('are registered with their shortcuts and a colour setting', () => {
    expect(toolRegistry.get('underline')).toBe(underlineTool)
    expect(toolRegistry.get('strikeout')).toBe(strikeoutTool)
    expect(underlineTool.shortcut).toBe('U')
    expect(strikeoutTool.shortcut).toBe('K')
    expect(Object.keys(underlineTool.defaultSettings)).toEqual(['color'])
  })

  it.each(['underline', 'strikeout'] as const)('%s: a text selection becomes one annotation of that kind', (kind) => {
    const el = layer(0, [{ text: 'Hello', rect: [10, 100, 50, 110] }])
    const { executed, store } = setup(kind)
    const sel = selectIn(el.firstElementChild!, 5)

    expect(executed).toHaveLength(1)
    expect(store.byPage(0)).toEqual([
      expect.objectContaining({
        kind,
        color: [1, 0, 0],
        sourceRef: null,
        author: appSettings.data.author,
        quads: [[10, 900, 50, 900, 10, 890, 50, 890]],
      }),
    ])
    expect(sel.rangeCount).toBe(0)
  })

  it('a selection in the middle of a layer covers exactly the selected spans', () => {
    const el = layer(0, [
      { text: 'one', rect: [10, 100, 30, 110] },
      { text: 'two', rect: [10, 120, 30, 130] },
      { text: 'three', rect: [10, 140, 40, 150] },
      { text: 'four', rect: [10, 160, 30, 170] },
    ])
    const [, two, three] = el.children
    const { store } = setup('underline')
    pointerDown(two)
    const range = document.createRange()
    range.setStart(two.firstChild!, 0)
    range.setEnd(three.firstChild!, 5)
    window.getSelection()!.addRange(range)
    pointerUp()
    expect((store.byPage(0)[0] as TextLineAnnotation).quads).toEqual([
      [10, 880, 30, 880, 10, 870, 30, 870],
      [10, 860, 40, 860, 10, 850, 40, 850],
    ])
  })

  it('merges into touching text lines of the same kind and colour only', () => {
    const el = layer(0, [{ text: 'Hello', rect: [10, 100, 50, 110] }])
    const base = { page: 0, sourceRef: null, modifiedAt: 'old', author: 'A' }
    const sameQuads: TextLineAnnotation['quads'] = [[50, 900, 80, 900, 50, 890, 80, 890]]
    const old: TextLineAnnotation = { ...base, id: 'old', kind: 'underline', quads: sameQuads, color: [1, 0, 0] }
    const blue: TextLineAnnotation = { ...base, id: 'blue', kind: 'underline', quads: sameQuads, color: [0, 0, 1] }
    const strike: TextLineAnnotation = { ...base, id: 'strike', kind: 'strikeout', quads: sameQuads, color: [1, 0, 0] }
    const hl: HighlightAnnotation = { ...base, id: 'hl', kind: 'highlight', quads: sameQuads, color: [1, 0, 0], opacity: 1 }
    const { store } = setup('underline', red, [old, blue, strike, hl])

    selectIn(el.firstElementChild!, 5)

    expect(store.byPage(0).map((a) => a.id)).toEqual(['old', 'blue', 'strike', 'hl'])
    expect((store.get('old') as TextLineAnnotation).quads).toEqual([[10, 900, 80, 900, 10, 890, 80, 890]])
    expect(store.get('old')!.modifiedAt).not.toBe('old')
    expect((store.get('blue') as TextLineAnnotation).quads).toEqual(sameQuads)
  })

  it('selects text natively without drawing the selection (the lines are previewed instead)', () => {
    const { handler } = setup('strikeout', { color: [0, 0.5, 1] })
    expect(handler.textSelection!()).toEqual({ color: null })
  })

  it('previews the lines while dragging, once per frame, and clears the preview on release', () => {
    const el = layer(0, [{ text: 'Hello', rect: [10, 100, 50, 110] }])
    const span = el.firstElementChild!
    const { previews, executed } = setup('strikeout')

    pointerDown(span)
    drag(span, 2)
    drag(span, 5)
    expect(frames).toHaveLength(1)
    expect(previews).toHaveLength(0)
    runFrames()
    expect(previews).toEqual([
      [expect.objectContaining({ id: 'preview-0', kind: 'strikeout', color: [1, 0, 0], quads: [[10, 900, 50, 900, 10, 890, 50, 890]] })],
    ])
    expect(executed).toHaveLength(0)

    pointerUp()
    expect(previews.at(-1)).toEqual([])
    expect(executed).toHaveLength(1)
    // A frame still pending at release must not bring the preview back.
    drag(span, 3)
    runFrames()
    expect(previews.at(-1)).toEqual([])
  })

  it('previews only gestures that started in text with the left button', () => {
    const el = layer(0, [{ text: 'Hello', rect: [10, 100, 50, 110] }])
    const outside = document.createElement('button')
    document.body.append(outside)
    const { previews } = setup('underline')

    pointerDown(outside)
    drag(el.firstElementChild!, 5)
    pointerDown(el.firstElementChild!, 2)
    drag(el.firstElementChild!, 4)
    runFrames()
    expect(previews).toHaveLength(0)
  })

  it('deactivating mid-drag clears the preview', () => {
    const el = layer(0, [{ text: 'Hello', rect: [10, 100, 50, 110] }])
    const { previews, handler } = setup('underline')
    pointerDown(el.firstElementChild!)
    drag(el.firstElementChild!, 5)
    runFrames()
    handler.onDeactivate!()
    expect(previews.at(-1)).toEqual([])
  })

  it('on a page without text, tells the user once ever and adds nothing', () => {
    delete appSettings.data.hints.textLineNoText
    const show = vi.spyOn(toasts, 'show')
    const { executed, handler } = setup('underline')
    const ev = { page: 0, pdf: [0, 0], screen: [0, 0], native: {} } as unknown as PagePointerEvent
    handler.onPointerDown!(ev)
    handler.onPointerDown!(ev)
    expect(show).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledWith(NO_TEXT_MESSAGE)
    expect(executed).toHaveLength(0)
  })

  it('stops listening once deactivated', () => {
    const el = layer(0, [{ text: 'Hello', rect: [10, 100, 50, 110] }])
    const { executed, handler } = setup('underline')
    handler.onDeactivate!()
    selectIn(el.firstElementChild!, 5)
    expect(executed).toHaveLength(0)
  })
})
