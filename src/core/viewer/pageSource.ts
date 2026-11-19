import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import { normalizeRotation } from '../geometry/textLayout'
import type { PageEntry } from '../session/pages'

/**
 * How a page of the page list is displayed: page components take the entry
 * of their page; without one they show file page `pageNumber` unrotated (the
 * file's own order).
 */
export function entryOf(pageNumber: number, entry: PageEntry | undefined): PageEntry {
  return entry ?? { kind: 'source', source: pageNumber - 1, rotate: 0 }
}

/**
 * Viewport of a source entry: the file page's own /Rotate plus the entry's
 * extra rotation (the default viewport when there is none).
 */
export function sourceViewport(page: PDFPageProxy, entry: PageEntry, scale: number): PageViewport {
  const extra = normalizeRotation(entry.rotate)
  if (extra === 0) return page.getViewport({ scale })
  return page.getViewport({ scale, rotation: normalizeRotation(page.rotate + extra) })
}

/**
 * Viewport of an empty page (no pdf.js page): the same transform pdf.js'
 * PageViewport computes for a view box [0, 0, width, height] (pdf.js does
 * not export the class).
 */
export function blankViewport(width: number, height: number, scale: number, rotation: number): PageViewport {
  const r = normalizeRotation(rotation)
  // [a, b, c, d] of the y-flipping rotation matrix, as in PageViewport.
  const [a, b, c, d] = r === 90 ? [0, 1, 1, 0] : r === 180 ? [-1, 0, 0, 1] : r === 270 ? [0, -1, -1, 0] : [1, 0, 0, -1]
  const cx = width / 2
  const cy = height / 2
  const quarter = a === 0
  const offX = (quarter ? cy : cx) * scale
  const offY = (quarter ? cx : cy) * scale
  const transform = [
    a * scale, b * scale, c * scale, d * scale,
    offX - a * scale * cx - c * scale * cy,
    offY - b * scale * cx - d * scale * cy,
  ]
  const [ta, tb, tc, td, te, tf] = transform
  const det = ta * td - tb * tc
  const vp = {
    viewBox: [0, 0, width, height],
    userUnit: 1,
    scale,
    rotation: r,
    offsetX: 0,
    offsetY: 0,
    transform,
    width: (quarter ? height : width) * scale,
    height: (quarter ? width : height) * scale,
    rawDims: { pageWidth: width, pageHeight: height, pageX: 0, pageY: 0 },
    clone: (p: { scale?: number; rotation?: number } = {}) =>
      blankViewport(width, height, p.scale ?? scale, p.rotation ?? r),
    convertToViewportPoint: (x: number, y: number) => [ta * x + tc * y + te, tb * x + td * y + tf],
    convertToPdfPoint: (x: number, y: number) => [
      (td * (x - te) - tc * (y - tf)) / det,
      (ta * (y - tf) - tb * (x - te)) / det,
    ],
  }
  return vp as unknown as PageViewport
}

/**
 * Render-cache key of a page: per list position (a canvas is shown by one
 * page only) and render scale, plus what is drawn there, so a rotated,
 * moved or duplicated page never reuses another page's bitmap. `@` separates
 * the page part (see RenderCache) from the rest.
 */
export function renderKey(cacheId: string, pageNumber: number, rs: number, entry: PageEntry, annotations: boolean): string {
  const what =
    entry.kind === 'source'
      ? `s${entry.source}r${normalizeRotation(entry.rotate)}`
      : `b${entry.width}x${entry.height}r${normalizeRotation(entry.rotate)}`
  return `${cacheId}:${pageNumber}@${rs}#${what}${annotations ? '' : 'n'}`
}
