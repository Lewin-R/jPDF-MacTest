import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import type { PageViewport } from 'pdfjs-dist'
import '../../src/annotations'
import { lineKind } from '../../src/annotations/line'
import { annotationKinds } from '../../src/core/registry/annotationKinds'
import { arrowHead, arrowLength } from '../../src/core/geometry/arrow'
import type { LineAnnotation } from '../../src/core/session/model'
import { AnnotationStore } from '../../src/core/session/store.svelte'
import Overlay from '../../src/core/viewer/Overlay.svelte'

const line = (over: Partial<LineAnnotation> = {}): LineAnnotation => ({
  id: 'l1', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'line',
  points: [[10, 20], [50, 20]], arrow: false, border: { color: [1, 0, 0], width: 2, opacity: 0.5 }, ...over,
})

// Page 100pt tall, scale 2: screen = (2x, 2(100 - y)).
const vp = {
  scale: 2,
  width: 200,
  height: 200,
  rotation: 0,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
} as unknown as PageViewport

function mount(a: LineAnnotation) {
  const store = new AnnotationStore()
  store.add(a)
  return render(Overlay, { props: { pageNumber: 1, scale: 2, store, viewport: vp } }).container
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9

describe('line kind rendering', () => {
  it('renders the points as one round-capped path with the stroke style', () => {
    const p = mount(line({ points: [[10, 20], [50, 20], [50, 40]] })).querySelector('path')!
    expect(p.getAttribute('d')).toBe('M20 160 L100 160 L100 120')
    expect(p.getAttribute('fill')).toBe('none')
    expect(p.getAttribute('stroke')).toBe('rgb(255,0,0)')
    expect(p.getAttribute('stroke-width')).toBe('4')
    expect(p.getAttribute('stroke-opacity')).toBe('0.5')
    expect(p.getAttribute('stroke-linecap')).toBe('round')
  })

  it('an arrow adds the arrowhead to the same path', () => {
    const d = mount(line({ arrow: true })).querySelector('path')!.getAttribute('d')!
    expect(d.startsWith('M20 160 L100 160 M')).toBe(true)
    expect(d.match(/M/g)).toHaveLength(2)
  })
})

describe('arrowHead', () => {
  it('points back along the last segment of non-zero length, 30° to each side', () => {
    const [l, t, r] = arrowHead([[0, 0], [100, 0], [100, 0]], 2)!
    expect(t).toEqual([100, 0])
    expect(arrowLength(2)).toBe(12)
    expect(close(l[0], 100 - 12 * Math.cos(Math.PI / 6)) && close(l[1], -6)).toBe(true)
    expect(close(r[0], 100 - 12 * Math.cos(Math.PI / 6)) && close(r[1], 6)).toBe(true)
    expect(arrowHead([[1, 1], [1, 1]], 2)).toBeNull()
  })
})

describe('line kind geometry', () => {
  it('registers at import', () => {
    expect(annotationKinds.get('line')).toBe(lineKind)
  })

  it('bounds: the points plus half the width, and the arrowhead', () => {
    expect(lineKind.bounds(line())).toEqual([9, 19, 51, 21])
    const b = lineKind.bounds(line({ arrow: true }))
    expect(close(b[1], 20 - 6 - 1) && close(b[3], 20 + 6 + 1) && b[2] === 51).toBe(true)
  })

  it('hitTest: near any segment or the arrowhead wings', () => {
    const poly = line({ points: [[0, 0], [20, 0], [20, 20]], arrow: true, border: { color: [0, 0, 0], width: 2, opacity: 1 } })
    expect(lineKind.hitTest(poly, [10, 0.9], 0)).toBe(true)
    expect(lineKind.hitTest(poly, [10, 2], 0)).toBe(false)
    expect(lineKind.hitTest(poly, [10, 2], 1)).toBe(true)
    expect(lineKind.hitTest(poly, [20.5, 10], 0)).toBe(true)
    expect(lineKind.hitTest(poly, [10, 10], 1)).toBe(false)
    // Arrowhead at (20, 20) pointing up: a wing reaches (14, 20 - 12 cos 30°).
    expect(lineKind.hitTest(poly, [14, 20 - 12 * Math.cos(Math.PI / 6)], 0)).toBe(true)
  })

  it('translate moves the points; scale maps them from their box (scaleFrame) to another', () => {
    expect(lineKind.translate(line(), 5, -5).points).toEqual([[15, 15], [55, 15]])
    const l = line({ points: [[0, 0], [10, 20]] })
    expect(lineKind.scaleFrame!(l)).toEqual([0, 0, 10, 20])
    expect(lineKind.scale!(l, [0, 0, 10, 20], [10, 10, 30, 30]).points).toEqual([[10, 10], [30, 30]])
    // A horizontal line (no height) only stretches.
    expect(lineKind.scale!(line(), [10, 20, 50, 20], [10, 20, 90, 25]).points).toEqual([[10, 20], [90, 20]])
  })
})
