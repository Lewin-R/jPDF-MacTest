import { describe, expect, it } from 'vitest'
import { distToSegment, hitAnnotations, pointInQuad } from '../../../src/core/geometry/hit'
import { annotationKinds } from '../../../src/core/registry/annotationKinds'
import type { Annotation, Quad } from '../../../src/core/session/model'

annotationKinds.register({
  kind: 'ink',
  hitTest: (a: Annotation, p: [number, number]) => Math.abs(p[0] - (a as never as { x: number }).x) < 1,
} as never)
annotationKinds.register({ kind: 'freetext', hitTest: () => true } as never)

const mk = (id: string, kind: string, x = 0) => ({ id, kind, page: 0, x }) as unknown as Annotation

describe('distToSegment', () => {
  it('measures perpendicular distance', () => {
    expect(distToSegment([5, 5], [0, 0], [10, 0])).toBe(5)
  })
  it('uses the endpoint beyond the segment', () => {
    expect(distToSegment([13, 4], [0, 0], [10, 0])).toBe(5)
    expect(distToSegment([-3, 4], [0, 0], [10, 0])).toBe(5)
  })
  it('handles a degenerate segment', () => {
    expect(distToSegment([3, 4], [0, 0], [0, 0])).toBe(5)
  })
})

describe('pointInQuad', () => {
  const q: Quad = [0, 10, 20, 10, 0, 0, 20, 0] // TL, TR, BL, BR
  it('inside / outside', () => {
    expect(pointInQuad([10, 5], q)).toBe(true)
    expect(pointInQuad([25, 5], q)).toBe(false)
    expect(pointInQuad([10, 11], q)).toBe(false)
  })
  it('counts the boundary as inside', () => {
    expect(pointInQuad([20, 5], q)).toBe(true)
  })
})

describe('hitAnnotations', () => {
  it('returns topmost first and honours the predicate', () => {
    const list = [mk('a', 'ink'), mk('b', 'freetext'), mk('c', 'ink')]
    expect(hitAnnotations(list, [0, 0], 1).map((a) => a.id)).toEqual(['c', 'b', 'a'])
    expect(hitAnnotations(list, [0, 0], 1, (a) => a.kind === 'ink').map((a) => a.id)).toEqual(['c', 'a'])
  })
})
