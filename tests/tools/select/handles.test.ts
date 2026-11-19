import { describe, expect, it } from 'vitest'
import { handleAt, keepAspect, resizeRect } from '../../../src/tools/select/handles'

// Screen-space rects: [left, top, right, bottom], y down.
describe('keepAspect', () => {
  const box: [number, number, number, number] = [0, 0, 40, 20]

  it('scales by the larger factor from the opposite corner, limited to the bounds', () => {
    expect(keepAspect(box, [0, 0, 60, 25], 'se', [0, 0, 400, 400], 4)).toEqual([0, 0, 60, 30])
    expect(keepAspect(box, [0, 0, 400, 25], 'se', [0, 0, 100, 400], 4)).toEqual([0, 0, 100, 50])
    expect(keepAspect(box, [0, 0, 50, 20], 'e', [0, 0, 100, 400], 4)).toEqual([0, 0, 50, 20])
  })

  it('never shrinks the image just because it already reaches past the bounds', () => {
    // Only 10 px of room right of the anchor: growing stops at the current size.
    expect(keepAspect(box, [0, 0, 80, 40], 'se', [0, 0, 10, 400], 4)).toEqual([0, 0, 40, 20])
    // Shrinking still works.
    expect(keepAspect(box, [0, 0, 20, 10], 'se', [0, 0, 10, 400], 4)).toEqual([0, 0, 20, 10])
  })

  it('ignores the bounds when the anchor corner lies outside them (no mirroring)', () => {
    expect(keepAspect(box, [0, 0, 80, 40], 'se', [-100, -100, -10, -10], 4)).toEqual([0, 0, 80, 40])
    expect(keepAspect(box, [-40, 0, 40, 40], 'sw', [50, 0, 400, 400], 4)).toEqual([-40, 0, 40, 40])
  })

  it('keeps at least the minimum size', () => {
    expect(keepAspect(box, [0, 0, 2, 1], 'se', [0, 0, 400, 400], 10)).toEqual([0, 0, 20, 10])
  })
})

describe('select handles', () => {
  it('resizeRect se grows by dx,dy', () => {
    expect(resizeRect([10, 20, 110, 70], 'se', 15, 5, 8)).toEqual([10, 20, 125, 75])
  })

  it('resizeRect w moves x1 and keeps x2', () => {
    expect(resizeRect([10, 20, 110, 70], 'w', -30, 12, 8)).toEqual([-20, 20, 110, 70])
    expect(resizeRect([10, 20, 110, 70], 'n', 40, 10, 8)).toEqual([10, 30, 110, 70])
  })

  it('resizeRect enforces minSize', () => {
    expect(resizeRect([10, 20, 110, 70], 'w', 200, 0, 24)).toEqual([86, 20, 110, 70])
    expect(resizeRect([10, 20, 110, 70], 'se', -500, -500, 8)).toEqual([10, 20, 18, 28])
    expect(resizeRect([10, 20, 110, 70], 'nw', 500, 500, 8)).toEqual([102, 62, 110, 70])
  })

  it('handleAt returns se near bottom-right corner, null in centre', () => {
    const r: [number, number, number, number] = [0, 0, 100, 50]
    expect(handleAt(r, [102, 48], 5)).toBe('se')
    expect(handleAt(r, [50, 1], 5)).toBe('n')
    expect(handleAt(r, [-3, 25], 5)).toBe('w')
    expect(handleAt(r, [50, 25], 5)).toBeNull()
    expect(handleAt(r, [130, 25], 5)).toBeNull()
  })

  it('handleAt only considers the allowed handles', () => {
    expect(handleAt([0, 0, 100, 50], [100, 50], 5, ['e', 'w'])).toBeNull()
    expect(handleAt([0, 0, 100, 50], [100, 25], 5, ['e', 'w'])).toBe('e')
  })
})
