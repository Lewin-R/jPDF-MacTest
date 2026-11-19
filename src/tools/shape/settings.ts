import type { RGB, ShapeAnnotation } from '../../core/session/model'

export type ShapeBorder = NonNullable<ShapeAnnotation['border']>
export type ShapeFill = NonNullable<ShapeAnnotation['fill']>

/** Border and fill: shared by the tool settings and a selected shape. */
export interface ShapeStyle {
  border: ShapeBorder | null
  fill: ShapeFill | null
}

/** The last border and fill a style had before they were turned off: turning them back on restores them. */
export interface StyleMemory {
  lastBorder?: ShapeBorder
  lastFill?: ShapeFill
}

/** Shapes drawn as a LineAnnotation (stroke only) rather than a ShapeAnnotation. */
export type LineShape = 'line' | 'polyline' | 'arrow'

export interface ShapeSettings extends ShapeStyle, StyleMemory {
  shape: ShapeAnnotation['shape'] | LineShape
}

export const isLineShape = (s: ShapeSettings['shape']): s is LineShape =>
  s === 'line' || s === 'polyline' || s === 'arrow'

/** The stroke lines are drawn with: the border, else the remembered one (lines always have one). */
export const lineBorder = (s: ShapeSettings): ShapeBorder => s.border ?? s.lastBorder ?? DEFAULT_BORDER

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
 * fill on (the remembered fill, else DEFAULT_FILL).
 */
export function withBorder(s: ShapeStyle, border: ShapeBorder | null, memory: StyleMemory = {}): ShapeStyle {
  return { border, fill: border === null && s.fill === null ? (memory.lastFill ?? DEFAULT_FILL) : s.fill }
}

/** `s` with the fill set to `fill`; turning off the fill without a border turns the border on (remembered, else DEFAULT_BORDER). */
export function withFill(s: ShapeStyle, fill: ShapeFill | null, memory: StyleMemory = {}): ShapeStyle {
  return { border: fill === null && s.border === null ? (memory.lastBorder ?? DEFAULT_BORDER) : s.border, fill }
}

/**
 * Turns the border on (its remembered value, else DEFAULT_BORDER) or off
 * (remembering the current one), keeping at least one of border and fill.
 */
export function toggleBorder(s: ShapeStyle, on: boolean, memory: StyleMemory): { style: ShapeStyle; memory: StyleMemory } {
  if (on) return { style: withBorder(s, s.border ?? memory.lastBorder ?? DEFAULT_BORDER, memory), memory }
  const next = s.border ? { ...memory, lastBorder: s.border } : memory
  return { style: withBorder(s, null, next), memory: next }
}

/** Like toggleBorder, for the fill. */
export function toggleFill(s: ShapeStyle, on: boolean, memory: StyleMemory): { style: ShapeStyle; memory: StyleMemory } {
  if (on) return { style: withFill(s, s.fill ?? memory.lastFill ?? DEFAULT_FILL, memory), memory }
  const next = s.fill ? { ...memory, lastFill: s.fill } : memory
  return { style: withFill(s, null, next), memory: next }
}

/** Style memory of selected shapes by annotation id, for the session (the selection flyout unmounts when closed). */
export const selectionMemory = new Map<string, StyleMemory>()
