import { describe, expect, it } from 'vitest'
import { autoScrollSpeed } from '../../../src/core/viewer/autoScroll'

describe('autoScrollSpeed', () => {
  it('is 0 away from the edges', () => {
    expect(autoScrollSpeed(500, 0, 600)).toBe(0)
    expect(autoScrollSpeed(48, 0, 600)).toBe(0)
  })

  it('grows towards the bottom edge, capped beyond it', () => {
    expect(autoScrollSpeed(576, 0, 600)).toBe(12)
    expect(autoScrollSpeed(600, 0, 600)).toBe(24)
    expect(autoScrollSpeed(900, 0, 600)).toBe(24)
  })

  it('scrolls up near the top edge', () => {
    expect(autoScrollSpeed(124, 100, 700)).toBe(-12)
    expect(autoScrollSpeed(100, 100, 700)).toBe(-24)
    expect(autoScrollSpeed(-50, 100, 700)).toBe(-24)
  })
})
