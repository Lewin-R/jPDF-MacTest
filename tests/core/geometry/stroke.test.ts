import { describe, expect, it } from 'vitest'
import { dedupe, simplify, smoothPath } from '../../../src/core/geometry/stroke'
import type { Point } from '../../../src/core/session/model'

const id = (p: Point): Point => p

describe('smoothPath', () => {
  it('uses midpoint quadratics for 3+ points', () => {
    expect(smoothPath([[0, 0], [10, 0], [20, 10]], id)).toBe('M0 0 Q10 0 15 5 L20 10')
  })
  it('two points produce M/L', () => {
    expect(smoothPath([[0, 0], [10, 5]], id)).toBe('M0 0 L10 5')
  })
  it('single point produces a zero-length segment', () => {
    expect(smoothPath([[5, 5]], id)).toBe('M5 5 L5 5')
  })
  it('applies the screen transform', () => {
    expect(smoothPath([[0, 0], [10, 5]], ([x, y]) => [x * 2, 100 - y])).toBe('M0 100 L20 95')
  })
})

describe('simplify', () => {
  it('removes collinear middle point', () => {
    expect(simplify([[0, 0], [5, 0], [10, 0]], 0.1)).toEqual([[0, 0], [10, 0]])
  })
  it('keeps corner', () => {
    const corner: Point[] = [[0, 0], [10, 0], [10, 10]]
    expect(simplify(corner, 0.1)).toEqual(corner)
  })
})

describe('dedupe', () => {
  it('drops points closer than minDist', () => {
    expect(dedupe([[0, 0], [0.1, 0], [1, 0], [1.2, 0], [2, 0]], 0.5)).toEqual([[0, 0], [1, 0], [2, 0]])
  })
  it('keeps the final point even when close to the previous', () => {
    expect(dedupe([[0, 0], [1, 0], [1.1, 0]], 0.5)).toEqual([[0, 0], [1, 0], [1.1, 0]])
  })
})
