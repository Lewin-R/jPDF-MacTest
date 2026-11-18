import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/core/ipc/api', () => ({ openPdf: vi.fn(async () => new ArrayBuffer(8)) }))
vi.mock('../../../src/core/viewer/pdfEngine', () => ({
  loadPdf: vi.fn(async () => ({
    numPages: 4,
    getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }) }),
    destroy: vi.fn(async () => {}),
  })),
}))

import { DocumentSession } from '../../../src/core/session/session.svelte'
import { renderCache } from '../../../src/core/viewer/renderCache'
import { PAGE_GAP } from '../../../src/core/viewer/layout'

// 4 pages of 600x800 pt. At scale 1: tops 16, 832, 1648, 2464; totalHeight 3280.
let s: DocumentSession
beforeEach(async () => {
  s = await DocumentSession.open('C:\\docs\\a.pdf')
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
