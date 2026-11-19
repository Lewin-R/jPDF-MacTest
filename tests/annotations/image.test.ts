import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import type { PageViewport } from 'pdfjs-dist'
import '../../src/annotations'
import { imageKind } from '../../src/annotations/image'
import { downscaledSize, encodePng, bytesToBase64 } from '../../src/annotations/image/encode'
import { fitSize, placeImage } from '../../src/annotations/image/placement'
import { annotationKinds } from '../../src/core/registry/annotationKinds'
import type { ImageAnnotation } from '../../src/core/session/model'
import { AnnotationStore } from '../../src/core/session/store.svelte'
import Overlay from '../../src/core/viewer/Overlay.svelte'
import { blankViewport } from '../../src/core/viewer/pageSource'

const PNG = 'iVBORw0KGgo='

const img = (over: Partial<ImageAnnotation> = {}): ImageAnnotation => ({
  id: 'i1', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'image',
  rect: [10, 20, 50, 40], image: { width: 80, height: 40, png: PNG }, ...over,
})

function mount(a: ImageAnnotation, viewport: PageViewport) {
  const store = new AnnotationStore()
  store.add(a)
  return render(Overlay, { props: { pageNumber: 1, scale: 2, store, viewport } }).container
}

describe('image kind', () => {
  it('is registered', () => {
    expect(annotationKinds.get('image')).toBe(imageKind)
  })

  it('bounds are the rect', () => {
    expect(imageKind.bounds(img())).toEqual([10, 20, 50, 40])
  })

  it('is hit inside its rect and within the tolerance around it', () => {
    const a = img()
    expect(imageKind.hitTest(a, [30, 30], 0)).toBe(true)
    expect(imageKind.hitTest(a, [10, 20], 0)).toBe(true)
    expect(imageKind.hitTest(a, [8, 30], 0)).toBe(false)
    expect(imageKind.hitTest(a, [8, 30], 2)).toBe(true)
    expect(imageKind.hitTest(a, [30, 43], 2)).toBe(false)
  })

  it('translates and scales its rect', () => {
    expect(imageKind.translate(img(), 5, -5).rect).toEqual([15, 15, 55, 35])
    const scaled = imageKind.scale!(img(), [10, 20, 50, 40], [10, 20, 90, 30])
    expect(scaled.rect).toEqual([10, 20, 90, 30])
    expect(scaled.image).toEqual(img().image)
  })

  it('draws the PNG stretched over its screen box', () => {
    // Page 100pt tall at scale 2.
    const svg = mount(img(), blankViewport(100, 100, 2, 0))
    const el = svg.querySelector('image')!
    expect(el.getAttribute('href')).toBe(`data:image/png;base64,${PNG}`)
    expect(el.getAttribute('preserveAspectRatio')).toBe('none')
    expect([el.getAttribute('x'), el.getAttribute('y'), el.getAttribute('width'), el.getAttribute('height')]).toEqual([
      '20', '120', '80', '40',
    ])
  })

  it('stays upright on a rotated page: the screen box of the rect', () => {
    // Rotate 90: screen right = +y, down = +x; the rect is 40 wide and 20 tall in PDF space.
    const svg = mount(img(), blankViewport(100, 100, 2, 90))
    const el = svg.querySelector('image')!
    expect([el.getAttribute('x'), el.getAttribute('y'), el.getAttribute('width'), el.getAttribute('height')]).toEqual([
      '40', '20', '40', '80',
    ])
    expect(el.getAttribute('transform')).toBeNull()
  })
})

describe('image placement', () => {
  it('uses the natural size at 96 dpi when it fits', () => {
    expect(fitSize({ width: 200, height: 100 }, { width: 400, height: 400 })).toEqual({ width: 150, height: 75 })
  })

  it('scales down (never up) to fit, keeping the aspect ratio', () => {
    expect(fitSize({ width: 2000, height: 1000 }, { width: 400, height: 400 })).toEqual({ width: 400, height: 200 })
    expect(fitSize({ width: 1000, height: 2000 }, { width: 400, height: 300 })).toEqual({ width: 150, height: 300 })
    expect(fitSize({ width: 10, height: 10 }, { width: 400, height: 400 })).toEqual({ width: 7.5, height: 7.5 })
  })

  it('puts the top-left corner at the click point', () => {
    const vp = blankViewport(600, 800, 1.5, 0)
    // 200 x 100 px = 150 x 75 pt; top-left at (100, 700) in PDF space.
    expect(placeImage({ width: 200, height: 100 }, [100, 700], vp)).toEqual([100, 625, 250, 700])
  })

  it('fits within 80 % of the page', () => {
    const vp = blankViewport(500, 1000, 1, 0)
    const r = placeImage({ width: 4000, height: 1000 }, [0, 1000], vp)
    expect(r[2] - r[0]).toBeCloseTo(400)
    expect(r[3] - r[1]).toBeCloseTo(100)
  })

  it('is clamped inside the page', () => {
    const vp = blankViewport(600, 800, 1, 0)
    // 150 x 75 pt near the bottom-right corner moves left and up.
    expect(placeImage({ width: 200, height: 100 }, [550, 30], vp)).toEqual([450, 0, 600, 75])
  })

  it('keeps the image upright on a rotated page (rect in user space)', () => {
    // Rotate 90: screen right = +y, down = +x; on screen the page is 800 wide, 600 tall.
    const vp = blankViewport(600, 800, 1, 90)
    // 150 pt wide on screen = 150 along y; 75 pt tall = 75 along x; top-left at the click point.
    expect(placeImage({ width: 200, height: 100 }, [100, 200], vp)).toEqual([100, 200, 175, 350])
    // 80 % of the screen-oriented page: 640 wide, 480 tall.
    const big = placeImage({ width: 2000, height: 2000 }, [0, 0], vp)
    expect(big[2] - big[0]).toBeCloseTo(480)
    expect(big[3] - big[1]).toBeCloseTo(480)
  })
})

describe('image encoding', () => {
  it('downscales only when the longest side exceeds 2000 px', () => {
    expect(downscaledSize(1200, 800)).toEqual({ width: 1200, height: 800 })
    expect(downscaledSize(4000, 1000)).toEqual({ width: 2000, height: 500 })
    expect(downscaledSize(1000, 3000)).toEqual({ width: 667, height: 2000 })
  })

  it('encodes through the injected encoder at the downscaled size', async () => {
    const calls: [number, number, number][] = []
    const out = await encodePng({ width: 4000, height: 2000, rgba: new Uint8Array(4) }, async (im, w, h) => {
      calls.push([im.width, w, h])
      return new Uint8Array([1, 2, 3])
    })
    expect(calls).toEqual([[4000, 2000, 1000]])
    expect(out).toEqual({ width: 2000, height: 1000, png: 'AQID' })
  })

  it('base64-encodes large byte arrays', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256)
    const b64 = bytesToBase64(bytes)
    expect(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))).toEqual(bytes)
  })
})
