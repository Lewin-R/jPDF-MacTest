import type { RGB, ShapeAnnotation } from '../../core/session/model'

export type ShapeBorder = NonNullable<ShapeAnnotation['border']>
export type ShapeFill = NonNullable<ShapeAnnotation['fill']>

/** Border and fill: shared by the tool settings and a selected shape. */
export interface ShapeStyle {
  border: ShapeBorder | null
  fill: ShapeFill | null
}

export interface ShapeSettings extends ShapeStyle {
  shape: 'rect' | 'circle'
}

/** Border picked when switching the border on (and the tool's default). */
export const DEFAULT_BORDER: ShapeBorder = { color: [0.898, 0.224, 0.208], width: 2, opacity: 1 }

/** Fill picked when switching the fill on: the marker's yellow, translucent. */
export const DEFAULT_FILL: ShapeFill = { color: [1, 0.922, 0.231], opacity: 0.4 }

const copyColor = (c: RGB): RGB => [c[0], c[1], c[2]]

/** A plain copy (settings are reactive proxies; annotations must not share them). */
export function copyStyle(s: ShapeStyle): ShapeStyle {
  return {
    border: s.border && { color: copyColor(s.border.color), width: s.border.width, opacity: s.border.opacity },
    fill: s.fill && { color: copyColor(s.fill.color), opacity: s.fill.opacity },
  }
}

/**
 * `s` with the border set to `border`. A shape never ends up with neither
 * border nor fill: turning the border off while there is no fill turns the
 * fill on (DEFAULT_FILL).
 */
export function withBorder(s: ShapeStyle, border: ShapeBorder | null): ShapeStyle {
  return { border, fill: border === null && s.fill === null ? DEFAULT_FILL : s.fill }
}

/** `s` with the fill set to `fill`; turning off the fill without a border turns the border on (DEFAULT_BORDER). */
export function withFill(s: ShapeStyle, fill: ShapeFill | null): ShapeStyle {
  return { border: fill === null && s.border === null ? DEFAULT_BORDER : s.border, fill }
}
