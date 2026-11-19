import type { PageViewport } from 'pdfjs-dist'
import type { Rect, RGB } from '../../core/session/model'

/** Screen box (viewport units) of a PDF rect: axis-aligned on screen for any page rotation. */
export function screenBox(rect: Rect, vp: PageViewport): { left: number; top: number; width: number; height: number } {
  const [ax, ay] = vp.convertToViewportPoint(rect[0], rect[1])
  const [bx, by] = vp.convertToViewportPoint(rect[2], rect[3])
  return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }
}

export function cssColor(c: RGB): string {
  return `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`
}

/** Font stack for boxes on screen: Arial has Helvetica's metrics (the saved font). */
export const FREETEXT_FONT = 'Arial, Helvetica, sans-serif'
