import { describe, expect, it } from 'vitest'
import {
  MAX_CANVAS_PIXELS, parsePageInput, parseZoomInput, renderScale, scaleBucket, wheelZoomFactor,
} from '../../../src/core/viewer/viewerMath'

describe('renderScale', () => {
  it('is scale times devicePixelRatio when under the pixel cap', () => {
    expect(renderScale(600, 800, 1.5, 2)).toBe(3)
  })
  it('caps the canvas at MAX_CANVAS_PIXELS', () => {
    const rs = renderScale(600, 800, 8, 2)
    expect(rs).toBeLessThan(16)
    const px = Math.floor(600 * rs) * Math.floor(800 * rs)
    expect(px).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
    expect(px).toBeGreaterThan(MAX_CANVAS_PIXELS * 0.99)
  })
})

describe('scaleBucket', () => {
  it('rounds down to 0.001 so the canvas never exceeds the cap', () => {
    expect(scaleBucket(1.23456)).toBe(1.234)
    expect(scaleBucket(2)).toBe(2)
  })
})

describe('wheelZoomFactor', () => {
  it('uses exp(-deltaY * 0.002) for pixel deltas', () => {
    expect(wheelZoomFactor(-100, 0)).toBeCloseTo(Math.exp(0.2))
    expect(wheelZoomFactor(100, 0)).toBeCloseTo(Math.exp(-0.2))
    expect(wheelZoomFactor(0, 0)).toBe(1)
  })
  it('converts line and page deltas to pixels', () => {
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(Math.exp(-3 * 16 * 0.002))
    expect(wheelZoomFactor(1, 2)).toBeCloseTo(Math.exp(-800 * 0.002))
  })
})

describe('parsePageInput', () => {
  it('accepts integers within 1..n', () => {
    expect(parsePageInput('3', 10)).toBe(3)
    expect(parsePageInput(' 10 ', 10)).toBe(10)
  })
  it('rejects out-of-range, fractional and non-numeric input', () => {
    expect(parsePageInput('0', 10)).toBeNull()
    expect(parsePageInput('11', 10)).toBeNull()
    expect(parsePageInput('2.5', 10)).toBeNull()
    expect(parsePageInput('abc', 10)).toBeNull()
    expect(parsePageInput('', 10)).toBeNull()
  })
})

describe('parseZoomInput', () => {
  it('parses percentages to scale', () => {
    expect(parseZoomInput('150')).toBe(1.5)
    expect(parseZoomInput('75%')).toBe(0.75)
    expect(parseZoomInput(' 200 % ')).toBe(2)
    expect(parseZoomInput('12,5')).toBe(0.125)
  })
  it('clamps to the zoom range', () => {
    expect(parseZoomInput('5')).toBe(0.1)
    expect(parseZoomInput('5000')).toBe(8)
  })
  it('rejects invalid input', () => {
    expect(parseZoomInput('')).toBeNull()
    expect(parseZoomInput('abc')).toBeNull()
    expect(parseZoomInput('0')).toBeNull()
    expect(parseZoomInput('-50')).toBeNull()
  })
})
