import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ doc: null as unknown, annotations: [] as unknown[] | Error }))
vi.mock('../../../src/core/ipc/api', () => ({
  openPdf: vi.fn(async () => new ArrayBuffer(8)),
  readAnnotations: vi.fn(async () => {
    if (mocks.annotations instanceof Error) throw mocks.annotations
    return mocks.annotations
  }),
}))
vi.mock('../../../src/core/viewer/pdfEngine', () => ({ loadPdf: async () => mocks.doc }))

/** Fake doc; getPage(i) resolves with sizes[i-1], or waits on `gate` for pages > 1. */
function fakeDoc(sizes: { width: number; height: number }[], gate?: Promise<void>) {
  return {
    numPages: sizes.length,
    destroyed: false,
    getPage: vi.fn(async (i: number) => {
      if (i > 1 && gate) await gate
      return { getViewport: () => sizes[i - 1] }
    }),
    suppressAnnotations: vi.fn(),
    destroy: vi.fn(async () => {}),
  }
}
const uniform = Array.from({ length: 4 }, () => ({ width: 600, height: 800 }))

import { DocumentSession } from '../../../src/core/session/session.svelte'
import { toasts } from '../../../src/ui/toasts.svelte'
import { renderCache } from '../../../src/core/viewer/renderCache'
import { PAGE_GAP } from '../../../src/core/viewer/layout'

// 4 pages of 600x800 pt. At scale 1: tops 16, 832, 1648, 2464; totalHeight 3280.
let s: DocumentSession
beforeEach(async () => {
  mocks.annotations = []
  mocks.doc = fakeDoc(uniform)
  s = await DocumentSession.open('C:/docs/a.pdf')
  await s.pageSizesLoaded
  s.setViewport(1000, 500)
})

describe('DocumentSession view state', () => {
  it('lays pages out at the current scale', () => {
    expect(s.layout.tops).toEqual([16, 832, 1648, 2464])
    s.zoomTo(2)
    expect(s.layout.tops[1]).toBe(16 + 1600 + 16)
  })

  it('fitWidth fits the widest page into the viewport', () => {
    s.fitWidth()
    expect(s.scale).toBeCloseTo((1000 - 2 * PAGE_GAP) / 600)
  })

  it('scrollBy moves the scroll position and never goes negative', () => {
    s.setScroll(100, 50)
    s.scrollBy(20, -30)
    expect([s.scrollTop, s.scrollLeft]).toEqual([70, 70])
    s.scrollBy(-500, -500)
    expect([s.scrollTop, s.scrollLeft]).toEqual([0, 0])
  })

  it('initView fits width at the top once', () => {
    s.initView()
    expect(s.scale).toBeCloseTo((1000 - 2 * PAGE_GAP) / 600)
    expect(s.scrollTop).toBe(0)
    expect(s.scrollLeft).toBe(0)
    s.zoomTo(1)
    s.initView()
    expect(s.scale).toBe(1)
  })

  it('zoomTo clamps the scale and keeps the anchor point fixed', () => {
    s.setScroll(900, 0) // y=900+250=1150 lies on page 2, 318 pt below its top
    s.zoomTo(2, { x: 500, y: 250 })
    expect(s.scale).toBe(2)
    expect(s.scrollTop).toBe(1632 + 318 * 2 - 250)
    s.zoomTo(100)
    expect(s.scale).toBe(8)
    s.zoomTo(0.001)
    expect(s.scale).toBe(0.1)
  })

  it('zoomTo defaults the anchor to the viewport centre', () => {
    s.setScroll(900, 0)
    s.zoomTo(2)
    expect(s.scrollTop).toBe(1632 + 318 * 2 - 250)
  })

  it('setScroll tracks currentPage at a third of the viewport', () => {
    expect(s.currentPage).toBe(1)
    s.setScroll(832 - 166, 0) // 666 + 166.7 = 832.7, past page 2's top
    expect(s.currentPage).toBe(2)
    s.setScroll(500, 0)
    expect(s.currentPage).toBe(1)
  })

  it('goToPage scrolls to the page top and sets currentPage', () => {
    s.goToPage(2)
    expect(s.scrollTop).toBe(832 - PAGE_GAP)
    expect(s.currentPage).toBe(2)
  })

  it('goToPage clamps to the last scroll position but still reports the requested page', () => {
    s.setViewport(1000, 1200)
    s.goToPage(4)
    expect(s.scrollTop).toBe(3280 - 1200)
    expect(s.currentPage).toBe(4)
    // The scroll event that echoes the programmatic scroll keeps the page.
    s.setScroll(3280 - 1200, 0)
    expect(s.currentPage).toBe(4)
    // A real user scroll recomputes it.
    s.setScroll(100, 0)
    expect(s.currentPage).toBe(1)
  })

  it('goToPage clamps out-of-range page numbers', () => {
    s.goToPage(0)
    expect(s.currentPage).toBe(1)
    s.goToPage(99)
    expect(s.currentPage).toBe(4)
  })

  it('dispose evicts the session from the render cache', async () => {
    const spy = vi.spyOn(renderCache, 'evictPrefix')
    await s.dispose()
    expect(spy).toHaveBeenCalledWith(`${s.id}:`)
  })
})

