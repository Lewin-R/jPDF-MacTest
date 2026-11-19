import { describe, expect, it } from 'vitest'
import '../../../src/annotations'
import type { HighlightAnnotation, InkAnnotation, Point, ShapeAnnotation } from '../../../src/core/session/model'
import { groupBounds, lassoed, pointInPolygon, samplePoints } from '../../../src/tools/lasso/geometry'

const base = { page: 0, sourceRef: null, modifiedAt: 't', author: 'A' }
const square: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]]

function ink(id: string, strokes: Point[][]): InkAnnotation {
  return { ...base, id, kind: 'ink', strokes, color: [1, 0, 0], width: 2, opacity: 1, blend: 'normal', role: 'pen' }
}

function shape(id: string, rect: ShapeAnnotation['rect']): ShapeAnnotation {
  return { ...base, id, kind: 'shape', shape: 'rect', rect, border: { color: [0, 0, 1], width: 2, opacity: 1 }, fill: null }
}

describe('pointInPolygon', () => {
  it('tells inside from outside, also for concave outlines', () => {
    expect(pointInPolygon([50, 50], square)).toBe(true)
    expect(pointInPolygon([150, 50], square)).toBe(false)
    // A "U": the notch between the arms is outside.
    const u: Point[] = [[0, 0], [90, 0], [90, 90], [60, 90], [60, 30], [30, 30], [30, 90], [0, 90]]
    expect(pointInPolygon([45, 60], u)).toBe(false)
    expect(pointInPolygon([15, 60], u)).toBe(true)
  })
})

describe('samplePoints', () => {
  it('uses stroke points, quad corners, or box corners and centre', () => {
    expect(samplePoints(ink('i', [[[1, 2], [3, 4]], [[5, 6]]]))).toEqual([[1, 2], [3, 4], [5, 6]])
    const hl: HighlightAnnotation = { ...base, id: 'h', kind: 'highlight', quads: [[0, 10, 20, 10, 0, 0, 20, 0]], color: [1, 1, 0], opacity: 0.4 }
    expect(samplePoints(hl)).toEqual([[0, 10], [20, 10], [0, 0], [20, 0]])
    const pts = samplePoints(shape('s', [10, 10, 30, 50]))
    expect(pts).toHaveLength(5)
    expect(pts).toContainEqual([20, 30])
  })
})

describe('lassoed', () => {
  it('catches annotations with more than half of their points inside, in list order', () => {
    const inside = shape('in', [10, 10, 40, 40])
    const outside = shape('out', [200, 200, 240, 240])
    // 2 of 3 points inside: caught; 1 of 3: not.
    const mostly = ink('mostly', [[[20, 20], [50, 50], [150, 150]]])
    const barely = ink('barely', [[[20, 20], [150, 150], [160, 160]]])
    expect(lassoed([outside, mostly, inside, barely], square).map((a) => a.id)).toEqual(['mostly', 'in'])
  })

  it('does not catch a large curve whose empty middle the lasso surrounds', () => {
    const arc = ink('arc', [[[-50, -50], [150, -50], [150, 150]]])
    expect(lassoed([arc], square)).toEqual([])
  })

  it('catches nothing with fewer than 3 lasso points', () => {
    expect(lassoed([shape('s', [10, 10, 20, 20])], [[0, 0], [100, 100]])).toEqual([])
  })
})

describe('groupBounds', () => {
  it('is the union of the bounds, null for none', () => {
    expect(groupBounds([])).toBeNull()
    const r = groupBounds([shape('a', [10, 10, 20, 20]), shape('b', [50, 0, 60, 30])])!
    // Shape bounds include half the 2pt border.
    expect(r).toEqual([9, -1, 61, 31])
  })
})
