import { describe, expect, it } from 'vitest'
import { handleAt, resizeRect } from '../../../src/tools/select/handles'

// Screen-space rects: [left, top, right, bottom], y down.
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
