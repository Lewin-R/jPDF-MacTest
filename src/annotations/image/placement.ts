import type { Point, Rect } from '../../core/session/model'

/** Points per pixel at 96 dpi. */
export const PT_PER_PX = 0.75
/** A pasted image is at most this fraction of the page's width and height. */
export const MAX_PAGE_FRACTION = 0.8

/** The parts of a pdf.js PageViewport placement needs. */
export interface PlacementViewport {
  width: number
  height: number
  scale: number
  convertToViewportPoint(x: number, y: number): number[]
  convertToPdfPoint(x: number, y: number): number[]
}

interface Size {
  width: number
  height: number
}

/**
 * Size (pt) of an image of `px` pixels: its natural size at 96 dpi, scaled
 * down (never up) to fit within `max`, keeping the aspect ratio.
 */
export function fitSize(px: Size, max: Size): Size {
  const width = px.width * PT_PER_PX
  const height = px.height * PT_PER_PX
  const k = Math.min(1, max.width / width, max.height / height)
  return { width: width * k, height: height * k }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * PDF rect (x1 < x2, y1 < y2) of an image of `px` pixels pasted at `at` (PDF
 * space) on the page of `vp`: its top-left corner on screen at `at`, sized by
 * `fitSize` to at most 80 % of the page as shown on screen (width and height
 * swapped on a page turned by 90 or 270 degrees), then moved inside the page.
 * The image is drawn upright on screen, so the rect is laid out on screen.
 */
export function placeImage(px: Size, at: Point, vp: PlacementViewport): Rect {
  const s = vp.scale
  const pageW = vp.width / s
  const pageH = vp.height / s
  const size = fitSize(px, { width: pageW * MAX_PAGE_FRACTION, height: pageH * MAX_PAGE_FRACTION })
  const [sx, sy] = vp.convertToViewportPoint(at[0], at[1])
  const w = size.width * s
  const h = size.height * s
  const left = clamp(sx, 0, vp.width - w)
  const top = clamp(sy, 0, vp.height - h)
  const [ax, ay] = vp.convertToPdfPoint(left, top)
  const [bx, by] = vp.convertToPdfPoint(left + w, top + h)
  // `+ 0` turns -0 (from the page-edge conversion) into 0.
  return [Math.min(ax, bx) + 0, Math.min(ay, by) + 0, Math.max(ax, bx) + 0, Math.max(ay, by) + 0]
}
