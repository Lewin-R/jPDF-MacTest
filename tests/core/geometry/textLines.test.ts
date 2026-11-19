import { describe, expect, it } from 'vitest'
import { textLineBand } from '../../../src/core/geometry/textLines'
import type { Quad } from '../../../src/core/session/model'

const close = (got: Quad, want: number[]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 9))

describe('textLineBand', () => {
  // 14pt quad from y=0 to y=14: 1pt line.
  const q: Quad = [0, 14, 20, 14, 0, 0, 20, 0]

  it('underline: a 1/14-height band centred 0.12 of the height above the bottom', () => {
    close(textLineBand(q, 'underline'), [0, 2.18, 20, 2.18, 0, 1.18, 20, 1.18])
  })

  it('strike-out: centred 0.42 of the height up', () => {
    close(textLineBand(q, 'strikeout'), [0, 6.38, 20, 6.38, 0, 5.38, 20, 5.38])
  })

  it('small text keeps a 0.5pt line', () => {
    const b = textLineBand([0, 2, 5, 2, 0, 0, 5, 0], 'underline')
    expect(b[1] - b[5]).toBeCloseTo(0.5, 9)
  })

  it('runs parallel to the text on rotated quads', () => {
    // Text running up the page: TL (0,0) TR (0,20) BL (14,0) BR (14,20).
    close(textLineBand([0, 0, 0, 20, 14, 0, 14, 20], 'underline'), [11.82, 0, 11.82, 20, 12.82, 0, 12.82, 20])
  })

  it('a quad without height is returned as is', () => {
    const flat: Quad = [0, 0, 10, 0, 0, 0, 10, 0]
    expect(textLineBand(flat, 'strikeout')).toBe(flat)
  })
})
