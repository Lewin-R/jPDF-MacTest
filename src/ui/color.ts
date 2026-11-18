import type { RGB } from '../core/session/model'

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

function channel(v: number): string {
  const n = Math.round(Math.min(1, Math.max(0, v)) * 255)
  return n.toString(16).padStart(2, '0')
}

/** RGB (0..1) → `#rrggbb` (lower case). */
export function rgbToHex([r, g, b]: RGB): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** `#rrggbb` → RGB (0..1, rounded to 3 decimals), or null if malformed. */
export function hexToRgb(hex: string): RGB | null {
  const m = HEX.exec(hex.trim())
  if (!m) return null
  const c = (s: string) => Math.round((parseInt(s, 16) / 255) * 1000) / 1000
  return [c(m[1]), c(m[2]), c(m[3])]
}
