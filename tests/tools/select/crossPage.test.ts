import { describe, expect, it } from 'vitest'
import type { PageViewport } from 'pdfjs-dist'
import '../../../src/annotations'
import { dragAcrossPages, type CrossPageDrag, type PageFrame } from '../../../src/tools/select/crossPage'
import type { Annotation, ImageAnnotation, Point, Rect } from '../../../src/core/session/model'

/** A w x 100 pt page at scale 2: screen = (2x, 2(100 - y)). */
function vpOf(w: number): PageViewport {
  return {
    scale: 2,
    rotation: 0,
    width: w * 2,
    height: 200,
    convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
    convertToPdfPoint: (x: number, y: number) => [x / 2, 100 - y / 2],
  } as unknown as PageViewport
}

// Three pages stacked 16px apart: screen 400 x 200 each.
const frames: PageFrame[] = [
  { vp: vpOf(200), origin: [0, 0] },
  { vp: vpOf(200), origin: [0, 216] },
  { vp: vpOf(200), origin: [0, 432] },
]
const frameOf = (fs: (PageFrame | null)[]) => (p: number) => fs[p] ?? null

function image(rect: Rect, page = 0): ImageAnnotation {
  return {
    id: 'img', kind: 'image', page, rect, image: { width: 1, height: 1, png: '' },
    sourceRef: null, modifiedAt: '2026-01-01T00:00:00Z', author: 'A',
  }
}

const rectOf = (a: Annotation) => (a as ImageAnnotation).rect

/** Drags `a` from client point `from` to `to`. */
function drag(a: Annotation, from: Point, to: Point, fs: (PageFrame | null)[] = frames) {
  return dragAcrossPages({ base: a, anchor: from }, to, frameOf(fs))
}

describe('dragAcrossPages', () => {
  it('moves within the page and cuts off the overflow', () => {
    // Screen 140..180 on page 0; 30px down overflows by 10px.
    const r = drag(image([20, 10, 40, 30]), [60, 160], [60, 190])
    expect(r.annotation.page).toBe(0)
    expect(rectOf(r.annotation)).toEqual([20, -5, 40, 15])
  })

  it('exactly half out does not snap', () => {
    const r = drag(image([20, 10, 40, 30]), [60, 160], [60, 200])
    expect(r.annotation.page).toBe(0)
    expect(rectOf(r.annotation)).toEqual([20, -10, 40, 10])
  })

  it('snaps to the top of the next page once more than half is out', () => {
    const r = drag(image([20, 10, 40, 30]), [60, 160], [60, 201])
    expect(r.annotation.page).toBe(1)
    expect(rectOf(r.annotation)).toEqual([20, 80, 40, 100])
    expect(r.drag.anchor).toEqual([60, 201])
    expect(r.drag.base).toEqual(r.annotation)
  })

  it('follows the pointer after the snap', () => {
    const first = drag(image([20, 10, 40, 30]), [60, 160], [60, 201])
    const r = dragAcrossPages(first.drag, [60, 211], frameOf(frames))
    expect(r.annotation.page).toBe(1)
    expect(rectOf(r.annotation)).toEqual([20, 75, 40, 95])
  })

  it('snaps up to the bottom of the previous page', () => {
    // Screen 20..60 on page 1; 41px up overflows the top by 21px.
    const r = drag(image([20, 70, 40, 90], 1), [60, 256], [60, 215])
    expect(r.annotation.page).toBe(0)
    expect(rectOf(r.annotation)).toEqual([20, 0, 40, 20])
  })

  it('chains across pages', () => {
    // Natural client top 440 lies 8px into page 2.
    const r = drag(image([20, 10, 40, 30]), [60, 160], [60, 460])
    expect(r.annotation.page).toBe(2)
    expect(rectOf(r.annotation)).toEqual([20, 76, 40, 96])
  })

  it('missing neighbour clamps at half', () => {
    const r = drag(image([20, 10, 40, 30]), [60, 160], [60, -40])
    expect(r.annotation.page).toBe(0)
    expect(rectOf(r.annotation)).toEqual([20, 90, 40, 110])
    // A lookup that answers for page -1 is never asked.
    const any = dragAcrossPages({ base: image([20, 10, 40, 30]), anchor: [60, 160] }, [60, -40], (p) => frames[Math.max(p, 0)])
    expect(any.annotation.page).toBe(0)
    const unmounted = drag(image([20, 10, 40, 30]), [60, 160], [60, 300], [frames[0], null])
    expect(unmounted.annotation.page).toBe(0)
    expect(rectOf(unmounted.annotation)).toEqual([20, -10, 40, 10])
  })

  it('keeps horizontal moves on the page', () => {
    const r = drag(image([20, 10, 40, 30]), [60, 160], [600, 160])
    expect(rectOf(r.annotation)).toEqual([180, 10, 200, 30])
  })

  it('clamps x onto a narrower page', () => {
    const narrow = [frames[0], { vp: vpOf(100), origin: [100, 216] as Point }]
    const r = drag(image([180, 10, 200, 30]), [380, 160], [380, 201], narrow)
    expect(r.annotation.page).toBe(1)
    expect(rectOf(r.annotation)).toEqual([80, 80, 100, 100])
  })

  it('does not ping-pong', () => {
    // 60pt tall (120px) on 100pt pages.
    const first = drag(image([20, 0, 40, 60]), [60, 120], [60, 181])
    expect(first.annotation.page).toBe(1)
    const again = dragAcrossPages(first.drag, [60, 181], frameOf(frames))
    expect(again.annotation.page).toBe(1)
    expect(rectOf(again.annotation)).toEqual(rectOf(first.annotation))
  })

  it('returns the drag unchanged when its page is not mounted', () => {
    const d: CrossPageDrag = { base: image([20, 10, 40, 30], 5), anchor: [0, 0] }
    const r = dragAcrossPages(d, [10, 10], frameOf(frames))
    expect(r.annotation).toBe(d.base)
    expect(r.drag).toBe(d)
  })
})
