import type { Point, Rect } from '../session/model'

/** Length (pt) of an arrowhead's wings for stroke width `w` (same formula in the Rust appearance). */
export const arrowLength = (w: number): number => 3 * w + 6

/** Half the angle between the two wings. */
const HALF_ANGLE = Math.PI / 6

/**
 * The open arrowhead at the last point of `points`: [left wing end, tip,
 * right wing end], pointing along the last segment of non-zero length; null
 * when all points coincide.
 */
export function arrowHead(points: readonly Point[], width: number): [Point, Point, Point] | null {
  const tip = points[points.length - 1]
  if (!tip) return null
  for (let i = points.length - 2; i >= 0; i--) {
    const dx = points[i][0] - tip[0]
    const dy = points[i][1] - tip[1]
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    // Unit vector from the tip back along the line, turned by ± the half angle.
    const ux = dx / len
    const uy = dy / len
    const l = arrowLength(width)
    const cos = Math.cos(HALF_ANGLE)
    const sin = Math.sin(HALF_ANGLE)
    const left: Point = [tip[0] + l * (ux * cos - uy * sin), tip[1] + l * (ux * sin + uy * cos)]
    const right: Point = [tip[0] + l * (ux * cos + uy * sin), tip[1] + l * (-ux * sin + uy * cos)]
    return [left, tip, right]
  }
  return null
}

/** Bounding box of `points` (zero rect for none). */
export function pointsBox(points: readonly Point[]): Rect {
  if (points.length === 0) return [0, 0, 0, 0]
  let [x1, y1] = points[0]
  let [x2, y2] = points[0]
  for (const [x, y] of points) {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  return [x1, y1, x2, y2]
}

/**
 * `end` moved so the segment from `start` points in a multiple of 45°,
 * keeping its projection onto that direction (Shift while drawing lines).
 */
export function snap45(start: Point, end: Point): Point {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  if (dx === 0 && dy === 0) return end
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const len = dx * ux + dy * uy
  // Round away float noise so horizontal and vertical lines stay exact.
  const r = (v: number) => Math.round(v * 1e9) / 1e9
  return [r(start[0] + ux * len), r(start[1] + uy * len)]
}
