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

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Ramer–Douglas–Peucker; keeps both endpoints. Iterative, so long strokes cannot overflow the stack. */
export function simplify(points: Point[], tolerance: number): Point[] {
  const n = points.length
  if (n < 3) return points.slice()
  const keep = new Array<boolean>(n).fill(false)
  keep[0] = keep[n - 1] = true
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()!
    let max = -1
    let idx = -1
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegment(points[i], points[lo], points[hi])
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (idx >= 0 && max > tolerance) {
      keep[idx] = true
      stack.push([lo, idx], [idx, hi])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Drops points closer than `minDist` to the previously kept one; always keeps the first and last point. */
export function dedupe(points: Point[], minDist: number): Point[] {
  if (points.length < 2) return points.slice()
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1]
    if (Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= minDist) out.push(points[i])
  }
  const end = points[points.length - 1]
  const last = out[out.length - 1]
  if (end[0] !== last[0] || end[1] !== last[1] || out.length === 1) out.push(end)
  return out
}
