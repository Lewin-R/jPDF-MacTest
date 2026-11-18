import type { Point } from '../session/model'

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000)
const pt = (p: Point): string => `${fmt(p[0])} ${fmt(p[1])}`

/**
 * SVG path data for a smoothed stroke, midpoint-quadratic scheme (shared with
 * the Rust exporter): `M p0`, then for i in 1..n-2 `Q p_i mid(p_i, p_i+1)`,
 * then `L p_last`. One point gives a zero-length segment (drawn as a dot with
 * round caps); two points a straight line.
 */
export function smoothPath(points: Point[], toScreen: (p: Point) => Point): string {
  if (points.length === 0) return ''
  const s = points.map(toScreen)
  const n = s.length
  if (n === 1) return `M${pt(s[0])} L${pt(s[0])}`
  let d = `M${pt(s[0])}`
  for (let i = 1; i < n - 1; i++) {
    const mid: Point = [(s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2]
    d += ` Q${pt(s[i])} ${pt(mid)}`
  }
  return `${d} L${pt(s[n - 1])}`
}
