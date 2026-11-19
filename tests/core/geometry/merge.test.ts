import { describe, expect, it } from 'vitest'
import {
  findMergeableHighlights,
  findMergeableMarkerStrokes,
  mergeHighlightQuads,
} from '../../../src/core/geometry/merge'
import type { Annotation, HighlightAnnotation, InkAnnotation, Point, Quad } from '../../../src/core/session/model'

/** Upright quad (PDF y up) from x1..x2 and y1 (bottom)..y2 (top), QuadPoints order TL, TR, BL, BR. */
const q = (x1: number, x2: number, y1: number, y2: number): Quad => [x1, y2, x2, y2, x1, y1, x2, y1]

const hl = (id: string, quads: Quad[], over: Partial<HighlightAnnotation> = {}): HighlightAnnotation => ({
  id, page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'highlight',
  quads, color: [1, 0.922, 0.231], opacity: 0.4, ...over,
})

const ink = (id: string, strokes: Point[][], over: Partial<InkAnnotation> = {}): InkAnnotation => ({
  id, page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'ink',
  strokes, color: [1, 0.922, 0.231], width: 10, opacity: 0.4, blend: 'multiply', role: 'marker', ...over,
})

describe('mergeHighlightQuads', () => {
  it('merges overlapping and touching quads on one line into one quad', () => {
    expect(mergeHighlightQuads([q(10, 50, 100, 110), q(40, 90, 100, 110)])).toEqual([q(10, 90, 100, 110)])
    // 0.5 pt gap: touching.
    expect(mergeHighlightQuads([q(10, 50, 100, 110), q(50.5, 90, 100, 110)])).toEqual([q(10, 90, 100, 110)])
  })

  it('keeps separate fragments and other lines apart', () => {
    const apart = [q(10, 50, 100, 110), q(55, 90, 100, 110)]
    expect(mergeHighlightQuads(apart)).toEqual([q(10, 50, 100, 110), q(55, 90, 100, 110)])
    const lines = [q(10, 50, 100, 110), q(10, 50, 88, 99)]
    expect(mergeHighlightQuads(lines)).toEqual(lines)
  })

  it('merges in a chain once a union reaches another fragment', () => {
    expect(mergeHighlightQuads([q(60, 80, 100, 110), q(10, 30, 100, 110), q(25, 65, 100, 110)])).toEqual([
      q(10, 80, 100, 110),
    ])
  })

  it('merges quads of a rotated page (vertical lines) keeping their orientation', () => {
    // Rotate 90: text runs along +y, "down" on screen is +x. TL=(x1,y1) TR=(x1,y2) BL=(x2,y1) BR=(x2,y2).
    const v = (x1: number, x2: number, y1: number, y2: number): Quad => [x1, y1, x1, y2, x2, y1, x2, y2]
    expect(mergeHighlightQuads([v(100, 110, 10, 50), v(100, 110, 45, 80)])).toEqual([v(100, 110, 10, 80)])
  })

  it('leaves quads that are not axis-aligned as they are', () => {
    const skew: Quad = [0, 10, 10, 12, 0, 0, 10, 2]
    expect(mergeHighlightQuads([skew, q(0, 10, 0, 10)])).toEqual([q(0, 10, 0, 10), skew])
  })
})

describe('findMergeableHighlights', () => {
  const fresh = hl('new', [q(40, 90, 100, 110)])

  it('finds same-colour, same-opacity highlights whose quads overlap or touch, in z-order', () => {
    const a = hl('a', [q(10, 45, 100, 110)])
    const b = hl('b', [q(90.5, 120, 100, 110)])
    const far = hl('far', [q(200, 250, 100, 110)])
    expect(findMergeableHighlights([a, far, b], fresh).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('ignores other colours, opacities, pages and kinds', () => {
    const list: Annotation[] = [
      hl('colour', [q(10, 45, 100, 110)], { color: [0, 1, 0] }),
      hl('opacity', [q(10, 45, 100, 110)], { opacity: 0.6 }),
      hl('page', [q(10, 45, 100, 110)], { page: 1 }),
      ink('ink', [[[50, 105], [60, 105]]]),
    ]
    expect(findMergeableHighlights(list, fresh)).toEqual([])
  })

  it('compares colours at 1/255 precision', () => {
    const a = hl('a', [q(10, 45, 100, 110)], { color: [1, 0.9221, 0.2309] })
    expect(findMergeableHighlights([a], fresh).map((x) => x.id)).toEqual(['a'])
  })
})

describe('findMergeableMarkerStrokes', () => {
  const fresh = ink('new', [[[0, 0], [100, 0]]])

  it('finds marker strokes whose painted bands overlap or touch (distance <= width)', () => {
    const near = ink('near', [[[0, 10], [100, 10]]]) // 10 pt apart = width
    const cross = ink('cross', [[[50, -50], [50, 50]]])
    const far = ink('far', [[[0, 10.5], [100, 10.5]]])
    expect(findMergeableMarkerStrokes([near, far, cross], fresh).map((x) => x.id)).toEqual(['near', 'cross'])
  })

  it('handles single-point strokes', () => {
    const dot = ink('dot', [[[105, 5]]])
    expect(findMergeableMarkerStrokes([dot], fresh).map((x) => x.id)).toEqual(['dot'])
  })

  it('never merges pen strokes, other styles or highlights', () => {
    const over = [[[0, 0], [100, 0]]] as Point[][]
    const list: Annotation[] = [
      ink('pen', over, { role: 'pen', blend: 'normal' }),
      ink('colour', over, { color: [0, 0, 1] }),
      ink('opacity', over, { opacity: 0.5 }),
      ink('width', over, { width: 12 }),
      ink('page', over, { page: 2 }),
      hl('text', [q(0, 100, -5, 5)]),
    ]
    expect(findMergeableMarkerStrokes(list, fresh)).toEqual([])
    expect(findMergeableMarkerStrokes([ink('m', over)], { ...fresh, role: 'pen' })).toEqual([])
  })
})