describe('DocumentSession lazy page sizes', () => {
  const mixed = [
    { width: 600, height: 800 },
    { width: 600, height: 1000 },
    { width: 800, height: 600 },
    { width: 600, height: 800 },
  ]

  it('open resolves after page 1 only, then fills real sizes in the background', async () => {
    let release!: () => void
    const doc = fakeDoc(mixed, new Promise<void>((r) => (release = r)))
    mocks.doc = doc
    const session = await DocumentSession.open('C:/docs/b.pdf')
    expect(doc.getPage.mock.calls.map((c) => c[0])).toEqual([1])
    expect(session.pageSizes).toEqual(Array.from({ length: 4 }, () => mixed[0]))
    release()
    await session.pageSizesLoaded
    expect(session.pageSizes).toEqual(mixed)
    expect(session.layout.tops).toEqual([16, 832, 1848, 2464])
  })

  it('keeps the current page anchored when sizes above it change', async () => {
    let release!: () => void
    mocks.doc = fakeDoc(mixed, new Promise<void>((r) => (release = r)))
    const session = await DocumentSession.open('C:/docs/c.pdf')
    session.setViewport(1000, 500)
    session.setScroll(1648 + 100, 0) // page 3, 100 px below its top
    expect(session.currentPage).toBe(3)
    release()
    await session.pageSizesLoaded
    expect(session.scrollTop).toBe(1848 + 100)
    expect(session.currentPage).toBe(3)
  })

  it('stops filling once disposed', async () => {
    let release!: () => void
    mocks.doc = fakeDoc(mixed, new Promise<void>((r) => (release = r)))
    const session = await DocumentSession.open('C:/docs/d.pdf')
    await session.dispose()
    release()
    await session.pageSizesLoaded
    expect(session.pageSizes).toEqual(Array.from({ length: 4 }, () => mixed[0]))
  })
})

describe('DocumentSession.open annotations', () => {
  const ink = (id: string, sourceRef: string | null) => ({
    kind: 'ink', id, page: 0, sourceRef, modifiedAt: '2026-11-18T10:00:00Z', author: 'JuliePDF',
    strokes: [[[0, 0], [10, 10]]], color: [1, 0, 0], width: 2, opacity: 1, blend: 'normal', role: 'pen',
  })

  it('loads the file annotations into the store, clean', async () => {
    mocks.annotations = [ink('a', '10R'), ink('b', '12R')]
    mocks.doc = fakeDoc(uniform)
    const session = await DocumentSession.open('C:/docs/e.pdf')
    expect(session.store.all().map((a) => a.id)).toEqual(['a', 'b'])
    expect(session.dirty).toBe(false)
    expect(session.store.changedSince()).toEqual([])
  })

  it('suppresses the loaded sourceRefs in pdf.js', async () => {
    mocks.annotations = [ink('a', '10R'), ink('b', '12R3')]
    const doc = fakeDoc(uniform)
    mocks.doc = doc
    await DocumentSession.open('C:/docs/f.pdf')
    expect(doc.suppressAnnotations.mock.calls.flatMap((c) => [...(c[0] as Iterable<string>)])).toEqual(['10R', '12R3'])
  })

  it('opens without annotations when they cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.annotations = new Error('InvalidPdf')
    mocks.doc = fakeDoc(uniform)
    const session = await DocumentSession.open('C:/docs/g.pdf')
    expect(session.store.all()).toEqual([])
    expect(error).toHaveBeenCalled()
    expect(toasts.items.at(-1)).toMatchObject({
      message: 'Annotations in this file could not be loaded',
      kind: 'warning',
    })
    error.mockRestore()
  })

  it('anchorView restores the page and the offset within it after the scroll was disturbed', () => {
    s.goToPage(3)
    s.scrollBy(0, 100)
    const restore = s.anchorView()
    const top = s.scrollTop
    s.setScroll(5, 0) // e.g. the browser clamped the scroll while the viewport resized
    restore()
    expect(s.scrollTop).toBe(top)
    expect(s.currentPage).toBe(3)
  })

  it('wraps freetext lines on load to the box width on screen (page rotation aware)', async () => {
    const ft = (id: string, page: number, rect: number[]) => ({
      kind: 'freetext', id, page, sourceRef: '20R', modifiedAt: '', author: '', rect,
      text: 'aaa bbb\nccc', lines: [], fontSize: 10, textColor: [0, 0, 0], background: null,
    })
    // 'aaa bbb' is 36.14pt in Helvetica 10pt: fits a 48pt box (40pt text area), not a 30pt one.
    mocks.annotations = [ink('i', '10R'), ft('flat', 0, [0, 0, 48, 30]), ft('turned', 1, [0, 0, 48, 30])]
    const doc = fakeDoc(uniform)
    doc.getPage.mockImplementation(async (i: number) => ({ getViewport: () => uniform[i - 1], rotate: i === 2 ? 90 : 0 }))
    mocks.doc = doc
    const session = await DocumentSession.open('C:/docs/h.pdf')
    expect(session.store.get('flat')).toMatchObject({ lines: ['aaa bbb', 'ccc'] })
    // Rotate 90: the box is 30pt wide on screen (22pt text area).
    expect(session.store.get('turned')).toMatchObject({ lines: ['aaa', 'bbb', 'ccc'] })
    expect(session.store.get('i')).toEqual(ink('i', '10R'))
    expect(session.dirty).toBe(false)
  })

  it('commitPendingEdit runs the pending edit once', () => {
    const commit = vi.fn()
    s.pendingEdit = commit
    s.commitPendingEdit()
    s.commitPendingEdit()
    expect(commit).toHaveBeenCalledOnce()
    expect(s.pendingEdit).toBeNull()
  })

  it('setPath updates path and fileName', () => {
    s.setPath('D:\\out\\copy.pdf')
    expect(s.path).toBe('D:\\out\\copy.pdf')
    expect(s.fileName).toBe('copy.pdf')
  })
})
