/**
 * Mapping of tool settings onto the toolbar's live icon previews (24×24
 * viewBox, drawn at 20 px). Icons show the real style, but squeezed into a
 * range that stays legible at that size.
 */

/** Stroke width in icon units for a stroke `width` pt wide: thin strokes stay visible, thick ones don't swallow the shape. */
export function iconStrokeWidth(width: number, min = 1.25, max = 4): number {
  return Math.min(max, Math.max(min, 1 + width * 0.35))
}

/** Opacity drawn in the icon: the real one, but never so faint that the preview disappears. */
export function iconOpacity(opacity: number, floor = 0.2): number {
  return Math.min(1, Math.max(floor, opacity))
}
