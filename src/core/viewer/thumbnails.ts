import { AnnotationMode } from 'pdfjs-dist'
import { normalizeRotation } from '../geometry/textLayout'
import type { PdfDoc } from './pdfEngine'
import { releaseCanvas, RenderCache } from './renderCache'

/**
 * Page thumbnails (document builder). A file page is rendered once per size
 * step, upright as the file shows it (its own /Rotate applied), into a cached
 * canvas; each tile copies it into its own canvas, turned by the page list's
 * extra rotation (drawThumbnail). So turning, duplicating or moving pages
 * never renders again, and copies of a page share one render.
 */

/**
 * Rendered thumbnails, bounded by pixel memory (tiles hold copies, so none is
 * pinned). Keys: `${sessionId}:d${docId}t${source}${'n' without file annotations}@${px}`;
 * a session evicts its own with evictPrefix(`${id}:`). 48 MB holds about 200
 * thumbnails at 240 px.
 */
export const thumbnailCache = new RenderCache<HTMLCanvasElement>(
  48 * 1024 * 1024,
  (c) => c.width * c.height * 4,
  releaseCanvas,
)

/** Thumbnails are rendered at multiples of this many pixels (longest side). */
const STEP = 64

/** The render size (longest side, device pixels) for a tile box of `box` CSS pixels. */
export function thumbnailPx(box: number, dpr: number): number {
  return Math.max(STEP, Math.ceil((box * dpr) / STEP) * STEP)
}

/** A number per pdf.js document: a render of a replaced document never matches the new one's keys. */
const docIds = new WeakMap<PdfDoc, number>()
let nextDocId = 0
function docId(doc: PdfDoc): number {
  let id = docIds.get(doc)
  if (id === undefined) docIds.set(doc, (id = ++nextDocId))
  return id
}

export function thumbnailKey(doc: PdfDoc, cacheId: string, source: number, annotations: boolean, px: number): string {
  return `${cacheId}:d${docId(doc)}t${source}${annotations ? '' : 'n'}@${px}`
}

interface Job {
  key: string
  promise: Promise<HTMLCanvasElement>
  run: () => Promise<HTMLCanvasElement>
  resolve: (c: HTMLCanvasElement) => void
  reject: (e: unknown) => void
  waiters: number
}

/** Renders at a time: the pdf.js worker is one thread, more only queue there. */
const CONCURRENCY = 2
const queue: Job[] = []
const running = new Map<string, Promise<HTMLCanvasElement>>()
let active = 0

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!
    active++
    const p = job.run()
    running.set(job.key, p)
    p.then(job.resolve, job.reject).finally(() => {
      running.delete(job.key)
      active--
      pump()
    })
  }
}

export interface ThumbnailRequest {
  promise: Promise<HTMLCanvasElement>
  /** Gives up the request: a render not started yet is dropped once nobody waits for it. */
  cancel(): void
}

/**
 * The thumbnail of file page `source` (0-based) of `doc`, at most `px`
 * device pixels on its longest side: from the cache, else rendered (queued,
 * first come first served; requests for the same thumbnail share a render).
 */
export function requestThumbnail(
  doc: PdfDoc, cacheId: string, source: number, annotations: boolean, px: number,
): ThumbnailRequest {
  const key = thumbnailKey(doc, cacheId, source, annotations, px)
  const cached = thumbnailCache.get(key)
  if (cached) return { promise: Promise.resolve(cached), cancel: () => {} }
  const inFlight = running.get(key)
  if (inFlight) return { promise: inFlight, cancel: () => {} }
  let job = queue.find((j) => j.key === key)
  if (!job) {
    let resolve!: (c: HTMLCanvasElement) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<HTMLCanvasElement>((res, rej) => ((resolve = res), (reject = rej)))
    job = {
      key,
      promise,
      waiters: 0,
      resolve,
      reject,
      run: () => render(doc, source, annotations, px).then((c) => (thumbnailCache.set(key, c), c)),
    }
    queue.push(job)
    queueMicrotask(pump)
  }
  const mine = job
  mine.waiters++
  let cancelled = false
  return {
    promise: mine.promise,
    cancel: () => {
      if (cancelled) return
      cancelled = true
      mine.waiters--
      const at = queue.indexOf(mine)
      if (mine.waiters === 0 && at >= 0) {
        queue.splice(at, 1)
        mine.reject(new DOMException('Thumbnail no longer needed', 'AbortError'))
      }
    },
  }
}

async function render(doc: PdfDoc, source: number, annotations: boolean, px: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(source + 1)
  const unit = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: px / Math.max(unit.width, unit.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  try {
    // ENABLE_STORAGE: annotations the session manages are suppressed (the tile draws them).
    const annotationMode = annotations ? AnnotationMode.ENABLE_STORAGE : AnnotationMode.DISABLE
    await page.render({ canvas, viewport, annotationMode }).promise
  } catch (e) {
    releaseCanvas(canvas)
    throw e
  }
  // Free the page's operator list: thumbnails are small, the page data is not.
  if (!doc.destroyed) page.cleanup()
  return canvas
}

/**
 * Draws the upright thumbnail `src` into `dest` turned by `rotate` degrees
 * (clockwise), filling `dest` (sized by the caller to the turned page).
 */
export function drawThumbnail(dest: HTMLCanvasElement, src: HTMLCanvasElement, rotate: number): void {
  const ctx = dest.getContext('2d')
  if (!ctx) return
  const r = normalizeRotation(rotate)
  const quarter = r % 180 !== 0
  const w = quarter ? dest.height : dest.width
  const h = quarter ? dest.width : dest.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, dest.width, dest.height)
  ctx.translate(dest.width / 2, dest.height / 2)
  ctx.rotate((r * Math.PI) / 180)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, -w / 2, -h / 2, w, h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
