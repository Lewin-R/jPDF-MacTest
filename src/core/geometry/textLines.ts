import type { Quad } from '../session/model'

/**
 * Where underline and strike-out lines sit in a text quad (the text's line
 * box, QuadPoints order TL, TR, BL, BR). Identical to the Rust
 * `text_line_band` (appearance.rs), so the saved appearance matches the screen.
 */

/** Line thickness as a fraction of the quad height. */
export const TEXT_LINE_THICKNESS = 1 / 14
/** Thinnest line (pt), for small text. */
export const TEXT_LINE_MIN_THICKNESS = 0.5
/** Line centre as a fraction of the quad height above its bottom edge: just under the baseline. */
export const UNDERLINE_POSITION = 0.12
/** Line centre for strike-outs: through the middle of lower-case letters. */
export const STRIKEOUT_POSITION = 0.42

export type TextLineKind = 'underline' | 'strikeout'

/**
 * The band `kind`'s line covers inside `q`, as a quad in the same order.
 * Works on any orientation (the band runs parallel to TL→TR); a quad
 * without height yields itself.
 */
export function textLineBand(q: Quad, kind: TextLineKind): Quad {
  const [tlx, tly, trx, try_, blx, bly, brx, bry] = q
  // Left and right edges, bottom to top.
  const lx = tlx - blx
  const ly = tly - bly
  const rx = trx - brx
  const ry = try_ - bry
  const h = Math.hypot(lx, ly)
  if (h === 0) return q
  const thickness = Math.min(h, Math.max(TEXT_LINE_MIN_THICKNESS, h * TEXT_LINE_THICKNESS)) / h
  const centre = kind === 'underline' ? UNDERLINE_POSITION : STRIKEOUT_POSITION
  const lo = Math.max(0, centre - thickness / 2)
  const hi = Math.min(1, lo + thickness)
  return [
    blx + lx * hi,
    bly + ly * hi,
    brx + rx * hi,
    bry + ry * hi,
    blx + lx * lo,
    bly + ly * lo,
    brx + rx * lo,
    bry + ry * lo,
  ]
}
