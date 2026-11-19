/** Distance from the viewer's top/bottom edge (px) where dragging scrolls. */
const EDGE_BAND_PX = 48
/** Scroll speed (px per frame) at the edge and beyond. */
const MAX_SPEED_PX = 24

/**
 * Auto-scroll speed for a pointer at client y `pointerY` in a viewer spanning
 * `top`..`bottom`: 0 outside the edge bands, growing linearly to the maximum
 * at the edge (negative = up).
 */
export function autoScrollSpeed(pointerY: number, top: number, bottom: number): number {
  const ramp = (into: number) => (Math.min(Math.max(into, 0), EDGE_BAND_PX) / EDGE_BAND_PX) * MAX_SPEED_PX
  const down = ramp(pointerY - (bottom - EDGE_BAND_PX))
  if (down > 0) return down
  const up = ramp(top + EDGE_BAND_PX - pointerY)
  return up > 0 ? -up : 0
}
