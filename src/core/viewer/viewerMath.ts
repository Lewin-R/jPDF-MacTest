import { clampScale } from './layout'

/** Largest canvas we render (width * height in device pixels). */
export const MAX_CANVAS_PIXELS = 16_777_216

/**
 * Device-pixel scale to render a page of `pageW` x `pageH` points at:
 * `scale * dpr`, reduced so a canvas of floor(pageW * rs) x floor(pageH * rs)
 * stays within MAX_CANVAS_PIXELS (the page is then CSS-scaled up), and
 * quantised with scaleBucket.
 */
export function renderScale(pageW: number, pageH: number, scale: number, dpr: number): number {
  const cap = Math.sqrt(MAX_CANVAS_PIXELS / (pageW * pageH))
  return scaleBucket(Math.min(scale * dpr, cap))
}

/** Quantises a render scale (rounding down to 0.001) for cache keys and rendering. */
export function scaleBucket(rs: number): number {
  return Math.floor(rs * 1000 + 1e-9) / 1000
}

const LINE_PX = 16, PAGE_PX = 800

/** Zoom factor for one Ctrl+wheel / pinch event. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * PAGE_PX : deltaY
  return Math.exp(-px * 0.002)
}

/** 1-based page number from the page input, or null if invalid. */
export function parsePageInput(text: string, numPages: number): number | null {
  const t = text.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= numPages ? n : null
}

/** Scale from a zoom percentage ("150", "150%", "12,5"), clamped; null if invalid. */
export function parseZoomInput(text: string): number | null {
  const t = text.trim().replace(/\s*%$/, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const pct = Number(t)
  return pct > 0 ? clampScale(pct / 100) : null
}
