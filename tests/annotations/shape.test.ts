import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import type { PageViewport } from 'pdfjs-dist'
import '../../src/annotations'
import { shapeKind } from '../../src/annotations/shape'
import { annotationKinds } from '../../src/core/registry/annotationKinds'
import type { ShapeAnnotation } from '../../src/core/session/model'
import { AnnotationStore } from '../../src/core/session/store.svelte'
import Overlay from '../../src/core/viewer/Overlay.svelte'

const shape = (over: Partial<ShapeAnnotation> = {}): ShapeAnnotation => ({
  id: 's1', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'shape', shape: 'rect',
  rect: [10, 20, 50, 40], border: { color: [1, 0, 0], width: 2, opacity: 0.5 },
  fill: { color: [0, 0, 1], opacity: 0.25 }, ...over,
})

// Page 100pt tall, scale 2: screen = (2x, 2(100 - y)).
const vp = {
  scale: 2,
  width: 200,
  height: 200,
  rotation: 0,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
} as unknown as PageViewport

// /Rotate 90 at scale 2: screen right = +y, down = +x.
const vp90 = {
  scale: 2,
  width: 200,
  height: 400,
  rotation: 90,
  convertToViewportPoint: (x: number, y: number) => [y * 2, x * 2],
} as unknown as PageViewport

function mount(a: ShapeAnnotation, viewport = vp) {
  const store = new AnnotationStore()
  store.add(a)
  return render(Overlay, { props: { pageNumber: 1, scale: 2, store, viewport } }).container
}

const attrs = (el: Element, names: string[]) => names.map((n) => el.getAttribute(n))

describe('shape kind rendering', () => {
  it('renders a rect with fill and stroke', () => {
    const r = mount(shape()).querySelector('rect')!
    expect(attrs(r, ['x', 'y', 'width', 'height'])).toEqual(['20', '120', '80', '40'])
    expect(attrs(r, ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity']))
      .toEqual(['rgb(0,0,255)', '0.25', 'rgb(255,0,0)', '4', '0.5'])
  })

  it('renders a circle as an ellipse, fill none and stroke none when absent', () => {
    const outline = mount(shape({ shape: 'circle', fill: null })).querySelector('ellipse')!
    expect(attrs(outline, ['cx', 'cy', 'rx', 'ry'])).toEqual(['60', '140', '40', '20'])
    expect(outline.getAttribute('fill')).toBe('none')
    expect(outline.getAttribute('stroke')).toBe('rgb(255,0,0)')
    const filled = mount(shape({ shape: 'circle', border: null })).querySelector('ellipse')!
    expect(filled.getAttribute('stroke')).toBe('none')
    expect(filled.hasAttribute('stroke-width')).toBe(false)
    expect(filled.getAttribute('fill')).toBe('rgb(0,0,255)')
  })

  it('stays axis-aligned on rotated pages', () => {
    const r = mount(shape(), vp90).querySelector('rect')!
    expect(attrs(r, ['x', 'y', 'width', 'height'])).toEqual(['40', '20', '40', '80'])
  })
})

describe('shape kind geometry', () => {
  it('registers at import', () => {
    expect(annotationKinds.get('shape')).toBe(shapeKind)
  })

  it('bounds include half the border width', () => {
    expect(shapeKind.bounds(shape())).toEqual([9, 19, 51, 41])
    expect(shapeKind.bounds(shape({ border: null }))).toEqual([10, 20, 50, 40])
  })

  it('hitTest: a filled rect is hit inside, an outline-only rect near its edges', () => {
    const filled = shape()
    expect(shapeKind.hitTest(filled, [30, 30], 0)).toBe(true)
    expect(shapeKind.hitTest(filled, [50.9, 30], 0)).toBe(true) // within the stroke
    expect(shapeKind.hitTest(filled, [52, 30], 0)).toBe(false)
    expect(shapeKind.hitTest(filled, [52, 30], 1)).toBe(true)
    const outline = shape({ fill: null })
    expect(shapeKind.hitTest(outline, [30, 30], 1)).toBe(false)
    expect(shapeKind.hitTest(outline, [11.5, 30], 1)).toBe(true)
    expect(shapeKind.hitTest(outline, [30, 41.5], 1)).toBe(true)
    expect(shapeKind.hitTest(outline, [13, 30], 1)).toBe(false)
  })

  it('hitTest: circles use the ellipse equation', () => {
    // Centre (30, 30), rx 20, ry 10.
    const filled = shape({ shape: 'circle' })
    expect(shapeKind.hitTest(filled, [30, 30], 0)).toBe(true)
    expect(shapeKind.hitTest(filled, [48, 30], 0)).toBe(true)
    expect(shapeKind.hitTest(filled, [12, 22], 0)).toBe(false) // inside the rect corner, outside the ellipse
    const outline = shape({ shape: 'circle', fill: null })
    expect(shapeKind.hitTest(outline, [30, 30], 1)).toBe(false)
    expect(shapeKind.hitTest(outline, [50, 30], 1)).toBe(true)
    expect(shapeKind.hitTest(outline, [30, 40.5], 1)).toBe(true)
    expect(shapeKind.hitTest(outline, [30, 43], 1)).toBe(false)
    expect(shapeKind.hitTest(outline, [44, 30], 1)).toBe(false)
  })

  it('translate shifts the rect, scale maps it from one box to another', () => {
    expect(shapeKind.translate(shape(), 5, -5).rect).toEqual([15, 15, 55, 35])
    expect(shapeKind.scale!(shape(), [10, 20, 50, 40], [10, 20, 90, 30]).rect).toEqual([10, 20, 90, 30])
    expect(shapeKind.scale!(shape(), [0, 0, 100, 100], [0, 0, 50, 200]).rect).toEqual([5, 40, 25, 80])
  })
})
